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
const tools = [
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
      properties: {
        videoId: { type: "string" }
      },
      required: ["videoId"]
    }
  }
];

/* ============================================================
   🔓 AUTH MIDDLEWARE — manifest & JSON-RPC open
   ============================================================ */
const openPaths = ["/mcp", "/mcp/", "/manifest.json", "/manifest"];

app.use((req, res, next) => {
  if (openPaths.includes(req.path)) return next();

  const auth = req.headers.authorization;
  if (!auth || auth !== `Bearer ${AUTH_SECRET}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  next();
});

/* ============================================================
   ⭐ JSON-RPC HANDLER (MCP STANDARD)
   ============================================================ */
app.post("/mcp", async (req, res) => {
  const { id, jsonrpc, method, params } = req.body;

  if (jsonrpc !== "2.0" || !id) {
    return res.json({
      jsonrpc: "2.0",
      id: id || null,
      error: { code: -32600, message: "Invalid Request" }
    });
  }

  // 🔧 PMG calling: tools/list
  if (method === "tools/list") {
    return res.json({
      jsonrpc: "2.0",
      id,
      result: { tools }
    });
  }

  // 🔧 PMG calling: tools/call
  if (method === "tools/call") {
    const { name, arguments: args } = params;

    if (name === "youtube_search") {
      const searchRes = await youtubeSearch(args.query, args.maxResults);
      return res.json({ jsonrpc: "2.0", id, result: searchRes });
    }

    if (name === "youtube_get_video") {
      const vidRes = await youtubeGetVideo(args.videoId);
      return res.json({ jsonrpc: "2.0", id, result: vidRes });
    }

    return res.json({
      jsonrpc: "2.0",
      id,
      error: { code: -32601, message: "Unknown tool" }
    });
  }

  // unknown method
  return res.json({
    jsonrpc: "2.0",
    id,
    error: { code: -32601, message: `Unknown method ${method}` }
  });
});

/* ============================================================
   🔧 TOOL FUNCTIONS
   ============================================================ */
async function youtubeSearch(query, maxResults = 10) {
  const url =
    `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video` +
    `&maxResults=${maxResults}&q=${encodeURIComponent(query)}` +
    `&key=${API_KEY}`;

  const response = await fetch(url);
  const data = await response.json();
  return data.items || [];
}

async function youtubeGetVideo(videoId) {
  const url =
    `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails,player` +
    `&id=${videoId}&key=${API_KEY}`;

  const response = await fetch(url);
  const data = await response.json();
  return data.items?.[0] || null;
}

/* ============================================================
   🌐 GET manifest for browser/debugging
   ============================================================ */
app.get("/manifest.json", (req, res) => res.json({ tools }));
app.get("/mcp", (req, res) =>
  res.json({ note: "Use POST /mcp with JSON-RPC 2.0" })
);

/* ============================================================
   🚀 START SERVER
   ============================================================ */
app.listen(3000, () => {
  console.log("🚀 MCP JSON-RPC server running on port 3000");
});
