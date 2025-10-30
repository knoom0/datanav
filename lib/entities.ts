import "server-only";
import "reflect-metadata";

import { DataSource, Entity, PrimaryColumn, PrimaryGeneratedColumn, Column, BaseEntity, type DataSourceOptions, Unique, CreateDateColumn, UpdateDateColumn } from "typeorm";

import { getUserDataSourceOptions } from "@/lib/hosting/user-database";
import logger from "@/lib/logger";
import type { DataSpec } from "@/lib/types";
import { getCurrentUserId } from "@/lib/util/auth-util";
import { createSchemaIfNotExist } from "@/lib/util/db-util";
import { safeErrorString } from "@/lib/util/log-util";

export const SCHEMA_NAME = "datanav";


@Entity({ name: "component_info", schema: SCHEMA_NAME })
@Unique(["name", "packageName"])
export class ComponentInfoEntity extends BaseEntity {
  @PrimaryGeneratedColumn()
    id!: number;

  @Column({ type: "varchar" })
    name!: string;

  @Column({ type: "text" })
    description!: string;

  @Column({ type: "text" })
    documentation!: string;

  @Column({ type: "text" })
    packageName!: string;

  @Column({ type: "text" })
    packageVersion!: string;

  @Column({ type: "json" })
    keywords!: string[];

  @CreateDateColumn()
    createdAt!: Date;

  @UpdateDateColumn()
    updatedAt!: Date;
}

@Entity({ name: "data_connector_config", schema: SCHEMA_NAME })
export class DataConnectorConfigEntity extends BaseEntity {
  @PrimaryColumn({ type: "varchar" })
    id!: string;

  @Column({ type: "varchar" })
    name!: string;

  @Column({ type: "text" })
    description!: string;

  @Column({ type: "json", nullable: true })
    openApiSpec!: string | object | null;

  @Column({ type: "json", nullable: true })
    resourceNames!: string[] | null;

  @Column({ type: "json", nullable: true })
    resources!: Array<{ name: string; createdAtColumn?: string; updatedAtColumn?: string }> | null;

  @Column({ type: "text" })
    dataLoaderType!: string;

  @Column({ type: "json", nullable: true })
    dataLoaderConfig!: Record<string, any> | null;

  @CreateDateColumn()
    createdAt!: Date;

  @UpdateDateColumn()
    updatedAt!: Date;
}

@Entity({ name: "data_connector_status", schema: SCHEMA_NAME })
export class DataConnectorStatusEntity extends BaseEntity {
  @PrimaryColumn({ type: "varchar" })
    connectorId!: string;

  @Column({ type: "boolean", default: false })
    isConnected!: boolean;

  @Column({ type: "boolean", default: false })
    isLoading!: boolean;

  @Column({ type: "text", nullable: true })
    accessToken!: string | null;

  @Column({ type: "text", nullable: true })
    refreshToken!: string | null;

  @Column({ type: Date, nullable: true })
    tokenExpiresAt!: Date | null;

  @Column({ type: Date, nullable: true })
    lastConnectedAt!: Date | null;

  @Column({ type: Date, nullable: true })
    lastSyncedAt!: Date | null;

  @Column({ type: "text", nullable: true })
    lastError!: string | null;

  @Column({ type: "json", nullable: true })
    syncContext!: Record<string, any> | null;

  @Column({ type: "varchar", nullable: true })
    dataJobId!: string | null;

  @Column({ type: "varchar", nullable: true })
    lastDataJobId!: string | null;

  @Column({ type: Date, nullable: true })
    askedToConnectUntil!: Date | null;

  @CreateDateColumn()
    createdAt!: Date;

  @UpdateDateColumn()
    updatedAt!: Date;
}

@Entity({ name: "data_job", schema: SCHEMA_NAME })
export class DataJobEntity extends BaseEntity {
  @PrimaryColumn({ type: "varchar" })
    id!: string;

  @Column({ type: "varchar" })
    dataConnectorId!: string;

  @Column({ type: "varchar", default: "load" })
    type!: string;

  @Column({ type: "varchar" })
    state!: "created" | "running" | "finished";

  @Column({ type: "varchar", nullable: true })
    result!: "success" | "error" | "canceled" | null;

  @Column({ type: "json", nullable: true })
    params!: Record<string, any> | null;

  @Column({ type: "json", nullable: true })
    syncContext!: Record<string, any> | null;

  @Column({ type: "json", nullable: true })
    progress!: {
      updatedRecordCount: number;
      [key: string]: any;
    } | null;

  @Column({ type: "text", nullable: true })
    error!: string | null;

  @Column({ type: Date, nullable: true })
    startedAt!: Date | null;

  @Column({ type: Date, nullable: true })
    finishedAt!: Date | null;

  @CreateDateColumn()
    createdAt!: Date;

  @UpdateDateColumn()
    updatedAt!: Date;
}

@Entity({ name: "data_spec", schema: SCHEMA_NAME })
export class DataSpecEntity extends BaseEntity {
  @PrimaryColumn({ type: "varchar" })
    projectId!: string;

  @Column({ 
    type: "text",
    transformer: {
      to: (value: any) => JSON.stringify(value),
      from: (value: string) => JSON.parse(value)
    }
  })
    queries!: any;
}

@Entity({ name: "data_table_status", schema: SCHEMA_NAME })
@Unique(["connectorId", "tableName"])
export class DataTableStatusEntity extends BaseEntity {
  @PrimaryGeneratedColumn()
    id!: number;

  @Column({ type: "varchar" })
    connectorId!: string;

  @Column({ type: "varchar" })
    tableName!: string;

  @Column({ type: Date, nullable: true })
    lastSyncedAt!: Date | null;

  @CreateDateColumn()
    createdAt!: Date;

  @UpdateDateColumn()
    updatedAt!: Date;
}

/**
 * PulseConfig represents a scheduled report configuration
 * Users can define multiple pulses with different schedules
 */
@Entity({ name: "pulse_config", schema: SCHEMA_NAME })
export class PulseConfigEntity extends BaseEntity {
  @PrimaryColumn({ type: "varchar" })
    id!: string;

  @Column({ type: "varchar" })
    name!: string;

  @Column({ type: "text" })
    description!: string;

  @Column({ type: "text" })
    prompt!: string;

  @Column({ type: "varchar" })
    cron!: string; // cron expression (e.g., "0 0 * * *" for daily at midnight)

  @Column({ type: "varchar", nullable: true })
    cronTimezone!: string | null; // IANA timezone for cron scheduling (e.g., "America/New_York")

  @Column({ type: "boolean", default: true })
    enabled!: boolean;

  @Column({ type: Date, nullable: true })
    lastRunAt!: Date | null;

  @Column({ type: Date, nullable: true })
    nextRunAt!: Date | null;

  @CreateDateColumn()
    createdAt!: Date;

  @UpdateDateColumn()
    updatedAt!: Date;
}

/**
 * PulseConfig type for API usage
 */
export type PulseConfig = {
  id: string;
  name: string;
  description: string;
  prompt: string;
  cron: string;
  cronTimezone: string | null;
  enabled: boolean;
  lastRunAt: Date | null;
  nextRunAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * PulseJob represents a single execution of a pulse
 * Similar to DataJob but for scheduled reports
 */
@Entity({ name: "pulse_job", schema: SCHEMA_NAME })
export class PulseJobEntity extends BaseEntity {
  @PrimaryColumn({ type: "varchar" })
    id!: string;

  @Column({ type: "varchar" })
    pulseConfigId!: string;

  @Column({ type: "varchar", nullable: true })
    reportBundleId!: string | null;

  @Column({ type: "varchar" })
    state!: "created" | "running" | "finished";

  @Column({ type: "varchar", nullable: true })
    result!: "success" | "error" | "canceled" | null;

  @Column({ type: "json", nullable: true })
    output!: {
      messages?: Array<{
        role: string;
        content: string;
        [key: string]: any;
      }>;
      report?: string;
      [key: string]: any;
    } | null;

  @Column({ type: "text", nullable: true })
    error!: string | null;

  @Column({ type: Date, nullable: true })
    startedAt!: Date | null;

  @Column({ type: Date, nullable: true })
    finishedAt!: Date | null;

  @CreateDateColumn()
    createdAt!: Date;

  @UpdateDateColumn()
    updatedAt!: Date;
}

@Entity({ name: "report_bundle", schema: SCHEMA_NAME })
export class ReportBundleEntity extends BaseEntity {
  @PrimaryColumn({ type: "varchar" })
    id!: string;

  @Column({ type: "json" })
    bundle!: {
      text: string;
      dataQueryResults: Array<{
        name: string;
        description: string;
        query: string;
        records: Record<string, any>[];
      }>;
    };

  @CreateDateColumn()
    createdAt!: Date;

  @UpdateDateColumn()
    updatedAt!: Date;
}

@Entity({ name: "ui_bundle", schema: SCHEMA_NAME })
export class UIBundleEntity extends BaseEntity {
  @PrimaryColumn({ type: "varchar" })
    uuid!: string;

  @Column({ type: "varchar" })
    type!: string;

  @Column({ type: "text" })
    sourceCode!: string;

  @Column({ type: "text" })
    compiledCode!: string;

  @Column({ type: "json", nullable: true })
    sourceMap!: object;

  @Column({ type: "json" })
    dataSpec!: DataSpec;
}

export type DataRecord = {
  resourceName: string;
  [key: string]: any;
};

export const ENTITIES = [
  ComponentInfoEntity,
  DataConnectorConfigEntity,
  DataConnectorStatusEntity,
  DataJobEntity,
  DataSpecEntity,
  DataTableStatusEntity,
  PulseConfigEntity,
  PulseJobEntity,
  ReportBundleEntity,
  UIBundleEntity
] as const;

// Common database options shared across all user data sources
const COMMON_DATABASE_OPTIONS = {
  entities: [...ENTITIES],
  synchronize: true,
};

// Cache for user-specific data sources
const userDataSources = new Map<string, DataSource>();
// Track initialization promises to prevent concurrent initialization
const userDataSourceInitializations = new Map<string, Promise<DataSource>>();

/**
 * Create full-text search indexes for component_info table for a specific user data source
 */
async function createFullTextSearchIndexesForUser(userDataSource: DataSource) {
  try {
    // Create separate GIN indexes for name and description (subqueries not allowed in index expressions)
    const nameIndexQuery = `
      CREATE INDEX IF NOT EXISTS idx_component_info_name_fts 
      ON ${SCHEMA_NAME}.component_info 
      USING GIN (to_tsvector('english', coalesce(name, '')))
    `;
    
    const descriptionIndexQuery = `
      CREATE INDEX IF NOT EXISTS idx_component_info_description_fts 
      ON ${SCHEMA_NAME}.component_info 
      USING GIN (to_tsvector('english', coalesce(description, '')))
    `;
    
    // Create a partial index for exact name matches (case-insensitive)
    const exactNameIndexQuery = `
      CREATE INDEX IF NOT EXISTS idx_component_info_name_lower 
      ON ${SCHEMA_NAME}.component_info (LOWER(name))
    `;
    
    await userDataSource.query(nameIndexQuery);
    await userDataSource.query(descriptionIndexQuery);
    await userDataSource.query(exactNameIndexQuery);
    
  } catch (error) {
    // Log the error but don't fail initialization
    logger.warn(`Failed to create full-text search indexes for user: ${safeErrorString(error)}`);
  }
}


export async function getUserDataSource(): Promise<DataSource> {
  // Get current user ID from Supabase authentication
  const userId = await getCurrentUserId();
  
  // If initialization is in progress, wait for it
  const existingInitialization = userDataSourceInitializations.get(userId);
  if (existingInitialization) {
    return existingInitialization;
  }

  // If already initialized, return immediately
  const existingDataSource = userDataSources.get(userId);
  if (existingDataSource?.isInitialized) {
    return existingDataSource;
  }

  // Start initialization
  const initializationPromise = (async () => {
    try {
      // Get existing user-specific data source
      let userDataSource = userDataSources.get(userId);
      
      // Create DataSource if it doesn't exist
      if (!userDataSource) {
        // Get user data source options (this will create the database if it doesn't exist)
        const baseDataSourceOptions = await getUserDataSourceOptions(userId);    
        // Merge with common database options that include entities and other settings
        const dataSourceOptions: DataSourceOptions = {
          ...COMMON_DATABASE_OPTIONS,
          ...baseDataSourceOptions,
        };

        userDataSource = new DataSource(dataSourceOptions);
        userDataSources.set(userId, userDataSource);
      }
      
      // Initialize DataSource if it's not initialized
      if (!userDataSource.isInitialized) {
        // Ensure the datanav schema exists before initializing with entities
        await createSchemaIfNotExist({
          dataSourceOptions: userDataSource.options,
          schemaName: SCHEMA_NAME
        });
        
        await userDataSource.initialize();
        logger.info(`User data source initialized successfully for user ${userId}`);
        
        // Create full-text search indexes for the user's database
        await createFullTextSearchIndexesForUser(userDataSource);
      }
      
      return userDataSource;
    } catch (error) {
      // If it's an "already connected" error, try to recover
      if (error instanceof Error && error.message.includes("already established")) {
        logger.warn(`User data source already connected for user ${userId}, recovering existing connection`);
        // Reset and retry
        userDataSources.delete(userId);
        userDataSourceInitializations.delete(userId);
        throw error;
      }
      
      logger.error(`User data source initialization failed for user ${userId}: ${safeErrorString(error)}`);
      userDataSources.delete(userId);
      userDataSourceInitializations.delete(userId);
      throw error;
    }
  })();

  userDataSourceInitializations.set(userId, initializationPromise);
  
  // Clean up the initialization promise after it completes (success or failure)
  initializationPromise.finally(() => {
    userDataSourceInitializations.delete(userId);
  });
  
  return initializationPromise;
}

/**
 * Force reset the dataSource state - useful for fixing schema conflicts
 * @param userId Optional user ID to reset specific user's data source
 */
export async function resetUserDataSource(userId: string): Promise<void> {
  // Reset specific user's data source
  const userDataSource = userDataSources.get(userId);
  if (userDataSource?.isInitialized) {
    await userDataSource.destroy();
  }
  userDataSources.delete(userId);
  userDataSourceInitializations.delete(userId);
}

