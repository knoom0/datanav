import { google } from "googleapis";

import { DataConnectorConfig } from "@/lib/data/connector";
import apiSpec from "@/lib/data/connector-config/youtube/api-spec.json";
import { GoogleAPIDataLoader, GoogleAPIFetchParams, MAX_LOOKBACK_DAYS } from "@/lib/data/loader/google-api-data-loader";
import logger from "@/lib/logger";


const MAX_RESULTS = 50; // Maximum allowed by YouTube Data API v3

export default {
  id: "youtube",
  name: "YouTube Activity",
  description: "Loads YouTube activity data including uploads, likes, favorites, comments, and subscriptions.",
  resources: [{ 
    name: "Activity",
    createdAtColumn: "snippet.publishedAt",
    updatedAtColumn: "snippet.publishedAt"
  }],
  dataLoaderFactory: () => new GoogleAPIDataLoader({
    openApiSpec: apiSpec,
    scopes: ["https://www.googleapis.com/auth/youtube.readonly"],
    onFetch: async function* ({
      auth,
      lastSyncedAt,
      syncContext,
    }: GoogleAPIFetchParams) { 
      // Create YouTube API client
      const youtube = google.youtube({ version: "v3", auth });

      // Build query parameters
      const current = new Date();
      const minDate = new Date(current.getTime() - (MAX_LOOKBACK_DAYS * 24 * 60 * 60 * 1000));
      const queryParams: any = {
        part: ["snippet", "contentDetails"],
        mine: true, // Get activities for the authenticated user's channel
        maxResults: MAX_RESULTS,
      };

      // Add publishedAfter based on last sync time for incremental sync, or use lookback period
      if (lastSyncedAt) {
        queryParams.publishedAfter = lastSyncedAt.toISOString();
      } else {
        // First sync: fetch activities from the lookback period
        queryParams.publishedAfter = minDate.toISOString();
      }
      
      // Add pageToken for pagination if available
      if (syncContext?.nextPageToken) {
        queryParams.pageToken = syncContext.nextPageToken;
      }
      
      logger.info("Fetching YouTube activities");

      const response = await youtube.activities.list(queryParams);

      if (!response.data) {
        throw new Error("Failed to get activities from YouTube: No data returned");
      }

      // Track the latest activity time for sync context
      let latestActivityTime: string | undefined = syncContext?.lastActivityTime;

      // Collect activities from this page
      for (const activity of response.data.items || []) {
        yield { resourceName: "Activity", ...activity };
        
        // Track the latest activity time
        if (activity.snippet?.publishedAt) {
          if (!latestActivityTime || activity.snippet.publishedAt > latestActivityTime) {
            latestActivityTime = activity.snippet.publishedAt;
          }
        }
      }

      // Update sync context with the latest activity time
      if (latestActivityTime && syncContext) {
        syncContext.lastActivityTime = latestActivityTime;
      }

      // Check if we have more pages to fetch
      const nextPageToken = response.data.nextPageToken;
      const activityCount = (response.data.items || []).length;
      
      // More reliable pagination: check both nextPageToken presence and result count
      // If we got fewer results than maxResults, we've reached the last page
      // even if nextPageToken is present
      let hasMore = false;
      if (nextPageToken && activityCount >= MAX_RESULTS) {
        if (syncContext) {
          syncContext.nextPageToken = nextPageToken;
        }
        hasMore = true;
      } else {
        // Clear nextPageToken since we're done with pagination
        if (syncContext) {
          delete syncContext.nextPageToken;
        }
      }

      logger.info(`Processed YouTube activities page, hasMore: ${hasMore}`);
      
      return { hasMore };
    },
  })
} as DataConnectorConfig;

