import { generateObject } from "ai";
import { NextRequest } from "next/server";
import { describe, it, expect, vi, beforeEach } from "vitest";

import { POST } from "./route";

// Mock the AI SDK
vi.mock("ai", () => ({
  generateObject: vi.fn()
}));

// Mock the agent model
vi.mock("@/lib/agent/core/agent", () => ({
  getAgentModel: vi.fn(() => "mock-model")
}));

describe("POST /api/data/autofill-config", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should generate name and description for database tables", async () => {
    const mockGenerate = vi.mocked(generateObject);
    mockGenerate.mockResolvedValue({
      object: {
        name: "User Database",
        description: "Contains user, order, and product data with 3 tables including user management and transactions."
      }
    } as any);

    const body = {
      resources: [
        {
          name: "users",
          schema: {},
          columns: ["id", "email", "name", "created_at"],
          timestampColumns: ["created_at"],
          recordCount: 1500
        },
        {
          name: "orders",
          schema: {},
          columns: ["id", "user_id", "total", "created_at"],
          timestampColumns: ["created_at"],
          recordCount: 5000
        },
        {
          name: "products",
          schema: {},
          columns: ["id", "name", "price", "category"],
          timestampColumns: [],
          recordCount: 200
        }
      ]
    };

    const request = new NextRequest("http://localhost:3000/api/data/autofill-config", {
      method: "POST",
      body: JSON.stringify(body),
      headers: {
        "Content-Type": "application/json"
      }
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.name).toBe("User Database");
    expect(data.description).toContain("user, order, and product");
    expect(mockGenerate).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining("users")
      })
    );
  });

  it("should generate name and description for API resources", async () => {
    const mockGenerate = vi.mocked(generateObject);
    mockGenerate.mockResolvedValue({
      object: {
        name: "Gmail Messages",
        description: "Email messages from Gmail with metadata including sender, subject, and timestamp information."
      }
    } as any);

    const body = {
      resources: [
        {
          name: "Message",
          schema: {},
          columns: ["id", "threadId", "labelIds", "snippet", "internalDate", "from", "to", "subject"],
          timestampColumns: ["internalDate"]
        }
      ]
    };

    const request = new NextRequest("http://localhost:3000/api/data/autofill-config", {
      method: "POST",
      body: JSON.stringify(body),
      headers: {
        "Content-Type": "application/json"
      }
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.name).toBe("Gmail Messages");
    expect(data.description).toContain("Email messages");
    expect(mockGenerate).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining("Message")
      })
    );
  });

  it("should generate name and description for multiple API resources", async () => {
    const mockGenerate = vi.mocked(generateObject);
    mockGenerate.mockResolvedValue({
      object: {
        name: "YouTube Content",
        description: "YouTube channel data including videos, playlists, and channel statistics."
      }
    } as any);

    const body = {
      resources: [
        {
          name: "Video",
          schema: {},
          columns: ["id", "title", "description", "publishedAt", "viewCount", "likeCount"],
          timestampColumns: ["publishedAt"]
        },
        {
          name: "Playlist",
          schema: {},
          columns: ["id", "title", "description", "itemCount"],
          timestampColumns: []
        },
        {
          name: "Channel",
          schema: {},
          columns: ["id", "title", "subscriberCount", "videoCount"],
          timestampColumns: []
        }
      ]
    };

    const request = new NextRequest("http://localhost:3000/api/data/autofill-config", {
      method: "POST",
      body: JSON.stringify(body),
      headers: {
        "Content-Type": "application/json"
      }
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.name).toBe("YouTube Content");
    expect(data.description).toContain("YouTube");
    expect(mockGenerate).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining("Video")
      })
    );
  });

  it("should return 400 if resources is missing", async () => {
    const body = {};

    const request = new NextRequest("http://localhost:3000/api/data/autofill-config", {
      method: "POST",
      body: JSON.stringify(body),
      headers: {
        "Content-Type": "application/json"
      }
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("Missing required field: resources (must be an array)");
  });

  it("should return 400 if resources is empty", async () => {
    const body = {
      resources: []
    };

    const request = new NextRequest("http://localhost:3000/api/data/autofill-config", {
      method: "POST",
      body: JSON.stringify(body),
      headers: {
        "Content-Type": "application/json"
      }
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("At least one resource is required");
  });

  it("should handle resources with minimal information", async () => {
    const mockGenerate = vi.mocked(generateObject);
    mockGenerate.mockResolvedValue({
      object: {
        name: "Custom Data",
        description: "Data from custom_resource_1 and custom_resource_2 containing business information."
      }
    } as any);

    const body = {
      resources: [
        { name: "custom_resource_1", schema: {}, columns: [], timestampColumns: [] },
        { name: "custom_resource_2", schema: {}, columns: [], timestampColumns: [] }
      ]
    };

    const request = new NextRequest("http://localhost:3000/api/data/autofill-config", {
      method: "POST",
      body: JSON.stringify(body),
      headers: {
        "Content-Type": "application/json"
      }
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.name).toBeTruthy();
    expect(data.description).toBeTruthy();
  });
});

