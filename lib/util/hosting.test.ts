import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import * as config from "@/lib/config";

import { isHostingEnabled } from "./hosting";

describe("isHostingEnabled", () => {
  describe("server-side", () => {
    it("should return true when hosting is enabled in config", () => {
      vi.spyOn(config, "getConfig").mockReturnValue({
        agent: {},
        database: {},
        github: { repo: "" },
        hosting: { enabled: true },
        job: { maxJobDurationMs: 0 },
        packages: {},
      });

      expect(isHostingEnabled()).toBe(true);
    });

    it("should return false when hosting is disabled in config", () => {
      vi.spyOn(config, "getConfig").mockReturnValue({
        agent: {},
        database: {},
        github: { repo: "" },
        hosting: { enabled: false },
        job: { maxJobDurationMs: 0 },
        packages: {},
      });

      expect(isHostingEnabled()).toBe(false);
    });
  });

  describe("client-side", () => {
    beforeEach(() => {
      // Mock window and document to simulate client-side
      global.window = {} as any;
      global.document = {
        cookie: "",
      } as any;
    });

    afterEach(() => {
      // Clean up
      delete (global as any).window;
      delete (global as any).document;
    });

    it("should return true when hosting cookie is set to true", () => {
      global.document.cookie = "x-hosting-enabled=true";
      expect(isHostingEnabled()).toBe(true);
    });

    it("should return false when hosting cookie is set to false", () => {
      global.document.cookie = "x-hosting-enabled=false";
      expect(isHostingEnabled()).toBe(false);
    });

    it("should return false when hosting cookie is not set", () => {
      global.document.cookie = "";
      expect(isHostingEnabled()).toBe(false);
    });

    it("should parse cookie correctly when multiple cookies are present", () => {
      global.document.cookie = "other-cookie=value; x-hosting-enabled=true; another-cookie=value";
      expect(isHostingEnabled()).toBe(true);
    });
  });
});

