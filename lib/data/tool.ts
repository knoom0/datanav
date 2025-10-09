import { z } from "zod/v3";

import { BaseAgentTool } from "@/lib/agent/core/agent";
import { DataCatalog, DataConnectorInfo } from "@/lib/data/catalog";
import { DataConnectorStatusEntity } from "@/lib/data/entities";
import logger from "@/lib/logger";
import { ActionableError } from "@/lib/types";


// Constants for connection request timing
const ASK_TO_CONNECT_TIMEOUT_SECONDS = 5 * 60; // 5 minutes
const POLLING_INTERVAL_MS = 1000; // 1 second

const DataConnectorToolSchema = z.object({
  operation: z.enum(["list", "ask_to_connect"]).describe("The operation to perform"),
  connectorId: z.string().optional().describe("Connector ID (required for ask_to_connect operation)")
});

export type DataConnectorToolParams = z.infer<typeof DataConnectorToolSchema>;

/**
 * Result interface for askToConnect operation
 */
export interface AskToConnectResult {
  success: boolean;
  isConnected: boolean;
  connectorId: string;
  message: string;
}

/**
 * Configuration options for DataConnectorTool
 */
export interface DataConnectorToolConfig {
  dataCatalog: DataCatalog;
  askToConnectTimeoutSeconds?: number;
}

/**
 * Tool that provides access to the data catalog for discovering and connecting to remote data sources
 */
export class DataConnectorTool extends BaseAgentTool {
  readonly name = "data_connector";
  readonly description = "Can list data connectors with their information and status. Also can ask users to connect to a specific connector.";
  readonly inputSchema = DataConnectorToolSchema;

  private dataCatalog: DataCatalog;
  private askToConnectTimeoutSeconds: number;

  constructor(config: DataConnectorToolConfig) {
    super();
    this.dataCatalog = config.dataCatalog;
    this.askToConnectTimeoutSeconds = config.askToConnectTimeoutSeconds ?? ASK_TO_CONNECT_TIMEOUT_SECONDS;
  }

  protected async executeInternal(params: DataConnectorToolParams): Promise<any> {
    const { operation, connectorId } = params;

    switch (operation) {
    case "list":
      return await this.listConnectors();
      
    case "ask_to_connect":
      if (!connectorId) {
        throw new ActionableError("Connector ID is required for ask_to_connect operation");
      }
      return await this.askToConnect(connectorId);
            
    default:
      throw new ActionableError(`Unknown operation: ${operation}`);
    }
  }

  private async listConnectors(): Promise<{ connectors: DataConnectorInfo[] }> {
    const connectors = await this.dataCatalog.getAll();
    return { connectors };
  }

  private async askToConnect(connectorId: string): Promise<AskToConnectResult> {
    // Guard clause: validate connector exists
    const config = this.dataCatalog.getConfig(connectorId);
    if (!config) {
      throw new ActionableError(`Connector with ID '${connectorId}' not found`);
    }

    // Initialize result object
    const result: AskToConnectResult = {
      success: true,
      isConnected: false,
      connectorId,
      message: ""
    };

    // Get or calculate timeout timestamp
    const dataSource = this.dataCatalog["dataSource"];
    const statusRepo = dataSource.getRepository(DataConnectorStatusEntity);
    
    // Check if there"s already an existing timeout request
    const existingStatus = await statusRepo.findOne({ where: { connectorId } });
    let timeoutDate: Date;
    
    if (existingStatus?.askedToConnectUntil && new Date() < existingStatus.askedToConnectUntil) {
      // Use existing timeout if still valid
      timeoutDate = existingStatus.askedToConnectUntil;
    } else {
      // Calculate new timeout timestamp
      timeoutDate = new Date();
      timeoutDate.setSeconds(timeoutDate.getSeconds() + this.askToConnectTimeoutSeconds);
      
      // Update the connector status to indicate we asked the user to connect
      await statusRepo.upsert(
        {
          connectorId,
          askedToConnectUntil: timeoutDate,
          updatedAt: new Date()
        },
        ["connectorId"]
      );
    }

    logger.info(`Asked user to connect to ${connectorId}, waiting until ${timeoutDate.toISOString()}`);
    
    const startTime = Date.now();
    
    // Poll until timeout or response
    while (new Date() < timeoutDate) {
      // Check current status
      const status = await statusRepo.findOne({ where: { connectorId } });
      
      // Guard clause: if askedToConnectUntil was cleared (set to null), user responded
      if (status?.askedToConnectUntil === null) {
        const waitedMs = Date.now() - startTime;
        result.isConnected = status.isConnected || false;
        result.message = result.isConnected 
          ? `User successfully connected to ${config.name} (responded in ${Math.round(waitedMs / 1000)}s)` 
          : `User declined or failed to connect to ${config.name} (responded in ${Math.round(waitedMs / 1000)}s)`;
        
        logger.info(`User responded to connection request for ${connectorId}, connected: ${result.isConnected}`);
        break;
      }
      
      // Guard clause: if user connected during the wait period
      if (status?.isConnected) {
        // Clear the askedToConnectUntil flag since connection is established
        await statusRepo.update({ connectorId }, { askedToConnectUntil: null });
        
        const waitedMs = Date.now() - startTime;
        result.isConnected = true;
        result.message = `User successfully connected to ${config.name} (connected in ${Math.round(waitedMs / 1000)}s)`;
        
        logger.info(`User connected to ${connectorId} during wait period`);
        break;
      }
      
      // Wait before next poll
      await new Promise(resolve => setTimeout(resolve, POLLING_INTERVAL_MS));
    }
    
    // Handle timeout case if no response was received
    if (!result.message) {
      const waitedMs = Date.now() - startTime;
      
      logger.info(`Connection request for ${connectorId} timed out after ${this.askToConnectTimeoutSeconds} seconds`);
      
      // Clear the timeout flag since we've expired
      await statusRepo.update({ connectorId }, { askedToConnectUntil: null });
      
      // Check final status
      const finalStatus = await statusRepo.findOne({ where: { connectorId } });
      result.isConnected = finalStatus?.isConnected || false;
      result.message = `Connection request for ${config.name} timed out after ${Math.round(waitedMs / 1000)}s. Current status: ${result.isConnected ? "connected" : "not connected"}`;
    }
    
    return result;
  }
}
