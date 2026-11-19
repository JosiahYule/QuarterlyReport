#!/usr/bin/env python3
"""Run one social-stats ingestion: pull, map, and (unless --dry-run) write.

    python3 ingestion/run.py --start 2026-09-01 --end 2026-11-19 \
        --linkedin ~/workspace/social-pulls/li-posts-2026-11-19.csv

The window is the publish window: posts published between --start and
--end, lifetime metrics (see socialstats/mapper.py for the counting
rules). --quarter and --year name the report the window belongs to; they
default to the fiscal quarter containing --start (fiscal Q1 is Sep-Nov)
with the year the app keys reports by: the calendar year of the
quarter's last day, so Dec 2026-Feb 2027 is q2 of 2027. --agency
defaults to isl; phase 1 is ISL only.

Facebook and Instagram are pulled live through their connectors and the
raw normalized pulls are kept in --data-dir (default ingestion/data/) so
a run can be re-mapped or audited without re-pulling. --skip-pull reuses
the files already there. LinkedIn has no API route: --linkedin names the
CSV (or legacy JSON) dataset a browser pull produced.

--account-figures names an optional JSON file with the figures no post
pull reports: {"followers": {"facebook": n, "instagram": n, "linkedin":
n}, "linkedin_members_reached_organic": n}. Anything it and the LinkedIn
dataset both omit stays unknown, and the writer carries the stored
figure through instead of overwriting it (socialstats/writer.py).

--dry-run builds and prints the machine sections and the run summary,
and touches nothing: no pulls are skipped (the point is to see real
numbers), but no write is attempted and no credentials are needed.

Exit codes: 0 written (or dry-run printed), 1 failed, 2 skipped because
no stored report exists for the agency/quarter/year yet.
"""
import argparse
import json
import os
import sys
from datetime import date, timedelta

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from socialstats import linkedin as linkedin_source
from socialstats import mapper, pull_facebook, pull_instagram, writer


def fiscal_quarter(start):
    """(quarter, year) of the fiscal quarter containing an ISO date.

    The quarter is fiscal (Q1 is Sep-Nov), but the year is the CALENDAR
    year of the quarter's last day, because that is the year the app
    keys reports by: src/config.js buildQuarter sets year to
    String(last.getFullYear()), so the database key for Dec 2026-Feb
    2027 is q2 + 2027. Labelling by the fiscal start year instead would
    file Q2, Q3 and Q4 runs under the previous year's report and
    overwrite it; Q1 (Sep-Nov) coincides under both rules, which is why
    the Nov 3 sandbox run did not catch it.
    """
    d = date.fromisoformat(start)
    quarter = {9: 'q1', 10: 'q1', 11: 'q1', 12: 'q2', 1: 'q2', 2: 'q2',
               3: 'q3', 4: 'q3', 5: 'q3', 6: 'q4', 7: 'q4', 8: 'q4'}[d.month]
    # First calendar month of the quarter, and the year it falls in.
    # Q2 starts in December, so for a Jan/Feb date the quarter began
    # the previous calendar year.
    first_month = {'q1': 9, 'q2': 12, 'q3': 3, 'q4': 6}[quarter]
    first_year = d.year - 1 if (quarter == 'q2' and d.month in (1, 2)) else d.year
    # The quarter's last day is the day before the first day of the
    # month three months after the quarter starts.
    total = first_year * 12 + (first_month - 1) + 3
    last = date(total // 12, total % 12 + 1, 1) - timedelta(days=1)
    return quarter, str(last.year)


def in_window(posts, start, end):
    """Keep only posts published between start and end (inclusive ISO
    dates; ISO strings compare correctly as text).

    The FB/IG pullers filter their own output, but the LinkedIn dataset
    is a file and arrives whole: without this filter, every post in the
    file lands in the quarter, including ones from outside the window.
    Anything else that arrives unfiltered (the saved-pull archive, see
    merge_archive) passes through here too, so the window means the
    same thing for every source before mapping.
    """
    return [p for p in posts if start <= p['date'] <= end]


def load_env_file(path):
    """Load KEY=VALUE lines from a .env file into os.environ, without
    overriding variables already set. The service-role key lives in this
    file on the machine that runs the job (never in the repo; .gitignore
    covers it) or in the scheduler's own environment."""
    if not path or not os.path.exists(path):
        return
    with open(path) as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith('#') and '=' in line:
                key, _, value = line.partition('=')
                os.environ.setdefault(key.strip(), value.strip())


def main(argv=None):
    ap = argparse.ArgumentParser(description='Quarterly Report social-stats ingestion')
    ap.add_argument('--start', required=True, help='window start, YYYY-MM-DD')
    ap.add_argument('--end', required=True, help='window end, YYYY-MM-DD')
    ap.add_argument('--linkedin', required=True,
                    help='LinkedIn dataset: browser-pull CSV or legacy JSON')
    ap.add_argument('--account-figures', help='JSON with followers / LinkedIn reach figures')
    ap.add_argument('--data-dir', default=os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data'),
                    help='where the normalized pulls are kept (default: ingestion/data)')
    ap.add_argument('--skip-pull', action='store_true',
                    help='reuse facebook.json / instagram.json already in --data-dir')
    ap.add_argument('--agency', default='isl')
    ap.add_argument('--quarter', help='default: derived from --start')
    ap.add_argument('--year', help='default: derived from --start')
    ap.add_argument('--dry-run', action='store_true',
                    help='print the mapped sections; write nothing')
    ap.add_argument('--env-file', default=os.path.join(os.path.dirname(os.path.abspath(__file__)), '.env'),
                    help='default: ingestion/.env when present')
    args = ap.parse_args(argv)

    quarter, year = (args.quarter, args.year) if args.quarter and args.year \
        else fiscal_quarter(args.start)
    os.makedirs(args.data_dir, exist_ok=True)

    # ── pull / load the three sources ──────────────────────────────────
    if args.skip_pull:
        with open(os.path.join(args.data_dir, 'facebook.json')) as f:
            fb = json.load(f)
        with open(os.path.join(args.data_dir, 'instagram.json')) as f:
            ig = json.load(f)
    else:
        fb = pull_facebook.pull(args.start, args.end)
        ig = pull_instagram.pull(args.start, args.end)
        with open(os.path.join(args.data_dir, 'facebook.json'), 'w') as f:
            json.dump(fb, f, indent=1)
        with open(os.path.join(args.data_dir, 'instagram.json'), 'w') as f:
            json.dump(ig, f, indent=1)
    li, li_account = linkedin_source.load(args.linkedin)
    li_in_window = in_window(li, args.start, args.end)
    if len(li_in_window) < len(li):
        print(f'linkedin: {len(li) - len(li_in_window)} dataset posts fell outside '
              f'{args.start} to {args.end} and were dropped')
    li = li_in_window

    followers = {'facebook': None, 'instagram': None, 'linkedin': li_account['followers']}
    li_reach = li_account['members_reached_organic']
    if args.account_figures:
        with open(args.account_figures) as f:
            figures = json.load(f)
        for plat, value in (figures.get('followers') or {}).items():
            followers[plat] = value
        if figures.get('linkedin_members_reached_organic') is not None:
            li_reach = figures['linkedin_members_reached_organic']

    # ── map ────────────────────────────────────────────────────────────
    sections = mapper.build_sections(
        {'facebook': fb, 'instagram': ig, 'linkedin': li}, followers, li_reach)
    summary = sections['_summary']
    print('summary:', json.dumps(summary))
    print('kpis:', json.dumps(sections['kpis']))

    if args.dry_run:
        print(json.dumps(sections, indent=1))
        print('dry run: nothing written')
        return 0

    # ── write ──────────────────────────────────────────────────────────
    load_env_file(args.env_file)
    try:
        client = writer.PostgrestClient(os.environ.get('SUPABASE_URL'),
                                        os.environ.get('SUPABASE_SERVICE_ROLE_KEY'))
    except ValueError as e:
        print(f'cannot write: {e}', file=sys.stderr)
        return 1

    message = f'Automated pull, {args.start} to {args.end}.'
    stored = writer.read_stored(client, args.agency, quarter, year)
    if stored is None:
        for source in ('facebook', 'instagram', 'linkedin'):
            writer.log_run(client, source, args.agency, quarter, year, 'skipped', 0,
                           f'No stored report for {args.agency}/{quarter}/{year}; nothing written.')
        print(f'no stored report for {args.agency}/{quarter}/{year}; skipped')
        return 2

    payload = writer.build_payload(sections, stored, args.agency, quarter, year)
    try:
        rid = writer.write_report(client, payload, summary, args.agency, quarter, year, message)
    except writer.PostgrestError as e:
        for source in ('facebook', 'instagram', 'linkedin'):
            try:
                writer.log_run(client, source, args.agency, quarter, year,
                               'failed', 0, str(e)[:500])
            except writer.PostgrestError:
                pass  # the original error is the one to report
        print(f'write failed: {e}', file=sys.stderr)
        return 1
    print('saved report:', rid)
    return 0


if __name__ == '__main__':
    sys.exit(main())
