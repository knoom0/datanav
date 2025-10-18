import SwaggerParser from "@apidevtools/swagger-parser";
import { google } from "googleapis";
import { OpenAPIV3 } from "openapi-types";

import { DataLoader, DataLoaderConfig, DataLoaderResourceInfo } from "@/lib/data/loader";
import logger from "@/lib/logger";
import { mergeAllOfSchemas } from "@/lib/util/openapi-utils";

// Maximum number of days to look back when fetching records on first load with createdAtColumn
export const MAX_LOOKBACK_DAYS = 365;

// Type-only import to avoid importing server-only module in tests
type DataRecord = {
  resourceName: string;
  [key: string]: any;
};

export type GoogleAPIFetchParams = {
  auth: any; // OAuth2 client from googleapis
  lastSyncedAt: Date | null;
  syncContext: Record<string, any>;
};

export class GoogleAPIDataLoader implements DataLoader {
  private accessToken: string | null = null;
  private refreshToken: string | null = null;
  private scopes: string[];
  private onFetch: (params: GoogleAPIFetchParams) => AsyncGenerator<DataRecord, { hasMore: boolean }, unknown>;
  readonly openApiSpec?: string | object;

  /**
   * Whether this loader should be hidden from the data loader list
   */
  static readonly isHidden = true;

  /**
   * Example configuration for GoogleAPIDataLoader
   */
  static readonly exampleConfig = {
    scopes: ["https://www.googleapis.com/auth/gmail.readonly"],
    openApiSpec: "/* Optional OpenAPI spec (string or object) */",
    onFetch: "/* Custom fetch function required */"
  };

  constructor(config: DataLoaderConfig) {
    this.scopes = config.scopes as string[];
    this.onFetch = config.onFetch as (params: GoogleAPIFetchParams) => AsyncGenerator<DataRecord, { hasMore: boolean }, unknown>;
    this.openApiSpec = config.openApiSpec as string | object | undefined;
    
    if (!this.scopes || !Array.isArray(this.scopes)) {
      throw new Error("GoogleAPIDataLoader requires 'scopes' array in config");
    }
    if (!this.onFetch || typeof this.onFetch !== "function") {
      throw new Error("GoogleAPIDataLoader requires 'onFetch' function in config");
    }
  }

  getAccessToken(): string | null {
    return this.accessToken;
  }

  getRefreshToken(): string | null {
    return this.refreshToken;
  }

  setAccessToken(token: string): void {
    this.accessToken = token;
  }

  setRefreshToken(token: string): void {
    this.refreshToken = token;
  }

  /**
   * Gets the list of all available resource names from the OpenAPI spec
   * @returns Promise resolving to array of resource names from components.schemas
   */
  async getAvailableResourceNames(): Promise<string[]> {
    if (!this.openApiSpec) {
      throw new Error("No OpenAPI spec available. Cannot enumerate resources.");
    }

    // Parse the OpenAPI spec
    const api = await SwaggerParser.parse(this.openApiSpec as any) as OpenAPIV3.Document;
    
    // Extract schema names from components.schemas
    if (!api.components?.schemas) {
      return [];
    }

    return Object.keys(api.components.schemas);
  }

  /**
   * Gets detailed information about a specific resource from the OpenAPI spec
   * @param resourceName - The name of the resource (schema name)
   * @returns Promise resolving to detailed resource information
   */
  async getResourceInfo(resourceName: string): Promise<DataLoaderResourceInfo> {
    if (!this.openApiSpec) {
      throw new Error("No OpenAPI spec available. Cannot get resource information.");
    }

    // Parse the OpenAPI spec
    const api = await SwaggerParser.parse(this.openApiSpec as any) as OpenAPIV3.Document;
    
    const schema = api.components?.schemas?.[resourceName] as OpenAPIV3.SchemaObject;
    if (!schema) {
      throw new Error(`Schema ${resourceName} not found in OpenAPI spec`);
    }

    // Merge allOf schemas if present
    const mergedSchema = mergeAllOfSchemas(schema);
    
    // Extract column names from properties
    const columns: string[] = [];
    const timestampColumns: string[] = [];
    
    if (mergedSchema.properties) {
      for (const [propName, propSchema] of Object.entries(mergedSchema.properties)) {
        columns.push(propName);
        
        // Check if this is a timestamp field
        const prop = propSchema as OpenAPIV3.SchemaObject;
        if (prop.type === "string" && (prop.format === "date-time" || prop.format === "date")) {
          timestampColumns.push(propName);
        }
      }
    }

    return {
      name: resourceName,
      schema: mergedSchema,
      columns,
      timestampColumns,
      // Record count is not available from OpenAPI spec
      recordCount: undefined
    };
  }

  authenticate({ redirectTo }: { redirectTo: string }): { authUrl: string } {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    
    if (!clientId) {
      throw new Error("Google OAuth configuration missing. Please set GOOGLE_CLIENT_ID environment variable.");
    }

    const scopes = this.scopes.join(" ");
    const authUrl = "https://accounts.google.com/o/oauth2/v2/auth?" +
      `client_id=${encodeURIComponent(clientId)}&` +
      `redirect_uri=${encodeURIComponent(redirectTo)}&` +
      "response_type=code&" +
      `scope=${encodeURIComponent(scopes)}&` +
      "access_type=offline&" +
      "prompt=consent";

    return { authUrl };
  }

  async continueToAuthenticate({ code, redirectTo }: { code: string; redirectTo: string }): Promise<void> {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      throw new Error("Google OAuth configuration missing. Please set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET environment variables.");
    }

    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        grant_type: "authorization_code",
        redirect_uri: redirectTo,
      }),
    });

    if (!tokenResponse.ok) {
      const error = await tokenResponse.text();
      throw new Error(`Failed to exchange code for token: ${error}`);
    }

    const tokenData = await tokenResponse.json();
    this.accessToken = tokenData.access_token;
    if (tokenData.refresh_token) {
      this.refreshToken = tokenData.refresh_token;
    }
    logger.info("Successfully obtained access token and refresh token");
  }


  async *fetch(params: { 
    resources: Array<{ name: string; createdAtColumn?: string; updatedAtColumn?: string }>;
    lastSyncedAt?: Date; 
    syncContext: Record<string, any> | null;
    maxDurationToRunMs?: number;
  }): AsyncGenerator<DataRecord, { hasMore: boolean }, unknown> {
    if (!this.accessToken) {
      throw new Error("No access token available. Please authenticate first.");
    }

    logger.info("Fetching data from Google API");

    // Create OAuth2 client using googleapis
    const auth = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET
    );
    
    auth.setCredentials({
      access_token: this.accessToken,
      refresh_token: this.refreshToken,
    });

    const endTime = params.maxDurationToRunMs ? Date.now() + params.maxDurationToRunMs : Infinity;
    let hasMore = true;
    let recordCount = 0;

    // Iteratively fetch pages until no more data or max duration reached    
    while (hasMore && Date.now() < endTime) {
      const generator = this.onFetch({
        lastSyncedAt: params.lastSyncedAt ?? null,
        syncContext: params.syncContext || {},
        auth,
      });

      let done: boolean | undefined;
      let value: DataRecord | { hasMore: boolean };

      // Process records from the current page
      while (!done) {
        ({ done, value } = await generator.next());
        if (done) {
          hasMore = value.hasMore;
          break;
        }
        recordCount++;
        yield value as DataRecord;
      }
    }

    logger.info(`Completed fetch with ${recordCount} records`);
    return { hasMore };
  }

}
