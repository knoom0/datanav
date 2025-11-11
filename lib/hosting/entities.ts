import "reflect-metadata";
import { DataSource, Entity, PrimaryColumn, PrimaryGeneratedColumn, Column, BaseEntity } from "typeorm";

import { getConfig } from "@/lib/config";
import logger from "@/lib/logger";
import { CreateDateColumnUTC, UpdateDateColumnUTC } from "@/lib/util/database-util";
import { createSchemaIfNotExist } from "@/lib/util/db-util";
import { safeErrorString } from "@/lib/util/log-util";

export const SCHEMA_NAME = "datanav";

// Embedding dimension for OpenAI's text-embedding-3-small model
export const EMBEDDING_DIMENSION = 1536;

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

  @CreateDateColumnUTC()
    createdAt!: Date;

  @UpdateDateColumnUTC()
    updatedAt!: Date;
}

@Entity({ name: "agent_strategy", schema: SCHEMA_NAME })
export class AgentStrategyEntity extends BaseEntity {
  @PrimaryGeneratedColumn()
    id!: number;

  @Column({ type: "text" })
    agentName!: string;

  @Column({ type: "text" })
    topic!: string;

  @Column({ type: "text" })
    text!: string;

  @Column({ type: "json", nullable: true })
    samplePrompts!: string[] | null;

  @Column({ type: "vector", length: EMBEDDING_DIMENSION })
    topicEmbedding!: number[];

  @CreateDateColumnUTC()
    createdAt!: Date;

  @UpdateDateColumnUTC()
    updatedAt!: Date;
}

export const HOSTING_ENTITIES = [UserDatabaseConfig, AgentStrategyEntity] as const;

let hostingDataSource: DataSource | null = null;
let initializationPromise: Promise<void> | null = null;

/**
 * Create vector indexes for agent_strategy table
 * Note: pgvector extension is created before TypeORM initialization
 */
async function createVectorIndexes(dataSource: DataSource) {
  try {
    // Create IVFFlat index for fast approximate nearest neighbor search
    // Using cosine distance operator (<=>)
    const vectorIndexQuery = `
      CREATE INDEX IF NOT EXISTS idx_agent_strategy_topic_embedding_cosine
      ON ${SCHEMA_NAME}.agent_strategy 
      USING ivfflat ("topicEmbedding" vector_cosine_ops)
      WITH (lists = 100)
    `;
    
    await dataSource.query(vectorIndexQuery);
    
  } catch (error) {
    // Log the error but don't fail initialization
    logger.warn(`Failed to create vector indexes: ${safeErrorString(error)}`);
  }
}

export async function ensureHostingDataSourceInitialized() {
  // If initialization is in progress, wait for it
  if (initializationPromise) {
    await initializationPromise;
    return;
  }

  // If already initialized, return immediately
  if (hostingDataSource?.isInitialized) {
    return;
  }

  // Start initialization
  initializationPromise = (async () => {
    try {
      // Create DataSource if it doesn't exist
      if (!hostingDataSource) {
        const config = getConfig();
        const hostingDataSourceOptions = { 
          ...config.database,
          name: "hosting", // Use a unique name instead of "default"
          entities: HOSTING_ENTITIES,
          synchronize: true,
        };
        hostingDataSource = new DataSource(hostingDataSourceOptions);
      }
      
      // Initialize DataSource if it's not initialized
      if (!hostingDataSource.isInitialized) {
        // Ensure the datanav schema exists before initializing with entities
        const config = getConfig();
        await createSchemaIfNotExist({
          dataSourceOptions: config.database,
          schemaName: SCHEMA_NAME
        });
        
        // Create pgvector extension BEFORE initializing TypeORM
        // This is required because TypeORM needs the vector type to exist when creating tables
        const tempDataSource = new DataSource({
          ...config.database,
          name: "temp-for-extension"
        });
        await tempDataSource.initialize();
        await tempDataSource.query("CREATE EXTENSION IF NOT EXISTS vector");
        await tempDataSource.destroy();
        
        // Initialize the data source
        await hostingDataSource.initialize();
        logger.info("Hosting DataSource initialized successfully");
        
        // Create vector indexes for agent strategy
        await createVectorIndexes(hostingDataSource);
      }
    } catch (error) {
      // If it's an "already connected" error, try to recover
      if (error instanceof Error && error.message.includes("already established")) {
        logger.warn("Hosting DataSource already connected, recovering existing connection");
        // Reset and retry
        hostingDataSource = null;
        initializationPromise = null;
        throw error;
      }
      
      logger.error(`Hosting DataSource initialization failed: ${safeErrorString(error)}`);
      hostingDataSource = null;
      initializationPromise = null;
      throw error;
    }
  })();

  await initializationPromise;
  initializationPromise = null;
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
