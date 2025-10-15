import { google } from "googleapis";

import { DataConnectorConfig } from "@/lib/data/connector";
import apiSpec from "@/lib/data/connector-config/youtube/api-spec.json";
import { GoogleAPIDataLoader, GoogleAPIFetchParams } from "@/lib/data/loader/google-api-data-loader";
import logger from "@/lib/logger";


const MAX_RESULTS = 50; // Maximum allowed by YouTube Data API v3
const LOOKBACK_DAYS = 2 * 365; // 2 years in days

export default {
  id: "youtube",
  name: "YouTube Activity",
  description: "Loads YouTube activity data including uploads, likes, favorites, comments, and subscriptions.",
  openApiSpec: apiSpec,
  resourceNames: ["Activity"],
  dataLoaderFactory: () => new GoogleAPIDataLoader({
    scopes: ["https://www.googleapis.com/auth/youtube.readonly"],
    onFetch: async function* ({
      auth,
      lastLoadedTime: _lastLoadedTime,
      syncContext,
    }: GoogleAPIFetchParams) { 
      // Create YouTube API client
      const youtube = google.youtube({ version: "v3", auth });

      // Use stored lastActivityTime from previous fetch or start fresh
      const lastActivityTime: string | undefined = syncContext?.lastActivityTime;
      let latestActivityTime: string | null = null;

      // Build query parameters
      const current = new Date();
      const minDate = new Date(current.getTime() - (LOOKBACK_DAYS * 24 * 60 * 60 * 1000));
      const queryParams: any = {
        part: ["snippet", "contentDetails"],
        mine: true, // Get activities for the authenticated user's channel
        maxResults: MAX_RESULTS,
      };

      // Add publishedAfter if we have a previous activity time (incremental sync)
      if (lastActivityTime) {
        queryParams.publishedAfter = lastActivityTime;
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

      // Collect activities from this page and track latest publish time
      for (const activity of response.data.items || []) {
        yield { resourceName: "Activity", ...activity };
        
        // Track the latest activity publish time from activities
        if (activity.snippet?.publishedAt && (!latestActivityTime || activity.snippet.publishedAt > latestActivityTime)) {
          latestActivityTime = activity.snippet.publishedAt;
        }
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
        // Store the latest activity time for next fetch cycle
        // If no activities were found, use current time as the baseline
        const activityTimeToStore = latestActivityTime || new Date().toISOString();
        if (syncContext) {
          syncContext.lastActivityTime = activityTimeToStore;
          // Clear nextPageToken since we're done with pagination
          delete syncContext.nextPageToken;
        }
      }

      logger.info(`Processed YouTube activities page, hasMore: ${hasMore}`);
      
      return { hasMore };
    },
  })
} as DataConnectorConfig;

