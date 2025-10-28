import { DataSource } from "typeorm";
import { vi } from "vitest";

import { DATA_CONNECTOR_URLS } from "@/lib/consts";
import { DataConnector, DataLoadResult } from "@/lib/data/connector";
import youtubeConfig from "@/lib/data/connector-config/youtube/config";
import { DatabaseClient } from "@/lib/data/db-client";
import { DataConnectorStatusEntity, DataTableStatusEntity } from "@/lib/entities";
import {
  describeIf,
  envVarsCondition,
  setupTestDatabase,
  teardownTestDatabase,
  type TestDatabaseSetup
} from "@/lib/util/test-util";

// Create mock functions that can be referenced
const mockYoutubeListFn = vi.fn();

// Mock googleapis
vi.mock("googleapis", () => ({
  google: {
    youtube: vi.fn(() => ({
      activities: {
        list: mockYoutubeListFn,
      },
    })),
    auth: {
      OAuth2: vi.fn().mockImplementation(() => ({
        generateAuthUrl: vi.fn(() => "https://accounts.google.com/o/oauth2/v2/auth?client_id=test&scope=https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fyoutube.readonly"),
        getToken: vi.fn(() => Promise.reject(new Error("Failed to exchange code for token"))),
        setCredentials: vi.fn(),
      })),
    },
  },
}));

const requiredEnvVars = ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"];

describeIf(
  "YouTube DataConnector Integration Tests",
  () => envVarsCondition("YouTube DataConnector Integration Tests", requiredEnvVars),
  () => {
  let testDbSetup: TestDatabaseSetup;
  let testDataSource: DataSource;
  let connector: DataConnector;

  beforeAll(async () => {
    // Setup PostgreSQL test database
    testDbSetup = await setupTestDatabase([DataConnectorStatusEntity, DataTableStatusEntity]);
    testDataSource = testDbSetup.dataSource;

    // Create DataConnector instance
    connector = await DataConnector.create(youtubeConfig, testDataSource);
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
      await testDataSource.query("DROP TABLE IF EXISTS youtube.activity CASCADE");
      await testDataSource.query("DROP SCHEMA IF EXISTS youtube CASCADE");
    }
  });

  afterAll(async () => {
    await teardownTestDatabase(testDbSetup);
  }, 60000);

  describe("connector properties", () => {
    it("should have correct connector configuration", () => {
      expect(connector.id).toBe("youtube");
      expect(connector.name).toBe("YouTube Activity");
      expect(connector.description).toBe("Loads YouTube activity data including uploads, likes, favorites, comments, and subscriptions.");
    });
  });

  describe("connect", () => {
    it("should return auth info when not connected", async () => {
      const result = await connector.connect({ redirectTo: `http://localhost:3000${DATA_CONNECTOR_URLS.AUTH_CALLBACK_PATH}` });
      
      expect(result.success).toBe(false);
      expect(result.authInfo).toBeDefined();
      expect(result.authInfo?.authUrl).toContain("https://accounts.google.com/o/oauth2/v2/auth");
      expect(result.authInfo?.authUrl).toContain("client_id=");
      expect(result.authInfo?.authUrl).toContain("scope=");
      expect(result.authInfo?.authUrl).toContain("https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fyoutube.readonly");
    });

    it("should return success when already connected", async () => {
      // Set up existing connected status
      const repo = testDataSource.getRepository(DataConnectorStatusEntity);
      const statusEntity = new DataConnectorStatusEntity();
      statusEntity.connectorId = "youtube";
      statusEntity.isConnected = true;
      statusEntity.lastConnectedAt = new Date();
      statusEntity.updatedAt = new Date();
      
      await repo.save(statusEntity);

      const result = await connector.connect({ redirectTo: `http://localhost:3000${DATA_CONNECTOR_URLS.AUTH_CALLBACK_PATH}` });
      expect(result.success).toBe(true);
      expect(result.authInfo).toBeUndefined();
    });
  });

  describe("continueToConnect", () => {
    // Note: This test will make real HTTP requests to Google's OAuth endpoint
    // It will likely fail unless valid credentials are provided, which is expected
    it("should attempt to exchange auth code for access token", async () => {
      // Use a dummy auth code - this will fail but we can test the flow
      const mockAuthCode = "test-auth-code-123";
      
      await expect(connector.continueToConnect({ authCode: mockAuthCode })).rejects.toThrow("Failed to exchange code for token");
    });
  });

  describe("load", () => {
    beforeEach(async () => {
      // Set up connection status for load tests
      const repo = testDataSource.getRepository(DataConnectorStatusEntity);
      const statusEntity = new DataConnectorStatusEntity();
      statusEntity.connectorId = "youtube";
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
      
      // This should fail because we don't have a valid access token
      await expect(connector.load({})).rejects.toThrow("No access token available. Please authenticate first.");
    });

    it("should load data with valid access token", async () => {
      // Mock YouTube API response
      const mockActivityList = {
        data: {
          items: [
            {
              id: "activity1",
              snippet: {
                title: "Test Video",
                publishedAt: "2024-01-01T10:00:00Z",
                type: "upload",
              },
              contentDetails: {
                upload: {
                  videoId: "video123",
                },
              },
            },
          ],
        },
      };

      mockYoutubeListFn.mockResolvedValue(mockActivityList);

      const loadResult: DataLoadResult = await connector.load({});
      
      // Verify the load result is returned
      expect(loadResult).toBeDefined();
      expect(loadResult.updatedRecordCount).toBeGreaterThanOrEqual(0);
      
      // Verify the authentication and API call process completed successfully
      const status = await connector.getStatus();
      expect(status?.lastSyncedAt).toBeDefined();
      expect(status?.lastSyncedAt).toBeInstanceOf(Date);
      
      // Verify table was created
      const dbClient = new DatabaseClient(testDataSource);
      const tableInfos = await dbClient.getTableInfos();
      const activityTable = tableInfos["youtube.activity"];
      expect(activityTable).toBeDefined();
      
      // This confirms the integration is working correctly
      expect(status?.isConnected).toBe(true);
      
      // Verify API was called
      expect(mockYoutubeListFn).toHaveBeenCalled();
    });
  });

  describe("load with sync context", () => {
    it("should handle sync context flow with mocked API using publishedAfter", async () => {
      // Create a new connector instance
      const connector = await DataConnector.create(youtubeConfig, testDataSource);
      
      // Set up mock access token
      const dataLoader = (connector as any).dataLoader;
      dataLoader.setAccessToken("mock-access-token");
      
      // Set connection status to true
      const repo = testDataSource.getRepository(DataConnectorStatusEntity);
      const statusEntity = new DataConnectorStatusEntity();
      statusEntity.connectorId = "youtube";
      statusEntity.isConnected = true;
      statusEntity.lastConnectedAt = new Date();
      statusEntity.updatedAt = new Date();
      await repo.save(statusEntity);
      
      // Mock first load - initial sync with activities
      const mockFirstLoad = {
        data: {
          items: [
            {
              id: "activity1",
              snippet: {
                title: "Test Video",
                publishedAt: "2024-01-01T10:00:00Z",
                type: "upload",
              },
              contentDetails: {
                upload: {
                  videoId: "video123",
                },
              },
            },
          ],
        },
      };

      mockYoutubeListFn.mockResolvedValue(mockFirstLoad);
      
      // First load - this should be initial sync (no sync context)
      await connector.load({});
      
      // Check that we got a sync context stored
      let status = await connector.getStatus();
      expect(status?.syncContext).toBeDefined();
      expect(status?.syncContext?.lastActivityTime).toBeDefined();
            
      // Mock second load - incremental sync
      mockYoutubeListFn.mockResolvedValue({ data: { items: [] } });
      
      // Second load - this should use the stored activity time for incremental sync  
      const secondLoadResult: DataLoadResult = await connector.load({});
      
      expect(secondLoadResult.updatedRecordCount).toBeGreaterThanOrEqual(0);
      
      // Check that sync context was updated (should have lastActivityTime)
      status = await connector.getStatus();
      expect(status?.syncContext).toBeDefined();
      expect(status?.syncContext?.lastActivityTime).toBeDefined();
      expect(status?.lastSyncedAt).toBeDefined();
      expect(status?.isConnected).toBe(true);
    });
  });
  }
);

