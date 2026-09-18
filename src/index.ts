import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { TelegramBot, TelegramMessage, TelegramChat } from "./telegram-bot.js";
import { loadConfig } from "./config.js";
import { z } from "zod";

const SendMessageSchema = z.object({
  chatId: z.number().describe("Target chat ID"),
  text: z.string().describe("Message text to send"),
  parseMode: z.enum(["HTML", "Markdown"]).optional().describe("Parse mode for formatting"),
});

const EditMessageSchema = z.object({
  chatId: z.number().describe("Target chat ID"),
  messageId: z.number().describe("Message ID to edit"),
  text: z.string().describe("New message text"),
  parseMode: z.enum(["HTML", "Markdown"]).optional().describe("Parse mode for formatting"),
});

const DeleteMessageSchema = z.object({
  chatId: z.number().describe("Target chat ID"),
  messageId: z.number().describe("Message ID to delete"),
});

const GetChatSchema = z.object({
  chatId: z.number().describe("Chat ID to retrieve"),
});

const ListChatsSchema = z.object({});

export class TelegramMcpServer {
  private server: Server;
  private telegramBot: TelegramBot;
  private config = loadConfig();
  private recentMessages: TelegramMessage[] = [];
  private maxRecentMessages = 100;

  constructor() {
    this.telegramBot = new TelegramBot(this.config);
    this.server = new Server(
      {
        name: this.config.mcp.name,
        version: this.config.mcp.version,
      },
      {
        capabilities: {
          tools: {},
          resources: {},
        },
      }
    );

    this.setupToolHandlers();
    this.setupResourceHandlers();
    this.setupMessageListener();
  }

  private setupMessageListener(): void {
    this.telegramBot.onMessage((msg) => {
      this.recentMessages.unshift(msg);
      if (this.recentMessages.length > this.maxRecentMessages) {
        this.recentMessages.pop();
      }
    });
  }

  private setupToolHandlers(): void {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: "send_message",
          description: "Send a message to a Telegram chat",
          inputSchema: {
            type: "object",
            properties: {
              chatId: { type: "number", description: "Target chat ID" },
              text: { type: "string", description: "Message text to send" },
              parseMode: { type: "string", enum: ["HTML", "Markdown"], description: "Parse mode for formatting" },
            },
            required: ["chatId", "text"],
          },
        },
        {
          name: "edit_message",
          description: "Edit an existing message in a Telegram chat",
          inputSchema: {
            type: "object",
            properties: {
              chatId: { type: "number", description: "Target chat ID" },
              messageId: { type: "number", description: "Message ID to edit" },
              text: { type: "string", description: "New message text" },
              parseMode: { type: "string", enum: ["HTML", "Markdown"], description: "Parse mode for formatting" },
            },
            required: ["chatId", "messageId", "text"],
          },
        },
        {
          name: "delete_message",
          description: "Delete a message from a Telegram chat",
          inputSchema: {
            type: "object",
            properties: {
              chatId: { type: "number", description: "Target chat ID" },
              messageId: { type: "number", description: "Message ID to delete" },
            },
            required: ["chatId", "messageId"],
          },
        },
        {
          name: "get_chat",
          description: "Get information about a Telegram chat",
          inputSchema: {
            type: "object",
            properties: {
              chatId: { type: "number", description: "Chat ID to retrieve" },
            },
            required: ["chatId"],
          },
        },
        {
          name: "list_recent_messages",
          description: "List recent messages received by the bot",
          inputSchema: {
            type: "object",
            properties: {
              limit: { type: "number", description: "Maximum number of messages to return", default: 20 },
            },
          },
        },
      ],
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case "send_message": {
            const parsed = SendMessageSchema.parse(args);
            const result = await this.telegramBot.sendMessage(
              parsed.chatId,
              parsed.text,
              { parseMode: parsed.parseMode }
            );
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(result, null, 2),
                },
              ],
            };
          }

          case "edit_message": {
            const parsed = EditMessageSchema.parse(args);
            const success = await this.telegramBot.editMessage(
              parsed.chatId,
              parsed.messageId,
              parsed.text,
              { parseMode: parsed.parseMode }
            );
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify({ success }, null, 2),
                },
              ],
            };
          }

          case "delete_message": {
            const parsed = DeleteMessageSchema.parse(args);
            const success = await this.telegramBot.deleteMessage(parsed.chatId, parsed.messageId);
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify({ success }, null, 2),
                },
              ],
            };
          }

          case "get_chat": {
            const parsed = GetChatSchema.parse(args);
            const chat = await this.telegramBot.getChat(parsed.chatId);
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(chat, null, 2),
                },
              ],
            };
          }

          case "list_recent_messages": {
            const limit = (args as any)?.limit || 20;
            const messages = this.recentMessages.slice(0, limit);
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(messages, null, 2),
                },
              ],
            };
          }

          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    });
  }

  private setupResourceHandlers(): void {
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => ({
      resources: [
        {
          uri: "telegram://recent-messages",
          name: "Recent Messages",
          description: "Recent messages received by the bot",
          mimeType: "application/json",
        },
        {
          uri: "telegram://config",
          name: "Bot Configuration",
          description: "Current bot configuration (sanitized)",
          mimeType: "application/json",
        },
      ],
    }));

    this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const { uri } = request.params;

      switch (uri) {
        case "telegram://recent-messages": {
          return {
            contents: [
              {
                uri,
                mimeType: "application/json",
                text: JSON.stringify(this.recentMessages, null, 2),
              },
            ],
          };
        }

        case "telegram://config": {
          const sanitizedConfig = {
            mcp: this.config.mcp,
            telegram: {
              botToken: "***REDACTED***",
              allowedChatIds: this.config.telegram.allowedChatIds,
            },
          };
          return {
            contents: [
              {
                uri,
                mimeType: "application/json",
                text: JSON.stringify(sanitizedConfig, null, 2),
              },
            ],
          };
        }

        default:
          throw new Error(`Unknown resource: ${uri}`);
      }
    });
  }

  async start(): Promise<void> {
    await this.telegramBot.start();
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("Telegram MCP Server running on stdio");
  }

  async stop(): Promise<void> {
    await this.telegramBot.stop();
    await this.server.close();
  }
}