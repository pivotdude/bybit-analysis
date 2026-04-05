import type { AccountSnapshot, LiveAccountSnapshot } from "../../types/domain.types";
import type { PositionDataResult } from "./PositionDataService";
import { mergeDataCompleteness } from "../reliability/dataCompleteness";

export function composeAccountSnapshot(
  walletSnapshot: LiveAccountSnapshot,
  positionsResult: PositionDataResult
): AccountSnapshot {
  return {
    ...walletSnapshot,
    positions: positionsResult.positions,
    dataCompleteness: mergeDataCompleteness(walletSnapshot.dataCompleteness, positionsResult.dataCompleteness)
  };
}
