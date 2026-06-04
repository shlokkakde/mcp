import "./config.js";

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { closePools } from "./db.js";
import { createCrmMcpServer } from "./mcp-server.js";

const server = createCrmMcpServer();
const transport = new StdioServerTransport();
await server.connect(transport);

process.on("SIGINT", () => {
  closePools()
    .catch(() => undefined)
    .finally(() => process.exit(0));
});
