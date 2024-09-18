import React from "react";
import ReactDOM from "react-dom/client";

import { Emailo } from "./emailo";

const root = document.getElementById("root");
if (!root) {
  throw new Error("No root element found");
}

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <Emailo />
  </React.StrictMode>,
);
