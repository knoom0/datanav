import { EvoAgentChain, StreamParams, UIMessageStream } from "@/lib/agent/core/agent";
import { DataDiscoveryAgent } from "@/lib/agent/data-discovery/agent";
import { QueryGen } from "@/lib/agent/data-query/query-gen";
import { PlanGen } from "@/lib/agent/planning/plan-gen";
import { ReportingAgent } from "@/lib/agent/reporting/agent";
import { DataCatalog } from "@/lib/data/catalog";
import { DatabaseClient } from "@/lib/data/db-client";
import { getUserDataSource } from "@/lib/data/entities";
import { Project } from "@/lib/types";
import { filterUserMessages } from "@/lib/util/message-util";

export class Chatbot extends EvoAgentChain {
  private constructor({
    dbClient,
    project,
    dataCatalog,
  }: {
    dbClient: DatabaseClient;
    project: Project;
    dataCatalog: DataCatalog;
  }) {
    const agents = [
      new DataDiscoveryAgent({ dbClient, dataCatalog, project }),
      new PlanGen({ dbClient, project, productType: "report" }),
      new QueryGen({ dbClient, project }),
      new ReportingAgent({ project, dbClient }),
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

  /**
   * Factory method to create a Chatbot instance with default configuration
   * Initializes database client and data catalog
   */
  static async create(project: Project): Promise<Chatbot> {
    // Get the global data source (this ensures it"s initialized)
    const dataSource = await getUserDataSource();
    
    // Use the data source to create the database client
    const dbClient = new DatabaseClient(dataSource);
    
    // Create data catalog with default configuration
    const dataCatalog = new DataCatalog({ 
      dataSource: dataSource
    });


    // Create Chatbot instance
    return new Chatbot({
      dbClient,
      project,
      dataCatalog
    });
  }
}

