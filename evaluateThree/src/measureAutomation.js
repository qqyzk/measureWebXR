const TRUE_VALUES = new Set(["1", "true", "yes", "on"]);
const FALSE_VALUES = new Set(["0", "false", "no", "off"]);

function parseBoolean(rawValue, fallback) {
  if (rawValue == null) return fallback;
  const normalized = String(rawValue).trim().toLowerCase();
  if (TRUE_VALUES.has(normalized)) return true;
  if (FALSE_VALUES.has(normalized)) return false;
  return fallback;
}

function parsePositiveInt(rawValue, fallback) {
  const parsed = Number.parseInt(rawValue, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parsePositiveNumber(rawValue, fallback) {
  const parsed = Number(rawValue);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function inferCollectorUrl(rawValue) {
  if (!rawValue) return "";
  if (/^https?:\/\//i.test(rawValue)) return rawValue;
  const normalizedPath = rawValue.startsWith("/") ? rawValue : `/${rawValue}`;
  return `${window.location.protocol}//${window.location.hostname}:8090${normalizedPath}`;
}

function sanitizeSegment(value, fallback = "na") {
  const normalized = String(value ?? fallback).trim();
  const safe = normalized.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  return safe || fallback;
}

function resultStorageKey(runnerKey) {
  return `measureResults:${runnerKey || "standalone"}`;
}

function localTimestampForFile() {
  const date = new Date();
  const pad2 = (value) => String(value).padStart(2, "0");
  const pad3 = (value) => String(value).padStart(3, "0");
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

export function nowAbsMs() {
  return performance.now() + performance.timeOrigin;
}

export function deepestSceneGraphLevels(edgeNum) {
  const safeEdgeNum = Math.max(1, parsePositiveInt(edgeNum, 1));
  return Math.ceil(Math.log2(safeEdgeNum)) + 1;
}

export function resolveSceneGraphLevels(rawLevels, edgeNum, fallback) {
  if (rawLevels == null || rawLevels === "") return fallback;
  const normalized = String(rawLevels).trim().toLowerCase();
  if (normalized === "max" || normalized === "deepest") {
    return deepestSceneGraphLevels(edgeNum);
  }
  const requested = parsePositiveInt(rawLevels, fallback);
  return Math.min(requested, deepestSceneGraphLevels(edgeNum));
}

export function readMeasureConfig(defaults) {
  const params = new URLSearchParams(window.location.search);
  const n = parsePositiveInt(params.get("n"), defaults.n);
  const durationSec = parsePositiveNumber(
    params.get("durationSec") ?? params.get("duration"),
    defaults.durationSec
  );

  const config = {
    framework: defaults.framework,
    experiment: defaults.experiment,
    mode: defaults.mode,
    modelName: params.get("name") || defaults.modelName,
    modelType: params.get("type") || defaults.modelType,
    n,
    durationSec,
    autostart: parseBoolean(params.get("autostart"), defaults.autostart ?? false),
    showStats: parseBoolean(params.get("stats"), defaults.showStats ?? false),
    saveResults: parseBoolean(params.get("saveResults") ?? params.get("save"), defaults.saveResults ?? false),
    uploadResults: parseBoolean(params.get("uploadResults") ?? params.get("upload"), defaults.uploadResults ?? false),
    collectorUrl: inferCollectorUrl(params.get("collectorUrl") || defaults.collectorUrl || "/measure-results"),
    runnerKey: params.get("runnerKey") || defaults.runnerKey || "",
    returnTo: params.get("returnTo") || defaults.returnTo || "",
    nextUrl: params.get("nextUrl") || defaults.nextUrl || "",
    finishUrl: params.get("finishUrl") || defaults.finishUrl || "",
    redirectDelayMs: parsePositiveInt(params.get("redirectDelayMs"), defaults.redirectDelayMs ?? 1200),
    runId: params.get("runId") || "",
    note: params.get("note") || "",
    rawQuery: window.location.search
  };

  if (defaults.levels !== undefined) {
    config.levels = resolveSceneGraphLevels(params.get("levels"), n, defaults.levels);
    config.deepestLevels = deepestSceneGraphLevels(n);
  }

  window.__MEASURE_CONFIG__ = config;
  return config;
}

export function setupMeasureUi(config) {
  const panel = document.createElement("div");
  panel.id = "measure-panel";
  panel.style.position = "fixed";
  panel.style.top = "8px";
  panel.style.left = "96px";
  panel.style.zIndex = "9999";
  panel.style.padding = "8px 10px";
  panel.style.background = "rgba(0, 0, 0, 0.65)";
  panel.style.color = "#fff";
  panel.style.font = "12px/1.4 monospace";
  panel.style.whiteSpace = "pre-wrap";
  panel.style.maxWidth = "44vw";
  panel.style.pointerEvents = "none";

  const summaryLines = [
    `${config.framework} / ${config.experiment} / ${config.mode}`,
    `n=${config.n} objects=${config.n ** 3}`,
    `duration=${config.durationSec}s`
  ];
  if (config.levels !== undefined) {
    summaryLines.push(`levels=${config.levels} deepest=${config.deepestLevels}`);
  }
  if (config.runId) {
    summaryLines.push(`runId=${config.runId}`);
  }
  if (config.saveResults) {
    summaryLines.push(`save=on`);
  }
  if (config.uploadResults) {
    summaryLines.push(`upload=on`);
  }
  if (config.returnTo) {
    summaryLines.push(`return=on`);
  }
  if (config.nextUrl) {
    summaryLines.push(`next=manual`);
  }

  panel.textContent = `${summaryLines.join("\n")}\nstatus=ready`;
  document.body.appendChild(panel);
  document.body.dataset.measureStatus = "ready";

  return {
    setStatus(statusLine) {
      panel.textContent = `${summaryLines.join("\n")}\nstatus=${statusLine}`;
      document.body.dataset.measureStatus = statusLine;
    }
  };
}

async function postToCollector(payload, config) {
  if (!config?.uploadResults || !config.collectorUrl) {
    return null;
  }

  const response = await fetch(config.collectorUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new Error(`Collector request failed: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  return data;
}

function appendLocalResult(payload, config) {
  if (!config?.saveResults) {
    return null;
  }

  const key = resultStorageKey(config.runnerKey);
  const currentItems = getStoredMeasurements(config.runnerKey);
  const nextItems = currentItems.concat({
    ...payload,
    locallyStoredAtAbsMs: nowAbsMs()
  });
  localStorage.setItem(key, JSON.stringify(nextItems));
  return {
    key,
    count: nextItems.length
  };
}

function maybeRedirectAfterPublish(config) {
  if (!config?.returnTo) {
    return;
  }
  window.setTimeout(() => {
    window.location.href = config.returnTo;
  }, config.redirectDelayMs ?? 1200);
}

export async function publishMeasureResult(result, ui, config) {
  const finalized = {
    schemaVersion: 1,
    ...result,
    reportedAtAbsMs: nowAbsMs(),
    url: window.location.href,
    userAgent: navigator.userAgent
  };

  window.__MEASURE_RESULT__ = finalized;
  window.__MEASURE_RESULTS__ = window.__MEASURE_RESULTS__ || [];
  window.__MEASURE_RESULTS__.push(finalized);

  if (ui) {
    ui.setStatus("done");
  } else {
    document.body.dataset.measureStatus = "done";
  }

  console.log("MEASURE_RESULT", JSON.stringify(finalized));
  window.dispatchEvent(new CustomEvent("measure-result", { detail: finalized }));
  const localSave = appendLocalResult(finalized, config);
  if (localSave) {
    finalized.localStore = localSave;
    window.__MEASURE_RESULT__ = finalized;
    console.log("MEASURE_LOCAL_SAVED", JSON.stringify(localSave));
    window.dispatchEvent(new CustomEvent("measure-local-saved", { detail: localSave }));
  }
  try {
    const saveResponse = await postToCollector(finalized, config);
    if (saveResponse) {
      finalized.collector = saveResponse;
      window.__MEASURE_RESULT__ = finalized;
      console.log("MEASURE_SAVED", JSON.stringify(saveResponse));
      window.dispatchEvent(new CustomEvent("measure-saved", { detail: saveResponse }));
    }
  } catch (error) {
    console.error("MEASURE_SAVE_ERROR", error?.message || String(error));
    window.dispatchEvent(new CustomEvent("measure-save-error", {
      detail: { message: error?.message || String(error), payload: finalized }
    }));
  }
  maybeRedirectAfterPublish(config);
  return finalized;
}

export async function publishMeasureError(errorPayload, ui, config) {
  const finalized = {
    schemaVersion: 1,
    status: "error",
    ...errorPayload,
    reportedAtAbsMs: nowAbsMs(),
    url: window.location.href,
    userAgent: navigator.userAgent
  };

  window.__MEASURE_ERROR__ = finalized;
  if (ui) {
    ui.setStatus("error");
  } else {
    document.body.dataset.measureStatus = "error";
  }

  console.error("MEASURE_ERROR", JSON.stringify(finalized));
  window.dispatchEvent(new CustomEvent("measure-error", { detail: finalized }));
  const localSave = appendLocalResult(finalized, config);
  if (localSave) {
    finalized.localStore = localSave;
    window.__MEASURE_ERROR__ = finalized;
    console.log("MEASURE_LOCAL_SAVED", JSON.stringify(localSave));
    window.dispatchEvent(new CustomEvent("measure-local-saved", { detail: localSave }));
  }
  try {
    const saveResponse = await postToCollector(finalized, config);
    if (saveResponse) {
      finalized.collector = saveResponse;
      window.__MEASURE_ERROR__ = finalized;
      console.log("MEASURE_SAVED", JSON.stringify(saveResponse));
      window.dispatchEvent(new CustomEvent("measure-saved", { detail: saveResponse }));
    }
  } catch (error) {
    console.error("MEASURE_SAVE_ERROR", error?.message || String(error));
    window.dispatchEvent(new CustomEvent("measure-save-error", {
      detail: { message: error?.message || String(error), payload: finalized }
    }));
  }
  maybeRedirectAfterPublish(config);
  return finalized;
}

export function getStoredMeasurements(runnerKey) {
  const raw = localStorage.getItem(resultStorageKey(runnerKey));
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function clearStoredMeasurements(runnerKey) {
  localStorage.removeItem(resultStorageKey(runnerKey));
}

export function exportStoredMeasurements(runnerKey, fileLabel = "measure-results") {
  const items = getStoredMeasurements(runnerKey);
  const payload = {
    exportedAt: new Date().toISOString(),
    runnerKey: runnerKey || "",
    count: items.length,
    items
  };
  const fileName = `${localTimestampForFile()}_${sanitizeSegment(fileLabel)}.json`;
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(objectUrl);
  return { fileName, count: items.length };
}
