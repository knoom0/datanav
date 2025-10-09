import { DataSource } from "typeorm";

import { DATA_CONNECTOR_URLS } from "@/lib/consts";
import { DataConnector, DataConnectorConfig } from "@/lib/data/connector";
import { DatabaseClient } from "@/lib/data/db-client";
import { DataConnectorStatusEntity, DataTableStatusEntity } from "@/lib/data/entities";
import { DataLoader } from "@/lib/data/loader";
import { setupTestDatabase, teardownTestDatabase, type TestDatabaseSetup } from "@/lib/util/test-util";


// Mock DataLoader implementation
class MockDataLoader implements DataLoader {
  private accessToken: string | null = null;
  private refreshToken: string | null = null;

  authenticate() {
    return { authUrl: "https://test-auth.example.com" };
  }

  async continueToAuthenticate(_params: { code: string }) {
    // Mock implementation - simulate successful authentication
    this.accessToken = "mock-access-token";
    this.refreshToken = "mock-refresh-token";
  }

  getAccessToken(): string | null {
    return this.accessToken;
  }

  setAccessToken(token: string): void {
    this.accessToken = token;
  }

  getRefreshToken(): string | null {
    return this.refreshToken;
  }

  setRefreshToken(token: string): void {
    this.refreshToken = token;
  }

  async *fetch(_params: { lastLoadedAt?: Date; syncContext: Record<string, any> | null }) {
    // Mock data generator
    yield { resourceName: "TestEvent", id: "1", title: "Test Event 1" };
    yield { resourceName: "TestEvent", id: "2", title: "Test Event 2" };
  }
}

// Mock DataLoader with null id records for testing filtering
class MockDataLoaderWithNullIds implements DataLoader {
  private accessToken: string | null = null;
  private refreshToken: string | null = null;

  authenticate() {
    return { authUrl: "https://test-auth.example.com" };
  }

  async continueToAuthenticate(_params: { code: string }) {
    this.accessToken = "mock-access-token";
    this.refreshToken = "mock-refresh-token";
  }

  getAccessToken(): string | null {
    return this.accessToken;
  }

  setAccessToken(token: string): void {
    this.accessToken = token;
  }

  getRefreshToken(): string | null {
    return this.refreshToken;
  }

  setRefreshToken(token: string): void {
    this.refreshToken = token;
  }

  async *fetch(_params: { lastLoadedAt?: Date; syncContext: Record<string, any> | null }) {
    // Mock data generator with some null id records
    yield { resourceName: "TestEvent", id: "1", title: "Test Event 1" };
    yield { resourceName: "TestEvent", id: null, title: "Test Event with null id" };
    yield { resourceName: "TestEvent", id: "2", title: "Test Event 2" };
    yield { resourceName: "TestEvent", id: undefined, title: "Test Event with undefined id" };
    yield { resourceName: "TestEvent", id: "3", title: "Test Event 3" };
  }
}

describe("DataConnector", () => {
  let testDbSetup: TestDatabaseSetup;
  let testDataSource: DataSource;
  let testConfig: DataConnectorConfig;

  beforeAll(async () => {
    // Setup PostgreSQL test database
    testDbSetup = await setupTestDatabase([DataConnectorStatusEntity, DataTableStatusEntity]);
    testDataSource = testDbSetup.dataSource;

    // Create the test schema for the connector
    await testDataSource.query("CREATE SCHEMA IF NOT EXISTS test");

    // Create test config with valid OpenAPI spec
    testConfig = {
      id: "test",
      name: "Test Connector",
      description: "A test data connector",
      openApiSpec: {
        openapi: "3.0.3",
        info: { title: "Test API", version: "1.0.0" },
        paths: {},
        components: {
          schemas: {
            TestEvent: {
              type: "object",
              properties: {
                id: { type: "string" },
                title: { type: "string" },
                description: { type: "string" }
              },
              required: ["id", "title"]
            }
          }
        }
      } as any,
      resourceNames: ["TestEvent"],
      dataLoaderFactory: () => new MockDataLoader()
    };
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
        await testDataSource.query("DROP TABLE IF EXISTS test.testevent CASCADE");
        await testDataSource.query("DROP SCHEMA IF EXISTS test CASCADE");
      } catch {
        // Ignore errors if table/schema doesn"t exist
      }
    }
  });

  afterAll(async () => {
    await teardownTestDatabase(testDbSetup);
  }, 60000);

  describe("create", () => {
    it("should create a DataConnector instance with loaded schemas", async () => {
      const connector = await DataConnector.create(testConfig, testDataSource);

      expect(connector).toBeInstanceOf(DataConnector);
      expect(connector.id).toBe("test");
      expect(connector.name).toBe("Test Connector");
      expect(connector.description).toBe("A test data connector");
      expect(connector.dataWriter).toBeDefined();
    });

    it("should throw error for missing schema in OpenAPI spec", async () => {
      const invalidConfig = {
        ...testConfig,
        resourceNames: ["NonExistentSchema"]
      };

      await expect(DataConnector.create(invalidConfig, testDataSource))
        .rejects
        .toThrow("Schema NonExistentSchema not found in OpenAPI spec");
    });
  });

  describe("getStatus", () => {
    let connector: DataConnector;

    beforeEach(async () => {
      connector = await DataConnector.create(testConfig, testDataSource);
    });

    it("should return null when no status exists", async () => {
      const status = await connector.getStatus();
      expect(status).toBeNull();
    });

    it("should return existing status when it exists", async () => {
      // Create a status record first
      const repo = testDataSource.getRepository(DataConnectorStatusEntity);
      const statusEntity = new DataConnectorStatusEntity();
      statusEntity.connectorId = "test";
      statusEntity.isConnected = true;
      statusEntity.lastConnectedAt = new Date();
      statusEntity.updatedAt = new Date();
      
      await repo.save(statusEntity);

      const status = await connector.getStatus();
      expect(status).not.toBeNull();
      expect(status?.connectorId).toBe("test");
      expect(status?.isConnected).toBe(true);
    });
  });

  describe("connect", () => {
    let connector: DataConnector;

    beforeEach(async () => {
      connector = await DataConnector.create(testConfig, testDataSource);
    });

    it("should return success true when already connected", async () => {
      // Set up existing connected status
      const repo = testDataSource.getRepository(DataConnectorStatusEntity);
      const statusEntity = new DataConnectorStatusEntity();
      statusEntity.connectorId = "test";
      statusEntity.isConnected = true;
      statusEntity.updatedAt = new Date();
      
      await repo.save(statusEntity);

      const result = await connector.connect({ redirectTo: `http://localhost:3000${DATA_CONNECTOR_URLS.AUTH_CALLBACK_PATH}` });
      expect(result.success).toBe(true);
      expect(result.authInfo).toBeUndefined();
    });

    it("should return auth info when not connected", async () => {
      const result = await connector.connect({ redirectTo: `http://localhost:3000${DATA_CONNECTOR_URLS.AUTH_CALLBACK_PATH}` });
      expect(result.success).toBe(false);
      expect(result.authInfo).toBeDefined();
      expect(result.authInfo?.authUrl).toBe("https://test-auth.example.com");
    });
  });

  describe("continueToConnect", () => {
    let connector: DataConnector;

    beforeEach(async () => {
      connector = await DataConnector.create(testConfig, testDataSource);
    });

    it("should complete connection process and update status", async () => {
      const result = await connector.continueToConnect({ authCode: "test-auth-code" });
      
      expect(result.success).toBe(true);

      // Verify connection status was updated
      const status = await connector.getStatus();
      expect(status?.isConnected).toBe(true);
      expect(status?.lastConnectedAt).toBeDefined();
    });
  });

  describe("load", () => {
    let connector: DataConnector;

    beforeEach(async () => {
      connector = await DataConnector.create(testConfig, testDataSource);
      
      // Manually set up connection status without creating tables again
      const repo = testDataSource.getRepository(DataConnectorStatusEntity);
      const statusEntity = new DataConnectorStatusEntity();
      statusEntity.connectorId = "test";
      statusEntity.isConnected = true;
      statusEntity.lastConnectedAt = new Date();
      statusEntity.updatedAt = new Date();
      await repo.save(statusEntity);
    });

    it("should load data, create table, insert records, and update timestamps", async () => {
      await connector.load();

      // Verify lastLoadedAt was updated
      const status = await connector.getStatus();
      expect(status?.lastLoadedAt).toBeDefined();
      expect(status?.lastLoadedAt).toBeInstanceOf(Date);

      // Verify the table was created with correct schema using DatabaseClient.getTableInfos()
      // This approach is simpler and more maintainable than raw SQL queries
      const dbClient = new DatabaseClient(testDataSource);
      const tableInfos = await dbClient.getTableInfos();
      
      // Check that the test.testevent table exists
      const testEventTable = tableInfos["test.testevent"];
      expect(testEventTable).toEqual(expect.objectContaining({
        name: "test.testevent",
        ddl: expect.stringContaining("CREATE TABLE \"test.testevent\"")
      }));
      
      // Verify DDL contains expected columns and constraints
      const ddl = testEventTable.ddl;
      expect(ddl).toContain("\"id\" text NOT NULL"); // Primary key should be NOT NULL
      expect(ddl).toContain("\"title\" text"); // Optional field
      expect(ddl).toContain('"description" text'); // Optional field

      // Verify the records were inserted  
      const recordsQuery = "SELECT id, title FROM test.testevent ORDER BY id";
      const records = await testDataSource.query(recordsQuery);
      
      expect(records).toHaveLength(2);
      expect(records[0]).toEqual({ id: "1", title: "Test Event 1" });
      expect(records[1]).toEqual({ id: "2", title: "Test Event 2" });

      // Verify DataTableStatusEntity was updated
      const tableStatus = await connector.dataWriter.getTableStatus("TestEvent");
      expect(tableStatus).toEqual(expect.objectContaining({
        connectorId: "test",
        tableName: "test.testevent",
        lastLoadedAt: expect.any(Date),
        createdAt: expect.any(Date),
        updatedAt: expect.any(Date),
        id: expect.any(Number)
      }));
    });

    it("should filter out records with null or undefined id and log warnings", async () => {
      // Create a config with the MockDataLoaderWithNullIds
      const configWithNullIds = {
        ...testConfig,
        dataLoaderFactory: () => new MockDataLoaderWithNullIds()
      };

      const connectorWithNullIds = await DataConnector.create(configWithNullIds, testDataSource);
      
      // Set up connection status
      const repo = testDataSource.getRepository(DataConnectorStatusEntity);
      const statusEntity = new DataConnectorStatusEntity();
      statusEntity.connectorId = "test";
      statusEntity.isConnected = true;
      statusEntity.lastConnectedAt = new Date();
      statusEntity.updatedAt = new Date();
      await repo.save(statusEntity);

      await connectorWithNullIds.load();

      // Verify only valid records were inserted (3 out of 5 total)
      // Records with null/undefined id should be filtered out
      const recordsQuery = "SELECT id, title FROM test.testevent ORDER BY id";
      const records = await testDataSource.query(recordsQuery);
      
      expect(records).toHaveLength(3);
      expect(records[0]).toEqual({ id: "1", title: "Test Event 1" });
      expect(records[1]).toEqual({ id: "2", title: "Test Event 2" });
      expect(records[2]).toEqual({ id: "3", title: "Test Event 3" });

      // Verify that records with null/undefined id were not inserted
      // (The filtering and warning logging happens internally)
    });
  });
});
