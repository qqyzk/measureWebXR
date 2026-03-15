import ReactDOM from "react-dom";

import App from "./App";
import AppLighting from "./AppLighting";
import AppParticles from "./AppParticles";
import AppAnimation from "./AppAnimation";

const rootElement = document.getElementById("root");
const effect = new URLSearchParams(window.location.search).get("effect") || "legacy";

let RootComponent = AppLighting;
if (effect === "particles") {
  RootComponent = AppParticles;
} else if (effect === "animation") {
  RootComponent = AppAnimation;
} else if (effect === "legacy") {
  RootComponent = App;
}

ReactDOM.render(<RootComponent />, rootElement);
