import { describe, it, expect } from "vitest";

import { GET } from "./route";

describe("GET /api/data-loader", () => {
  it("should return list of available data loaders", async () => {
    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toHaveProperty("loaders");
    expect(Array.isArray(data.loaders)).toBe(true);
    
    // Check that loaders have the correct structure
    const loaderNames = data.loaders.map((loader: any) => loader.name);
    
    // Both loaders should be in the list (API returns all, client filters)
    expect(loaderNames).toContain("SQLDataLoader");
    expect(loaderNames).toContain("GoogleAPIDataLoader");
    
    // Check that each loader has required fields
    data.loaders.forEach((loader: any) => {
      expect(loader).toHaveProperty("name");
      expect(loader).toHaveProperty("exampleConfig");
      expect(loader).toHaveProperty("isHidden");
    });
    
    // Check that SQLDataLoader is not hidden
    const sqlLoader = data.loaders.find((l: any) => l.name === "SQLDataLoader");
    expect(sqlLoader.isHidden).toBe(false);
    
    // Check that GoogleAPIDataLoader is hidden
    const googleLoader = data.loaders.find((l: any) => l.name === "GoogleAPIDataLoader");
    expect(googleLoader.isHidden).toBe(true);
  });
});

