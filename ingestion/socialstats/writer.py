"""Write the mapped social sections into Supabase, through the app's own
save_social_report function, over PostgREST.

Read-modify-write, the pattern the Nov 3, 2026 sandbox proved against the
repo's real migrations: the sections automation owns (kpis, platforms,
top_posts, posts) come from the mapper; everything a human owns
(editors_note, insights, paid campaigns/ads/demographics/click paths,
followers_start) is read from the stored report and carried through
unchanged. The write replaces machine sections; it never duplicates, so a
second run changes nothing but updated_at and new ingestion_runs rows.

Credentials come from the environment only: SUPABASE_URL and
SUPABASE_SERVICE_ROLE_KEY (see ingestion/.env.example). The service-role
key bypasses RLS, which is why this module is careful in the opposite
direction from most code: it must not write anything the stored report
did not already contain, beyond the machine sections. Two consequences
worth knowing before go-live:

- save_social_report is SECURITY INVOKER and its migration grants
  EXECUTE to `authenticated` only (supabase/migrations/
  20260914181005_save_social_report_atomically.sql). Whether the
  project's service_role holds EXECUTE on it must be confirmed against
  the live project before the first production run; if it does not, a
  one-line grant migration is the fix, and it is a go-live decision for
  Josiah, not something this code can work around.
- If no report row exists yet for the agency/quarter/year, the write
  aborts. Creating a quarter is a human act in the dashboard today;
  silently creating one here with empty human sections would erase the
  distinction between "not started" and "wiped".
- Read-modify-write has an inherent race: an editor who saves in the
  dashboard between this run's read and its write would have their
  newer human sections silently overwritten by the older snapshot the
  payload was built from. write_report therefore re-reads the report's
  updated_at immediately before the RPC and aborts if it moved. That
  narrows the race to the instant between the re-read and the RPC; it
  cannot close it, because save_social_report offers no
  compare-and-swap. Aborting is the safe side: the next run re-reads
  and writes fresh.
"""
import json
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone

REQUEST_TIMEOUT_SECS = 30


class PostgrestError(RuntimeError):
    """A PostgREST call failed. The message carries the HTTP status and a
    body excerpt: this is a backend job, its errors go to logs and the
    ingestion_runs message column (which the schema's own comment reserves
    for exactly that), never to a dashboard user."""


class StaleReportError(RuntimeError):
    """The stored report changed between this run's read and its write
    (an editor saved in the dashboard), so writing would overwrite the
    newer human sections with the older snapshot. The run aborts and
    logs 'failed'; the next run re-reads and writes fresh."""


class PostgrestClient:
    """The smallest honest PostgREST client: GET a table, POST an RPC,
    POST an insert. Every call has a timeout; nothing retries, because the
    one write here (save_social_report) replaces whole sections and a
    blind retry after an ambiguous failure could interleave with a human
    save in the dashboard. A failed run logs 'failed' and the next
    scheduled run is the retry."""

    def __init__(self, base_url, service_key):
        if not base_url or not service_key:
            raise ValueError('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must both be set')
        self.base = base_url.rstrip('/') + '/rest/v1'
        self._key = service_key

    def _call(self, method, path, body=None, prefer=None):
        headers = {
            'apikey': self._key,
            'Authorization': f'Bearer {self._key}',
            'Accept': 'application/json',
        }
        data = None
        if body is not None:
            data = json.dumps(body).encode('utf-8')
            headers['Content-Type'] = 'application/json'
        if prefer:
            headers['Prefer'] = prefer
        req = urllib.request.Request(f'{self.base}{path}', data=data,
                                     headers=headers, method=method)
        try:
            with urllib.request.urlopen(req, timeout=REQUEST_TIMEOUT_SECS) as resp:
                text = resp.read().decode('utf-8')
        except urllib.error.HTTPError as e:
            excerpt = e.read().decode('utf-8', 'replace')[:400]
            raise PostgrestError(f'{method} {path} -> HTTP {e.code}: {excerpt}') from None
        except urllib.error.URLError as e:
            raise PostgrestError(f'{method} {path} -> {e.reason}') from None
        return json.loads(text) if text.strip() else None

    def get(self, table, **params):
        """GET rows from a table. Params are PostgREST query syntax, e.g.
        agency='eq.isl', order='sort_order.asc', select='*'."""
        qs = urllib.parse.urlencode(params)
        return self._call('GET', f'/{table}?{qs}')

    def rpc(self, function, args):
        return self._call('POST', f'/rpc/{function}', body=args)

    def insert(self, table, rows):
        return self._call('POST', f'/{table}', body=rows, prefer='return=minimal')


def read_stored(client, agency, quarter, year):
    """Read the stored report and every section the writer carries through.

    Returns None when no report row exists for the key (the caller aborts;
    see the module docstring). Values are PostgREST's JSON as-is: dates are
    strings, numbers are numbers, and `steps` on a click path is already
    the JSON value save_social_report expects back.
    """
    reports = client.get('social_reports', select='*',
                         agency=f'eq.{agency}', quarter=f'eq.{quarter}', year=f'eq.{year}')
    if not reports:
        return None
    report = reports[0]
    rid = report['id']
    campaigns = client.get('paid_media_campaigns', select='*',
                           report_id=f'eq.{rid}', order='sort_order.asc')
    camp_ids = [c['id'] for c in campaigns]
    ads = []
    if camp_ids:
        ads = client.get('paid_media_ads', select='*',
                         campaign_id=f"in.({','.join(camp_ids)})", order='sort_order.asc')
    return {
        'report': report,
        'kpis': client.get('social_kpis', select='*', report_id=f'eq.{rid}'),
        'platforms': client.get('social_platforms', select='*', report_id=f'eq.{rid}'),
        'insights': client.get('social_insights', select='*', report_id=f'eq.{rid}'),
        'campaigns': campaigns,
        'ads': ads,
        'demographics': client.get('paid_media_demographics', select='*',
                                   report_id=f'eq.{rid}', order='sort_order.asc'),
        'click_paths': client.get('paid_media_click_paths', select='*',
                                  report_id=f'eq.{rid}', order='sort_order.asc'),
    }


def build_payload(sections, stored, agency, quarter, year):
    """Assemble the full save_social_report payload: machine sections from
    the mapper, human sections carried through from `stored` (the shape
    read_stored returns), in the key layout the function reads
    (supabase/migrations/20260914181005_save_social_report_atomically.sql).

    Carry-through rules beyond the human sections:
    - followers_start always comes from the stored KPI row (the mapper
      cannot derive it; see mapper.py).
    - A platform followers or LinkedIn page_reach the mapper left as None
      (source could not report it) is filled from the stored platform row
      of the same name, so a limited run never erases a real figure.
    - KPI followers then resolves as: the mapper's sum if every platform
      reported, else the sum of the filled platform rows, else the stored
      KPI value.
    """
    stored_platforms = {p['name']: p for p in stored['platforms']}
    platforms = []
    for row in sections['platforms']:
        row = dict(row)
        old = stored_platforms.get(row['name']) or {}
        if row['followers'] is None:
            row['followers'] = old.get('followers')
        if row['page_reach'] is None:
            row['page_reach'] = old.get('page_reach')
        platforms.append(row)

    kpis = dict(sections['kpis'])
    stored_kpis = stored['kpis'][0] if stored['kpis'] else {}
    kpis['followers_start'] = stored_kpis.get('followers_start')
    if kpis['followers'] is None:
        filled = [p['followers'] for p in platforms]
        kpis['followers'] = (sum(filled) if all(f is not None for f in filled)
                             else stored_kpis.get('followers'))

    insights_rows = stored['insights']
    return {
        'agency': agency, 'quarter': quarter, 'year': year,
        'editors_note': stored['report'].get('editors_note') or '',
        'kpis': kpis,
        'platforms': platforms,
        'top_posts': sections['top_posts'],
        'posts': sections['posts'],
        'campaigns': [{
            'id': c['id'], 'name': c['name'], 'objective': c['objective'],
            'platform': c['platform'], 'budget': c['budget'],
            'start_date': c['start_date'], 'end_date': c['end_date'],
        } for c in stored['campaigns']],
        'ads': [{
            'id': a['id'], 'campaign_id': a['campaign_id'], 'sort_order': a['sort_order'],
            'name': a['name'], 'impressions': a['impressions'], 'reach': a['reach'],
            'clicks': a['clicks'], 'cpc': a['cpc'], 'conversions': a['conversions'],
            'engagement_rate': a['engagement_rate'], 'status': a['status'],
        } for a in stored['ads']],
        'demographics': [{
            'campaign_id': d['campaign_id'], 'dimension': d['dimension'],
            'segment': d['segment'], 'is_other': d['is_other'],
            'sort_order': d['sort_order'], 'impressions': d['impressions'],
            'clicks': d['clicks'],
        } for d in stored['demographics']],
        'click_paths': [{
            'campaign_id': p['campaign_id'], 'sort_order': p['sort_order'],
            'steps': p['steps'], 'sessions': p['sessions'],
            'conversions': p['conversions'], 'is_other': p['is_other'],
        } for p in stored['click_paths']],
        'insights': ({
            'working': insights_rows[0]['working'],
            'not_working': insights_rows[0]['not_working'],
            'actions': insights_rows[0]['actions'],
            'next_quarter': insights_rows[0]['next_quarter'],
        } if insights_rows else None),
    }


def log_run(client, source, agency, quarter, year, status, rows_written, message):
    """Insert one ingestion_runs row. started_at defaults server-side;
    finished_at is stamped here so a run's row says when it ended."""
    client.insert('ingestion_runs', [{
        'source': source, 'agency': agency, 'quarter': quarter, 'year': year,
        'status': status, 'rows_written': rows_written, 'message': message,
        'finished_at': datetime.now(timezone.utc).isoformat(),
    }])


def write_report(client, payload, summary, agency, quarter, year, message,
                 expected_updated_at=None):
    """Call save_social_report, then log one ingestion_runs row per
    platform. Returns the report id the function returns.

    The save and the log rows are separate PostgREST calls (the sandbox's
    single transaction does not exist over HTTP), so a failure between
    them is possible: if logging fails after a successful save, the
    PostgrestError propagates and the run reports failure even though the
    data landed. That ordering is deliberate: a saved-but-unlogged run is
    visible in the dashboard data, while a logged-but-unsaved success
    would be a lie in the one table whose job is noticing silence.

    When expected_updated_at is given (the stored report's updated_at as
    read_stored saw it), the report row is re-read immediately before
    the RPC and the write aborts with StaleReportError if updated_at has
    moved: an editor saved between our read and our write, and
    proceeding would silently overwrite their newer human sections with
    our older snapshot. This narrows the race to the instant between
    the re-read and the RPC; it cannot close it, because
    save_social_report has no compare-and-swap.
    """
    if expected_updated_at is not None:
        rows = client.get('social_reports', select='id,updated_at',
                          agency=f'eq.{agency}', quarter=f'eq.{quarter}',
                          year=f'eq.{year}')
        if not rows:
            raise StaleReportError(
                f'report for {agency}/{quarter}/{year} disappeared between '
                'read and write; aborting')
        current = rows[0].get('updated_at')
        if current != expected_updated_at:
            raise StaleReportError(
                f'report for {agency}/{quarter}/{year} changed since it was '
                f'read (updated_at {expected_updated_at} -> {current}); an '
                'editor save would be overwritten, aborting')
    rid = client.rpc('save_social_report', {'payload': payload})
    counts = summary['per_platform_posts']
    for source in ('facebook', 'instagram', 'linkedin'):
        log_run(client, source, agency, quarter, year, 'success',
                counts[source], message)
    return rid
