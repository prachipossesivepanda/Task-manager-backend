require("dotenv/config");
const cors = require("cors");
const express = require("express");

const { connectDb } = require("./lib/db");

const authRoutes = require("./routes/auth");
const projectRoutes = require("./routes/projects");
const dashboardRoutes = require("./routes/dashboard");

const app = express();

const port = process.env.PORT || 8000;

const allowedOrigins = [
  "http://localhost:5173",
  "https://task-manager-frontend-six-blush.vercel.app",
];

app.use(
  cors()
);

app.use(express.json({ limit: "1mb" }));

app.get("/", (_req, res) => {
  res.send("Backend running successfully");
});

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.use("/api/auth", authRoutes);
app.use("/api/projects", projectRoutes);
app.use("/api/dashboard", dashboardRoutes);

app.use((_req, res) => {
  res.status(404).json({ error: "Not found" });
});

app.use((err, _req, res, _next) => {
  console.error(err);

  res.status(500).json({
    error: "Internal server error",
  });
});

connectDb()
  .then(() => {
    app.listen(port, "0.0.0.0", () => {
      console.log(`API listening on port ${port}`);
    });
  })
  .catch((error) => {
    console.error("Failed to connect to MongoDB", error);
    process.exit(1);
  });