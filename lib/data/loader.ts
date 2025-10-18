import type { DataLoaderResourceInfo } from "@/lib/types";

// Type-only definition to avoid importing server-only module in tests
type DataRecord = {
  resourceName: string;
  [key: string]: any;
};

// Re-export DataLoaderResourceInfo from types for convenience
export type { DataLoaderResourceInfo };

/**
 * Pure interface for data loaders focused only on remote data fetching
 */
export interface DataLoader {
  /**
   * Initiates the authentication process (or immediate success for no-auth loaders)
   * @param params - Authentication parameters including the redirect URI
   * @returns Authentication information including auth URL, or success flag for no-auth loaders
   */
  authenticate(params: { redirectTo: string }): { authUrl: string; success?: boolean };

  /**
   * Continues the authentication process with an authorization code
   * @param params - Authentication parameters including the authorization code and redirect URI
   */
  continueToAuthenticate(params: { code: string; redirectTo: string }): Promise<void>;

  /**
   * Gets the current access token
   * @returns The access token or null if not authenticated
   */
  getAccessToken(): string | null;

  /**
   * Sets the access token
   * @param token - The access token to set
   */
  setAccessToken(token: string): void;

  /**
   * Gets the current refresh token (if available)
   * @returns The refresh token or null if not available
   */
  getRefreshToken?(): string | null;

  /**
   * Sets the refresh token (if supported)
   * @param token - The refresh token to set
   */
  setRefreshToken?(token: string): void;

  /**
   * Gets detailed information about a specific resource including schema, columns, and optional record count
   * @param resourceName - The name of the resource to get information for
   * @returns Promise resolving to detailed resource information
   */
  getResourceInfo?(resourceName: string): Promise<DataLoaderResourceInfo>;

  /**
   * Gets the list of all available resource names from the data source.
   * For example, for SQL data loaders, this should return the names of all tables in the database.
   * @returns Promise resolving to array of resource names
   */
  getAvailableResourceNames(): Promise<string[]>;

  /**
   * Fetches data from the remote source
   * @param params - Fetch parameters including resources to fetch, last synced at time, sync context (modified in place), and max duration
   * @returns AsyncGenerator yielding records and hasMore flag indicating if there are more pages
   */
  fetch(params: { 
    resources: Array<{ name: string; createdAtColumn?: string; updatedAtColumn?: string }>;
    lastSyncedAt?: Date; 
    syncContext: Record<string, any> | null;
    maxDurationToRunMs?: number;
  }): AsyncGenerator<DataRecord, { hasMore: boolean }, unknown>;
}

/**
 * Generic configuration object for data loaders
 */
export type DataLoaderConfig = Record<string, any>;
