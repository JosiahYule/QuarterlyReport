// ─── Shared primitives ────────────────────────────────────────────
export interface DeltaObj {
  dir: "up" | "down" | "flat";
  pct: number;
}

// ─── Config ───────────────────────────────────────────────────────
export interface Agency {
  label: string;
  name: string;
  prefix: string;
  url: string;
}

export interface Quarter {
  suffix: string;
  label: string;
  rangeLabel: string;
  year: string;
  start: Date;
  end: Date;
}

// ─── Social ───────────────────────────────────────────────────────
export interface KpiData {
  posts?: number;
  impressions?: number;
  shares?: number;
  reactions?: number;
  followers?: number;
  linkclicks?: number;
  comments?: number;
  avgengagementrate?: number;
  [key: string]: number | undefined;
}

export interface Platform {
  key: string;
  name: string;
  followers: number | null;
  followersDelta: DeltaObj;
  engagementRate: number | null;
  engagementRateDelta: DeltaObj;
  pageReach: number | null;
  pageReachDelta: DeltaObj;
  pageClicks: number | null;
  pageClicksDelta: DeltaObj;
  note: string;
}

export interface Post {
  title: string;
  impressions: number;
  likes: number;
  shares: number;
}

export interface AllPost {
  "Post Name"?: string;
  Date?: string;
  Platforms?: string;
  Impressions?: number;
  Engagements?: number;
  Notes?: string;
  URL?: string;
  "Post Type"?: string;
  Type?: string;
}

export interface SocialNotes {
  working: string[];
  notWorking: string[];
  actions: string[];
  next: string[];
}

export interface SocialReport {
  meta: { quarter: string; rangeLabel: string; year: string; agencyName: string };
  editorsNote: string;
  overall: KpiData;
  deltas: Record<string, DeltaObj>;
  platforms: Platform[];
  topPostsByPlatform: Record<string, Post[]>;
  notes: SocialNotes;
  allPosts: AllPost[];
  weekly: Array<{ wk: number; imp: number; leads: number; spend: number }>;
}

// ─── Web ──────────────────────────────────────────────────────────
export interface Channel {
  name: string;
  sessions: number;
  shareOfTraffic: number;
  engagementRate: number;
}

export interface TopPage {
  key: string;
  name?: string;
  pageViews: number;
  bounceRate: number;
  avgTimeOnPageSec: number;
}

export interface WebReport {
  overall: Record<string, number>;
  deltas?: Record<string, unknown>;
  channels: Channel[];
  topPages: TopPage[];
  insights?: Record<string, string | string[]>;
}

// ─── Trends ───────────────────────────────────────────────────────
export interface Metric {
  id: string;
  label: string;
  needles: string[];
  isPercent: boolean;
  isPace: boolean;
  postsMultiplier?: boolean;
  baselineFromQ2?: boolean;
}

export interface PaceResult {
  projected: number;
  dailyRate: number;
  dElapsed: number;
  dTotal: number;
}

export interface HistorySnap {
  t: number;
  val: number;
}
