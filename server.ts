import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '50mb' }));

  // Provide non-sensitive but environment-specific config
  app.get("/api/config", (req, res) => {
    const clientId = process.env.GOOGLE_CLIENT_ID || process.env.VITE_GOOGLE_CLIENT_ID;
    if (!clientId) {
      console.error("WARNING: GOOGLE_CLIENT_ID is missing in environment variables!");
    } else {
      console.log("GOOGLE_CLIENT_ID loaded successfully.");
    }
    res.json({
      googleClientId: clientId || null,
    });
  });

  // API Routes - Proxying Google APIs to keep logic on server
  app.post("/api/google-proxy", async (req, res) => {
    const { url, method, headers, body } = req.body;
    const accessToken = req.headers.authorization;

    if (!accessToken) {
      return res.status(401).json({ error: "Missing authorization header" });
    }

    try {
      const response = await fetch(url, {
        method: method || 'GET',
        headers: {
          ...headers,
          'Authorization': accessToken,
          // 'x-goog-api-key': process.env.GOOGLE_API_KEY, // Example of how to add a server-side key
        },
        body: body ? JSON.stringify(body) : undefined,
      });

      const data = await response.json();
      res.status(response.status).json(data);
    } catch (error) {
      console.error("Proxy error:", error);
      res.status(500).json({ error: "Failed to proxy request" });
    }
  });

  // Specifically for Drive multi-part upload which is complex with generic proxy
  app.post("/api/google-upload", async (req, res) => {
    // Multi-part uploads are better handled with a specific route if needed,
    // but for now, we'll see if the generic proxy works or if we should stick to client for files.
    // Client-side file upload to Drive is generally okay as it uses the user's token directly.
    res.status(501).json({ error: "Not implemented. Use client-side for file uploads or specific handler." });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
