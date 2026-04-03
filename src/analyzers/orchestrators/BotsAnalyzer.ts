import type { BotReport } from "../../types/domain.types";

export interface BotsAnalysis {
  availability: BotReport["availability"];
  availabilityReason?: string;
  bots: BotReport["bots"];
  totalAllocatedUsd: number;
  totalBotExposureUsd: number;
  totalBotPnlUsd: number;
}

export class BotsAnalyzer {
  analyze(report: BotReport): BotsAnalysis {
    const totalAllocatedUsd = report.totalAllocatedUsd ?? 0;
    const totalBotExposureUsd = report.totalBotExposureUsd ?? 0;
    const totalBotPnlUsd = report.totalBotPnlUsd ?? 0;

    return {
      availability: report.availability,
      availabilityReason: report.availabilityReason,
      bots: report.bots,
      totalAllocatedUsd,
      totalBotExposureUsd,
      totalBotPnlUsd
    };
  }
}
