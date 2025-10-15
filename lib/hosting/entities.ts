import "reflect-metadata";
import { DataSource, Entity, PrimaryColumn, Column, BaseEntity, CreateDateColumn, UpdateDateColumn } from "typeorm";

import { getConfig } from "@/lib/config";
import logger from "@/lib/logger";
import { createSchemaIfNotExist } from "@/lib/util/db-util";
import { safeErrorString } from "@/lib/util/log-util";

export const SCHEMA_NAME = "datanav";

@Entity({ name: "user_database_config", schema: SCHEMA_NAME })
export class UserDatabaseConfig extends BaseEntity {
  @PrimaryColumn({ type: "varchar" })
    userId!: string;

  @Column({ type: "varchar" })
    databaseName!: string;

  @Column({ type: "boolean", default: false })
    isExternal!: boolean;

  @Column({ type: "text", nullable: true })
    externalConnectionString!: string | null;

  @CreateDateColumn()
    createdAt!: Date;

  @UpdateDateColumn()
    updatedAt!: Date;
}

export const HOSTING_ENTITIES = [UserDatabaseConfig] as const;

let hostingDataSource: DataSource | null = null;

export async function ensureHostingDataSourceInitialized() {
  // Create DataSource if it doesn't exist
  if (!hostingDataSource) {
    const config = getConfig();
    const hostingDataSourceOptions = { 
      ...config.database,
      entities: HOSTING_ENTITIES,
      synchronize: true,
    };
    hostingDataSource = new DataSource(hostingDataSourceOptions);
  }
  
  // Initialize DataSource if it's not initialized
  if (!hostingDataSource.isInitialized) {
    try {
      // Ensure the datanav schema exists before initializing with entities
      const config = getConfig();
      await createSchemaIfNotExist({
        dataSourceOptions: config.database,
        schemaName: SCHEMA_NAME
      });
      
      // Initialize the data source
      await hostingDataSource.initialize();
    } catch (error) {
      logger.error(`Hosting DataSource initialization failed: ${safeErrorString(error)}`);
      throw error;
    }
  }
}

export async function getHostingDataSource(): Promise<DataSource> {
  await ensureHostingDataSourceInitialized();
  return hostingDataSource!;
}

/**
 * Force reset the hosting data source - useful for fixing connection conflicts
 */
export async function resetHostingDataSource(): Promise<void> {
  if (hostingDataSource?.isInitialized) {
    try {
      await hostingDataSource.destroy();
    } catch (error) {
      logger.warn(`Failed to destroy hosting data source during reset: ${safeErrorString(error)}`);
    }
  }
  hostingDataSource = null;
}
