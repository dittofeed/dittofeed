import React from "react";

import { Icon } from "../icon";
import { Surface } from "../surface";
import { Toolbar } from "../toolbar";
import { Tooltip } from "../tooltip";

export type LinkPreviewPanelProps = {
  url: string;
  onEdit: () => void;
  onClear: () => void;
};

export function LinkPreviewPanel({
  onClear,
  onEdit,
  url,
}: LinkPreviewPanelProps) {
  return (
    <Surface className="flex items-center gap-2 p-2">
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-sm underline break-all"
      >
        {url}
      </a>
      <Toolbar.Divider />
      <Tooltip title="Edit link">
        <Toolbar.Button onClick={onEdit}>
          <Icon name="Pen" />
        </Toolbar.Button>
      </Tooltip>
      <Tooltip title="Remove link">
        <Toolbar.Button onClick={onClear}>
          <Icon name="Trash2" />
        </Toolbar.Button>
      </Tooltip>
    </Surface>
  );
}
