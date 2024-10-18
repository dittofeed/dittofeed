import { html } from "@codemirror/lang-html";
import { lintGutter } from "@codemirror/lint";
import { EditorView } from "@codemirror/view";
import { useTheme } from "@mui/material";
import ReactCodeMirror from "@uiw/react-codemirror";
import {
  ChannelType,
  CodeEmailTemplateResource,
} from "isomorphic-lib/src/types";
import React, { useCallback, useMemo } from "react";
import { Overwrite } from "utility-types";

import { RenderEditorParams } from "../templateEditor";

type Props = Overwrite<
  RenderEditorParams,
  {
    draft: CodeEmailTemplateResource;
  }
>;

export default React.memo(function CodeEmailBodyEditor({
  draft,
  setDraft,
  disabled,
}: Props) {
  const theme = useTheme();

  const extensions = useMemo(
    () => [
      html(),
      EditorView.theme({
        "&": {
          fontFamily: theme.typography.fontFamily,
        },
      }),
      EditorView.lineWrapping,
      lintGutter(),
    ],
    [theme],
  );

  const handleChange = useCallback(
    (value: string) => {
      setDraft((defn) => {
        if (defn.type !== ChannelType.Email) {
          return defn;
        }

        defn.body = value;
        return defn;
      });
    },
    [setDraft],
  );

  return (
    <ReactCodeMirror
      value={draft.body}
      onChange={handleChange}
      readOnly={disabled}
      extensions={extensions}
    />
  );
});
