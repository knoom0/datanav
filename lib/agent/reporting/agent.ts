import { LanguageModelV2 } from "@ai-sdk/provider";
import { streamText, type ModelMessage, type UIMessageStreamWriter, stepCountIs } from "ai";

import { EvoAgentBase, createToolsMap, IterationResult, pipeUIMessageStream, getAgentModel, isReasoningModel, generateSessionContext } from "@/lib/agent/core/agent";
import { DatabaseClientTool } from "@/lib/agent/tool/db-client-tool";
import { ProjectTool } from "@/lib/agent/tool/project-tool";
import { DEFAULT_MAX_STEP } from "@/lib/consts";
import { DatabaseClient } from "@/lib/data/db-client";
import { DataChartConfig, Project, REPORT_BUNDLE_PART_TYPE, type Report, type ReportBundle } from "@/lib/types";

const MAX_STEPS = DEFAULT_MAX_STEP;

/**
 * Creates a complete report bundle by executing missing data queries
 * @param params Object containing reportArtifact and dbTool
 * @returns Complete ReportBundle with all required data query results
 */
async function makeReportBundle({ reportArtifact, dbTool }: { reportArtifact: Report; dbTool: DatabaseClientTool }): Promise<ReportBundle> {
  const chartRegex = /```chart\s*\n([\s\S]*?)\n```/g;
  const availableQueryNames = new Set(dbTool.getQueryResults().map(result => result.name));
  const missingQueries: string[] = [];
  
  // Extract all chart configurations from the report
  let match;
  while ((match = chartRegex.exec(reportArtifact.text)) !== null) {
    try {
      const chartConfig = JSON.parse(match[1]) as DataChartConfig;
      
      // Check if the dataQueryName exists in the available query results
      if (!availableQueryNames.has(chartConfig.dataQueryName)) {
        missingQueries.push(chartConfig.dataQueryName);
      }
    } catch {
      // Invalid JSON in chart configuration - throw error
      throw new Error(`Invalid chart configuration in the report. Please fix the JSON syntax in this chart block: ${match[1]}`);
    }
  }
  
  // Execute missing queries
  for (const queryName of missingQueries) {
    // Find the query definition from data spec
    const dataSpec = dbTool["dataSpec"]; // Access private property for query definitions
    if (!dataSpec || !dataSpec.queries) {
      throw new Error(`Data spec not available to execute missing query: ${queryName}`);
    }
    
    const queryDef = dataSpec.queries.find((q: any) => q.name === queryName);
    if (!queryDef) {
      throw new Error(`Query definition not found for: ${queryName}`);
    }
    
    // Execute the query using the database tool
    await dbTool.execute({
      operation: "query",
      sql: queryDef.query
    });
  }
  
  // Create and return the complete report bundle
  return {
    type: "report_bundle",
    text: reportArtifact.text,
    dataQueryResults: dbTool.getQueryResults()
  };
}

function systemMessageTemplate({model}: {model: LanguageModelV2}): string {
  return `
${generateSessionContext()}

You are a data reporting specialist participating in a data analysis project.

Your task is to read the project requirements, analyze the data using the provided SQL queries, and generate a comprehensive card-style report optimized for mobile viewing.

<Instructions>
1. Use the ${ProjectTool.name} tool to get the 'prd' artifact to understand the project requirements and objectives.
2. Use the ${ProjectTool.name} tool to get the 'data_spec' artifact to read the available SQL queries and data sources.
3. Use the ${DatabaseClientTool.name} tool to execute the SQL queries and retrieve the data.
4. Analyze the retrieved data to identify patterns, trends, and insights that satisfy the requirements from the PRD.
5. Generate a mobile-friendly report and use ${ProjectTool.name} tool to save it as a 'report' artifact. 
- The report should satisfy the PRD requirements.
- The report MUST strictly follow the report format specified below.
6. Give a one-line summary of your work to the user.
</Instructions>

<Report Format>
The report should be in markdown format with the following special notations:
- Summary: this section summarizes key insights from the report. It should be short, to the point and include the key numbers if possible. It should be placed at the top using the following notation:

\`\`\`summary
- Key Insight 1
- Key Insight 2
- Key Insight 3
\`\`\`

- Charts: you can embed charts based on data spec queries using the following notation:

\`\`\`chart
${JSON.stringify({  
  type: "line",
  dataQueryName: "query_name_from_data_spec",
  keyColumnName: "date_column",
  seriesColumnNames: ["value1", "value2"]
} as DataChartConfig)}
\`\`\`

  - The "dataQueryName" must match exactly with a query name from the data_spec artifact.
  - The "keyColumnName" must be a column name from the data spec query result.
  - The "seriesColumnNames" must be column names from the data spec query result.
</Report Format>

<Chart Types>
Choose the appropriate chart type based on your data and the insights you want to convey. Each chart must have its own message:

**Line Chart (type: "line")**
- Use for: Time series data, trends over time, continuous data progression
- Best for: Showing changes and patterns over time periods
- Data requirements: X-axis should be sequential (dates, time periods, ordered categories)
- Example: Daily sales, monthly growth rates, yearly revenue trends

**Bar Chart (type: "bar")**
- Use for: Comparing discrete categories, ranking data, showing differences between groups
- Best for: Categorical comparisons where precise values matter
- Data requirements: Clear distinct categories with quantitative values
- Example: Sales by region, product performance comparison, demographic breakdowns

**Area Chart (type: "area")**
- Use for: Time series data with emphasis on cumulative effect or volume
- Best for: Showing parts of a whole over time, stacked data relationships
- Data requirements: Time-based data, often with multiple series that can be stacked
- Example: Revenue composition over time, user acquisition by channel, budget allocation trends

**Pie Chart (type: "pie")**
- Use for: Parts of a whole, percentage breakdowns, composition analysis
- Best for: Simple proportional relationships (ideal for 3-7 categories)
- Data requirements: Categories that sum to a meaningful total, percentage/proportion data
- Example: Market share distribution, budget allocation, demographic composition

**Donut Chart (type: "donut")**
- Use for: Similar to pie charts but allows central text/metrics
- Best for: Highlighting a key metric while showing composition
- Data requirements: Same as pie chart, with opportunity for central summary
- Example: Total revenue with breakdown by source, completion rates with overall percentage

**Scatter Plot (type: "scatter")**
- Use for: Correlation analysis, relationship between two continuous variables
- Best for: Identifying patterns, outliers, or relationships between metrics
- Data requirements: Two continuous numerical variables
- Example: Price vs. sales volume, marketing spend vs. conversions, age vs. income

**Radar Chart (type: "radar")**
- Use for: Multi-dimensional data comparison, performance across multiple metrics
- Best for: Comparing entities across several standardized criteria
- Data requirements: Multiple comparable metrics, typically 3-8 dimensions
- Example: Product feature comparison, employee performance evaluation, competitor analysis

**Sparkline (type: "sparkline")**
- Use for: Compact trend visualization, inline data context
- Best for: Quick trend indication in limited space, embedded metrics
- Data requirements: Simple time series or sequential data
- Example: Embedded trends in tables, dashboard KPI trends, inline performance indicators
</Chart Type Guidelines>

<Notes>
${isReasoningModel(model) ? "" : "- Think step by step. Wrap your thinking in <reasoning> tags."}
- DO NOT finish a response until the report is generated and stored in the project.
- DO NOT include the actual report content in the response.
- DO NOT include <reasoning> sections in the report.
- Present data entries in human-friendly way. For an example, users do not comprehend a data entry if only its ID is presented.
- Queries in data spec don't exist as views in the database. You must execute them to get the data.
</Notes>
  `;
}


export class ReportingAgent extends EvoAgentBase {
  private model: LanguageModelV2;
  private dbClient: DatabaseClient;
  private projectTool: ProjectTool;

  constructor({model, project, dbClient}: {model?: LanguageModelV2, project: Project, dbClient: DatabaseClient}) {
    super({ project, maxIterations: 3 });
    if (model) {
      this.model = model;
    } else {
      this.model = getAgentModel(this) as LanguageModelV2;
    }
    this.dbClient = dbClient;
    this.projectTool = new ProjectTool(project);
  }

  async iterate({ messages, writer, iteration: _iteration }: { messages: ModelMessage[], writer: UIMessageStreamWriter, iteration: number }): Promise<IterationResult> {
    // Check if project has required artifacts and raise an error if they don"t exist
    const dataSpec = this.project.get("data_spec");
    if (!dataSpec) {
      throw new Error("A project must have a data_spec artifact to generate a report");
    }
    
    const prd = this.project.get("prd");
    if (!prd) {
      throw new Error("A project must have a prd artifact to generate a report");
    }

    // Create database client tool with tracking enabled
    const dbTool = new DatabaseClientTool(this.dbClient, {
      enableTracking: true,
      dataSpec: dataSpec
    });
    
    const tools = createToolsMap([
      dbTool,
      this.projectTool
    ]);

    let result: any = null;
    let error: any = null;

    const res = streamText({
      model: this.model,
      messages: [
        {
          role: "system",
          content: systemMessageTemplate({model: this.model})
        },
        ...messages
      ] as ModelMessage[],
      tools,
      onFinish: (finishResult: any) => {
        result = finishResult;
      },
      onError: (err) => {
        error = err;
      },
      stopWhen: stepCountIs(MAX_STEPS),
    });

    await pipeUIMessageStream(res.toUIMessageStream(), writer, { omitStartFinish: true });
    
    if (error) {
      throw error;
    }

    // Get the report artifact from the project (created by ProjectTool during execution)
    const reportArtifact = this.project.get("report");
    if (!reportArtifact) {
      throw new Error("Report artifact not found");
    }
    
    // Create complete ReportBundle by executing any missing queries
    const reportBundle = await makeReportBundle({ 
      reportArtifact: reportArtifact as Report, 
      dbTool 
    });

    // Store the report bundle in the project
    this.project.put(reportBundle);

    await writer.write({
      type: REPORT_BUNDLE_PART_TYPE,
      data: reportBundle
    });

    // Success is determined by whether the agent completed without errors and all chart queries are valid
    return {
      success: true,
      response: result
    };
  }
}
