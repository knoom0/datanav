import { DataSource } from "typeorm";
import { vi } from "vitest";

import { DATA_CONNECTOR_URLS } from "@/lib/consts";
import { DataConnector, DataLoadResult } from "@/lib/data/connector";
import googleCalendarConfig from "@/lib/data/connector-config/google-calendar/config";
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
const mockCalendarListFn = vi.fn();

// Mock googleapis
vi.mock("googleapis", () => ({
  google: {
    calendar: vi.fn(() => ({
      events: {
        list: mockCalendarListFn,
      },
    })),
    auth: {
      OAuth2: vi.fn().mockImplementation(() => ({
        generateAuthUrl: vi.fn(() => "https://accounts.google.com/o/oauth2/v2/auth?client_id=test&scope=https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fcalendar.readonly"),
        getToken: vi.fn(() => Promise.reject(new Error("Failed to exchange code for token"))),
        setCredentials: vi.fn(),
      })),
    },
  },
}));

const requiredEnvVars = ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"];

describeIf(
  "Google Calendar DataConnector Integration Tests",
  () => envVarsCondition("Google Calendar DataConnector Integration Tests", requiredEnvVars),
  () => {
  let testDbSetup: TestDatabaseSetup;
  let testDataSource: DataSource;
  let connector: DataConnector;

  beforeAll(async () => {
    // Setup PostgreSQL test database
    testDbSetup = await setupTestDatabase([DataConnectorStatusEntity, DataTableStatusEntity]);
    testDataSource = testDbSetup.dataSource;

    // Create DataConnector instance
    connector = await DataConnector.create(googleCalendarConfig, testDataSource);
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
        await testDataSource.query("DROP TABLE IF EXISTS google_calendar.event CASCADE");
        await testDataSource.query("DROP SCHEMA IF EXISTS google_calendar CASCADE");
      } catch {
        // Ignore errors if table/schema doesn"t exist
      }
    }
  });

  afterAll(async () => {
    await teardownTestDatabase(testDbSetup);
  }, 60000);

  describe("connector properties", () => {
    it("should have correct connector configuration", () => {
      expect(connector.id).toBe("google_calendar");
      expect(connector.name).toBe("Google Calendar");
      expect(connector.description).toBe("Loads Google Calendar events data.");
    });
  });

  describe("connect", () => {
    it("should return auth info when not connected", async () => {
      const result = await connector.connect({ redirectTo: `http://localhost:3000${DATA_CONNECTOR_URLS.AUTH_CALLBACK_PATH}`, userId: "test-user-id" });
      
      expect(result.success).toBe(false);
      expect(result.authInfo).toBeDefined();
      expect(result.authInfo?.authUrl).toContain("https://accounts.google.com/o/oauth2/v2/auth");
      expect(result.authInfo?.authUrl).toContain("client_id=");
      expect(result.authInfo?.authUrl).toContain("scope=");
      expect(result.authInfo?.authUrl).toContain("https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fcalendar.readonly");
    });

    it("should return success when already connected", async () => {
      // Set up existing connected status
      const repo = testDataSource.getRepository(DataConnectorStatusEntity);
      const statusEntity = new DataConnectorStatusEntity();
      statusEntity.connectorId = "google_calendar";
      statusEntity.isConnected = true;
      statusEntity.lastConnectedAt = new Date();
      statusEntity.updatedAt = new Date();
      
      await repo.save(statusEntity);

      const result = await connector.connect({ redirectTo: `http://localhost:3000${DATA_CONNECTOR_URLS.AUTH_CALLBACK_PATH}`, userId: "test-user-id" });
      expect(result.success).toBe(true);
      expect(result.authInfo).toBeUndefined();
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
      statusEntity.connectorId = "google_calendar";
      statusEntity.isConnected = true;
      statusEntity.lastConnectedAt = new Date();
      statusEntity.updatedAt = new Date();
      await repo.save(statusEntity);

      // Set up mock access token for load tests
      const dataLoader = (connector as any).dataLoader;
      dataLoader.setTokenPair({ accessToken: "mock-access-token", refreshToken: null });

      // Reset mocks before each test
      vi.clearAllMocks();
    });

    it("should fail to load data without valid access token", async () => {
      // Clear the access token that was set in beforeEach
      const dataLoader = (connector as any).dataLoader;
      dataLoader.setTokenPair({ accessToken: null, refreshToken: null });
      
      // This should fail because we don"t have a valid access token
      await expect(connector.load({})).rejects.toThrow("No access token available. Please authenticate first.");
    });

    it("should load data with valid access token", async () => {
      // Mock Calendar API response
      const mockEventList = {
        data: {
          items: [
            {
              id: "event1",
              summary: "Test Event",
              start: { dateTime: "2024-01-01T10:00:00Z" },
              end: { dateTime: "2024-01-01T11:00:00Z" },
              updated: "2024-01-01T09:00:00Z",
            },
          ],
        },
      };

      mockCalendarListFn.mockResolvedValue(mockEventList);

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
      const eventTable = tableInfos["google_calendar.event"];
      expect(eventTable).toBeDefined();
      
      // This confirms the integration is working correctly
      expect(status?.isConnected).toBe(true);
      
      // Verify API was called
      expect(mockCalendarListFn).toHaveBeenCalled();
    });
  });

  describe("load with sync context", () => {
    it("should handle sync context flow with mocked API using updatedMin", async () => {
      // Create a new connector instance
      const connector = await DataConnector.create(googleCalendarConfig, testDataSource);
      
      // Set up mock access token
      const dataLoader = (connector as any).dataLoader;
      dataLoader.setTokenPair({ accessToken: "mock-access-token", refreshToken: null });
      
      // Set connection status to true
      const repo = testDataSource.getRepository(DataConnectorStatusEntity);
      const statusEntity = new DataConnectorStatusEntity();
      statusEntity.connectorId = "google_calendar";
      statusEntity.isConnected = true;
      statusEntity.lastConnectedAt = new Date();
      statusEntity.updatedAt = new Date();
      await repo.save(statusEntity);
      
      // Mock first load - initial sync with events
      const mockFirstLoad = {
        data: {
          items: [
            {
              id: "event1",
              summary: "Test Event",
              start: { dateTime: "2024-01-01T10:00:00Z" },
              end: { dateTime: "2024-01-01T11:00:00Z" },
              updated: "2024-01-01T09:00:00Z",
            },
          ],
        },
      };

      mockCalendarListFn.mockResolvedValue(mockFirstLoad);
      
      // First load - this should be initial sync (no sync context)
      await connector.load({});
      
      // Check that we got a sync context stored
      let status = await connector.getStatus();
      expect(status?.syncContext).toBeDefined();
      expect(status?.syncContext?.lastEventUpdateTime).toBeDefined();
            
      // Mock second load - incremental sync
      mockCalendarListFn.mockResolvedValue({ data: { items: [] } });
      
      // Second load - this should use the stored update time for incremental sync  
      const secondLoadResult: DataLoadResult = await connector.load({});
      
      expect(secondLoadResult.updatedRecordCount).toBeGreaterThanOrEqual(0);
      
      // Check that sync context was updated (should have lastEventUpdateTime)
      status = await connector.getStatus();
      expect(status?.syncContext).toBeDefined();
      expect(status?.syncContext?.lastEventUpdateTime).toBeDefined();
      expect(status?.lastSyncedAt).toBeDefined();
      expect(status?.isConnected).toBe(true);
    });
  });
  }
);
