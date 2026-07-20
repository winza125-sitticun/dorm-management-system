import "dotenv/config";
import express from "express";
import cookieParser from "cookie-parser";
import path from "path";
import { fileURLToPath } from "url";

import authRoutes from "./routes/auth";
import roomRoutes from "./routes/rooms";
import billRoutes from "./routes/bills";
import settingsRoutes from "./routes/settings";
import userRoutes from "./routes/users";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isDev = process.env.NODE_ENV !== "production";
const PORT = Number(process.env.PORT) || 3000;

async function main() {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());

  app.use("/api/auth", authRoutes);
  app.use("/api/rooms", roomRoutes);
  app.use("/api/bills", billRoutes);
  app.use("/api/settings", settingsRoutes);
  app.use("/api/users", userRoutes);

  if (isDev) {
    // Dev mode: Vite runs as Express middleware, so one server handles both
    // the API and hot-reloading React frontend.
    const { createServer } = await import("vite");
    const vite = await createServer({
      server: { middlewareMode: true },
      appType: "custom",
      root: path.resolve(__dirname, ".."),
    });
    app.use(vite.middlewares);

    app.use("*", async (req, res, next) => {
      try {
        const fs = await import("fs/promises");
        const indexPath = path.resolve(__dirname, "../index.html");
        let html = await fs.readFile(indexPath, "utf-8");
        html = await vite.transformIndexHtml(req.originalUrl, html);
        res.status(200).set({ "Content-Type": "text/html" }).end(html);
      } catch (e) {
        vite.ssrFixStacktrace(e as Error);
        next(e);
      }
    });
  } else {
    // Production: serve the pre-built static frontend from `npm run build`.
    const distPath = path.resolve(__dirname, "../dist/client");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, () => {
    console.log(`✓ Dormitory management server running at http://localhost:${PORT}`);
  });
}

main().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
