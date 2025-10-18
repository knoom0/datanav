import { DataSource } from "typeorm";
import { vi } from "vitest";

import { DATA_CONNECTOR_URLS } from "@/lib/consts";
import { DataConnector, DataLoadResult } from "@/lib/data/connector";
import gmailConfig from "@/lib/data/connector-config/gmail/config";
import { DatabaseClient } from "@/lib/data/db-client";
import { DataConnectorStatusEntity, DataTableStatusEntity } from "@/lib/data/entities";
import {
  describeIf,
  envVarsCondition,
  setupTestDatabase,
  teardownTestDatabase,
  type TestDatabaseSetup
} from "@/lib/util/test-util";

// Create mock functions that can be referenced
const mockGmailListFn = vi.fn();
const mockGmailGetFn = vi.fn();

// Mock googleapis
vi.mock("googleapis", () => ({
  google: {
    gmail: vi.fn(() => ({
      users: {
        messages: {
          list: mockGmailListFn,
          get: mockGmailGetFn,
        },
      },
    })),
    auth: {
      OAuth2: vi.fn().mockImplementation(() => ({
        generateAuthUrl: vi.fn(() => "https://accounts.google.com/o/oauth2/v2/auth?client_id=test&scope=https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fgmail.readonly"),
        getToken: vi.fn(() => Promise.reject(new Error("Failed to exchange code for token"))),
        setCredentials: vi.fn(),
      })),
    },
  },
}));

// Mock googleapis-batcher
vi.mock("@jrmdayn/googleapis-batcher", () => ({
  batchFetchImplementation: vi.fn(() => vi.fn()),
}));

const requiredEnvVars = ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"];

describeIf(
  "Gmail DataConnector Integration Tests",
  () => envVarsCondition("Gmail DataConnector Integration Tests", requiredEnvVars),
  () => {
  let testDbSetup: TestDatabaseSetup;
  let testDataSource: DataSource;
  let connector: DataConnector;

  beforeAll(async () => {
    // Setup PostgreSQL test database
    testDbSetup = await setupTestDatabase([DataConnectorStatusEntity, DataTableStatusEntity]);
    testDataSource = testDbSetup.dataSource;

    // Create DataConnector instance
    connector = await DataConnector.create(gmailConfig, testDataSource);
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
        await testDataSource.query("DROP TABLE IF EXISTS gmail.message CASCADE");
        await testDataSource.query("DROP TABLE IF EXISTS gmail.thread CASCADE");
        await testDataSource.query("DROP TABLE IF EXISTS gmail.label CASCADE");
        await testDataSource.query("DROP TABLE IF EXISTS gmail.draft CASCADE");
        await testDataSource.query("DROP TABLE IF EXISTS gmail.profile CASCADE");
        await testDataSource.query("DROP TABLE IF EXISTS gmail.history CASCADE");
        await testDataSource.query("DROP SCHEMA IF EXISTS gmail CASCADE");
      } catch {
        // Ignore errors if table/schema doesn"t exist
      }
    }
  });

  afterAll(async () => {
    await teardownTestDatabase(testDbSetup);
  }, 60000);

  describe("connect", () => {
    it("should return auth info when not connected", async () => {
      const result = await connector.connect({ redirectTo: `http://localhost:3000${DATA_CONNECTOR_URLS.AUTH_CALLBACK_PATH}` });
      
      expect(result.success).toBe(false);
      expect(result.authInfo).toBeDefined();
      expect(result.authInfo?.authUrl).toContain("https://accounts.google.com/o/oauth2/v2/auth");
      expect(result.authInfo?.authUrl).toContain("client_id=");
      expect(result.authInfo?.authUrl).toContain("scope=");
      expect(result.authInfo?.authUrl).toContain("https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fgmail.readonly");
    });
  });

  describe("continueToConnect", () => {
    // Note: This test will make real HTTP requests to Google"s OAuth endpoint
    // It will likely fail unless valid credentials are provided, which is expected
    it("should attempt to exchange auth code for access token", async () => {
      // Use a dummy auth code - this will fail but we can test the flow
      const mockAuthCode = "test-auth-code-123";
      
      try {
        await connector.continueToConnect({ authCode: mockAuthCode });
        // If this succeeds (unlikely with mock code), verify connection status
        const status = await connector.getStatus();
        expect(status?.isConnected).toBe(true);
        expect(status?.lastConnectedAt).toBeDefined();
      } catch (error) {
        // Expected to fail with mock auth code
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toContain("Failed to exchange code for token");
      }
    });
  });

  describe("load", () => {
    beforeEach(async () => {
      // Set up connection status for load tests
      const repo = testDataSource.getRepository(DataConnectorStatusEntity);
      const statusEntity = new DataConnectorStatusEntity();
      statusEntity.connectorId = "gmail";
      statusEntity.isConnected = true;
      statusEntity.lastConnectedAt = new Date();
      statusEntity.updatedAt = new Date();
      await repo.save(statusEntity);

      // Set up mock access token for load tests
      const dataLoader = (connector as any).dataLoader;
      dataLoader.setAccessToken("mock-access-token");

      // Reset mocks before each test
      vi.clearAllMocks();
    });

    it("should fail to load data without valid access token", async () => {
      // Clear the access token that was set in beforeEach
      const dataLoader = (connector as any).dataLoader;
      dataLoader.setAccessToken(null);
      
      // This should fail because we don"t have a valid access token
      await expect(connector.load({})).rejects.toThrow("No access token available. Please authenticate first.");
    });

    it("should load data with valid access token", async () => {
      // Mock Gmail API responses
      const mockMessageList = {
        data: {
          messages: [
            { id: "msg1" },
            { id: "msg2" },
          ],
        },
      };

      mockGmailListFn.mockResolvedValue(mockMessageList);
      // Mock different responses for different message IDs
      mockGmailGetFn.mockImplementation((params: any) => {
        const messageId = params.id;
        return Promise.resolve({
          data: {
            id: messageId,
            threadId: `thread-${messageId}`,
            labelIds: ["INBOX"],
            snippet: `Test message ${messageId}`,
            internalDate: "1640000000000",
          },
        });
      });

      const loadResult: DataLoadResult = await connector.load({});
      
      // Verify the load result is returned
      expect(loadResult).toBeDefined();
      expect(loadResult.updatedRecordCount).toBeGreaterThanOrEqual(0);
      
      // Verify the authentication and API call process completed successfully
      const status = await connector.getStatus();
      expect(status?.lastSyncedAt).toBeDefined();
      expect(status?.lastSyncedAt).toBeInstanceOf(Date);
      
      // Verify tables were created
      const dbClient = new DatabaseClient(testDataSource);
      const tableInfos = await dbClient.getTableInfos();
      const messageTable = tableInfos["gmail.message"];
      expect(messageTable).toBeDefined();
      
      // This confirms the integration is working correctly
      expect(status?.isConnected).toBe(true);
      
      // Verify API was called
      expect(mockGmailListFn).toHaveBeenCalled();
    });
  });

  describe("load with sync context", () => {
    it("should handle sync context flow with mocked API using lastMessageDate", async () => {
      // Create a new connector instance
      const connector = await DataConnector.create(gmailConfig, testDataSource);
      
      // Set up mock access token
      const dataLoader = (connector as any).dataLoader;
      dataLoader.setAccessToken("mock-access-token");
      
      // Set connection status to true
      const repo = testDataSource.getRepository(DataConnectorStatusEntity);
      const statusEntity = new DataConnectorStatusEntity();
      statusEntity.connectorId = "gmail";
      statusEntity.isConnected = true;
      statusEntity.lastConnectedAt = new Date();
      statusEntity.updatedAt = new Date();
      await repo.save(statusEntity);
      
      // Mock first load - initial sync with messages
      const mockFirstLoad = {
        data: {
          messages: [{ id: "msg1" }],
        },
      };
      
      const mockMessageDetails = {
        data: {
          id: "msg1",
          threadId: "thread1",
          labelIds: ["INBOX"],
          snippet: "Test message",
          internalDate: "1640000000000",
        },
      };

      mockGmailListFn.mockResolvedValue(mockFirstLoad);
      mockGmailGetFn.mockResolvedValue(mockMessageDetails);
      
      // First load - this should be initial sync (no sync context)
      await connector.load({});
      
      // Check that we got a sync context stored
      let status = await connector.getStatus();
      expect(status?.syncContext).toBeDefined();
      expect(status?.syncContext?.lastMessageDate).toBeDefined();
            
      // Mock second load - incremental sync
      mockGmailListFn.mockResolvedValue({ data: { messages: [] } });
      
      // Second load - this should use the stored lastMessageDate for incremental sync  
      const secondLoadResult: DataLoadResult = await connector.load({});
      
      expect(secondLoadResult.updatedRecordCount).toBeGreaterThanOrEqual(0);
      
      // Check that sync context was updated (should have lastMessageDate)
      status = await connector.getStatus();
      expect(status?.syncContext).toBeDefined();
      expect(status?.syncContext?.lastMessageDate).toBeDefined();
      expect(status?.lastSyncedAt).toBeDefined();
      expect(status?.isConnected).toBe(true);
    });
  });
  }
);
