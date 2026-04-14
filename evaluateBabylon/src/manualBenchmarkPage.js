import {
  clearStoredMeasurements,
  deepestSceneGraphLevels,
  exportStoredMeasurements,
  getStoredMeasurements,
  nowAbsMs,
  publishMeasureError,
  publishMeasureResult
} from "../../evaluateThree/src/measureAutomation.js?v=20260322-babylon-manual-pages";

function readPositiveInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function splitModelLocation(url) {
  const slashIndex = url.lastIndexOf("/");
  return {
    rootUrl: slashIndex >= 0 ? `${url.slice(0, slashIndex + 1)}` : "",
    sceneFilename: slashIndex >= 0 ? url.slice(slashIndex + 1) : url
  };
}

function getModelUrl(assetBaseUrl, modelName, modelType) {
  const prefix = assetBaseUrl ? `${assetBaseUrl.replace(/\/+$/, "")}/gltf` : "../gltf";
  if (modelName === "Box" && modelType === "gltf") return `${prefix}/Box/Box.gltf`;
  if (modelName === "Box" && modelType === "glb") return `${prefix}/Box/Box.glb`;
  if (modelName === "BoxTextured" && modelType === "gltf") return `${prefix}/BoxTextured4/BoxTextured.gltf`;
  if (modelName === "BoxTextured" && modelType === "glb") return `${prefix}/BoxTextured/BoxTextured.glb`;
  if (modelName === "BoomBox" && modelType === "gltf") return `${prefix}/BoomBox/BoomBox.gltf`;
  if (modelName === "BoomBox" && modelType === "glb") return `${prefix}/BoomBox/BoomBox.glb`;
  if (modelName === "DamagedHelmet" && modelType === "gltf") return `${prefix}/DamagedHelmet/DamagedHelmet.gltf`;
  if (modelName === "DamagedHelmet" && modelType === "glb") return `${prefix}/DamagedHelmet/DamagedHelmet.glb`;
  throw new Error(`Unsupported model combination: ${modelName}.${modelType}`);
}

function getScale(modelName) {
  if (modelName === "BoomBox") return 5;
  return 0.05;
}

function instantiateModelFromAssets(BABYLON, scene, assets, namePrefix, allowInstances, parent) {
  const entries = assets.instantiateModelsToScene(
    (sourceName) => `${namePrefix}-${sourceName}`,
    false,
    allowInstances ? { doNotInstantiate: false } : undefined
  );
  const wrapper = new BABYLON.TransformNode(`${namePrefix}-root`, scene);
  if (parent) {
    wrapper.parent = parent;
  }
  for (const node of entries.rootNodes || []) {
    if (node && node !== wrapper) {
      node.parent = wrapper;
    }
  }
  return wrapper;
}

function buildSceneGraph(BABYLON, scene, rootForModels, currentLevel, edgeNum) {
  const groupCache = new Map();
  return function getOrCreateLeafParent(i, j, k) {
    if (currentLevel === 1) {
      return rootForModels;
    }

    let x0 = 0;
    let x1 = edgeNum - 1;
    let y0 = 0;
    let y1 = edgeNum - 1;
    let z0 = 0;
    let z1 = edgeNum - 1;
    let parent = rootForModels;
    let pathKey = "";

    for (let level = 0; level < currentLevel - 1; level += 1) {
      const mx = (x0 + x1) >> 1;
      const my = (y0 + y1) >> 1;
      const mz = (z0 + z1) >> 1;
      const bx = i > mx ? 1 : 0;
      const by = j > my ? 1 : 0;
      const bz = k > mz ? 1 : 0;
      const oct = (bx << 2) | (by << 1) | bz;
      pathKey += level === 0 ? String(oct) : `/${oct}`;

      let group = groupCache.get(pathKey);
      if (!group) {
        group = new BABYLON.TransformNode(`SG_L${level + 1}_O${oct}`, scene);
        group.parent = parent;
        groupCache.set(pathKey, group);
      }
      parent = group;

      if (bx === 0) x1 = mx; else x0 = mx + 1;
      if (by === 0) y1 = my; else y0 = my + 1;
      if (bz === 0) z1 = mz; else z0 = mz + 1;
    }

    return parent;
  };
}

function createPanel({ title, supportsLevels }) {
  const panel = document.createElement("div");
  panel.style.position = "fixed";
  panel.style.top = "10px";
  panel.style.left = "10px";
  panel.style.zIndex = "10001";
  panel.style.maxWidth = "460px";
  panel.style.background = "rgba(0, 0, 0, 0.78)";
  panel.style.padding = "12px";
  panel.style.border = "1px solid #333";
  panel.style.color = "#fff";
  panel.style.font = "13px/1.4 monospace";
  document.body.appendChild(panel);

  const heading = document.createElement("div");
  heading.textContent = title;
  heading.style.marginBottom = "8px";
  panel.appendChild(heading);

  const controls = document.createElement("div");
  controls.style.display = "grid";
  controls.style.gridTemplateColumns = "110px 1fr";
  controls.style.gap = "8px";
  controls.style.alignItems = "center";
  panel.appendChild(controls);

  function addInput(id, label, value) {
    const labelEl = document.createElement("label");
    labelEl.htmlFor = id;
    labelEl.textContent = label;
    controls.appendChild(labelEl);

    const input = document.createElement("input");
    input.id = id;
    input.value = value;
    input.style.font = "inherit";
    input.style.padding = "4px 6px";
    controls.appendChild(input);
    return input;
  }

  const nInput = addInput("measure-n", "n", "2");
  nInput.type = "number";
  nInput.min = "1";
  nInput.step = "1";

  let levelsInput = null;
  if (supportsLevels) {
    levelsInput = addInput("measure-levels", "levels", "1");
    levelsInput.type = "number";
    levelsInput.min = "1";
    levelsInput.step = "1";
  }

  const durationInput = addInput("measure-duration", "durationSec", "60");
  durationInput.type = "number";
  durationInput.min = "1";
  durationInput.step = "1";

  const runnerKeyInput = addInput("measure-runner-key", "runnerKey", "babylon-manual");
  runnerKeyInput.type = "text";

  const assetBaseUrlInput = addInput("measure-asset-base", "assetBaseUrl", "");
  assetBaseUrlInput.type = "text";

  const actions = document.createElement("div");
  actions.style.display = "flex";
  actions.style.flexWrap = "wrap";
  actions.style.gap = "8px";
  actions.style.marginTop = "10px";
  panel.appendChild(actions);

  function addButton(label) {
    const button = document.createElement("button");
    button.textContent = label;
    button.style.font = "inherit";
    button.style.padding = "4px 8px";
    actions.appendChild(button);
    return button;
  }

  const startButton = addButton("Start current config");
  const reloadButton = addButton("Reload page with params");
  const exportButton = addButton("Export JSON");
  const clearButton = addButton("Clear local results");

  const statusBox = document.createElement("pre");
  statusBox.style.marginTop = "10px";
  statusBox.style.whiteSpace = "pre-wrap";
  panel.appendChild(statusBox);

  const resultsBox = document.createElement("pre");
  resultsBox.style.marginTop = "10px";
  resultsBox.style.whiteSpace = "pre-wrap";
  resultsBox.style.maxHeight = "220px";
  resultsBox.style.overflow = "auto";
  panel.appendChild(resultsBox);

  return {
    nInput,
    levelsInput,
    durationInput,
    runnerKeyInput,
    assetBaseUrlInput,
    startButton,
    reloadButton,
    exportButton,
    clearButton,
    statusBox,
    resultsBox
  };
}

export function setupBabylonManualPage(options) {
  const {
    BABYLON,
    canvas,
    experiment,
    mode,
    title,
    modelName = "BoxTextured",
    modelType = "gltf",
    supportsLevels = false,
    defaultN = supportsLevels ? 16 : 2,
    defaultLevels = 1,
    defaultRunnerKey
  } = options;

  const params = new URLSearchParams(window.location.search);
  const ui = createPanel({ title, supportsLevels });
  ui.nInput.value = params.get("n") || String(defaultN);
  if (ui.levelsInput) {
    ui.levelsInput.value = params.get("levels") || String(defaultLevels);
  }
  ui.durationInput.value = params.get("durationSec") || "60";
  ui.runnerKeyInput.value = params.get("runnerKey") || defaultRunnerKey;
  ui.assetBaseUrlInput.value = params.get("assetBaseUrl") || "";

  let engine = null;
  let scene = null;
  let measuring = false;
  let loaded = false;
  let finished = false;
  let clickTimeAbsMs = null;
  let sceneLoadedTimeAbsMs = null;
  let startTime = null;
  let startTimeAbsMs = null;
  let frameCount = 0;
  let frameSum = 0;
  let shouldLog = true;

  function getConfig() {
    const n = readPositiveInt(ui.nInput.value, defaultN);
    const durationSec = readPositiveInt(ui.durationInput.value, 60);
    const levels = supportsLevels
      ? Math.min(Math.max(readPositiveInt(ui.levelsInput.value, defaultLevels), 1), deepestSceneGraphLevels(n))
      : null;
    return {
      framework: "babylon",
      experiment,
      mode,
      n,
      levels,
      deepestLevels: supportsLevels ? deepestSceneGraphLevels(n) : null,
      durationSec,
      modelName,
      modelType,
      saveResults: true,
      uploadResults: false,
      runnerKey: ui.runnerKeyInput.value.trim() || defaultRunnerKey,
      assetBaseUrl: ui.assetBaseUrlInput.value.trim().replace(/\/+$/, "")
    };
  }

  function getRunId(config) {
    const repeat = getStoredMeasurements(config.runnerKey)
      .filter((item) =>
        item &&
        item.framework === "babylon" &&
        item.experiment === config.experiment &&
        item.mode === config.mode &&
        item.n === config.n &&
        (!supportsLevels || item.levels === config.levels)
      ).length + 1;
    if (supportsLevels) {
      return `babylon-scenegraph-n${config.n}-l${config.levels}-r${repeat}`;
    }
    return `babylon-${config.mode}-n${config.n}-r${repeat}`;
  }

  function renderStatus(extra) {
    const config = getConfig();
    const lines = [
      `framework=babylon`,
      `experiment=${config.experiment}`,
      `mode=${config.mode}`,
      `n=${config.n} objects=${config.n ** 3}`,
      `duration=${config.durationSec}s`,
      `runnerKey=${config.runnerKey}`,
      `assetBaseUrl=${config.assetBaseUrl || "(same origin)"}`,
      extra || (measuring ? "status=running" : "status=ready"),
      "note=results are saved locally after every run"
    ];
    if (supportsLevels) {
      lines.splice(4, 0, `levels=${config.levels}/${config.deepestLevels}`);
    }
    ui.statusBox.textContent = lines.join("\n");
  }

  function renderResults() {
    const config = getConfig();
    const items = getStoredMeasurements(config.runnerKey)
      .filter((item) => item && item.framework === "babylon" && item.experiment === config.experiment && item.mode === config.mode)
      .sort((a, b) => (a.reportedAtAbsMs || 0) - (b.reportedAtAbsMs || 0));

    ui.resultsBox.textContent = items.length
      ? items.map((item) => {
        if (item.status && item.status !== "ok") {
          return `${item.runId} n=${item.n}${item.levels != null ? ` levels=${item.levels}` : ""} status=${item.status} message=${item.message || "unknown"}`;
        }
        return `${item.runId} n=${item.n}${item.levels != null ? ` levels=${item.levels}` : ""} loading=${item.loadingTimeMs?.toFixed?.(1) ?? item.loadingTimeMs}ms fps=${item.fps?.toFixed?.(2) ?? item.fps} ft=${item.frameTimeMs?.toFixed?.(3) ?? item.frameTimeMs}`;
      }).join("\n")
      : "no local results yet";
  }

  function syncUrl() {
    const config = getConfig();
    const nextUrl = new URL(window.location.href);
    nextUrl.searchParams.set("n", String(config.n));
    nextUrl.searchParams.set("durationSec", String(config.durationSec));
    nextUrl.searchParams.set("runnerKey", config.runnerKey);
    if (supportsLevels) {
      nextUrl.searchParams.set("levels", String(config.levels));
    }
    if (config.assetBaseUrl) {
      nextUrl.searchParams.set("assetBaseUrl", config.assetBaseUrl);
    } else {
      nextUrl.searchParams.delete("assetBaseUrl");
    }
    history.replaceState(null, "", nextUrl.toString());
  }

  function setControlsDisabled(disabled) {
    ui.nInput.disabled = disabled;
    if (ui.levelsInput) ui.levelsInput.disabled = disabled;
    ui.durationInput.disabled = disabled;
    ui.runnerKeyInput.disabled = disabled;
    ui.assetBaseUrlInput.disabled = disabled;
    ui.startButton.disabled = disabled;
  }

  function disposeCurrentScene() {
    if (engine) {
      engine.stopRenderLoop();
    }
    if (scene) {
      scene.dispose();
      scene = null;
    }
    if (engine) {
      engine.dispose();
      engine = null;
    }
  }

  function resetMetrics() {
    loaded = false;
    finished = false;
    clickTimeAbsMs = null;
    sceneLoadedTimeAbsMs = null;
    startTime = null;
    startTimeAbsMs = null;
    frameCount = 0;
    frameSum = 0;
    shouldLog = true;
  }

  async function startMeasurement() {
    if (measuring) return;

    const config = getConfig();
    measuring = true;
    setControlsDisabled(true);
    syncUrl();
    renderStatus("status=starting");
    renderResults();
    resetMetrics();
    disposeCurrentScene();

    clickTimeAbsMs = nowAbsMs();
    console.log("click time", clickTimeAbsMs);

    const minx = -0.5;
    const miny = -1.1;
    const minz = -10;
    const maxx = 0.5;
    const maxy = 1.1;
    const maxz = -2;
    const stepDenom = Math.max(1, config.n - 1);
    const scale = getScale(config.modelName);

    engine = new BABYLON.Engine(canvas, true, undefined, true);
    scene = new BABYLON.Scene(engine);
    scene.createDefaultCameraOrLight(true, true, true);
    scene.activeCamera.alpha += Math.PI;
    scene.clearColor = new BABYLON.Color3(0, 0, 0);

    const modelLocation = splitModelLocation(getModelUrl(config.assetBaseUrl, config.modelName, config.modelType));

    try {
      const assets = await BABYLON.SceneLoader.LoadAssetContainerAsync(
        modelLocation.rootUrl,
        modelLocation.sceneFilename,
        scene
      );

      const allowInstances = experiment === "instance" && mode === "instance";
      let getOrCreateLeafParent = null;
      if (supportsLevels) {
        const rootForModels = config.levels === 1 ? null : new BABYLON.TransformNode(`SG_root_L${config.levels}`, scene);
        getOrCreateLeafParent = buildSceneGraph(BABYLON, scene, rootForModels, config.levels, config.n);
      }

      for (let i = 0; i < config.n; i += 1) {
        for (let j = 0; j < config.n; j += 1) {
          for (let k = 0; k < config.n; k += 1) {
            const curx = minx + ((maxx - minx) / stepDenom) * i;
            const cury = miny + ((maxy - miny) / stepDenom) * j;
            const curz = minz + ((maxz - minz) / stepDenom) * k;
            const parent = getOrCreateLeafParent ? getOrCreateLeafParent(i, j, k) : null;
            const modelRoot = instantiateModelFromAssets(BABYLON, scene, assets, `${experiment}-${mode}-${i}-${j}-${k}`, allowInstances, parent);
            modelRoot.scaling = new BABYLON.Vector3(scale, scale, -scale);
            modelRoot.position = new BABYLON.Vector3(curx, cury, curz);
          }
        }
      }

      loaded = true;
      sceneLoadedTimeAbsMs = nowAbsMs();
      renderStatus("status=running");
      console.log("scene loaded time", sceneLoadedTimeAbsMs);
    } catch (exception) {
      await publishMeasureError({
        framework: config.framework,
        experiment: config.experiment,
        mode: config.mode,
        n: config.n,
        levels: supportsLevels ? config.levels : null,
        totalObjects: config.n ** 3,
        modelName: config.modelName,
        modelType: config.modelType,
        clickTimeAbsMs,
        message: exception?.message || "Babylon load failed",
        runId: getRunId(config)
      }, null, config);
      measuring = false;
      setControlsDisabled(false);
      renderStatus("status=error");
      renderResults();
      return;
    }

    engine.runRenderLoop(async () => {
      if (!scene) return;
      const frameStart = performance.now();
      scene.render();
      if (!loaded || finished) return;

      const time = performance.now();
      frameSum += time - frameStart;
      if (startTime === null) {
        startTime = time;
        startTimeAbsMs = nowAbsMs();
        console.log("startTime", startTimeAbsMs);
      }
      frameCount += 1;

      if (frameCount % 1000 === 0) {
        const fps = 1000 * frameCount / (time - startTime);
        const ft = frameSum / frameCount;
        console.log(frameCount, fps, "fps", ft, "ft");
      }

      if ((time - startTime) / 1000 > config.durationSec && shouldLog) {
        shouldLog = false;
        finished = true;
        const fps = 1000 * frameCount / (time - startTime);
        const ft = frameSum / frameCount;
        console.log("done", (time - startTime) / 1000, frameCount, fps, "fps", ft, "ft");
        await publishMeasureResult({
          status: "ok",
          framework: config.framework,
          experiment: config.experiment,
          mode: config.mode,
          n: config.n,
          totalObjects: config.n ** 3,
          levels: supportsLevels ? config.levels : null,
          durationSec: config.durationSec,
          modelName: config.modelName,
          modelType: config.modelType,
          clickTimeAbsMs,
          sceneLoadedTimeAbsMs,
          loadingTimeMs: sceneLoadedTimeAbsMs == null ? null : sceneLoadedTimeAbsMs - clickTimeAbsMs,
          startTimeAbsMs,
          frameCount,
          fps,
          frameTimeMs: ft,
          runId: getRunId(config)
        }, null, config);
        engine.stopRenderLoop();
        measuring = false;
        setControlsDisabled(false);
        renderStatus("status=done");
        renderResults();
      }
    });
  }

  function reloadWithParams() {
    syncUrl();
    window.location.reload();
  }

  ui.startButton.onclick = () => startMeasurement();
  ui.reloadButton.onclick = () => reloadWithParams();
  ui.exportButton.onclick = () => {
    const config = getConfig();
    const exported = exportStoredMeasurements(config.runnerKey, `babylon-${experiment}-${mode}`);
    alert(`Exported ${exported.count} items to ${exported.fileName}`);
  };
  ui.clearButton.onclick = () => {
    const config = getConfig();
    clearStoredMeasurements(config.runnerKey);
    renderStatus();
    renderResults();
  };

  ui.nInput.addEventListener("change", () => {
    if (supportsLevels && ui.levelsInput) {
      ui.levelsInput.max = String(deepestSceneGraphLevels(readPositiveInt(ui.nInput.value, defaultN)));
    }
    renderStatus();
  });
  if (ui.levelsInput) ui.levelsInput.addEventListener("change", renderStatus);
  ui.durationInput.addEventListener("change", renderStatus);
  ui.runnerKeyInput.addEventListener("change", () => {
    renderStatus();
    renderResults();
  });
  ui.assetBaseUrlInput.addEventListener("change", renderStatus);

  window.addEventListener("resize", () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    if (engine) {
      engine.resize();
    }
  });

  renderStatus();
  renderResults();
}
