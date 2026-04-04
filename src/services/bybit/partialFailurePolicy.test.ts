import { describe, expect, it } from "bun:test";
import { BYBIT_PARTIAL_FAILURE_POLICY, buildPageFetchIssue } from "./partialFailurePolicy";

describe("BYBIT_PARTIAL_FAILURE_POLICY", () => {
  it("defines partial-failure behavior for each supported data type", () => {
    expect(BYBIT_PARTIAL_FAILURE_POLICY.bot_detail).toBeDefined();
    expect(BYBIT_PARTIAL_FAILURE_POLICY.positions).toBeDefined();
    expect(BYBIT_PARTIAL_FAILURE_POLICY.closed_pnl).toBeDefined();
    expect(BYBIT_PARTIAL_FAILURE_POLICY.execution_window).toBeDefined();
    expect(BYBIT_PARTIAL_FAILURE_POLICY.opening_inventory).toBeDefined();
  });
});

describe("buildPageFetchIssue", () => {
  it("falls back to one attempt when retry metadata is absent", () => {
    const issue = buildPageFetchIssue({
      scope: "positions",
      criticality: "critical",
      page: 1,
      error: new Error("timeout")
    });

    expect(issue.message).toContain("after 1 attempt");
  });

  it("uses attempts from retry metadata when available", () => {
    const issue = buildPageFetchIssue({
      scope: "closed_pnl",
      criticality: "critical",
      page: 2,
      cursor: "abc",
      error: Object.assign(new Error("too many requests"), {
        retryInfo: { attempts: 4 }
      })
    });

    expect(issue.message).toContain("after 4 attempts");
    expect(issue.message).toContain("cursor=abc");
  });
});
