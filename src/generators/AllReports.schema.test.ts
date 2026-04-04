import { describe, expect, it } from "bun:test";
import type { ReportDocument, ReportSectionType } from "../types/report.types";
import type { ServiceRequestContext } from "../services/contracts/AccountDataService";
import type { AccountDataService } from "../services/contracts/AccountDataService";
import type { ExecutionDataService } from "../services/contracts/ExecutionDataService";
import type { PositionDataService } from "../services/contracts/PositionDataService";
import type { BotDataService } from "../services/contracts/BotDataService";
import type { RuntimeConfig } from "../types/config.types";
import { completeDataCompleteness, degradedDataCompleteness } from "../services/reliability/dataCompleteness";
import {
  SummaryReportGenerator,
  SUMMARY_SCHEMA_VERSION,
  SUMMARY_SECTION_CONTRACT,
  SUMMARY_SECTION_ORDER
} from "./SummaryReportGenerator";
import {
  BalanceReportGenerator,
  BALANCE_SCHEMA_VERSION,
  BALANCE_SECTION_CONTRACT,
  BALANCE_SECTION_ORDER
} from "./BalanceReportGenerator";
import {
  PnLReportGenerator,
  PNL_SCHEMA_VERSION,
  PNL_SECTION_CONTRACT,
  PNL_SECTION_ORDER
} from "./PnLReportGenerator";
import {
  PositionsReportGenerator,
  POSITIONS_SCHEMA_VERSION,
  POSITIONS_SECTION_CONTRACT,
  POSITIONS_SECTION_ORDER
} from "./PositionsReportGenerator";
import {
  ExposureReportGenerator,
  EXPOSURE_SCHEMA_VERSION,
  EXPOSURE_SECTION_CONTRACT,
  EXPOSURE_SECTION_ORDER
} from "./ExposureReportGenerator";
import {
  PerformanceReportGenerator,
  PERFORMANCE_SCHEMA_VERSION,
  PERFORMANCE_SECTION_CONTRACT,
  PERFORMANCE_SECTION_ORDER
} from "./PerformanceReportGenerator";
import {
  RiskReportGenerator,
  RISK_SCHEMA_VERSION,
  RISK_SECTION_CONTRACT,
  RISK_SECTION_ORDER
} from "./RiskReportGenerator";
import {
  BotsReportGenerator,
  BOTS_SCHEMA_VERSION,
  BOTS_SECTION_CONTRACT,
  BOTS_SECTION_ORDER
} from "./BotsReportGenerator";
import {
  PermissionsReportGenerator,
  PERMISSIONS_SCHEMA_VERSION,
  PERMISSIONS_SECTION_CONTRACT,
  PERMISSIONS_SECTION_ORDER
} from "./PermissionsReportGenerator";
import {
  ConfigReportGenerator,
  CONFIG_SCHEMA_VERSION,
  CONFIG_SECTION_CONTRACT,
  CONFIG_SECTION_ORDER
} from "./ConfigReportGenerator";
import {
  HealthReportGenerator,
  HEALTH_SCHEMA_VERSION,
  HEALTH_SECTION_CONTRACT,
  HEALTH_SECTION_ORDER
} from "./HealthReportGenerator";

const context: ServiceRequestContext = {
  category: "linear",
  sourceMode: "market",
  providerContext: { bybit: { botStrategyIds: { futuresGridBotIds: [], spotGridBotIds: [] } } },
  from: "2026-01-01T00:00:00.000Z",
  to: "2026-01-31T00:00:00.000Z",
  timeoutMs: 5_000
};

const samplePosition = {
  source: "bybit" as const,
  exchange: "bybit" as const,
  category: "linear" as const,
  symbol: "BTCUSDT",
  baseAsset: "BTC",
  quoteAsset: "USDT",
  side: "long" as const,
  marginMode: "cross" as const,
  quantity: 0.1,
  entryPrice: 40_000,
  valuationPrice: 41_000,
  priceSource: "mark" as const,
  notionalUsd: 4_100,
  leverage: 2,
  unrealizedPnlUsd: 100,
  updatedAt: "2026-01-31T00:00:00.000Z"
};

const accountService: AccountDataService = {
  getAccountSnapshot: async (requestContext) => ({
    source: "bybit",
    exchange: "bybit",
    category: requestContext.category,
    capturedAt: "2026-01-31T00:00:00.000Z",
    totalEquityUsd: 10_000,
    walletBalanceUsd: 9_900,
    availableBalanceUsd: 8_000,
    unrealizedPnlUsd: 100,
    positions: requestContext.category === "spot" ? [] : [samplePosition],
    balances: [
      { asset: "USDT", walletBalance: 9_000, availableBalance: 8_000, usdValue: 9_000 },
      { asset: "BTC", walletBalance: 0.02, availableBalance: 0.01, usdValue: 1_000 }
    ],
    dataCompleteness: degradedDataCompleteness([
      {
        code: "pagination_limit_reached",
        scope: "positions",
        severity: "warning",
        criticality: "critical",
        message: "Position pagination limit reached"
      }
    ])
  }),
  checkHealth: async () => ({
    connectivity: "ok",
    auth: "ok",
    latencyMs: 12,
    diagnostics: []
  }),
  getApiKeyPermissionInfo: async () => ({
    apiKeyStatus: "present",
    apiKeyDisplay: "<redacted>",
    readOnly: true,
    ipWhitelistRestricted: false,
    ipWhitelistCount: 0,
    ipWhitelistDisplay: "not configured",
    permissions: {}
  })
};

const executionService: ExecutionDataService = {
  getPnlReport: async (request) => ({
    source: "bybit",
    generatedAt: "2026-01-31T00:00:00.000Z",
    periodFrom: request.context.from,
    periodTo: request.context.to,
    realizedPnlUsd: 120,
    unrealizedPnlUsd: 100,
    fees: {
      tradingFeesUsd: 6,
      fundingFeesUsd: 0
    },
    netPnlUsd: 114,
    roiStatus: "unsupported",
    roiUnsupportedReason: "starting equity is unavailable for the requested period window",
    roiUnsupportedReasonCode: "equity_history_unavailable",
    roiStartEquityUsd: undefined,
    roiEndEquityUsd: 10_000,
    bySymbol: [],
    bestSymbols: [],
    worstSymbols: [],
    dataCompleteness: degradedDataCompleteness([
      {
        code: "pagination_limit_reached",
        scope: "execution_window",
        severity: "warning",
        criticality: "critical",
        message: "Execution pagination limit reached"
      }
    ])
  })
};

const positionService: PositionDataService = {
  getOpenPositions: async () => ({
    source: "bybit",
    exchange: "bybit",
    positions: [samplePosition],
    dataCompleteness: completeDataCompleteness()
  })
};

const emptyPositionService: PositionDataService = {
  getOpenPositions: async () => ({
    source: "bybit",
    exchange: "bybit",
    positions: [],
    dataCompleteness: completeDataCompleteness()
  })
};

const botService: BotDataService = {
  getBotReport: async () => ({
    source: "bybit",
    generatedAt: "2026-01-31T00:00:00.000Z",
    availability: "not_available",
    availabilityReason: "Bot API not configured",
    bots: [],
    dataCompleteness: completeDataCompleteness()
  })
};

const runtimeConfig: RuntimeConfig = {
  apiKey: "test-key",
  apiSecret: "test-secret",
  category: "linear",
  sourceMode: "market",
  providerContext: { bybit: { botStrategyIds: { futuresGridBotIds: [], spotGridBotIds: [] } } },
  format: "md",
  timeoutMs: 5_000,
  timeRange: {
    from: "2026-01-01T00:00:00.000Z",
    to: "2026-01-31T00:00:00.000Z"
  },
  pagination: {
    limitMode: "partial"
  },
  sources: {
    profile: "default",
    profilesFile: "default",
    apiKey: "cli",
    apiSecret: "cli",
    category: "cli",
    sourceMode: "cli",
    providerContext: "cli",
    format: "cli",
    timeoutMs: "cli",
    timeRange: "cli",
    positionsMaxPages: "default",
    executionsMaxPagesPerChunk: "default",
    paginationLimitMode: "default"
  },
  ambientEnv: {
    enabled: false,
    source: "cli",
    usedVars: []
  },
  configReportMode: "safe"
};

function assertSectionContract<TKey extends string>(
  report: ReportDocument,
  schemaVersion: string,
  contract: Record<TKey, { id: string; title: string; type: ReportSectionType }>,
  order: readonly TKey[]
): void {
  expect(report.schemaVersion).toBe(schemaVersion);

  const actualShape = report.sections.map((section) => ({ id: section.id, type: section.type }));
  const expectedShape = order.map((key) => {
    const section = contract[key]!;
    return { id: section.id, type: section.type };
  });

  expect(actualShape).toEqual(expectedShape);
  expect(new Set(report.sections.map((section) => section.id)).size).toBe(report.sections.length);
  expect(report.sections.every((section) => section.id.length > 0)).toBe(true);

  for (const key of order) {
    const expected = contract[key]!;
    const section = report.sections.find((item) => item.id === expected.id);
    expect(section?.title).toBe(expected.title);
    expect(section?.type).toBe(expected.type);
  }
}

describe("All report schema contracts", () => {
  it("enforces fixed schema version and section contract for every command", async () => {
    const summary = await new SummaryReportGenerator(accountService, executionService, botService).generate(context);
    const balance = await new BalanceReportGenerator(accountService).generate(context);
    const pnl = await new PnLReportGenerator(executionService, accountService).generate(context);
    const positions = await new PositionsReportGenerator(positionService).generate(context);
    const exposure = await new ExposureReportGenerator(positionService).generate(context);
    const performance = await new PerformanceReportGenerator(accountService, executionService).generate(context);
    const risk = await new RiskReportGenerator(accountService).generate(context);
    const bots = await new BotsReportGenerator(botService).generate(context);
    const permissions = await new PermissionsReportGenerator(accountService).generate(context);
    const config = new ConfigReportGenerator().generate(runtimeConfig);
    const health = await new HealthReportGenerator(accountService).generate(context);

    assertSectionContract(summary, SUMMARY_SCHEMA_VERSION, SUMMARY_SECTION_CONTRACT, SUMMARY_SECTION_ORDER);
    assertSectionContract(balance, BALANCE_SCHEMA_VERSION, BALANCE_SECTION_CONTRACT, BALANCE_SECTION_ORDER);
    assertSectionContract(pnl, PNL_SCHEMA_VERSION, PNL_SECTION_CONTRACT, PNL_SECTION_ORDER);
    assertSectionContract(positions, POSITIONS_SCHEMA_VERSION, POSITIONS_SECTION_CONTRACT, POSITIONS_SECTION_ORDER);
    assertSectionContract(exposure, EXPOSURE_SCHEMA_VERSION, EXPOSURE_SECTION_CONTRACT, EXPOSURE_SECTION_ORDER);
    assertSectionContract(
      performance,
      PERFORMANCE_SCHEMA_VERSION,
      PERFORMANCE_SECTION_CONTRACT,
      PERFORMANCE_SECTION_ORDER
    );
    assertSectionContract(risk, RISK_SCHEMA_VERSION, RISK_SECTION_CONTRACT, RISK_SECTION_ORDER);
    assertSectionContract(bots, BOTS_SCHEMA_VERSION, BOTS_SECTION_CONTRACT, BOTS_SECTION_ORDER);
    assertSectionContract(
      permissions,
      PERMISSIONS_SCHEMA_VERSION,
      PERMISSIONS_SECTION_CONTRACT,
      PERMISSIONS_SECTION_ORDER
    );
    assertSectionContract(config, CONFIG_SCHEMA_VERSION, CONFIG_SECTION_CONTRACT, CONFIG_SECTION_ORDER);
    assertSectionContract(health, HEALTH_SCHEMA_VERSION, HEALTH_SECTION_CONTRACT, HEALTH_SECTION_ORDER);
  });

  it("keeps fixed positions section shape when there are zero positions", async () => {
    const populated = await new PositionsReportGenerator(positionService).generate(context);
    const empty = await new PositionsReportGenerator(emptyPositionService).generate(context);

    const populatedShape = populated.sections.map((section) => ({ id: section.id, type: section.type }));
    const emptyShape = empty.sections.map((section) => ({ id: section.id, type: section.type }));

    expect(emptyShape).toEqual(populatedShape);

    const alerts = empty.sections.find((section) => section.id === POSITIONS_SECTION_CONTRACT.alerts.id);
    expect(alerts?.type).toBe("alerts");
    expect(alerts && alerts.type === "alerts" ? alerts.alerts[0]?.message : undefined).toBe(
      "No active position alerts"
    );
  });
});
