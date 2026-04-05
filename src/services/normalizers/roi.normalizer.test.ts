import { describe, expect, it } from "bun:test";
import { normalizeRoi } from "./roi.normalizer";

describe("normalizeRoi", () => {
  it("computes supported ROI using decimal-safe arithmetic", () => {
    const roi = normalizeRoi({
      equityStartUsd: 0.1,
      equityEndUsd: 0.3
    });

    expect(roi.roiStatus).toBe("supported");
    expect(roi.roiPct).toBe(200);
  });
});
