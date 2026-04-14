const http = require("http");
const fs = require("fs/promises");
const path = require("path");

const HOST = process.env.MEASURE_COLLECTOR_HOST || "0.0.0.0";
const PORT = Number.parseInt(process.env.MEASURE_COLLECTOR_PORT || "8090", 10);
const RESULTS_DIR = path.resolve(__dirname, "..", "results");

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  });
  res.end(JSON.stringify(payload, null, 2));
}

function sanitizeSegment(value, fallback = "na") {
  const normalized = String(value ?? fallback).trim();
  const safe = normalized.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  return safe || fallback;
}

function pad2(value) {
  return String(value).padStart(2, "0");
}

function pad3(value) {
  return String(value).padStart(3, "0");
}

function getSafeDate(input) {
  const date = input ? new Date(input) : new Date();
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function timestampForFilename(input) {
  const date = getSafeDate(input);
  return [
    date.getFullYear(),
    pad2(date.getMonth() + 1),
    pad2(date.getDate())
  ].join("-") + "_" + [
    pad2(date.getHours()),
    pad2(date.getMinutes()),
    pad2(date.getSeconds()),
    pad3(date.getMilliseconds())
  ].join("-");
}

function buildFileName(payload) {
  const stamp = timestampForFilename(payload.reportedAtAbsMs);
  const parts = [
    stamp,
    sanitizeSegment(payload.framework),
    sanitizeSegment(payload.experiment),
    sanitizeSegment(payload.mode),
    `n${sanitizeSegment(payload.n)}`,
    payload.levels == null ? null : `levels${sanitizeSegment(payload.levels)}`,
    payload.runId ? `run-${sanitizeSegment(payload.runId)}` : null,
    payload.status === "error" ? "error" : "result"
  ].filter(Boolean);

  return `${parts.join("_")}.json`;
}

function buildSubDir(payload) {
  const date = getSafeDate(payload.reportedAtAbsMs);
  return [
    date.getFullYear(),
    pad2(date.getMonth() + 1),
    pad2(date.getDate())
  ].join("-");
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) {
    throw new Error("Empty request body");
  }
  return JSON.parse(raw);
}

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    sendJson(res, 204, { ok: true });
    return;
  }

  if (req.method === "GET" && req.url === "/health") {
    sendJson(res, 200, {
      ok: true,
      host: HOST,
      port: PORT,
      resultsDir: RESULTS_DIR
    });
    return;
  }

  if (req.method === "POST" && req.url === "/measure-results") {
    try {
      const payload = await readJsonBody(req);
      const subDir = path.join(RESULTS_DIR, buildSubDir(payload));
      await fs.mkdir(subDir, { recursive: true });

      const fileName = buildFileName(payload);
      const absolutePath = path.join(subDir, fileName);
      await fs.writeFile(absolutePath, JSON.stringify(payload, null, 2), "utf8");

      sendJson(res, 200, {
        ok: true,
        fileName,
        absolutePath,
        relativePath: path.relative(path.resolve(__dirname, ".."), absolutePath)
      });
    } catch (error) {
      sendJson(res, 400, {
        ok: false,
        message: error?.message || String(error)
      });
    }
    return;
  }

  sendJson(res, 404, {
    ok: false,
    message: "Not found"
  });
});

server.listen(PORT, HOST, () => {
  console.log(`Measure collector listening on http://${HOST}:${PORT}`);
  console.log(`Results directory: ${RESULTS_DIR}`);
});
