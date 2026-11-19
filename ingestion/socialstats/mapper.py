"""Map normalized posts into the four social sections the automation owns:
kpis, platforms, top_posts, posts. (The writer adds the human-owned
sections it carries through; see writer.py.)

Counting rules, one basis for all three platforms. These are the rules the
Nov 3, 2026 sandbox proved against hand counts; changing one is a product
decision, not a refactor, and the tests in ingestion/tests pin them.

- Posts published in the window, lifetime metrics.
- Engagements = reactions + comments + shares (normalize.engagements).
  Saves are excluded because the schema has no column for them; the run
  summary counts them so the loss is visible in every run's output.
- Link clicks = Facebook link_clicks + LinkedIn clicks (LinkedIn does not
  separate link clicks from other clicks; on the CSV route LinkedIn
  reports no clicks at all, so its contribution is 0 there).
- Followers = current totals summed across platforms. A source that
  cannot report a total yields None here, and the writer carries the
  stored figure through rather than overwriting it with a guess.
- Reach: LinkedIn = the period "members reached (organic)" figure from
  the capture, when the capture has one; Facebook and Instagram =
  summed per-post unique viewers. The two bases are not the same kind
  of number and the LinkedIn platform row's note says which one it is.

Known imperfection, kept deliberately: cross-post merging keys on publish
date plus the first four normalized words of the title. Two PEI posts in
the Nov 3 run split into separate rows because LinkedIn's displayed
titles were truncated differently from the other platforms', so the true
distinct count that quarter was ~29 against the 31 rows written. The
fallback title in normalize.py fixes the empty-caption half of that
problem; the truncation half needs fuller LinkedIn captions in the
browser pull, which the current CSV partially provides. Do not "improve"
the heuristic silently: a merge rule change rewrites history in the post
log, and it should land as its own reviewed decision.
"""
from .normalize import DISPLAY_NAME, engagements

_ORDER = ('linkedin', 'facebook', 'instagram')


def title_key(title):
    """The merge key's title half: first four words, letters/digits only."""
    import re
    words = re.sub(r'[^a-z0-9 ]', '', (title or '').lower()).split()
    return ' '.join(words[:4])


def _platform_note(plat, followers_known, reach_known):
    parts = ['Automated pull.']
    if plat == 'linkedin' and reach_known:
        parts.append('Reach is LinkedIn period members reached, organic.')
    missing = []
    if not followers_known:
        missing.append('followers')
    if plat == 'linkedin' and not reach_known:
        missing.append('reach')
    if missing:
        parts.append(f"{' and '.join(missing).capitalize()} carried from the "
                     'last run that reported them.')
    return ' '.join(parts)


def build_sections(by_platform, followers, linkedin_reach):
    """Build the machine-owned sections.

    by_platform: {'facebook': [post], 'instagram': [post], 'linkedin': [post]}
        of normalized posts (normalize.py), already window-filtered.
    followers: {'facebook': int|None, 'instagram': int|None,
        'linkedin': int|None} current totals; None = source cannot say.
    linkedin_reach: int|None, the period members-reached figure.

    Returns {'kpis', 'platforms', 'top_posts', 'posts', '_summary'} in the
    exact key shapes save_social_report reads (verified against
    supabase/migrations/20260914181005_save_social_report_atomically.sql).
    kpis['followers_start'] is always None here: a quarter-start count
    cannot be derived after the fact, so the writer carries the stored
    value through.
    """
    for plat in _ORDER:
        if plat not in by_platform:
            raise ValueError(f'by_platform is missing {plat!r}')

    reach = {
        'linkedin': linkedin_reach,
        'facebook': sum(p['unique_viewers'] for p in by_platform['facebook']),
        'instagram': sum(p['unique_viewers'] for p in by_platform['instagram']),
    }

    # ── merge cross-posts into single post-log rows ────────────────────
    groups, order = {}, []
    for plat in _ORDER:
        for p in by_platform[plat]:
            key = (p['date'], title_key(p['title']))
            if key not in groups:
                groups[key] = {}
                order.append(key)
            groups[key][plat] = p

    posts_rows = []
    for key in order:
        g = groups[key]
        members = list(g.values())
        times = [m['time'] for m in members if m.get('time')]
        urls = [m['url'] for m in members if m.get('url')]
        posts_rows.append({
            'post_name': max((m['title'] for m in members), key=len),
            'post_date': key[0],
            'post_time': min(times) if times else None,
            'platforms': ', '.join(DISPLAY_NAME[pid] for pid in _ORDER if pid in g),
            'impressions': sum(m['impressions'] for m in members),
            'engagements': sum(engagements(m) for m in members),
            'url': urls[0] if urls else None,
            'notes': '',
        })
    posts_rows.sort(key=lambda r: (r['post_date'], r['post_time'] or ''))

    # ── one row per platform ───────────────────────────────────────────
    platform_rows = []
    for plat in _ORDER:
        rows = by_platform[plat]
        imp = sum(p['impressions'] for p in rows)
        eng = sum(engagements(p) for p in rows)
        platform_rows.append({
            'name': DISPLAY_NAME[plat],
            'followers': followers.get(plat),
            'engagement_rate': round(eng / imp * 100, 3) if imp else None,
            'page_reach': reach[plat],
            'page_clicks': sum(p['clicks'] for p in rows),
            'note': _platform_note(plat, followers.get(plat) is not None,
                                   reach[plat] is not None),
        })

    # ── top post per platform, by impressions ──────────────────────────
    top_rows = []
    for plat in _ORDER:
        rows = by_platform[plat]
        if not rows:
            continue
        best = max(rows, key=lambda p: p['impressions'])
        top_rows.append({'platform': plat, 'title': best['title'],
                         'impressions': best['impressions'],
                         'likes': best['reactions'], 'shares': best['shares']})

    # ── headline KPIs ──────────────────────────────────────────────────
    all_rows = [p for plat in _ORDER for p in by_platform[plat]]
    imp = sum(p['impressions'] for p in all_rows)
    eng = sum(engagements(p) for p in all_rows)
    known_followers = [followers.get(plat) for plat in _ORDER]
    kpis = {
        'posts': len(posts_rows),
        'impressions': imp,
        'shares': sum(p['shares'] for p in all_rows),
        'reactions': sum(p['reactions'] for p in all_rows),
        # None unless every platform reported: a partial sum would read as
        # a follower collapse in the dashboard. The writer substitutes the
        # carried-through platform figures, then this sum, then the stored
        # KPI, in that order (writer.py).
        'followers': sum(known_followers) if all(f is not None for f in known_followers) else None,
        'link_clicks': (sum(p['link_clicks'] for p in by_platform['facebook'])
                        + sum(p['clicks'] for p in by_platform['linkedin'])),
        'comments': sum(p['comments'] for p in all_rows),
        'avg_engagement_rate': round(eng / imp * 100, 3) if imp else None,
        'followers_start': None,
    }

    summary = {
        'merged_posts': len(posts_rows),
        'per_platform_posts': {plat: len(by_platform[plat]) for plat in _ORDER},
        'saves_excluded_from_engagements': {
            plat: sum(p['saves'] for p in by_platform[plat]) for plat in _ORDER},
    }
    return {'kpis': kpis, 'platforms': platform_rows, 'top_posts': top_rows,
            'posts': posts_rows, '_summary': summary}
