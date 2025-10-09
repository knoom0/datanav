import { DataSource, QueryRunner, Table } from "typeorm";

import { SCHEMA_NAME } from "@/lib/data/entities";
import { TableInfo } from "@/lib/types";


function generateDDL(table: Table): string {
  const columnDefinitions = table.columns.map(col => {
    const parts: string[] = [];
    
    // Column name and type
    parts.push(`"${col.name}" ${col.type}`);
    
    // NOT NULL constraint
    if (!col.isNullable) {
      parts.push("NOT NULL");
    }
    
    // Default value
    if (col.default !== undefined && col.default !== null) {
      parts.push(`DEFAULT ${col.default}`);
    }
    
    // Comment if available
    if (col.comment) {
      parts.push(`-- ${col.comment}`);
    }
    
    return parts.join(" ");
  });

  return `CREATE TABLE "${table.name}" (\n  ${columnDefinitions.join(",\n  ")}\n);`;
}

export class DatabaseClient {
  private AppDataSource: Promise<DataSource> | DataSource;
  
  constructor(dataSource: DataSource) {
    this.AppDataSource = dataSource;
  }

  private async getQueryRunner(): Promise<QueryRunner> {
    const dataSource = await Promise.resolve(this.AppDataSource);
    return dataSource.createQueryRunner();
  }
  
  public async getDataSource(): Promise<DataSource> {
    return await Promise.resolve(this.AppDataSource);
  }

  public async checkConnection(): Promise<void> {
    const conn = await this.getQueryRunner();
    try {
      await conn.query("SELECT 1");
    } finally {
      await conn.release();
    }
  }

  public async getTableInfos(): Promise<Record<string, TableInfo>> {
    const tableInfos: Record<string, TableInfo> = {};
    const conn = await this.getQueryRunner();
    try {
      const tables = await conn.getTables();
      const systemSchemas = ["information_schema", "pg_catalog", "pg_toast", "pg_temp_1", "pg_toast_temp_1", SCHEMA_NAME];

      for (const table of tables) {
        // Skip tables from system schemas
        if (table.schema && systemSchemas.includes(table.schema)) {
          continue;
        }
        
        tableInfos[table.name] = {
          schema: table.schema,
          name: table.name,
          ddl: generateDDL(table)
        };
      }

      return tableInfos;
    } finally {
      await conn.release();
    }
  }

  public async query<T extends Record<string, any>>(sql: string, parameters?: any[]): Promise<T[]> {
    const conn = await this.getQueryRunner();
    try {
      const result = await conn.query(sql, parameters);
      return Array.isArray(result) ? result : [result];
    } finally {
      await conn.release();
    }
  }
}