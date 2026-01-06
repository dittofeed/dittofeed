import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import {
  Autocomplete,
  CircularProgress,
  IconButton,
  Stack,
  TextField,
  Tooltip,
} from "@mui/material";
import { ChannelType } from "isomorphic-lib/src/types";
import { useRouter } from "next/router";
import { useMemo } from "react";

import { getResourceUrl } from "../lib/resourceUrls";
import { buildResourceUrlWithReturn } from "../lib/returnNavigation";
import { ResourceType } from "../lib/types";
import { useNavigationGuard } from "../lib/useNavigationGuard";
import { useResourcesQuery } from "../lib/useResourcesQuery";

export interface ResourceOption {
  id: string;
  name: string;
  channel?: ChannelType;
}

export interface ResourceSelectProps {
  resourceType: ResourceType;
  value: string | null;
  onChange: (
    resourceId: string | null,
    resource: ResourceOption | null,
  ) => void;
  label?: string;
  disabled?: boolean;
  channel?: ChannelType;
  enableClickThrough?: boolean;
  /** Label to use for return link when navigating away from current page */
  currentPageLabel?: string;
}

function getResourceLabel(resource: ResourceOption): string {
  return resource.name;
}

export default function ResourceSelect({
  resourceType,
  value,
  onChange,
  label,
  disabled,
  channel,
  enableClickThrough = true,
  currentPageLabel,
}: ResourceSelectProps) {
  const router = useRouter();
  const { isNavigating, navigateSafely } = useNavigationGuard();

  // Use useResourcesQuery for minimal resource loading
  const { data, isLoading } = useResourcesQuery(
    {
      messageTemplates: resourceType === ResourceType.MessageTemplate,
      segments: resourceType === ResourceType.Segment,
      subscriptionGroups: resourceType === ResourceType.SubscriptionGroup,
      journeys: resourceType === ResourceType.Journey,
      userProperties: resourceType === ResourceType.UserProperty,
    },
    {
      // Only enable the query for the specific resource type
      enabled: true,
    },
  );

  const options = useMemo((): ResourceOption[] => {
    switch (resourceType) {
      case ResourceType.MessageTemplate: {
        const templates = data?.messageTemplates ?? [];
        const filtered = channel
          ? templates.filter((t) => t.channel === channel)
          : templates;
        return filtered.map((t) => ({
          id: t.id,
          name: t.name,
          channel: t.channel,
        }));
      }
      case ResourceType.Segment: {
        const segments = data?.segments ?? [];
        return segments.map((s) => ({
          id: s.id,
          name: s.name,
        }));
      }
      case ResourceType.SubscriptionGroup: {
        const groups = data?.subscriptionGroups ?? [];
        const filtered = channel
          ? groups.filter((g) => g.channel === channel)
          : groups;
        return filtered.map((g) => ({
          id: g.id,
          name: g.name,
          channel: g.channel,
        }));
      }
      case ResourceType.Journey: {
        const journeys = data?.journeys ?? [];
        return journeys.map((j) => ({
          id: j.id,
          name: j.name,
        }));
      }
      case ResourceType.UserProperty: {
        const userProperties = data?.userProperties ?? [];
        return userProperties.map((up) => ({
          id: up.id,
          name: up.name,
        }));
      }
      default:
        return [];
    }
  }, [resourceType, data, channel]);

  const selectedResource = useMemo(() => {
    return options.find((o) => o.id === value) ?? null;
  }, [options, value]);

  const handleClickThrough = () => {
    if (!selectedResource || isNavigating) return;

    // Get current page info for return navigation
    const currentPath = router.asPath;
    const returnLabel = currentPageLabel ?? "Previous Page";

    // Build resource URL
    const resourceUrl = getResourceUrl(resourceType, selectedResource.id, {
      channel: selectedResource.channel,
    });

    // Build URL with return navigation params
    const urlWithReturn = buildResourceUrlWithReturn(
      resourceUrl,
      currentPath,
      returnLabel,
    );

    // Navigate safely (prevents double-clicks)
    navigateSafely(urlWithReturn);
  };

  const defaultLabel = useMemo(() => {
    switch (resourceType) {
      case ResourceType.MessageTemplate:
        return "Template";
      case ResourceType.Segment:
        return "Segment";
      case ResourceType.SubscriptionGroup:
        return "Subscription Group";
      case ResourceType.Journey:
        return "Journey";
      case ResourceType.UserProperty:
        return "User Property";
      default:
        return "Resource";
    }
  }, [resourceType]);

  return (
    <Stack direction="row" spacing={1} alignItems="center">
      <Autocomplete
        sx={{ flexGrow: 1 }}
        value={selectedResource}
        options={options}
        disabled={disabled || isLoading}
        getOptionLabel={getResourceLabel}
        isOptionEqualToValue={(option, val) => option.id === val.id}
        onChange={(_event, newResource) => {
          onChange(newResource?.id ?? null, newResource);
        }}
        renderInput={(params) => (
          <TextField
            {...params}
            label={label ?? defaultLabel}
            variant="outlined"
            InputProps={{
              ...params.InputProps,
              endAdornment: (
                <>
                  {isLoading ? (
                    <CircularProgress color="inherit" size={20} />
                  ) : null}
                  {params.InputProps.endAdornment}
                </>
              ),
            }}
          />
        )}
      />
      {enableClickThrough && (
        <Tooltip
          title={selectedResource ? "Open resource" : "Select a resource first"}
        >
          <span>
            <IconButton
              onClick={handleClickThrough}
              disabled={!selectedResource || disabled || isNavigating}
              size="small"
              color="primary"
            >
              <OpenInNewIcon />
            </IconButton>
          </span>
        </Tooltip>
      )}
    </Stack>
  );
}
