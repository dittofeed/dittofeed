import { Search as SearchIcon } from "@mui/icons-material";
import { Dialog, useTheme } from "@mui/material";
import { Command } from "cmdk";
import { ChannelType, CompletionStatus } from "isomorphic-lib/src/types";
import { useRouter } from "next/router";
import React, { useCallback, useEffect } from "react";

import { useAppStorePick } from "../lib/appStore";
import { useResourcesQuery } from "../lib/useResourcesQuery";

// Map channel type to route path
function getTemplateChannelPath(channel?: ChannelType): string {
  switch (channel) {
    case ChannelType.Email:
      return "email";
    case ChannelType.Sms:
      return "sms";
    case ChannelType.MobilePush:
      return "mobilepush";
    case ChannelType.Webhook:
      return "webhook";
    default:
      return "email"; // fallback
  }
}

// Command Palette Component
export default function CommandPalette() {
  const theme = useTheme();
  const router = useRouter();
  const { workspace, commandPaletteOpen, setCommandPaletteOpen } =
    useAppStorePick([
      "workspace",
      "commandPaletteOpen",
      "setCommandPaletteOpen",
    ]);

  // Keyboard shortcut handler
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      // Check for Cmd+K (Mac) or Ctrl+K (Windows/Linux)
      if ((event.metaKey || event.ctrlKey) && event.key === "k") {
        event.preventDefault();
        setCommandPaletteOpen(!commandPaletteOpen);
      }
    },
    [commandPaletteOpen, setCommandPaletteOpen],
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  // Only fetch when workspace is loaded
  const workspaceReady = workspace.type === CompletionStatus.Successful;

  const { data } = useResourcesQuery(
    {
      journeys: true,
      segments: true,
      messageTemplates: true,
      subscriptionGroups: true,
    },
    {
      enabled: workspaceReady && commandPaletteOpen,
    },
  );

  const handleSelect = useCallback(
    (path: string) => {
      router.push(path);
      setCommandPaletteOpen(false);
    },
    [router, setCommandPaletteOpen],
  );

  return (
    <Dialog
      open={commandPaletteOpen}
      onClose={() => setCommandPaletteOpen(false)}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: {
          overflow: "hidden",
          borderRadius: 2,
          // CSS custom properties for cmdk styling
          "--cmdk-background": theme.palette.background.paper,
          "--cmdk-border": theme.palette.divider,
          "--cmdk-text-primary": theme.palette.text.primary,
          "--cmdk-text-secondary": theme.palette.text.secondary,
          "--cmdk-selected-background": theme.palette.grey[100],
          "--cmdk-hover-background": theme.palette.grey[50],
        },
      }}
    >
      <Command label="Search resources">
        <Command.Input
          placeholder="Search journeys, segments, templates..."
          autoFocus
        />
        <Command.List>
          <Command.Empty>No results found.</Command.Empty>

          {data?.journeys && data.journeys.length > 0 && (
            <Command.Group heading="Journeys">
              {data.journeys.map((journey) => (
                <Command.Item
                  key={journey.id}
                  value={`journey ${journey.name}`}
                  onSelect={() => handleSelect(`/journeys/${journey.id}`)}
                >
                  <SearchIcon
                    sx={{ mr: 1, fontSize: 16, color: "text.secondary" }}
                  />
                  {journey.name}
                </Command.Item>
              ))}
            </Command.Group>
          )}

          {data?.segments && data.segments.length > 0 && (
            <Command.Group heading="Segments">
              {data.segments.map((segment) => (
                <Command.Item
                  key={segment.id}
                  value={`segment ${segment.name}`}
                  onSelect={() => handleSelect(`/segments/${segment.id}`)}
                >
                  <SearchIcon
                    sx={{ mr: 1, fontSize: 16, color: "text.secondary" }}
                  />
                  {segment.name}
                </Command.Item>
              ))}
            </Command.Group>
          )}

          {data?.messageTemplates && data.messageTemplates.length > 0 && (
            <Command.Group heading="Message Templates">
              {data.messageTemplates.map((template) => (
                <Command.Item
                  key={template.id}
                  value={`template ${template.name}`}
                  onSelect={() =>
                    handleSelect(
                      `/templates/${getTemplateChannelPath(template.channel)}/${template.id}`,
                    )
                  }
                >
                  <SearchIcon
                    sx={{ mr: 1, fontSize: 16, color: "text.secondary" }}
                  />
                  {template.name}
                </Command.Item>
              ))}
            </Command.Group>
          )}

          {data?.subscriptionGroups && data.subscriptionGroups.length > 0 && (
            <Command.Group heading="Subscription Groups">
              {data.subscriptionGroups.map((group) => (
                <Command.Item
                  key={group.id}
                  value={`subscription group ${group.name}`}
                  onSelect={() =>
                    handleSelect(`/subscription-groups/${group.id}`)
                  }
                >
                  <SearchIcon
                    sx={{ mr: 1, fontSize: 16, color: "text.secondary" }}
                  />
                  {group.name}
                </Command.Item>
              ))}
            </Command.Group>
          )}
        </Command.List>
      </Command>
    </Dialog>
  );
}
