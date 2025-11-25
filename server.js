// server.js
import express from "express";
import "dotenv/config";
import { parse } from "csv-parse/sync";
import fetch from "node-fetch";
import { tools } from "./tools.js";

// Log unexpected runtime errors
process.on("uncaughtException", err => {
  console.error("UNCAUGHT EXCEPTION:", err);
});

process.on("unhandledRejection", err => {
  console.error("UNHANDLED REJECTION:", err);
});

const app = express();
app.use(express.json());

// ===== ENV VARS =====
const CSV_URL = process.env.CSV_URL;

// ============ CORS =============
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  if (req.method === "OPTIONS") return res.sendStatus(200);
  next();
});

// ===== HEALTH CHECK =====
app.get("/health", (req, res) => res.status(200).send("OK"));

// ===== ROOT =====
app.get("/", (req, res) => res.send("YouTube MCP (Sheets MVP) running"));

// ===== Fetch + Parse CSV =====
async function loadVideos() {
  const response = await fetch(CSV_URL);
  const csvText = await response.text();

  const rows = parse(csvText, {
    columns: true,
    skip_empty_lines: true
  });

  return rows.map(row => {
    const url = row.url?.trim() || "";
    let youtube_id = "";

    if (url.includes("watch?v=")) {
      youtube_id = url.split("watch?v=")[1].split("&")[0];
    } else if (url.includes("youtu.be/")) {
      youtube_id = url.split("youtu.be/")[1].split("?")[0];
    }

    const title = row["OU Sooners videos"]?.trim() || "";
    const published_at = row["published date"] || "";
    const description = row["description"] || "";

    const tags = description
      .toLowerCase()
      .replace(/[^\w\s]/g, "")
      .split(/\s+/)
      .filter(Boolean);

    return {
      youtube_id,
      title,
      url,
      published_at,
      tags
    };
  });
}

// ===== SEARCH FUNCTIONS =====
async function searchVideos({ query, limit = 10 }) {
  const videos = await loadVideos();
  const q = query.toLowerCase();

  const results = videos.filter(v =>
    v.title.toLowerCase().includes(q) ||
    v.tags.some(tag => tag.includes(q))
  );

  return results.slice(0, limit);
}

async function recentVideos({ limit = 10 }) {
  const videos = await loadVideos();

  return videos
    .sort((a, b) => new Date(b.published_at) - new Date(a.published_at))
    .slice(0, limit);
}

async function videosBySport({ sport, limit = 10 }) {
  const videos = await loadVideos();
  const s = sport.toLowerCase();

  const results = videos.filter(v =>
    v.tags.includes(s) ||
    v.title.toLowerCase().includes(s)
  );

  return results.slice(0, limit);
}

// ===== MCP ENDPOINT =====
app.post("/mcp", async (req, res) => {
  const { id, method, params } = req.body;

  if (!id) return res.json({ jsonrpc: "2.0", result: null });

  try {
    if (method === "tools/list") {
      return res.json({
        jsonrpc: "2.0",
        id,
        result: { tools }
      });
    }

    if (method === "tools/call") {
      const { name, arguments: args = {} } = params;

      let out;

      if (name === "search_ou_videos") out = await searchVideos(args);
      else if (name === "get_videos_by_sport") out = await videosBySport(args);
      else if (name === "get_recent_videos") out = await recentVideos(args);
      else {
        return res.json({
          jsonrpc: "2.0",
          id,
          error: { code: -32601, message: "Unknown tool" }
        });
      }

      return res.json({
        jsonrpc: "2.0",
        id,
        result: {
          content: [
            {
              type: "output_text",
              text: JSON.stringify(out, null, 2)
            }
          ]
        }
      });
    }

    res.json({
      jsonrpc: "2.0",
      id,
      error: { code: -32601, message: "Unknown method" }
    });

  } catch (err) {
    console.error(err);
    res.json({
      jsonrpc: "2.0",
      id,
      error: { code: -32000, message: err.message }
    });
  }
});

// ===== HEARTBEAT (fires immediately, keeps Railway alive) =====
const PUBLIC_URL = process.env.PUBLIC_URL;

async function heartbeat() {
  if (!PUBLIC_URL) return;

  try {
    await fetch(`${PUBLIC_URL}/health`);
  } catch (e) {}

  setTimeout(heartbeat, 25000);
}

// Start immediately
heartbeat();

// ===== LISTEN =====
const port = process.env.PORT || 8080;
app.listen(port, () => {
  console.log("MCP YouTube (Sheets MVP) listening on " + port);
});





