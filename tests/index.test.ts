import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock the dependencies BEFORE importing
vi.mock("../src/telegram-bot.js", () => {
  const mockTelegramBot = {
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
    sendMessage: vi.fn(),
    editMessage: vi.fn(),
    deleteMessage: vi.fn(),
    getChat: vi.fn(),
    onMessage: vi.fn(),
  };
  return {
    TelegramBot: vi.fn().mockImplementation(() => mockTelegramBot),
  };
});

vi.mock("../src/config.js", () => ({
  loadConfig: vi.fn().mockReturnValue({
    telegram: {
      botToken: "test_token",
      allowedChatIds: [123],
    },
    mcp: {
      name: "test-bot",
      version: "1.0.0",
    },
  }),
}));

import { TelegramMcpServer } from "../src/index.js";
import { TelegramBot } from "../src/telegram-bot.js";

function createTestServer() {
  return new TelegramMcpServer();
}

describe("TelegramMcpServer - Tools", () => {
  let server: TelegramMcpServer;
  let mockBot: ReturnType<typeof TelegramBot>;

  beforeEach(() => {
    vi.clearAllMocks();
    server = createTestServer();
    mockBot = (server as any).telegramBot;
  });

  afterEach(() => {
    vi.resetModules();
  });

  // Helper to get handler from the server's internal map (by method name)
  function getHandler(method: string) {
    const handlers = (server as any).server._requestHandlers;
    if (!handlers) throw new Error("No request handlers found");
    const handler = handlers.get(method);
    if (!handler) throw new Error(`Handler for ${method} not found`);
    return handler;
  }

  function makeRequest(method: string, params: Record<string, any> = {}) {
    return {
      jsonrpc: "2.0",
      id: 1,
      method,
      params,
    };
  }

  async function callTool(name: string, args: Record<string, any>) {
    const handler = getHandler("tools/call");
    return handler(makeRequest("tools/call", { name, arguments: args }));
  }

  async function listTools() {
    const handler = getHandler("tools/list");
    return handler(makeRequest("tools/list"));
  }

  async function listResources() {
    const handler = getHandler("resources/list");
    return handler(makeRequest("resources/list"));
  }

  async function readResource(uri: string) {
    const handler = getHandler("resources/read");
    return handler(makeRequest("resources/read", { uri }));
  }

  describe("list_tools", () => {
    it("should return all available tools", async () => {
      const result = await listTools();
      expect(result.tools).toHaveLength(5);
      expect(result.tools.map((t: any) => t.name)).toEqual([
        "send_message",
        "edit_message",
        "delete_message",
        "get_chat",
        "list_recent_messages",
      ]);
    });

    it("should have correct schema for send_message", async () => {
      const result = await listTools();
      const sendTool = result.tools.find((t: any) => t.name === "send_message");
      expect(sendTool.inputSchema.required).toEqual(["chatId", "text"]);
    });
  });

  describe("send_message tool", () => {
    it("should send message and return result", async () => {
      const mockResult = {
        messageId: 1,
        chatId: 123,
        text: "Hello",
        date: Date.now() / 1000,
      };
      mockBot.sendMessage.mockResolvedValue(mockResult);

      const result = await callTool("send_message", { chatId: 123, text: "Hello" });

      expect(mockBot.sendMessage).toHaveBeenCalledWith(123, "Hello", { parseMode: undefined });
      const data = JSON.parse(result.content[0].text);
      expect(data.chatId).toBe(123);
      expect(data.text).toBe("Hello");
    });

    it("should handle errors", async () => {
      mockBot.sendMessage.mockRejectedValue(new Error("Network error"));

      const result = await callTool("send_message", { chatId: 123, text: "Hello" });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Network error");
    });
  });

  describe("edit_message tool", () => {
    it("should edit message and return success", async () => {
      mockBot.editMessage.mockResolvedValue(true);

      const result = await callTool("edit_message", { chatId: 123, messageId: 1, text: "Edited" });

      expect(mockBot.editMessage).toHaveBeenCalledWith(123, 1, "Edited", { parseMode: undefined });
      expect(JSON.parse(result.content[0].text)).toEqual({ success: true });
    });
  });

  describe("delete_message tool", () => {
    it("should delete message and return success", async () => {
      mockBot.deleteMessage.mockResolvedValue(true);

      const result = await callTool("delete_message", { chatId: 123, messageId: 1 });

      expect(mockBot.deleteMessage).toHaveBeenCalledWith(123, 1);
      expect(JSON.parse(result.content[0].text)).toEqual({ success: true });
    });
  });

  describe("get_chat tool", () => {
    it("should return chat info", async () => {
      const mockChat = { id: 123, type: "private", username: "test" };
      mockBot.getChat.mockResolvedValue(mockChat);

      const result = await callTool("get_chat", { chatId: 123 });

      expect(mockBot.getChat).toHaveBeenCalledWith(123);
      expect(JSON.parse(result.content[0].text)).toEqual(mockChat);
    });
  });

  describe("list_recent_messages tool", () => {
    it("should return recent messages", async () => {
      const mockMessages = [
        { messageId: 1, chatId: 123, text: "Msg 1", date: Date.now() / 1000 },
        { messageId: 2, chatId: 123, text: "Msg 2", date: Date.now() / 1000 },
      ];
      (server as any).recentMessages = mockMessages;

      const result = await callTool("list_recent_messages", { limit: 1 });

      const messages = JSON.parse(result.content[0].text);
      expect(messages).toHaveLength(1);
      expect(messages[0].text).toBe("Msg 1");
    });

    it("should respect default limit", async () => {
      const mockMessages = Array(25).fill({ messageId: 1, chatId: 123, text: "Msg", date: Date.now() / 1000 });
      (server as any).recentMessages = mockMessages;

      const result = await callTool("list_recent_messages", {});

      const messages = JSON.parse(result.content[0].text);
      expect(messages).toHaveLength(20);
    });
  });
});

describe("TelegramMcpServer - Resources", () => {
  let server: TelegramMcpServer;
  let mockBot: ReturnType<typeof TelegramBot>;

  beforeEach(() => {
    vi.clearAllMocks();
    server = createTestServer();
    mockBot = (server as any).telegramBot;
  });

  afterEach(() => {
    vi.resetModules();
  });

  function getHandler(method: string) {
    const handlers = (server as any).server._requestHandlers;
    if (!handlers) throw new Error("No request handlers found");
    const handler = handlers.get(method);
    if (!handler) throw new Error(`Handler for ${method} not found`);
    return handler;
  }

  function makeRequest(method: string, params: Record<string, any> = {}) {
    return {
      jsonrpc: "2.0",
      id: 1,
      method,
      params,
    };
  }

  async function listResources() {
    const handler = getHandler("resources/list");
    return handler(makeRequest("resources/list"));
  }

  async function readResource(uri: string) {
    const handler = getHandler("resources/read");
    return handler(makeRequest("resources/read", { uri }));
  }

  describe("list_resources", () => {
    it("should return available resources", async () => {
      const result = await listResources();
      expect(result.resources).toHaveLength(2);
      expect(result.resources.map((r: any) => r.uri)).toEqual([
        "telegram://recent-messages",
        "telegram://config",
      ]);
    });
  });

  describe("read_resource", () => {
    it("should return recent messages", async () => {
      const mockMessages = [{ messageId: 1, chatId: 123, text: "Hello", date: Date.now() / 1000 }];
      (server as any).recentMessages = mockMessages;

      const result = await readResource("telegram://recent-messages");

      expect(JSON.parse(result.contents[0].text)).toEqual(mockMessages);
    });

    it("should return sanitized config", async () => {
      const result = await readResource("telegram://config");

      const config = JSON.parse(result.contents[0].text);
      expect(config.telegram.botToken).toBe("***REDACTED***");
      expect(config.mcp.name).toBe("test-bot");
    });

    it("should throw for unknown resource", async () => {
      await expect(readResource("telegram://unknown")).rejects.toThrow("Unknown resource");
    });
  });
});