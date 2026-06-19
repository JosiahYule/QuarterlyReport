// Plain-language metric definitions shown on hover/focus across the report.
//
// Each entry is one or two short, jargon-free sentences a non-marketer (e.g.
// leadership) can read at a glance. Keep them friendly and concrete — explain
// what the number *means*, not how it's computed. These power the hover
// tooltips on KPI cards and table column headers (see MetricTip.jsx); both the
// Social and Website pages map their metrics to the keys below.

export const METRIC_INFO = {
  // ─── Website KPIs ───────────────────────────────────────────────
  sessions:
    "Each time someone comes to your site. The same person returning later counts as another visit.",
  users:
    "How many different people visited, counted once each — no matter how many times they came back.",
  engagementRate:
    "The share of visits where people actually engaged — stayed a while, viewed more than one page, or took an action — instead of leaving right away.",
  avgEngagementTime:
    "How long the average visitor actively spent on your site during a visit.",
  actions:
    "Clicks on key calls-to-action — like “Apply Now,” or a phone or email link — that signal real interest.",
  formSubmissions:
    "How many people filled out and sent a contact or application form.",

  // ─── Website channels & pages ───────────────────────────────────
  channel:
    "Where your visitors came from — for example Google search, a direct link, another website, social media, or paid ads.",
  trafficShare:
    "This source's portion of all your traffic, shown as a percentage of total visits.",
  pageViews:
    "How many times this page was opened, including repeat views by the same person.",
  bounceRate:
    "The share of visits where someone landed on this page and left without doing anything else — so a lower number is better.",
  avgTimeOnPage:
    "How long the average visitor spent on this page.",

  // ─── Social KPIs ────────────────────────────────────────────────
  posts:
    "How many pieces of content you published across all platforms this quarter.",
  impressions:
    "How many times your content showed up on someone's screen. The same person seeing it twice counts twice.",
  shares:
    "How many times people reshared your content to their own followers — a strong sign it resonated.",
  reactions:
    "Likes and other reactions (love, celebrate, and so on) across your posts.",
  followers:
    "The total number of people who follow your pages — the size of your audience.",
  linkClicks:
    "How many times people clicked a link in your posts to come to your site or content.",
  comments:
    "How many comments people left — a sign of real conversation, not just a passing like.",
  engagementRateSocial:
    "Of the people who saw your content, the share who interacted with it — liked, commented, shared, or clicked. Higher means more compelling content.",

  // ─── Social platforms & posts ───────────────────────────────────
  platform:
    "Which social network this row covers — LinkedIn, Facebook, or Instagram.",
  pageReach:
    "The number of different people who saw this platform's content, counted once each — unlike impressions, which count repeat views.",
  pageClicks:
    "Clicks on the page itself — such as your profile, contact button, or website link.",
  engagements:
    "All interactions on a post added together — likes, comments, shares, and clicks.",
};
