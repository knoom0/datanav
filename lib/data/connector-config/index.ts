import { DataConnectorConfig } from "@/lib/data/connector";
import gmailConfig from "@/lib/data/connector-config/gmail/config";
import googleCalendarConfig from "@/lib/data/connector-config/google-calendar/config";
import plaidConfig from "@/lib/data/connector-config/plaid/config";
import youtubeConfig from "@/lib/data/connector-config/youtube/config";

export const dataConnectorConfigs: DataConnectorConfig[] = [
  googleCalendarConfig,
  gmailConfig,
  plaidConfig,
  youtubeConfig,
];
