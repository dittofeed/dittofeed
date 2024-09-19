import React from "react";
import ReactDOM from "react-dom/client";

import { Emailo } from "../src/emailo";

const root = document.getElementById("root");
if (!root) {
  throw new Error("No root element found");
}

function Main() {
  return (
    <div className="flex flex-col space-y-4">
      <div className="flex items-center justify-center w-full">
        <div>header</div>
      </div>
      <div>
        <Emailo />
      </div>
    </div>
  );
}

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <Main />
  </React.StrictMode>,
);
