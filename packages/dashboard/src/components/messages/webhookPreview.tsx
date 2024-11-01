import { json as codeMirrorJson, jsonParseLinter } from "@codemirror/lang-json";
import { linter, lintGutter } from "@codemirror/lint";
import { EditorView } from "@codemirror/view";
import { useTheme } from "@mui/material";
import ReactCodeMirror from "@uiw/react-codemirror";
import React from "react";

export function WebhookPreviewBody({ body }: { body: string }) {
  const theme = useTheme();
  return (
    <ReactCodeMirror
      value={body}
      height="100%"
      readOnly
      editable={false}
      extensions={[
        codeMirrorJson(),
        linter(jsonParseLinter()),
        EditorView.lineWrapping,
        EditorView.editable.of(false),
        EditorView.theme({
          "&": {
            fontFamily: theme.typography.fontFamily,
          },
        }),
        lintGutter(),
      ]}
    />
  );
}
