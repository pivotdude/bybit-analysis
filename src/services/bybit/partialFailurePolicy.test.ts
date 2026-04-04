import { describe, expect, it } from "bun:test";
import { BYBIT_PARTIAL_FAILURE_POLICY } from "./partialFailurePolicy";

describe("BYBIT_PARTIAL_FAILURE_POLICY", () => {
  it("defines partial-failure behavior for each supported data type", () => {
    expect(BYBIT_PARTIAL_FAILURE_POLICY.bot_detail).toBeDefined();
    expect(BYBIT_PARTIAL_FAILURE_POLICY.positions).toBeDefined();
    expect(BYBIT_PARTIAL_FAILURE_POLICY.closed_pnl).toBeDefined();
    expect(BYBIT_PARTIAL_FAILURE_POLICY.execution_window).toBeDefined();
    expect(BYBIT_PARTIAL_FAILURE_POLICY.opening_inventory).toBeDefined();
  });
});
