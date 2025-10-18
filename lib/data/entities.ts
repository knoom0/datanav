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

export type DataRecord = {
  resourceName: string;
  [key: string]: any;
};

export const ENTITIES = [UIBundleEntity, ComponentInfoEntity, DataConnectorConfigEntity, DataConnectorStatusEntity, DataTableStatusEntity, DataSpecEntity, DataJobEntity] as const;

// Common database options shared across all user data sources
const COMMON_DATABASE_OPTIONS = {
  entities: [...ENTITIES],
  synchronize: true,
};

// Cache for user-specific data sources
const userDataSources = new Map<string, DataSource>();

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
    try {
      // Ensure the datanav schema exists before initializing with entities
      await createSchemaIfNotExist({
        dataSourceOptions: userDataSource.options,
        schemaName: SCHEMA_NAME
      });
      
      await userDataSource.initialize();      
      // Create full-text search indexes for the user's database
      await createFullTextSearchIndexesForUser(userDataSource);
    } catch (error) {
      logger.error(`User data source initialization failed for user ${userId}: ${safeErrorString(error)}`);
      throw error;
    }
  }
  
  return userDataSource;
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
} 