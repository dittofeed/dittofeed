import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import { createRPCClient } from "vite-dev-rpc";

import { Button } from "../src/components/button";
import { defaultEmailoContent, Emailo, useEmailo } from "../src/emailo";
import { toMjml } from "../src/toMjml";
import { MJMLError } from "./rpc";

if (!import.meta.hot) {
  throw new Error("Hot module replacement is not supported in production");
}

const rpc = createRPCClient<
  {
    mjmlToHtml: (
      html: string,
      user?: Record<string, any>,
    ) => string | MJMLError[];
  },
  unknown
>("rpc", import.meta.hot);

const root = document.getElementById("root");
if (!root) {
  throw new Error("No root element found");
}

function RenderedPreview({ html }: { html: string }) {
  const [rendered, setRendered] = useState(html);
  useEffect(() => {
    rpc.mjmlToHtml(html).then((result) => {
      if (Array.isArray(result)) {
        setRendered(JSON.stringify(result, null, 2));
      } else {
        setRendered(result);
      }
    });
  }, [html]);

  return (
    <div
      className="w-full h-full"
      style={{
        padding: "20px 32px",
      }}
    >
      <iframe
        srcDoc={rendered}
        style={{ width: "100%", height: "100%", border: "none" }}
        title="Rendered Email Preview"
      />
    </div>
  );
}

function Rendered({ html }: { html: string }) {
  const [rendered, setRendered] = useState(html);
  useEffect(() => {
    rpc
      .mjmlToHtml(html, {
        age: 20,
        name: "John",
      })
      .then((result) => {
        if (Array.isArray(result)) {
          setRendered(JSON.stringify(result, null, 2));
        } else {
          setRendered(result);
        }
      });
  }, [html]);

  return (
    <div
      className="w-full h-full"
      style={{
        padding: "20px 32px",
      }}
    >
      <iframe
        srcDoc={rendered}
        style={{ width: "100%", height: "100%", border: "none" }}
        title="Rendered Email"
      />
    </div>
  );
}

function Main() {
  const state = useEmailo({
    content: defaultEmailoContent,
    userProperties: [
      {
        name: "name",
      },
      {
        name: "age",
      },
      {
        name: "favoriteColor",
      },
      {
        name: "email",
      },
    ],
  });
  const [view, setView] = useState<
    "editor" | "json" | "pre-rendered-preview" | "rendered-preview" | "rendered"
  >("editor");

  if (!state) {
    return null;
  }

  let body;
  switch (view) {
    case "editor":
      body = <Emailo state={state} />;
      break;
    case "json":
      body = <pre>{JSON.stringify(state.editor.getJSON(), null, 2)}</pre>;
      break;
    case "pre-rendered-preview":
      body = toMjml({ content: state.editor.getJSON(), mode: "preview" });
      break;
    case "rendered-preview":
      body = (
        <RenderedPreview
          html={toMjml({ content: state.editor.getJSON(), mode: "preview" })}
        />
      );
      break;
    case "rendered":
      body = (
        <Rendered
          html={toMjml({ content: state.editor.getJSON(), mode: "render" })}
        />
      );
      break;
  }
  return (
    <div className="flex flex-col space-y-4 h-full">
      <div className="flex items-center justify-center w-full space-x-4">
        <Button
          type="button"
          onClick={() => setView("editor")}
          variant={view === "editor" ? "primary" : "ghost"}
        >
          Editor
        </Button>
        <Button
          type="button"
          onClick={() => setView("json")}
          variant={view === "json" ? "primary" : "ghost"}
        >
          JSON
        </Button>
        <Button
          type="button"
          onClick={() => setView("pre-rendered-preview")}
          variant={view === "pre-rendered-preview" ? "primary" : "ghost"}
        >
          Pre-rendered Preview
        </Button>
        <Button
          type="button"
          onClick={() => setView("rendered-preview")}
          variant={view === "rendered-preview" ? "primary" : "ghost"}
        >
          Rendered Preview
        </Button>
        <Button
          type="button"
          onClick={() => setView("rendered")}
          variant={view === "rendered" ? "primary" : "ghost"}
        >
          Rendered
        </Button>
      </div>
      <div className="flex-1">{body}</div>
    </div>
  );
}

/**
 * Entry point for the emailo snippet, used for development with vite.
 */
ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <Main />
  </React.StrictMode>,
);
