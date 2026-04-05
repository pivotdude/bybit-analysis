import { describe, expect, it } from "bun:test";
import type { ReportDocument } from "../types/report.types";
import { JsonRenderer, JSON_REPORT_SCHEMA_VERSION } from "./JsonRenderer";

const report: ReportDocument = {
  command: "balance",
  title: "Balance Analytics",
  generatedAt: "2026-01-31T00:00:00.000Z",
  asOf: "2026-01-31T00:00:00.000Z",
  schemaVersion: "balance-markdown-v1",
  healthStatus: "ok",
  dataCompleteness: {
    state: "complete",
    partial: false,
    warnings: [],
    issues: []
  },
  sources: [
    {
      id: "wallet_snapshot",
      kind: "wallet_snapshot",
      provider: "bybit",
      exchange: "bybit",
      category: "linear",
      sourceMode: "market",
      fetchedAt: "2026-01-31T00:00:00.000Z",
      capturedAt: "2026-01-31T00:00:00.000Z",
      cacheStatus: "hit"
    }
  ],
  data: {
    snapshot: {
      totalEquityUsd: 10000,
      availableBalanceUsd: 9000
    }
  },
  sections: [
    {
      id: "balance.snapshot",
      title: "Balance Snapshot",
      type: "kpi",
      kpis: [{ label: "Total Equity", value: "$10,000.00" }]
    }
  ]
};

describe("JsonRenderer", () => {
  it("renders a versioned machine-readable report envelope", () => {
    const output = new JsonRenderer().render(report, "json");
    const payload = JSON.parse(output) as Record<string, unknown>;

    expect(payload.jsonSchemaVersion).toBe(JSON_REPORT_SCHEMA_VERSION);
    expect(payload.reportSchemaVersion).toBe(report.schemaVersion);
    expect(payload.command).toBe(report.command);
    expect(payload.title).toBe(report.title);
    expect(payload.asOf).toBe(report.asOf);
    expect(Array.isArray(payload.sources)).toBe(true);
    expect(Array.isArray(payload.sections)).toBe(true);
    expect(typeof payload.data).toBe("object");
  });

  it("keeps stable json structure for snapshots", () => {
    const output = new JsonRenderer().render(report, "json");
    expect(output).toMatchSnapshot();
  });
});
