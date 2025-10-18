import { NextRequest } from "next/server";
import { describe, it, expect, vi } from "vitest";

import { GET } from "./route";

// Mock the pg Client
vi.mock("pg", () => {
  const mockClient = {
    connect: vi.fn(),
    query: vi.fn().mockResolvedValue({
      rows: [
        { table_name: "users" },
        { table_name: "orders" }
      ]
    }),
    end: vi.fn(),
  };
  return {
    Client: vi.fn(() => mockClient),
  };
});

describe("GET /api/data-loader/[name]/resource", () => {
  it("should return resource names for SQL loader", async () => {
    const loaderConfig = {
      host: "localhost",
      port: 5432,
      username: "test",
      password: "test",
      database: "testdb",
      schema: "public"
    };

    const url = `http://localhost:3000/api/data-loader/SQLDataLoader/resource?loaderConfig=${encodeURIComponent(JSON.stringify(loaderConfig))}`;
    const request = new NextRequest(url);
    const params = Promise.resolve({ name: "SQLDataLoader" });

    const response = await GET(request, { params });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toHaveProperty("resourceNames");
    expect(data.resourceNames).toEqual(["users", "orders"]);
  });

  it("should return 400 if loaderConfig is missing", async () => {
    const url = "http://localhost:3000/api/data-loader/SQLDataLoader/resource";
    const request = new NextRequest(url);
    const params = Promise.resolve({ name: "SQLDataLoader" });

    const response = await GET(request, { params });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("Missing required query parameter: loaderConfig");
  });

  it("should return 400 if loaderConfig is invalid JSON", async () => {
    const url = "http://localhost:3000/api/data-loader/SQLDataLoader/resource?loaderConfig=invalid-json";
    const request = new NextRequest(url);
    const params = Promise.resolve({ name: "SQLDataLoader" });

    const response = await GET(request, { params });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("Invalid loaderConfig JSON");
  });

  it("should return error for unsupported loader type", async () => {
    const loaderConfig = { someConfig: "value" };
    const url = `http://localhost:3000/api/data-loader/UnknownLoader/resource?loaderConfig=${encodeURIComponent(JSON.stringify(loaderConfig))}`;
    const request = new NextRequest(url);
    const params = Promise.resolve({ name: "UnknownLoader" });

    const response = await GET(request, { params });
    const data = await response.json();

    // Returns 400 because the loader class name is unknown
    expect(response.status).toBe(400);
    expect(data.error).toBeTruthy();
  });
});

