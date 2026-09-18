import { Telegraf, Context, Markup } from "telegraf";
import { configSchema, type Config } from "./config.js";

export interface TelegramMessage {
  messageId: number;
  chatId: number;
  text: string;
  date: number;
  from?: {
    id: number;
    username?: string;
    firstName?: string;
    lastName?: string;
  };
}

export interface TelegramChat {
  id: number;
  type: "private" | "group" | "supergroup" | "channel";
  title?: string;
  username?: string;
  firstName?: string;
  lastName?: string;
}

export class TelegramBot {
  private bot: Telegraf<Context>;
  private config: Config;
  private messageHandlers: Array<(msg: TelegramMessage) => void> = [];
  private isStarted = false;

  constructor(config: Config) {
    this.config = config;
    this.bot = new Telegraf(config.telegram.botToken);
    this.setupMiddleware();
    this.setupHandlers();
  }

  private setupMiddleware(): void {
    this.bot.use(async (ctx, next) => {
      const chatId = ctx.chat?.id;
      if (chatId && this.config.telegram.allowedChatIds.length > 0) {
        if (!this.config.telegram.allowedChatIds.includes(chatId)) {
          await ctx.reply("This chat is not authorized to use this bot.");
          return;
        }
      }
      await next();
    });
  }

  private setupHandlers(): void {
    this.bot.on("message", (ctx) => {
      const message = this.parseMessage(ctx);
      if (message) {
        this.messageHandlers.forEach((handler) => handler(message));
      }
    });

    this.bot.command("start", (ctx) => {
      ctx.reply("Telegram MCP Bot is running. Use MCP client to interact.");
    });

    this.bot.command("help", (ctx) => {
      ctx.reply(
        "Available commands:\n/start - Start the bot\n/help - Show this help\n/chats - List available chats"
      );
    });

    this.bot.command("chats", async (ctx) => {
      // This would need getChat API calls which require known chat IDs
      ctx.reply("Chat listing requires known chat IDs. Configure ALLOWED_CHAT_IDS in env.");
    });
  }

  private parseMessage(ctx: Context): TelegramMessage | null {
    if (!ctx.message || !("text" in ctx.message)) return null;

    return {
      messageId: ctx.message.message_id,
      chatId: ctx.message.chat.id,
      text: ctx.message.text,
      date: ctx.message.date,
      from: ctx.message.from
        ? {
            id: ctx.message.from.id,
            username: ctx.message.from.username,
            firstName: ctx.message.from.first_name,
            lastName: ctx.message.from.last_name,
          }
        : undefined,
    };
  }

  async start(): Promise<void> {
    if (this.isStarted) return;
    await this.bot.launch();
    this.isStarted = true;
    console.log("Telegram bot started");
  }

  async stop(): Promise<void> {
    if (!this.isStarted) return;
    this.bot.stop();
    this.isStarted = false;
    console.log("Telegram bot stopped");
  }

  async sendMessage(
    chatId: number,
    text: string,
    options?: { parseMode?: "HTML" | "Markdown"; replyMarkup?: any }
  ): Promise<TelegramMessage> {
    const result = await this.bot.telegram.sendMessage(chatId, text, {
      parse_mode: options?.parseMode,
      reply_markup: options?.replyMarkup,
    });
    return this.parseMessageFromApi(result);
  }

  async editMessage(
    chatId: number,
    messageId: number,
    text: string,
    options?: { parseMode?: "HTML" | "Markdown" }
  ): Promise<boolean> {
    try {
      await this.bot.telegram.editMessageText(chatId, messageId, undefined, text, {
        parse_mode: options?.parseMode,
      });
      return true;
    } catch {
      return false;
    }
  }

  async deleteMessage(chatId: number, messageId: number): Promise<boolean> {
    try {
      await this.bot.telegram.deleteMessage(chatId, messageId);
      return true;
    } catch {
      return false;
    }
  }

  async getChat(chatId: number): Promise<TelegramChat | null> {
    try {
      const chat = await this.bot.telegram.getChat(chatId);
      return this.parseChatFromApi(chat);
    } catch {
      return null;
    }
  }

  async getChatMember(chatId: number, userId: number): Promise<any> {
    try {
      return await this.bot.telegram.getChatMember(chatId, userId);
    } catch {
      return null;
    }
  }

  onMessage(handler: (msg: TelegramMessage) => void): () => void {
    this.messageHandlers.push(handler);
    return () => {
      const index = this.messageHandlers.indexOf(handler);
      if (index > -1) this.messageHandlers.splice(index, 1);
    };
  }

  private parseMessageFromApi(msg: any): TelegramMessage {
    return {
      messageId: msg.message_id,
      chatId: msg.chat.id,
      text: msg.text || "",
      date: msg.date,
      from: msg.from
        ? {
            id: msg.from.id,
            username: msg.from.username,
            firstName: msg.from.first_name,
            lastName: msg.from.last_name,
          }
        : undefined,
    };
  }

  private parseChatFromApi(chat: any): TelegramChat {
    return {
      id: chat.id,
      type: chat.type,
      title: chat.title,
      username: chat.username,
      firstName: chat.first_name,
      lastName: chat.last_name,
    };
  }

  getBot(): Telegraf<Context> {
    return this.bot;
  }
}