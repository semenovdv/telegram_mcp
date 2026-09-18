# Telegram MCP Server

An MCP (Model Context Protocol) server that provides Telegram integration for AI assistants.

## Features

- Send messages to Telegram chats
- Edit and delete messages
- Get chat information
- List recent messages received by the bot
- Resource access for recent messages and configuration

## Setup

### 1. Create a Telegram Bot

1. Message [@BotFather](https://t.me/BotFather) on Telegram
2. Send `/newbot` and follow the instructions
3. Save the bot token

### 2. Configure Environment

```bash
cp .env.example .env
# Edit .env with your bot token
```

### 3. Install Dependencies

```bash
npm install
```

### 4. Build

```bash
npm run build
```

### 5. Run

```bash
npm start
```

Or for development:

```bash
npm run dev
```

## Usage with MCP Client

Add to your MCP client configuration:

```json
{
  "mcpServers": {
    "telegram": {
      "command": "node",
      "args": ["/path/to/mcp-telegram-server/dist/main.js"],
      "env": {
        "TELEGRAM_BOT_TOKEN": "your_bot_token",
        "ALLOWED_CHAT_IDS": "123456789,-987654321"
      }
    }
  }
}
```

## Available Tools

| Tool | Description |
|------|-------------|
| `send_message` | Send a message to a chat |
| `edit_message` | Edit an existing message |
| `delete_message` | Delete a message |
| `get_chat` | Get chat information |
| `list_recent_messages` | List recent messages |

## Available Resources

| URI | Description |
|-----|-------------|
| `telegram://recent-messages` | Recent messages received |
| `telegram://config` | Bot configuration (sanitized) |

## Security

- Set `ALLOWED_CHAT_IDS` to restrict which chats can use the bot
- Never commit your `.env` file or bot token
- The bot token is redacted in the config resource

## License

MIT