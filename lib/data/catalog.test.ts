import { DataSource } from "typeorm";
import { vi } from "vitest";

import { DataCatalog } from "@/lib/data/catalog";
import { DataConnectorConfig } from "@/lib/data/connector";
import { DataConnectorStatusEntity } from "@/lib/data/entities";
import { setupSQLiteTestDatabase, teardownSQLiteTestDatabase, getSQLiteTestDataSource } from "@/lib/util/test-util";

describe("DataCatalog", () => {
  let testDataSource: DataSource;
  let catalog: DataCatalog;
  let mockDataLoader1: any;
  let mockDataLoader2: any;

  const mockConfig1: DataConnectorConfig = {
    id: "test.source1",
    name: "Test Source 1",
    description: "A test data source for unit testing",
    openApiSpec: {
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
    } as any,
    resourceNames: ["TestSchema1"],
    dataLoaderFactory: () => mockDataLoader1
  };

  const mockConfig2: DataConnectorConfig = {
    id: "test.source2",
    name: "Another Test Source",
    description: "Another test source with different data",
    openApiSpec: {
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
    } as any,
    resourceNames: ["TestSchema2"],
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
    // Clear status data before each test
    await testDataSource.getRepository(DataConnectorStatusEntity).clear();
    
    // Setup mock data loaders
    mockDataLoader1 = {
      authenticate: vi.fn(),
      continueToAuthenticate: vi.fn(),
      getAccessToken: vi.fn(),
      setAccessToken: vi.fn(),
      fetch: vi.fn()
    };

    mockDataLoader2 = {
      authenticate: vi.fn(),
      continueToAuthenticate: vi.fn(),
      getAccessToken: vi.fn(),
      setAccessToken: vi.fn(),
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
    it("should return config for existing connector", () => {
      catalog.register(mockConfig1);
      
      const config = catalog.getConfig(mockConfig1.id);
      expect(config).toBe(mockConfig1);
    });
    
    it("should return null for non-existing connector", () => {
      const config = catalog.getConfig("non-existing-id");
      expect(config).toBeNull();
    });
    
    it("should return google calendar config by default", () => {
      const config = catalog.getConfig("google_calendar");
      expect(config).not.toBeNull();
      expect(config?.id).toBe("google_calendar");
    });
  });

  describe("register", () => {
    it("should register a data connector config successfully", async () => {
      // Note: catalog already has google calendar + gmail + youtube configs registered in constructor
      catalog.register(mockConfig1);
      
      const connectorInfos = await catalog.getAll();
      expect(connectorInfos).toHaveLength(4); // google calendar + gmail + youtube + mockConfig1
      expect(connectorInfos.find(c => c.id === mockConfig1.id)).toEqual(
        expect.objectContaining({
          id: mockConfig1.id,
          name: mockConfig1.name,
          description: mockConfig1.description,
          isConnected: false,
          lastLoadedAt: null
        })
      );
    });

    it("should register multiple data connector configs", async () => {
      catalog.register(mockConfig1);
      catalog.register(mockConfig2);
      
      const connectorInfos = await catalog.getAll();
      expect(connectorInfos).toHaveLength(5); // google calendar + gmail + youtube + mockConfig1 + mockConfig2
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

    it("should overwrite data connector config with same ID", async () => {
      const updatedConfig: DataConnectorConfig = {
        ...mockConfig1,
        name: "Updated Test Source",
      };

      catalog.register(mockConfig1);
      catalog.register(updatedConfig);
      
      const connectorInfos = await catalog.getAll();
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

    it("should return all registered data connector configs", async () => {
      catalog.register(mockConfig1);
      catalog.register(mockConfig2);
      
      const connectorInfos = await catalog.getAll();
      expect(connectorInfos).toHaveLength(5); // google calendar + gmail + youtube + mockConfig1 + mockConfig2
      expect(connectorInfos.find(c => c.id === mockConfig1.id)).toEqual(
        expect.objectContaining({
          id: mockConfig1.id,
          name: mockConfig1.name,
          description: mockConfig1.description,
          isConnected: false,
          lastLoadedAt: null
        })
      );
      expect(connectorInfos.find(c => c.id === mockConfig2.id)).toEqual(
        expect.objectContaining({
          id: mockConfig2.id,
          name: mockConfig2.name,
          description: mockConfig2.description,
          isConnected: false,
          lastLoadedAt: null
        })
      );
    });

    it("should return a copy of the connector infos array", async () => {
      catalog.register(mockConfig1);
      
      const connectorInfos1 = await catalog.getAll();
      const connectorInfos2 = await catalog.getAll();
      
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
      status.lastLoadedAt = lastLoadedDate;
      status.createdAt = new Date();
      status.updatedAt = new Date();
      await statusRepo.save(status);
      
      const connectorInfos = await catalog.getAll();
      const googleCalendarInfo = connectorInfos.find(c => c.id === "google_calendar");
      
      expect(googleCalendarInfo?.isConnected).toBe(true);
      expect(googleCalendarInfo?.lastLoadedAt).toEqual(lastLoadedDate);
    });
    
    it("should handle missing status gracefully", async () => {
      catalog.register(mockConfig1);
      
      const connectorInfos = await catalog.getAll();
      const testConnectorInfo = connectorInfos.find(c => c.id === mockConfig1.id);
      
      expect(testConnectorInfo?.isConnected).toBe(false);
      expect(testConnectorInfo?.lastLoadedAt).toBeNull();
    });
  });
});
