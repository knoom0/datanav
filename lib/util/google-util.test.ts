import { getServiceAccountCredentials, getServiceAccountAccessToken } from "@/lib/util/google-util";

describe("Google Utilities", () => {
  describe("getServiceAccountCredentials", () => {
    it("should throw error when GOOGLE_SERVICE_ACCOUNT_JSON is not set", () => {
      // Clear any existing environment variables
      const originalEnv = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
      delete process.env.GOOGLE_SERVICE_ACCOUNT_JSON;

      expect(() => getServiceAccountCredentials()).toThrow("GOOGLE_SERVICE_ACCOUNT_JSON environment variable is not set");

      // Restore environment
      if (originalEnv !== undefined) {
        process.env.GOOGLE_SERVICE_ACCOUNT_JSON = originalEnv;
      }
    });

    it("should throw error when GOOGLE_SERVICE_ACCOUNT_JSON contains invalid JSON", () => {
      const originalEnv = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
      process.env.GOOGLE_SERVICE_ACCOUNT_JSON = "invalid-json";

      expect(() => getServiceAccountCredentials()).toThrow("Failed to parse GOOGLE_SERVICE_ACCOUNT_JSON");

      // Restore environment
      if (originalEnv === undefined) {
        delete process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
      } else {
        process.env.GOOGLE_SERVICE_ACCOUNT_JSON = originalEnv;
      }
    });

    it("should parse credentials from GOOGLE_SERVICE_ACCOUNT_JSON", () => {
      const mockCredentials = {
        type: "service_account",
        project_id: "test-project",
        private_key_id: "test-key-id",
        private_key: "-----BEGIN PRIVATE KEY-----\ntest-key\n-----END PRIVATE KEY-----",
        client_email: "test@test-project.iam.gserviceaccount.com",
        client_id: "test-client-id",
        auth_uri: "https://accounts.google.com/o/oauth2/auth",
        token_uri: "https://oauth2.googleapis.com/token",
        auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
        client_x509_cert_url: "https://www.googleapis.com/robot/v1/metadata/x509/test%40test-project.iam.gserviceaccount.com"
      };

      const originalEnv = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
      process.env.GOOGLE_SERVICE_ACCOUNT_JSON = JSON.stringify(mockCredentials);

      const credentials = getServiceAccountCredentials();
      expect(credentials).toEqual(mockCredentials);

      // Restore environment
      if (originalEnv === undefined) {
        delete process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
      } else {
        process.env.GOOGLE_SERVICE_ACCOUNT_JSON = originalEnv;
      }
    });
  });

  describe("getServiceAccountAccessToken", () => {
    it("should throw error when credentials are invalid", async () => {
      const invalidCredentials = {
        type: "service_account",
        project_id: "test",
        private_key_id: "test",
        private_key: "invalid-key",
        client_email: "test@test.com",
        client_id: "test",
        auth_uri: "https://accounts.google.com/o/oauth2/auth",
        token_uri: "https://oauth2.googleapis.com/token",
        auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
        client_x509_cert_url: "https://test"
      };

      await expect(
        getServiceAccountAccessToken(invalidCredentials, ["https://www.googleapis.com/auth/calendar.readonly"])
      ).rejects.toThrow();
    });
  });
});
