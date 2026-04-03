import type { AccountSnapshot, Position, RiskAlert, RiskReport } from "../../types/domain.types";
import { calculateLeverageUsage } from "../metrics/risk/leverageUsage.metric";
import { calculateMaxPositionSize } from "../metrics/risk/maxPositionSize.metric";
import { calculateUnrealizedLossRisk } from "../metrics/risk/unrealizedLossRisk.metric";

function buildAlerts(account: AccountSnapshot, positions: Position[], report: Omit<RiskReport, "source" | "asOf" | "alerts">): RiskAlert[] {
  const alerts: RiskAlert[] = [];

  if (report.leverageUsage.notionalToEquityPct >= 350) {
    alerts.push({
      id: "risk.notional_to_equity.high",
      severity: "critical",
      message: "Gross exposure exceeds 350% of equity",
      threshold: 350,
      observed: report.leverageUsage.notionalToEquityPct
    });
  } else if (report.leverageUsage.notionalToEquityPct >= 200) {
    alerts.push({
      id: "risk.notional_to_equity.medium",
      severity: "warning",
      message: "Gross exposure exceeds 200% of equity",
      threshold: 200,
      observed: report.leverageUsage.notionalToEquityPct
    });
  }

  if (report.maxPositionSize.pctOfEquity >= 35) {
    alerts.push({
      id: "risk.max_position_size.high",
      severity: "warning",
      message: "Largest position exceeds 35% of equity",
      threshold: 35,
      observed: report.maxPositionSize.pctOfEquity
    });
  }

  if (report.unrealizedLossRisk.unrealizedLossToEquityPct >= 20) {
    alerts.push({
      id: "risk.unrealized_loss.critical",
      severity: "critical",
      message: "Unrealized losses exceed 20% of equity",
      threshold: 20,
      observed: report.unrealizedLossRisk.unrealizedLossToEquityPct
    });
  }

  const priceSources = new Set(positions.map((position) => position.priceSource));
  if (priceSources.size > 1) {
    alerts.push({
      id: "risk.price_source.mixed",
      severity: "warning",
      message: `Mixed price sources detected in positions: ${Array.from(priceSources).join(", ")}`
    });
  }

  if (account.totalEquityUsd <= 0) {
    alerts.push({
      id: "risk.equity.non_positive",
      severity: "critical",
      message: "Total equity is non-positive"
    });
  }

  return alerts;
}

export class RiskAnalyzer {
  analyze(account: AccountSnapshot, positions: Position[]): RiskReport {
    const leverageUsage = calculateLeverageUsage(positions, account.totalEquityUsd);
    const maxPositionSize = calculateMaxPositionSize(positions, account.totalEquityUsd);
    const unrealizedLossRisk = calculateUnrealizedLossRisk(positions, account.totalEquityUsd);

    const core = {
      leverageUsage,
      maxPositionSize,
      unrealizedLossRisk
    };

    return {
      source: "bybit",
      asOf: new Date().toISOString(),
      ...core,
      alerts: buildAlerts(account, positions, core)
    };
  }
}
