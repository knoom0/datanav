import { DataSource, type DataSourceOptions } from "typeorm";

import { DataConnectorStatusEntity } from "@/lib/data/entities";
import logger from "@/lib/logger";

/**
 * Configuration options for polling function
 */
export interface PollOptions<T> {
  /** Function to call on each poll. Return truthy value to stop polling, falsy to continue. */
  callback: () => T | Promise<T>;
  /** Timeout in milliseconds - required */
  timeoutMs: number;
  /** Delay in milliseconds between polling attempts (default: 100ms) */
  pollIntervalMs?: number;
}

/**
 * Generic polling function that calls a callback function repeatedly until it returns a truthy value or timeout occurs.
 * 
 * @param options - Configuration options including callback and polling behavior
 * @returns Promise that resolves with the callback"s return value when it returns truthy, or null on timeout
 * 
 * @example
 * // Wait for a file to exist
 * const fileExists = await poll({
 *   callback: () => fs.existsSync("/path/to/file"),
 *   timeoutMs: 5000
 * });
 * 
 * @example
 * // Wait for an API to return specific data
 * const userData = await poll({
 *   callback: async () => {
 *     const response = await fetch("/api/user");
 *     const data = await response.json();
 *     return data.status === "ready" ? data : null;
 *   },
 *   timeoutMs: 10000,
 *   pollIntervalMs: 500
 * });
 * 
 * @example
 * // Wait for database entity change
 * const connectedStatus = await poll({
 *   callback: async () => {
 *     const repo = dataSource.getRepository(DataConnectorStatusEntity);
 *     const entity = await repo.findOne({ where: { connectorId: "google_calendar' } });
 *     return entity?.isConnected ? entity : null;
 *   },
 *   timeoutMs: 5000
 * });
 */
export async function poll<T>(options: PollOptions<T>): Promise<T | null> {
  const {
    callback,
    timeoutMs,
    pollIntervalMs = 100
  } = options;

  const startTime = Date.now();
  
  while ((Date.now() - startTime) < timeoutMs) {
    const result = await callback();
    
    if (result) {
      return result;
    }
    
    await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
  }
  
  logger.warn(`poll timed out after ${timeoutMs}ms`);
  return null;
}

/**
 * Simulates a user connecting to a data connector during an agent iteration.
 * This function waits for the agent to initiate a connection request and then
 * simulates the user successfully connecting.
 */
export async function simulateUserConnection(
  dataSource: DataSource,
  connectorId: string,
  delayMs: number = 2000
): Promise<void> {
  // Wait a bit to let the agent start asking for connection
  await new Promise(resolve => setTimeout(resolve, delayMs));
  
  // Simulate user connecting by updating the database status
  const statusRepo = dataSource.getRepository(DataConnectorStatusEntity);
  
  logger.info(`Simulating user connecting to ${connectorId} connector`);
  
  await statusRepo.upsert(
    {
      connectorId,
      isConnected: true,
      accessToken: "test_access_token",
      refreshToken: "test_refresh_token",
      askedToConnectUntil: null, // Clear the timeout flag to indicate user responded
      updatedAt: new Date()
    },
    ["connectorId"]
  );
}

/**
 * Simulates a user declining to connect to a data connector during an agent iteration.
 * This function waits for the agent to initiate a connection request and then
 * simulates the user declining the connection.
 */
export async function simulateUserDecline(
  dataSource: DataSource,
  connectorId: string
): Promise<void> {
  logger.info(`Waiting for ask_to_connect request to be initiated for ${connectorId}`);
  
  // Wait for the ask_to_connect to set the askedToConnectUntil field
  // Use a longer timeout since the agent may need time to discover connectors and decide to ask
  const status = await poll({
    callback: async () => {
      const repo = dataSource.getRepository(DataConnectorStatusEntity);
      const entity = await repo.findOne({ where: { connectorId } });
      return entity?.askedToConnectUntil ? entity : null;
    },
    timeoutMs: 30000, // Increased from 5000ms to 30000ms
    pollIntervalMs: 100
  });
  
  if (!status) {
    logger.error(`Timeout waiting for ask_to_connect request to be initiated for ${connectorId}`);
    return;
  }
  
  logger.info(`Ask to connect request detected for ${connectorId}, simulating user decline`);
  
  // Now simulate user declining by clearing the timeout and setting isConnected to false
  const statusRepo = dataSource.getRepository(DataConnectorStatusEntity);
  await statusRepo.update(
    { connectorId },
    {
      isConnected: false,
      accessToken: null,
      refreshToken: null,
      askedToConnectUntil: null, // Clear the timeout flag to indicate user responded
      updatedAt: new Date()
    }
  );
  logger.info(`Successfully set user decline status for ${connectorId}`);
}

/**
 * Clears all connector status entries from the database.
 * Useful for test cleanup between test cases.
 */
export async function clearConnectorStatus(dataSource: DataSource): Promise<void> {
  const statusRepo = dataSource.getRepository(DataConnectorStatusEntity);
  await statusRepo.clear();
}

/**
 * Creates a PostgreSQL schema if it doesn't exist.
 * This function creates a temporary DataSource connection to execute the schema creation
 * before the main DataSource with entities is initialized.
 */
export async function createSchemaIfNotExist(options: {
  dataSourceOptions: DataSourceOptions;
  schemaName: string;
}): Promise<void> {
  const { dataSourceOptions, schemaName } = options;
  
  // Create a temporary connection without entities to create the schema
  const tempDataSource = new DataSource({
    ...dataSourceOptions,
    entities: [], // No entities needed for schema creation
    synchronize: false, // Don't synchronize tables yet
  });

  try {
    await tempDataSource.initialize();
    
    // Create the schema if it doesn't exist
    await tempDataSource.query(`CREATE SCHEMA IF NOT EXISTS ${schemaName}`);
  } finally {
    if (tempDataSource.isInitialized) {
      await tempDataSource.destroy();
    }
  }
}
