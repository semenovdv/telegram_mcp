import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { loadConfig, configSchema, type Config } from "../src/config.js";

describe("Config", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("loadConfig", () => {
    it("should load config with required bot token", () => {
      process.env.TELEGRAM_BOT_TOKEN = "test_token_123";
      process.env.ALLOWED_CHAT_IDS = "123,456";

      const config = loadConfig();

      expect(config.telegram.botToken).toBe("test_token_123");
      expect(config.telegram.allowedChatIds).toEqual([123, 456]);
    });

    it("should use defaults for optional values", () => {
      process.env.TELEGRAM_BOT_TOKEN = "test_token_123";

      const config = loadConfig();

      expect(config.mcp.name).toBe("telegram-mcp");
      expect(config.mcp.version).toBe("1.0.0");
      expect(config.telegram.allowedChatIds).toEqual([]);
    });

    it("should throw when TELEGRAM_BOT_TOKEN is missing", () => {
      delete process.env.TELEGRAM_BOT_TOKEN;

      expect(() => loadConfig()).toThrow("TELEGRAM_BOT_TOKEN environment variable is required");
    });

    it("should parse ALLOWED_CHAT_IDS as numbers", () => {
      process.env.TELEGRAM_BOT_TOKEN = "test_token";
      process.env.ALLOWED_CHAT_IDS = "123, -456, 789";

      const config = loadConfig();

      expect(config.telegram.allowedChatIds).toEqual([123, -456, 789]);
    });

    it("should handle empty ALLOWED_CHAT_IDS", () => {
      process.env.TELEGRAM_BOT_TOKEN = "test_token";
      process.env.ALLOWED_CHAT_IDS = "";

      const config = loadConfig();

      expect(config.telegram.allowedChatIds).toEqual([]);
    });

    it("should allow custom MCP name and version", () => {
      process.env.TELEGRAM_BOT_TOKEN = "test_token";
      process.env.MCP_NAME = "custom-bot";
      process.env.MCP_VERSION = "2.0.0";

      const config = loadConfig();

      expect(config.mcp.name).toBe("custom-bot");
      expect(config.mcp.version).toBe("2.0.0");
    });
  });

  describe("configSchema", () => {
    it("should validate valid config", () => {
      const validConfig = {
        telegram: {
          botToken: "test_token",
          allowedChatIds: [123, 456],
        },
        mcp: {
          name: "test-bot",
          version: "1.0.0",
        },
      };

      const result = configSchema.parse(validConfig);
      expect(result).toEqual(validConfig);
    });

    it("should reject empty bot token", () => {
      const invalidConfig = {
        telegram: {
          botToken: "",
          allowedChatIds: [],
        },
        mcp: {
          name: "test",
          version: "1.0.0",
        },
      };

      expect(() => configSchema.parse(invalidConfig)).toThrow();
    });

    it("should reject non-array allowedChatIds", () => {
      const invalidConfig = {
        telegram: {
          botToken: "test",
          allowedChatIds: "not-an-array",
        },
        mcp: {
          name: "test",
          version: "1.0.0",
        },
      };

      expect(() => configSchema.parse(invalidConfig)).toThrow();
    });
  });
});