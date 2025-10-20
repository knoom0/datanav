import { DatabaseClientTool } from "@/lib/agent/tool/db-client-tool";
import { DatabaseClient } from "@/lib/data/db-client";
import { setupSQLiteTestDatabase, teardownSQLiteTestDatabase, getSQLiteTestDataSource } from "@/lib/util/test-util";

describe("DatabaseClientTool", () => {
  let client: DatabaseClient;
  let tool: DatabaseClientTool;

  beforeAll(async () => {
    await setupSQLiteTestDatabase();
  });

  beforeEach(() => {
    client = new DatabaseClient(getSQLiteTestDataSource());
    tool = new DatabaseClientTool(client);
  });

  afterAll(async () => {
    await teardownSQLiteTestDatabase();
  });

  it("should have correct tool properties", () => {
    expect(tool.name).toBe("database_client");
    expect(tool.description).toContain("database information");
    expect(tool.description).toContain("SELECT queries only");
    expect(tool.inputSchema).toBeDefined();
  });

  it("should list table information", async () => {
    const result = await tool.execute({ operation: "list_tables" });
    const parsed = JSON.parse(result);
    
    expect(parsed).toHaveProperty("tables");
    expect(parsed.tables).toHaveProperty("users");
    expect(parsed.tables.users.name).toBe("users");
    expect(parsed.tables.users.ddl).toContain("CREATE TABLE \"users\"");
  });

  it("should execute valid SELECT queries", async () => {
    const result = await tool.execute({
      operation: "query",
      sql: "SELECT name FROM users WHERE name = \"Alice\""
    });
    const parsed = JSON.parse(result);
    
    expect(parsed.results).toHaveLength(1);
    expect(parsed.results[0].name).toBe("Alice");
    expect(parsed.rowCount).toBe(1);
  });

  it("should reject write operations", async () => {
    const testCases = [
      "INSERT INTO users VALUES (1)",
      "UPDATE users SET name = \"test\"",
      "DELETE FROM users",
      "DROP TABLE users",
      "CREATE TABLE test (id INT)"
    ];

    for (const sql of testCases) {
      const result = await tool.execute({ operation: "query", sql });
      const parsed = JSON.parse(result);
      
      expect(parsed).toHaveProperty("error");
      expect(parsed.error).toContain("Read-only QueryRunner: write operations are not allowed");
    }
  });

  it("should handle errors gracefully", async () => {
    // Missing SQL parameter
    const result1 = await tool.execute({ operation: "query" });
    const parsed1 = JSON.parse(result1);
    expect(parsed1).toHaveProperty("error");
    expect(parsed1.error).toContain("SQL query is required");

    // Invalid operation
    const result2 = await tool.execute({ operation: "invalid_operation" as any });
    const parsed2 = JSON.parse(result2);
    expect(parsed2).toHaveProperty("error");
  });

  it("should record successful calls", async () => {
    await tool.execute({ operation: "list_tables" });
    
    const lastCall = tool.getLastCall();
    expect(lastCall).not.toBeNull();
    expect(lastCall?.params).toEqual({ operation: "list_tables" });
    expect(lastCall?.result).toHaveProperty("tables");
  });

  it("should limit results to 50 rows and include note when more rows exist", async () => {
    // First, insert 60 test records
    for (let i = 0; i < 60; i++) {
      await client.query(`INSERT INTO users (name, email) VALUES ("User${i}", "user${i}@test.com")`);
    }

    // Query all users (should return more than 50 rows)
    const result = await tool.execute({
      operation: "query",
      sql: "SELECT * FROM users"
    });
    const parsed = JSON.parse(result);
    
    // Should only return 50 results even though there are more
    expect(parsed.results).toHaveLength(50);
    
    // Should include the full row count
    expect(parsed.rowCount).toBeGreaterThanOrEqual(60);
    
    // Should include a note about partial results
    expect(parsed.note).toBeDefined();
    expect(parsed.note).toContain("Only showing 50");
    expect(parsed.note).toContain("rows to save tokens");
  });

  it("should not include note when results are 50 or fewer rows", async () => {
    const result = await tool.execute({
      operation: "query",
      sql: "SELECT * FROM users LIMIT 10"
    });
    const parsed = JSON.parse(result);
    
    expect(parsed.results.length).toBeLessThanOrEqual(50);
    expect(parsed.rowCount).toBe(parsed.results.length);
    expect(parsed.note).toBeUndefined();
  });
});
