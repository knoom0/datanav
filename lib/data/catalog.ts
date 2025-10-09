import { DataSource } from "typeorm";

import { DataConnectorConfig } from "@/lib/data/connector";
import { dataConnectorConfigs } from "@/lib/data/connector-config";
import { DataConnectorStatusEntity } from "@/lib/data/entities";

/**
 * Information about a data connector including its configuration and current status
 */
export interface DataConnectorInfo {
  id: string;
  name: string;
  description: string;
  isConnected: boolean;
  isLoading: boolean;
  lastLoadedAt: Date | null;
}

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
  async getConnector(connectorId: string): Promise<DataConnectorInfo | null> {
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
    const { DataConnector } = await import("@/lib/data/connector");
    const connector = await DataConnector.create(config, this.dataSource);
    
    // Disconnect and clear all data
    await connector.disconnect();
  }
}