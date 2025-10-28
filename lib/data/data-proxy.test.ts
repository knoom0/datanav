import { vi } from "vitest";

import {
  generateDataProxyInterface,
  createDataProxyClient, 
  createMockDataProxy,
} from "@/components/data-proxy-client";
import { DataProxyServer } from "@/lib/data/data-proxy";
import { DataSpecEntity } from "@/lib/entities";
import type { DataSpec, ColumnInfo } from "@/lib/types";
import { setupSQLiteTestDatabase, teardownSQLiteTestDatabase, getSQLiteTestDataSource } from "@/lib/util/test-util";

describe("generateDataProxyInterface", () => {
  it("should generate TypeScript interface from DataSpec", () => {
    const dataSpec: DataSpec = {
      type: "data_spec",
      queries: [
        {
          name: "get_users",
          description: "Get all users",
          query: "SELECT * FROM users",
          columnInfos: [
            { name: "id", dataType: "number" },
            { name: "name", dataType: "string" },
            { name: "email", dataType: "string" }
          ] as ColumnInfo[]
        },
        {
          name: "get_products",
          description: "Get all products",
          query: "SELECT * FROM products"
        }
      ]
    };

    const result = generateDataProxyInterface(dataSpec);
    
    // Should contain interface definition
    expect(result).toContain("export interface DataProxy");
    expect(result).toContain("getUsers(): Promise<GetUsersRow[]>");
    expect(result).toContain("getProducts(): Promise<any[]>");
    expect(result).toContain("Get all users");
    expect(result).toContain("Get all products");
  });

  it("should generate proper TypeScript types from column info", () => {
    const dataSpec: DataSpec = {
      type: "data_spec",
      queries: [
        {
          name: "typed_query",
          description: "Query with typed columns",
          query: "SELECT * FROM test",
          columnInfos: [
            { name: "id", dataType: "number" },
            { name: "name", dataType: "string" },
            { name: "active", dataType: "boolean" },
            { name: "created_at", dataType: "date" },
            { name: "metadata", dataType: "json" }
          ] as ColumnInfo[]
        }
      ]
    };

    const result = generateDataProxyInterface(dataSpec);
    
    expect(result).toContain("id: number;");
    expect(result).toContain("name: string;");
    expect(result).toContain("active: boolean;");
    expect(result).toContain("created_at: Date;");
    expect(result).toContain("metadata: any;");
  });
});

describe("createDataProxyClient", () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it("should create a proxy client that calls API endpoints", async () => {
    const mockFetch = global.fetch as any;
    mockFetch.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue([{ id: 1, name: "test" }])
    } as any);

    const dataSpec: DataSpec = {
      type: "data_spec",
      queries: [
        {
          name: "get_users",
          description: "Get all users",
          query: "SELECT * FROM users"
        }
      ]
    };

    const client = createDataProxyClient("test-project", dataSpec);
    const result = await (client as any).getUsers();

    expect(mockFetch).toHaveBeenCalledWith("/api/data-proxy/test-project/get_users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({})
    });
    expect(result).toEqual([{ id: 1, name: "test" }]);
  });

  it("should handle API errors", async () => {
    const mockFetch = global.fetch as any;
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500
    } as any);

    const dataSpec: DataSpec = {
      type: "data_spec",
      queries: [
        {
          name: "get_users",
          description: "Get all users",
          query: "SELECT * FROM users"
        }
      ]
    };

    const client = createDataProxyClient("test-project", dataSpec);
    
    await expect((client as any).getUsers()).rejects.toThrow("API error: 500");
  });
});

describe("createMockDataProxy", () => {
  it("should create a proxy that returns sample data", async () => {
    const dataSpec: DataSpec = {
      type: "data_spec",
      queries: [
        {
          name: "get_users",
          description: "Get all users",
          query: "SELECT * FROM users",
          sampleData: [
            { id: 1, name: "Alice" },
            { id: 2, name: "Bob" }
          ]
        },
        {
          name: "get_products",
          description: "Get all products",
          query: "SELECT * FROM products",
          sampleData: [
            { id: 1, name: "Laptop" }
          ]
        }
      ]
    };

    const proxy = createMockDataProxy(dataSpec);
    
    const users = await (proxy as any).getUsers();
    const products = await (proxy as any).getProducts();
    
    expect(users).toEqual([
      { id: 1, name: "Alice" },
      { id: 2, name: "Bob" }
    ]);
    expect(products).toEqual([
      { id: 1, name: "Laptop" }
    ]);
  });

  it("should return empty array for unknown methods", async () => {
    const dataSpec: DataSpec = {
      type: "data_spec",
      queries: []
    };

    const proxy = createMockDataProxy(dataSpec);
    const result = await (proxy as any).unknownMethod();
    
    expect(result).toEqual([]);
  });

  it("should handle missing sample data", async () => {
    const dataSpec: DataSpec = {
      type: "data_spec",
      queries: [
        {
          name: "get_users",
          description: "Get all users",
          query: "SELECT * FROM users"
          // No sampleData provided
        }
      ]
    };

    const proxy = createMockDataProxy(dataSpec);
    const result = await (proxy as any).getUsers();
    
    expect(result).toEqual([]);
  });
});

describe("DataProxyServer", () => {
  let server: DataProxyServer;

  beforeAll(async () => {
    await setupSQLiteTestDatabase();
  });

  beforeEach(async () => {
    server = new DataProxyServer(getSQLiteTestDataSource());
    
    // Clean up any existing test data - find and delete each entity individually
    const repository = getSQLiteTestDataSource().getRepository(DataSpecEntity);
    const entities = await repository.find();
    for (const entity of entities) {
      await repository.remove(entity);
    }
  });

  afterAll(async () => {
    await teardownSQLiteTestDatabase();
  });

  it("should register a new data spec", async () => {
    const dataSpec: DataSpec = {
      type: "data_spec",
      queries: [{ name: "test_query", description: "Test query", query: "SELECT 1" }]
    };

    const result = await server.registerDataSpec({ projectId: "new-project", dataSpec });

    expect(result).toBe("new-project");
    
    // Verify it was saved
    const repository = getSQLiteTestDataSource().getRepository(DataSpecEntity);
    const entity = await repository.findOneBy({ projectId: "new-project" });
    expect(entity).toBeTruthy();
    expect(entity?.queries).toEqual(dataSpec.queries);
  });

  it("should update existing data spec", async () => {
    // First create an entity
    const initialDataSpec: DataSpec = {
      type: "data_spec",
      queries: [{ name: "old_query", description: "Old query", query: "SELECT 1" }]
    };
    await server.registerDataSpec({ projectId: "test-project", dataSpec: initialDataSpec });
    
    // Then update it
    const newDataSpec: DataSpec = {
      type: "data_spec",
      queries: [{ name: "updated_query", description: "Updated query", query: "SELECT 2" }]
    };
    const result = await server.registerDataSpec({ projectId: "test-project", dataSpec: newDataSpec });

    expect(result).toBe("test-project");
    
    // Verify it was updated
    const repository = getSQLiteTestDataSource().getRepository(DataSpecEntity);
    const entity = await repository.findOneBy({ projectId: "test-project" });
    expect(entity?.queries).toEqual(newDataSpec.queries);
  });

  it("should unregister data spec", async () => {
    // First create an entity
    const dataSpec: DataSpec = {
      type: "data_spec",
      queries: [{ name: "test", description: "Test query", query: "SELECT 1" }]
    };
    await server.registerDataSpec({ projectId: "test-project", dataSpec });
    
    // Then delete it
    await server.unregisterDataSpec("test-project");
    
    // Verify it was deleted
    const repository = getSQLiteTestDataSource().getRepository(DataSpecEntity);
    const entity = await repository.findOneBy({ projectId: "test-project" });
    expect(entity).toBeNull();
  });

  it("should get data spec", async () => {
    const dataSpec: DataSpec = {
      type: "data_spec",
      queries: [{ name: "get_users", description: "Get all users", query: "SELECT * FROM users" }]
    };
    await server.registerDataSpec({ projectId: "test-project", dataSpec });

    const result = await server.getDataSpec("test-project");

    expect(result).toEqual({
      projectId: "test-project",
      queries: dataSpec.queries
    });
  });

  it("should return undefined for non-existent data spec", async () => {
    const result = await server.getDataSpec("non-existent");
    expect(result).toBeUndefined();
  });

  it("should fetch data using registered queries", async () => {
    // Register a data spec with a real query
    const dataSpec: DataSpec = {
      type: "data_spec",
      queries: [{ 
        name: "get_users",
        description: "Get users by name", 
        query: "SELECT name, email FROM users WHERE name = \"Alice\"" 
      }]
    };
    await server.registerDataSpec({ projectId: "test-project", dataSpec });

    const result = await server.fetchData({ projectId: "test-project", queryName: "get_users" });

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Alice");
    expect(result[0].email).toBe("alice@example.com");
  });

  it("should throw error for unknown project in fetchData", async () => {
    await expect(server.fetchData({ projectId: "unknown-project", queryName: "any-query" }))
      .rejects.toThrow("Unknown dataSpec for project: unknown-project");
  });

  it("should throw error for unknown query in fetchData", async () => {
    const dataSpec: DataSpec = {
      type: "data_spec",
      queries: [{ name: "existing_query", description: "Existing query", query: "SELECT 1" }]
    };
    await server.registerDataSpec({ projectId: "test-project", dataSpec });
    
    await expect(server.fetchData({ projectId: "test-project", queryName: "unknown-query" }))
      .rejects.toThrow("Unknown query: unknown-query");
  });

  it("should create a proxy with working methods", async () => {
    // Register a data spec
    const dataSpec: DataSpec = {
      type: "data_spec",
      queries: [
        { name: "get_users", description: "Get all users", query: "SELECT name FROM users ORDER BY name" },
        { name: "get_user_count", description: "Count all users", query: "SELECT COUNT(*) as count FROM users" }
      ]
    };
    await server.registerDataSpec({ projectId: "test-project", dataSpec });

    const proxy = await server.getProxy("test-project");

    // Test the generated methods
    const users = await proxy.getUsers();
    expect(users).toHaveLength(3);
    expect(users.map((u: any) => u.name)).toEqual(["Alice", "Bob", "Charlie"]);

    const countResult = await proxy.getUserCount();
    expect(countResult[0].count).toBe(3);

    // Test the fetchData method
    const fetchResult = await proxy.fetchData("get_users");
    expect(fetchResult).toEqual(users);
  });
});