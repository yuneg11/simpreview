import "./styles.css";
import "github-markdown-css/github-markdown-light.css";
import "highlight.js/styles/github.css";

import { render } from "preact";

import { App } from "./App";
import { initApp } from "./state";

const root = document.getElementById("app");
if (root) {
  initApp();
  render(<App />, root);
}
