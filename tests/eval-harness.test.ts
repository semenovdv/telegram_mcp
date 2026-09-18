import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock dependencies BEFORE importing
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

interface EvalCase {
  name: string;
  tool: string;
  input: Record<string, any>;
  expectedOutput?: (result: any) => boolean;
  expectedError?: boolean;
}

interface EvalResult {
  case: EvalCase;
  passed: boolean;
  actualOutput: any;
  error?: string;
  latencyMs: number;
}

class EvalHarness {
  private server: TelegramMcpServer;
  private mockBot: ReturnType<typeof TelegramBot>;
  private results: EvalResult[] = [];

  constructor() {
    this.server = new TelegramMcpServer();
    this.mockBot = (this.server as any).telegramBot;
  }

  private getHandler(method: string) {
    const handlers = (this.server as any).server._requestHandlers;
    if (!handlers) throw new Error("No request handlers found");
    const handler = handlers.get(method);
    if (!handler) throw new Error(`Handler for ${method} not found`);
    return handler;
  }

  private makeRequest(method: string, params: Record<string, any> = {}) {
    return {
      jsonrpc: "2.0",
      id: 1,
      method,
      params,
    };
  }

  async runEval(cases: EvalCase[]): Promise<EvalResult[]> {
    this.results = [];

    for (const testCase of cases) {
      const startTime = Date.now();
      let result: EvalResult;

      try {
        const handler = this.getHandler("tools/call");
        const output = await handler(this.makeRequest("tools/call", { name: testCase.tool, arguments: testCase.input }));

        const passed = testCase.expectedOutput
          ? testCase.expectedOutput(output)
          : !testCase.expectedError;

        result = {
          case: testCase,
          passed,
          actualOutput: output,
          latencyMs: Date.now() - startTime,
        };
      } catch (error) {
        const passed = testCase.expectedError === true;
        result = {
          case: testCase,
          passed,
          actualOutput: null,
          error: error instanceof Error ? error.message : String(error),
          latencyMs: Date.now() - startTime,
        };
      }

      this.results.push(result);
    }

    return this.results;
  }

  getSummary(): { total: number; passed: number; failed: number; avgLatencyMs: number } {
    const total = this.results.length;
    const passed = this.results.filter((r) => r.passed).length;
    const failed = total - passed;
    const avgLatencyMs = this.results.reduce((sum, r) => sum + r.latencyMs, 0) / total || 0;

    return { total, passed, failed, avgLatencyMs };
  }

  printResults(): void {
    console.log("\n=== Eval Results ===");
    for (const result of this.results) {
      const status = result.passed ? "✅ PASS" : "❌ FAIL";
      console.log(`${status} ${result.case.name} (${result.latencyMs}ms)`);
      if (!result.passed) {
        console.log(`  Expected: ${result.case.expectedError ? "error" : "success"}`);
        console.log(`  Actual: ${result.error || JSON.stringify(result.actualOutput).slice(0, 100)}`);
      }
    }

    const summary = this.getSummary();
    console.log(`\nTotal: ${summary.total}, Passed: ${summary.passed}, Failed: ${summary.failed}`);
    console.log(`Avg Latency: ${summary.avgLatencyMs.toFixed(2)}ms`);
  }
}

describe("Eval Harness", () => {
  let harness: EvalHarness;

  beforeEach(() => {
    vi.clearAllMocks();
    harness = new EvalHarness();
  });

  afterEach(() => {
    vi.resetModules();
  });

  const evalCases: EvalCase[] = [
    {
      name: "send_message - basic",
      tool: "send_message",
      input: { chatId: 123, text: "Hello, world!" },
      expectedOutput: (result) => {
        const data = JSON.parse(result.content[0].text);
        return data.chatId === 123 && data.text === "Hello, world!";
      },
    },
    {
      name: "send_message - with markdown",
      tool: "send_message",
      input: { chatId: 123, text: "**Bold** text", parseMode: "Markdown" },
      expectedOutput: (result) => {
        const data = JSON.parse(result.content[0].text);
        return data.text === "**Bold** text";
      },
    },
    {
      name: "edit_message - success",
      tool: "edit_message",
      input: { chatId: 123, messageId: 1, text: "Updated text" },
      expectedOutput: (result) => JSON.parse(result.content[0].text).success === true,
    },
    {
      name: "delete_message - success",
      tool: "delete_message",
      input: { chatId: 123, messageId: 1 },
      expectedOutput: (result) => JSON.parse(result.content[0].text).success === true,
    },
    {
      name: "get_chat - returns chat info",
      tool: "get_chat",
      input: { chatId: 123 },
      expectedOutput: (result) => {
        const data = JSON.parse(result.content[0].text);
        return data.id === 123 && data.type === "private";
      },
    },
    {
      name: "list_recent_messages - default limit",
      tool: "list_recent_messages",
      input: {},
      expectedOutput: (result) => {
        const data = JSON.parse(result.content[0].text);
        return Array.isArray(data) && data.length <= 20;
      },
    },
    {
      name: "list_recent_messages - custom limit",
      tool: "list_recent_messages",
      input: { limit: 5 },
      expectedOutput: (result) => {
        const data = JSON.parse(result.content[0].text);
        return Array.isArray(data) && data.length <= 5;
      },
    },
  ];

  it("should run all eval cases", async () => {
    const mockBot = (harness as any).mockBot;
    mockBot.sendMessage.mockImplementation(async (chatId: number, text: string) => ({
      messageId: 1,
      chatId,
      text,
      date: Date.now() / 1000,
    }));
    mockBot.editMessage.mockResolvedValue(true);
    mockBot.deleteMessage.mockResolvedValue(true);
    mockBot.getChat.mockResolvedValue({ id: 123, type: "private", username: "test" });
    (harness as any).server.recentMessages = [
      { messageId: 1, chatId: 123, text: "Msg 1", date: Date.now() / 1000 },
      { messageId: 2, chatId: 123, text: "Msg 2", date: Date.now() / 1000 },
    ];

    const results = await harness.runEval(evalCases);
    harness.printResults();

    const summary = harness.getSummary();
    expect(summary.failed).toBe(0);
  });
});