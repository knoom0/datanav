import { z } from "zod/v3";

import { BaseAgentTool } from "@/lib/agent/core/agent";
import { DatabaseClient } from "@/lib/data/db-client";
import { ActionableError, type DataQueryResult } from "@/lib/types";

/**
 * Validates that a SQL query is a SELECT query only
 * @param sql The SQL query to validate
 * @returns true if valid, throws error if not
 */
function validateSelectQuery(sql: string): boolean {
  // Check for forbidden write operations at the start of the query
  if (/^\s*(insert|update|delete|create|drop|alter|truncate|grant|revoke|execute|exec|call)/i.test(sql)) {
    throw new ActionableError("Read-only QueryRunner: write operations are not allowed");
  }
  
  return true;
}

const DatabaseClientToolSchema = z.object({
  operation: z.enum(["list_tables", "query"]).describe("The operation to perform"),
  sql: z.string().optional().describe('SQL query to execute (required for query operation). Double-quote all schema, table, and column names in the query (e.g. SELECT "column_name" FROM "schema"."table"."column_name").'),
});

export type DatabaseClientToolParams = z.infer<typeof DatabaseClientToolSchema>;

export interface DatabaseClientToolOptions {
  /** Enable query result tracking and caching */
  enableTracking?: boolean;
  /** Data spec to match queries for tracking (required if enableTracking is true) */
  dataSpec?: any;
}

/**
 * Tool that provides database access to agents with read-only SELECT operations
 */
export class DatabaseClientTool extends BaseAgentTool {
  readonly name = "database_client";
  readonly description = "Access database information and execute read-only SQL queries. Supports listing tables and executing SELECT queries only.";
  readonly inputSchema = DatabaseClientToolSchema;

  private dbClient: DatabaseClient;
  private enableTracking: boolean;
  private dataSpec?: any;
  private queryResults: Map<string, DataQueryResult> = new Map();
  private queryCache: Map<string, { results: any[], rowCount: number, note?: string }> = new Map();

  constructor(dbClient: DatabaseClient, options: DatabaseClientToolOptions = {}) {
    super();
    this.dbClient = dbClient;
    this.enableTracking = options.enableTracking ?? false;
    this.dataSpec = options.dataSpec;
  }

  protected async executeInternal(params: DatabaseClientToolParams): Promise<any> {
    const { operation, sql } = params;

    switch (operation) {
    case "list_tables":
      return await this.listTables();
      
    case "query":
      if (!sql) {
        throw new ActionableError("SQL query is required for query operation");
      }
      return await this.executeQuery(sql);
      
    default:
      throw new ActionableError(`Unknown operation: ${operation}`);
    }
  }

  private async listTables(): Promise<{ tables: Record<string, any> }> {
    const tableInfos = await this.dbClient.getTableInfos();
    return { tables: tableInfos };
  }

  private async executeQuery(sql: string): Promise<{ results: any[], rowCount: number, note?: string }> {
    // Validate that the query is a SELECT query
    validateSelectQuery(sql);
    
    // Check cache first if tracking is enabled
    if (this.enableTracking && this.queryCache.has(sql)) {
      return this.queryCache.get(sql)!;
    }
    
    const results = await this.dbClient.query(sql);
    const totalRowCount = results.length;
    const maxRows = 50;
    
    // Limit results to 50 rows if there are more to save tokens
    const limitedResults = totalRowCount > maxRows ? results.slice(0, maxRows) : results;
    const note = totalRowCount > maxRows 
      ? `Note: Only showing ${maxRows} of ${totalRowCount} rows to save tokens. Consider adding LIMIT clause or filtering your query to see specific data.`
      : undefined;
    
    const queryResult = {
      results: limitedResults,
      rowCount: totalRowCount,
      ...(note && { note })
    };
    
    // Cache the result if tracking is enabled
    if (this.enableTracking) {
      this.queryCache.set(sql, queryResult);
      
      // Track the result if dataSpec is provided
      if (this.dataSpec) {
        // Track with full results for internal use
        this.trackQueryResult(sql, results);
      }
    }
    
    return queryResult;
  }

  private trackQueryResult(sql: string, results: any[]): void {
    // Find matching query from data spec
    const matchingQuery = this.dataSpec.queries?.find((q: any) => 
      q.query === sql || sql.includes(q.name)
    );
    
    if (matchingQuery) {
      this.queryResults.set(matchingQuery.name, {
        name: matchingQuery.name,
        description: matchingQuery.description,
        query: matchingQuery.query,
        columnInfos: matchingQuery.columnInfos,
        records: results
      });
    }
  }

  /**
   * Get all tracked query results (only available when tracking is enabled)
   */
  getQueryResults(): DataQueryResult[] {
    return Array.from(this.queryResults.values());
  }

  /**
   * Clear query cache and tracked results
   */
  clearCache(): void {
    this.queryCache.clear();
    this.queryResults.clear();
  }
}
