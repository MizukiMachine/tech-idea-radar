import express from "express";
import healthRouter from "./routes/health";
import aiRouter from "./routes/ai";

const app = express();

app.disable("x-powered-by");
app.use(express.json());

app.get("/", (_req, res) => {
  res.json({ message: "Startup Agent Chain backend service" });
});

app.use("/health", healthRouter);
app.use("/api/ai", aiRouter);

export default app;
