import { DataSource } from "typeorm";
import { vi } from "vitest";

import { DATA_CONNECTOR_URLS } from "@/lib/consts";
import { DataConnector, DataLoadResult } from "@/lib/data/connector";
import plaidConfig from "@/lib/data/connector-config/plaid/config";
import { DataConnectorStatusEntity, DataTableStatusEntity } from "@/lib/entities";
import {
  describeIf,
  envVarsCondition,
  setupTestDatabase,
  teardownTestDatabase,
  type TestDatabaseSetup
} from "@/lib/util/test-util";

// Create mock functions
const mockTransactionsSyncFn = vi.fn();
const mockAccountsGetFn = vi.fn();
const mockItemPublicTokenExchangeFn = vi.fn();
const mockLinkTokenCreateFn = vi.fn();

// Mock plaid library
vi.mock("plaid", () => ({
  Configuration: vi.fn().mockImplementation(() => ({})),
  PlaidApi: vi.fn().mockImplementation(() => ({
    configuration: {},
    transactionsSync: mockTransactionsSyncFn,
    accountsGet: mockAccountsGetFn,
    itemPublicTokenExchange: mockItemPublicTokenExchangeFn,
    linkTokenCreate: mockLinkTokenCreateFn,
  })),
  PlaidEnvironments: {
    sandbox: "https://sandbox.plaid.com",
    development: "https://development.plaid.com",
    production: "https://production.plaid.com",
  },
  Products: {
    Transactions: "transactions",
    Auth: "auth",
  },
  CountryCode: {
    Us: "US",
  },
}));

const requiredEnvVars = ["PLAID_CLIENT_ID", "PLAID_CLIENT_SECRET"];

describeIf(
  "Plaid DataConnector Integration Tests",
  () => envVarsCondition("Plaid DataConnector Integration Tests", requiredEnvVars),
  () => {
  let testDbSetup: TestDatabaseSetup;
  let testDataSource: DataSource;
  let connector: DataConnector;

  beforeAll(async () => {
    // Setup PostgreSQL test database
    testDbSetup = await setupTestDatabase([DataConnectorStatusEntity, DataTableStatusEntity]);
    testDataSource = testDbSetup.dataSource;

    // Create DataConnector instance
    connector = await DataConnector.create(plaidConfig, testDataSource);
  }, 60000);

  afterEach(async () => {
    // Clean up test data between tests
    if (testDataSource?.isInitialized) {
      // Clear status tables
      const connectorRepo = testDataSource.getRepository(DataConnectorStatusEntity);
      const tableRepo = testDataSource.getRepository(DataTableStatusEntity);
      await connectorRepo.clear();
      await tableRepo.clear();
      
      // Drop any tables and schemas created by the connector
      try {
        await testDataSource.query("DROP TABLE IF EXISTS plaid.transaction CASCADE");
        await testDataSource.query("DROP TABLE IF EXISTS plaid.account CASCADE");
        await testDataSource.query("DROP SCHEMA IF EXISTS plaid CASCADE");
      } catch {
        // Ignore errors if table/schema doesn't exist
      }
    }

    // Reset mocks
    mockTransactionsSyncFn.mockReset();
    mockAccountsGetFn.mockReset();
    mockItemPublicTokenExchangeFn.mockReset();
    mockLinkTokenCreateFn.mockReset();
  });

  afterAll(async () => {
    await teardownTestDatabase(testDbSetup);
  }, 60000);

  describe("connect", () => {
    it("should return auth info when not connected", async () => {
      mockLinkTokenCreateFn.mockResolvedValue({
        data: {
          link_token: "link-sandbox-test-token",
          expiration: "2024-12-31T23:59:59Z",
          request_id: "test-request-id",
        },
      });

      const result = await connector.connect({ redirectTo: `http://localhost:3000${DATA_CONNECTOR_URLS.AUTH_CALLBACK_PATH}`, userId: "test-user-id" });
      
      expect(result.success).toBe(false);
      expect(result.authInfo).toBeDefined();
      expect(result.authInfo?.authUrl).toContain("plaid://");
      expect(result.authInfo?.authUrl).toContain("link-sandbox-test-token");
    });
  });

  describe("continueToConnect", () => {
    it("should exchange public token for access token", async () => {
      mockItemPublicTokenExchangeFn.mockResolvedValue({
        data: {
          access_token: "access-sandbox-test-token",
          item_id: "test-item-id",
        },
      });

      const result = await connector.continueToConnect({
        authCode: "public-sandbox-test-token",
        redirectTo: `http://localhost:3000${DATA_CONNECTOR_URLS.AUTH_CALLBACK_PATH}`,
      });

      expect(result.success).toBe(true);
      expect(mockItemPublicTokenExchangeFn).toHaveBeenCalledWith({
        public_token: "public-sandbox-test-token",
      });

      // Verify token was saved
      const status = await connector.getStatus();
      expect(status?.accessToken).toBe("access-sandbox-test-token");
    });
  });

  describe("load", () => {
    it("should load transactions and accounts with valid access token", async () => {
      // Set up mock responses
      mockTransactionsSyncFn.mockResolvedValue({
        data: {
          added: [
            {
              transaction_id: "tx1",
              account_id: "acc1",
              amount: 100.50,
              date: "2024-01-01",
              name: "Test Transaction 1",
            },
            {
              transaction_id: "tx2",
              account_id: "acc1",
              amount: 50.25,
              date: "2024-01-02",
              name: "Test Transaction 2",
            },
          ],
          modified: [],
          removed: [],
          next_cursor: "cursor-123",
          has_more: false,
        },
      });

      mockAccountsGetFn.mockResolvedValue({
        data: {
          accounts: [
            {
              account_id: "acc1",
              name: "Checking Account",
              type: "depository",
              subtype: "checking",
              mask: "1234",
              official_name: "Official Checking Account",
              balances: {
                available: 1000.00,
                current: 1000.00,
                limit: null,
                iso_currency_code: "USD",
                unofficial_currency_code: null,
              },
            },
          ],
        },
      });

      // First exchange token
      mockItemPublicTokenExchangeFn.mockResolvedValue({
        data: {
          access_token: "access-sandbox-test-token",
          item_id: "test-item-id",
        },
      });

      await connector.continueToConnect({
        authCode: "public-sandbox-test-token",
        redirectTo: `http://localhost:3000${DATA_CONNECTOR_URLS.AUTH_CALLBACK_PATH}`,
      });

      // Now load data
      const loadResult: DataLoadResult = await connector.load();

      expect(loadResult.updatedRecordCount).toBe(3); // 2 transactions + 1 account
      expect(loadResult.isFinished).toBe(true);
      expect(mockTransactionsSyncFn).toHaveBeenCalled();
      expect(mockAccountsGetFn).toHaveBeenCalled();

      // Verify data was written to database
      const transactionRows = await testDataSource.query("SELECT * FROM plaid.transaction");
      expect(transactionRows.length).toBe(2);
      expect(transactionRows[0].transaction_id).toBe("tx1");

      const accountRows = await testDataSource.query("SELECT * FROM plaid.account");
      expect(accountRows.length).toBe(1);
      expect(accountRows[0].account_id).toBe("acc1");
    });
  });
});
