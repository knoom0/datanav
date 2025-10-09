import { DatabaseClient } from "@/lib/data/db-client";
import { setupSQLiteTestDatabase, teardownSQLiteTestDatabase, getSQLiteTestDataSource } from "@/lib/util/test-util";

describe("DatabaseClient", () => {
  let client: DatabaseClient;

  beforeAll(async () => {
    await setupSQLiteTestDatabase();
  });

  beforeEach(() => {
    client = new DatabaseClient(getSQLiteTestDataSource());
  });

  afterAll(async () => {
    await teardownSQLiteTestDatabase();
  });

  it("should check connection", async () => {
    await expect(client.checkConnection()).resolves.not.toThrow();
  });

  it("should execute queries", async () => {
    const result = await client.query("SELECT 1 as test_value");
    expect(result).toEqual([{ test_value: 1 }]);
  });

  it("should get table infos", async () => {
    const tableInfos = await client.getTableInfos();
    
    expect(tableInfos).toHaveProperty("users");
    expect(tableInfos).toHaveProperty("products");
    
    expect(tableInfos.users.name).toBe("users");
    expect(tableInfos.users.ddl).toContain("CREATE TABLE \"users\"");
    expect(tableInfos.users.ddl).toContain("\"id\"");
    expect(tableInfos.users.ddl).toContain("\"name\"");
    expect(tableInfos.users.ddl).toContain("\"email\"");
    
    expect(tableInfos.products.name).toBe("products");
    expect(tableInfos.products.ddl).toContain("CREATE TABLE \"products\"");
  });

  it("should handle query parameters", async () => {
    const result = await client.query("SELECT * FROM users WHERE name = ?", ["Alice"]);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Alice");
    expect(result[0].email).toBe("alice@example.com");
  });

  it("should handle queries that return multiple rows", async () => {
    const result = await client.query("SELECT name FROM users ORDER BY name");
    expect(result).toHaveLength(3);
    expect(result.map(r => r.name)).toEqual(["Alice", "Bob", "Charlie"]);
  });

  it("should handle INSERT queries", async () => {
    const result = await client.query(
      "INSERT INTO products (name, price, category) VALUES (?, ?, ?)",
      ["Test Product", 99.99, "Test"]
    );
    expect(result).toBeDefined();
    
    // Verify the insert worked
    const selectResult = await client.query("SELECT * FROM products WHERE name = ?", ["Test Product"]);
    expect(selectResult).toHaveLength(1);
    expect(selectResult[0].name).toBe("Test Product");
    expect(selectResult[0].price).toBe(99.99);
  });

  it("should handle UPDATE queries", async () => {
    await client.query("UPDATE users SET email = ? WHERE name = ?", ["newemail@example.com", "Bob"]);
    
    const result = await client.query("SELECT email FROM users WHERE name = ?", ["Bob"]);
    expect(result[0].email).toBe("newemail@example.com");
  });

  it("should handle queries with no results", async () => {
    const result = await client.query("SELECT * FROM users WHERE name = ?", ["NonExistent"]);
    expect(result).toEqual([]);
  });
});