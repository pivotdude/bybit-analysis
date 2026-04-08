import { BybitAccountService } from "./BybitAccountService";
import { BybitBotService } from "./BybitBotService";
import { createBybitClient, type BybitReadonlyClient } from "./BybitClientFactory";
import { BybitExecutionService } from "./BybitExecutionService";
import { BybitPositionService } from "./BybitPositionService";
import type { ExchangeServiceProviderFactory } from "../contracts/ExchangeServiceProvider";
import { validateBybitRequestContext } from "./bybitProviderContext";

const SMOKE_FIXTURE_MODE_ENV = "BYBIT_INTERNAL_TEST_FIXTURE_MODE";
const SMOKE_FIXTURE_MODE_VALUE = "smoke";
const SMOKE_SPOT_WALLET_BALANCE = {
  list: [
    {
      accountType: "UNIFIED",
      totalEquity: "968.77",
      totalWalletBalance: "968.77",
      totalAvailableBalance: "968.77",
      totalMarginBalance: "0",
      totalInitialMargin: "0",
      totalMaintenanceMargin: "0",
      totalPerpUPL: "0",
      coin: [
        {
          coin: "USDT",
          walletBalance: "968.65",
          availableToWithdraw: "968.65",
          usdValue: "968.65"
        },
        {
          coin: "BR",
          walletBalance: "10",
          availableToWithdraw: "10",
          usdValue: "0.10"
        },
        {
          coin: "ICNT",
          walletBalance: "1",
          availableToWithdraw: "1",
          usdValue: "0.02"
        }
      ]
    }
  ]
};
const SMOKE_SPOT_EXECUTION_WINDOW = {
  list: [
    {
      symbol: "BTCUSDT",
      side: "Sell",
      execQty: "1",
      execValue: "150",
      execPrice: "150",
      execFee: "1",
      feeCurrency: "USDT",
      execType: "Trade",
      execTime: "1714521601000"
    },
    {
      symbol: "ETHUSDC",
      side: "Sell",
      execQty: "1",
      execValue: "260",
      execPrice: "260",
      execFee: "2",
      feeCurrency: "USDC",
      execType: "Trade",
      execTime: "1714521602000"
    }
  ],
  nextPageCursor: undefined
};
const SMOKE_SPOT_OPENING_EXECUTIONS = {
  list: [
    {
      symbol: "BTCUSDT",
      side: "Buy",
      execQty: "1",
      execValue: "100",
      execPrice: "100",
      execFee: "0",
      feeCurrency: "USDT",
      execType: "Trade",
      execTime: "1714521590000"
    },
    {
      symbol: "ETHUSDC",
      side: "Buy",
      execQty: "1",
      execValue: "200",
      execPrice: "200",
      execFee: "0",
      feeCurrency: "USDC",
      execType: "Trade",
      execTime: "1714521595000"
    }
  ],
  nextPageCursor: undefined
};
const SMOKE_SPOT_GRID_DETAILS: Record<string, Record<string, unknown>> = {
  "fixture-grid-btc": {
    detail: {
      symbol: "BTCUSDT",
      base_token: "BTC",
      quote_token: "USDT",
      status: "RUNNING",
      entry_price: "100",
      current_price: "104.16",
      total_investment: "100",
      equity: "104.16",
      total_profit: "4.16",
      current_profit: "4.16",
      grid_profit: "1.93",
      current_per: "0.0416"
    }
  },
  "fixture-grid-eth": {
    detail: {
      symbol: "ETHUSDT",
      base_token: "ETH",
      quote_token: "USDT",
      status: "RUNNING",
      entry_price: "200",
      current_price: "209.10",
      total_investment: "127",
      equity: "136.10",
      total_profit: "9.10",
      current_profit: "9.10",
      grid_profit: "8.62",
      current_per: "0.0717"
    }
  }
};

function createSmokeFixtureClient(): BybitReadonlyClient {
  return {
    getServerTime: async () => ({
      timeNano: "1714521600000000000",
      timeSecond: "1714521600"
    }),
    getApiKeyInfo: async () => ({
      apiKey: "fixture-api-key",
      readOnly: "1",
      ips: [],
      permissions: {}
    }),
    getWalletBalance: async () => SMOKE_SPOT_WALLET_BALANCE,
    getPositions: async () => ({ list: [], nextPageCursor: undefined }),
    getClosedPnl: async () => ({ list: [], nextPageCursor: undefined }),
    getExecutionList: async (
      _category: string,
      _from: string,
      _to: string,
      _cursor?: string,
      _timeoutMs?: number,
      symbol?: string
    ) => {
      if (!symbol) {
        return SMOKE_SPOT_EXECUTION_WINDOW;
      }

      return {
        list: SMOKE_SPOT_OPENING_EXECUTIONS.list.filter((row) => String(row.symbol ?? "").toUpperCase() === symbol),
        nextPageCursor: undefined
      };
    },
    getFuturesGridBotDetail: async (botId: string) => ({
      detail: {
        symbol: `FUTURES-${botId}`,
        status: "STOPPED",
        total_investment: "0",
        equity: "0",
        total_profit: "0",
        current_profit: "0"
      }
    }),
    getSpotGridBotDetail: async (gridId: string) => SMOKE_SPOT_GRID_DETAILS[gridId] ?? SMOKE_SPOT_GRID_DETAILS["fixture-grid-btc"]
  } as unknown as BybitReadonlyClient;
}

function createReadonlyClient(config: Parameters<typeof createBybitClient>[0]): BybitReadonlyClient {
  if (process.env[SMOKE_FIXTURE_MODE_ENV] === SMOKE_FIXTURE_MODE_VALUE) {
    return createSmokeFixtureClient();
  }

  return createBybitClient(config);
}

export const bybitServiceProviderFactory: ExchangeServiceProviderFactory = {
  id: "bybit",
  create(config, cache) {
    const client = createReadonlyClient(config);
    const botService = new BybitBotService(client, cache);
    const positionService = new BybitPositionService(client, cache, {
      maxPages: config.pagination.positionsMaxPages,
      limitMode: config.pagination.limitMode
    });
    const accountService = new BybitAccountService(client, cache);
    const executionService = new BybitExecutionService(client, botService, cache, {
      maxPagesPerChunk: config.pagination.executionsMaxPagesPerChunk,
      limitMode: config.pagination.limitMode
    });

    return {
      accountService,
      positionService,
      executionService,
      botService,
      capabilities: {
        supportedMarketCategories: ["linear", "spot"],
        supportedSourceModes: ["market", "bot"],
        botData: true
      },
      validateRequestContext: validateBybitRequestContext
    };
  }
};
