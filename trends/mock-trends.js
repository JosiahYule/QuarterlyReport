// Mock 3-quarter history for the Trends page.
// Each metric has Q1 actual, Q2 actual, Q3-to-date and Q3 projected end-of-quarter.
window.TRENDS_MOCK = {
  generatedLabel: "May 21, 2026",
  quarterCompletion: 0.78,   // ~Day 72 of Day 92 of Q3 (Mar 1 – May 31)
  daysElapsed: 72,
  daysTotal: 92,

  metrics: [
    {
      id: "impressions",
      label: "Impressions",
      q1: 184000, q2: 264000, q3ToDate: 322000, q3Projected: 412600,
      isPercent: false,
    },
    {
      id: "reactions",
      label: "Reactions",
      q1: 1820, q2: 2480, q3ToDate: 2480, q3Projected: 3180,
      isPercent: false,
    },
    {
      id: "linkclicks",
      label: "Link Clicks",
      q1: 740, q2: 1080, q3ToDate: 1264, q3Projected: 1620,
      isPercent: false,
    },
    {
      id: "shares",
      label: "Shares",
      q1: 142, q2: 196, q3ToDate: 190, q3Projected: 244,
      isPercent: false,
    },
    {
      id: "comments",
      label: "Comments",
      q1: 218, q2: 284, q3ToDate: 322, q3Projected: 412,
      isPercent: false,
    },
    {
      id: "posts",
      label: "Posts Published",
      q1: 92, q2: 105, q3ToDate: 68, q3Projected: 87,
      isPercent: false,
    },
    {
      id: "followers",
      label: "Followers",
      q1: 16480, q2: 17790, q3ToDate: 18420, q3Projected: 18540,
      isPercent: false,
      isStock: true,   // cumulative count, not a flow — show net-new rates
    },
  ],
};
