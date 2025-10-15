import { DataSource } from "typeorm";

import { DataCatalog } from "@/lib/data/catalog";
import { DataConnectorConfig } from "@/lib/data/connector";
import { DataConnectorStatusEntity } from "@/lib/data/entities";
import { DataConnectorTool, type AskToConnectResult } from "@/lib/data/tool";
import {
  setupTestDatabase,
  teardownTestDatabase,
  type TestDatabaseSetup
} from "@/lib/util/test-util";


// Mock connector config for testing
const mockConnectorConfig: DataConnectorConfig = {
  id: "test_connector",
  name: "Test Connector",
  description: "Test connector for unit testing",
  openApiSpec: { openapi: "3.0.0", info: { title: "Test", version: "1.0" }, paths: {} },
  resourceNames: ["TestResource"],
  dataLoaderFactory: () => ({} as any)
};

describe("DataConnectorTool", () => {
  let testDbSetup: TestDatabaseSetup;
  let testDataSource: DataSource;
  let dataCatalog: DataCatalog;
  let tool: DataConnectorTool;
  let statusRepo: any;

  beforeAll(async () => {
    testDbSetup = await setupTestDatabase();
    testDataSource = testDbSetup.dataSource;
  }, 60000);

  afterAll(async () => {
    await teardownTestDatabase(testDbSetup);
  });

  beforeEach(async () => {
    // Clear status data before each test
    await testDataSource.getRepository(DataConnectorStatusEntity).clear();
    
    dataCatalog = new DataCatalog({ 
      dataSource: testDataSource, 
      connectorConfigs: [mockConnectorConfig] 
    });
    tool = new DataConnectorTool({ dataCatalog });
    statusRepo = testDataSource.getRepository(DataConnectorStatusEntity);
  });

  describe("list operation", () => {
    it("should return available connectors", async () => {
      const resultJson = await tool.execute({ operation: "list" });
      const result = JSON.parse(resultJson);
      
      expect(result).toEqual({
        connectors: [{
          id: "test_connector",
          name: "Test Connector",
          description: "Test connector for unit testing",
          isConnected: false,
          isLoading: false,
          lastLoadedAt: null,
          dataJobId: null,
          lastDataJob: null
        }]
      });
    });
  });

  describe("askToConnect operation", () => {
    it("should return error for unknown connector", async () => {
      const resultJson = await tool.execute({ operation: "ask_to_connect", connectorId: "unknown" });
      const result = JSON.parse(resultJson);
      
      expect(result.error).toContain("Connector with ID 'unknown' not found");
    });

    it("should handle user connecting during wait period", async () => {
      // Start the askToConnect process in background
      const resultPromise = tool.execute({ 
        operation: "ask_to_connect", 
        connectorId: "test_connector" 
      });

      // Simulate user connecting after a short delay
      setTimeout(async () => {
        await statusRepo.upsert({
          connectorId: "test_connector",
          isConnected: true,
          updatedAt: new Date()
        }, ["connectorId"]);
      }, 100);

      const resultJson = await resultPromise;
      const result = JSON.parse(resultJson) as AskToConnectResult;

      expect(result.success).toBe(true);
      expect(result.isConnected).toBe(true);
      expect(result.connectorId).toBe("test_connector");
      expect(result.message).toMatch(/User successfully connected to Test Connector \(connected in \d+s\)/);
      
      // Verify the askedToConnectUntil flag was cleared
      const finalStatus = await statusRepo.findOne({ 
        where: { connectorId: "test_connector" } 
      });
      expect(finalStatus?.askedToConnectUntil).toBeNull();
    });

    it("should handle user explicitly responding without connecting", async () => {
      // Start the askToConnect process in background
      const resultPromise = tool.execute({ 
        operation: "ask_to_connect", 
        connectorId: "test_connector" 
      });

      // Simulate user declining connection after a short delay
      setTimeout(async () => {
        await statusRepo.upsert({
          connectorId: "test_connector",
          isConnected: false,
          askedToConnectUntil: null, // Clear the flag to indicate user responded
          updatedAt: new Date()
        }, ["connectorId"]);
      }, 100);

      const resultJson = await resultPromise;
      const result = JSON.parse(resultJson) as AskToConnectResult;

      expect(result.success).toBe(true);
      expect(result.isConnected).toBe(false);
      expect(result.connectorId).toBe("test_connector");
      expect(result.message).toMatch(/User declined or failed to connect to Test Connector \(responded in \d+s\)/);
    });

    it("should use custom timeout when provided", async () => {
      const customTimeoutSeconds = 10;
      const customTool = new DataConnectorTool({ 
        dataCatalog,
        askToConnectTimeoutSeconds: customTimeoutSeconds
      });
      
      // Check that the timeout is set correctly by starting the process and checking the database
      const resultPromise = customTool.execute({ 
        operation: "ask_to_connect", 
        connectorId: "test_connector" 
      });

      // Let the process start and set the timeout
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Check the timeout date in the database
      const status = await statusRepo.findOne({ where: { connectorId: "test_connector" } });
      expect(status?.askedToConnectUntil).toBeDefined();
      
      const timeoutDiff = status!.askedToConnectUntil!.getTime() - new Date().getTime();
      const expectedTimeoutMs = customTimeoutSeconds * 1000;
      
      // Allow for some variance (±2 seconds) due to timing
      expect(timeoutDiff).toBeGreaterThan(expectedTimeoutMs - 2000);
      expect(timeoutDiff).toBeLessThan(expectedTimeoutMs + 2000);
      
      // Clean up by connecting to stop the polling
      await statusRepo.upsert({
        connectorId: "test_connector",
        isConnected: true,
        updatedAt: new Date()
      }, ["connectorId"]);
      
      await resultPromise; // Wait for completion
    });

  });
});
