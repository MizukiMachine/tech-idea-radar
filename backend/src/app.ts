import express, { type Request, type Response } from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import fs from "node:fs";
import path from "node:path";
import healthRouter from "./routes/health";
import aiRouter from "./routes/ai";

const app = express();
const isProduction = process.env.NODE_ENV === "production";

function parseTrustProxy(value: string): boolean | number | string {
  const normalized = value.trim().toLowerCase();
  if (normalized === "true") return 1;
  if (normalized === "false") return false;

  const numericValue = Number(normalized);
  if (Number.isInteger(numericValue) && numericValue >= 0) {
    return numericValue;
  }

  return value.trim();
}

const trustProxy = process.env.TRUST_PROXY?.trim();
if (trustProxy) {
  app.set("trust proxy", parseTrustProxy(trustProxy));
} else if (isProduction) {
  app.set("trust proxy", 1);
}

// --- Security headers (CSP disabled for SPA compatibility) ---
app.use(helmet({ contentSecurityPolicy: false }));

// --- Rate limiting (gentle, mainly anti-scraping) ---
app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (_req) => isProduction && _req.header("authorization") !== undefined,
}));

// --- CORS ---
const allowedOrigins = (process.env.CORS_ORIGIN ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
const frontendDistDir = process.env.FRONTEND_DIST_DIR?.trim() ?? "";

if (isProduction && allowedOrigins.length === 0) {
  console.warn("=".repeat(60));
  console.warn("[CORS] ⚠  SECURITY WARNING ⚠");
  console.warn("[CORS] CORS_ORIGIN is not set in production.");
  console.warn("[CORS] All origins are allowed — this is insecure.");
  console.warn("[CORS] Set CORS_ORIGIN to your domain(s), e.g.:");
  console.warn("[CORS]   CORS_ORIGIN=https://your-domain.com");
  console.warn("=".repeat(60));
}
app.use(allowedOrigins.length > 0 ? cors({ origin: allowedOrigins }) : cors());
app.use(express.json({ limit: "1mb" }));

function addCorsWarningHeader(res: Response): void {
  if (isProduction && allowedOrigins.length === 0) {
    res.setHeader("X-CORS-Warning", "CORS_ORIGIN is not configured; all origins are allowed. Set CORS_ORIGIN environment variable.");
  }
}

app.use((_req, res, next) => {
  addCorsWarningHeader(res);
  next();
});

function sendServiceInfo(_req: Request, res: Response): void {
  res.json({ message: "Lume backend service" });
}

app.use("/health", healthRouter);
app.use("/api", (req, res, next) => {
  if (process.env.BAC_REQUIRE_DEV_STACK_HEADER !== "true") {
    next();
    return;
  }

  const expectedStackId = process.env.BAC_DEV_STACK_ID;
  const actualStackId = req.header("X-BAC-Dev-Stack-Id");
  if (expectedStackId && actualStackId === expectedStackId) {
    next();
    return;
  }

  res.status(409).json({
    error: "DEV_STACK_MISMATCH",
    message: "This backend only accepts API requests through the matching local Vite dev stack.",
    expectedDevStackId: expectedStackId ?? null,
    receivedDevStackId: actualStackId ?? null,
  });
});
app.use("/api/ai", aiRouter);

if (frontendDistDir) {
  const indexHtml = path.join(frontendDistDir, "index.html");
  if (fs.existsSync(indexHtml)) {
    app.use(express.static(frontendDistDir, { index: false }));
    app.get("*", (req, res, next) => {
      if (
        req.path === "/api"
        || req.path.startsWith("/api/")
        || req.path === "/health"
        || req.path.startsWith("/health/")
      ) {
        next();
        return;
      }
      if (path.extname(req.path)) {
        next();
        return;
      }
      res.sendFile(indexHtml);
    });
  } else {
    console.warn(`[Frontend] FRONTEND_DIST_DIR is set but index.html was not found: ${indexHtml}`);
    app.get("/", sendServiceInfo);
  }
} else {
  app.get("/", sendServiceInfo);
}

export default app;
