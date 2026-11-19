"""Social-stats ingestion for the Quarterly Report dashboard.

Pulls per-post lifetime metrics from Facebook and Instagram, imports the
LinkedIn browser-pull dataset, maps everything into the dashboard's social
schema under one counting basis, and writes through the app's own
save_social_report function. See ingestion/README.md for the counting rules,
how to run it, and what go-live still needs.
"""
