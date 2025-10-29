import { CodeAgent } from "@/lib/agent/coding/code-agent";
import { EvoAgentChain, StreamParams, UIMessageStream } from "@/lib/agent/core/agent";
import { DataDiscoveryAgent } from "@/lib/agent/data-discovery/agent";
import { QueryGen } from "@/lib/agent/data-query/query-gen";
import { DesignGen } from "@/lib/agent/designing/design-gen";
import { PlanGen } from "@/lib/agent/planning/plan-gen";
import { DataCatalog } from "@/lib/data/catalog";
import { DatabaseClient } from "@/lib/data/db-client";
import { getUserDataSource } from "@/lib/entities";
import { Project, ProjectConfig } from "@/lib/types";
import { filterUserMessages } from "@/lib/util/message-util";


export class Dashbot extends EvoAgentChain {
  constructor({
    dbClient,
    project,
    projectConfig,
    dataCatalog,
  }: {
    dbClient: DatabaseClient;
    project: Project;
    projectConfig: ProjectConfig;
    dataCatalog: DataCatalog;
  }) {
    const agents = [
      new DataDiscoveryAgent({ project, dbClient, dataCatalog }),
      new PlanGen({ dbClient, project, productType: "dashboard" }),
      new QueryGen({ dbClient, project }),
      new DesignGen({ project, projectConfig }),
      new CodeAgent({ project }),
    ];
    super({ agents, project });
  }

  /**
   * Override stream method to filter out non-user messages
   */
  stream(params: StreamParams): UIMessageStream {
    const filteredParams = {
      ...params,
      messages: filterUserMessages(params.messages)
    };
    return super.stream(filteredParams);
  }
}

/**
 * Factory function to create a Dashbot instance with default configuration
 * Initializes database client and uses configured model
 */
export async function createDashbot(project: Project, projectConfig: ProjectConfig): Promise<Dashbot> {
  // Get the global data source (this ensures it's initialized)
  const dataSource = await getUserDataSource();
  
  // Create database client with the data source
  const dbClient = new DatabaseClient(dataSource);

  // Create data catalog with the same data source
  const dataCatalog = new DataCatalog({ dataSource });

  // Create Dashbot instance
  return new Dashbot({
    dbClient,
    project,
    projectConfig,
    dataCatalog
  });
}
