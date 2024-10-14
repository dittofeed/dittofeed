import "emailo/styles.css";

import { Box } from "@mui/material";
import { Emailo, useEmailo } from "emailo";
import {
  ChannelType,
  CompletionStatus,
  LowCodeEmailTemplateResource,
} from "isomorphic-lib/src/types";
import { Overwrite } from "utility-types";

import { useAppStorePick } from "../../lib/appStore";
import { RenderEditorParams } from "../templateEditor";

type LowCodeProps = Overwrite<
  RenderEditorParams,
  {
    draft: LowCodeEmailTemplateResource;
  }
>;

export default function LowCodeEmailBodyEditor({
  draft,
  disabled,
  setDraft,
}: LowCodeProps) {
  const content = draft.body;
  const { userProperties: userPropertiesRequest } = useAppStorePick([
    "userProperties",
  ]);
  const userProperties =
    userPropertiesRequest.type === CompletionStatus.Successful
      ? userPropertiesRequest.value
      : [];

  const state = useEmailo({
    content,
    userProperties: userProperties.map((userProperty) => ({
      name: userProperty.name,
    })),
    onUpdate: (updatedContent) => {
      setDraft((defn) => {
        if (defn.type !== ChannelType.Email || !("emailContentsType" in defn)) {
          return defn;
        }

        const json = updatedContent.editor.getJSON();
        defn.body = json;
        console.log("updatedContent", json);
        return defn;
      });
    },
  });
  if (!state) {
    return null;
  }
  return (
    <Box p={0}>
      <Emailo state={state} disabled={disabled} />
    </Box>
  );
}
