import { describe, it, expect, vi, beforeEach } from "vitest";

import { APIError } from "@/lib/errors";
import { getCurrentUserId, PSEUDO_USER_ID } from "@/lib/util/auth-util";

// Mock Next.js headers
vi.mock("next/headers", () => ({
  headers: vi.fn(),
}));

// Mock the Supabase client
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

// Mock the config
vi.mock("@/lib/config", () => ({
  getConfig: vi.fn(),
}));

const mockHeaders = vi.mocked(await import("next/headers")).headers;
const mockCreateClient = vi.mocked(await import("@/lib/supabase/server")).createClient;
const mockGetConfig = vi.mocked(await import("@/lib/config")).getConfig;

describe("auth-util", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    
    // Default mock for headers (no Authorization header)
    mockHeaders.mockResolvedValue({
      get: vi.fn().mockReturnValue(null),
    } as any);
  });

  describe("getCurrentUserId", () => {
    it("should return pseudo user ID when hosting is disabled", async () => {
      mockGetConfig.mockReturnValue({
        hosting: { enabled: false },
      } as any);

      const result = await getCurrentUserId();
      expect(result).toBe(PSEUDO_USER_ID);
      expect(mockCreateClient).not.toHaveBeenCalled();
    });

    it("should return user ID when user is authenticated and hosting is enabled", async () => {
      const mockUserId = "user123";
      mockGetConfig.mockReturnValue({
        hosting: { enabled: true },
      } as any);

      const mockSupabaseClient = {
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: { user: { id: mockUserId } },
            error: null,
          }),
        },
      };

      mockCreateClient.mockResolvedValue(mockSupabaseClient as any);

      const result = await getCurrentUserId();
      expect(result).toBe(mockUserId);
      expect(mockSupabaseClient.auth.getUser).toHaveBeenCalledOnce();
    });

    it("should throw APIError when user is not authenticated and hosting is enabled", async () => {
      mockGetConfig.mockReturnValue({
        hosting: { enabled: true },
      } as any);

      const mockSupabaseClient = {
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: { user: null },
            error: null,
          }),
        },
      };

      mockCreateClient.mockResolvedValue(mockSupabaseClient as any);

      await expect(getCurrentUserId()).rejects.toThrow(APIError);
      await expect(getCurrentUserId()).rejects.toThrow("User not authenticated");
    });

    it("should throw APIError when there is an authentication error and hosting is enabled", async () => {
      mockGetConfig.mockReturnValue({
        hosting: { enabled: true },
      } as any);

      const mockError = { message: "Invalid token" };
      const mockSupabaseClient = {
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: { user: null },
            error: mockError,
          }),
        },
      };

      mockCreateClient.mockResolvedValue(mockSupabaseClient as any);

      await expect(getCurrentUserId()).rejects.toThrow(APIError);
      await expect(getCurrentUserId()).rejects.toThrow("Authentication error: Invalid token");
    });

    it("should use JWT from Authorization header when present", async () => {
      const mockUserId = "user-from-jwt";
      const mockJwt = "test-jwt-token";
      
      mockGetConfig.mockReturnValue({
        hosting: { enabled: true },
      } as any);

      // Mock headers to return Authorization header
      mockHeaders.mockResolvedValue({
        get: vi.fn().mockImplementation((name: string) => {
          if (name === "authorization") {
            return `Bearer ${mockJwt}`;
          }
          return null;
        }),
      } as any);

      const mockSupabaseClient = {
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: { user: { id: mockUserId } },
            error: null,
          }),
        },
      };

      mockCreateClient.mockResolvedValue(mockSupabaseClient as any);

      const result = await getCurrentUserId();
      expect(result).toBe(mockUserId);
      expect(mockSupabaseClient.auth.getUser).toHaveBeenCalledOnce();
      expect(mockSupabaseClient.auth.getUser).toHaveBeenCalledWith(mockJwt);
    });
  });
});
