const TRUE_VALUES = new Set(["1", "true", "yes", "on"]);

import {
  clearStoredMeasurements,
  exportStoredMeasurements,
  getStoredMeasurements
} from "./measureAutomation.js";

function parseBoolean(rawValue, fallback) {
  if (rawValue == null) return fallback;
  return TRUE_VALUES.has(String(rawValue).trim().toLowerCase());
}

function parsePositiveInt(rawValue, fallback) {
  const parsed = Number.parseInt(rawValue, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseCsvNumbers(rawValue, fallback) {
  if (!rawValue) return fallback;
  const values = String(rawValue)
    .split(",")
    .map((part) => Number.parseInt(part.trim(), 10))
    .filter((value) => Number.isFinite(value) && value > 0);
  return values.length ? values : fallback;
}

function storageKey(runnerKey) {
  return `measureRunner:${runnerKey}`;
}

function sanitizeId(value) {
  return String(value ?? "na")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || "na";
}

function createRunnerKey(prefix) {
  return `${prefix}-${Date.now()}`;
}

function saveState(runnerKey, state) {
  localStorage.setItem(storageKey(runnerKey), JSON.stringify(state));
}

function loadState(runnerKey) {
  const raw = localStorage.getItem(storageKey(runnerKey));
  if (!raw) return null;
  return JSON.parse(raw);
}

function deleteState(runnerKey) {
  localStorage.removeItem(storageKey(runnerKey));
}

function makeReturnUrl(runnerUrl, runnerKey) {
  const returnUrl = new URL(runnerUrl.href);
  returnUrl.searchParams.set("runnerKey", runnerKey);
  returnUrl.searchParams.set("advance", "1");
  return returnUrl.toString();
}

function updateUrlWithoutAdvance(runnerKey) {
  const cleanUrl = new URL(window.location.href);
  cleanUrl.searchParams.set("runnerKey", runnerKey);
  cleanUrl.searchParams.delete("advance");
  history.replaceState(null, "", cleanUrl.toString());
}

function buildBaseLayout(title) {
  document.body.style.margin = "0";
  document.body.style.background = "#111";
  document.body.style.color = "#f2f2f2";
  document.body.style.font = "14px/1.5 monospace";
  document.body.style.padding = "18px";

  const root = document.createElement("div");
  root.style.maxWidth = "900px";
  root.style.margin = "0 auto";
  document.body.appendChild(root);

  const heading = document.createElement("h1");
  heading.textContent = title;
  heading.style.margin = "0 0 12px";
  heading.style.fontSize = "24px";
  root.appendChild(heading);

  const controls = document.createElement("div");
  controls.style.display = "flex";
  controls.style.gap = "8px";
  controls.style.flexWrap = "wrap";
  controls.style.marginBottom = "12px";
  root.appendChild(controls);

  const status = document.createElement("pre");
  status.style.background = "#1a1a1a";
  status.style.padding = "12px";
  status.style.border = "1px solid #333";
  status.style.whiteSpace = "pre-wrap";
  root.appendChild(status);

  const planBox = document.createElement("pre");
  planBox.style.background = "#1a1a1a";
  planBox.style.padding = "12px";
  planBox.style.border = "1px solid #333";
  planBox.style.whiteSpace = "pre-wrap";
  planBox.style.marginTop = "12px";
  root.appendChild(planBox);

  return { root, controls, status, planBox };
}

function addButton(container, label, onClick) {
  const button = document.createElement("button");
  button.textContent = label;
  button.style.padding = "8px 12px";
  button.style.font = "inherit";
  button.style.cursor = "pointer";
  button.onclick = onClick;
  container.appendChild(button);
  return button;
}

export function createInstanceSweepRunner(options) {
  const params = new URLSearchParams(window.location.search);
  const variant = params.get("variant") || "normal";
  const durationSec = parsePositiveInt(params.get("durationSec") ?? params.get("duration"), 60);
  const nValues = parseCsvNumbers(params.get("nValues"), [2, 4, 8, 16, 32]);
  const saveResults = parseBoolean(params.get("saveResults") ?? params.get("save"), true);
  const autostart = parseBoolean(params.get("autostart"), false);
  const redirectDelayMs = parsePositiveInt(params.get("redirectDelayMs"), 1200);
  let runnerKey = params.get("runnerKey") || createRunnerKey(`three-instance-${sanitizeId(variant)}`);
  const advance = parseBoolean(params.get("advance"), false);

  const pagePath = variant === "instance" ? "multigltf-instanced.html" : "multigltf.html";
  const title = `Three.js Instance Sweep (${variant})`;
  const ui = buildBaseLayout(title);

  function buildPlan() {
    const returnTo = makeReturnUrl(new URL(window.location.href), runnerKey);
    return nValues.map((n, index) => {
      const testUrl = new URL(pagePath, window.location.href);
      testUrl.searchParams.set("autostart", "1");
      testUrl.searchParams.set("n", String(n));
      testUrl.searchParams.set("durationSec", String(durationSec));
      testUrl.searchParams.set("runId", `three-${variant}-n${n}-step${index + 1}`);
      testUrl.searchParams.set("saveResults", saveResults ? "1" : "0");
      testUrl.searchParams.set("uploadResults", "0");
      testUrl.searchParams.set("runnerKey", runnerKey);
      testUrl.searchParams.set("returnTo", returnTo);
      testUrl.searchParams.set("redirectDelayMs", String(redirectDelayMs));
      return {
        label: `${variant} n=${n} objects=${n ** 3}`,
        n,
        mode: variant,
        url: testUrl.toString()
      };
    });
  }

  function getState() {
    let state = loadState(runnerKey);
    if (!state) {
      state = {
        runnerType: "instance",
        variant,
        durationSec,
        nValues,
        saveResults,
        createdAt: new Date().toISOString(),
        currentIndex: 0,
        plan: buildPlan()
      };
      saveState(runnerKey, state);
    }
    return state;
  }

  function render(state) {
    const completed = Math.min(state.currentIndex, state.plan.length);
    const nextItem = state.plan[state.currentIndex] || null;
    const storedCount = getStoredMeasurements(runnerKey).length;
    ui.status.textContent = [
      `runnerKey=${runnerKey}`,
      `variant=${variant}`,
      `duration=${durationSec}s`,
      `saveResults=${saveResults}`,
      `progress=${completed}/${state.plan.length}`,
      `stored=${storedCount}`,
      nextItem ? `next=${nextItem.label}` : "next=done"
    ].join("\n");

    ui.planBox.textContent = state.plan
      .map((item, index) => {
        const marker = index < state.currentIndex ? "[x]" : index === state.currentIndex ? "[>]" : "[ ]";
        return `${marker} ${index + 1}. ${item.label}`;
      })
      .join("\n");
  }

  function launchNext(state) {
    if (state.currentIndex >= state.plan.length) {
      render(state);
      return;
    }
    render(state);
    window.setTimeout(() => {
      window.location.href = state.plan[state.currentIndex].url;
    }, 800);
  }

  function initialize() {
    if (advance) {
      const state = getState();
      if (state.currentIndex < state.plan.length) {
        state.currentIndex += 1;
        saveState(runnerKey, state);
      }
      updateUrlWithoutAdvance(runnerKey);
    }

    const state = getState();
    render(state);
    if (autostart || advance) {
      launchNext(state);
    }
  }

  addButton(ui.controls, "Start / Continue", () => {
    const state = getState();
    launchNext(state);
  });

  addButton(ui.controls, "Export JSON", () => {
    const exported = exportStoredMeasurements(runnerKey, `three-instance-${variant}`);
    alert(`Exported ${exported.count} items to ${exported.fileName}`);
  });

  addButton(ui.controls, "Clear Results", () => {
    clearStoredMeasurements(runnerKey);
    const state = getState();
    render(state);
  });

  addButton(ui.controls, "Reset", () => {
    deleteState(runnerKey);
    clearStoredMeasurements(runnerKey);
    runnerKey = createRunnerKey(`three-instance-${sanitizeId(variant)}`);
    const url = new URL(window.location.href);
    url.searchParams.set("runnerKey", runnerKey);
    url.searchParams.delete("advance");
    window.location.href = url.toString();
  });

  initialize();
}

export function createSceneGraphSweepRunner() {
  const params = new URLSearchParams(window.location.search);
  const n = parsePositiveInt(params.get("n"), 16);
  const maxLevels = Math.ceil(Math.log2(n)) + 1;
  const levels = parseCsvNumbers(params.get("levels"), Array.from({ length: maxLevels }, (_, i) => i + 1))
    .filter((value) => value >= 1 && value <= maxLevels);
  const durationSec = parsePositiveInt(params.get("durationSec") ?? params.get("duration"), 60);
  const saveResults = parseBoolean(params.get("saveResults") ?? params.get("save"), true);
  const autostart = parseBoolean(params.get("autostart"), false);
  const redirectDelayMs = parsePositiveInt(params.get("redirectDelayMs"), 1200);
  let runnerKey = params.get("runnerKey") || createRunnerKey(`three-scenegraph-n${n}`);

  const title = `Three.js Scene Graph Sweep (n=${n}, objects=${n ** 3})`;
  const ui = buildBaseLayout(title);

  function buildPlan() {
    return levels.map((level, index) => ({
      label: `levels=${level} n=${n} objects=${n ** 3}`,
      levels: level,
      n,
      index
    }));
  }

  function getState() {
    let state = loadState(runnerKey);
    if (!state) {
      state = {
        runnerType: "scenegraph",
        durationSec,
        n,
        levels,
        saveResults,
        createdAt: new Date().toISOString(),
        currentIndex: 0,
        plan: buildPlan()
      };
      saveState(runnerKey, state);
    }
    return state;
  }

  function render(state) {
    const storedItems = getStoredMeasurements(runnerKey);
    const completedLevels = new Set(
      storedItems
        .filter((item) => item && item.experiment === "scenegraph" && item.n === n)
        .map((item) => item.levels)
    );
    const completed = levels.filter((level) => completedLevels.has(level)).length;
    const nextItem = state.plan.find((item) => !completedLevels.has(item.levels)) || null;
    ui.status.textContent = [
      `runnerKey=${runnerKey}`,
      `n=${n} objects=${n ** 3}`,
      `levels=${levels.join(",")}`,
      `duration=${durationSec}s`,
      `saveResults=${saveResults}`,
      `progress=${completed}/${state.plan.length}`,
      `stored=${storedItems.length}`,
      nextItem ? `next=${nextItem.label}` : "next=done"
    ].join("\n");

    ui.planBox.textContent = state.plan
      .map((item, index) => {
        const marker = completedLevels.has(item.levels) ? "[x]" : nextItem && nextItem.levels === item.levels ? "[>]" : "[ ]";
        return `${marker} ${index + 1}. ${item.label}`;
      })
      .join("\n");
  }

  function launchNext(state) {
    const storedItems = getStoredMeasurements(runnerKey);
    const completedLevels = new Set(
      storedItems
        .filter((item) => item && item.experiment === "scenegraph" && item.n === n)
        .map((item) => item.levels)
    );
    const nextItem = state.plan.find((item) => !completedLevels.has(item.levels)) || null;
    if (!nextItem) {
      render(state);
      return;
    }
    render(state);
    const testUrl = new URL("multigltf-scenegraph.html", window.location.href);
    testUrl.searchParams.set("autostart", "1");
    testUrl.searchParams.set("n", String(n));
    testUrl.searchParams.set("levels", String(nextItem.levels));
    testUrl.searchParams.set("levelsList", levels.join(","));
    testUrl.searchParams.set("levelIndex", String(nextItem.index));
    testUrl.searchParams.set("durationSec", String(durationSec));
    testUrl.searchParams.set("runIdBase", `three-scenegraph-n${n}`);
    testUrl.searchParams.set("saveResults", saveResults ? "1" : "0");
    testUrl.searchParams.set("uploadResults", "0");
    testUrl.searchParams.set("runnerKey", runnerKey);
    testUrl.searchParams.set("redirectDelayMs", String(redirectDelayMs));
    window.setTimeout(() => {
      window.location.href = testUrl.toString();
    }, 800);
  }

  function initialize() {
    const state = getState();
    render(state);
    if (autostart) {
      launchNext(state);
    }
  }

  addButton(ui.controls, "Start / Continue", () => {
    const state = getState();
    launchNext(state);
  });

  addButton(ui.controls, "Export JSON", () => {
    const exported = exportStoredMeasurements(runnerKey, `three-scenegraph-n${n}`);
    alert(`Exported ${exported.count} items to ${exported.fileName}`);
  });

  addButton(ui.controls, "Clear Results", () => {
    clearStoredMeasurements(runnerKey);
    const state = getState();
    render(state);
  });

  addButton(ui.controls, "Reset", () => {
    deleteState(runnerKey);
    clearStoredMeasurements(runnerKey);
    runnerKey = createRunnerKey(`three-scenegraph-n${n}`);
    const url = new URL(window.location.href);
    url.searchParams.set("runnerKey", runnerKey);
    url.searchParams.set("autostart", "0");
    window.location.href = url.toString();
  });

  initialize();
}
