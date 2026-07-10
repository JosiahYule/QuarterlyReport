import { describe, it, expect } from "vitest";
import {
  buildPlatformFocusSignal,
  buildJobAdSignal,
  buildWebFunnelSignal,
} from "./planSignals.js";
import { MIN_SAMPLE_SIZE } from "./planEngine.js";

describe("buildPlatformFocusSignal", () => {
  it("is empty with fewer than two active platforms", () => {
    expect(buildPlatformFocusSignal([{ name: "LinkedIn", engagement_rate: 5 }])).toEqual(
      { status: "empty", platform: null, engagementRate: null, weight: 0 }
    );
    expect(buildPlatformFocusSignal([])).toEqual(
      { status: "empty", platform: null, engagementRate: null, weight: 0 }
    );
  });

  it("is empty when no platform has a positive engagement rate", () => {
    const platforms = [{ name: "LinkedIn", engagement_rate: 0 }, { name: "Facebook", engagement_rate: null }];
    expect(buildPlatformFocusSignal(platforms).status).toBe("empty");
  });

  it("is empty when the leader is only barely ahead of the pack", () => {
    // 10% ahead is well under the 50%-ahead-for-full-weight bar
    const platforms = [{ name: "LinkedIn", engagement_rate: 5.5 }, { name: "Facebook", engagement_rate: 5 }];
    expect(buildPlatformFocusSignal(platforms).status).toBe("empty");
  });

  it("picks the leader with a real lead and scales weight with how far ahead it is", () => {
    // LinkedIn is 100% ahead of Facebook's 5 -> lead(1.0) / 0.5 -> weight clamped to 1
    const platforms = [{ name: "LinkedIn", engagement_rate: 10 }, { name: "Facebook", engagement_rate: 5 }];
    const signal = buildPlatformFocusSignal(platforms);
    expect(signal.status).toBe("ready");
    expect(signal.platform).toBe("LinkedIn");
    expect(signal.engagementRate).toBe(10);
    expect(signal.weight).toBe(1);
  });

  it("breaks a tie in current rate using QoQ momentum", () => {
    const platforms = [{ name: "LinkedIn", engagement_rate: 8 }, { name: "Facebook", engagement_rate: 8 }, { name: "Instagram", engagement_rate: 2 }];
    const prev = [{ name: "LinkedIn", engagement_rate: 4 }, { name: "Facebook", engagement_rate: 8 }];
    const signal = buildPlatformFocusSignal(platforms, prev);
    // LinkedIn doubled QoQ, Facebook was flat -> LinkedIn wins the tie
    expect(signal.platform).toBe("LinkedIn");
  });
});

describe("buildJobAdSignal", () => {
  const jobPost = (impressions, engagements) => ({
    post_date: "2026-06-01", impressions, engagements, notes: "job posting",
  });

  it("is empty with too few organic job posts to trust", () => {
    const posts = Array.from({ length: MIN_SAMPLE_SIZE - 1 }, () => jobPost(1000, 30));
    const paidMedia = [{ ads: [{ impressions: 5000, clicks: 200, cpc: 1, engagementRate: 10 }] }];
    expect(buildJobAdSignal(posts, paidMedia).status).toBe("empty");
  });

  it("is empty with no paid media logged", () => {
    const posts = Array.from({ length: MIN_SAMPLE_SIZE }, () => jobPost(1000, 30));
    expect(buildJobAdSignal(posts, []).status).toBe("empty");
  });

  it("is empty when paid doesn't clear the outperformance bar", () => {
    // organic rate 3%, paid rate 3.2% -> ratio ~1.07, under the 1.15 minimum
    const posts = Array.from({ length: MIN_SAMPLE_SIZE }, () => jobPost(1000, 30));
    const paidMedia = [{ ads: [{ impressions: 5000, clicks: 100, cpc: 1, engagementRate: 3.2 }] }];
    expect(buildJobAdSignal(posts, paidMedia).status).toBe("empty");
  });

  it("recommends a boost when paid clearly outperforms organic, with weight scaling to the gap", () => {
    // organic rate 3%, paid rate 6% -> ratio 2 -> full weight
    const posts = Array.from({ length: MIN_SAMPLE_SIZE }, () => jobPost(1000, 30));
    const paidMedia = [{ ads: [{ impressions: 5000, clicks: 100, cpc: 1, engagementRate: 6 }] }];
    const signal = buildJobAdSignal(posts, paidMedia);
    expect(signal.status).toBe("ready");
    expect(signal.organicRate).toBeCloseTo(0.03);
    expect(signal.paidRate).toBeCloseTo(0.06);
    expect(signal.weight).toBe(1);
  });

  it("treats a dead organic rate against a live paid campaign as a full-weight signal, without dividing by zero", () => {
    const posts = Array.from({ length: MIN_SAMPLE_SIZE }, () => jobPost(1000, 0));
    const paidMedia = [{ ads: [{ impressions: 5000, clicks: 100, cpc: 1, engagementRate: 4 }] }];
    const signal = buildJobAdSignal(posts, paidMedia);
    expect(signal.status).toBe("ready");
    expect(signal.organicRate).toBe(0);
    expect(signal.weight).toBe(1);
  });
});

describe("buildWebFunnelSignal", () => {
  const web = (sessions, formSubmissions) => ({ overall: { sessions, formSubmissions } });

  it("is empty without a comparable prior quarter", () => {
    expect(buildWebFunnelSignal(web(1000, 20), null).status).toBe("empty");
  });

  it("is empty when sessions themselves are declining", () => {
    expect(buildWebFunnelSignal(web(800, 20), web(1000, 20)).status).toBe("empty");
  });

  it("is empty when forms are keeping reasonable pace with traffic", () => {
    // sessions +20%, forms +15% -> gap of 5, under the 10-point threshold
    expect(buildWebFunnelSignal(web(1200, 23), web(1000, 20)).status).toBe("empty");
  });

  it("fires when traffic grows but form submissions lag well behind, scaling weight to the gap", () => {
    // sessions +50%, forms flat -> gap 50, above the 40-point full-weight bar
    const signal = buildWebFunnelSignal(web(1500, 20), web(1000, 20));
    expect(signal.status).toBe("ready");
    expect(signal.favorLinked).toBe(true);
    expect(signal.weight).toBe(1);
    expect(signal.sessionsPct).toBeCloseTo(50);
    expect(signal.formsPct).toBeCloseTo(0);
  });
});
