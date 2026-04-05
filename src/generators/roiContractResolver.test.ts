import { describe, expect, it } from "bun:test";
import { resolveRoiContract } from "./roiContractResolver";

describe("resolveRoiContract", () => {
  it("returns a supported ROI contract with consistent KPI and status lines", () => {
    const resolved = resolveRoiContract({
      roiStatus: "supported",
      roiPct: 10,
      roiStartEquityUsd: 1_000,
      roiEndEquityUsd: 1_100
    });

    expect(resolved.roiKpiValue).toBe("10.00%");
    expect(resolved.pnlStatusLines).toEqual(["Status: supported", "Start equity: $1,000.00", "End equity: $1,100.00"]);
    expect(resolved.narrativeLines).toEqual(["ROI status: supported"]);
  });

  it("returns an unsupported ROI contract with machine-readable reason", () => {
    const resolved = resolveRoiContract({
      roiStatus: "unsupported",
      roiUnsupportedReasonCode: "equity_history_unavailable",
      roiUnsupportedReason: "equity history is unavailable"
    });

    expect(resolved.roiKpiValue).toBe("unsupported");
    expect(resolved.pnlStatusLines).toEqual([
      "Status: unsupported",
      "Code: equity_history_unavailable",
      "Reason: equity history is unavailable"
    ]);
    expect(resolved.narrativeLines).toEqual([
      "ROI status: unsupported",
      "ROI unsupported code: equity_history_unavailable",
      "ROI unsupported reason: equity history is unavailable"
    ]);
  });

  it("throws when unsupported ROI omits reason code", () => {
    expect(() =>
      resolveRoiContract({
        roiStatus: "unsupported",
        roiUnsupportedReason: "equity history is unavailable"
      })
    ).toThrow("Unsupported ROI contract must include roiUnsupportedReasonCode and roiUnsupportedReason");
  });
});
