# WebXR controlled variable experiment

Toggle optional WebXR features (hit test, anchors, plane detection, light estimation, object tracking) and compare performance.

## Run

From the repo root:

```bash
npx http-server -c-1
```

Replace `127.0.0.1:8080` with your host/port if different.

## Experiment URLs (static `http-server`)

| Framework | URL |
|-----------|-----|
| Three.js | `http://127.0.0.1:8080/evaluateThree/multigltf-ar-webxr-experiment.html` |
| Babylon.js | `http://127.0.0.1:8080/evaluateBabylon/multigltf-ar-webxr-experiment.html` |
| A-Frame | `http://127.0.0.1:8080/evaluateAframe/multigltf-ar-webxr-experiment.html` |
| PlayCanvas | `http://127.0.0.1:8080/evaluatePlaycanvas/multigltf-ar-webxr-experiment.html` |
| AR.js | `http://127.0.0.1:8080/evaluateAR/webxr-ar-experiment.html` |
| MindAR | `http://127.0.0.1:8080/evaluateMindAR/webxr-ar-experiment.html` |
| React Three Fiber | After `npm run build` in `evaluateReactThreeFiber/multigltf-ar`: `http://127.0.0.1:8080/evaluateReactThreeFiber/multigltf-ar/build/index.html?webxrExperiment=1` |

Entry page (links + notes): `http://127.0.0.1:8080/evaluateReactThreeFiber/index.html`

## React Three Fiber (dev server)

- `cd evaluateReactThreeFiber/multigltf-ar && npm start` → `http://localhost:3000/?webxrExperiment=1`

## Desktop WebXR

Use Chrome with the [Immersive Web Emulator](https://chromewebstore.google.com/detail/immersive-web-emulator/cgffilbpcibhmcfbgggfhfolhkfbhmik) if you test without a headset.
