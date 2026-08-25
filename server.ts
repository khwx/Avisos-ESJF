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
  try {
    const avisos = await getAvisos();
    res.json(avisos);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch avisos" });
  }
});

app.get("/api/rss", async (req, res) => {
  try {
    const feed = await generateRSS();
    res.type('application/xml');
    res.send(feed.rss2());
  } catch (error) {
    res.status(500).json({ error: "Failed to generate RSS" });
  }
});

app.get("/api/atom", async (req, res) => {
  try {
    const feed = await generateRSS();
    res.type('application/atom+xml');
    res.send(feed.atom1());
  } catch (error) {
    res.status(500).json({ error: "Failed to generate Atom" });
  }
});

const distPath = path.join(process.cwd(), 'dist');
app.use(express.static(distPath));
app.get('*', (req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

if (process.env.NODE_ENV !== "production" && !process.env.VERCEL) {
  async function startDevServer() {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);

    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Server running on port ${PORT}`);
    });
  }
  startDevServer();
}

export default app;
