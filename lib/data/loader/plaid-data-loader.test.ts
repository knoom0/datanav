import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import { PlaidDataLoader } from "@/lib/data/loader/plaid-data-loader";

// Mock environment variables
const originalEnv = process.env;

describe("PlaidDataLoader", () => {
  let loader: PlaidDataLoader;

  beforeEach(() => {
    // Set up environment variables for testing
    process.env = {
      ...originalEnv,
      PLAID_CLIENT_ID: "test_client_id",
      PLAID_CLIENT_SECRET: "test_secret",
      PLAID_ENVIRONMENT: "sandbox",
    };

    loader = new PlaidDataLoader({
      products: ["transactions"],
      countryCodes: ["US"],
      language: "en",
      onFetch: async function* () {
        yield { resourceName: "Transaction", id: "test" };
      },
    });
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("constructor", () => {
    it("should create a loader with valid config", () => {
      expect(loader).toBeDefined();
      const tokenPair = loader.getTokenPair();
      expect(tokenPair.accessToken).toBeNull();
    });

    it("should throw error with missing onFetch", () => {
      expect(() => {
        new PlaidDataLoader({});
      }).toThrow(); // Zod will throw validation error for missing required fields
    });

    it("should throw error with missing PLAID_CLIENT_ID", () => {
      const env = process.env;
      delete env.PLAID_CLIENT_ID;
      process.env = env;

      expect(() => {
        new PlaidDataLoader({
          products: ["transactions"],
          countryCodes: ["US"],
          language: "en",
          onFetch: async function* () {
            yield { resourceName: "Transaction" };
          },
        });
      }).toThrow(
        "PlaidDataLoader requires PLAID_CLIENT_ID and PLAID_CLIENT_SECRET environment variables"
      );
    });

    it("should throw error with missing PLAID_CLIENT_SECRET", () => {
      const env = process.env;
      delete env.PLAID_CLIENT_SECRET;
      process.env = env;

      expect(() => {
        new PlaidDataLoader({
          products: ["transactions"],
          countryCodes: ["US"],
          language: "en",
          onFetch: async function* () {
            yield { resourceName: "Transaction" };
          },
        });
      }).toThrow(
        "PlaidDataLoader requires PLAID_CLIENT_ID and PLAID_CLIENT_SECRET environment variables"
      );
    });
  });

  describe("authentication", () => {
    it("should return plaid URL on authenticate", async () => {
      // Mock the plaidClient.linkTokenCreate method
      const mockLinkToken = "link-sandbox-test-token";
      vi.spyOn((loader as any).plaidClient, "linkTokenCreate").mockResolvedValue({
        data: { link_token: mockLinkToken },
      });

      const result = await loader.authenticate({ redirectTo: "/callback", userId: "test-user-id" });
      expect(result.authUrl).toContain("plaid://?linkToken=");
      expect(result.authUrl).toContain(encodeURIComponent(mockLinkToken));
      expect(result.authUrl).toContain("redirectTo=%2Fcallback");
      expect(result.success).toBe(false);
    });

    it("should allow setting token pair", () => {
      const token = "access-sandbox-test-token";
      loader.setTokenPair({ accessToken: token, refreshToken: null });
      const tokenPair = loader.getTokenPair();
      expect(tokenPair.accessToken).toBe(token);
      expect(tokenPair.refreshToken).toBeNull();
    });
  });

  describe("getAvailableResourceNames", () => {
    it("should return predefined Plaid resource types", async () => {
      const resources = await loader.getAvailableResourceNames();
      expect(resources).toEqual([
        "Transaction",
        "Account",
        "Balance",
        "Identity",
        "Investment",
      ]);
    });
  });

  describe("getResourceInfo", () => {
    it("should return resource info from Plaid API spec", async () => {
      const info = await loader.getResourceInfo("Transaction");
      expect(info.name).toBe("Transaction");
      expect(info.schema.type).toBe("object");
      // Should have columns from the Plaid API spec
      expect(info.columns.length).toBeGreaterThan(0);
      expect(info.columns).toContain("transaction_id");
      expect(info.columns).toContain("amount");
      expect(info.columns).toContain("date");
      // Should identify timestamp columns
      expect(info.timestampColumns).toContain("date");
      expect(info.timestampColumns).toContain("authorized_date");
    });
  });

  describe("fetch", () => {
    it("should throw error when not authenticated", async () => {
      const generator = loader.fetch({
        resources: [{ name: "Transaction" }],
        syncContext: {},
      });

      await expect(async () => {
        await generator.next();
      }).rejects.toThrow("Not authenticated");
    });

    it("should call onFetch when access token is set", async () => {
      const mockOnFetch = vi.fn(async function* () {
        yield { resourceName: "Transaction", id: "tx1" };
        yield { resourceName: "Transaction", id: "tx2" };
      });

      const testLoader = new PlaidDataLoader({
        products: ["transactions"],
        countryCodes: ["US"],
        language: "en",
        onFetch: mockOnFetch,
      });

      testLoader.setTokenPair({ accessToken: "test-access-token", refreshToken: null });

      const generator = testLoader.fetch({
        resources: [{ name: "Transaction" }],
        syncContext: {},
      });

      const records = [];
      for await (const record of generator) {
        records.push(record);
      }

      expect(records).toHaveLength(2);
      expect(records[0].id).toBe("tx1");
      expect(records[1].id).toBe("tx2");
      expect(mockOnFetch).toHaveBeenCalledWith({
        plaidClient: expect.any(Object),
        lastSyncedAt: null,
        syncContext: {},
      });
    });
  });
});

