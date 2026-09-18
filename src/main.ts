import { TelegramMcpServer } from "./index.js";

const server = new TelegramMcpServer();

async function main() {
  try {
    await server.start();
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
}

process.on("SIGINT", async () => {
  console.error("Shutting down...");
  await server.stop();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  console.error("Shutting down...");
  await server.stop();
  process.exit(0);
});

main();