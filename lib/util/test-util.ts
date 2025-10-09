import { PostgreSqlContainer, StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { createUIMessageStream, type ModelMessage, type UIMessageStreamWriter } from "ai";
import { DataSource, type DataSourceOptions } from "typeorm";

import { agentStreamToMessage, type EvoAgentBase, type IterationResult } from "@/lib/agent/core/agent";
import { ENTITIES, SCHEMA_NAME } from "@/lib/data/entities";
import { createSchemaIfNotExist } from "@/lib/util/db-util";

export interface TestDatabaseSetup {
  container: StartedPostgreSqlContainer;
  dataSource: DataSource;
}

/**
 * Starts a PostgreSQL container and creates a configured DataSource
 * @param additionalEntities Additional entities to include beyond the standard ENTITIES
 * @param options Additional DataSource options to override defaults
 */
export async function setupTestDatabase(
  additionalEntities: any[] = [],
  options: Partial<DataSourceOptions> = {}
): Promise<TestDatabaseSetup> {
  // Start PostgreSQL container
  const container = await new PostgreSqlContainer("postgres:15")
    .withDatabase("test_db")
    .withUsername("test_user")
    .withPassword("test_password")
    .start();

  // Create DataSource with container connection
  const dataSourceOptions = {
    type: "postgres",
    host: container.getHost(),
    port: container.getFirstMappedPort(),
    username: container.getUsername(),
    password: container.getPassword(),
    database: container.getDatabase(),
    entities: [...ENTITIES, ...additionalEntities],
    synchronize: true,
    logging: false,
    ...options,
  } as DataSourceOptions;

  // Create the datanav schema before initializing the DataSource
  await createSchemaIfNotExist({
    dataSourceOptions,
    schemaName: SCHEMA_NAME
  });

  const dataSource = new DataSource(dataSourceOptions);
  await dataSource.initialize();

  return { container, dataSource };
}

/**
 * Cleans up the test database and stops the container
 */
export async function teardownTestDatabase(setup: TestDatabaseSetup): Promise<void> {
  if (setup.dataSource?.isInitialized) {
    await setup.dataSource.destroy();
  }
  if (setup.container) {
    await setup.container.stop();
  }
}

/**
 * Utility function to execute an agent iteration with consistent error handling
 * and reduce boilerplate in tests
 */
export async function executeAgentIteration(
  agent: EvoAgentBase,
  messages: ModelMessage[],
  iteration: number = 1
): Promise<IterationResult> {
  let result: IterationResult | null = null;
  let error: any = null;

  const stream = createUIMessageStream({
    execute: async ({ writer }: { writer: UIMessageStreamWriter }) => {
      try {
        result = await agent.iterate({
          messages,
          writer,
          iteration
        });
      } catch (err) {
        error = err;
      }
    }
  });
  
  await agentStreamToMessage(stream);
  
  if (error) {
    throw error;
  }
  
  if (!result) {
    throw new Error("Agent iteration did not return a result");
  }
  
  return result;
}

// SQLite-based test database setup for lightweight tests
let sqliteTestDataSource: DataSource | null = null;

/**
 * Sets up an in-memory SQLite database for lightweight testing
 * This is faster than PostgreSQL containers for simple tests
 * @returns DataSource instance for the SQLite test database
 */
export async function setupSQLiteTestDatabase(): Promise<DataSource> {
  if (sqliteTestDataSource) {
    return sqliteTestDataSource;
  }

  sqliteTestDataSource = new DataSource({
    type: "sqlite",
    database: ":memory:",
    entities: [...ENTITIES],
    synchronize: true,
    logging: false
  });

  await sqliteTestDataSource.initialize();
  
  // Create some test tables for DatabaseClient tests
  await sqliteTestDataSource.query(`
    CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name VARCHAR(255) NOT NULL,
      email VARCHAR(255),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await sqliteTestDataSource.query(`
    CREATE TABLE products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name VARCHAR(255) NOT NULL,
      price DECIMAL(10,2),
      category VARCHAR(100)
    )
  `);

  // Insert some test data
  await sqliteTestDataSource.query(`
    INSERT INTO users (name, email) VALUES 
    ('Alice', 'alice@example.com'),
    ('Bob', 'bob@example.com'),
    ('Charlie', 'charlie@example.com')
  `);

  await sqliteTestDataSource.query(`
    INSERT INTO products (name, price, category) VALUES 
    ('Laptop', 999.99, 'Electronics'),
    ('Phone', 599.99, 'Electronics'),
    ('Book', 19.99, 'Education')
  `);

  return sqliteTestDataSource;
}

/**
 * Tears down the SQLite test database
 */
export async function teardownSQLiteTestDatabase(): Promise<void> {
  if (sqliteTestDataSource) {
    await sqliteTestDataSource.destroy();
    sqliteTestDataSource = null;
  }
}

/**
 * Gets the current SQLite test DataSource
 * @returns DataSource instance or throws if not initialized
 */
export function getSQLiteTestDataSource(): DataSource {
  if (!sqliteTestDataSource) {
    throw new Error("SQLite test database not initialized. Call setupSQLiteTestDatabase() first.");
  }
  return sqliteTestDataSource;
}

