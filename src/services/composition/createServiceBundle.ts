import type { RuntimeConfig } from "../../types/config.types";
import type { ExchangeId } from "../../types/domain.types";
import type { CacheStore } from "../cache/CacheStore";
import type { ExchangeServiceProviderFactory, ServiceBundle } from "../contracts/ExchangeServiceProvider";
import { bybitServiceProviderFactory } from "../bybit/createBybitServices";

export const DEFAULT_EXCHANGE_PROVIDER_ID = "bybit" as const;

const providers: Record<string, ExchangeServiceProviderFactory> = {
  [bybitServiceProviderFactory.id]: bybitServiceProviderFactory
};

export function createServiceBundle(
  config: RuntimeConfig,
  cache: CacheStore,
  exchangeProviderId: ExchangeId = DEFAULT_EXCHANGE_PROVIDER_ID
): ServiceBundle {
  const provider = providers[exchangeProviderId];
  if (!provider) {
    throw new Error(`Unsupported exchange provider: ${exchangeProviderId}`);
  }
  return provider.create(config, cache);
}
