import { DataSource } from "typeorm";

import { DataConnector, DataConnectorConfig } from "@/lib/data/connector";
import { dataConnectorConfigs } from "@/lib/data/connector-config";
import { DataConnectorStatusEntity, DataJobEntity } from "@/lib/data/entities";
import { APIError } from "@/lib/errors";
import { DataConnectorInfo, DataJobInfo } from "@/lib/types";

/**
 * Catalog for managing registered data connector configurations
 */
export class DataCatalog {
  private connectorConfigs: Map<string, DataConnectorConfig> = new Map();
  private dataSource: DataSource;

  constructor({ 
    dataSource, 
    connectorConfigs = dataConnectorConfigs 
  }: {
    dataSource: DataSource;
    connectorConfigs?: DataConnectorConfig[];
  }) {
    this.dataSource = dataSource;
    // Register provided connector configs
    connectorConfigs.forEach(config => this.register(config));
  }

  /**
   * Register a data connector config in the catalog
   */
  register(connectorConfig: DataConnectorConfig): void {
    this.connectorConfigs.set(connectorConfig.id, connectorConfig);
  }

  /**
   * Get a specific connector config by ID
   */
  getConfig(id: string): DataConnectorConfig | null {
    return this.connectorConfigs.get(id) || null;
  }

  /**
   * Get a single connector by ID with its current status
   */
  async getConnectorInfo(connectorId: string): Promise<DataConnectorInfo | null> {
    const config = this.getConfig(connectorId);
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
      id: config.id,
      name: config.name,
      description: config.description,
      isConnected: status?.isConnected || false,
      isLoading: status?.isLoading || false,
      lastLoadedAt: status?.lastLoadedAt || null,
      dataJobId: status?.dataJobId || null,
      lastDataJob,
    };
  }

  /**
   * Get all registered data connectors with their current status
   */
  async getAll(): Promise<DataConnectorInfo[]> {
    const configs = Array.from(this.connectorConfigs.values());
    
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
      const data = statusMap.get(config.id);
      const status = data?.status;
      const lastDataJob = data?.lastDataJob || null;
      
      return {
        id: config.id,
        name: config.name,
        description: config.description,
        isConnected: status?.isConnected || false,
        isLoading: status?.isLoading || false,
        lastLoadedAt: status?.lastLoadedAt || null,
        dataJobId: status?.dataJobId || null,
        lastDataJob,
      };
    });
  }

  /**
   * Disconnect a data connector, clearing all data and resetting connection status
   */
  async disconnect(connectorId: string): Promise<void> {
    const config = this.getConfig(connectorId);
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
    const connectorConfig = this.getConfig(connectorId);
    
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
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
    };
  }
}