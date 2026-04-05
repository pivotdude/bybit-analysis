export type MarketCategory = "linear" | "spot";
export type IntegrationMode = "market" | "bot";
export type PositionSide = "long" | "short";
export type MarginMode = "cross" | "isolated";
export type RiskBand = "low" | "medium" | "high";
export type DataSource = "bybit" | "freqtrade" | "portfolio";
export type PriceSource = "mark" | "last" | "index";
export type ExchangeId = "bybit" | (string & {});

export interface AccountSnapshot {
  source: DataSource;
  exchange: ExchangeId;
  category: MarketCategory;
  capturedAt: string;
  accountId?: string;
  totalEquityUsd: number;
  walletBalanceUsd: number;
  availableBalanceUsd: number;
  marginBalanceUsd?: number;
  totalInitialMarginUsd?: number;
  totalMaintenanceMarginUsd?: number;
  unrealizedPnlUsd: number;
  equityHistory?: EquitySnapshot[];
  positions: Position[];
  balances: AssetBalance[];
  botCapital?: BotCapitalBalance[];
  dataCompleteness: DataCompleteness;
}

export interface EquitySnapshot {
  timestamp: string;
  totalEquityUsd: number;
  totalExposureUsd: number;
  grossExposureUsd: number;
  netExposureUsd: number;
}

export interface AssetBalance {
  asset: string;
  walletBalance: number;
  availableBalance: number;
  usdValue: number;
}

export interface BotCapitalBalance {
  asset: string;
  allocatedCapitalUsd: number;
  availableBalanceUsd: number;
  equityUsd: number;
}

export interface Position {
  source: DataSource;
  exchange: ExchangeId;
  category: MarketCategory;
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
  side: PositionSide;
  marginMode: MarginMode;
  quantity: number;
  entryPrice: number;
  valuationPrice: number;
  priceSource: PriceSource;
  notionalUsd: number;
  leverage: number;
  liquidationPrice?: number;
  unrealizedPnlUsd: number;
  initialMarginUsd?: number;
  maintenanceMarginUsd?: number;
  openedAt?: string;
  updatedAt: string;
}

export interface FeeBreakdown {
  tradingFeesUsd: number;
  fundingFeesUsd: number;
  otherFeesUsd?: number;
}

export type RoiSupportStatus = "supported" | "unsupported";
export type RoiUnsupportedReasonCode =
  | "starting_equity_unavailable"
  | "starting_equity_non_positive"
  | "ending_equity_unavailable"
  | "equity_history_unavailable"
  | "invalid_period_start_boundary"
  | "no_equity_sample_at_or_before_period_start"
  | "starting_equity_sample_invalid";

export interface RoiContract {
  roiStatus: RoiSupportStatus;
  roiUnsupportedReason?: string;
  roiUnsupportedReasonCode?: RoiUnsupportedReasonCode;
  roiStartEquityUsd?: number;
  roiEndEquityUsd?: number;
  roiPct?: number;
}

export interface SymbolPnL {
  symbol: string;
  realizedPnlUsd: number;
  unrealizedPnlUsd: number;
  netPnlUsd: number;
  tradesCount?: number;
}

export type DataCompletenessState = "complete" | "degraded";
export type DataCriticality = "critical" | "optional";
export type DataCompletenessIssueSeverity = "warning" | "critical";
export type DataCompletenessIssueCode =
  | "optional_item_failed"
  | "page_fetch_failed"
  | "pagination_limit_reached"
  | "spot_cost_basis_incomplete"
  | "unsupported_feature"
  | "invalid_request_window";
export type DataCompletenessScope =
  | "unknown"
  | "bots"
  | "positions"
  | "closed_pnl"
  | "execution_window"
  | "opening_inventory"
  | "equity_history";

export interface DataCompletenessIssue {
  code: DataCompletenessIssueCode;
  scope: DataCompletenessScope;
  severity: DataCompletenessIssueSeverity;
  criticality: DataCriticality;
  message: string;
}

export interface DataCompleteness {
  state: DataCompletenessState;
  partial: boolean;
  warnings: string[];
  issues: DataCompletenessIssue[];
}

export interface PnLReport extends RoiContract {
  source: DataSource;
  generatedAt: string;
  periodFrom: string;
  periodTo: string;
  realizedPnlUsd: number;
  unrealizedPnlUsd: number;
  fees: FeeBreakdown;
  netPnlUsd: number;
  bySymbol: SymbolPnL[];
  bestSymbols: SymbolPnL[];
  worstSymbols: SymbolPnL[];
  dataCompleteness: DataCompleteness;
}

export interface AssetExposure {
  asset: string;
  exposureUsd: number;
  exposurePct: number;
  longExposureUsd: number;
  shortExposureUsd: number;
  symbols: string[];
}

export interface ConcentrationRisk {
  top1Asset: string;
  top1Pct: number;
  top3Pct: number;
  hhi: number;
  band: RiskBand;
}

export interface ExposureReport {
  source: DataSource;
  asOf: string;
  totalExposureUsd: number;
  grossExposureUsd: number;
  netExposureUsd: number;
  longExposureUsd: number;
  shortExposureUsd: number;
  perAsset: AssetExposure[];
  concentration: ConcentrationRisk;
}

export interface LeverageUsage {
  weightedAvgLeverage: number;
  maxLeverageUsed: number;
  notionalToEquityPct: number;
}

export interface MaxPositionSize {
  symbol: string;
  notionalUsd: number;
  pctOfEquity: number;
}

export interface UnrealizedLossRisk {
  unrealizedLossUsd: number;
  unrealizedLossToEquityPct: number;
  worstPositionSymbol?: string;
  worstPositionLossUsd?: number;
}

export interface RiskAlert {
  id: string;
  ruleId?: string;
  severity: "info" | "warning" | "critical";
  message: string;
  threshold?: number;
  observed?: number;
}

export interface RiskReport {
  source: DataSource;
  asOf: string;
  leverageUsage: LeverageUsage;
  maxPositionSize: MaxPositionSize;
  unrealizedLossRisk: UnrealizedLossRisk;
  alerts: RiskAlert[];
}

export interface AlertRule<TData = unknown> {
  id: string;
  severity: "info" | "warning" | "critical";
  condition: (data: TData) => boolean;
}

export interface BotSummary {
  botId: string;
  name: string;
  botType?: "futures_grid" | "spot_grid" | "unknown";
  symbol?: string;
  baseAsset?: string;
  quoteAsset?: string;
  status: "running" | "stopped" | "unknown";
  side?: "long" | "short" | "neutral" | "unknown";
  entryPrice?: number;
  markPrice?: number;
  quantity?: number;
  leverage?: number;
  liquidationPrice?: number;
  allocatedCapitalUsd?: number;
  exposureUsd?: number;
  realizedPnlUsd?: number;
  unrealizedPnlUsd?: number;
  gridProfitUsd?: number;
  availableBalanceUsd?: number;
  equityUsd?: number;
  closeReason?: string;
  botCloseCode?: string;
  roiPct?: number;
  openPositions?: number;
}

export interface BotReport {
  source: DataSource;
  generatedAt: string;
  availability: "available" | "not_available" | "requires_scraping";
  availabilityReason?: string;
  bots: BotSummary[];
  totalAllocatedUsd?: number;
  totalBotExposureUsd?: number;
  totalBotPnlUsd?: number;
  dataCompleteness: DataCompleteness;
}
