import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { TelegramBot, TelegramMessage, TelegramChat } from "../src/telegram-bot.js";
import type { Config } from "../src/config.js";

// Mock Telegraf properly
const mockTelegram = {
  sendMessage: vi.fn(),
  editMessageText: vi.fn(),
  deleteMessage: vi.fn(),
  getChat: vi.fn(),
  getChatMember: vi.fn(),
};

let capturedMiddleware: any = null;
let capturedOnMessage: any = null;

const mockBot = {
  telegram: mockTelegram,
  launch: vi.fn().mockResolvedValue(undefined),
  stop: vi.fn(),
  on: vi.fn((event: string, handler: any) => {
    if (event === "message") {
      capturedOnMessage = handler;
    }
    return mockBot;
  }),
  command: vi.fn(),
  use: vi.fn((middleware: any) => {
    capturedMiddleware = middleware;
    return mockBot;
  }),
};

vi.mock("telegraf", () => ({
  Telegraf: vi.fn().mockImplementation(() => mockBot),
  Markup: {},
}));

describe("TelegramBot", () => {
  let bot: TelegramBot;
  let config: Config;

  beforeEach(() => {
    vi.clearAllMocks();
    capturedMiddleware = null;
    capturedOnMessage = null;
    config = {
      telegram: {
        botToken: "test_token",
        allowedChatIds: [123, 456],
      },
      mcp: {
        name: "test-bot",
        version: "1.0.0",
      },
    };
    bot = new TelegramBot(config);
  });

  afterEach(() => {
    vi.resetModules();
  });

  describe("start/stop", () => {
    it("should call launch on start", async () => {
      await bot.start();
      expect(mockBot.launch).toHaveBeenCalledOnce();
    });

    it("should call stop on stop", async () => {
      await bot.start();
      await bot.stop();
      expect(mockBot.stop).toHaveBeenCalledOnce();
    });

    it("should not launch twice", async () => {
      await bot.start();
      await bot.start();
      expect(mockBot.launch).toHaveBeenCalledOnce();
    });
  });

  describe("sendMessage", () => {
    it("should send message and return parsed result", async () => {
      const mockResult = {
        message_id: 1,
        chat: { id: 123 },
        text: "Hello",
        date: Date.now() / 1000,
        from: { id: 1, username: "test", first_name: "Test" },
      };
      mockTelegram.sendMessage.mockResolvedValue(mockResult);

      const result = await bot.sendMessage(123, "Hello");

      expect(mockTelegram.sendMessage).toHaveBeenCalledWith(123, "Hello", {
        parse_mode: undefined,
        reply_markup: undefined,
      });
      expect(result.chatId).toBe(123);
      expect(result.text).toBe("Hello");
      expect(result.messageId).toBe(1);
    });

    it("should pass parseMode and replyMarkup", async () => {
      const mockResult = {
        message_id: 2,
        chat: { id: 123 },
        text: "Hello",
        date: Date.now() / 1000,
      };
      mockTelegram.sendMessage.mockResolvedValue(mockResult);

      await bot.sendMessage(123, "Hello", {
        parseMode: "Markdown",
        replyMarkup: { inline_keyboard: [] },
      });

      expect(mockTelegram.sendMessage).toHaveBeenCalledWith(123, "Hello", {
        parse_mode: "Markdown",
        reply_markup: { inline_keyboard: [] },
      });
    });
  });

  describe("editMessage", () => {
    it("should return true on success", async () => {
      mockTelegram.editMessageText.mockResolvedValue(true);

      const result = await bot.editMessage(123, 1, "Edited");

      expect(result).toBe(true);
      expect(mockTelegram.editMessageText).toHaveBeenCalledWith(123, 1, undefined, "Edited", {
        parse_mode: undefined,
      });
    });

    it("should return false on failure", async () => {
      mockTelegram.editMessageText.mockRejectedValue(new Error("Not found"));

      const result = await bot.editMessage(123, 1, "Edited");

      expect(result).toBe(false);
    });
  });

  describe("deleteMessage", () => {
    it("should return true on success", async () => {
      mockTelegram.deleteMessage.mockResolvedValue(true);

      const result = await bot.deleteMessage(123, 1);

      expect(result).toBe(true);
    });

    it("should return false on failure", async () => {
      mockTelegram.deleteMessage.mockRejectedValue(new Error("Not found"));

      const result = await bot.deleteMessage(123, 1);

      expect(result).toBe(false);
    });
  });

  describe("getChat", () => {
    it("should return parsed chat on success", async () => {
      const mockChat = {
        id: 123,
        type: "private",
        username: "testuser",
        first_name: "Test",
        last_name: "User",
      };
      mockTelegram.getChat.mockResolvedValue(mockChat);

      const result = await bot.getChat(123);

      expect(result).toEqual({
        id: 123,
        type: "private",
        username: "testuser",
        firstName: "Test",
        lastName: "User",
        title: undefined,
      });
    });

    it("should return null on failure", async () => {
      mockTelegram.getChat.mockRejectedValue(new Error("Not found"));

      const result = await bot.getChat(123);

      expect(result).toBeNull();
    });
  });

  describe("onMessage", () => {
    it("should register and call message handler", () => {
      const handler = vi.fn();
      const unsubscribe = bot.onMessage(handler);

      if (capturedOnMessage) {
        const mockCtx = {
          message: {
            message_id: 1,
            chat: { id: 123 },
            text: "Hello",
            date: Date.now() / 1000,
            from: { id: 1, username: "test", first_name: "Test" },
          },
        };
        capturedOnMessage(mockCtx);
      }

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          messageId: 1,
          chatId: 123,
          text: "Hello",
        })
      );

      // Unsubscribe
      unsubscribe();
      if (capturedOnMessage) {
        const mockCtx = {
          message: {
            message_id: 2,
            chat: { id: 123 },
            text: "Hello again",
            date: Date.now() / 1000,
          },
        };
        capturedOnMessage(mockCtx);
      }
      expect(handler).toHaveBeenCalledTimes(1);
    });
  });

  describe("authorization middleware", () => {
    it("should allow messages from allowed chat IDs", async () => {
      expect(capturedMiddleware).toBeDefined();

      const mockCtx = {
        chat: { id: 123 },
        message: {
          message_id: 1,
          chat: { id: 123 },
          text: "Hello",
          date: Date.now() / 1000,
        },
      };
      const next = vi.fn().mockResolvedValue(undefined);

      if (capturedMiddleware) {
        await capturedMiddleware(mockCtx, next);
      }

      expect(next).toHaveBeenCalled();
    });

    it("should block messages from non-allowed chat IDs", async () => {
      expect(capturedMiddleware).toBeDefined();

      const mockCtx = {
        chat: { id: 999 },
        message: {
          message_id: 1,
          chat: { id: 999 },
          text: "Hello",
          date: Date.now() / 1000,
        },
        reply: vi.fn().mockResolvedValue(undefined),
      };
      const next = vi.fn().mockResolvedValue(undefined);

      if (capturedMiddleware) {
        await capturedMiddleware(mockCtx, next);
      }

      expect(mockCtx.reply).toHaveBeenCalledWith("This chat is not authorized to use this bot.");
      expect(next).not.toHaveBeenCalled();
    });
  });
});