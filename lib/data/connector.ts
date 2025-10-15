import SwaggerParser from "@apidevtools/swagger-parser";
import { OpenAPIV3 } from "openapi-types";
import { DataSource } from "typeorm";

import { DataConnectorStatusEntity } from "@/lib/data/entities";
import { DataLoader } from "@/lib/data/loader";
import { DataWriter } from "@/lib/data/writer";
import logger from "@/lib/logger";
import { mergeAllOfSchemas, createZodSchema } from "@/lib/util/openapi-utils";

const BATCH_SIZE = 100; // Process records in batches for efficiency

export interface DataConnectorConfig {
  id: string;
  name: string;
  description: string;
  openApiSpec: string | object;
  resourceNames: string[];
  dataLoaderFactory: () => DataLoader;
}

interface ConnectResult {
  success: boolean;
  authInfo?: {
    authUrl: string;
  };
}

interface ContinueToConnectParams {
  authCode: string;
  redirectTo?: string;
}

export interface DataLoadResult {
  updatedRecordCount: number;
  isFinished: boolean;
}

export class DataConnector {
  private config: DataConnectorConfig;
  private dataLoader: DataLoader;
  private dataSource: DataSource;
  private resourceSchemas: Record<string, OpenAPIV3.SchemaObject>;
  readonly dataWriter: DataWriter;

  protected constructor(params: { 
    config: DataConnectorConfig; 
    dataSource: DataSource; 
    schemas: Record<string, OpenAPIV3.SchemaObject>; 
  }) {
    this.config = params.config;
    this.dataSource = params.dataSource;
    this.dataLoader = params.config.dataLoaderFactory();
    this.resourceSchemas = params.schemas;
    this.dataWriter = new DataWriter({ 
      dataSource: params.dataSource, 
      connectorId: this.id 
    });
  }

  /**
   * Creates a new DataConnector instance with initialized dataLoader and resourceSchemas
   */
  static async create(config: DataConnectorConfig, dataSource: DataSource): Promise<DataConnector> {
    // Load and validate schemas from the OpenAPI specification
    const schemas: Record<string, OpenAPIV3.SchemaObject> = {};
    
    // Validate the OpenAPI spec first (with circular reference handling)
    let api: OpenAPIV3.Document;
    try {
      api = await SwaggerParser.validate(config.openApiSpec as any) as OpenAPIV3.Document;
    } catch (error) {
      // If validation fails due to circular references, parse without validation
      if (error instanceof Error && error.message.includes("Maximum call stack size exceeded")) {
        logger.warn("OpenAPI spec validation failed due to circular references, parsing without validation");
        api = await SwaggerParser.parse(config.openApiSpec as any) as OpenAPIV3.Document;
      } else {
        throw error;
      }
    }
    
    for (const schemaName of config.resourceNames) {
      const schema = api.components?.schemas?.[schemaName] as OpenAPIV3.SchemaObject;
      if (!schema) {
        throw new Error(`Schema ${schemaName} not found in OpenAPI spec`);
      }
      
      // Merge allOf schemas and cache the result
      const mergedSchema = mergeAllOfSchemas(schema);
      schemas[schemaName] = mergedSchema;
    }
    
    logger.info(`Loaded and cached schemas: ${config.resourceNames.join(", ")}`);
    
    const instance = new (this as any)({ config, dataSource, schemas });
    return instance;
  }

  get id(): string {
    return this.config.id;
  }

  get name(): string {
    return this.config.name;
  }

  get description(): string {
    return this.config.description;
  }


  /**
   * Gets the status of this data connector from the database
   */
  async getStatus(): Promise<DataConnectorStatusEntity | null> {
    return this.dataSource.getRepository(DataConnectorStatusEntity).findOne({
      where: { connectorId: this.id }
    });
  }

  /**
   * Checks if the connector is connected
   */
  async isConnected(): Promise<boolean> {
    const status = await this.getStatus();
    return status?.isConnected ?? false;
  }

  /**
   * Checks if the connector is currently loading
   */
  async isLoading(): Promise<boolean> {
    const status = await this.getStatus();
    return status?.isLoading ?? false;
  }

  /**
   * Updates the lastLoadedAt timestamp for this data connector
   */
  private async updateLastLoadedAt(timestamp: Date): Promise<void> {
    await this.dataSource.getRepository(DataConnectorStatusEntity).upsert(
      {
        connectorId: this.id,
        lastLoadedAt: timestamp,
        updatedAt: new Date()
      },
      ["connectorId"]
    );
    logger.info(`Updated lastLoadedAt for connector ${this.id} to ${timestamp.toISOString()}`);
  }

  /**
   * Updates the sync context for this data connector
   */
  private async updateSyncContext(syncContext: Record<string, any> | null): Promise<void> {
    await this.dataSource.getRepository(DataConnectorStatusEntity).upsert(
      {
        connectorId: this.id,
        syncContext,
        updatedAt: new Date()
      },
      ["connectorId"]
    );
    logger.info(`Updated sync context for connector ${this.id}`);
  }

  /**
   * Updates the connection status for this data connector
   */
  private async updateConnectionStatus(isConnected: boolean): Promise<void> {
    const now = new Date();
    await this.dataSource.getRepository(DataConnectorStatusEntity).upsert(
      {
        connectorId: this.id,
        isConnected,
        updatedAt: now,
        ...(isConnected && { lastConnectedAt: now })
      },
      ["connectorId"]
    );
    logger.info(`Updated connection status for connector ${this.id} to ${isConnected ? "connected" : "disconnected"}`);
  }

  /**
   * Saves the access token and refresh token for this data connector
   */
  private async saveTokens(accessToken: string | null, refreshToken?: string | null): Promise<void> {
    await this.dataSource.getRepository(DataConnectorStatusEntity).upsert(
      {
        connectorId: this.id,
        accessToken,
        refreshToken: refreshToken || null,
        updatedAt: new Date()
      },
      ["connectorId"]
    );
    logger.info(`Saved tokens for connector ${this.id}`);
  }

  /**
   * Gets merged schemas from the OpenAPI specification
   */
  protected get recordSchemas(): Record<string, OpenAPIV3.SchemaObject> {
    return this.resourceSchemas;
  }

  /**
   * Ensures schema has an id field and returns the processed schema
   * The id field is optional and records with null id will be filtered out
   */
  private ensureIdField(schema: OpenAPIV3.SchemaObject): OpenAPIV3.SchemaObject {
    const hasIdProperty = schema.properties?.id;
    
    // If id property already exists, return as-is (keeping existing required/optional status)
    if (hasIdProperty) {
      return schema;
    }
    
    // Add id property as optional (not in required array)
    return {
      ...schema,
      properties: {
        id: { type: "string", description: "Unique identifier" },
        ...schema.properties
      },
      // Don't add id to required fields - it's optional
      required: schema.required || []
    };
  }


  /**
   * Prepares tables for each target schema
   */
  private async prepareTables(): Promise<void> {
    logger.info(`Preparing data tables for ${this.config.name}`);

    for (const resourceName of this.config.resourceNames) {
      const schema = this.recordSchemas[resourceName];
      if (!schema) {
        throw new Error(`Schema not found for ${resourceName}`);
      }

      await this.dataWriter.syncTableSchema(resourceName, this.ensureIdField(schema));
      logger.info(`Prepared table for resource: ${resourceName}`);
    }
  }

  /**
   * Processes and syncs data records to the database in batches
   */
  private async processBatch(recordsBySchema: Record<string, any[]>): Promise<number> {
    let totalUpdatedRecords = 0;
    
    for (const [resourceName, resourceRecords] of Object.entries(recordsBySchema)) {
      const schema = this.recordSchemas[resourceName];
      if (!schema) {
        logger.warn(`Schema not found for ${resourceName}, skipping records`);
        continue;
      }

      const processedSchema = this.ensureIdField(schema);
      
      // Filter out records with null or undefined id and log warnings
      const validRecords = [];
      let nullIdCount = 0;
      
      for (const record of resourceRecords) {
        if (record.id === null || record.id === undefined) {
          nullIdCount++;
          continue;
        }
        validRecords.push(record);
      }
      
      if (nullIdCount > 0) {
        logger.warn(`Filtered out ${nullIdCount} record(s) with null/undefined id for resource ${resourceName}`);
      }
      
      // Skip if no valid records after filtering
      if (validRecords.length === 0) {
        logger.info(`No valid records to process for resource ${resourceName} after filtering`);
        continue;
      }
      
      // Validate valid records against schema
      const zodSchema = createZodSchema(processedSchema);
      validRecords.forEach(record => zodSchema.parse(record));
      
      const updatedCount = await this.dataWriter.syncTableRecords(resourceName, processedSchema, validRecords);
      totalUpdatedRecords += updatedCount;
    }
    
    return totalUpdatedRecords;
  }

  async connect(params: { redirectTo: string }): Promise<ConnectResult> {
    // Check if already connected
    const status = await this.getStatus();
    if (status?.isConnected) {
      return { success: true };
    }
    
    // Set isConnected = false to handle reconnect cases
    await this.updateConnectionStatus(false);
    
    return {
      success: false,
      authInfo: this.dataLoader.authenticate({ redirectTo: params.redirectTo })
    };
  }

  async continueToConnect(params: ContinueToConnectParams): Promise<ConnectResult> {
    await this.dataLoader.continueToAuthenticate({ code: params.authCode, redirectTo: params.redirectTo || "" });
    
    // Save access token after successful authentication
    const accessToken = this.dataLoader.getAccessToken();
    const refreshToken = this.dataLoader.getRefreshToken?.() || null;
    await this.saveTokens(accessToken, refreshToken);
        
    // Update connection status after successful data load
    await this.updateConnectionStatus(true);
    
    return { success: true };
  }

  async load(params: { 
    maxDurationToRunMs?: number;
    onProgressUpdate?: (params: { updatedRecordCount: number }) => void | Promise<void>;
  } = {}): Promise<DataLoadResult> {
    const { maxDurationToRunMs, onProgressUpdate } = params;
    
    // Always prepare tables first, even if there's no data
    await this.prepareTables();
    
    const status = await this.getStatus();
    
    // Restore tokens from database to the loader before fetching data
    if (status?.accessToken) {
      this.dataLoader.setAccessToken(status.accessToken);
    }
    if (status?.refreshToken && this.dataLoader.setRefreshToken) {
      this.dataLoader.setRefreshToken(status.refreshToken);
    }
    
    // Initialize syncContext object for the loader to modify
    const syncContext = status?.syncContext ?? {};
    
    let recordsBySchema: Record<string, any[]> = {};
    let totalUpdatedRecords = 0;
    let isFinished = true; // Assume finished unless there are more pages or error occurs
    
    const recordGenerator = this.dataLoader.fetch({ 
      lastLoadedAt: status?.lastLoadedAt ?? undefined,
      syncContext: syncContext,
      maxDurationToRunMs
    });
    
    // Process records as they arrive from the generator
    let done: boolean | undefined;
    let value: any;

    while (!done) {
      ({ done, value } = await recordGenerator.next());

      if (done) {
        isFinished = !value.hasMore;
        break;
      }
      
      // This is a DataRecord
      const { resourceName, ...data } = value;
      (recordsBySchema[resourceName] ??= []).push(data);
      
      // Process batch when it reaches the batch size
      if (Object.values(recordsBySchema).reduce((total, records) => total + records.length, 0) >= BATCH_SIZE) {
        const batchUpdatedRecords = await this.processBatch(recordsBySchema);
        totalUpdatedRecords += batchUpdatedRecords;
        
        // Call progress callback if provided
        if (onProgressUpdate) {
          await onProgressUpdate({ updatedRecordCount: totalUpdatedRecords });
        }
        
        recordsBySchema = {};
      }
    }
    
    // Process any remaining records
    const remainingRecordCount = Object.values(recordsBySchema).reduce((total, records) => total + records.length, 0);
    if (remainingRecordCount > 0) {
      const batchUpdatedRecords = await this.processBatch(recordsBySchema);
      totalUpdatedRecords += batchUpdatedRecords;
      
      // Call progress callback if provided
      if (onProgressUpdate) {
        await onProgressUpdate({ updatedRecordCount: totalUpdatedRecords });
      }
    }
    
    const now = new Date();
    
    // Update both timestamp and sync context (syncContext was modified by the loader)
    await this.updateLastLoadedAt(now);
    await this.updateSyncContext(syncContext);
    
    return { updatedRecordCount: totalUpdatedRecords, isFinished };
  }

  /**
   * Disconnect the connector, clearing all data and resetting connection status
   */
  async disconnect(): Promise<void> {
    logger.info(`Disconnecting connector ${this.id} and clearing all data`);
    
    const schemaName = this.getSchemaName();
    
    // Clear all data tables for this connector
    for (const resourceName of this.config.resourceNames) {
      const tableName = this.getTableName(resourceName);
      try {
        await this.dataSource.query(`DROP TABLE IF EXISTS ${tableName} CASCADE`);
        logger.info(`Dropped table: ${tableName}`);
      } catch (error) {
        logger.warn(`Failed to drop table ${tableName}: ${String(error)}`);
      }
    }
    
    // Drop the schema if it exists
    try {
      await this.dataSource.query(`DROP SCHEMA IF EXISTS ${schemaName} CASCADE`);
      logger.info(`Dropped schema: ${schemaName}`);
    } catch (error) {
      logger.warn(`Failed to drop schema ${schemaName}: ${String(error)}`);
    }
    
    // Clear all status records for this connector
    const statusRepo = this.dataSource.getRepository(DataConnectorStatusEntity);
    await statusRepo.delete({ connectorId: this.id });
    
    // Clear all table status records for this connector
    const { DataTableStatusEntity } = await import("@/lib/data/entities");
    const tableStatusRepo = this.dataSource.getRepository(DataTableStatusEntity);
    await tableStatusRepo.delete({ connectorId: this.id });
    
    logger.info(`Successfully disconnected connector ${this.id} and cleared all data`);
  }

  /**
   * Updates the connector status
   * @param updates - Partial status updates
   */
  async updateStatus(updates: Partial<{
    isConnected: boolean;
    isLoading: boolean;
    lastLoadedAt: Date | null;
    dataJobId: string | null;
    lastDataJobId: string | null;
  }>): Promise<void> {
    const statusRepo = this.dataSource.getRepository(DataConnectorStatusEntity);
    
    // Update or create status record
    await statusRepo.upsert(
      {
        connectorId: this.id,
        ...updates,
        updatedAt: new Date(),
      },
      {
        conflictPaths: ["connectorId"],
      }
    );
  }

  /**
   * Gets the schema name from the connector ID
   */
  private getSchemaName(): string {
    return this.id.replace(/\./g, "_"); // Replace dots for valid SQL identifiers
  }

  /**
   * Formats the table name as {connectorId}.{resourceName}
   */
  private getTableName(resourceName: string): string {
    const schemaName = this.getSchemaName();
    return `${schemaName}.${resourceName.toLowerCase()}`;
  }
}
