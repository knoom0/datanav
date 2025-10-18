import { DataSource } from "typeorm";
import { vi } from "vitest";

import { DataCatalog } from "@/lib/data/catalog";
import { DataConnectorConfig } from "@/lib/data/connector";
import { DataConnectorConfigEntity, DataConnectorStatusEntity } from "@/lib/data/entities";
import { setupSQLiteTestDatabase, teardownSQLiteTestDatabase, getSQLiteTestDataSource } from "@/lib/util/test-util";

describe("DataCatalog", () => {
  let testDataSource: DataSource;
  let catalog: DataCatalog;
  let mockDataLoader1: any;
  let mockDataLoader2: any;

  const mockOpenApiSpec1 = {
    openapi: "3.0.3",
    info: { title: "Test API 1", version: "1.0.0" },
    paths: {},
    components: {
      schemas: {
        TestSchema1: {
          type: "object",
          properties: {
            id: { type: "string" },
            name: { type: "string" }
          },
          required: ["id"]
        }
      }
    }
  };

  const mockOpenApiSpec2 = {
    openapi: "3.0.3",
    info: { title: "Test API 2", version: "1.0.0" },
    paths: {},
    components: {
      schemas: {
        TestSchema2: {
          type: "object",
          properties: {
            id: { type: "string" },
            title: { type: "string" }
          },
          required: ["id"]
        }
      }
    }
  };

  const mockConfig1: DataConnectorConfig = {
    id: "test.source1",
    name: "Test Source 1",
    description: "A test data source for unit testing",
    resources: [{ name: "TestSchema1" }],
    dataLoaderFactory: () => mockDataLoader1
  };

  const mockConfig2: DataConnectorConfig = {
    id: "test.source2",
    name: "Another Test Source",
    description: "Another test source with different data",
    resources: [{ name: "TestSchema2" }],
    dataLoaderFactory: () => mockDataLoader2
  };

  beforeAll(async () => {
    // Setup SQLite test database
    await setupSQLiteTestDatabase();
    testDataSource = getSQLiteTestDataSource();
  });

  afterAll(async () => {
    await teardownSQLiteTestDatabase();
  });

  beforeEach(async () => {
    // Clear config and status data before each test
    await testDataSource.getRepository(DataConnectorConfigEntity).clear();
    await testDataSource.getRepository(DataConnectorStatusEntity).clear();
    
    // Setup mock data loaders
    mockDataLoader1 = {
      openApiSpec: mockOpenApiSpec1,
      authenticate: vi.fn(),
      continueToAuthenticate: vi.fn(),
      getAccessToken: vi.fn(),
      setAccessToken: vi.fn(),
      getAvailableResourceNames: vi.fn(),
      fetch: vi.fn()
    };

    mockDataLoader2 = {
      openApiSpec: mockOpenApiSpec2,
      authenticate: vi.fn(),
      continueToAuthenticate: vi.fn(),
      getAccessToken: vi.fn(),
      setAccessToken: vi.fn(),
      getAvailableResourceNames: vi.fn(),
      fetch: vi.fn()
    };

    catalog = new DataCatalog({ dataSource: testDataSource });
  });

  describe("constructor", () => {
    it("should accept custom connector configs for testing", async () => {
      const customCatalog = new DataCatalog({ 
        dataSource: testDataSource, 
        connectorConfigs: [mockConfig1, mockConfig2] 
      });
      
      const connectorInfos = await customCatalog.getAll();
      expect(connectorInfos).toHaveLength(2); // only mockConfig1 and mockConfig2, no google calendar
      expect(connectorInfos.find(c => c.id === mockConfig1.id)).toBeDefined();
      expect(connectorInfos.find(c => c.id === mockConfig2.id)).toBeDefined();
      expect(connectorInfos.find(c => c.id === "google_calendar")).toBeUndefined();
    });
    
    it("should use default connector configs when no connectorConfigs provided", async () => {
      const defaultCatalog = new DataCatalog({ dataSource: testDataSource });
      
      const connectorInfos = await defaultCatalog.getAll();
      expect(connectorInfos).toHaveLength(3);
      expect(connectorInfos.map(c => c.id)).toContain("google_calendar");
      expect(connectorInfos.map(c => c.id)).toContain("gmail");
      expect(connectorInfos.map(c => c.id)).toContain("youtube");
    });
  });

  describe("getConfig", () => {
    it("should return config for existing connector", async () => {
      const customCatalog = new DataCatalog({ 
        dataSource: testDataSource, 
        connectorConfigs: [mockConfig1] 
      });
      
      const config = await customCatalog.getConfig(mockConfig1.id!);
      expect(config?.id).toBe(mockConfig1.id);
    });
    
    it("should return null for non-existing connector", async () => {
      const config = await catalog.getConfig("non-existing-id");
      expect(config).toBeNull();
    });
    
    it("should return google calendar config by default", async () => {
      const config = await catalog.getConfig("google_calendar");
      expect(config).not.toBeNull();
      expect(config?.id).toBe("google_calendar");
    });
  });

  describe("bundled configs via constructor", () => {
    it("should include bundled connector configs in getAll", async () => {
      const customCatalog = new DataCatalog({ 
        dataSource: testDataSource, 
        connectorConfigs: [mockConfig1] 
      });
      
      const connectorInfos = await customCatalog.getAll();
      expect(connectorInfos).toHaveLength(1); // only mockConfig1
      expect(connectorInfos.find(c => c.id === mockConfig1.id)).toEqual(
        expect.objectContaining({
          id: mockConfig1.id,
          name: mockConfig1.name,
          description: mockConfig1.description,
          isConnected: false,
          lastSyncedAt: null
        })
      );
    });

    it("should include multiple bundled connector configs", async () => {
      const customCatalog = new DataCatalog({ 
        dataSource: testDataSource, 
        connectorConfigs: [mockConfig1, mockConfig2] 
      });
      
      const connectorInfos = await customCatalog.getAll();
      expect(connectorInfos).toHaveLength(2); // mockConfig1 + mockConfig2
      expect(connectorInfos.find(c => c.id === mockConfig1.id)).toEqual(
        expect.objectContaining({
          id: mockConfig1.id,
          name: mockConfig1.name,
          description: mockConfig1.description
        })
      );
      expect(connectorInfos.find(c => c.id === mockConfig2.id)).toEqual(
        expect.objectContaining({
          id: mockConfig2.id,
          name: mockConfig2.name,
          description: mockConfig2.description
        })
      );
    });

    it("should prefer the last config when multiple configs have the same ID", async () => {
      const updatedConfig: DataConnectorConfig = {
        ...mockConfig1,
        name: "Updated Test Source",
      };

      const customCatalog = new DataCatalog({ 
        dataSource: testDataSource, 
        connectorConfigs: [mockConfig1, updatedConfig] 
      });
      
      const connectorInfos = await customCatalog.getAll();
      const updatedConnectorInfo = connectorInfos.find(c => c.id === mockConfig1.id);
      expect(updatedConnectorInfo?.name).toBe("Updated Test Source");
    });
  });

  describe("getAll", () => {
    it("should return default connector configs", async () => {
      const connectorInfos = await catalog.getAll();
      expect(connectorInfos).toHaveLength(3);
      expect(connectorInfos.map(c => c.id)).toContain("google_calendar");
      expect(connectorInfos.map(c => c.id)).toContain("gmail");
      expect(connectorInfos.map(c => c.id)).toContain("youtube");
    });

    it("should return all bundled data connector configs", async () => {
      const customCatalog = new DataCatalog({ 
        dataSource: testDataSource, 
        connectorConfigs: [mockConfig1, mockConfig2] 
      });
      
      const connectorInfos = await customCatalog.getAll();
      expect(connectorInfos).toHaveLength(2); // mockConfig1 + mockConfig2
      expect(connectorInfos.find(c => c.id === mockConfig1.id)).toEqual(
        expect.objectContaining({
          id: mockConfig1.id,
          name: mockConfig1.name,
          description: mockConfig1.description,
          isConnected: false,
          lastSyncedAt: null
        })
      );
      expect(connectorInfos.find(c => c.id === mockConfig2.id)).toEqual(
        expect.objectContaining({
          id: mockConfig2.id,
          name: mockConfig2.name,
          description: mockConfig2.description,
          isConnected: false,
          lastSyncedAt: null
        })
      );
    });

    it("should return a copy of the connector infos array", async () => {
      const customCatalog = new DataCatalog({ 
        dataSource: testDataSource, 
        connectorConfigs: [mockConfig1] 
      });
      
      const connectorInfos1 = await customCatalog.getAll();
      const connectorInfos2 = await customCatalog.getAll();
      
      expect(connectorInfos1).not.toBe(connectorInfos2); // Different array instances
      expect(connectorInfos1).toEqual(connectorInfos2); // Same content
    });
  });

  describe("status integration", () => {
    it("should include status information when available", async () => {
      // Create a status record in the database
      const statusRepo = testDataSource.getRepository(DataConnectorStatusEntity);
      const lastLoadedDate = new Date("2023-01-01T10:00:00Z");
      const status = new DataConnectorStatusEntity();
      status.connectorId = "google_calendar";
      status.isConnected = true;
      status.lastConnectedAt = new Date();
      status.lastSyncedAt = lastLoadedDate;
      status.createdAt = new Date();
      status.updatedAt = new Date();
      await statusRepo.save(status);
      
      const connectorInfos = await catalog.getAll();
      const googleCalendarInfo = connectorInfos.find(c => c.id === "google_calendar");
      
      expect(googleCalendarInfo?.isConnected).toBe(true);
      expect(googleCalendarInfo?.lastSyncedAt).toEqual(lastLoadedDate);
    });
    
    it("should handle missing status gracefully", async () => {
      const customCatalog = new DataCatalog({ 
        dataSource: testDataSource, 
        connectorConfigs: [mockConfig1] 
      });
      
      const connectorInfos = await customCatalog.getAll();
      const testConnectorInfo = connectorInfos.find(c => c.id === mockConfig1.id);
      
      expect(testConnectorInfo?.isConnected).toBe(false);
      expect(testConnectorInfo?.lastSyncedAt).toBeNull();
    });
  });

  describe("addNew", () => {
    it("should add a new connector config to the catalog and database", async () => {
      await catalog.addNew(mockConfig1);
      
      // Verify it's in memory
      const config = await catalog.getConfig(mockConfig1.id!);
      expect(config).toBeDefined();
      expect(config?.id).toBe(mockConfig1.id);
      
      // Verify it appears in getAll
      const connectorInfos = await catalog.getAll();
      expect(connectorInfos.find(c => c.id === mockConfig1.id)).toBeDefined();
    });
    
    it("should auto-generate ID from name if not provided", async () => {
      const configWithoutId: DataConnectorConfig = {
        name: "Gmail Messages",
        description: "Test Gmail connector",
        resources: [{ name: "Message" }],
        dataLoaderFactory: () => mockDataLoader1
      };
      
      await catalog.addNew(configWithoutId);
      
      // ID should now be set and follow the pattern: lowercase_name_with_underscores_<6char-suffix>
      expect(configWithoutId.id).toBeTruthy();
      expect(configWithoutId.id).toMatch(/^gmail_messages_[a-z0-9]{6}$/);
      
      // Verify it was saved
      const config = await catalog.getConfig(configWithoutId.id!);
      expect(config).toBeDefined();
      expect(config?.name).toBe("Gmail Messages");
    });
    
    it("should generate unique IDs for connectors with the same name", async () => {
      const config1: DataConnectorConfig = {
        name: "Test Connector",
        description: "First test connector",
        resources: [{ name: "Resource1" }],
        dataLoaderFactory: () => mockDataLoader1
      };
      
      const config2: DataConnectorConfig = {
        name: "Test Connector",
        description: "Second test connector",
        resources: [{ name: "Resource2" }],
        dataLoaderFactory: () => mockDataLoader2
      };
      
      await catalog.addNew(config1);
      await catalog.addNew(config2);
      
      // Both should have IDs with the same prefix but different suffixes
      expect(config1.id).toBeTruthy();
      expect(config2.id).toBeTruthy();
      expect(config1.id).toMatch(/^test_connector_[a-z0-9]{6}$/);
      expect(config2.id).toMatch(/^test_connector_[a-z0-9]{6}$/);
      expect(config1.id).not.toBe(config2.id);
    });
    
    it("should reject duplicate connector IDs", async () => {
      await catalog.addNew(mockConfig1);
      
      // Attempt to add the same connector again
      await expect(catalog.addNew(mockConfig1)).rejects.toThrow("already exists");
    });
    
    it("should reject adding a connector with an existing pre-defined ID", async () => {
      const duplicateConfig: DataConnectorConfig = {
        ...mockConfig1,
        id: "google_calendar"
      };
      
      await expect(catalog.addNew(duplicateConfig)).rejects.toThrow("already exists");
    });
  });
});
