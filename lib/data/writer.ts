import { OpenAPIV3 } from "openapi-types";
import { DataSource } from "typeorm";

import { DatabaseClient } from "@/lib/data/db-client";
import { DataTableStatusEntity } from "@/lib/data/entities";
import logger from "@/lib/logger";

// SQL reserved keywords that need to be escaped or renamed
const SQL_RESERVED_KEYWORDS = new Set([
  "select", "from", "where", "insert", "update", "delete", "create", "drop", "alter", "table",
  "index", "view", "schema", "database", "user", "role", "grant", "revoke", "commit", "rollback",
  "begin", "end", "if", "else", "while", "for", "case", "when", "then", "else", "order", "by",
  "group", "having", "union", "join", "inner", "left", "right", "outer", "cross", "natural",
  "on", "as", "in", "not", "and", "or", "is", "null", "true", "false", "like", "between",
  "exists", "all", "any", "some", "distinct", "top", "limit", "offset", "fetch", "first",
  "last", "only", "with", "recursive", "window", "over", "partition", "rows", "range",
  "preceding", "following", "current", "row", "unbounded", "lead", "lag", "first_value",
  "last_value", "nth_value", "rank", "dense_rank", "row_number", "percent_rank", "cume_dist",
  "ntile", "cast", "convert", "extract", "date", "time", "timestamp", "interval", "year",
  "month", "day", "hour", "minute", "second", "millisecond", "microsecond", "nanosecond",
  "quarter", "week", "dow", "doy", "epoch", "timezone", "zone", "at", "time", "zone",
  "current_date", "current_time", "current_timestamp", "localtime", "localtimestamp",
  "now", "today", "yesterday", "tomorrow", "trunc", "round", "floor", "ceil", "abs",
  "sign", "mod", "power", "sqrt", "exp", "ln", "log", "sin", "cos", "tan", "asin",
  "acos", "atan", "atan2", "sinh", "cosh", "tanh", "degrees", "radians", "pi", "random",
  "count", "sum", "avg", "min", "max", "stddev", "variance", "stddev_pop", "stddev_samp",
  "var_pop", "var_samp", "corr", "covar_pop", "covar_samp", "regr_avgx", "regr_avgy",
  "regr_count", "regr_intercept", "regr_r2", "regr_slope", "regr_sxx", "regr_sxy", "regr_syy",
  "string_agg", "array_agg", "json_agg", "jsonb_agg", "json_object_agg", "jsonb_object_agg",
  "bool_and", "bool_or", "every", "bit_and", "bit_or", "bit_xor", "mode", "percentile_cont",
  "percentile_disc", "median", "width_bucket", "ntile", "dense_rank", "rank", "row_number",
  "lead", "lag", "first_value", "last_value", "nth_value", "percent_rank", "cume_dist",
  "ntile", "over", "partition", "order", "by", "rows", "range", "preceding", "following",
  "current", "row", "unbounded", "window", "with", "recursive", "cte", "materialized",
  "constraint", "primary", "key", "foreign", "references", "unique", "check", "default",
  "not", "null", "auto_increment", "identity", "serial", "bigserial", "smallserial",
  "sequence", "nextval", "currval", "setval", "lastval", "generated", "always", "as",
  "stored", "virtual", "computed", "persisted", "collate", "nocase", "binary", "ascii",
  "unicode", "utf8", "utf16", "utf32", "latin1", "cp1252", "iso8859_1", "koi8r", "koi8u",
  "gbk", "gb18030", "big5", "eucjp", "euckr", "euctw", "sjis", "ujis", "utf8mb4",
  "character", "varchar", "char", "text", "nchar", "nvarchar", "ntext", "clob", "blob",
  "binary", "varbinary", "image", "bit", "tinyint", "smallint", "int", "integer", "bigint",
  "decimal", "numeric", "float", "real", "double", "precision", "money", "smallmoney",
  "date", "time", "datetime", "datetime2", "smalldatetime", "datetimeoffset", "timestamp",
  "rowversion", "uniqueidentifier", "sql_variant", "xml", "geography", "geometry",
  "hierarchyid", "cursor", "table", "sql", "udt", "type", "assembly", "function", "procedure",
  "trigger", "event", "package", "body", "specification", "library", "java", "source",
  "class", "method", "field", "property", "attribute", "annotation", "interface", "enum",
  "exception", "error", "warning", "info", "debug", "trace", "log", "audit", "security",
  "privilege", "permission", "authorization", "authentication", "login", "password",
  "encryption", "decryption", "hash", "checksum", "signature", "certificate", "key",
  "public", "private", "protected", "internal", "external", "global", "local", "session",
  "connection", "transaction", "isolation", "level", "read", "uncommitted", "committed",
  "repeatable", "serializable", "snapshot", "versioning", "locking", "blocking", "deadlock",
  "timeout", "wait", "nowait", "skip", "locked", "no", "wait", "for", "update", "share",
  "exclusive", "access", "mode", "lock", "escalation", "hint", "optimizer", "plan",
  "statistics", "index", "hint", "force", "seek", "scan", "lookup", "merge", "hash",
  "nested", "loop", "join", "sort", "stream", "aggregate", "compute", "scalar", "table",
  "spool", "lazy", "eager", "spool", "tempdb", "temp", "temporary", "global", "local",
  "table", "variable", "cursor", "dynamic", "static", "forward_only", "scroll", "sensitive",
  "insensitive", "keyset", "fast_forward", "read_only", "scroll_locks", "optimistic",
  "concurrency", "control", "row", "versioning", "snapshot", "isolation", "level",
  "read", "committed", "snapshot", "repeatable", "read", "serializable", "snapshot",
  "isolation", "level", "read", "uncommitted", "read", "committed", "repeatable", "read",
  "serializable", "snapshot", "isolation", "level", "read", "uncommitted", "read",
  "committed", "repeatable", "read", "serializable", "snapshot", "isolation", "level"
]);

/**
 * Data table writer class that handles database operations and table status management
 */
export class DataWriter {
  private dbClient: DatabaseClient;
  private dataSource: DataSource;
  private connectorId: string;

  constructor(params: { dataSource: DataSource; connectorId: string }) {
    this.dbClient = new DatabaseClient(params.dataSource);
    this.dataSource = params.dataSource;
    this.connectorId = params.connectorId;
  }

  /**
   * Maps a property name to a safe column name, handling SQL reserved keywords
   * and ensuring valid SQL identifier naming
   */
  private mapPropertyToColumnName(propertyName: string): string {
    // Convert to lowercase for comparison with reserved keywords
    const lowerPropertyName = propertyName.toLowerCase();
    
    // Check if the property name is a SQL reserved keyword
    if (SQL_RESERVED_KEYWORDS.has(lowerPropertyName)) {
      // Add a suffix to make it non-reserved
      return `${propertyName}_col`;
    }
    
    // Return the original property name if it's safe
    return propertyName;
  }

  /**
   * Gets the schema name from the connector ID
   */
  private getSchemaName(): string {
    return this.connectorId.replace(/\./g, "_"); // Replace dots for valid SQL identifiers
  }

  /**
   * Formats the table name as {connectorId}.{resourceName}
   * Uses connector ID as schema name and resource name as table name
   */
  private getTableName(resourceName: string): string {
    const schemaName = this.getSchemaName();
    return `${schemaName}.${resourceName.toLowerCase()}`;
  }

  /**
   * Ensures the schema exists, creating it if necessary
   */
  private async ensureSchemaExists(): Promise<void> {
    const schemaName = this.getSchemaName();
    await this.dbClient.query(`CREATE SCHEMA IF NOT EXISTS ${schemaName}`);
  }

  /**
   * Updates the status of a data table
   */
  async updateTableStatus(params: {
    resourceName: string;
    lastLoadedAt?: Date;
  }): Promise<void> {
    const { resourceName, lastLoadedAt } = params;
    const tableName = this.getTableName(resourceName);
    const repo = this.dataSource.getRepository(DataTableStatusEntity);
    
    let tableStatus = await repo.findOne({
      where: { connectorId: this.connectorId, tableName }
    });
    
    if (!tableStatus) {
      tableStatus = new DataTableStatusEntity();
      tableStatus.connectorId = this.connectorId;
      tableStatus.tableName = tableName;
    }
    
    if (lastLoadedAt !== undefined) {
      tableStatus.lastLoadedAt = lastLoadedAt;
    } else {
      tableStatus.lastLoadedAt = new Date();
    }
    tableStatus.updatedAt = new Date();
    
    await repo.save(tableStatus);
    logger.info(`Updated table status for ${tableName} (connector: ${this.connectorId})`);
  }

  /**
   * Gets the table status for a specific resource
   */
  async getTableStatus(resourceName: string): Promise<DataTableStatusEntity | null> {
    const tableName = this.getTableName(resourceName);
    const repo = this.dataSource.getRepository(DataTableStatusEntity);
    
    return await repo.findOne({
      where: { connectorId: this.connectorId, tableName }
    });
  }


  /**
   * Converts OpenAPI schema type to PostgreSQL type
   */
  private getPostgresType(schema: OpenAPIV3.SchemaObject): string {
    if (schema.type === "string") {
      if (schema.format === "date-time") return "TIMESTAMP";
      if (schema.format === "date") return "DATE";
      if (schema.format === "time") return "TIME";
      if (schema.enum) return "VARCHAR(255)";
      return "TEXT";
    }
    if (schema.type === "number") return "DECIMAL";
    if (schema.type === "integer") return "INTEGER";
    if (schema.type === "boolean") return "BOOLEAN";
    if (schema.type === "array") return "JSONB";
    if (schema.type === "object") return "JSONB";
    return "TEXT";
  }

  /**
   * Gets the current table schema from PostgreSQL
   */
  private async getTableSchema(tableName: string): Promise<Record<string, { type: string, isPrimaryKey: boolean }>> {
    // Extract schema and table name from qualified table name
    const parts = tableName.split(".");
    const schemaName = parts.length > 1 ? parts[0] : "public";
    const tableNameOnly = parts.length > 1 ? parts[1] : tableName;
    
    const query = `
      SELECT 
        c.column_name, 
        c.data_type, 
        c.is_nullable,
        CASE WHEN tc.constraint_type = 'PRIMARY KEY' THEN true ELSE false END as is_primary_key
      FROM information_schema.columns c
      LEFT JOIN information_schema.key_column_usage kcu
        ON c.table_name = kcu.table_name 
        AND c.table_schema = kcu.table_schema
        AND c.column_name = kcu.column_name
      LEFT JOIN information_schema.table_constraints tc
        ON kcu.constraint_name = tc.constraint_name
        AND tc.constraint_type = 'PRIMARY KEY'
      WHERE c.table_name = $1
        AND c.table_schema = $2
    `;
    const result = await this.dbClient.query(query, [tableNameOnly, schemaName]);
    return result.reduce((acc, row) => {
      acc[row.column_name] = {
        type: `${row.data_type}${row.is_nullable === "NO" ? " NOT NULL" : ""}`,
        isPrimaryKey: row.is_primary_key
      };
      return acc;
    }, {} as Record<string, { type: string, isPrimaryKey: boolean }>);
  }

  /**
   * Sets the comment on a PostgreSQL table
   */
  private async setTableComment(tableName: string, comment: string): Promise<void> {
    // Escape single quotes in the comment
    const escapedComment = comment.replace(/'/g, "''");
    const query = `COMMENT ON TABLE ${tableName} IS '${escapedComment}'`;
    await this.dbClient.query(query);
  }

  /**
   * Sets the comment on a PostgreSQL column
   */
  private async setColumnComment(tableName: string, columnName: string, comment: string): Promise<void> {
    // Escape single quotes in the comment
    const escapedComment = comment.replace(/'/g, "''");
    // Quote column name to preserve case
    const quotedColumnName = `"${columnName}"`;
    const query = `COMMENT ON COLUMN ${tableName}.${quotedColumnName} IS '${escapedComment}'`;
    await this.dbClient.query(query);
  }

  /**
   * Finds the primary key column from schema properties
   * Looks for id field first, then any field ending with _id
   */
  private findPrimaryKeyColumn(schema: OpenAPIV3.SchemaObject): string | null {
    if (!schema.properties) return null;
    
    // First try to find id field (even if not required)
    if (schema.properties.id) {
      return "id";
    }
    
    // Then try to find a required property with _id suffix
    const requiredIdColumn = schema.required?.find(prop => 
      prop.endsWith("_id") && schema.properties?.[prop]
    );
    
    if (requiredIdColumn) return requiredIdColumn;
    
    // If no id field found, return null
    return null;
  }

  /**
   * Syncs a table with the given schema, creating or updating it as needed
   */
  async syncTableSchema(
    resourceName: string, 
    schema: OpenAPIV3.SchemaObject
  ): Promise<void> {
    // Ensure schema exists before creating table
    await this.ensureSchemaExists();
    
    const tableName = this.getTableName(resourceName);
    if (!schema.properties) {
      throw new Error(`Schema for table ${tableName} must have properties defined`);
    }

    // Find primary key column
    const primaryKeyColumn = this.findPrimaryKeyColumn(schema);
    if (!primaryKeyColumn) {
      throw new Error(`No primary key column found for table ${tableName}. Please add a required property with _id suffix.`);
    }

    // Get current table schema if it exists
    const currentSchema = await this.getTableSchema(tableName);
    const tableExists = Object.keys(currentSchema).length > 0;

    // Generate new schema - make all fields nullable by default unless explicitly required
    const newSchema = Object.entries(schema.properties).reduce((acc, [name, prop]) => {
      const columnName = this.mapPropertyToColumnName(name);
      const pgType = this.getPostgresType(prop as OpenAPIV3.SchemaObject);
      // Primary key should be NOT NULL since we filter out null values before writing
      const isNotNull = name === primaryKeyColumn;
      acc[columnName] = `${pgType}${isNotNull ? " NOT NULL" : ""}`;
      return acc;
    }, {} as Record<string, string>);

    if (!tableExists) {
      // Create new table
      const columns = Object.entries(newSchema).map(([columnName, type]) => {
        // Find the original property name for primary key comparison
        const originalPropertyName = Object.keys(schema.properties || {}).find(
          prop => this.mapPropertyToColumnName(prop) === columnName
        );
        const isPrimaryKey = originalPropertyName === primaryKeyColumn;
        // Quote column names to handle reserved keywords like "end"
        const quotedName = `"${columnName}"`;
        return `${quotedName} ${type}${isPrimaryKey ? " PRIMARY KEY" : ""}`;
      });
      
      await this.dbClient.query(`
        CREATE TABLE ${tableName} (
          ${columns.join(",\n      ")}
        );
      `);
    } else {
      // Update existing table
      const alterQueries: string[] = [];

      // Add new columns and update existing ones
      for (const [columnName, type] of Object.entries(newSchema)) {
        const baseType = type.split(" ")[0];
        const isRequired = type.includes("NOT NULL");
        const currentColumn = currentSchema[columnName];
        
        // Find the original property name for primary key comparison
        const originalPropertyName = Object.keys(schema.properties || {}).find(
          prop => this.mapPropertyToColumnName(prop) === columnName
        );

        if (!currentColumn) {
          // Add new column
          const quotedName = `"${columnName}"`;
          alterQueries.push(`ADD COLUMN ${quotedName} ${type}${originalPropertyName === primaryKeyColumn ? " PRIMARY KEY" : ""}`);
        } else {
          // Update existing column
          const quotedName = `"${columnName}"`;
          if (currentColumn.type.split(" ")[0] !== baseType) {
            alterQueries.push(`ALTER COLUMN ${quotedName} TYPE ${baseType}`);
          }
          
          const isCurrentlyRequired = currentColumn.type.includes("NOT NULL");
          if (isRequired && !isCurrentlyRequired) {
            alterQueries.push(`ALTER COLUMN ${quotedName} SET NOT NULL`);
          } else if (!isRequired && isCurrentlyRequired) {
            alterQueries.push(`ALTER COLUMN ${quotedName} DROP NOT NULL`);
          }
        }
      }

      // Handle primary key changes
      const mappedPrimaryKeyColumn = this.mapPropertyToColumnName(primaryKeyColumn);
      const currentPrimaryKey = Object.entries(currentSchema).find(([, col]) => col.isPrimaryKey)?.[0];
      if (mappedPrimaryKeyColumn !== currentPrimaryKey) {
        if (currentPrimaryKey) {
          alterQueries.push(`DROP CONSTRAINT IF EXISTS ${tableName}_pkey`);
        }
        if (mappedPrimaryKeyColumn) {
          const quotedPrimaryKey = `"${mappedPrimaryKeyColumn}"`;
          alterQueries.push(`ADD PRIMARY KEY (${quotedPrimaryKey})`);
        }
      }

      // Remove columns that no longer exist in the schema
      for (const column of Object.keys(currentSchema)) {
        if (!newSchema[column]) {
          const quotedColumn = `"${column}"`;
          alterQueries.push(`DROP COLUMN ${quotedColumn}`);
        }
      }

      if (alterQueries.length > 0) {
        await this.dbClient.query(`
          ALTER TABLE ${tableName}
          ${alterQueries.join(",\n")};
        `);
      }
    }

    // Set table and column comments
    if (schema.description) {
      await this.setTableComment(tableName, schema.description);
    }

    for (const [name, prop] of Object.entries(schema.properties)) {
      const schemaProp = prop as OpenAPIV3.SchemaObject;
      if (schemaProp.description) {
        const columnName = this.mapPropertyToColumnName(name);
        await this.setColumnComment(tableName, columnName, schemaProp.description);
      }
    }

    // Update table status after schema sync
    await this.updateTableStatus({ resourceName });
    logger.info(`Updated table status for ${tableName} after schema sync`);
  }

  /**
   * Syncs records to a table, handling both inserts and updates
   */
  async syncTableRecords(
    resourceName: string,
    schema: OpenAPIV3.SchemaObject,
    records: Array<Record<string, any>>
  ): Promise<number> {
    if (records.length === 0) return 0;

    // Ensure table is in sync with schema
    await this.syncTableSchema(resourceName, schema);
    
    const tableName = this.getTableName(resourceName);

    // Find primary key column
    const primaryKeyColumn = this.findPrimaryKeyColumn(schema);
    if (!primaryKeyColumn) {
      throw new Error(`No primary key column found for table ${tableName}. Please add a required property with _id suffix.`);
    }

    // Get all column names and their types from the schema
    const propertyNames = Object.keys(schema.properties || {});
    const columns = propertyNames.map(prop => this.mapPropertyToColumnName(prop));
    const columnTypes = Object.fromEntries(
      propertyNames.map(prop => {
        const mappedCol = this.mapPropertyToColumnName(prop);
        const schemaProp = (schema.properties || {})[prop];
        return [mappedCol, ("type" in schemaProp) ? schemaProp.type : null];
      })
    );
    
    // Prepare the upsert query
    const mappedPrimaryKeyColumn = this.mapPropertyToColumnName(primaryKeyColumn);
    const quotedColumns = columns.map(col => `"${col}"`);
    const updateClause = columns
      .filter(col => col !== mappedPrimaryKeyColumn) // Don't update the primary key
      .map(col => `"${col}" = EXCLUDED."${col}"`)
      .join(", ");
    
    // Prepare all values for bulk insert
    const allValues: any[] = [];
    const valueSets: string[] = [];
    
    records.forEach((item, recordIndex) => {
      const values = columns.map(col => {
        // Find the original property name for this column
        const originalPropertyName = propertyNames.find(prop => this.mapPropertyToColumnName(prop) === col);
        const value = originalPropertyName ? item[originalPropertyName] : undefined;
        
        // Handle null values
        if (value === null || value === undefined) {
          return null;
        }
        
        // Handle JSON/array values
        if (columnTypes[col] === "array" || columnTypes[col] === "object") {
          return JSON.stringify(value);
        }
        
        // Convert numbers to strings to ensure proper type handling
        if (columnTypes[col] === "number" && typeof value === "number") {
          return value.toString();
        }
        
        return value;
      });
      
      // Add values to the flat array
      allValues.push(...values);
      
      // Create placeholder set for this record
      const startIndex = recordIndex * columns.length + 1;
      const placeholders = columns.map((_, i) => `$${startIndex + i}`);
      valueSets.push(`(${placeholders.join(", ")})`);
    });
    
    // Create the bulk upsert query
    const bulkUpsertQuery = `
      INSERT INTO ${tableName} (${quotedColumns.join(", ")})
      VALUES ${valueSets.join(", ")}
      ON CONFLICT ("${mappedPrimaryKeyColumn}")
      DO UPDATE SET ${updateClause}
    `;
    
    // Execute the bulk upsert
    await this.dbClient.query(bulkUpsertQuery, allValues);

    // Update table status after writing records
    await this.updateTableStatus({ resourceName });
    logger.info(`Synced ${records.length} records to ${tableName}`);
    
    // Return the count of records processed (upserted)
    return records.length;
  }
}
