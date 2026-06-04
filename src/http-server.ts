import "./config.js";

import { httpPort, publicBaseUrl } from "./config.js";
import { closePools } from "./db.js";
import app from "./web-app.js";

app.listen(httpPort, () => {
  console.log(`CRM MCP HTTP server listening on ${publicBaseUrl}`);
  console.log(`MCP endpoint: ${publicBaseUrl}/mcp`);
  console.log(`Login page: ${publicBaseUrl}/login`);
});

process.on("SIGINT", () => {
  closePools()
    .catch(() => undefined)
    .finally(() => process.exit(0));
});
