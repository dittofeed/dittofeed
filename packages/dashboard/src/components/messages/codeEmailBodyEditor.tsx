import { html } from "@codemirror/lang-html";
import { lintGutter } from "@codemirror/lint";
import { EditorView } from "@codemirror/view";
import ReactCodeMirror from "@uiw/react-codemirror";
import {
  ChannelType,
  CodeEmailTemplateResource,
} from "isomorphic-lib/src/types";
import { Overwrite } from "utility-types";

import { RenderEditorParams } from "../templateEditor";

type Props = Overwrite<
  RenderEditorParams,
  {
    draft: CodeEmailTemplateResource;
  }
>;

export default function CodeEmailBodyEditor({
  draft,
  setDraft,
  disabled,
}: Props) {
  return (
    <ReactCodeMirror
      value={draft.body}
      onChange={(value) => {
        setDraft((defn) => {
          if (defn.type !== ChannelType.Email) {
            return defn;
          }

          defn.body = value;
          return defn;
        });
      }}
      readOnly={disabled}
      extensions={[
        html(),
        EditorView.theme({
          "&": {
            fontFamily: theme.typography.fontFamily,
          },
        }),
        EditorView.lineWrapping,
        lintGutter(),
      ]}
    />
  );
}
