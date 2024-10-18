import * as Popover from "@radix-ui/react-popover";
import { Editor } from "@tiptap/core";
import React from "react";

import { isNodeTypeSelected } from "../utils/isNodeTypeSelected";
import { Icon } from "./icon";
// change path
import { LinkEditorPanel } from "./panels/linkEditorPanel";
import { Toolbar } from "./toolbar";

export type EditLinkPopoverProps = {
  onSetLink: (link: string, openInNewTab?: boolean) => void;
  isUnsubscribeLinkSelected: boolean;
};

export function useEditLinkPopover({ editor }: { editor: Editor }) {
  const isUnsubscribeLinkSelected = isNodeTypeSelected(
    editor,
    "unsubscribeLink",
  );

  return { isUnsubscribeLinkSelected };
}

export function EditLinkPopover({
  isUnsubscribeLinkSelected,
  onSetLink,
}: EditLinkPopoverProps) {
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
