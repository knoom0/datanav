import { vi } from "vitest";

import { DATA_CONNECTOR_URLS } from "@/lib/consts";
import { GoogleAPIDataLoader } from "@/lib/data/loader/google-api-data-loader";

describe("GoogleAPIDataLoader", () => {
  let loader: GoogleAPIDataLoader;
  let loaderWithSpec: GoogleAPIDataLoader;

  const mockOpenApiSpec = {
    openapi: "3.0.0",
    info: { title: "Test API", version: "1.0" },
    paths: {},
    components: {
      schemas: {
        Event: {
          type: "object",
          properties: {
            id: { type: "string" },
            title: { type: "string" },
            createdAt: { type: "string", format: "date-time" },
            updatedAt: { type: "string", format: "date-time" },
            description: { type: "string" }
          },
          required: ["id", "title"]
        },
        Calendar: {
          type: "object",
          properties: {
            id: { type: "string" },
            name: { type: "string" },
            timezone: { type: "string" }
          }
        }
      }
    }
  };

  beforeEach(() => {
    // Set up environment variables for tests
    process.env.GOOGLE_CLIENT_ID = "test-client-id";
    process.env.GOOGLE_CLIENT_SECRET = "test-client-secret";

    loader = new GoogleAPIDataLoader({
      scopes: ["https://www.googleapis.com/auth/calendar.readonly"],
      onFetch: async function* () {
        yield { resourceName: "TestEvent", id: "1", title: "Test Event 1" };
        yield { resourceName: "TestEvent", id: "2", title: "Test Event 2" };
        return { hasMore: false };
      },
    });

    loaderWithSpec = new GoogleAPIDataLoader({
      openApiSpec: mockOpenApiSpec,
      scopes: ["https://www.googleapis.com/auth/calendar.readonly"],
      onFetch: async function* () {
        yield { resourceName: "Event", id: "1", title: "Test Event" };
        return { hasMore: false };
      },
    });
  });

  afterEach(() => {
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_SECRET;
  });

  it("should handle OAuth token exchange", async () => {
    // Mock fetch to return a successful token response
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ access_token: "test-access-token" }),
      } as Response)
    );

    // Test authentication completion
    await loader.continueToAuthenticate({ code: "test-auth-code", redirectTo: `http://localhost:3000${DATA_CONNECTOR_URLS.AUTH_CALLBACK_PATH}` });

    // Cleanup
    vi.mocked(global.fetch).mockRestore();
  });

  it("should generate correct auth URL", () => {
    const redirectTo = `http://localhost:3000${DATA_CONNECTOR_URLS.AUTH_CALLBACK_PATH}`;
    const result = loader.authenticate({ redirectTo });
    
    expect(result.authUrl).toContain("https://accounts.google.com/o/oauth2/v2/auth");
    expect(result.authUrl).toContain("client_id=test-client-id");
    expect(result.authUrl).toContain(`redirect_uri=${encodeURIComponent(redirectTo)}`);
    expect(result.authUrl).toContain("scope=https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fcalendar.readonly");
  });

  it("should throw error when OAuth config is missing", () => {
    delete process.env.GOOGLE_CLIENT_ID;
    
    expect(() => loader.authenticate({ redirectTo: `http://localhost:3000${DATA_CONNECTOR_URLS.AUTH_CALLBACK_PATH}` })).toThrow("Google OAuth configuration missing");
  });

  it("should fetch data using AsyncGenerator pattern", async () => {
    // Set up access token
    loader.setAccessToken("test-access-token");

    const recordGenerator = loader.fetch({ 
      resources: [{ name: "TestEvent" }],
      syncContext: {}, 
      maxDurationToRunMs: undefined 
    });

    const records = [];
    let done: boolean | undefined;
    let value: any;

    // Process only a few records to avoid memory issues
    let count = 0;
    while (!done && count < 5) {
      ({ done, value } = await recordGenerator.next());
      if (!done && value && "resourceName" in value) {
        records.push(value);
        count++;
      }
    }

    expect(records).toHaveLength(2);
    expect(records[0]).toEqual({ resourceName: "TestEvent", id: "1", title: "Test Event 1" });
    expect(records[1]).toEqual({ resourceName: "TestEvent", id: "2", title: "Test Event 2" });
  });

  it("should throw error when no access token is available", async () => {
    await expect(async () => {
      const generator = loader.fetch({ 
        resources: [{ name: "TestEvent" }],
        syncContext: {}, 
        maxDurationToRunMs: undefined 
      });
      await generator.next();
    }).rejects.toThrow("No access token available. Please authenticate first.");
  });

  describe("getAvailableResourceNames", () => {
    it("should throw error when no OpenAPI spec is available", async () => {
      await expect(loader.getAvailableResourceNames()).rejects.toThrow("No OpenAPI spec available. Cannot enumerate resources.");
    });

    it("should return schema names from OpenAPI spec", async () => {
      const resourceNames = await loaderWithSpec.getAvailableResourceNames();
      
      expect(resourceNames).toContain("Event");
      expect(resourceNames).toContain("Calendar");
      expect(resourceNames).toHaveLength(2);
    });

    it("should return empty array when no schemas exist", async () => {
      const emptySpecLoader = new GoogleAPIDataLoader({
        openApiSpec: {
          openapi: "3.0.0",
          info: { title: "Empty API", version: "1.0" },
          paths: {},
          components: {}
        },
        scopes: ["test"],
        // eslint-disable-next-line require-yield
        onFetch: async function* () {
          return { hasMore: false };
        }
      });

      const resourceNames = await emptySpecLoader.getAvailableResourceNames();
      expect(resourceNames).toEqual([]);
    });
  });

  describe("getResourceInfo", () => {
    it("should throw error when no OpenAPI spec is available", async () => {
      await expect(loader.getResourceInfo("Event")).rejects.toThrow("No OpenAPI spec available. Cannot get resource information.");
    });

    it("should return resource info from OpenAPI spec", async () => {
      const resourceInfo = await loaderWithSpec.getResourceInfo("Event");
      
      expect(resourceInfo.name).toBe("Event");
      expect(resourceInfo.columns).toEqual(["id", "title", "createdAt", "updatedAt", "description"]);
      expect(resourceInfo.timestampColumns).toEqual(["createdAt", "updatedAt"]);
      expect(resourceInfo.schema.type).toBe("object");
      expect(resourceInfo.schema.properties).toHaveProperty("id");
      expect(resourceInfo.schema.properties).toHaveProperty("title");
      expect(resourceInfo.recordCount).toBeUndefined();
    });

    it("should throw error when schema not found", async () => {
      await expect(loaderWithSpec.getResourceInfo("NonExistent")).rejects.toThrow("Schema NonExistent not found in OpenAPI spec");
    });

    it("should handle schemas with allOf", async () => {
      const loaderWithAllOf = new GoogleAPIDataLoader({
        openApiSpec: {
          openapi: "3.0.0",
          info: { title: "Test API", version: "1.0" },
          paths: {},
          components: {
            schemas: {
              Base: {
                type: "object",
                properties: {
                  id: { type: "string" }
                }
              },
              Extended: {
                allOf: [
                  { $ref: "#/components/schemas/Base" },
                  {
                    type: "object",
                    properties: {
                      name: { type: "string" },
                      timestamp: { type: "string", format: "date-time" }
                    }
                  }
                ]
              }
            }
          }
        },
        scopes: ["test"],
        // eslint-disable-next-line require-yield
        onFetch: async function* () {
          return { hasMore: false };
        }
      });

      const resourceInfo = await loaderWithAllOf.getResourceInfo("Extended");
      
      expect(resourceInfo.columns).toContain("name");
      expect(resourceInfo.columns).toContain("timestamp");
      expect(resourceInfo.timestampColumns).toContain("timestamp");
    });
  });
});
