import { batchFetchImplementation } from "@jrmdayn/googleapis-batcher";
import { google } from "googleapis";

import { DataConnectorConfig } from "@/lib/data/connector";
import apiSpec from "@/lib/data/connector-config/gmail/api-spec.json";
import { GoogleAPIDataLoader, GoogleAPIFetchParams } from "@/lib/data/loader/google-api-data-loader";
import logger from "@/lib/logger";

const MAX_RESULTS = 100; // Maximum allowed by Gmail API
const LOOKBACK_DAYS = 365; // 1 year in days
const BATCH_MAX_SIZE = 20; // Maximum number of requests per batch

// Retry configuration for handling quota exceeded errors
const RETRY_CONFIG = {
  retry: 5, // Number of retries
  retryDelay: 5000, // Base delay in milliseconds
  statusCodesToRetry: [[403, 403]], // HTTP status codes to retry (format: [min, max])
  httpMethodsToRetry: ["GET"], // HTTP methods to retry
};

export default {
  id: "gmail",
  name: "Gmail",
  description: "Loads Gmail messages with full details.",
  openApiSpec: apiSpec,
  resourceNames: ["Message"],
  dataLoaderFactory: () => new GoogleAPIDataLoader({
    scopes: [
      "https://www.googleapis.com/auth/gmail.readonly"
    ],
    onFetch: async function* ({
      auth,
      lastLoadedTime: _lastLoadedTime,
      syncContext,
    }: GoogleAPIFetchParams) { 
      // Create Gmail API client without batching for listing messages
      const gmailList = google.gmail({ 
        auth,
        version: "v1",
        retry: true,
        retryConfig: RETRY_CONFIG
      });

      // Create Gmail API client with batching for getting individual messages
      const fetchImpl = batchFetchImplementation({
        maxBatchSize: BATCH_MAX_SIZE
      });
      const gmailBatch = google.gmail({ 
        auth,
        version: "v1", 
        fetchImplementation: fetchImpl as any,
        retry: true,
        retryConfig: RETRY_CONFIG
      });

      // Use stored lastMessageDate from previous fetch or start fresh
      const lastMessageDate: string | undefined = syncContext?.lastMessageDate;
      let latestMessageDate: string | null = null;

      // Build query parameters for message list
      const current = new Date();
      const minDate = new Date(current.getTime() - (LOOKBACK_DAYS * 24 * 60 * 60 * 1000));
      
      // Use lastMessageDate if available for incremental sync, otherwise use lookback period
      const afterDate = lastMessageDate ? new Date(lastMessageDate) : minDate;
      
      const queryParams: any = {
        userId: "me",
        maxResults: MAX_RESULTS,
        q: `after:${Math.floor(afterDate.getTime() / 1000)}`, // Gmail uses Unix timestamp
        includeSpamTrash: false,
      };

      // Add pageToken for pagination if available
      if (syncContext?.nextPageToken) {
        queryParams.pageToken = syncContext.nextPageToken;
      }
      
      logger.info("Fetching Gmail message list");

      // Get the list of message IDs using non-batch client
      const response = await gmailList.users.messages.list(queryParams);

      if (!response.data) {
        throw new Error("Failed to get message list from Gmail: No data returned");
      }

      const messageList = response.data.messages || [];
      logger.info(`Getting ${messageList.length} messages in chunks of ${BATCH_MAX_SIZE}...`);

      // Filter out messages without IDs
      const validMessages = messageList.filter(messageRef => messageRef.id);
      
      // Split messages into chunks of MAX_BATCH_SIZE
      const messageChunks = [];
      for (let i = 0; i < validMessages.length; i += BATCH_MAX_SIZE) {
        messageChunks.push(validMessages.slice(i, i + BATCH_MAX_SIZE));
      }

      // Process each chunk sequentially
      for (let chunkIndex = 0; chunkIndex < messageChunks.length; chunkIndex++) {
        const chunk = messageChunks[chunkIndex];
        logger.info(`Processing chunk ${chunkIndex + 1}/${messageChunks.length} with ${chunk.length} messages`);

        // Create batched requests for this chunk
        const messagePromises = chunk.map(messageRef => 
          gmailBatch.users.messages.get({
            userId: "me",
            id: messageRef.id!,
            format: "metadata"
          }).catch(error => {
            logger.error(`Failed to get message ${messageRef.id}: ${error}`);
            return null; // Return null for failed requests
          })
        );

        // Execute batched requests for this chunk
        const messageResponses = await Promise.all(messagePromises);

        // Collect successful responses and track latest message date
        for (const messageResponse of messageResponses) {
          if (messageResponse?.data) {
            yield { resourceName: "Message", ...messageResponse.data };
            
            // Track the latest message date from messages
            const messageDate = messageResponse.data.internalDate;
            if (messageDate && (!latestMessageDate || messageDate > latestMessageDate)) {
              latestMessageDate = messageDate;
            }
          }
        }

        logger.info(`Completed chunk ${chunkIndex + 1}/${messageChunks.length}`);
      }

      // Check if we have more pages to fetch
      const nextPageToken = response.data.nextPageToken;
      const messageCount = messageList.length;
      
      logger.info(`Gmail pagination: messageCount=${messageCount}, nextPageToken=${nextPageToken ? "present" : "null"}, MAX_RESULTS=${MAX_RESULTS}`);
      
      // More reliable pagination: check both nextPageToken presence and result count
      // If we got fewer results than maxResults, we've reached the last page
      // even if nextPageToken is present
      let hasMore = false;
      if (nextPageToken && messageCount >= MAX_RESULTS) {
        if (syncContext) {
          syncContext.nextPageToken = nextPageToken;
        }
        hasMore = true;
        logger.info("Setting hasMore=true due to nextPageToken and sufficient message count");
      } else {
        // Store the latest message date for next fetch cycle
        // If no messages were found, use current time as the baseline
        const messageDateToStore = latestMessageDate || new Date().toISOString();
        if (syncContext) {
          syncContext.lastMessageDate = messageDateToStore;
          // Clear nextPageToken since we're done with pagination
          delete syncContext.nextPageToken;
        }
        logger.info("Setting hasMore=false, clearing nextPageToken");
      }

      logger.info(`Processed Gmail messages page, hasMore: ${hasMore}`);
      
      return { hasMore };
    },
  })
} as DataConnectorConfig;
