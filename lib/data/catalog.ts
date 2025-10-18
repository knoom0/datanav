import "server-only";

import { DataSource } from "typeorm";

import { DataConnector, DataConnectorConfig } from "@/lib/data/connector";
import { dataConnectorConfigs } from "@/lib/data/connector-config";
import { DataConnectorConfigEntity, DataConnectorStatusEntity, DataJobEntity } from "@/lib/data/entities";
import { createDataLoader } from "@/lib/data/loader/index";
import { APIError } from "@/lib/errors";
import logger from "@/lib/logger";
import { DataConnectorInfo, DataJobInfo } from "@/lib/types";

/**
 * Generate a human-readable, SQL-safe ID from a name
 * Example: "Gmail Messages" -> "gmail_messages_a1b2c3"
 */
function generateIdFromName(name: string): string {
  // Convert to lowercase and replace spaces/special chars with underscores
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, ""); // Remove leading/trailing underscores
  
  // Add a short random suffix for uniqueness (6 characters)
  const suffix = Math.random().toString(36).substring(2, 8);
  
  return `${slug}_${suffix}`;
}

/**
 * Catalog for managing data connector configurations
 * Bundled connectors are stored in memory, user-created connectors are stored in database
 */
export class DataCatalog {
  private dataSource: DataSource;
  /** Bundled connector configs (immutable, from constructor) */
  private bundledConfigs: Map<string, DataConnectorConfig> = new Map();

  constructor({ 
    dataSource, 
    connectorConfigs = dataConnectorConfigs 
  }: {
    dataSource: DataSource;
    connectorConfigs?: DataConnectorConfig[];
  }) {
    this.dataSource = dataSource;
    // Store bundled configs in memory
    connectorConfigs.forEach(config => {
      this.bundledConfigs.set(config.id!, config);
    });
  }

  /**
   * Convert a DataConnectorConfigEntity to DataConnectorConfig
   */
  private entityToConfig(entity: DataConnectorConfigEntity): DataConnectorConfig {
    // Merge openApiSpec into loader config if it exists (for backward compatibility)
    const loaderConfig = entity.dataLoaderConfig || {};
    if (entity.openApiSpec && !loaderConfig.openApiSpec) {
      loaderConfig.openApiSpec = entity.openApiSpec;
    }

    // Reconstruct the dataLoaderFactory based on the stored dataLoaderType
    const dataLoaderFactory = () => createDataLoader({
      loaderClassName: entity.dataLoaderType,
      loaderConfig
    });

    return {
      id: entity.id,
      name: entity.name,
      description: entity.description,
      // Support both new resources format and legacy resourceNames
      resources: entity.resources || (entity.resourceNames?.map(name => ({ name })) ?? []),
      dataLoader: entity.dataLoaderType,
      dataLoaderOptions: loaderConfig,
      dataLoaderFactory
    };
  }

  /**
   * Convert a DataConnectorConfig to DataConnectorConfigEntity
   */
  private configToEntity(config: DataConnectorConfig): Partial<DataConnectorConfigEntity> {
    // Extract openApiSpec from dataLoaderOptions if present (for GoogleAPIDataLoader)
    const dataLoaderOptions = config.dataLoaderOptions as any;
    const openApiSpec = dataLoaderOptions?.openApiSpec ?? null;

    return {
      id: config.id,
      name: config.name,
      description: config.description,
      openApiSpec,
      resources: config.resources,
      // For backward compatibility, also save as resourceNames
      resourceNames: config.resources.map(r => r.name),
      dataLoaderType: config.dataLoader || "google-api",
      dataLoaderConfig: config.dataLoaderOptions || null
    };
  }

  /**
   * Check if a connector is bundled (immutable)
   */
  private isBundled(connectorId: string): boolean {
    return this.bundledConfigs.has(connectorId);
  }

  /**
   * Create a new user connector (saves to database)
   * @throws APIError if connector already exists or ID is bundled
   */
  async create(config: DataConnectorConfig): Promise<void> {
    // Auto-generate ID from name if not provided
    if (!config.id) {
      config.id = generateIdFromName(config.name);
      logger.info(`Auto-generated connector ID: ${config.id}`);
    }

    // Check if bundled connector
    if (this.isBundled(config.id)) {
      throw new APIError(`Connector with id ${config.id} already exists as bundled connector`, 409);
    }

    // Check if already exists in database
    const configRepo = this.dataSource.getRepository(DataConnectorConfigEntity);
    const existing = await configRepo.findOne({ where: { id: config.id } });
    if (existing) {
      throw new APIError(`Connector with id ${config.id} already exists`, 409);
    }

    // Save to database
    const entity = this.configToEntity(config);
    await configRepo.save(entity);
    
    logger.info(`Created connector config: ${config.id}`);
  }

  /**
   * Get a connector config by ID (checks bundled first, then database)
   */
  async get(id: string): Promise<DataConnectorConfig | null> {
    // Check bundled configs first
    const bundled = this.bundledConfigs.get(id);
    if (bundled) {
      return bundled;
    }

    // Check database
    const configRepo = this.dataSource.getRepository(DataConnectorConfigEntity);
    const entity = await configRepo.findOne({ where: { id } });
    
    if (!entity) {
      return null;
    }

    return this.entityToConfig(entity);
  }

  /**
   * Get all connector configs (bundled + database)
   */
  async list(): Promise<DataConnectorConfig[]> {
    // Get bundled configs
    const bundled = Array.from(this.bundledConfigs.values());

    // Get database configs
    const configRepo = this.dataSource.getRepository(DataConnectorConfigEntity);
    const dbEntities = await configRepo.find();
    const dbConfigs = dbEntities.map(entity => this.entityToConfig(entity));

    return [...bundled, ...dbConfigs];
  }

  /**
   * Update a connector config
   * @throws APIError if connector doesn't exist or is bundled
   */
  async update(id: string, updates: Partial<DataConnectorConfig>): Promise<void> {
    // Cannot update bundled connectors
    if (this.isBundled(id)) {
      throw new APIError("Cannot update bundled data connectors", 403);
    }

    // Get existing config
    const configRepo = this.dataSource.getRepository(DataConnectorConfigEntity);
    const entity = await configRepo.findOne({ where: { id } });
    
    if (!entity) {
      throw new APIError(`Connector config not found: ${id}`, 404);
    }

    // Extract openApiSpec from dataLoaderOptions if present
    const dataLoaderOptions = updates.dataLoaderOptions as any;
    const openApiSpec = dataLoaderOptions?.openApiSpec ?? entity.openApiSpec;

    // Apply updates
    Object.assign(entity, {
      name: updates.name ?? entity.name,
      description: updates.description ?? entity.description,
      openApiSpec,
      resources: updates.resources ?? entity.resources,
      // For backward compatibility, also update resourceNames
      resourceNames: updates.resources?.map(r => r.name) ?? entity.resourceNames,
      dataLoaderType: updates.dataLoader ?? entity.dataLoaderType,
      dataLoaderConfig: updates.dataLoaderOptions ?? entity.dataLoaderConfig,
    });

    await configRepo.save(entity);
    logger.info(`Updated connector config: ${id}`);
  }

  /**
   * Delete a connector configuration and all associated data
   * @throws APIError if connector is not found or is bundled
   */
  async delete(connectorId: string): Promise<void> {
    // Cannot delete bundled connectors
    if (this.isBundled(connectorId)) {
      throw new APIError("Cannot delete bundled data connectors", 403);
    }

    // Get config to ensure it exists
    const config = await this.get(connectorId);
    if (!config) {
      throw new APIError(`Connector config not found: ${connectorId}`, 404);
    }

    // First disconnect and clear all data
    await this.disconnect(connectorId);

    // Then remove the config from database
    const configRepo = this.dataSource.getRepository(DataConnectorConfigEntity);
    await configRepo.delete({ id: connectorId });

    logger.info(`Deleted connector config: ${connectorId}`);
  }

  /**
   * Get a single connector by ID with its current status
   */
  async getConnectorInfo(connectorId: string): Promise<DataConnectorInfo | null> {
    const config = await this.get(connectorId);
    if (!config) {
      return null;
    }

    // Use a LEFT JOIN to fetch status and last job in one query
    const result = await this.dataSource
      .getRepository(DataConnectorStatusEntity)
      .createQueryBuilder("status")
      .leftJoinAndMapOne(
        "status.lastJob",
        DataJobEntity,
        "job",
        "status.lastDataJobId = job.id"
      )
      .where("status.connectorId = :connectorId", { connectorId })
      .getOne();

    const status = result;
    const lastJob = (status as any)?.lastJob as DataJobEntity | undefined;
    const lastDataJob = lastJob ? this.mapJobEntityToInfo(lastJob) : null;

    return {
      id: config.id!,
      name: config.name,
      description: config.description,
      isConnected: status?.isConnected || false,
      isLoading: status?.isLoading || false,
      lastSyncedAt: status?.lastSyncedAt || null,
      dataJobId: status?.dataJobId || null,
      lastDataJob,
      isRemovable: !this.isBundled(config.id!),
    };
  }

  /**
   * Get all connectors with their current status
   */
  async getAll(): Promise<DataConnectorInfo[]> {
    const configs = await this.list();
    
    // Use a LEFT JOIN to fetch all statuses and their last jobs in one query
    const statusesWithJobs = await this.dataSource
      .getRepository(DataConnectorStatusEntity)
      .createQueryBuilder("status")
      .leftJoinAndMapOne(
        "status.lastJob",
        DataJobEntity,
        "job",
        "status.lastDataJobId = job.id"
      )
      .getMany();
    
    // Build a map of statuses by connector ID
    const statusMap = new Map(
      statusesWithJobs.map(status => {
        const lastJob = (status as any).lastJob as DataJobEntity | undefined;
        return [
          status.connectorId,
          {
            status,
            lastDataJob: lastJob ? this.mapJobEntityToInfo(lastJob) : null
          }
        ];
      })
    );
    
    return configs.map(config => {
      const data = statusMap.get(config.id!);
      const status = data?.status;
      const lastDataJob = data?.lastDataJob || null;
      
      return {
        id: config.id!,
        name: config.name,
        description: config.description,
        isConnected: status?.isConnected || false,
        isLoading: status?.isLoading || false,
        lastSyncedAt: status?.lastSyncedAt || null,
        dataJobId: status?.dataJobId || null,
        lastDataJob,
        isRemovable: !this.isBundled(config.id!),
      };
    });
  }

  /**
   * Disconnect a data connector, clearing all data and resetting connection status
   */
  async disconnect(connectorId: string): Promise<void> {
    const config = await this.get(connectorId);
    if (!config) {
      throw new Error(`Connector config not found: ${connectorId}`);
    }

    // Create the connector instance to access its disconnect method
    const connector = await DataConnector.create(config, this.dataSource);
    
    // Disconnect and clear all data
    await connector.disconnect();
  }

  /**
   * Gets a data connector instance by ID
   * @param connectorId - The connector ID
   * @returns DataConnector instance
   * @throws APIError if connector not found
   */
  async getConnector(connectorId: string): Promise<DataConnector> {
    const connectorConfig = await this.get(connectorId);
    
    if (!connectorConfig) {
      throw new APIError(`Data connector not found: ${connectorId}`, 404);
    }
    
    return DataConnector.create(connectorConfig, this.dataSource);
  }

  /**
   * Maps a DataJobEntity to DataJobInfo for API responses
   */
  private mapJobEntityToInfo(job: DataJobEntity): DataJobInfo {
    const runTimeMs = job.startedAt 
      ? (job.finishedAt ? job.finishedAt.getTime() : Date.now()) - job.startedAt.getTime()
      : 0;

    return {
      id: job.id,
      dataConnectorId: job.dataConnectorId,
      type: job.type,
      state: job.state,
      result: job.result,
      runTimeMs,
      params: job.params,
      syncContext: job.syncContext,
      progress: job.progress,
      error: job.error,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
    };
  }

  // Legacy method aliases for backward compatibility
  /** @deprecated Use create() instead */
  async addNew(config: DataConnectorConfig): Promise<void> {
    return this.create(config);
  }

  /** @deprecated Use get() instead */
  async getConfig(id: string): Promise<DataConnectorConfig | null> {
    return this.get(id);
  }
}
