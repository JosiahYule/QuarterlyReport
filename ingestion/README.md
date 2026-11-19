# Social-stats ingestion backend

Automates the social numbers in the Quarterly Report dashboard so they no
longer have to be assembled by hand. It pulls per-post lifetime metrics
from Facebook and Instagram, imports the LinkedIn dataset, maps all three
into the dashboard's social schema under one counting basis, and writes
through the app's own `save_social_report` function. One `ingestion_runs`
row is logged per platform per run, so a job that quietly stops working
is visible in the admin instead of being discovered at reporting time.

Phase 1 is ISL only. Nothing here has run against the live project yet:
see "Go-live" below for what it still needs.

## Layout

- `run.py` — the single entry point (below).
- `socialstats/normalize.py` — the one post shape every source is
  converted into, and the engagement definition.
- `socialstats/pull_facebook.py`, `socialstats/pull_instagram.py` —
  connector pulls for a publish window, adapted from the Nov 3, 2026
  sandbox pipeline whose numbers matched hand counts exactly.
- `socialstats/linkedin.py` — LinkedIn importers. LinkedIn has no API
  route available to us, so the data arrives as a file a browser pull of
  the Page analytics produces: a CSV (current pulls) or the Nov 3-style
  JSON capture.
- `socialstats/mapper.py` — the counting rules, turning normalized posts
  into the four machine-owned sections: `kpis`, `platforms`,
  `top_posts`, `posts`.
- `socialstats/writer.py` — PostgREST read-modify-write through
  `save_social_report`, plus the `ingestion_runs` logging.
- `tests/` — unit tests (stdlib `unittest`, no dependencies). The mapper
  regression test pins the Nov 3 sandbox dataset to the numbers that were
  cross-checked by hand that day: 31 posts, 35,081 impressions, 612
  reactions, 8 comments, 109 shares, 4,763 link clicks, 5,685 followers,
  2.078% average engagement rate.
- `.env.example` — the two environment variables the writer needs.

## Counting rules

One basis, all platforms (the full reasoning lives in `mapper.py`):

- Posts published in the window, lifetime metrics.
- Engagements = reactions + comments + shares. Saves are excluded
  because the schema has no column for them; every run's summary counts
  them so the loss is visible, never silent.
- Link clicks = Facebook link clicks + LinkedIn clicks (LinkedIn does
  not separate link clicks; on the CSV route it reports no clicks, so
  its contribution is 0 there).
- Followers = current totals summed across platforms.
- Reach: LinkedIn = the period "members reached (organic)" figure when
  the capture has one; Facebook and Instagram = summed per-post unique
  viewers. The LinkedIn platform row's note says which basis it is on.
- Cross-posts merge into one post-log row on publish date + the first
  four normalized title words, the way the hand-kept log already merges
  them.

## Running it

Python 3, standard library only.

```bash
# Dry run: pulls live, maps, prints the sections, writes nothing.
python3 ingestion/run.py --start 2026-09-01 --end 2026-11-19 \
    --linkedin ~/workspace/social-pulls/li-posts-2026-11-19.csv --dry-run

# Real run (needs ingestion/.env filled in, see .env.example):
python3 ingestion/run.py --start 2026-09-01 --end 2026-11-30 \
    --linkedin <dataset.csv>
```

- `--quarter` / `--year` default to the fiscal quarter containing
  `--start`, with the year the app keys reports by: the calendar year
  of the quarter's last day (fiscal Q1 is Sep-Nov of that year;
  Dec-Feb is q2 of the year the February falls in).
- `--data-dir` keeps the normalized pulls so a run can be re-mapped or
  audited without re-pulling; `--skip-pull` reuses them.
- `--account-figures figures.json` supplies the figures no post pull
  reports: `{"followers": {"facebook": n, "instagram": n, "linkedin": n},
  "linkedin_members_reached_organic": n}`. Anything nobody reports stays
  unknown, and the writer carries the stored figure through rather than
  overwriting it.
- Exit codes: 0 written (or dry-run printed), 1 failed, 2 skipped
  because no stored report exists for the agency/quarter/year yet. A
  failed or skipped run still logs its `ingestion_runs` rows.

The write is read-modify-write: sections the automation owns are
replaced; the editor's note, insights, paid campaigns/ads/demographics/
click paths and `followers_start` are read from the stored report and
carried through unchanged. A second run changes nothing but `updated_at`
and new `ingestion_runs` rows.

## Tests

```bash
python3 -m unittest discover -s ingestion/tests
```

They also run in CI (`.github/workflows/ingestion.yml`) on changes under
`ingestion/`. The writer tests run against a local HTTP stub that plays
PostgREST: they prove request shapes and carry-through rules, not the
live project's behaviour.

## Known imperfections

Kept visible on purpose; each is a decision to make explicitly, not a
bug to discover later.

1. Post merging depends on caption similarity. In the Nov 3 run, two PEI
   posts split into separate rows because LinkedIn's displayed titles
   were truncated differently, so the true distinct count was ~29
   against 31 rows written. Posts with no caption at all now get a
   platform + date fallback title (see `normalize.py`), which keeps them
   as named, keyed rows; the truncation half needs fuller LinkedIn
   captions in the browser pull, which the current CSV partially
   provides.
2. The CSV route loses LinkedIn clicks, the follower total, and period
   reach: the browser table Muse pulls has none of them. Until a pull
   captures them (the legacy JSON shape can carry all three), the writer
   carries the stored figures through and the platform note says so.
3. `followers_start` cannot be derived after the fact. The pipeline
   carries the stored value; someone, or a quarter-open run, has to set
   it once per quarter for follower-growth reporting to work.
4. Facebook and Instagram follower totals do not come out of the post
   pulls either; they arrive via `--account-figures` or are carried
   through like LinkedIn's.

## Go-live: decisions and inputs still needed from Josiah

1. **Service-role key via the Secure Vault** (never chat), plus
   confirming the project URL. Fill `ingestion/.env` on the machine that
   will run the job (`.env.example` names the variables).
2. **One check on the live project:** `save_social_report` is SECURITY
   INVOKER and its migration grants EXECUTE to `authenticated` only.
   Whether `service_role` holds EXECUTE on it in the live project must
   be confirmed before the first production run; if it does not, a
   one-line grant migration is the fix.
3. **Cadence:** weekly suggested (the Trends projections sharpen with
   fresh writes; the app already snapshots daily).
4. **LinkedIn route accepted as the fragile leg:** a scheduled browser
   pull refreshing the CSV dataset, occasional tap-to-approve when
   LinkedIn re-challenges, ~2 day data lag.
