import express from "express";
import fetch from "node-fetch";

const app = express();
app.use(express.json());

/* ============================================================
   🔍 FULL REQUEST LOGGER — shows EXACT URL, method, headers
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
   🔑 ENVIRONMENT VARIABLES
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
      description: "Retrieve details for a specific YouTube video ID.",
      input_schema: {
        type: "object",
        properties: { videoId: { type: "string" } },
        required: ["videoId"]
      }
    }
  ]
};

/* ============================================================
   🔓 AUTH MIDDLEWARE — manifest routes must be PUBLIC
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
  if (openPaths.includes(req.path)) {
    return next();
  }

  const auth = req.headers.authorization;
  if (!auth || auth !== `Bearer ${AUTH_SECRET}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  next();
});

/* ============================================================
   📣 MCP DISCOVERY ROUTES — PMG requires POST /mcp
   ============================================================ */

// PMG MAIN DISCOVERY ROUTE
app.post("/mcp", (req, res) => {
  res.json(manifest);
});

// PMG sometimes POSTs to these:
app.post("/mcp/", (req, res) => {
  res.json(manifest);
});

app.post("/mcp/manifest", (req, res) => {
  res.json(manifest);
});

app.post("/mcp/manifest.json", (req, res) => {
  res.json(manifest);
});

// GET versions for browser/manual testing
app.get("/mcp", (req, res) => res.json(manifest));
app.get("/mcp/", (req, res) => res.json(manifest));
app.get("/mcp/manifest", (req, res) => res.json(manifest));
app.get("/mcp/manifest.json", (req, res) => res.json(manifact));

/* ============================================================
   🌐 BROWSER-FRIENDLY MANIFEST ROUTES
   ============================================================ */
app.get("/manifest.json", (req, res) => res.json(manifest));
app.get("/manifest", (req, res) => res.json(manifest));

/* ============================================================
   🔧 YOUTUBE SEARCH TOOL (protected)
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
    res.status(500).json({
      error: "YouTube search failed",
      details: err.message
    });
  }
});

/* ============================================================
   🔧 YOUTUBE GET VIDEO TOOL (protected)
   ============================================================ */
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
    res.status(500).json({
      error: "YouTube video lookup failed",
      details: err.message
    });
  }
});

/* ============================================================
   🛑 FINAL CATCH-ALL (GET) — return manifest
   ============================================================ */
app.get("*", (req, res) => {
  res.json(manifest);
});

/* ============================================================
   🚀 START SERVER
   ============================================================ */
app.listen(3000, () => {
  console.log("🚀 YouTube MCP server is running on port 3000");
});
