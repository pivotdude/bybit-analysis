export const cacheKeys = {
  walletBalance: (category: string) => `wallet:${category}`,
  positions: (category: string) => `positions:${category}`,
  closedPnl: (category: string, from: string, to: string, cursor = "") => `closed-pnl:${category}:${from}:${to}:${cursor}`,
  serverTime: () => "server-time"
};
