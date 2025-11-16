import express from "express";
import fetch from "node-fetch";

const app = express();
app.use(express.json());

/* ============================================================
   🔍 FULL REQUEST LOGGER
   ============================================================ */
app.use((req, res, next) => {
  console.log(">>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>");
  console.log("🟦 NEW REQUEST");
  console.log("Method:", req.method);
  console.log("URL:", req.originalUrl);
  console.log("Path:", req.path);
  console.log("Headers:", req.headers);
  console.log("Body:", req.body);
  console.log("<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<");
  next();
});

/* ============================================================
   🔍 RESPONSE LOGGER
   ============================================================ */
app.use((req, res, next) => {
  const oldJson = res.json;
  res.json = function (data) {
    console.log("🟩 OUTGOING RESPONSE:", JSON.stringify(data, null, 2));
    return oldJson.apply(res, arguments);
  };
  next();
});

/* ============================================================
   🔑 ENV VARS
   ============================================================ */
const API_KEY = process.env.YOUTUBE_API_KEY;
const AUTH_SECRET = process.env.MCP_AUTH_TOKEN;

/* ============================================================
   📦 MCP TOOLS (camelCase required)
   ============================================================ */
const tools = [
  {
    name: "youtube_search",
    description: "Search YouTube for videos.",
    inputSchema: {
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
    inputSchema: {
      type: "object",
      properties: {
        videoId: { type: "string" }
      },
      required: ["videoId"]
    }
  }
];

/* ============================================================
   🔓 AUTH MIDDLEWARE — allow JSON-RPC entrypoint
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
   ⭐ JSON-RPC HANDLER (REQUIRED BY OPENAI MCP)
   ============================================================ */
app.post("/mcp", async (req, res) => {
  const { id, jsonrpc, method, params } = req.body;

  /* ---------------------------------------------------------
     ⭐⭐ REQUIRED FIX: IGNORE NOTIFICATIONS ⭐⭐
     --------------------------------------------------------- */
  if (method && method.startsWith("notifications/")) {
    console.log("🔕 Ignoring notification:", method);
    return res.status(200).end(); // No JSON response
  }

  /* ---------------------------------------------------------
     Validate structure (only for requests, not notifications)
     --------------------------------------------------------- */
  if (jsonrpc !== "2.0" || typeof id === "undefined") {
    return res.json({
      jsonrpc: "2.0",
      id: id || null,
      error: { code: -32600, message: "Invalid Request" }
    });
  }

  /* ---------------------------------------------------------
     ⭐ REQUIRED MCP HANDSHAKE
     --------------------------------------------------------- */
  if (method === "initialize") {
    return res.json({
      jsonrpc: "2.0",
      id,
      result: {
        protocolVersion: "2025-06-18",
        serverInfo: { name: "youtube-mcp-server", version: "1.0.0" },
        capabilities: { tools: {} }
      }
    });
  }

  /* ---------------------------------------------------------
     📌 tools/list
     --------------------------------------------------------- */
  if (method === "tools/list") {
    return res.json({
      jsonrpc: "2.0",
      id,
      result: { tools }
    });
  }

  /* ---------------------------------------------------------
     📌 tools/call
     --------------------------------------------------------- */
  if (method === "tools/call") {
    const { name, arguments: args } = params;

    if (name === "youtube_search") {
      const items = await youtubeSearch(args.query, args.maxResults);
      return res.json({
        jsonrpc: "2.0",
        id,
        result: { items }
      });
    }

    if (name === "youtube_get_video") {
      const video = await youtubeGetVideo(args.videoId);
      return res.json({
        jsonrpc: "2.0",
        id,
        result: { video }
      });
    }

    return res.json({
      jsonrpc: "2.0",
      id,
      error: { code: -32601, message: "Unknown tool" }
    });
  }

  /* ---------------------------------------------------------
     ❌ Unknown method
     --------------------------------------------------------- */
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
  console.log("🚀 MCP JSON-RPC YouTube Server running on port 3000");
});

