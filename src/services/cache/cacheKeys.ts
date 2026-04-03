export const cacheKeys = {
  walletBalance: (category: string) => `wallet:${category}`,
  positions: (category: string) => `positions:${category}`,
  closedPnl: (category: string, from: string, to: string, cursor = "") => `closed-pnl:${category}:${from}:${to}:${cursor}`,
  executionHistory: (category: string, from: string, to: string, cursor = "") => `execution-history:${category}:${from}:${to}:${cursor}`,
  futuresGridBotDetail: (botId: string) => `bot:fgrid:detail:${botId}`,
  spotGridBotDetail: (botId: string) => `bot:sgrid:detail:${botId}`,
  botReport: (fgridBotIds: string[], spotGridBotIds: string[]) =>
    `bot:report:${fgridBotIds.join(",")}::${spotGridBotIds.join(",")}`,
  apiKeyInfo: () => "user:api-key-info",
  serverTime: () => "server-time"
};
