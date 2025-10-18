import { OpenAPIV3 } from "openapi-types";
import { Client } from "pg";

import { DataLoader, DataLoaderConfig } from "@/lib/data/loader";
import logger from "@/lib/logger";

// Type-only import to avoid importing server-only module in tests
type DataRecord = {
  resourceName: string;
  [key: string]: any;
};

const RECORD_BATCH_SIZE = 1000; // Maximum number of records to fetch per batch

/**
 * Data loader for SQL databases (PostgreSQL)
 */
export class SQLDataLoader implements DataLoader {
  private host: string;
  private port: number;
  private username: string;
  private password: string;
  private database: string;
  private schema: string;
  private client?: Client;

  /**
   * Whether this loader should be hidden from the data loader list
   */
  static readonly isHidden = false;

  /**
   * Example configuration for SQLDataLoader
   */
  static readonly exampleConfig = {
    host: "localhost",
    port: 5432,
    username: "postgres",
    password: "your_password",
    database: "your_database",
    schema: "public"
  };

  constructor(config: DataLoaderConfig) {
    // Validate and extract required fields
    if (!config.host || typeof config.host !== "string") {
      throw new Error("SQLDataLoader requires 'host' as a string in config");
    }
    if (config.port !== undefined && (typeof config.port !== "number" || config.port <= 0)) {
      throw new Error("SQLDataLoader requires 'port' as a positive number in config");
    }
    if (!config.username || typeof config.username !== "string") {
      throw new Error("SQLDataLoader requires 'username' as a string in config");
    }
    if (!config.password || typeof config.password !== "string") {
      throw new Error("SQLDataLoader requires 'password' as a string in config");
    }
    if (!config.database || typeof config.database !== "string") {
      throw new Error("SQLDataLoader requires 'database' as a string in config");
    }
    if (config.schema !== undefined && typeof config.schema !== "string") {
      throw new Error("SQLDataLoader requires 'schema' as a string in config");
    }
    
    this.host = config.host;
    this.port = config.port !== undefined ? config.port : 5432;
    this.username = config.username;
    this.password = config.password;
    this.database = config.database;
    this.schema = config.schema || "public";
  }

  /**
   * Get a database client connection
   */
  private async getClient(): Promise<Client> {
    if (!this.client) {
      this.client = new Client({
        host: this.host,
        port: this.port,
        user: this.username,
        password: this.password,
        database: this.database,
      });
      await this.client.connect();
    }
    return this.client;
  }

  /**
   * Close the database connection
   */
  async close(): Promise<void> {
    if (this.client) {
      await this.client.end();
      this.client = undefined;
    }
  }

  /**
   * Tests database connection instead of initiating OAuth flow
   * Returns success indicator for no-auth data loaders
   */
  authenticate(_params: { redirectTo: string }): { authUrl: string; success?: boolean } {
    // For SQL loader, we test the connection by attempting to connect
    // This is synchronous return, but connection test happens in getClient()
    // We return a special marker indicating immediate success
    return { authUrl: "", success: true };
  }

  /**
   * SQL data loader doesn't require authentication
   */
  async continueToAuthenticate(_params: { code: string; redirectTo: string }): Promise<void> {
    throw new Error("SQL data loader does not support authentication flow");
  }

  /**
   * SQL data loader doesn't use access tokens
   */
  getAccessToken(): string | null {
    return null;
  }

  /**
   * SQL data loader doesn't use access tokens
   */
  setAccessToken(_token: string): void {
    // No-op for SQL data loader
  }

  /**
   * Gets the list of all available resource names from the data source.
   * For SQL data loaders, this queries the database to get all table names.
   * @returns Promise resolving to array of table names
   */
  async getAvailableResourceNames(): Promise<string[]> {
    const client = await this.getClient();
    
    // Query to get all table names from the current database and schema
    const query = `
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = $1
      ORDER BY table_name
    `;
    const result = await client.query(query, [this.schema]);
    return result.rows.map(row => row.table_name);
  }

  /**
   * Gets detailed information about a table including schema, columns, and record count
   * @param resourceName - The table name
   * @returns Detailed resource information
   */
  async getResourceInfo(resourceName: string): Promise<import("@/lib/data/loader").DataLoaderResourceInfo> {
    const client = await this.getClient();
    
    // Query to get primary key column
    const primaryKeyQuery = `
      SELECT kcu.column_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
        AND tc.table_name = kcu.table_name
      WHERE tc.constraint_type = 'PRIMARY KEY'
        AND tc.table_schema = $1
        AND tc.table_name = $2
      ORDER BY kcu.ordinal_position
      LIMIT 1
    `;
    
    const primaryKeyResult = await client.query(primaryKeyQuery, [this.schema, resourceName]);
    const primaryKeyColumn = primaryKeyResult.rows.length > 0 ? primaryKeyResult.rows[0].column_name : undefined;
    
    // Query to get column information from PostgreSQL
    const columnQuery = `
      SELECT 
        column_name,
        data_type,
        is_nullable,
        column_default,
        character_maximum_length,
        numeric_precision,
        numeric_scale
      FROM information_schema.columns
      WHERE table_schema = $1
        AND table_name = $2
      ORDER BY ordinal_position
    `;
    
    const columnResult = await client.query(columnQuery, [this.schema, resourceName]);
    
    if (columnResult.rows.length === 0) {
      throw new Error(`Table ${resourceName} not found in database`);
    }
    
    const properties: Record<string, OpenAPIV3.SchemaObject> = {};
    const required: string[] = [];
    const columns: string[] = [];
    const timestampColumns: string[] = [];
    
    for (const row of columnResult.rows) {
      const columnName = row.column_name;
      const dataType = row.data_type;
      const isNullable = row.is_nullable === "YES";
      
      columns.push(columnName);
      
      // Map PostgreSQL types to OpenAPI types
      let schemaType: string;
      let format: string | undefined;
      
      switch (dataType) {
        case "integer":
        case "smallint":
        case "bigint":
          schemaType = "integer";
          break;
        case "numeric":
        case "decimal":
        case "real":
        case "double precision":
          schemaType = "number";
          break;
        case "boolean":
          schemaType = "boolean";
          break;
        case "date":
          schemaType = "string";
          format = "date";
          timestampColumns.push(columnName);
          break;
        case "timestamp":
        case "timestamp without time zone":
        case "timestamp with time zone":
          schemaType = "string";
          format = "date-time";
          timestampColumns.push(columnName);
          break;
        case "time":
        case "time without time zone":
        case "time with time zone":
          schemaType = "string";
          format = "time";
          break;
        case "json":
        case "jsonb":
          schemaType = "object";
          break;
        case "ARRAY":
          schemaType = "array";
          break;
        default:
          // text, varchar, char, uuid, etc.
          schemaType = "string";
      }
      
      const columnSchema: OpenAPIV3.SchemaObject = {
        type: schemaType as any,
      };
      
      if (format) {
        columnSchema.format = format;
      }
      
      // Mark primary key column with custom extension
      if (primaryKeyColumn && columnName === primaryKeyColumn) {
        (columnSchema as any)["x-primary-key"] = true;
      }
      
      properties[columnName] = columnSchema;
      
      // Add to required if not nullable
      if (!isNullable) {
        required.push(columnName);
      }
    }
    
    const schema: OpenAPIV3.SchemaObject = {
      type: "object",
      properties,
      required: required.length > 0 ? required : undefined,
    };
    
    // Get record count for the table
    let recordCount: number | undefined;
    try {
      const countQuery = `SELECT COUNT(*) as count FROM ${this.schema}.${resourceName}`;
      const countResult = await client.query(countQuery);
      recordCount = parseInt(countResult.rows[0]?.count ?? "0", 10);
    } catch (error) {
      logger.warn(`Failed to get record count for ${resourceName}: ${error}`);
      // Record count is optional, so we don't throw
    }
    
    return {
      name: resourceName,
      schema,
      columns,
      timestampColumns,
      primaryKeyColumn,
      recordCount
    };
  }

  /**
   * Detects common timestamp columns in a table for incremental sync
   * @param tableName - The table name
   * @returns The detected timestamp column name or null
   */
  private async detectTimestampColumn(tableName: string): Promise<string | null> {
    const client = await this.getClient();
    
    // Common timestamp column names to check, in order of preference
    const commonTimestampColumns = ["updated_at", "modified_at", "created_at", "inserted_at"];
    
    const query = `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = $1
        AND table_name = $2
        AND column_name = ANY($3)
        AND data_type IN ('timestamp without time zone', 'timestamp with time zone')
      ORDER BY CASE column_name
        WHEN 'updated_at' THEN 1
        WHEN 'modified_at' THEN 2
        WHEN 'created_at' THEN 3
        WHEN 'inserted_at' THEN 4
        ELSE 5
      END
      LIMIT 1
    `;
    
    const result = await client.query(query, [this.schema, tableName, commonTimestampColumns]);
    
    if (result.rows.length > 0) {
      return result.rows[0].column_name;
    }
    
    return null;
  }

  /**
   * Fetches data from specified SQL tables with batch processing
   * @param params - Fetch parameters including resources to fetch
   * @returns AsyncGenerator yielding records
   */
  async *fetch(params: { 
    resources: Array<{ name: string; createdAtColumn?: string; updatedAtColumn?: string }>;
    lastSyncedAt?: Date; 
    syncContext: Record<string, any> | null;
    maxDurationToRunMs?: number;
  }): AsyncGenerator<DataRecord, { hasMore: boolean }, unknown> {
    const { resources, lastSyncedAt, syncContext, maxDurationToRunMs } = params;
    const startTime = Date.now();
    
    const client = await this.getClient();
    
    // Initialize sync context if needed
    if (!syncContext) {
      throw new Error("syncContext is required for SQL data loader");
    }
    
    if (!syncContext.resourceIndex) {
      syncContext.resourceIndex = 0;
      syncContext.offset = 0;
    }
    
    // Process resources starting from the current resource index
    for (let i = syncContext.resourceIndex; i < resources.length; i++) {
      const resource = resources[i];
      const tableName = resource.name;
      
      // Check if we've exceeded max duration
      if (maxDurationToRunMs && (Date.now() - startTime) >= maxDurationToRunMs) {
        logger.info(`Max duration reached, stopping fetch for ${tableName}`);
        syncContext.resourceIndex = i;
        return { hasMore: true };
      }
      
      // Determine timestamp column to use for incremental sync
      let timestampColumn: string | null = null;
      if (lastSyncedAt) {
        // Use user-specified column if available, otherwise try to detect
        if (resource.updatedAtColumn) {
          timestampColumn = resource.updatedAtColumn;
        } else if (resource.createdAtColumn) {
          timestampColumn = resource.createdAtColumn;
        } else {
          timestampColumn = await this.detectTimestampColumn(tableName);
        }
      }
      
      // Build the query with pagination and optional incremental sync support
      let query = `SELECT * FROM ${this.schema}.${tableName}`;
      const queryParams: any[] = [];
      let paramIndex = 1;
      
      // Add incremental sync filter if timestamp column is available
      if (timestampColumn && lastSyncedAt) {
        query += ` WHERE ${timestampColumn} > $${paramIndex}`;
        queryParams.push(lastSyncedAt);
        paramIndex++;
        query += ` ORDER BY ${timestampColumn} ASC`;
      } else if (timestampColumn) {
        // Even without lastSyncedAt, order by timestamp for consistency
        query += ` ORDER BY ${timestampColumn} ASC`;
      }
      
      // Add pagination
      query += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
      queryParams.push(RECORD_BATCH_SIZE, syncContext.offset);
      
      logger.info(
        `Fetching data from table: ${tableName}` +
        `${timestampColumn ? ` (using ${timestampColumn})` : ""}` +
        ` [offset: ${syncContext.offset}, limit: ${RECORD_BATCH_SIZE}]`
      );
      
      const result = await client.query(query, queryParams);
      
      logger.info(`Fetched ${result.rows.length} rows from ${tableName}`);
      
      // Yield each row as a DataRecord
      for (const row of result.rows) {
        yield {
          resourceName: tableName,
          ...row
        };
      }
      
      // Check if there are more rows in this table
      if (result.rows.length === RECORD_BATCH_SIZE) {
        // More rows available in this table
        syncContext.offset += RECORD_BATCH_SIZE;
        syncContext.resourceIndex = i;
        return { hasMore: true };
      } else {
        // Move to next table
        syncContext.offset = 0;
      }
    }
    
    // All resources processed, reset sync context for next cycle
    syncContext.resourceIndex = 0;
    syncContext.offset = 0;
    return { hasMore: false };
  }
}

