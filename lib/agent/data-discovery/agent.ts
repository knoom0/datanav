import { LanguageModelV2 } from "@ai-sdk/provider";
import { streamText, ModelMessage, stepCountIs, type UIMessageStreamWriter } from "ai";

import { createToolsMap, EvoAgentBase, getAgentModel, NextActionTool, pipeUIMessageStream, type NamedTool, type IterationResult, isReasoningModel } from "@/lib/agent/core/agent";
import { DatabaseClientTool } from "@/lib/agent/tool/db-client-tool";
import { DataCatalog } from "@/lib/data/catalog";
import { DatabaseClient } from "@/lib/data/db-client";
import { DataConnectorTool } from "@/lib/data/tool";
import { Project } from "@/lib/types";

const MAX_ITERATIONS = 3;

function systemMessageTemplate({model}: {model: LanguageModelV2}): string {
  return `
You are a data discovery agent. Your job is to determine if user requests can be met with existing data in the database or if they need to connect to remote data sources.

<Instructions>
1. Understand the user's request and what data they need
2. Use ${DatabaseClientTool.name} to check the database tables first to see if the required data is already available in the database
2-1. If suitable data is available in the database, call ${NextActionTool.name} with action "proceed" immediately
2-2. If no suitable data is available in the database, proceed to step 3
3. Check ${DataConnectorTool.name} to see if there are any data connectors that can provide the required data
3-1. If no suitable data connector is available, communicate your decision to the user and call ${NextActionTool.name} with action "stop"
3-2. If a suitable data connector is found but not connected, use ${DataConnectorTool.name} with "ask_to_connect" operation. This tool automatically confirms with the user before connecting so don't ask the user to connect
3-2-1. If the user connects to the data connector, call ${NextActionTool.name} with action "proceed"
3-2-2. If the user declines to connect to the data connector, call ${NextActionTool.name} with action "stop"

IMPORTANT: After determining whether data is available, you MUST immediately call ${NextActionTool.name} to indicate the next step.
</Instructions>

<Notes>
${isReasoningModel(model) ? "" : "- Think step by step. Wrap your thinking in <reasoning> tags."}
- Always check the database first before considering remote data sources
- Focus on data discovery and connection decisions rather than trying to answer the user's actual request
- When querying database, double-quote schema, table, and column names (e.g. SELECT "column_name" FROM "schema"."table_name")
- You MUST call ${NextActionTool.name} to communicate your final decision. Never end without calling this tool
</Notes>

<Examples>
- User: Analyze my spending history.
- Agent: I found a transactions table in the database that contains spending history. Since the required data is available in the database, I"ll call next_action with "proceed".

- User: Analyze my meeting history.
- Agent: There's currently no related data in the database but I can load data from Google Calendar to get the meeting history. Do you want to connect to Google Calendar? [After user connects successfully] Great! Google Calendar is now connected. I"ll call next_action with "proceed".

- User: Analyze my meeting history.
- Agent: There's currently no related data in the database but I can load data from Google Calendar to get the meeting history. Do you want to connect to Google Calendar? [After user declines] I understand you don't want to connect to Google Calendar. Since there's no other way to access meeting data, I"ll call next_action with "stop".
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
