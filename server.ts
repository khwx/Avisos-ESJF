import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import cors from "cors";
import { getAvisos, generateRSS } from "./src/lib/scraper";

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(cors());
app.use(express.json());

// API Routes
app.get("/api/avisos", async (req, res) => {
  const avisos = await getAvisos();
  res.json(avisos);
});

app.get("/api/rss", async (req, res) => {
  const feed = await generateRSS();
  res.type('application/xml');
  res.send(feed.rss2());
});

app.get("/api/atom", async (req, res) => {
  const feed = await generateRSS();
  res.type('application/atom+xml');
  res.send(feed.atom1());
});

if (process.env.NODE_ENV !== "production" && !process.env.VERCEL) {
  async function startServer() {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);

    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Server running on port ${PORT}`);
    });
  }
  startServer();
} else {
  const distPath = path.join(process.cwd(), 'dist');
  app.use(express.static(distPath));
  app.get('*', (req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });

  if (!process.env.VERCEL) {
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Server running on port ${PORT}`);
    });
  }
}

export default app;
