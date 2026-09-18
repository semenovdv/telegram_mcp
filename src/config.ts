import { z } from "zod";

export const configSchema = z.object({
  telegram: z.object({
    botToken: z.string().min(1, "TELEGRAM_BOT_TOKEN is required"),
    allowedChatIds: z.array(z.number()).optional().default([]),
  }),
  mcp: z.object({
    name: z.string().default("telegram-mcp"),
    version: z.string().default("1.0.0"),
  }),
});

export type Config = z.infer<typeof configSchema>;

export function loadConfig(): Config {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    throw new Error("TELEGRAM_BOT_TOKEN environment variable is required");
  }

  const allowedChatIds = process.env.ALLOWED_CHAT_IDS
    ? process.env.ALLOWED_CHAT_IDS.split(",").map((id) => parseInt(id.trim(), 10))
    : [];

  return configSchema.parse({
    telegram: {
      botToken,
      allowedChatIds,
    },
    mcp: {
      name: process.env.MCP_NAME || "telegram-mcp",
      version: process.env.MCP_VERSION || "1.0.0",
    },
  });
}