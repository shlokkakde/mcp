import express from "express";

import app from "./web-app.js";

// Vercel's Express detector expects the entrypoint itself to import express.
void express;

export default app;
