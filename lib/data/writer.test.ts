import { OpenAPIV3 } from "openapi-types";
import { DataSource } from "typeorm";

import { DataTableStatusEntity } from "@/lib/data/entities";
import { DataWriter } from "@/lib/data/writer";
import {
  setupTestDatabase,
  teardownTestDatabase,
  type TestDatabaseSetup
} from "@/lib/util/test-util";


// Note: entities module is not mocked - DataWriter receives DataSource directly in constructor

describe("DataWriter", () => {
  let testDbSetup: TestDatabaseSetup;
  let testDataSource: DataSource;
  let dataWriter: DataWriter;

  beforeAll(async () => {
    // Setup PostgreSQL test database
    testDbSetup = await setupTestDatabase([DataTableStatusEntity]);
    testDataSource = testDbSetup.dataSource;

    // Create DataWriter with test DataSource
    dataWriter = new DataWriter({ dataSource: testDataSource, connectorId: "test.connector" });
  }, 60000);

  afterAll(async () => {
    await teardownTestDatabase(testDbSetup);
  });

  beforeEach(async () => {
    // Clean up all test tables and schemas before each test
    try {
      await testDataSource.query("DROP TABLE IF EXISTS test_connector.test_table CASCADE");
      await testDataSource.query("DROP TABLE IF EXISTS test_connector.test_sync_table CASCADE");
      await testDataSource.query("DROP TABLE IF EXISTS test_connector.test_write_table CASCADE");
      await testDataSource.query("DROP SCHEMA IF EXISTS test_connector CASCADE");
    } catch {
      // Ignore errors if tables/schema don"t exist
    }
    // Clear the DataTableStatusEntity table - the actual table name is determined by TypeORM
    const repo = testDataSource.getRepository(DataTableStatusEntity);
    await repo.clear();
  });

  describe("updateTableStatus", () => {
    it("should create and update table status", async () => {
      const resourceName = "test_table";

      // Create initial status
      await dataWriter.updateTableStatus({ resourceName });

      // Verify status was created
      const status = await dataWriter.getTableStatus(resourceName);
      expect(status).toBeTruthy();
      expect(status!.connectorId).toBe("test.connector");
      expect(status!.tableName).toBe("test_connector.test_table");
      expect(status!.lastLoadedAt).toBeTruthy();
    });

    it("should use provided lastLoadedAt when specified", async () => {
      const resourceName = "test_table_custom_date";
      const customDate = new Date("2023-01-01T00:00:00Z");

      // Create status with custom lastLoadedAt
      await dataWriter.updateTableStatus({ resourceName, lastLoadedAt: customDate });

      // Verify status was created with custom date
      const status = await dataWriter.getTableStatus(resourceName);
      expect(status).toBeTruthy();
      expect(status!.lastLoadedAt).toEqual(customDate);
    });
  });

  describe("getTableStatus", () => {
    it("should return null for non-existent table status", async () => {
      const status = await dataWriter.getTableStatus("non-existent-table");
      expect(status).toBeNull();
    });
  });


  describe("syncTableSchema", () => {
    it("should create table schema for new table", async () => {
      const resourceName = "test_sync_table";
      const tableName = "test_connector.test_sync_table"; // Expected table name format
      const schema: OpenAPIV3.SchemaObject = {
        type: "object",
        properties: {
          user_id: { type: "string" },
          name: { type: "string" },
          age: { type: "integer" }
        },
        required: ["user_id"]
      };

      await dataWriter.syncTableSchema(resourceName, schema);

      // Test that we can insert into the table (which proves it exists with the right columns)
      await testDataSource.query(`INSERT INTO ${tableName} (user_id, name, age) VALUES ($1, $2, $3)`, ["test1", "Test User", 25]);
      
      // Verify the record was inserted
      const result = await testDataSource.query(`SELECT * FROM ${tableName} WHERE user_id = $1`, ["test1"]);
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe("Test User");
      expect(result[0].age).toBe(25);
    });
  });

  describe("syncTableRecords", () => {
    it("should sync records to table", async () => {
      const resourceName = "test_write_table";
      const tableName = "test_connector.test_write_table"; // Expected table name format
      const schema: OpenAPIV3.SchemaObject = {
        type: "object",
        properties: {
          record_id: { type: "string" },
          name: { type: "string" },
          age: { type: "integer" }
        },
        required: ["record_id"]
      };

      const records = [
        { record_id: "1", name: "John", age: 30 },
        { record_id: "2", name: "Jane", age: 25 }
      ];

      await dataWriter.syncTableRecords(resourceName, schema, records);

      // Verify records were inserted
      const result = await testDataSource.query(`SELECT * FROM ${tableName} ORDER BY record_id`);
      expect(result).toHaveLength(2);
      expect(result[0].name).toBe("John");
      expect(result[1].name).toBe("Jane");
    });

    it("should handle invalid date values gracefully by setting them to null", async () => {
      const resourceName = "test_invalid_dates";
      const tableName = "test_connector.test_invalid_dates";
      const schema: OpenAPIV3.SchemaObject = {
        type: "object",
        properties: {
          event_id: { type: "string" },
          name: { type: "string" },
          created_at: { type: "string", format: "date-time" },
          updated_at: { type: "string", format: "date-time" }
        },
        required: ["event_id"]
      };

      const records = [
        { 
          event_id: "1", 
          name: "Valid Event", 
          created_at: "2023-01-15T10:00:00.000Z", 
          updated_at: "2023-01-16T10:00:00.000Z" 
        },
        { 
          event_id: "2", 
          name: "Invalid Created Date", 
          created_at: "0000-12-31T00:00:00.000Z", // Invalid year 0000
          updated_at: "2023-01-16T10:00:00.000Z" 
        },
        { 
          event_id: "3", 
          name: "Very Old Date", 
          created_at: "0999-12-31T00:00:00.000Z", // Year before 1000
          updated_at: "2023-01-16T10:00:00.000Z" 
        },
        { 
          event_id: "4", 
          name: "Future Year Out of Range", 
          created_at: "10000-01-01T00:00:00.000Z", // Year > 9999
          updated_at: "2023-01-16T10:00:00.000Z" 
        }
      ];

      await dataWriter.syncTableRecords(resourceName, schema, records);

      // Verify records were inserted with invalid dates set to null
      const result = await testDataSource.query(`SELECT * FROM ${tableName} ORDER BY event_id`);
      expect(result).toHaveLength(4);
      
      // Valid date should be preserved
      expect(result[0].name).toBe("Valid Event");
      expect(result[0].created_at).toBeTruthy();
      expect(result[0].updated_at).toBeTruthy();
      
      // Invalid date (year 0000) should be null
      expect(result[1].name).toBe("Invalid Created Date");
      expect(result[1].created_at).toBeNull();
      expect(result[1].updated_at).toBeTruthy();
      
      // Very old date should be null
      expect(result[2].name).toBe("Very Old Date");
      expect(result[2].created_at).toBeNull();
      expect(result[2].updated_at).toBeTruthy();
      
      // Future year out of range should be null
      expect(result[3].name).toBe("Future Year Out of Range");
      expect(result[3].created_at).toBeNull();
      expect(result[3].updated_at).toBeTruthy();
    });
  });

  describe("property-to-column mapping", () => {
    it("should handle SQL reserved keywords by adding _col suffix", async () => {
      const resourceName = "test_reserved_keywords";
      const schema: OpenAPIV3.SchemaObject = {
        type: "object",
        properties: {
          id: { type: "string" },
          select: { type: "string" }, // SQL reserved keyword
          from: { type: "string" },   // SQL reserved keyword
          where: { type: "string" },  // SQL reserved keyword
          order: { type: "string" },  // SQL reserved keyword
          group: { type: "string" },  // SQL reserved keyword
          name: { type: "string" }    // Non-reserved keyword
        },
        required: ["id"]
      };

      await dataWriter.syncTableSchema(resourceName, schema);

      // Verify that reserved keywords were mapped to safe column names
      const result = await testDataSource.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'test_reserved_keywords' 
        AND table_schema = 'test_connector'
        ORDER BY column_name
      `);
      
      const columnNames = result.map((row: any) => row.column_name);
      expect(columnNames).toContain("id");
      expect(columnNames).toContain("select_col");
      expect(columnNames).toContain("from_col");
      expect(columnNames).toContain("where_col");
      expect(columnNames).toContain("order_col");
      expect(columnNames).toContain("group_col");
      expect(columnNames).toContain("name");
    });

    it("should sync records with reserved keyword properties correctly", async () => {
      const resourceName = "test_reserved_records";
      const tableName = "test_connector.test_reserved_records";
      const schema: OpenAPIV3.SchemaObject = {
        type: "object",
        properties: {
          id: { type: "string" },
          select: { type: "string" }, // SQL reserved keyword
          name: { type: "string" }    // Non-reserved keyword
        },
        required: ["id"]
      };

      const records = [
        { id: "1", select: "value1", name: "Test1" },
        { id: "2", select: "value2", name: "Test2" }
      ];

      await dataWriter.syncTableRecords(resourceName, schema, records);

      // Verify records were inserted with correct column mapping
      const result = await testDataSource.query(`SELECT * FROM ${tableName} ORDER BY id`);
      expect(result).toHaveLength(2);
      expect(result[0].select_col).toBe("value1");
      expect(result[0].name).toBe("Test1");
      expect(result[1].select_col).toBe("value2");
      expect(result[1].name).toBe("Test2");
    });

    it("should handle case-insensitive reserved keyword detection", async () => {
      const resourceName = "test_case_insensitive";
      const schema: OpenAPIV3.SchemaObject = {
        type: "object",
        properties: {
          id: { type: "string" },
          SELECT: { type: "string" }, // Uppercase reserved keyword
          From: { type: "string" },   // Mixed case reserved keyword
          where: { type: "string" }   // Lowercase reserved keyword
        },
        required: ["id"]
      };

      await dataWriter.syncTableSchema(resourceName, schema);

      // Verify that all case variations of reserved keywords were mapped
      const result = await testDataSource.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'test_case_insensitive' 
        AND table_schema = 'test_connector'
        ORDER BY column_name
      `);
      
      const columnNames = result.map((row: any) => row.column_name);
      expect(columnNames).toContain("id");
      expect(columnNames).toContain("SELECT_col");
      expect(columnNames).toContain("From_col");
      expect(columnNames).toContain("where_col");
    });
  });
});
