import ReactDOM from "react-dom";

import App from "./App";
import ExperimentApp from "./ExperimentApp";

const rootElement = document.getElementById("root");
const q = new URLSearchParams(window.location.search).get("webxrExperiment");
ReactDOM.render(q === "1" ? <ExperimentApp /> : <App />, rootElement);
