import { describe, it, expect } from "vitest";

import { getAvailableDataLoaders, createDataLoader, SQLDataLoader } from "@/lib/data/loader/index";

describe("getAvailableDataLoaders", () => {
  it("should return array of available loader class names", () => {
    const loaders = getAvailableDataLoaders();
    expect(loaders).toEqual(["GoogleAPIDataLoader", "PlaidDataLoader", "SQLDataLoader"]);
  });

  it("should return a copy of the array", () => {
    const loaders1 = getAvailableDataLoaders();
    const loaders2 = getAvailableDataLoaders();
    expect(loaders1).not.toBe(loaders2);
    expect(loaders1).toEqual(loaders2);
  });
});

describe("createDataLoader", () => {
  it("should create a SQL data loader", () => {
    const loader = createDataLoader({
      loaderClassName: "SQLDataLoader",
      loaderConfig: {
        host: "localhost",
        port: 5432,
        username: "test",
        password: "test",
        database: "testdb",
        schema: "public"
      },
    });
    expect(loader).toBeInstanceOf(SQLDataLoader);
  });

  it("should throw error for unknown loader class name", () => {
    expect(() =>
      createDataLoader({
        loaderClassName: "UnknownLoader",
        loaderConfig: {},
      })
    ).toThrow("Unknown data loader class name: UnknownLoader");
  });
});

describe("getAvailableDataLoaders edge cases", () => {
  it("should include GoogleAPIDataLoader, PlaidDataLoader, and SQLDataLoader", () => {
    const loaders = getAvailableDataLoaders();
    expect(loaders).toContain("GoogleAPIDataLoader");
    expect(loaders).toContain("PlaidDataLoader");
    expect(loaders).toContain("SQLDataLoader");
    expect(loaders.length).toBeGreaterThanOrEqual(2);
  });
});

