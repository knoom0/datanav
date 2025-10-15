import { DataSource } from "typeorm";

import { DataConnector, DataConnectorConfig } from "@/lib/data/connector";
import { dataConnectorConfigs } from "@/lib/data/connector-config";
import { DataConnectorStatusEntity } from "@/lib/data/entities";
import { APIError } from "@/lib/errors";
import { DataConnectorInfo } from "@/lib/types";

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

    const statusRepo = this.dataSource.getRepository(DataConnectorStatusEntity);
    const status = await statusRepo.findOne({
      where: { connectorId }
    });

    return {
      id: config.id,
      name: config.name,
      description: config.description,
      isConnected: status?.isConnected || false,
      isLoading: status?.isLoading || false,
      lastLoadedAt: status?.lastLoadedAt || null,
      dataJobId: status?.dataJobId || null,
    };
  }

  /**
   * Get all registered data connectors with their current status
   */
  async getAll(): Promise<DataConnectorInfo[]> {
    const configs = Array.from(this.connectorConfigs.values());
    const statusRepo = this.dataSource.getRepository(DataConnectorStatusEntity);
    
    // Fetch all statuses in one query for efficiency
    const statuses = await statusRepo.find();
    const statusMap = new Map(statuses.map(status => [status.connectorId, status]));
    
    return configs.map(config => {
      const status = statusMap.get(config.id);
      return {
        id: config.id,
        name: config.name,
        description: config.description,
        isConnected: status?.isConnected || false,
        isLoading: status?.isLoading || false,
        lastLoadedAt: status?.lastLoadedAt || null,
        dataJobId: status?.dataJobId || null,
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
}