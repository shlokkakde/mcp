import type { IncomingMessage, ServerResponse } from "node:http";

import app from "./web-app.js";

type VercelRequest = IncomingMessage & {
  url?: string;
};

function stripApiPrefix(url = "/"): string {
  if (url === "/api") {
    return "/";
  }
  if (url.startsWith("/api/")) {
    return url.slice("/api".length) || "/";
  }
  return url;
}

export default function handler(req: VercelRequest, res: ServerResponse): void {
  req.url = stripApiPrefix(req.url);
  app(req, res);
}
