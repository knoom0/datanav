import { UIMessage } from "@ai-sdk/react";

import { UI_BUNDLE_PART_TYPE, REPORT_BUNDLE_PART_TYPE, UIBundle, ReportBundle } from "@/lib/types";
import { extractArtifacts, hasPart } from "@/lib/util/message-util";

describe("message-util", () => {
  describe("extractArtifacts", () => {
    it("should return empty array for message with no parts", () => {
      const message: UIMessage = {
        id: "test",
        role: "assistant",
        parts: []
      };

      const result = extractArtifacts(message);
      expect(result).toEqual([]);
    });

    it("should return empty array for message with undefined parts", () => {
      const message: UIMessage = {
        id: "test",
        role: "assistant",
        content: "Test message"
      } as any;

      const result = extractArtifacts(message);
      expect(result).toEqual([]);
    });

    it("should extract UI bundle artifacts", () => {
      const uiBundle: UIBundle = {
        type: "ui_bundle",
        uuid: "test-uuid",
        sourceCode: "console.log('test');",
        compiledCode: "console.log('test');",
        sourceMap: {},
        dataSpec: {
          type: "data_spec",
          queries: []
        }
      };

      const message: UIMessage = {
        id: "test",
        role: "assistant",
        parts: [
          {
            type: UI_BUNDLE_PART_TYPE,
            data: uiBundle
          }
        ]
      } as any;

      const result = extractArtifacts(message);
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(uiBundle);
    });

    it("should extract report bundle artifacts", () => {
      const reportBundle: ReportBundle = {
        type: "report_bundle",
        text: "Test report content",
        dataQueryResults: [
          {
            name: "test-query",
            description: "Test query",
            query: "SELECT * FROM test",
            records: [{ id: 1, name: "test" }]
          }
        ]
      };

      const message: UIMessage = {
        id: "test",
        role: "assistant",
        parts: [
          {
            type: REPORT_BUNDLE_PART_TYPE,
            data: reportBundle
          }
        ]
      } as any;

      const result = extractArtifacts(message);
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(reportBundle);
    });

    it("should extract multiple artifacts of different types", () => {
      const uiBundle: UIBundle = {
        type: "ui_bundle",
        uuid: "test-uuid",
        sourceCode: "console.log('test');",
        compiledCode: "console.log('test');",
        sourceMap: {},
        dataSpec: {
          type: "data_spec",
          queries: []
        }
      };

      const reportBundle: ReportBundle = {
        type: "report_bundle",
        text: "Test report content",
        dataQueryResults: []
      };

      const message: UIMessage = {
        id: "test",
        role: "assistant",
        parts: [
          {
            type: UI_BUNDLE_PART_TYPE,
            data: uiBundle
          },
          {
            type: REPORT_BUNDLE_PART_TYPE,
            data: reportBundle
          }
        ]
      } as any;

      const result = extractArtifacts(message);
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual(uiBundle);
      expect(result[1]).toEqual(reportBundle);
    });

    it("should ignore parts without data", () => {
      const message: UIMessage = {
        id: "test",
        role: "assistant",
        parts: [
          {
            type: UI_BUNDLE_PART_TYPE
            // no data property
          },
          {
            type: REPORT_BUNDLE_PART_TYPE
            // no data property
          }
        ]
      } as any;

      const result = extractArtifacts(message);
      expect(result).toEqual([]);
    });

    it("should ignore parts with unknown types", () => {
      const message: UIMessage = {
        id: "test",
        role: "assistant",
        parts: [
          {
            type: "unknown-type",
            data: { some: "data" }
          }
        ]
      } as any;

      const result = extractArtifacts(message);
      expect(result).toEqual([]);
    });
  });

  describe("hasPart", () => {
    it("should return false for undefined message", () => {
      const result = hasPart(undefined, UI_BUNDLE_PART_TYPE);
      expect(result).toBe(false);
    });

    it("should return false for message with no parts", () => {
      const message: UIMessage = {
        id: "test",
        role: "assistant",
        parts: []
      };

      const result = hasPart(message, UI_BUNDLE_PART_TYPE);
      expect(result).toBe(false);
    });

    it("should return true when message has part of specified type", () => {
      const message: UIMessage = {
        id: "test",
        role: "assistant",
        parts: [
          {
            type: UI_BUNDLE_PART_TYPE,
            data: {}
          }
        ]
      } as any;

      const result = hasPart(message, UI_BUNDLE_PART_TYPE);
      expect(result).toBe(true);
    });

    it("should return false when message does not have part of specified type", () => {
      const message: UIMessage = {
        id: "test",
        role: "assistant",
        parts: [
          {
            type: REPORT_BUNDLE_PART_TYPE,
            data: {}
          }
        ]
      } as any;

      const result = hasPart(message, UI_BUNDLE_PART_TYPE);
      expect(result).toBe(false);
    });
  });
});
