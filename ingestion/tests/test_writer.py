"""Writer tests, run against a local HTTP stub that plays PostgREST.

The stub proves the client's request shapes (paths, filters, the
{'payload': ...} RPC body, the ingestion_runs rows) and build_payload's
carry-through rules. It does not prove anything about the real Supabase
project: that stays unverified until a service-role key exists (see
ingestion/README.md). The stored-report fixture below is shaped the way
PostgREST returns rows, with the human-owned content marked so a test
failure that loses it is unmissable.
"""
import json
import os
import sys
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from socialstats import writer  # noqa: E402

REPORT_ID = '11111111-1111-1111-1111-111111111111'
CAMPAIGN_ID = '22222222-2222-2222-2222-222222222222'

STORED_TABLES = {
    'social_reports': [{
        'id': REPORT_ID, 'agency': 'isl', 'quarter': 'q1', 'year': '2026',
        'editors_note': 'EDITOR NOTE — HUMAN OWNED, DO NOT LOSE',
        'updated_at': '2026-11-01T00:00:00+00:00',
    }],
    'social_kpis': [{
        'report_id': REPORT_ID, 'posts': 1, 'impressions': 2, 'shares': 3,
        'reactions': 4, 'followers': 5000, 'link_clicks': 6, 'comments': 7,
        'avg_engagement_rate': 1.5, 'followers_start': 3050,
    }],
    'social_platforms': [
        {'report_id': REPORT_ID, 'name': 'LinkedIn', 'followers': 3207,
         'engagement_rate': 2.0, 'page_reach': 8123, 'page_clicks': 900, 'note': 'old'},
        {'report_id': REPORT_ID, 'name': 'Facebook', 'followers': 1951,
         'engagement_rate': 2.0, 'page_reach': 4000, 'page_clicks': 100, 'note': 'old'},
        {'report_id': REPORT_ID, 'name': 'Instagram', 'followers': 527,
         'engagement_rate': 2.0, 'page_reach': 3000, 'page_clicks': 0, 'note': 'old'},
    ],
    'social_insights': [{
        'report_id': REPORT_ID, 'working': 'WORKING — HUMAN', 'not_working': 'NOT — HUMAN',
        'actions': 'ACTIONS — HUMAN', 'next_quarter': 'NEXT — HUMAN',
    }],
    'paid_media_campaigns': [{
        'id': CAMPAIGN_ID, 'report_id': REPORT_ID, 'sort_order': 0,
        'name': 'Fall push', 'objective': 'Leads', 'platform': 'LinkedIn',
        'budget': 250.0, 'start_date': '2026-09-15', 'end_date': '2026-10-15',
    }],
    'paid_media_ads': [{
        'id': '33333333-3333-3333-3333-333333333333', 'campaign_id': CAMPAIGN_ID,
        'sort_order': 0, 'name': 'Ad one', 'impressions': 100, 'reach': 80,
        'clicks': 9, 'cpc': 1.25, 'conversions': 2, 'engagement_rate': 3.5,
        'status': 'active',
    }],
    'paid_media_demographics': [{
        'report_id': REPORT_ID, 'campaign_id': CAMPAIGN_ID, 'dimension': 'age',
        'segment': '25-34', 'is_other': False, 'sort_order': 0,
        'impressions': 60, 'clicks': 5,
    }],
    'paid_media_click_paths': [{
        'report_id': REPORT_ID, 'campaign_id': CAMPAIGN_ID, 'sort_order': 0,
        'steps': [{'page': 'Home'}, {'page': 'Jobs'}], 'sessions': 42,
        'conversions': 3, 'is_other': False,
    }],
}


def machine_sections():
    """Mapper-shaped sections where LinkedIn reported nothing account-level:
    followers and reach are None, the case the CSV route produces."""
    return {
        'kpis': {'posts': 31, 'impressions': 35081, 'shares': 109, 'reactions': 612,
                 'followers': None, 'link_clicks': 4763, 'comments': 8,
                 'avg_engagement_rate': 2.078, 'followers_start': None},
        'platforms': [
            {'name': 'LinkedIn', 'followers': None, 'engagement_rate': 3.0,
             'page_reach': None, 'page_clicks': 0, 'note': 'Automated pull.'},
            {'name': 'Facebook', 'followers': 2000, 'engagement_rate': 2.0,
             'page_reach': 4100, 'page_clicks': 120, 'note': 'Automated pull.'},
            {'name': 'Instagram', 'followers': 540, 'engagement_rate': 2.5,
             'page_reach': 3100, 'page_clicks': 0, 'note': 'Automated pull.'},
        ],
        'top_posts': [{'platform': 'linkedin', 'title': 'Big post',
                       'impressions': 1407, 'likes': 28, 'shares': 10}],
        'posts': [{'post_name': 'A post', 'post_date': '2026-09-02', 'post_time': None,
                   'platforms': 'Facebook', 'impressions': 10, 'engagements': 3,
                   'url': None, 'notes': ''}],
        '_summary': {'merged_posts': 1,
                     'per_platform_posts': {'facebook': 1, 'instagram': 1, 'linkedin': 1},
                     'saves_excluded_from_engagements': {'facebook': 0, 'instagram': 0, 'linkedin': 0}},
    }


class StubPostgrest(BaseHTTPRequestHandler):
    """Records every request; serves STORED_TABLES for GETs, the report id
    for the RPC, and nothing for inserts."""
    requests = []

    def log_message(self, *a):
        pass

    def _reply(self, obj, code=200):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        parsed = urlparse(self.path)
        table = parsed.path.rsplit('/', 1)[-1]
        StubPostgrest.requests.append(('GET', parsed.path, parse_qs(parsed.query)))
        self._reply(STORED_TABLES.get(table, []))

    def do_POST(self):
        length = int(self.headers.get('Content-Length') or 0)
        body = json.loads(self.rfile.read(length) or b'null')
        StubPostgrest.requests.append(('POST', urlparse(self.path).path, body))
        if urlparse(self.path).path.endswith('/rpc/save_social_report'):
            self._reply(REPORT_ID)
        else:
            self._reply(None, 201)


class BuildPayloadTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        # Build the `stored` shape directly from the fixture tables instead
        # of going through HTTP; HttpBehaviourTest covers the HTTP path.
        cls.stored = {
            'report': STORED_TABLES['social_reports'][0],
            'kpis': STORED_TABLES['social_kpis'],
            'platforms': STORED_TABLES['social_platforms'],
            'insights': STORED_TABLES['social_insights'],
            'campaigns': STORED_TABLES['paid_media_campaigns'],
            'ads': STORED_TABLES['paid_media_ads'],
            'demographics': STORED_TABLES['paid_media_demographics'],
            'click_paths': STORED_TABLES['paid_media_click_paths'],
        }
        cls.payload = writer.build_payload(machine_sections(), cls.stored, 'isl', 'q1', '2026')

    def test_human_sections_carried_through_unchanged(self):
        p = self.payload
        self.assertEqual(p['editors_note'], 'EDITOR NOTE — HUMAN OWNED, DO NOT LOSE')
        self.assertEqual(p['insights'], {'working': 'WORKING — HUMAN',
                                         'not_working': 'NOT — HUMAN',
                                         'actions': 'ACTIONS — HUMAN',
                                         'next_quarter': 'NEXT — HUMAN'})
        self.assertEqual(p['campaigns'][0]['name'], 'Fall push')
        self.assertEqual(p['ads'][0]['name'], 'Ad one')
        self.assertEqual(p['demographics'][0]['segment'], '25-34')
        self.assertEqual(p['click_paths'][0]['steps'], [{'page': 'Home'}, {'page': 'Jobs'}])

    def test_followers_start_comes_from_the_stored_kpi(self):
        self.assertEqual(self.payload['kpis']['followers_start'], 3050)

    def test_unknown_linkedin_figures_filled_from_stored(self):
        rows = {r['name']: r for r in self.payload['platforms']}
        self.assertEqual(rows['LinkedIn']['followers'], 3207)
        self.assertEqual(rows['LinkedIn']['page_reach'], 8123)
        # Reported figures are never overwritten by stored ones.
        self.assertEqual(rows['Facebook']['followers'], 2000)

    def test_kpi_followers_resolves_from_filled_platform_rows(self):
        # 3207 (stored LinkedIn) + 2000 + 540 (reported) = 5747.
        self.assertEqual(self.payload['kpis']['followers'], 5747)

    def test_payload_keys_match_the_function(self):
        # The exact top-level and kpis keys save_social_report reads, per
        # supabase/migrations/20260914181005_save_social_report_atomically.sql.
        self.assertEqual(set(self.payload), {
            'agency', 'quarter', 'year', 'editors_note', 'kpis', 'platforms',
            'top_posts', 'posts', 'campaigns', 'ads', 'demographics',
            'click_paths', 'insights'})
        self.assertEqual(set(self.payload['kpis']), {
            'posts', 'impressions', 'shares', 'reactions', 'followers',
            'link_clicks', 'comments', 'avg_engagement_rate', 'followers_start'})


class HttpBehaviourTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = ThreadingHTTPServer(('127.0.0.1', 0), StubPostgrest)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        port = cls.server.server_address[1]
        cls.client = writer.PostgrestClient(f'http://127.0.0.1:{port}', 'test-service-key')

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()

    def setUp(self):
        StubPostgrest.requests = []

    def test_read_stored_filters_by_report_key(self):
        stored = writer.read_stored(self.client, 'isl', 'q1', '2026')
        self.assertIsNotNone(stored)
        first = StubPostgrest.requests[0]
        self.assertEqual(first[0], 'GET')
        self.assertIn('social_reports', first[1])
        self.assertEqual(first[2].get('agency'), ['eq.isl'])
        self.assertEqual(first[2].get('quarter'), ['eq.q1'])
        self.assertEqual(stored['campaigns'][0]['id'], CAMPAIGN_ID)

    def test_write_report_calls_rpc_then_logs_three_rows(self):
        stored = writer.read_stored(self.client, 'isl', 'q1', '2026')
        payload = writer.build_payload(machine_sections(), stored, 'isl', 'q1', '2026')
        StubPostgrest.requests = []
        rid = writer.write_report(self.client, payload, machine_sections()['_summary'],
                                  'isl', 'q1', '2026', 'Automated pull.')
        self.assertEqual(rid, REPORT_ID)
        posts = [r for r in StubPostgrest.requests if r[0] == 'POST']
        self.assertTrue(posts[0][1].endswith('/rpc/save_social_report'))
        self.assertEqual(set(posts[0][2]), {'payload'})
        inserts = [r[2] for r in posts[1:] if r[1].endswith('/ingestion_runs')]
        self.assertEqual(len(inserts), 3)
        sources = sorted(row[0]['source'] for row in inserts)
        self.assertEqual(sources, ['facebook', 'instagram', 'linkedin'])
        for row in inserts:
            self.assertEqual(row[0]['status'], 'success')
            self.assertEqual(row[0]['rows_written'], 1)

    def test_client_refuses_missing_credentials(self):
        with self.assertRaises(ValueError):
            writer.PostgrestClient('', '')


if __name__ == '__main__':
    unittest.main()
