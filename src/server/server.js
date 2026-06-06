const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const PROJECT_ROOT = path.resolve(__dirname, "../..");
const PUBLIC_DIR = path.join(PROJECT_ROOT, "public");
const CATALOG_DIR = path.join(PROJECT_ROOT, "catalog");
const REFERENCES_DIR = path.join(PROJECT_ROOT, "references");
const ASSETS_DIR = path.join(PUBLIC_DIR, "assets");
const MODULES_DIR = path.join(PUBLIC_DIR, "modules");
const LOCAL_CONFIG_PATH = path.join(PROJECT_ROOT, "config", "atlas.local.json");
const PORT = Number(process.env.PORT || 8791);

const mime = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".csv": "text/csv; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".pdf": "application/pdf"
};

function readLocalConfig() {
  try {
    return JSON.parse(fs.readFileSync(LOCAL_CONFIG_PATH, "utf8").replace(/^﻿/, ""));
  } catch {
    return {};
  }
}

const localConfig = readLocalConfig();

function setting(name, fallback = "") {
  return process.env[name] || localConfig[name] || fallback;
}

function send(res, status, body, type = "application/json; charset=utf-8") {
  res.writeHead(status, { "Content-Type": type });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        reject(new Error("Request body too large"));
        req.destroy();
      }
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

function health(res) {
  send(res, 200, JSON.stringify({
    ok: true,
    llmConfigured: Boolean(setting("ANTHROPIC_API_KEY")),
    model: setting("ANTHROPIC_MODEL", setting("ANTHROPIC_DEFAULT_SONNET_MODEL", "not configured")),
    foundation: true,
    modules: discoverModules()
  }));
}

/**
 * Discover available modules from public/modules directory
 */
function discoverModules() {
  try {
    const modules = [];
    if (!fs.existsSync(MODULES_DIR)) return modules;

    for (const entry of fs.readdirSync(MODULES_DIR, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;

      const moduleJsonPath = path.join(MODULES_DIR, entry.name, "module.json");
      if (fs.existsSync(moduleJsonPath)) {
        try {
          const manifest = JSON.parse(fs.readFileSync(moduleJsonPath, "utf8"));
          modules.push({
            id: manifest.id,
            name: manifest.name,
            version: manifest.version,
            description: manifest.description,
            importKind: manifest.importKind || "module-manifest",
            defaultLoad: Boolean(manifest.defaultLoad)
          });
        } catch (e) {
          console.warn(`Failed to parse module.json for ${entry.name}:`, e.message);
        }
      }
    }
    return modules;
  } catch (e) {
    console.warn("Module discovery error:", e.message);
    return [];
  }
}

/**
 * Get module manifest
 */
function getModuleManifest(moduleId) {
  const moduleJsonPath = path.join(MODULES_DIR, moduleId, "module.json");
  if (!fs.existsSync(moduleJsonPath)) return null;

  try {
    const manifest = JSON.parse(fs.readFileSync(moduleJsonPath, "utf8"));
    return {
      ...manifest,
      basePath: `/modules/${moduleId}/`
    };
  } catch {
    return null;
  }
}

/**
 * List available modules
 */
function listModules(res) {
  send(res, 200, JSON.stringify({ modules: discoverModules() }));
}

/**
 * Get module details
 */
function getModule(res, moduleId) {
  const manifest = getModuleManifest(moduleId);
  if (!manifest) {
    send(res, 404, JSON.stringify({ error: `Module "${moduleId}" not found` }));
    return;
  }
  send(res, 200, JSON.stringify(manifest));
}

async function research(req, res) {
  const payload = JSON.parse(await readBody(req) || "{}");
  const apiKey = setting("ANTHROPIC_API_KEY");

  if (!apiKey) {
    send(res, 200, JSON.stringify({ report: mockReport(payload) }));
    return;
  }

  const baseUrl = setting("ANTHROPIC_BASE_URL", "https://api.anthropic.com").replace(/\/$/, "");
  const model = setting("ANTHROPIC_MODEL", setting("ANTHROPIC_DEFAULT_SONNET_MODEL", "claude-3-5-sonnet-latest"));
  const prompt = buildPrompt(payload);

  const response = await fetch(`${baseUrl}/v1/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model,
      max_tokens: 1800,
      messages: [{ role: "user", content: prompt }]
    })
  });

  if (!response.ok) {
    const text = await response.text();
    send(res, 502, JSON.stringify({ error: `LLM request failed: ${response.status}`, detail: text.slice(0, 500) }));
    return;
  }

  const data = await response.json();
  const report = Array.isArray(data.content)
    ? data.content.map((part) => part.text || "").join("\n")
    : JSON.stringify(data);
  send(res, 200, JSON.stringify({ report }));
}

function buildPrompt(payload) {
  const basin = payload.basin || {};
  const profile = basin.profile || {};
  return [
    "You are a rigorous geospatial research assistant. Based on the selected spatial feature context, generate a research summary report.",
    "If the question requires external literature search but context is insufficient, provide recommended search queries and literature types to verify. Do not fabricate non-existent papers.",
    "",
    `User question: ${payload.question || ""}`,
    `Basin name: ${basin.name || ""}`,
    `HydroBASINS ID: ${basin.id || ""}`,
    `Region: ${basin.region || ""}`,
    `bbox: ${JSON.stringify(basin.bbox || [])}`,
    `Area km2: ${basin.areaKm2 || ""}`,
    `Configured summary: ${profile.summary || ""}`,
    `Water cycle characteristics: ${(profile.cycle || []).join("; ")}`,
    `Spatiotemporal patterns: ${(profile.pattern || []).join("; ")}`,
    `Local references: ${(profile.references || []).join("; ")}`,
    "",
    "Output structure:",
    "1. Research question restatement",
    "2. Basin background and relevant hydrological/ecological mechanisms",
    "3. Potential research directions related to user's topic",
    "4. How existing local literature supports or falls short",
    "5. Recommended search queries",
    "6. Evidence strength and uncertainties"
  ].join("\n");
}

function mockReport(payload) {
  const basin = payload.basin || {};
  const profile = basin.profile || {};
  const refs = profile.references || [];
  return [
    "Offline Demo Report",
    "",
    `Research question: ${payload.question || "Not provided"}`,
    `Basin: ${basin.name || "Not selected"}`,
    "",
    "Basin background:",
    profile.summary || "This feature has no configured profile. Use available spatial attributes and loaded module context only.",
    "",
    "Potential mechanisms:",
    ...((profile.cycle || ["Requires precipitation, evapotranspiration, runoff, groundwater, and human activity data for full assessment."]).map((item) => `- ${item}`)),
    "",
    "Spatiotemporal patterns:",
    ...((profile.pattern || ["Not configured."]).map((item) => `- ${item}`)),
    "",
    "Local references:",
    ...(refs.length ? refs.map((item) => `- ${item}`) : ["- Rodell et al. 2018 Nature", "- Jasechko et al. 2024 Nature"]),
    "",
    "Recommended search queries:",
    `- "${basin.name || "selected basin"}" "${payload.question || "research"}"`,
    `- "${basin.name || "selected basin"}" hydrology ecology climate`,
    `- "${basin.name || "selected basin"}" water management remote sensing`,
    "",
    "Note: This is a fallback response without API key. Configure local API key for real LLM-powered synthesis."
  ].join("\n");
}

function isInside(child, parent) {
  const relative = path.relative(parent, child);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function resolveStaticPath(req) {
  let requestPath = decodeURIComponent(new URL(req.url, `http://${req.headers.host}`).pathname);
  if (requestPath === "/") requestPath = "/index.html";

  if (requestPath === "/basin-data.js") return path.join(ASSETS_DIR, "basin-data.js");
  if (requestPath === "/land-50m.js") return path.join(ASSETS_DIR, "land-50m.js");
  if (requestPath.startsWith("/catalog/")) return path.join(CATALOG_DIR, requestPath.slice("/catalog/".length));
  if (requestPath.startsWith("/references/")) return path.join(REFERENCES_DIR, requestPath.slice("/references/".length));
  return path.join(PUBLIC_DIR, requestPath);
}

function isAllowedStaticPath(filePath) {
  return isInside(filePath, PUBLIC_DIR) ||
    isInside(filePath, CATALOG_DIR) ||
    isInside(filePath, REFERENCES_DIR);
}

function serveFile(req, res) {
  const filePath = resolveStaticPath(req);
  if (!isAllowedStaticPath(filePath)) {
    send(res, 403, "Forbidden", "text/plain; charset=utf-8");
    return;
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      send(res, 404, "Not found", "text/plain; charset=utf-8");
      return;
    }
    send(res, 200, data, mime[path.extname(filePath)] || "application/octet-stream");
  });
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.url === "/api/health") return health(res);
    if (req.url === "/api/modules") return listModules(res);
    if (req.url.startsWith("/api/modules/") && req.method === "GET") {
      const moduleId = req.url.slice("/api/modules/".length);
      return getModule(res, moduleId);
    }
    if (req.url === "/api/research" && req.method === "POST") return await research(req, res);
    serveFile(req, res);
  } catch (error) {
    send(res, 500, JSON.stringify({ error: error.message }));
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Tereon running at http://127.0.0.1:${PORT}`);
  console.log(`  - UI: http://127.0.0.1:${PORT}/`);
  console.log(`  - Available modules: ${discoverModules().map(m => m.id).join(", ") || "none"}`);
});
