import { google } from "googleapis";

import { DataConnectorConfig } from "@/lib/data/connector";
import apiSpec from "@/lib/data/connector-config/google-calendar/api-spec.json";
import { GoogleAPIDataLoader, GoogleAPIFetchParams, MAX_LOOKBACK_DAYS } from "@/lib/data/loader/google-api-data-loader";
import logger from "@/lib/logger";


const MAX_RESULTS = 2500; // Maximum allowed by Google Calendar API

export default {
  id: "google_calendar",
  name: "Google Calendar",
  description: "Loads Google Calendar events data.",
  resources: [{ 
    name: "Event",
    createdAtColumn: "created",
    updatedAtColumn: "updated"
  }],
  dataLoaderFactory: () => new GoogleAPIDataLoader({
    openApiSpec: apiSpec,
    scopes: ["https://www.googleapis.com/auth/calendar.readonly"],
    onFetch: async function* ({
      auth,
      lastSyncedAt,
      syncContext,
    }: GoogleAPIFetchParams) { 
      // Create Calendar API client
      const calendar = google.calendar({ version: "v3", auth });

      // Build query parameters
      const current = new Date();
      const minDate = new Date(current.getTime() - (MAX_LOOKBACK_DAYS * 24 * 60 * 60 * 1000));
      const queryParams: any = {
        calendarId: "primary",
        timeMin: minDate.toISOString(),  // Fetch events from MAX_LOOKBACK_DAYS ago
        timeMax: current.toISOString(),  // Do not fetch events in the future
        maxResults: MAX_RESULTS,
        showDeleted: true,
        singleEvents: true, // Expand recurring events into instances
        orderBy: "updated", // Always order by updated time for consistent results
      };

      // Add updatedMin if we have a previous sync time (incremental sync)
      // This uses the updatedAtColumn to fetch only records updated since last sync
      if (lastSyncedAt) {
        queryParams.updatedMin = lastSyncedAt.toISOString();
      }
      
      // Add pageToken for pagination if available
      if (syncContext?.nextPageToken) {
        queryParams.pageToken = syncContext.nextPageToken;
      }
      
      logger.info("Fetching calendar events");

      const response = await calendar.events.list(queryParams);

      if (!response.data) {
        throw new Error("Failed to get events from calendar: No data returned");
      }
      
      // Track the latest event update time for sync context
      let latestEventUpdateTime: string | undefined = syncContext?.lastEventUpdateTime;

      // Collect events from this page
      for (const event of response.data.items || []) {
        yield { resourceName: "Event", ...event };
        
        // Track the latest event update time
        if (event.updated) {
          if (!latestEventUpdateTime || event.updated > latestEventUpdateTime) {
            latestEventUpdateTime = event.updated;
          }
        }
      }

      // Update sync context with the latest event update time
      if (latestEventUpdateTime && syncContext) {
        syncContext.lastEventUpdateTime = latestEventUpdateTime;
      }

      // Check if we have more pages to fetch
      const nextPageToken = response.data.nextPageToken;
      const eventCount = (response.data.items || []).length;
      
      // More reliable pagination: check both nextPageToken presence and result count
      // If we got fewer results than maxResults, we've reached the last page
      // even if nextPageToken is present
      let hasMore = false;
      if (nextPageToken && eventCount >= MAX_RESULTS) {
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

      logger.info(`Processed calendar events page, hasMore: ${hasMore}`);
      
      return { hasMore };
    },
  })
} as DataConnectorConfig;
