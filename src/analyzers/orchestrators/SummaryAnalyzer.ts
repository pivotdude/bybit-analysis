import { BalanceAnalyzer, type BalanceAnalysis } from "./BalanceAnalyzer";
import { PnLAnalyzer, type PnLAnalysis } from "./PnLAnalyzer";
import { PositionsAnalyzer, type PositionsAnalysis } from "./PositionsAnalyzer";
import { ExposureAnalyzer } from "./ExposureAnalyzer";
import { PerformanceAnalyzer, type PerformanceAnalysis } from "./PerformanceAnalyzer";
import { RiskAnalyzer } from "./RiskAnalyzer";
import { BotsAnalyzer, type BotsAnalysis } from "./BotsAnalyzer";
import type { AccountSnapshot, BotReport, ExposureReport, PnLReport, RiskReport } from "../../types/domain.types";

export interface SummaryAnalysis {
  generatedAt: string;
  balance: BalanceAnalysis;
  pnl: PnLAnalysis;
  positions: PositionsAnalysis;
  exposure: ExposureReport;
  performance: PerformanceAnalysis;
  risk: RiskReport;
  bots?: BotsAnalysis;
}

export class SummaryAnalyzer {
  private readonly balanceAnalyzer = new BalanceAnalyzer();
  private readonly pnlAnalyzer = new PnLAnalyzer();
  private readonly positionsAnalyzer = new PositionsAnalyzer();
  private readonly exposureAnalyzer = new ExposureAnalyzer();
  private readonly performanceAnalyzer = new PerformanceAnalyzer();
  private readonly riskAnalyzer = new RiskAnalyzer();
  private readonly botsAnalyzer = new BotsAnalyzer();

  analyze(account: AccountSnapshot, pnl: PnLReport, botReport?: BotReport): SummaryAnalysis {
    const positionsAnalysis = this.positionsAnalyzer.analyze(account.positions);

    return {
      generatedAt: new Date().toISOString(),
      balance: this.balanceAnalyzer.analyze(account),
      pnl: this.pnlAnalyzer.analyze(pnl),
      positions: positionsAnalysis,
      exposure: this.exposureAnalyzer.analyze(account.positions),
      performance: this.performanceAnalyzer.analyze(account, pnl),
      risk: this.riskAnalyzer.analyze(account, account.positions),
      bots: botReport ? this.botsAnalyzer.analyze(botReport) : undefined
    };
  }
}
