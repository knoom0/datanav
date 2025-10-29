import "server-only";

import {
  Configuration,
  PlaidApi,
  PlaidEnvironments,
} from "plaid";
import { z } from "zod";

import { DataLoader, DataLoaderConfig, DataLoaderTokenPair } from "@/lib/data/loader";
import plaidApiSpec from "@/lib/data/loader/plaid-api-spec.json";
import type { DataRecord } from "@/lib/entities";
import logger from "@/lib/logger";
import type { DataLoaderResourceInfo } from "@/lib/types";
import { getResourceInfoFromOpenAPISpec } from "@/lib/util/openapi-utils";

export type PlaidFetchParams = {
  plaidClient: PlaidApi;
  lastSyncedAt: Date | null;
  syncContext: Record<string, any>;
};

/**
 * Zod schema for PlaidDataLoader configuration
 */
const configSchema = z.object({
  products: z.array(z.string()).min(1, "At least one product is required"),
  countryCodes: z.array(z.string()).min(1, "At least one country code is required"),
  language: z.string().min(1, "Language is required"),
  onFetch: z.function()
    .args(z.any())
    .returns(z.any()),
});

/**
 * Data loader for Plaid API
 * Handles authentication via Plaid Link and data fetching from Plaid endpoints
 */
export class PlaidDataLoader implements DataLoader {
  private accessToken: string | null = null;
  private plaidClient: PlaidApi;
  private clientName: string;
  private config: z.infer<typeof configSchema>;

  /**
   * Whether this loader should be hidden from the data loader list
   */
  static readonly isHidden = true;

  /**
   * Example configuration for PlaidDataLoader
   */
  static readonly exampleConfig = {
    products: ["transactions"],
    countryCodes: ["US"],
    language: "en",
    onFetch: "/* Custom fetch function required */",
  };

  constructor(config: DataLoaderConfig) {
    // Validate and store configuration
    this.config = configSchema.parse(config);

    // Read environment variables
    const clientId = process.env.PLAID_CLIENT_ID;
    const secret = process.env.PLAID_CLIENT_SECRET;
    const environment = process.env.PLAID_ENVIRONMENT || "sandbox";
    this.clientName = process.env.PLAID_CLIENT_NAME || "DataNav";

    if (!clientId || !secret) {
      throw new Error(
        "PlaidDataLoader requires PLAID_CLIENT_ID and PLAID_CLIENT_SECRET environment variables"
      );
    }

    // Map environment string to Plaid environment
    const envMap: Record<string, string> = {
      sandbox: PlaidEnvironments.sandbox,
      development: PlaidEnvironments.development,
      production: PlaidEnvironments.production,
    };

    const configuration = new Configuration({
      basePath: envMap[environment] || PlaidEnvironments.sandbox,
      baseOptions: {
        headers: {
          "PLAID-CLIENT-ID": clientId,
          "PLAID-SECRET": secret,
          "Plaid-Version": "2020-09-14",
        },
      },
    });

    this.plaidClient = new PlaidApi(configuration);
  }

  /**
   * Initiates Plaid Link authentication by creating a link token
   * Returns URL with link token that the frontend uses to initialize Plaid Link
   */
  async authenticate(params: { redirectTo: string; userId: string }): Promise<{ authUrl: string; success?: boolean }> {
    // Create a link token using the Plaid API
    const response = await this.plaidClient.linkTokenCreate({
      user: {
        client_user_id: params.userId,
      },
      client_name: this.clientName,
      products: this.config.products as any[],
      country_codes: this.config.countryCodes as any[],
      language: this.config.language,
      redirect_uri: params.redirectTo,
    });

    const linkToken = response.data.link_token;
    logger.info("Successfully created Plaid link token");

    // Return the link token in the authUrl
    return {
      authUrl: `plaid://?linkToken=${encodeURIComponent(linkToken)}&redirectTo=${encodeURIComponent(params.redirectTo)}`,
      success: false,
    };
  }

  /**
   * Completes authentication by exchanging a public token for an access token
   * The "code" parameter is actually the public_token from Plaid Link
   */
  async continueToAuthenticate(params: {
    code: string;
    redirectTo: string;
  }): Promise<void> {
    const publicToken = params.code;

    const response = await this.plaidClient.itemPublicTokenExchange({
      public_token: publicToken,
    });

    this.accessToken = response.data.access_token;
    logger.info("Successfully exchanged Plaid public token for access token");
  }

  getTokenPair(): DataLoaderTokenPair {
    return {
      accessToken: this.accessToken,
      refreshToken: null,
    };
  }

  setTokenPair(tokenPair: DataLoaderTokenPair): void {
    this.accessToken = tokenPair.accessToken;
    // Plaid doesn't use refresh tokens
  }

  /**
   * Gets available resource names from Plaid
   */
  async getAvailableResourceNames(): Promise<string[]> {
    // Plaid has predefined resource types
    return ["Transaction", "Account", "Balance", "Identity", "Investment"];
  }

  /**
   * Gets resource information including schema from Plaid OpenAPI spec
   */
  async getResourceInfo(resourceName: string): Promise<DataLoaderResourceInfo> {
    return getResourceInfoFromOpenAPISpec({
      openApiSpec: plaidApiSpec,
      resourceName,
      useDereference: true,
    });
  }

  /**
   * Fetches data from Plaid using the custom onFetch function
   */
  async *fetch(params: {
    resources: Array<{
      name: string;
      createdAtColumn?: string;
      updatedAtColumn?: string;
    }>;
    lastSyncedAt?: Date;
    syncContext: Record<string, any> | null;
    maxDurationToRunMs?: number;
  }): AsyncGenerator<DataRecord, { hasMore: boolean }, unknown> {
    if (!this.accessToken) {
      throw new Error("Not authenticated. Please call authenticate() first.");
    }

    const syncContext = params.syncContext || {};
    
    logger.info("Fetching data from Plaid API");

    // Store access token on the plaidClient as a custom property
    // so onFetch can access it when making requests
    (this.plaidClient as any).accessToken = this.accessToken;

    // Call the custom onFetch function
    const generator = this.config.onFetch({
      plaidClient: this.plaidClient,
      lastSyncedAt: params.lastSyncedAt || null,
      syncContext,
    });

    let recordCount = 0;
    for await (const record of generator) {
      yield record;
      recordCount++;
    }

    logger.info(`Completed fetch with ${recordCount} records`);

    return { hasMore: false };
  }
}

