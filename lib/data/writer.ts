import { OpenAPIV3 } from "openapi-types";
import { DataSource } from "typeorm";

import { DatabaseClient } from "@/lib/data/db-client";
import { DataTableStatusEntity } from "@/lib/entities";
import logger from "@/lib/logger";
import type { ResourceConfig } from "@/lib/types";

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
    return this.connectorId.replace(/[.-]/g, "_"); // Replace dots and dashes for valid SQL identifiers
  }

  /**
   * Gets the table name from resource name (without schema prefix)
   */
  private getTableName(resourceName: string): string {
    return resourceName.toLowerCase();
  }

  /**
   * Gets the fully qualified table name as {schema}.{table}
   */
  private getQualifiedTableName(resourceName: string): string {
    const schemaName = this.getSchemaName();
    const tableName = this.getTableName(resourceName);
    return `${schemaName}.${tableName}`;
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
    lastSyncedAt?: Date;
  }): Promise<void> {
    const { resourceName, lastSyncedAt } = params;
    const qualifiedTableName = this.getQualifiedTableName(resourceName);
    const repo = this.dataSource.getRepository(DataTableStatusEntity);
    
    let tableStatus = await repo.findOne({
      where: { connectorId: this.connectorId, tableName: qualifiedTableName }
    });
    
    if (!tableStatus) {
      tableStatus = new DataTableStatusEntity();
      tableStatus.connectorId = this.connectorId;
      tableStatus.tableName = qualifiedTableName;
    }
    
    if (lastSyncedAt !== undefined) {
      tableStatus.lastSyncedAt = lastSyncedAt;
    } else {
      tableStatus.lastSyncedAt = new Date();
    }
    tableStatus.updatedAt = new Date();
    
    await repo.save(tableStatus);
    logger.info(`Updated table status for ${qualifiedTableName} (connector: ${this.connectorId})`);
  }

  /**
   * Gets the table status for a specific resource
   */
  async getTableStatus(resourceName: string): Promise<DataTableStatusEntity | null> {
    const qualifiedTableName = this.getQualifiedTableName(resourceName);
    const repo = this.dataSource.getRepository(DataTableStatusEntity);
    
    return await repo.findOne({
      where: { connectorId: this.connectorId, tableName: qualifiedTableName }
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
  private async getTableSchema(params: {
    schemaName: string;
    tableName: string;
  }): Promise<Record<string, { type: string, isPrimaryKey: boolean }>> {
    const { schemaName, tableName } = params;
    
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
    const result = await this.dbClient.query(query, [tableName, schemaName]);
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
  private async setTableComment(params: {
    schemaName: string;
    tableName: string;
    comment: string;
  }): Promise<void> {
    const { schemaName, tableName, comment } = params;
    // Escape single quotes in the comment
    const escapedComment = comment.replace(/'/g, "''");
    const qualifiedTableName = `${schemaName}.${tableName}`;
    const query = `COMMENT ON TABLE ${qualifiedTableName} IS '${escapedComment}'`;
    await this.dbClient.query(query);
  }

  /**
   * Sets the comment on a PostgreSQL column
   */
  private async setColumnComment(params: {
    schemaName: string;
    tableName: string;
    columnName: string;
    comment: string;
  }): Promise<void> {
    const { schemaName, tableName, columnName, comment } = params;
    // Escape single quotes in the comment
    const escapedComment = comment.replace(/'/g, "''");
    // Quote column name to preserve case
    const quotedColumnName = `"${columnName}"`;
    const qualifiedTableName = `${schemaName}.${tableName}`;
    const query = `COMMENT ON COLUMN ${qualifiedTableName}.${quotedColumnName} IS '${escapedComment}'`;
    await this.dbClient.query(query);
  }

  /**
   * Finds the ID field from schema properties
   * Looks for common ID field names: id, uuid, guid
   * Can also use a custom ID column name if provided
   * @param schema - The OpenAPI schema object
   * @param customIdColumn - Optional custom ID column name to use
   * @returns The ID field name, or throws an error if not found
   */
  private findIdField(params: { 
    schema: OpenAPIV3.SchemaObject; 
    customIdColumn?: string;
  }): string {
    const { schema, customIdColumn } = params;
    
    if (!schema.properties) {
      throw new Error("Schema must have properties defined");
    }
    
    // If custom ID column is provided, verify it exists in schema
    if (customIdColumn) {
      if (schema.properties[customIdColumn]) {
        return customIdColumn;
      }
      throw new Error(`Custom ID column "${customIdColumn}" not found in schema properties`);
    }
    
    // Look for common ID field names
    const commonIdFields = ["id", "uuid", "guid"];
    for (const fieldName of commonIdFields) {
      if (schema.properties[fieldName]) {
        return fieldName;
      }
    }
    
    // If no ID field found, throw an error
    const availableFields = Object.keys(schema.properties).join(", ");
    throw new Error(
      `No ID field found in schema. Tried: ${commonIdFields.join(", ")}. ` +
      `Available fields: ${availableFields}. ` +
      "Please specify an idColumn in ResourceConfig."
    );
  }

  /**
   * Filters records to only include those with valid (non-null, non-undefined) ID values
   * @param records - Array of records to filter
   * @param idField - The ID field name
   * @param resourceName - Resource name for logging purposes
   * @returns Array of valid records
   */
  private filterValidRecords(params: {
    records: Array<Record<string, any>>;
    idField: string;
    resourceName: string;
  }): Array<Record<string, any>> {
    const { records, idField, resourceName } = params;
    
    const validRecords = [];
    let nullIdCount = 0;
    
    for (const record of records) {
      if (record[idField] === null || record[idField] === undefined) {
        nullIdCount++;
        continue;
      }
      validRecords.push(record);
    }
    
    if (nullIdCount > 0) {
      logger.warn(
        `Filtered out ${nullIdCount} record(s) with null/undefined ${idField} ` +
        `for resource ${resourceName}`
      );
    }
    
    return validRecords;
  }

  /**
   * Syncs a table with the given schema, creating or updating it as needed
   */
  async syncTableSchema(params: {
    resourceConfig: ResourceConfig;
    schema: OpenAPIV3.SchemaObject;
  }): Promise<void> {
    const { resourceConfig, schema } = params;
    const { name: resourceName, idColumn } = resourceConfig;
    
    // Ensure schema exists before creating table
    await this.ensureSchemaExists();
    
    const schemaName = this.getSchemaName();
    const tableName = this.getTableName(resourceName);
    const qualifiedTableName = `${schemaName}.${tableName}`;
    
    if (!schema.properties) {
      throw new Error(`Schema for table ${qualifiedTableName} must have properties defined`);
    }

    // Find primary key column using the new ID field detection
    const primaryKeyColumn = this.findIdField({ schema, customIdColumn: idColumn });

    // Get current table schema if it exists
    const currentSchema = await this.getTableSchema({ schemaName, tableName });
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
        CREATE TABLE ${qualifiedTableName} (
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
          // Use table name only (without schema) for constraint name
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
        logger.info(`ALTER TABLE ${qualifiedTableName} ${alterQueries.join(",\n")}`);
        await this.dbClient.query(`
          ALTER TABLE ${qualifiedTableName}
          ${alterQueries.join(",\n")};
        `);
      }
    }

    // Set table and column comments
    if (schema.description) {
      await this.setTableComment({ 
        schemaName, 
        tableName, 
        comment: schema.description 
      });
    }

    for (const [name, prop] of Object.entries(schema.properties)) {
      const schemaProp = prop as OpenAPIV3.SchemaObject;
      if (schemaProp.description) {
        const columnName = this.mapPropertyToColumnName(name);
        await this.setColumnComment({ 
          schemaName, 
          tableName, 
          columnName, 
          comment: schemaProp.description 
        });
      }
    }

    // Update table status after schema sync
    await this.updateTableStatus({ resourceName });
    logger.info(`Updated table status for ${qualifiedTableName} after schema sync`);
  }

  /**
   * Syncs records to a table, handling both inserts and updates
   */
  async syncTableRecords(params: {
    resourceConfig: ResourceConfig;
    schema: OpenAPIV3.SchemaObject;
    records: Array<Record<string, any>>;
  }): Promise<number> {
    const { resourceConfig, schema, records } = params;
    const { name: resourceName, idColumn: customIdColumn } = resourceConfig;
    
    if (records.length === 0) return 0;

    // Ensure table is in sync with schema
    await this.syncTableSchema({ 
      resourceConfig, 
      schema 
    });
    
    const schemaName = this.getSchemaName();
    const tableName = this.getTableName(resourceName);
    const qualifiedTableName = `${schemaName}.${tableName}`;

    // Find ID field using the new method
    const idField = this.findIdField({ schema, customIdColumn });
    
    // Filter out records with null/undefined ID values
    const validRecords = this.filterValidRecords({ 
      records, 
      idField, 
      resourceName 
    });
    
    // Skip if no valid records after filtering
    if (validRecords.length === 0) {
      logger.info(`No valid records to process for resource ${resourceName} after filtering`);
      return 0;
    }

    // Primary key column is the same as ID field for upsert operations
    const primaryKeyColumn = idField;

    // Get all column names and their types from the schema
    const propertyNames = Object.keys(schema.properties || {});
    const columns = propertyNames.map(prop => this.mapPropertyToColumnName(prop));
    
    // Build a map of column info including type and format
    const columnInfo = Object.fromEntries(
      propertyNames.map(prop => {
        const mappedCol = this.mapPropertyToColumnName(prop);
        const schemaProp = (schema.properties || {})[prop];
        return [mappedCol, {
          type: ("type" in schemaProp) ? schemaProp.type : null,
          format: ("format" in schemaProp) ? schemaProp.format : null
        }];
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
    
    validRecords.forEach((item, recordIndex) => {
      const values = columns.map(col => {
        // Find the original property name for this column
        const originalPropertyName = propertyNames.find(prop => this.mapPropertyToColumnName(prop) === col);
        const value = originalPropertyName ? item[originalPropertyName] : undefined;
        
        // Handle null values
        if (value === null || value === undefined) {
          return null;
        }
        
        const colInfo = columnInfo[col];
        
        // Handle JSON/array values
        if (colInfo?.type === "array" || colInfo?.type === "object") {
          return JSON.stringify(value);
        }
        
        // Convert numbers to strings to ensure proper type handling
        if (colInfo?.type === "number" && typeof value === "number") {
          return value.toString();
        }
        
        // Handle date/datetime values - validate using PostgreSQL-compatible parsing
        if (typeof value === "string" && colInfo?.format && (colInfo.format === "date-time" || colInfo.format === "date")) {
          const parsedDate = new Date(value);
          
          // Check if date parsing succeeded
          if (isNaN(parsedDate.getTime())) {
            logger.warn(`Invalid date value detected for ${col}: ${value}, setting to null`);
            return null;
          }
          
          // PostgreSQL supports timestamps from 4713 BC to 294276 AD
          // However, practical range is 1000 AD to 9999 AD to avoid issues with:
          // - Year 0 (doesn't exist in PostgreSQL's calendar)
          // - Very old dates that may have timezone/calendar issues
          // - Extended year formats (5+ digits) that may not be supported
          const year = parsedDate.getFullYear();
          if (year < 1000 || year > 9999) {
            logger.warn(`Date value out of PostgreSQL supported range for ${col}: ${value} (year ${year}), setting to null`);
            return null;
          }
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
      INSERT INTO ${qualifiedTableName} (${quotedColumns.join(", ")})
      VALUES ${valueSets.join(", ")}
      ON CONFLICT ("${mappedPrimaryKeyColumn}")
      DO UPDATE SET ${updateClause}
    `;
    
    // Execute the bulk upsert
    await this.dbClient.query(bulkUpsertQuery, allValues);

    // Update table status after writing records
    await this.updateTableStatus({ resourceName });
    logger.info(`Synced ${validRecords.length} records to ${qualifiedTableName}`);
    
    // Return the count of records processed (upserted)
    return validRecords.length;
  }
}
