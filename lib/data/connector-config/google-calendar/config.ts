import { google } from "googleapis";

import { DataConnectorConfig } from "@/lib/data/connector";
import apiSpec from "@/lib/data/connector-config/google-calendar/api-spec.json";
import { GoogleAPIDataLoader, GoogleAPIFetchParams } from "@/lib/data/loader/google-api-data-loader";
import logger from "@/lib/logger";


const MAX_RESULTS = 2500; // Maximum allowed by Google Calendar API
const LOOKBACK_DAYS = 2 * 365; // 2 years in days

export default {
  id: "google_calendar",
  name: "Google Calendar",
  description: "Loads Google Calendar events data.",
  openApiSpec: apiSpec,
  resourceNames: ["Event"],
  dataLoaderFactory: () => new GoogleAPIDataLoader({
    scopes: ["https://www.googleapis.com/auth/calendar.readonly"],
    onFetch: async function* ({
      auth,
      lastLoadedTime: _lastLoadedTime,
      syncContext,
    }: GoogleAPIFetchParams) { 
      // Create Calendar API client
      const calendar = google.calendar({ version: "v3", auth });

      // Use stored lastEventUpdateTime from previous fetch or start fresh
      const lastEventUpdateTime: string | undefined = syncContext?.lastEventUpdateTime;
      let latestEventUpdateTime: string | null = null;

      // Build query parameters
      const current = new Date();
      const minDate = new Date(current.getTime() - (LOOKBACK_DAYS * 24 * 60 * 60 * 1000));
      const queryParams: any = {
        calendarId: "primary",
        timeMin: minDate.toISOString(),  // Fetch events from 2 years ago
        timeMax: current.toISOString(),  // Do not fetch events in the future
        maxResults: MAX_RESULTS,
        showDeleted: true,
        singleEvents: true, // Expand recurring events into instances
        orderBy: "updated", // Always order by updated time for consistent results
      };

      // Add updatedMin if we have a previous event update time (incremental sync)
      if (lastEventUpdateTime) {
        queryParams.updatedMin = lastEventUpdateTime;
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
      
      // Collect events from this page and track latest update time
      for (const event of response.data.items || []) {
        yield { resourceName: "Event", ...event };
        
        // Track the latest event update time from events
        if (event.updated && (!latestEventUpdateTime || event.updated > latestEventUpdateTime)) {
          latestEventUpdateTime = event.updated;
        }
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
        // Store the latest event update time for next fetch cycle
        // If no events were found, use current time as the baseline
        const eventUpdateTimeToStore = latestEventUpdateTime || new Date().toISOString();
        if (syncContext) {
          syncContext.lastEventUpdateTime = eventUpdateTimeToStore;
          // Clear nextPageToken since we're done with pagination
          delete syncContext.nextPageToken;
        }
      }

      logger.info(`Processed calendar events page, hasMore: ${hasMore}`);
      
      return { hasMore };
    },
  })
} as DataConnectorConfig;
