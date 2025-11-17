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
const AUTH_SECRET = process.env.MCP_AUTH_TOKEN;
const VIDEO_SEARCH_API = process.env.VIDEO_SEARCH_API || "https://bsen-backend-production.up.railway.app/search";

/* ============================================================
   📦 MCP TOOLS - Boomer Bot Video Search
   ============================================================ */
const tools = [
  {
    name: "search_ou_videos",
    description: "Search the Oklahoma Sooners video database for game highlights, player performances, memorable plays, and historic moments. Returns relevant OU sports videos with titles, URLs, and relevance scores.",
    inputSchema: {
      type: "object",
      properties: {
        query: { 
          type: "string",
          description: "Search terms for OU videos (e.g., 'Dillon Gabriel touchdown', 'Red River Rivalry', 'championship game')"
        },
        limit: { 
          type: "number",
          description: "Maximum number of results to return (default: 3)",
          default: 5
        }
      },
      required: ["query"]
    }
  }
];

/* ============================================================
   🔓 AUTH MIDDLEWARE — allow JSON-RPC entrypoint
   ============================================================ */
const openPaths = ["/mcp", "/mcp/", "/manifest.json", "/manifest", "/health"];

app.use((req, res, next) => {
  if (openPaths.includes(req.path)) return next();

  const auth = req.headers.authorization;
  if (!auth || auth !== `Bearer ${AUTH_SECRET}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  next();
});

/* ============================================================
   ⭐ JSON-RPC HANDLER (REQUIRED BY MCP)
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
        serverInfo: { 
          name: "boomer-bot-video-search", 
          version: "1.0.0",
          description: "Oklahoma Sooners video database search with 3,915+ videos"
        },
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

    if (name === "search_ou_videos") {
      try {
        const videos = await searchOUVideos(args.query, args.limit || 3);
        return res.json({
          jsonrpc: "2.0",
          id,
          result: { 
            content: [{
              type: "text",
              text: formatVideoResults(videos, args.query)
            }]
          }
        });
      } catch (error) {
        console.error("Error searching videos:", error);
        return res.json({
          jsonrpc: "2.0",
          id,
          error: { code: -32000, message: `Search failed: ${error.message}` }
        });
      }
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
   🔧 VIDEO SEARCH FUNCTION
   ============================================================ */
async function searchOUVideos(query, limit = 5) {
  const url = `${VIDEO_SEARCH_API}?q=${encodeURIComponent(query)}`;
  
  console.log("🔍 Searching videos:", url);
  
  const response = await fetch(url);
  
  if (!response.ok) {
    throw new Error(`API returned ${response.status}`);
  }
  
  const data = await response.json();
  
  // Return top N results
  return data.slice(0, limit);
}

/* ============================================================
   📝 FORMAT RESULTS FOR DISPLAY
   ============================================================ */
function formatVideoResults(videos, query) {
  if (!videos || videos.length === 0) {
    return `No Oklahoma Sooners videos found for "${query}". Try different search terms like player names, game opponents, or types of plays.`;
  }

  let result = `Found ${videos.length} Oklahoma Sooners video${videos.length > 1 ? 's' : ''} for "${query}":\n\n`;
  
  videos.forEach((video, index) => {
    const relevance = video.similarity ? Math.round(video.similarity * 100) : 'N/A';
    result += `${index + 1}. **${video.title}**\n`;
    result += `   📺 ${video.url}\n`;
    if (video.channel_title) {
      result += `   📹 Channel: ${video.channel_title}\n`;
    }
    result += `   🎯 Relevance: ${relevance}%\n\n`;
  });
  
  return result;
}

/* ============================================================
   🌐 HEALTH CHECK & MANIFEST
   ============================================================ */
app.get("/health", (req, res) => {
  res.json({ 
    status: "ok", 
    service: "boomer-bot-video-search-mcp",
    videos: "3915+",
    timestamp: new Date().toISOString()
  });
});

app.get("/manifest.json", (req, res) => res.json({ 
  name: "Boomer Bot Video Search",
  tools 
}));

app.get("/mcp", (req, res) =>
  res.json({ 
    note: "Use POST /mcp with JSON-RPC 2.0",
    service: "Oklahoma Sooners Video Search MCP Server"
  })
);

/* ============================================================
   🚀 START SERVER
   ============================================================ */
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🚀 Boomer Bot MCP Server running on port ${PORT}`);
  console.log(`📹 Video Search API: ${VIDEO_SEARCH_API}`);
  console.log(`🔐 Auth: ${AUTH_SECRET ? 'Configured' : 'NOT SET - WARNING!'}`);
});
