import "server-only";

import SwaggerParser from "@apidevtools/swagger-parser";
import { OpenAPIV3 } from "openapi-types";
import { DataSource } from "typeorm";

import { DataLoader } from "@/lib/data/loader";
import { DataWriter } from "@/lib/data/writer";
import { DataConnectorStatusEntity } from "@/lib/entities";
import logger from "@/lib/logger";
import type { DataConnectorConfig } from "@/lib/types";
import { mergeAllOfSchemas, createZodSchema } from "@/lib/util/openapi-utils";

// Re-export for backward compatibility
export type { DataConnectorConfig, ResourceConfig } from "@/lib/types";

const BATCH_SIZE = 100; // Process records in batches for efficiency

/**
 * Validates a DataConnectorConfig object
 * @param config - The config to validate
 * @returns An error message if validation fails, null if valid
 * Note: ID is optional in this validation since it can be auto-generated
 */
export function validateDataConnectorConfig(config: Partial<DataConnectorConfig>): string | null {
  if (!config.name) {
    return "Missing required field: name";
  }
  if (!config.description) {
    return "Missing required field: description";
  }
  if (!config.resources || !Array.isArray(config.resources) || config.resources.length === 0) {
    return "Missing or invalid required field: resources (must be a non-empty array)";
  }
  // Validate each resource has a name
  for (let i = 0; i < config.resources.length; i++) {
    if (!config.resources[i].name) {
      return `Invalid resource at index ${i}: missing required field 'name'`;
    }
  }
  return null;
}

interface ConnectResult {
  success: boolean;
  authInfo?: {
    authUrl: string;
    success?: boolean;
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
  readonly dataWriter: DataWriter;

  protected constructor(params: { 
    config: DataConnectorConfig; 
    dataSource: DataSource; 
  }) {
    this.config = params.config;
    this.dataSource = params.dataSource;
    if (!params.config.dataLoaderFactory) {
      throw new Error("Data loader factory is required for DataConnector");
    }
    this.dataLoader = params.config.dataLoaderFactory();
    this.dataWriter = new DataWriter({ 
      dataSource: params.dataSource, 
      connectorId: this.id 
    });
  }

  /**
   * Creates a new DataConnector instance
   */
  static async create(config: DataConnectorConfig, dataSource: DataSource): Promise<DataConnector> {
    const instance = new (this as any)({ config, dataSource });
    return instance;
  }

  get id(): string {
    return this.config.id!;
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
   * Updates the lastSyncedAt timestamp for this data connector
   */
  private async updateLastSyncedAt(timestamp: Date): Promise<void> {
    await this.dataSource.getRepository(DataConnectorStatusEntity).upsert(
      {
        connectorId: this.id,
        lastSyncedAt: timestamp,
        updatedAt: new Date()
      },
      ["connectorId"]
    );
    logger.info(`Updated lastSyncedAt for connector ${this.id} to ${timestamp.toISOString()}`);
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
   * Gets the schema for a specific resource by loading it from the data loader
   */
  private async getResourceSchema(resourceName: string): Promise<OpenAPIV3.SchemaObject> {
    // Get openApiSpec from loader if available
    let openApiSpec: string | object | undefined;
    if ("openApiSpec" in this.dataLoader && this.dataLoader.openApiSpec) {
      openApiSpec = this.dataLoader.openApiSpec as string | object;
    }
    
    // Load schema from openApiSpec if available
    if (openApiSpec) {
      // Validate the OpenAPI spec first (with circular reference handling)
      let api: OpenAPIV3.Document;
      try {
        api = await SwaggerParser.validate(openApiSpec as any) as OpenAPIV3.Document;
      } catch (error) {
        // If validation fails due to circular references, parse without validation
        if (error instanceof Error && error.message.includes("Maximum call stack size exceeded")) {
          logger.warn("OpenAPI spec validation failed due to circular references, parsing without validation");
          api = await SwaggerParser.parse(openApiSpec as any) as OpenAPIV3.Document;
        } else {
          throw error;
        }
      }
      
      const schema = api.components?.schemas?.[resourceName] as OpenAPIV3.SchemaObject;
      if (!schema) {
        throw new Error(`Schema ${resourceName} not found in OpenAPI spec`);
      }
      
      // Merge allOf schemas and return the result
      return mergeAllOfSchemas(schema);
    } else if (this.dataLoader.getResourceInfo) {
      // If no openApiSpec but we have getResourceInfo, get schema from the loader
      const resourceInfo = await this.dataLoader.getResourceInfo(resourceName);
      return resourceInfo.schema;
    } else {
      throw new Error(`Cannot get schema for resource ${resourceName}: no openApiSpec and data loader does not support getResourceInfo`);
    }
  }



  /**
   * Prepares tables for each target schema
   */
  private async prepareTables(): Promise<void> {
    logger.info(`Preparing data tables for ${this.config.name}`);

    for (const resource of this.config.resources) {
      const resourceName = resource.name;
      const schema = await this.getResourceSchema(resourceName);

      await this.dataWriter.syncTableSchema({
        resourceConfig: resource,
        schema
      });
      logger.info(`Prepared table for resource: ${resourceName}`);
    }
  }

  /**
   * Normalize record values to match OpenAPI schema expectations
   * Converts Date objects to ISO strings for date/datetime fields
   */
  private normalizeRecord(record: Record<string, any>): Record<string, any> {
    const normalized: Record<string, any> = {};
    
    for (const [key, value] of Object.entries(record)) {
      if (value instanceof Date) {
        // Convert Date objects to ISO strings for OpenAPI schema compatibility
        normalized[key] = value.toISOString();
      } else {
        normalized[key] = value;
      }
    }
    
    return normalized;
  }

  /**
   * Processes and syncs data records to the database in batches
   */
  private async processBatch(recordsBySchema: Record<string, any[]>): Promise<number> {
    let totalUpdatedRecords = 0;
    
    for (const [resourceName, resourceRecords] of Object.entries(recordsBySchema)) {
      // Find the corresponding resource config
      const resourceConfig = this.config.resources.find(r => r.name === resourceName);
      if (!resourceConfig) {
        logger.warn(`Resource config not found for ${resourceName}, skipping records`);
        continue;
      }

      // Get schema for this resource
      let schema: OpenAPIV3.SchemaObject;
      try {
        schema = await this.getResourceSchema(resourceName);
      } catch (error) {
        logger.warn(`Schema not found for ${resourceName}, skipping records: ${error}`);
        continue;
      }
      
      // Normalize records (convert Date objects to ISO strings)
      const normalizedRecords = resourceRecords.map(record => this.normalizeRecord(record));
      
      // Validate normalized records against schema
      const zodSchema = createZodSchema(schema);
      normalizedRecords.forEach(record => zodSchema.parse(record));
      
      const updatedCount = await this.dataWriter.syncTableRecords({
        resourceConfig,
        schema,
        records: normalizedRecords
      });
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
    
    // Attempt authentication (may be immediate for no-auth loaders like SQL)
    const authResult = this.dataLoader.authenticate({ redirectTo: params.redirectTo });
    
    // Check if authentication succeeded immediately (no-auth loaders)
    if (authResult.success) {
      await this.updateConnectionStatus(true);
      logger.info(`No-auth data loader connected successfully for connector ${this.id}`);
      return { success: true };
    }
    
    // OAuth flow required
    return {
      success: false,
      authInfo: authResult
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
    
    // Record the sync start time - this will be used for the next sync
    const syncStartTime = new Date();
    
    // Initialize syncContext object for the loader to modify
    const syncContext = status?.syncContext ?? {};
    
    let recordsBySchema: Record<string, any[]> = {};
    let totalUpdatedRecords = 0;
    let isFinished = true; // Assume finished unless there are more pages or error occurs
    
    const recordGenerator = this.dataLoader.fetch({ 
      resources: this.config.resources,
      lastSyncedAt: status?.lastSyncedAt ?? undefined,
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
    
    // Only update lastSyncedAt if the load finished successfully
    // Use the start time (not end time) to ensure we capture all records updated during the sync
    if (isFinished) {
      await this.updateLastSyncedAt(syncStartTime);
    }
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
    for (const resource of this.config.resources) {
      const resourceName = resource.name;
      const tableName = this.getTableName(resourceName);
      try {
        // Quote the table name for safety
        await this.dataSource.query(`DROP TABLE IF EXISTS "${schemaName}"."${resourceName.toLowerCase()}" CASCADE`);
        logger.info(`Dropped table: ${tableName}`);
      } catch (error) {
        logger.warn(`Failed to drop table ${tableName}: ${String(error)}`);
      }
    }
    
    // Drop the schema if it exists
    try {
      // Quote the schema name for safety
      await this.dataSource.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
      logger.info(`Dropped schema: ${schemaName}`);
    } catch (error) {
      logger.warn(`Failed to drop schema ${schemaName}: ${String(error)}`);
    }
    
    // Clear all status records for this connector
    const statusRepo = this.dataSource.getRepository(DataConnectorStatusEntity);
    await statusRepo.delete({ connectorId: this.id });
    
    // Clear all table status records for this connector
    const { DataTableStatusEntity } = await import("@/lib/entities");
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
    lastSyncedAt: Date | null;
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
    return this.id.replace(/[.-]/g, "_"); // Replace dots and dashes for valid SQL identifiers
  }

  /**
   * Formats the table name as {connectorId}.{resourceName}
   */
  private getTableName(resourceName: string): string {
    const schemaName = this.getSchemaName();
    return `${schemaName}.${resourceName.toLowerCase()}`;
  }
}
