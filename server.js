import express from "express";
import fetch from "node-fetch";

const app = express();
app.use(express.json());

/* ============================================================
   🔍 FULL REQUEST LOGGER
   ============================================================ */
app.use((req, res, next) => {
  console.log(">>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>");
  console.log("🟦 NEW REQUEST RECEIVED");
  console.log("Method:", req.method);
  console.log("Original URL:", req.originalUrl);
  console.log("Path:", req.path);
  console.log("Headers:", req.headers);
  console.log("Body:", req.body);
  console.log("<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<");
  next();
});

/* ============================================================
   🔑 ENVIRONMENT VARS
   ============================================================ */
const API_KEY = process.env.YOUTUBE_API_KEY;
const AUTH_SECRET = process.env.MCP_AUTH_TOKEN;

/* ============================================================
   📦 MCP MANIFEST
   ============================================================ */
const manifest = {
  version: "1.0.0",
  tools: [
    {
      name: "youtube_search",
      description: "Search YouTube for videos.",
      input_schema: {
        type: "object",
        properties: {
          query: { type: "string" },
          maxResults: { type: "number" }
        },
        required: ["query"]
      }
    },
    {
      name: "youtube_get_video",
      description: "Retrieve details for a YouTube video ID.",
      input_schema: {
        type: "object",
        properties: { videoId: { type: "string" } },
        required: ["videoId"]
      }
    }
  ]
};

/* ============================================================
   🔓 AUTH MIDDLEWARE — manifest routes are PUBLIC
   ============================================================ */
const openPaths = [
  "/manifest.json",
  "/manifest",
  "/mcp",
  "/mcp/",
  "/mcp/manifest",
  "/mcp/manifest.json"
];

app.use((req, res, next) => {
  if (openPaths.includes(req.path)) return next();

  const auth = req.headers.authorization;
  if (!auth || auth !== `Bearer ${AUTH_SECRET}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  next();
});

/* ============================================================
   ⭐ JSON-RPC 2.0 HANDLER FOR MCP DISCOVERY
   ============================================================ */
app.post("/mcp", (req, res) => {
  const { id, jsonrpc, method } = req.body;

  // JSON-RPC MUST HAVE jsonrpc + id
  if (jsonrpc !== "2.0" || !id) {
    return res.status(400).json({
      jsonrpc: "2.0",
      id: id || null,
      error: { code: -32600, message: "Invalid Request" }
    });
  }

  return res.json({
    jsonrpc: "2.0",
    id,
    result: {
      manifest
    }
  });
});

// fallback POSTs
app.post("/mcp/manifest", (req, res) => {
  const { id } = req.body;
  res.json({ jsonrpc: "2.0", id, result: { manifest } });
});

app.post("/mcp/manifest.json", (req, res) => {
  const { id } = req.body;
  res.json({ jsonrpc: "2.0", id, result: { manifest } });
});

/* ============================================================
   GET routes (browser-friendly)
   ============================================================ */
app.get("/mcp", (req, res) => res.json(manifest));
app.get("/mcp/", (req, res) => res.json(manifest));
app.get("/mcp/manifest", (req, res) => res.json(manifest));
app.get("/mcp/manifest.json", (req, res) => res.json(manifest));

app.get("/manifest.json", (req, res) => res.json(manifest));
app.get("/manifest", (req, res) => res.json(manifest));

/* ============================================================
   🔧 YouTube Tool Endpoints (stay same)
   ============================================================ */

app.post("/youtube/search", async (req, res) => {
  const { query, maxResults = 10 } = req.body;

  const url =
    `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video` +
    `&maxResults=${maxResults}&q=${encodeURIComponent(query)}` +
    `&key=${API_KEY}`;

  try {
    const response = await fetch(url);
    const data = await response.json();
    res.json(data.items || []);
  } catch (err) {
    res.status(500).json({ error: "YouTube search failed", details: err.message });
  }
});

app.post("/youtube/get", async (req, res) => {
  const { videoId } = req.body;

  const url =
    `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails,player` +
    `&id=${videoId}&key=${API_KEY}`;

  try {
    const response = await fetch(url);
    const data = await response.json();
    res.json(data.items?.[0] || {});
  } catch (err) {
    res.status(500).json({ error: "YouTube video lookup failed", details: err.message });
  }
});

/* ============================================================
   🛑 Catch-all GET fallback
   ============================================================ */
app.get("*", (req, res) => {
  res.json(manifest);
});

/* ============================================================
   🚀 START SERVER
   ============================================================ */
app.listen(3000, () => {
  console.log("🚀 JSON-RPC compliant YouTube MCP server running on port 3000");
});
