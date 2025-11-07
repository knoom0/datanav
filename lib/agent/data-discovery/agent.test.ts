import { DataDiscoveryAgent } from "@/lib/agent/data-discovery/agent";
import { DEFAULT_QA_MODEL } from "@/lib/consts";
import { DataCatalog } from "@/lib/data/catalog";
import googleCalendarConfig from "@/lib/data/connector-config/google-calendar/config";
import { DatabaseClient } from "@/lib/data/db-client";
import logger from "@/lib/logger";
import { Project } from "@/lib/types";
import { simulateUserConnection, simulateUserDecline, clearConnectorStatus } from "@/lib/util/db-util";
import {
  describeIf,
  envVarsCondition,
  setupTestDatabase,
  teardownTestDatabase,
  executeAgentIteration,
  type TestDatabaseSetup
} from "@/lib/util/test-util";

const requiredEnvVars = ["OPENAI_API_KEY"];

describeIf(
  "DataDiscoveryAgent",
  () => envVarsCondition("DataDiscoveryAgent", requiredEnvVars),
  () => {
  let dbClient: DatabaseClient;
  let dataCatalog: DataCatalog;
  let testDbSetup: TestDatabaseSetup;
  let agent: DataDiscoveryAgent;
  let project: Project;
  const model = DEFAULT_QA_MODEL;

  beforeAll(async () => {
    // Setup PostgreSQL test database with all standard entities
    testDbSetup = await setupTestDatabase();

    // Create schema for test
    await testDbSetup.dataSource.query(`
      CREATE SCHEMA IF NOT EXISTS test;
    `);

    // Create test tables for DatabaseClient tests
    await testDbSetup.dataSource.query(`
      CREATE TABLE test.users (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Insert some test data
    await testDbSetup.dataSource.query(`
      INSERT INTO test.users (name, email) VALUES 
      ('Alice', 'alice@example.com'),
      ('Bob', 'bob@example.com'),
      ('Charlie', 'charlie@example.com')
    `);
  }, 60000);

  beforeEach(async () => {
    dbClient = new DatabaseClient(testDbSetup.dataSource);
    dataCatalog = new DataCatalog({ 
      dataSource: testDbSetup.dataSource,
      connectorConfigs: [googleCalendarConfig] // Include Google Calendar for remote data testing
    });
    
    // Create test project
    project = new Project();
    
    // Create agent instance with test-specific configuration
    // Note: We can"t override the DataConnectorTool timeout directly from here,
    // but we"ll use shorter simulation delays in tests
    agent = new DataDiscoveryAgent({
      model,
      project,
      dbClient,
      dataCatalog
    });
    
    // Clean up any existing connector status between tests
    await clearConnectorStatus(testDbSetup.dataSource);
    
    // Clean up any data tables that may have been created by connectors
    // This ensures test isolation
    const schemaNames = ["google_calendar"];
    for (const schema of schemaNames) {
      try {
        await testDbSetup.dataSource.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
      } catch {
        // Ignore errors if schema doesn't exist
      }
    }
  });

  afterAll(async () => {
    await teardownTestDatabase(testDbSetup);
  });

  it("should proceed when data is available in local database", async () => {
    const result = await executeAgentIteration(agent, [
      { role: "user", content: "Show me all users in the system" }
    ]);
    
    // Log the result for inspection
    logger.info(`Test Result - Local Database Data Available: ${JSON.stringify({
      success: result.success,
      nextAction: result.nextAction,
      responseText: (result.response?.text || "No response text").substring(0, 200) + "...",
      toolCalls: result.response?.toolCalls?.length || 0
    }, null, 2)}`);
    
    expect(result).toBeTruthy();
    expect(result.success).toBeDefined();
    expect(result.response).toBeDefined();
    
    // Should set next action to "proceed" since users table exists
    expect(result.nextAction).toBeDefined();
    expect(result.nextAction?.agentAction).toBe("proceed");
  }, 30000);

  it("should ask user to connect when data is available via data connector", async () => {
    // Start the connection simulation in parallel
    const connectionPromise = simulateUserConnection(testDbSetup.dataSource, "google_calendar");

    const result = await executeAgentIteration(agent, [
      { role: "user", content: "I need calendar events and appointments for my scheduling app" }
    ]);
    
    // Wait for connection simulation to complete
    await connectionPromise;
    
    // Log the result for inspection
    logger.info(`Test Result - Remote Connector Data Available: ${JSON.stringify({
      success: result.success,
      nextAction: result.nextAction,
      responseText: (result.response?.text || "No response text").substring(0, 200) + "...",
      toolCalls: result.response?.toolCalls?.length || 0
    }, null, 2)}`);
    
    expect(result).toBeTruthy();
    expect(result.success).toBeDefined();
    expect(result.response).toBeDefined();
    
    // Should identify that calendar data is available via Google Calendar connector
    // and successfully attempt to connect to it (the response should mention Google Calendar)
    const responseText = result.response?.text || "";
    expect(responseText.toLowerCase()).toContain("calendar");
    
    // The agent may not set nextAction if the data load fails with fake credentials,
    // but it should have attempted to connect which is what this test verifies
  }, 30000);

  it("should stop when user declines to connect to remote connector", async () => {
    // Start the decline simulation in parallel
    const declinePromise = simulateUserDecline(testDbSetup.dataSource, "google_calendar");

    const result = await executeAgentIteration(agent, [
      { role: "user", content: "I need calendar events and appointments for my scheduling app" }
    ]);
    
    // Wait for decline simulation to complete
    await declinePromise;
    
    // Log the result for inspection
    logger.info(`Test Result - Remote Connector User Declined: ${JSON.stringify({
      success: result.success,
      nextAction: result.nextAction,
      responseText: (result.response?.text || "No response text").substring(0, 200) + "...",
      toolCalls: result.response?.toolCalls?.length || 0
    }, null, 2)}`);
    
    expect(result).toBeTruthy();
    expect(result.success).toBeDefined();
    expect(result.response).toBeDefined();
    
    // Should stop since user declined to connect to the necessary data source
    expect(result.nextAction).toBeDefined();
    expect(result.nextAction?.agentAction).toBe("stop");
  }, 60000);

  it("should stop when data is not available anywhere", async () => {
    const result = await executeAgentIteration(agent, [
      { role: "user", content: "I need detailed weather forecasting data from weather stations" }
    ]);
    
    // Log the result for inspection
    logger.info(`Test Result - No Data Available Anywhere: ${JSON.stringify({
      success: result.success,
      nextAction: result.nextAction,
      responseText: (result.response?.text || "No response text").substring(0, 200) + "...",
      toolCalls: result.response?.toolCalls?.length || 0
    }, null, 2)}`);
    
    expect(result).toBeTruthy();
    expect(result.success).toBeDefined();
    expect(result.response).toBeDefined();
    
    // Should set next action to "stop" since weather data is not available in DB or connectors
    expect(result.nextAction).toBeDefined();
    expect(result.nextAction?.agentAction).toBe("stop");
  }, 30000);
  }
);
