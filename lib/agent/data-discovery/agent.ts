import { LanguageModelV2 } from "@ai-sdk/provider";
import { streamText, ModelMessage, stepCountIs, type UIMessageStreamWriter } from "ai";

import { createToolsMap, EvoAgentBase, getAgentModel, NextActionTool, pipeUIMessageStream, type NamedTool, type IterationResult, isReasoningModel, generateSessionContext } from "@/lib/agent/core/agent";
import { DatabaseClientTool } from "@/lib/agent/tool/db-client-tool";
import { DataCatalog } from "@/lib/data/catalog";
import { DatabaseClient } from "@/lib/data/db-client";
import { DataConnectorTool } from "@/lib/data/tool";
import { Project } from "@/lib/types";

const MAX_ITERATIONS = 3;

function systemMessageTemplate({model}: {model: LanguageModelV2}): string {
  return `
${generateSessionContext()}

You are a data discovery agent. Your job is to determine if user requests can be met with existing data in the database or if they need to load data from remote data sources.

<Instructions>
Your workflow has two possible outcomes:
- PROCEED: Data is available and ready to use
- STOP: Cannot fulfill the request

1. Check existing database tables using ${DatabaseClientTool.name}
   - If data exists and was updated within the last hour → Call ${NextActionTool.name} with action "proceed"
   - If data exists but is stale (updated more than an hour ago) → Note the data_connector_id and go to step 3
   - If no suitable data exists → Go to step 2

2. Check available data connectors using ${DataConnectorTool.name}
   - If no suitable connector exists → Explain to user and call ${NextActionTool.name} with action "stop"
   - If suitable connector exists → Go to step 3

3. Connect or load data using ${DataConnectorTool.name}
   - If connector is not connected → Use "ask_to_connect" operation (this tool automatically asks user permission)
   - If user declines connection → Call ${NextActionTool.name} with action "stop"
   - If connector is connected (or user just connected) → Use "load_data" operation
   - If data loads successfully → Call ${NextActionTool.name} with action "proceed"
   - If data load fails → Explain failure and call ${NextActionTool.name} with action "stop"

IMPORTANT: You MUST call ${NextActionTool.name} at the end to indicate whether to proceed or stop.
</Instructions>

<Notes>
${isReasoningModel(model) ? "" : "- Think step by step. Wrap your thinking in <reasoning> tags."}
- Always check the database first before considering remote data sources
- Focus on data discovery and connection decisions rather than trying to answer the user's actual request
- When querying database, double-quote schema, table, and column names (e.g. SELECT "column_name" FROM "schema"."table_name")
- After connecting to a data connector, you MUST load the data using "load_data" operation before proceeding
- You MUST call ${NextActionTool.name} to communicate your final decision. Never end without calling this tool
</Notes>

<Examples>
- User: Analyze my spending history.
- Agent: I found a transactions table in the database that contains spending history. The data was updated 10 minutes ago, so it's fresh. I"ll call next_action with "proceed".

- User: Analyze my YouTube watch history.
- Agent: I found a youtube_watch_history table in the database, but it was last updated 3 hours ago. Since it's been more than an hour, I'll refresh the data using the YouTube data connector... [After reloading] Successfully refreshed your YouTube watch history with the latest data. I"ll call next_action with "proceed".

- User: Analyze my meeting history.
- Agent: There's currently no related data in the database but I can load data from Google Calendar to get the meeting history. Do you want to connect to Google Calendar? [After user connects successfully] Great! Google Calendar is now connected. Loading the data... [After data loads] Successfully loaded meeting data from Google Calendar. I"ll call next_action with "proceed".

- User: Analyze my meeting history.
- Agent: There's currently no related data in the database but I can load data from Google Calendar to get the meeting history. Do you want to connect to Google Calendar? [After user declines] I understand you don't want to connect to Google Calendar. Since there's no other way to access meeting data, I"ll call next_action with "stop".

- User: Show me my YouTube watch history.
- Agent: I found that YouTube is already connected. Let me load your watch history... [After loading] Successfully loaded your YouTube watch history with 150 videos. I"ll call next_action with "proceed".
</Examples>
`;
}

export class DataDiscoveryAgent extends EvoAgentBase {
  private model: LanguageModelV2;
  private dbClient: DatabaseClient;
  private dataCatalog: DataCatalog;
  
  constructor({ 
    model, 
    project,
    dbClient, 
    dataCatalog 
  }: { 
    model?: LanguageModelV2;
    project: Project;
    dbClient: DatabaseClient;
    dataCatalog: DataCatalog;
  }) {
    super({ project, maxIterations: MAX_ITERATIONS });
    if (model) {
      this.model = model;
    } else {
      this.model = getAgentModel(this) as LanguageModelV2;
    }
    this.dbClient = dbClient;
    this.dataCatalog = dataCatalog;
  }


  async iterate({ messages, writer, iteration }: { 
    messages: ModelMessage[], 
    writer: UIMessageStreamWriter,
    iteration: number
  }): Promise<IterationResult> {
    
    let result: any = null;
    let error: any = null;

    const nextActionTool = new NextActionTool();
    const tools: NamedTool[] = [
      nextActionTool,
      new DatabaseClientTool(this.dbClient),
      new DataConnectorTool({ dataCatalog: this.dataCatalog })
    ];
    
    const res = streamText({
      model: this.model,

      messages: [
        {
          role: "system",
          content: systemMessageTemplate({model: this.model})
        },
        ...messages
      ] as ModelMessage[],

      tools: createToolsMap(tools),

      onFinish: (finishResult: any) => {
        result = finishResult;
      },

      onError: (err) => {
        error = err;
      },

      stopWhen: stepCountIs(10),

      experimental_telemetry: { 
        isEnabled: true,
        functionId: `${this.constructor.name}.iterate-${iteration}`,
      }
    });
    await pipeUIMessageStream(res.toUIMessageStream(), writer, { omitStartFinish: true });

    if (error) {
      throw error;
    }

    const nextAction = nextActionTool.getLastCall()?.result;

    return {
      success: true,
      response: result,
      nextAction
    };
  }
}
