#!/usr/bin/env bash
# Deletes the 48 stale branches from JosiahYule/QuarterlyReport.
# 18 are already merged into main. 30 are the pre-June-2026 history.
# Run from a local clone of the repo. This cannot be undone.
set -euo pipefail

git push origin --delete \
  claude/affectionate-einstein-xtsd69 \
  claude/contact-form-trends-graph-10mnkb \
  claude/glass-edge-warp-mk6m47 \
  claude/great-ride-c7eaqv \
  claude/paid-media-click-paths-o0b1u6 \
  claude/paid-media-page-expansion-qxo469 \
  claude/paid-media-social-page-uu348b \
  claude/paid-media-tab-redesign-bi56eb \
  claude/paid-social-linkedin-analytics-ximgic \
  claude/plan-tab-overhaul-9urmur \
  claude/premium-saas-ui-polish-fkgrxo \
  claude/q4-trend-analysis-grs4na \
  claude/quarterly-plan-tab-redesign-woeq7n \
  claude/quarterly-report-plan-tab-tyco0b \
  claude/quarterly-report-week-glance-dzjqyb \
  claude/stoic-bardeen-w6da3w \
  claude/trends-projection-accuracy-jec7vi \
  claude/vigilant-hamilton-m2erff \
  claude/code-review-refactor-ZaW0u \
  claude/cool-hamilton-FUH6C \
  claude/elegant-goldberg-SQXve \
  claude/elegant-hopper-ivqiw2 \
  claude/hero-favicon-font-fixes \
  claude/intelligent-hypatia-70gi9r \
  claude/nice-ramanujan-MqUiy \
  claude/optimistic-johnson-tkCht \
  claude/practical-faraday-aTb36 \
  claude/practical-galileo-24407k \
  claude/professional-polish-pass \
  claude/sleepy-knuth-ZHSK2 \
  claude/trusting-faraday-k9im0l \
  claude/wizardly-pasteur-ynok3 \
  codex/add-clickable-points-and-resolve-button \
  codex/add-content-strategist-section-to-weekly-planner.html \
  codex/add-switcher-for-accountant/admin-staffing \
  codex/add-trend-page-with-quarterly-comparison \
  codex/analyze-q3-projections-against-actuals \
  codex/create-ai-bot-for-feedback-on-insights \
  codex/design-sleek-apple-style-ui \
  codex/design-sleek-apple-style-ui-r7xnwc \
  codex/enhance-animations-and-ui-in-weekly-planner.html \
  codex/improve-hero-header-design \
  codex/improve-social-media-plan.html-for-landing-page \
  codex/refactor-jump-to-section-menu \
  codex/review-code-for-quarterly-report-improvements \
  codex/review-code-for-ui/ux-improvements-and-bugs \
  feat/mobile-optimizations \
  fix/platform-spark-range
