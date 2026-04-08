import type { ReportSectionType } from "../../types/report.types"

export const SUMMARY_SECTION_CONTRACT = {
  contract: { id: "summary.contract", title: "Summary Context", type: "text" },
  overview: { id: "summary.overview", title: "Overview", type: "kpi" },
  activity: { id: "summary.activity", title: "Activity", type: "kpi" },
  allocation: { id: "summary.allocation", title: "Allocation", type: "kpi" },
  exposure: { id: "summary.exposure", title: "Exposure", type: "kpi" },
  risk: { id: "summary.risk", title: "Risk", type: "kpi" },
  positions: { id: "summary.open_positions", title: "Open Positions", type: "table" },
  holdings: { id: "summary.top_holdings", title: "Top Holdings", type: "table" },
  symbolPnl: { id: "summary.symbol_pnl", title: "Symbol PnL", type: "table" },
  bots: { id: "summary.bots", title: "Bots", type: "table" },
  alerts: { id: "summary.alerts", title: "Alerts", type: "alerts" },
  dataCompleteness: {
    id: "summary.data_completeness",
    title: "Data Completeness",
    type: "alerts"
  }
} as const satisfies Record<string, { id: string; title: string; type: ReportSectionType }>

export const SUMMARY_SECTION_ORDER = [
  "contract",
  "overview",
  "activity",
  "allocation",
  "exposure",
  "risk",
  "positions",
  "holdings",
  "symbolPnl",
  "bots",
  "alerts",
  "dataCompleteness"
] as const satisfies readonly (keyof typeof SUMMARY_SECTION_CONTRACT)[]
