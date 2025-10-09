/**
 * Pure interface for data loaders focused only on remote data fetching
 */
export interface DataLoader {
  /**
   * Initiates the authentication process
   * @param params - Authentication parameters including the redirect URI
   * @returns Authentication information including auth URL
   */
  authenticate(params: { redirectTo: string }): { authUrl: string };

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
   * Fetches data from the remote source
   * @param params - Fetch parameters including last loaded timestamp and sync context (modified in place)
   * @returns Generator that yields records
   */
  fetch(params: { 
    lastLoadedAt?: Date; 
    syncContext: Record<string, any> | null;
  }): AsyncGenerator<{ resourceName: string; [key: string]: any }, void, unknown>;
}
