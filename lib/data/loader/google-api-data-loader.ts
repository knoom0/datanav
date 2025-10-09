import { google } from "googleapis";

import { DataLoader } from "@/lib/data/loader";
import logger from "@/lib/logger";


export type DataRecord = {
  resourceName: string;
  [key: string]: any;
};

export type GoogleAPIFetchParams = {
  auth: any; // OAuth2 client from googleapis
  lastLoadedTime?: Date;
  syncContext: Record<string, any> | null;
};

export interface GoogleAPIDataLoaderConfig {
  scopes: string[];
  onFetch: (params: GoogleAPIFetchParams) => AsyncGenerator<DataRecord, void, unknown>;
}

export class GoogleAPIDataLoader implements DataLoader {
  private accessToken: string | null = null;
  private refreshToken: string | null = null;
  private googleConfig: GoogleAPIDataLoaderConfig;

  constructor(config: GoogleAPIDataLoaderConfig) {
    this.googleConfig = config;
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

  authenticate({ redirectTo }: { redirectTo: string }): { authUrl: string } {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    
    if (!clientId) {
      throw new Error("Google OAuth configuration missing. Please set GOOGLE_CLIENT_ID environment variable.");
    }

    const scopes = this.googleConfig.scopes.join(" ");
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
    lastLoadedAt?: Date; 
    syncContext: Record<string, any> | null;
  }): AsyncGenerator<DataRecord, void, unknown> {
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

    yield* this.googleConfig.onFetch({
      lastLoadedTime: params.lastLoadedAt,
      syncContext: params.syncContext,
      auth,
    });
  }

}
