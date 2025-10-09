import { vi } from "vitest";

import { DATA_CONNECTOR_URLS } from "@/lib/consts";
import { GoogleAPIDataLoader } from "@/lib/data/loader/google-api-data-loader";

describe("GoogleAPIDataLoader", () => {
  let loader: GoogleAPIDataLoader;

  beforeEach(() => {
    // Set up environment variables for tests
    process.env.GOOGLE_CLIENT_ID = "test-client-id";
    process.env.GOOGLE_CLIENT_SECRET = "test-client-secret";

    loader = new GoogleAPIDataLoader({
      scopes: ["https://www.googleapis.com/auth/calendar.readonly"],
      onFetch: async function* () {
        yield { resourceName: "TestEvent", id: "1", title: "Test Event 1" };
        yield { resourceName: "TestEvent", id: "2", title: "Test Event 2" };
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
});
