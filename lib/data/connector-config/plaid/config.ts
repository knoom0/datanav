import {
  TransactionsSyncRequest,
  AccountsGetRequest,
} from "plaid";

import { DataConnectorConfig } from "@/lib/data/connector";
import { PlaidDataLoader, PlaidFetchParams } from "@/lib/data/loader/plaid-data-loader";
import logger from "@/lib/logger";

export default {
  id: "plaid",
  name: "Plaid",
  description: "Loads financial data from Plaid including transactions, accounts, and balances.",
  resources: [
    {
      name: "Account",
      idColumn: "account_id",
    },
    {
      name: "Transaction",
      idColumn: "transaction_id",
      createdAtColumn: "date",
      updatedAtColumn: "authorized_date",
    },
  ],
  dataLoaderFactory: () =>
    new PlaidDataLoader({
      products: ["transactions"],
      countryCodes: ["US"],
      language: "en",
      onFetch: async function* ({
        plaidClient,
        lastSyncedAt: _lastSyncedAt,
        syncContext,
      }: PlaidFetchParams) {
        // Access token is set on plaidClient by the DataLoader before calling onFetch
        
        // Fetch accounts first
        logger.info("Fetching accounts from Plaid");

        const accountsRequest: AccountsGetRequest = {
          access_token: (plaidClient as any).accessToken,
        };

        const accountsResponse = await plaidClient.accountsGet(accountsRequest);

        for (const account of accountsResponse.data.accounts) {
          yield {
            resourceName: "Account",
            ...account,
          };
        }

        logger.info(
          `Fetched ${accountsResponse.data.accounts.length} accounts`
        );

        // Fetch transactions using the sync endpoint
        const cursor = syncContext.transactionsCursor;

        const request: TransactionsSyncRequest = {
          access_token: (plaidClient as any).accessToken,
        };

        if (cursor) {
          request.cursor = cursor;
        }

        let hasMore = true;

        while (hasMore) {
          logger.info(
            `Fetching transactions from Plaid with cursor: ${request.cursor || "none"}`
          );

          const response = await plaidClient.transactionsSync(request);

          // Yield all added transactions
          for (const transaction of response.data.added) {
            yield {
              resourceName: "Transaction",
              ...transaction,
            };
          }

          // Yield all modified transactions
          for (const transaction of response.data.modified) {
            yield {
              resourceName: "Transaction",
              ...transaction,
            };
          }

          // Update cursor for next request
          request.cursor = response.data.next_cursor;
          syncContext.transactionsCursor = response.data.next_cursor;

          // Check if there are more transactions
          hasMore = response.data.has_more;

          logger.info(
            `Fetched ${response.data.added.length} new and ${response.data.modified.length} modified transactions, hasMore: ${hasMore}`
          );
        }
      },
    }),
} as DataConnectorConfig;

