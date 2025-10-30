import { Client } from "pg";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import { SQLDataLoader } from "@/lib/data/loader/sql-data-loader";

// Mock the pg Client
vi.mock("pg", () => {
  const mockClient = {
    connect: vi.fn(),
    query: vi.fn(),
    end: vi.fn(),
  };
  return {
    Client: vi.fn(() => mockClient),
  };
});

describe("SQLDataLoader", () => {
  let loader: SQLDataLoader;
  let mockClient: any;
  const config = {
    host: "localhost",
    port: 5432,
    username: "testuser",
    password: "testpass",
    database: "testdb",
    schema: "public"
  };

  beforeEach(() => {
    loader = new SQLDataLoader(config);
    // Get the mocked client instance
    mockClient = new Client();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("constructor", () => {
    it("should initialize with config", () => {
      expect(loader).toBeDefined();
    });
  });

  describe("authenticate", () => {
    it("should return success for no-auth SQL loader", async () => {
      const result = await loader.authenticate({ redirectTo: "http://localhost", userId: "test-user-id" });
      expect(result.success).toBe(true);
      expect(result.authUrl).toBe("");
    });
  });

  describe("continueToAuthenticate", () => {
    it("should throw error as SQL loader does not support authentication", async () => {
      await expect(
        loader.continueToAuthenticate({ code: "code", redirectTo: "http://localhost" })
      ).rejects.toThrow("SQL data loader does not support authentication flow");
    });
  });

  describe("getAvailableResourceNames", () => {
    it("should query database for table names", async () => {
      const mockTables = [
        { table_name: "users" },
        { table_name: "products" },
        { table_name: "orders" },
      ];

      mockClient.query.mockResolvedValue({ rows: mockTables });

      const resourceNames = await loader.getAvailableResourceNames();

      expect(mockClient.connect).toHaveBeenCalled();
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining("information_schema.tables"),
        ["public"]
      );
      expect(resourceNames).toEqual(["users", "products", "orders"]);
    });

    it("should return empty array when no tables exist", async () => {
      mockClient.query.mockResolvedValue({ rows: [] });

      const resourceNames = await loader.getAvailableResourceNames();
      expect(resourceNames).toEqual([]);
    });
  });

  describe("getResourceInfo", () => {
    it("should fetch and convert table info with schema, columns, and record count", async () => {
      const mockColumns = [
        {
          column_name: "id",
          data_type: "integer",
          is_nullable: "NO",
          column_default: "nextval('users_id_seq'::regclass)",
          character_maximum_length: null,
          numeric_precision: 32,
          numeric_scale: 0,
        },
        {
          column_name: "name",
          data_type: "character varying",
          is_nullable: "NO",
          column_default: null,
          character_maximum_length: 255,
          numeric_precision: null,
          numeric_scale: null,
        },
        {
          column_name: "email",
          data_type: "character varying",
          is_nullable: "YES",
          column_default: null,
          character_maximum_length: 255,
          numeric_precision: null,
          numeric_scale: null,
        },
        {
          column_name: "created_at",
          data_type: "timestamp without time zone",
          is_nullable: "NO",
          column_default: "now()",
          character_maximum_length: null,
          numeric_precision: null,
          numeric_scale: null,
        },
      ];

      mockClient.query
        .mockResolvedValueOnce({ rows: [{ column_name: "id" }] }) // primary key query
        .mockResolvedValueOnce({ rows: mockColumns }) // column query
        .mockResolvedValueOnce({ rows: [{ count: "42" }] }); // count query

      const resourceInfo = await loader.getResourceInfo("users");

      expect(mockClient.connect).toHaveBeenCalled();
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining("PRIMARY KEY"),
        ["public", "users"]
      );
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining("information_schema.columns"),
        ["public", "users"]
      );
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining("COUNT(*)")
      );

      expect(resourceInfo.name).toBe("users");
      expect(resourceInfo.primaryKeyColumn).toBe("id");
      expect(resourceInfo.recordCount).toBe(42);
      expect(resourceInfo.columns).toEqual(["id", "name", "email", "created_at"]);
      expect(resourceInfo.timestampColumns).toEqual(["created_at"]);
      expect(resourceInfo.schema).toEqual({
        type: "object",
        properties: {
          id: { type: "integer", "x-primary-key": true },
          name: { type: "string" },
          email: { type: "string" },
          created_at: { type: "string", format: "date-time" },
        },
        required: ["id", "name", "created_at"],
      });
    });

    it("should throw error if table not found", async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // primary key query
        .mockResolvedValueOnce({ rows: [] }); // column query

      await expect(loader.getResourceInfo("nonexistent")).rejects.toThrow(
        "Table nonexistent not found in database"
      );
    });

    it("should handle various PostgreSQL data types", async () => {
      const mockColumns = [
        { column_name: "col_int", data_type: "integer", is_nullable: "NO" },
        { column_name: "col_bigint", data_type: "bigint", is_nullable: "NO" },
        { column_name: "col_numeric", data_type: "numeric", is_nullable: "NO" },
        { column_name: "col_real", data_type: "real", is_nullable: "NO" },
        { column_name: "col_bool", data_type: "boolean", is_nullable: "NO" },
        { column_name: "col_date", data_type: "date", is_nullable: "NO" },
        { column_name: "col_timestamp", data_type: "timestamp with time zone", is_nullable: "NO" },
        { column_name: "col_json", data_type: "jsonb", is_nullable: "NO" },
        { column_name: "col_text", data_type: "text", is_nullable: "YES" },
      ];

      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // primary key query (no primary key)
        .mockResolvedValueOnce({ rows: mockColumns }) // column query
        .mockResolvedValueOnce({ rows: [{ count: "100" }] }); // count query

      const resourceInfo = await loader.getResourceInfo("test_types");

      expect(resourceInfo.primaryKeyColumn).toBeUndefined();
      expect(resourceInfo.schema.properties).toEqual({
        col_int: { type: "integer" },
        col_bigint: { type: "integer" },
        col_numeric: { type: "number" },
        col_real: { type: "number" },
        col_bool: { type: "boolean" },
        col_date: { type: "string", format: "date" },
        col_timestamp: { type: "string", format: "date-time" },
        col_json: { type: "object" },
        col_text: { type: "string" },
      });
      expect(resourceInfo.timestampColumns).toEqual(["col_date", "col_timestamp"]);
    });
  });

  describe("fetch", () => {
    it("should fetch data from specified tables in batches", async () => {
      const mockUsersData = [
        { id: 1, name: "Alice", email: "alice@example.com" },
        { id: 2, name: "Bob", email: "bob@example.com" },
      ];
      const mockProductsData = [
        { id: 1, name: "Product A", price: 100 },
      ];

      mockClient.query
        .mockResolvedValueOnce({ rows: mockUsersData }) // fetch users
        .mockResolvedValueOnce({ rows: mockProductsData }); // fetch products

      const records = [];
      const generator = loader.fetch({
        resources: [{ name: "users" }, { name: "products" }],
        syncContext: {},
        lastSyncedAt: undefined,
        maxDurationToRunMs: undefined,
      });

      for await (const record of generator) {
        records.push(record);
      }

      expect(records).toHaveLength(3);
      expect(records[0]).toEqual({ resourceName: "users", ...mockUsersData[0] });
      expect(records[1]).toEqual({ resourceName: "users", ...mockUsersData[1] });
      expect(records[2]).toEqual({ resourceName: "products", ...mockProductsData[0] });
    });

    it("should support incremental sync with detected timestamp column", async () => {
      const lastSyncedAt = new Date("2023-01-01T00:00:00Z");
      const mockTimestampColumn = [
        { column_name: "updated_at" },
      ];
      const mockData = [
        { id: 3, name: "Charlie", email: "charlie@example.com", updated_at: new Date() },
      ];

      mockClient.query
        .mockResolvedValueOnce({ rows: mockTimestampColumn }) // detectTimestampColumn
        .mockResolvedValueOnce({ rows: mockData }); // fetch with WHERE clause

      const records = [];
      const generator = loader.fetch({
        resources: [{ name: "users" }],
        syncContext: {},
        lastSyncedAt,
        maxDurationToRunMs: undefined,
      });

      for await (const record of generator) {
        records.push(record);
      }

      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining("WHERE updated_at > $1"),
        expect.arrayContaining([lastSyncedAt])
      );
    });

    it("should return hasMore: false when all data is fetched", async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [] }); // fetch returns empty

      const generator = loader.fetch({
        resources: [{ name: "empty_table" }],
        syncContext: {},
        lastSyncedAt: undefined,
        maxDurationToRunMs: undefined,
      });

      // Consume all records
      const records = [];
      for await (const record of generator) {
        records.push(record);
      }

      // The generator should complete with hasMore: false
      expect(records).toHaveLength(0);
    });
  });

  describe("close", () => {
    it("should close the database connection", async () => {
      // First establish a connection
      mockClient.query.mockResolvedValue({ rows: [] });
      await loader.getResourceInfo("test").catch(() => {}); // Trigger connection

      await loader.close();

      expect(mockClient.end).toHaveBeenCalled();
    });
  });
});

