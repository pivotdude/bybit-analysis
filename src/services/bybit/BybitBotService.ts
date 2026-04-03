import type { BotDataService } from "../contracts/BotDataService";
import type { ServiceRequestContext } from "../contracts/AccountDataService";
import { normalizeBotReport } from "../normalizers/bot.normalizer";
import type { BotReport } from "../../types/domain.types";

export class BybitBotService implements BotDataService {
  async getBotReport(_context: ServiceRequestContext): Promise<BotReport> {
    return normalizeBotReport();
  }
}
