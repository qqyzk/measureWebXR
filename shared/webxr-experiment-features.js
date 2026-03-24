/**
 * WebXR optionalFeatures 与 UI 开关映射（供各实验页 import）
 */
export const FEATURE_IDS = {
  hitTest: 'hit-test',
  anchors: 'anchors',
  planeDetection: 'plane-detection',
  lightEstimation: 'light-estimation',
  objectTracking: 'object-tracking',
};

export function optionalFeaturesFromFlags(flags, includeDomOverlay = true) {
  const list = [];
  if (includeDomOverlay) list.push('dom-overlay');
  if (flags.hitTest) list.push(FEATURE_IDS.hitTest);
  if (flags.anchors) list.push(FEATURE_IDS.anchors);
  if (flags.planeDetection) list.push(FEATURE_IDS.planeDetection);
  if (flags.lightEstimation) list.push(FEATURE_IDS.lightEstimation);
  if (flags.objectTracking) list.push(FEATURE_IDS.objectTracking);
  return list;
}

export function readFlagsFromDom(root) {
  const q = (name) => !!root.querySelector(`input[name="${name}"]`)?.checked;
  return {
    hitTest: q('hitTest'),
    anchors: q('anchors'),
    planeDetection: q('planeDetection'),
    lightEstimation: q('lightEstimation'),
    objectTracking: q('objectTracking'),
  };
}

export function buildDomOverlayShell({ title = 'WebXR 实验' } = {}) {
  const root = document.createElement('div');
  root.id = 'dom-overlay-root';
  root.innerHTML = `
    <div class="stats-wrap" id="stats-mount"></div>
    <div class="glass-dock" id="glass-dock">
      <div class="glass-dock-inner">
        <div class="toggle-row" aria-label="features">
          <span class="dock-title">${title}</span>
          <label class="chk"><input type="checkbox" name="hitTest" checked> Hit test</label>
          <label class="chk"><input type="checkbox" name="anchors"> Anchors</label>
          <label class="chk"><input type="checkbox" name="planeDetection"> Plane</label>
          <label class="chk"><input type="checkbox" name="lightEstimation"> Light est.</label>
          <label class="chk"><input type="checkbox" name="objectTracking"> Object tr.</label>
        </div>
        <div class="run-btn-wrap">
          <button type="button" class="run-btn" id="run-toggle">
            <span class="run-btn-spinner" aria-hidden="true"></span>
            <span class="run-btn-label">RUN</span>
          </button>
        </div>
      </div>
    </div>`;
  return root;
}
