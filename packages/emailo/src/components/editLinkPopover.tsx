import * as Popover from "@radix-ui/react-popover";
import { Editor } from "@tiptap/core";
import React from "react";

import { isNodeTypeSelected } from "../utils/isNodeTypeSelected";
import { Icon } from "./icon";
import { LinkEditorPanel } from "./panels";
import { Toolbar } from "./toolbar";

export type EditLinkPopoverProps = {
  onSetLink: (link: string, openInNewTab?: boolean) => void;
  editor: Editor;
};

export function EditLinkPopover({ editor, onSetLink }: EditLinkPopoverProps) {
  const isUnsubscribeLinkSelected = isNodeTypeSelected(
    editor,
    "unsubscribeLink",
  );

  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <Toolbar.Button tooltip="Set Link" disabled={isUnsubscribeLinkSelected}>
          <Icon name="Link" />
        </Toolbar.Button>
      </Popover.Trigger>
      <Popover.Content>
        <LinkEditorPanel onSetLink={onSetLink} />
      </Popover.Content>
    </Popover.Root>
  );
}
