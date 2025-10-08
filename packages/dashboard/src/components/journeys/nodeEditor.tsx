import { CloseOutlined, Delete } from "@mui/icons-material";
import {
  Autocomplete,
  Box,
  Button,
  Checkbox,
  FormControl,
  FormControlLabel,
  IconButton,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Switch,
  TextField,
  ToggleButton,
  Tooltip,
  Typography,
  useTheme,
} from "@mui/material";
import { SelectInputProps } from "@mui/material/Select/SelectInput";
import { MultiSectionDigitalClock } from "@mui/x-date-pickers/MultiSectionDigitalClock";
import { Node } from "@xyflow/react";
import { DAY_INDICES } from "isomorphic-lib/src/constants";
import { getDefaultSubscriptionGroup } from "isomorphic-lib/src/subscriptionGroups";
import { assertUnreachable } from "isomorphic-lib/src/typeAssertions";
import {
  AllowedDayIndices,
  ChannelType,
  CursorDirectionEnum,
  DelayVariantType,
  EntryNode,
  JourneyNodeType,
  JourneyUiNodeType,
  MessageTemplateResource,
  MobilePushProviderType,
  PartialSegmentResource,
  SavedSegmentResource,
  SegmentNodeType,
  SignalWireSenderOverrideType,
  SmsProviderType,
  TwilioSenderOverrideType,
  UserPropertyResource,
  WorkspaceWideEmailProviders,
} from "isomorphic-lib/src/types";
import { ReactNode, useCallback, useMemo } from "react";

import { useAppStorePick } from "../../lib/appStore";
import {
  AdditionalJourneyNodeType,
  DelayUiNodeProps,
  EntryUiNodeProps,
  JourneyUiNodeDefinitionProps,
  MessageUiNodeProps,
  RandomCohortUiNodeProps,
  SegmentSplitUiNodeProps,
  WaitForUiNodeProps,
} from "../../lib/types";
import { useMessageTemplatesQuery } from "../../lib/useMessageTemplatesQuery";
import { useSegmentsQuery } from "../../lib/useSegmentsQuery";
import { useSubscriptionGroupsQuery } from "../../lib/useSubscriptionGroupsQuery";
import { useUserPropertiesQuery } from "../../lib/useUserPropertiesQuery";
import ChannelProviderAutocomplete from "../channelProviderAutocomplete";
import DurationSelect from "../durationSelect";
import {
  EventNamesAutocomplete,
  PropertiesAutocomplete,
} from "../eventsAutocomplete";
import { SubtleHeader } from "../headers";
import InfoTooltip from "../infoTooltip";
import { SubscriptionGroupAutocompleteV2 } from "../subscriptionGroupAutocomplete";
import findJourneyNode from "./findJourneyNode";
import journeyNodeLabel from "./journeyNodeLabel";
import { waitForTimeoutLabel } from "./store";

const width = 420;
const transitionDuration = ".15s";

function getLabel(tr: { name: string }) {
  return tr.name;
}

function SegmentSplitNodeFields({
  nodeId,
  nodeProps,
  disabled,
}: {
  nodeId: string;
  nodeProps: SegmentSplitUiNodeProps;
  disabled?: boolean;
}) {
  const { updateJourneyNodeData } = useAppStorePick(["updateJourneyNodeData"]);
  const { data: segmentsData } = useSegmentsQuery({
    resourceType: "Declarative",
  });

  const onSegmentChangeHandler = (
    _event: unknown,
    segment: PartialSegmentResource | null,
  ) => {
    updateJourneyNodeData(nodeId, (node) => {
      const props = node.data.nodeTypeProps;
      if (props.type === JourneyNodeType.SegmentSplitNode) {
        props.segmentId = segment?.id;
      }
    });
  };

  if (!segmentsData) {
    return null;
  }

  const segment =
    segmentsData.segments.find((t) => t.id === nodeProps.segmentId) ?? null;

  return (
    <Autocomplete
      value={segment}
      options={segmentsData.segments}
      getOptionLabel={getLabel}
      onChange={onSegmentChangeHandler}
      disabled={disabled}
      renderInput={(params) => (
        <TextField {...params} label="segment" variant="outlined" />
      )}
    />
  );
}

function RandomCohortNodeFields({
  nodeId,
  nodeProps,
  disabled,
}: {
  nodeId: string;
  nodeProps: RandomCohortUiNodeProps;
  disabled?: boolean;
}) {
  const {
    updateJourneyNodeData,
    addRandomCohortChild,
    removeRandomCohortChild,
  } = useAppStorePick([
    "updateJourneyNodeData",
    "addRandomCohortChild",
    "removeRandomCohortChild",
  ]);

  const addCohortChild = useCallback(() => {
    addRandomCohortChild({ nodeId });
  }, [addRandomCohortChild, nodeId]);

  const removeCohortChild = useCallback(
    (childName: string) => {
      removeRandomCohortChild({
        nodeId,
        childName,
      });
    },
    [removeRandomCohortChild, nodeId],
  );

  const updateCohortPercent = (index: number, percent: number) => {
    updateJourneyNodeData(nodeId, (node) => {
      const props = node.data.nodeTypeProps;
      if (props.type === JourneyNodeType.RandomCohortNode) {
        const child = props.cohortChildren[index];
        if (child) {
          child.percent = percent;
        }
      }
    });
  };

  const totalPercent = nodeProps.cohortChildren.reduce(
    (sum, child) => sum + child.percent,
    0,
  );

  return (
    <Stack spacing={2}>
      <Typography variant="h6">Random Cohort Split</Typography>
      <Typography variant="body2" color="textSecondary">
        Users will be randomly assigned to cohorts based on the percentages
        below.
      </Typography>

      {nodeProps.cohortChildren.map((child, index) => (
        <Stack key={child.name} direction="row" spacing={1} alignItems="center">
          <TextField
            label={`Cohort ${index + 1} Percentage`}
            type="number"
            value={child.percent}
            onChange={(e) => updateCohortPercent(index, Number(e.target.value))}
            disabled={disabled}
            InputProps={{
              endAdornment: "%",
            }}
            sx={{ flexGrow: 1 }}
          />
          <IconButton
            onClick={() => removeCohortChild(child.name)}
            disabled={Boolean(disabled) || nodeProps.cohortChildren.length <= 2}
            color="error"
            size="small"
          >
            <CloseOutlined />
          </IconButton>
        </Stack>
      ))}

      <Stack direction="row" justifyContent="space-between" alignItems="center">
        <Button
          variant="outlined"
          onClick={addCohortChild}
          disabled={disabled}
          size="small"
        >
          Add Cohort
        </Button>
        <Typography
          variant="body2"
          color={totalPercent === 100 ? "success.main" : "warning.main"}
        >
          Total: {totalPercent}% {totalPercent !== 100 && "(Should equal 100%)"}
        </Typography>
      </Stack>
    </Stack>
  );
}

function EntryNodeFields({
  nodeId,
  nodeProps,
  disabled,
}: {
  nodeId: string;
  nodeProps: EntryUiNodeProps;
  disabled?: boolean;
}) {
  const { updateJourneyNodeData } = useAppStorePick(["updateJourneyNodeData"]);
  const { data: segmentsData } = useSegmentsQuery({
    resourceType: "Declarative",
  });
  const nonKeyedSegments: SavedSegmentResource[] = useMemo(() => {
    if (!segmentsData) {
      return [];
    }
    const { segments } = segmentsData;
    return segments.filter(
      (s) => s.definition.entryNode.type !== SegmentNodeType.KeyedPerformed,
    );
  }, [segmentsData]);

  let variant: React.ReactNode;
  const nodeVariant = nodeProps.variant;
  switch (nodeVariant.type) {
    case JourneyNodeType.SegmentEntryNode: {
      const onSegmentChangeHandler = (
        _event: unknown,
        segment: SavedSegmentResource | null,
      ) => {
        updateJourneyNodeData(nodeId, (node) => {
          const props = node.data.nodeTypeProps;
          if (
            props.type === AdditionalJourneyNodeType.EntryUiNode &&
            props.variant.type === JourneyNodeType.SegmentEntryNode
          ) {
            props.variant.segment = segment?.id;
          }
        });
      };

      const segment =
        nonKeyedSegments.find((t) => t.id === nodeVariant.segment) ?? null;

      variant = (
        <>
          <Autocomplete
            value={segment}
            options={nonKeyedSegments}
            getOptionLabel={getLabel}
            onChange={onSegmentChangeHandler}
            disabled={disabled}
            renderInput={(params) => (
              <TextField {...params} label="segment" variant="outlined" />
            )}
          />
          <Stack direction="row" spacing={1}>
            <InfoTooltip title="If checked, the user will be re-entered into the journey after exiting it. This is useful for creating loops." />
            <FormControlLabel
              control={
                <Checkbox
                  checked={nodeVariant.reEnter ?? false}
                  onChange={(event) => {
                    updateJourneyNodeData(nodeId, (node) => {
                      const props = node.data.nodeTypeProps;
                      if (
                        props.type === AdditionalJourneyNodeType.EntryUiNode &&
                        props.variant.type === JourneyNodeType.SegmentEntryNode
                      ) {
                        props.variant.reEnter = event.target.checked;
                      }
                    });
                  }}
                  name="reEnter"
                  color="primary"
                />
              }
              label="Re-enter Journey on Exit"
              disabled={disabled}
            />
          </Stack>
        </>
      );
      break;
    }
    case JourneyNodeType.EventEntryNode:
      variant = (
        <>
          <EventNamesAutocomplete
            event={nodeVariant.event ?? ""}
            disabled={disabled}
            label="Event Trigger Name"
            onEventChange={(newEventName) => {
              updateJourneyNodeData(nodeId, (node) => {
                const props = node.data.nodeTypeProps;
                if (
                  props.type === AdditionalJourneyNodeType.EntryUiNode &&
                  props.variant.type === JourneyNodeType.EventEntryNode
                ) {
                  props.variant.event = newEventName;
                }
              });
            }}
          />

          <PropertiesAutocomplete
            event={nodeVariant.event ?? ""}
            property={nodeVariant.key ?? ""}
            disabled={disabled}
            label="Key"
            onPropertyChange={(newPropertyPath) => {
              updateJourneyNodeData(nodeId, (node) => {
                const props = node.data.nodeTypeProps;
                if (
                  props.type === AdditionalJourneyNodeType.EntryUiNode &&
                  props.variant.type === JourneyNodeType.EventEntryNode
                ) {
                  props.variant.key = newPropertyPath;
                }
              });
            }}
          />
        </>
      );
      break;
    default:
      assertUnreachable(nodeVariant);
  }
  // TODO implement variant selector
  return (
    <>
      <Select
        value={nodeProps.variant.type}
        disabled={disabled}
        onChange={(e) => {
          updateJourneyNodeData(nodeId, (node) => {
            const props = node.data.nodeTypeProps;
            if (props.type !== AdditionalJourneyNodeType.EntryUiNode) {
              return;
            }
            const type = e.target.value as EntryNode["type"];
            if (props.variant.type === type) {
              return;
            }
            switch (type) {
              case JourneyNodeType.SegmentEntryNode:
                props.variant = {
                  type: JourneyNodeType.SegmentEntryNode,
                };
                break;
              case JourneyNodeType.EventEntryNode:
                props.variant = {
                  type: JourneyNodeType.EventEntryNode,
                };
                break;
              default:
                assertUnreachable(type);
            }
          });
        }}
      >
        <MenuItem value={JourneyNodeType.SegmentEntryNode}>
          Segment Entry
        </MenuItem>
        <MenuItem value={JourneyNodeType.EventEntryNode}>
          Event Triggered Entry
        </MenuItem>
      </Select>
      {variant}
    </>
  );
}

function getTemplateLabel(tr: MessageTemplateResource) {
  return tr.name;
}

function MessageNodeFields({
  nodeId,
  nodeProps,
  disabled,
}: {
  nodeId: string;
  nodeProps: MessageUiNodeProps;
  disabled?: boolean;
}) {
  const { enableMobilePush, updateJourneyNodeData } = useAppStorePick([
    "enableMobilePush",
    "updateJourneyNodeData",
  ]);
  const { data: subscriptionGroups } = useSubscriptionGroupsQuery();
  const { data: messageTemplates } = useMessageTemplatesQuery({
    resourceType: "Declarative",
  });

  const onNameChangeHandler: React.ChangeEventHandler<
    HTMLTextAreaElement | HTMLInputElement
  > = (e) => {
    updateJourneyNodeData(nodeId, (node) => {
      const props = node.data.nodeTypeProps;
      if (props.type === JourneyNodeType.MessageNode) {
        props.name = e.target.value;
      }
    });
  };

  const onTemplateChangeHandler = (
    _event: unknown,
    template: MessageTemplateResource | null,
  ) => {
    updateJourneyNodeData(nodeId, (node) => {
      const props = node.data.nodeTypeProps;
      if (props.type === JourneyNodeType.MessageNode) {
        props.templateId = template?.id;
        if (props.name.length === 0) {
          props.name = template?.name ?? "";
        }
      }
    });
  };

  const templates = messageTemplates
    ? messageTemplates.filter((t) => t.type === nodeProps.channel)
    : [];

  const template = templates.find((t) => t.id === nodeProps.templateId) ?? null;

  const onChannelChangeHandler: SelectInputProps<ChannelType>["onChange"] = (
    e,
  ) => {
    updateJourneyNodeData(nodeId, (node) => {
      const props = node.data.nodeTypeProps;
      if (props.type === JourneyNodeType.MessageNode) {
        const channel = e.target.value as ChannelType;
        const defaultSubscriptionGroup = getDefaultSubscriptionGroup({
          channel,
          subscriptionGroups: subscriptionGroups ?? [],
        });

        props.channel = channel;
        props.subscriptionGroupId = defaultSubscriptionGroup?.id;
      }
    });
  };

  const onProviderOverrideChangeHandler = (provider: string | null) => {
    updateJourneyNodeData(nodeId, (node) => {
      const props = node.data.nodeTypeProps;
      if (props.type === JourneyNodeType.MessageNode) {
        switch (props.channel) {
          case ChannelType.Email:
            props.providerOverride =
              (provider as WorkspaceWideEmailProviders | null) ?? undefined;
            break;
          case ChannelType.Sms:
            props.providerOverride =
              (provider as SmsProviderType | null) ?? undefined;
            break;
          case ChannelType.Webhook:
            break;
          case ChannelType.MobilePush:
            props.providerOverride =
              (provider as MobilePushProviderType | null) ?? undefined;
            break;
        }
      }
    });
  };
  let providerOverrideEl: React.ReactNode;
  if (
    nodeProps.channel === ChannelType.Email ||
    nodeProps.channel === ChannelType.Sms
  ) {
    providerOverrideEl = (
      <ChannelProviderAutocomplete
        providerOverride={nodeProps.providerOverride}
        channel={nodeProps.channel}
        disabled={disabled}
        handler={onProviderOverrideChangeHandler}
      />
    );
  }
  let providerOverrideConfigEl: React.ReactNode;
  let senderOverrideType: TwilioSenderOverrideType | "" = "";
  if (
    nodeProps.channel === ChannelType.Sms &&
    nodeProps.providerOverride === SmsProviderType.Twilio
  ) {
    let twilioOverrideConfigEl: React.ReactNode;
    if (nodeProps.senderOverride) {
      switch (nodeProps.senderOverride.type) {
        case TwilioSenderOverrideType.MessageSid: {
          senderOverrideType = TwilioSenderOverrideType.MessageSid;
          twilioOverrideConfigEl = (
            <TextField
              label="Message SID"
              value={nodeProps.senderOverride.messagingServiceSid}
              onChange={(e) => {
                updateJourneyNodeData(nodeId, (node) => {
                  const props = node.data.nodeTypeProps;
                  if (
                    props.type === JourneyNodeType.MessageNode &&
                    props.channel === ChannelType.Sms &&
                    props.providerOverride === SmsProviderType.Twilio &&
                    props.senderOverride?.type ===
                      TwilioSenderOverrideType.MessageSid
                  ) {
                    props.senderOverride.messagingServiceSid = e.target.value;
                  }
                });
              }}
            />
          );
          break;
        }
        case TwilioSenderOverrideType.PhoneNumber:
          senderOverrideType = TwilioSenderOverrideType.PhoneNumber;
          twilioOverrideConfigEl = (
            <TextField
              label="Phone Number"
              value={nodeProps.senderOverride.phone}
              onChange={(e) => {
                updateJourneyNodeData(nodeId, (node) => {
                  const props = node.data.nodeTypeProps;
                  if (
                    props.type === JourneyNodeType.MessageNode &&
                    props.channel === ChannelType.Sms &&
                    props.providerOverride === SmsProviderType.Twilio &&
                    props.senderOverride?.type ===
                      TwilioSenderOverrideType.PhoneNumber
                  ) {
                    props.senderOverride.phone = e.target.value;
                  }
                });
              }}
            />
          );
          break;
        default:
          twilioOverrideConfigEl = null;
      }
    }
    const onSenderOverrideChangeHandler: SelectInputProps<
      TwilioSenderOverrideType | ""
    >["onChange"] = (event) => {
      updateJourneyNodeData(nodeId, (node) => {
        const props = node.data.nodeTypeProps;
        if (
          props.type === JourneyNodeType.MessageNode &&
          props.channel === ChannelType.Sms &&
          props.providerOverride === SmsProviderType.Twilio
        ) {
          if (!event.target.value) {
            props.senderOverride = undefined;
          } else {
            switch (event.target.value as TwilioSenderOverrideType) {
              case TwilioSenderOverrideType.MessageSid:
                props.senderOverride = {
                  type: TwilioSenderOverrideType.MessageSid,
                  messagingServiceSid: "",
                };
                break;
              case TwilioSenderOverrideType.PhoneNumber:
                props.senderOverride = {
                  type: TwilioSenderOverrideType.PhoneNumber,
                  phone: "",
                };
                break;
            }
          }
        }
      });
    };
    providerOverrideConfigEl = (
      <>
        <FormControl>
          <InputLabel id="twilio-sender-override-select-label">
            Sender Override
          </InputLabel>
          <Select
            labelId="twilio-sender-override-select-label"
            label="Twilio Override"
            onChange={onSenderOverrideChangeHandler}
            value={senderOverrideType}
            disabled={disabled}
          >
            <MenuItem value="">None</MenuItem>
            <MenuItem value={TwilioSenderOverrideType.MessageSid}>
              Message SID
            </MenuItem>
            <MenuItem value={TwilioSenderOverrideType.PhoneNumber}>
              Phone Number
            </MenuItem>
          </Select>
        </FormControl>
        {twilioOverrideConfigEl}
      </>
    );
  }
  let signalWireSenderOverrideType: SignalWireSenderOverrideType | "" = "";
  if (
    nodeProps.channel === ChannelType.Sms &&
    nodeProps.providerOverride === SmsProviderType.SignalWire
  ) {
    let signalWireOverrideConfigEl: React.ReactNode;
    if (nodeProps.senderOverride) {
      switch (nodeProps.senderOverride.type) {
        case SignalWireSenderOverrideType.PhoneNumber:
          signalWireSenderOverrideType =
            SignalWireSenderOverrideType.PhoneNumber;
          signalWireOverrideConfigEl = (
            <TextField
              label="Phone Number"
              value={nodeProps.senderOverride.phone}
              onChange={(e) => {
                updateJourneyNodeData(nodeId, (node) => {
                  const props = node.data.nodeTypeProps;
                  if (
                    props.type === JourneyNodeType.MessageNode &&
                    props.channel === ChannelType.Sms &&
                    props.providerOverride === SmsProviderType.SignalWire &&
                    props.senderOverride?.type ===
                      SignalWireSenderOverrideType.PhoneNumber
                  ) {
                    props.senderOverride.phone = e.target.value;
                  }
                });
              }}
            />
          );
          break;
        default:
          signalWireOverrideConfigEl = null;
      }
    }
    const onSignalWireSenderOverrideChangeHandler: SelectInputProps<
      SignalWireSenderOverrideType | ""
    >["onChange"] = (event) => {
      updateJourneyNodeData(nodeId, (node) => {
        const props = node.data.nodeTypeProps;
        if (
          props.type === JourneyNodeType.MessageNode &&
          props.channel === ChannelType.Sms &&
          props.providerOverride === SmsProviderType.SignalWire
        ) {
          if (!event.target.value) {
            props.senderOverride = undefined;
          } else {
            switch (event.target.value as SignalWireSenderOverrideType) {
              case SignalWireSenderOverrideType.PhoneNumber:
                props.senderOverride = {
                  type: SignalWireSenderOverrideType.PhoneNumber,
                  phone: "",
                };
                break;
            }
          }
        }
      });
    };
    providerOverrideConfigEl = (
      <>
        <FormControl>
          <InputLabel id="signalwire-sender-override-select-label">
            Sender Override
          </InputLabel>
          <Select
            labelId="signalwire-sender-override-select-label"
            label="SignalWire Override"
            onChange={onSignalWireSenderOverrideChangeHandler}
            value={signalWireSenderOverrideType}
            disabled={disabled}
          >
            <MenuItem value="">None</MenuItem>
            <MenuItem value={SignalWireSenderOverrideType.PhoneNumber}>
              Phone Number
            </MenuItem>
          </Select>
        </FormControl>
        {signalWireOverrideConfigEl}
      </>
    );
  }

  return (
    <>
      <FormControl>
        <InputLabel id="message-channel-select-label">
          Message Channel
        </InputLabel>
        <Select
          labelId="message-channel-select-label"
          label="Message Channel"
          onChange={onChannelChangeHandler}
          value={nodeProps.channel}
          disabled={disabled}
        >
          <MenuItem value={ChannelType.Email}>Email</MenuItem>
          <MenuItem value={ChannelType.Sms}>SMS</MenuItem>
          <MenuItem value={ChannelType.Webhook}>Webhook</MenuItem>
          <MenuItem disabled={!enableMobilePush} value={ChannelType.MobilePush}>
            Mobile Push
          </MenuItem>
        </Select>
      </FormControl>
      <SubscriptionGroupAutocompleteV2
        subscriptionGroupId={nodeProps.subscriptionGroupId}
        channel={nodeProps.channel}
        disabled={disabled}
        handler={(subscriptionGroup) => {
          updateJourneyNodeData(nodeId, (node) => {
            const props = node.data.nodeTypeProps;
            if (props.type === JourneyNodeType.MessageNode) {
              props.subscriptionGroupId = subscriptionGroup?.id;
            }
          });
        }}
      />
      <Autocomplete
        value={template}
        options={templates}
        disabled={disabled}
        getOptionLabel={getTemplateLabel}
        onChange={onTemplateChangeHandler}
        renderInput={(params) => (
          <TextField {...params} label="Template" variant="outlined" />
        )}
      />
      {nodeProps.templateId ? (
        <TextField
          label="Name Override"
          value={nodeProps.name}
          onChange={onNameChangeHandler}
          disabled={disabled}
        />
      ) : null}
      {nodeProps.channel === ChannelType.Webhook ? (
        <Stack direction="row" spacing={1}>
          <InfoTooltip title="Ensures user properties and segments recompute after receiving a webhook response before proceeding." />
          <FormControlLabel
            control={
              <Checkbox
                checked={nodeProps.syncProperties ?? false}
                onChange={(event) => {
                  updateJourneyNodeData(nodeId, (node) => {
                    const props = node.data.nodeTypeProps;
                    if (props.type === JourneyNodeType.MessageNode) {
                      props.syncProperties = event.target.checked;
                    }
                  });
                }}
                name="syncProperties"
                color="primary"
              />
            }
            label="Synchronize Properties"
            disabled={disabled}
          />
        </Stack>
      ) : null}
      {providerOverrideEl}
      {providerOverrideConfigEl}
      <Stack direction="row" spacing={1}>
        <InfoTooltip title="When enabled, message failures won't cause the journey to exit. The user will continue to the next step even if the message fails to send." />
        <FormControlLabel
          control={
            <Checkbox
              checked={nodeProps.skipOnFailure ?? false}
              onChange={(event) => {
                updateJourneyNodeData(nodeId, (node) => {
                  const props = node.data.nodeTypeProps;
                  if (props.type === JourneyNodeType.MessageNode) {
                    props.skipOnFailure = event.target.checked;
                  }
                });
              }}
              name="skipOnFailure"
              color="primary"
            />
          }
          label="Skip on Failure"
          disabled={disabled}
        />
      </Stack>
    </>
  );
}

const DAYS: { letter: string; day: string }[] = [
  {
    letter: "S",
    day: "Sunday",
  },
  {
    letter: "M",
    day: "Monday",
  },
  {
    letter: "T",
    day: "Tuesday",
  },
  {
    letter: "W",
    day: "Wednesday",
  },
  {
    letter: "T",
    day: "Thursday",
  },
  {
    letter: "F",
    day: "Friday",
  },
  {
    letter: "S",
    day: "Saturday",
  },
];

function DelayNodeFields({
  nodeId,
  nodeProps,
  disabled,
}: {
  nodeId: string;
  nodeProps: DelayUiNodeProps;
  disabled?: boolean;
}) {
  const { updateJourneyNodeData } = useAppStorePick(["updateJourneyNodeData"]);
  const { data: userProperties } = useUserPropertiesQuery({
    resourceType: "Declarative",
  });
  let variant: React.ReactElement;
  const nodeVariant = nodeProps.variant;
  switch (nodeVariant.type) {
    case DelayVariantType.Second: {
      const handleDurationChange = (seconds: number) => {
        updateJourneyNodeData(nodeId, (node) => {
          const props = node.data.nodeTypeProps;
          if (
            !(
              props.type === JourneyNodeType.DelayNode &&
              nodeVariant.type === DelayVariantType.Second
            )
          ) {
            return;
          }
          // Immer doesn't like adding new properties, given that seconds is optional.
          const newVariant = {
            ...nodeVariant,
            seconds,
          };
          props.variant = newVariant;
        });
      };
      variant = (
        <DurationSelect
          value={nodeVariant.seconds}
          onChange={handleDurationChange}
          description="Will wait"
          inputLabel="Duration"
          disabled={disabled}
        />
      );
      break;
    }
    case DelayVariantType.LocalTime: {
      const allowedDaysOfWeek = new Set(
        nodeVariant.allowedDaysOfWeek ?? DAY_INDICES,
      );
      const dayEls = DAYS.map((day, i) => {
        const index = i as AllowedDayIndices;
        return (
          <Tooltip key={day.day} title={day.day}>
            <ToggleButton
              value={index}
              sx={{
                width: 1,
                height: 1,
                borderRadius: "50%",
              }}
              selected={allowedDaysOfWeek.has(index)}
              onChange={() => {
                updateJourneyNodeData(nodeId, (node) => {
                  const props = node.data.nodeTypeProps;
                  if (
                    props.type !== JourneyNodeType.DelayNode ||
                    props.variant.type !== DelayVariantType.LocalTime
                  ) {
                    return;
                  }
                  if (allowedDaysOfWeek.has(index)) {
                    props.variant.allowedDaysOfWeek = (
                      props.variant.allowedDaysOfWeek ?? DAY_INDICES
                    ).filter((dayOfWeek) => dayOfWeek !== i);
                  } else {
                    const newAllowedDaysOfWeek: AllowedDayIndices[] = [
                      ...(props.variant.allowedDaysOfWeek ?? []),
                      index,
                    ];
                    newAllowedDaysOfWeek.sort();
                    props.variant.allowedDaysOfWeek = newAllowedDaysOfWeek;
                  }
                });
              }}
            >
              {day.letter}
            </ToggleButton>
          </Tooltip>
        );
      });
      variant = (
        <>
          <SubtleHeader>User Local Time</SubtleHeader>
          <MultiSectionDigitalClock
            value={new Date(0, 0, 0, nodeVariant.hour, nodeVariant.minute)}
            onChange={(newValue) =>
              updateJourneyNodeData(nodeId, (node) => {
                const props = node.data.nodeTypeProps;
                if (
                  props.type === JourneyNodeType.DelayNode &&
                  props.variant.type === DelayVariantType.LocalTime &&
                  newValue
                ) {
                  props.variant.hour = newValue.getHours();
                  props.variant.minute = newValue.getMinutes();
                }
              })
            }
          />
          <SubtleHeader>Allowed Days of the Week</SubtleHeader>
          <Stack direction="row" spacing={1}>
            {dayEls}
          </Stack>
        </>
      );
      break;
    }
    case DelayVariantType.UserProperty: {
      const userProperty =
        userProperties?.userProperties.find(
          (p) => p.id === nodeVariant.userProperty,
        ) ?? null;
      const onUserPropertyChangeHandler = (
        _event: unknown,
        up: UserPropertyResource | null,
      ) => {
        updateJourneyNodeData(nodeId, (node) => {
          if (
            node.data.nodeTypeProps.type !== JourneyNodeType.DelayNode ||
            node.data.nodeTypeProps.variant.type !==
              DelayVariantType.UserProperty
          ) {
            return;
          }
          node.data.nodeTypeProps.variant.userProperty = up?.id ?? undefined;
        });
      };

      variant = (
        <>
          <Autocomplete
            value={userProperty}
            options={userProperties?.userProperties ?? []}
            getOptionLabel={getLabel}
            onChange={onUserPropertyChangeHandler}
            renderInput={(params) => (
              <TextField {...params} label="User Property" variant="outlined" />
            )}
            disabled={disabled}
          />
          <FormControlLabel
            control={
              <Switch
                checked={
                  nodeVariant.offsetDirection === CursorDirectionEnum.After
                }
                onChange={(e) => {
                  updateJourneyNodeData(nodeId, (node) => {
                    const props = node.data.nodeTypeProps;
                    if (
                      props.type !== JourneyNodeType.DelayNode ||
                      props.variant.type !== DelayVariantType.UserProperty
                    ) {
                      return;
                    }
                    props.variant.offsetDirection = e.target.checked
                      ? CursorDirectionEnum.After
                      : CursorDirectionEnum.Before;
                  });
                }}
              />
            }
            label={`Will offset ${nodeVariant.offsetDirection === CursorDirectionEnum.After ? "forward" : "backward"} in time.`}
          />
          <DurationSelect
            value={nodeVariant.offsetSeconds}
            onChange={(seconds) => {
              updateJourneyNodeData(nodeId, (node) => {
                const props = node.data.nodeTypeProps;
                if (
                  props.type !== JourneyNodeType.DelayNode ||
                  props.variant.type !== DelayVariantType.UserProperty
                ) {
                  return;
                }
                props.variant.offsetSeconds = seconds;
              });
            }}
            description="Offset either forward or backward in time relative to the date expressed in the user property value."
            inputLabel="Offset"
            disabled={disabled}
          />
        </>
      );
      break;
    }
  }

  return (
    <>
      <Select
        value={nodeProps.variant.type}
        disabled={disabled}
        onChange={(e) => {
          updateJourneyNodeData(nodeId, (node) => {
            const props = node.data.nodeTypeProps;
            if (props.type !== JourneyNodeType.DelayNode) {
              return;
            }
            const type = e.target.value as DelayVariantType;
            if (props.variant.type === type) {
              return;
            }
            switch (type) {
              case DelayVariantType.Second:
                props.variant = {
                  type: DelayVariantType.Second,
                };
                break;
              case DelayVariantType.LocalTime:
                props.variant = {
                  type: DelayVariantType.LocalTime,
                  minute: 0,
                  hour: 8,
                };
                break;
              case DelayVariantType.UserProperty:
                props.variant = {
                  type: DelayVariantType.UserProperty,
                };
                break;
              default:
                assertUnreachable(type);
            }
          });
        }}
      >
        <MenuItem value={DelayVariantType.Second}>Hardcoded Delay</MenuItem>
        <MenuItem value={DelayVariantType.LocalTime}>Localized Delay</MenuItem>
        <MenuItem value={DelayVariantType.UserProperty}>
          User Property Delay
        </MenuItem>
      </Select>
      {variant}
    </>
  );
}

function WaitForNodeFields({
  nodeId,
  nodeProps,
  disabled,
}: {
  nodeId: string;
  nodeProps: WaitForUiNodeProps;
  disabled?: boolean;
}) {
  const { updateJourneyNodeData, journeyNodes, updateLabelNode } =
    useAppStorePick([
      "updateJourneyNodeData",
      "updateLabelNode",
      "journeyNodes",
    ]);

  const isEventEntry = useMemo(
    () =>
      journeyNodes.find(
        (n) =>
          n.data.type === JourneyUiNodeType.JourneyUiNodeDefinitionProps &&
          n.data.nodeTypeProps.type === AdditionalJourneyNodeType.EntryUiNode &&
          n.data.nodeTypeProps.variant.type === JourneyNodeType.EventEntryNode,
      ),
    [journeyNodes],
  );

  const { data: segmentsData } = useSegmentsQuery({
    resourceType: "Declarative",
  });

  const segments = useMemo(() => {
    if (!segmentsData) {
      return [];
    }
    if (isEventEntry) {
      return segmentsData.segments.filter(
        (s) => s.definition.entryNode.type === SegmentNodeType.KeyedPerformed,
      );
    }
    return segmentsData.segments.filter(
      (s) => s.definition.entryNode.type !== SegmentNodeType.KeyedPerformed,
    );
  }, [segmentsData, isEventEntry]);

  const handleDurationChange = (seconds: number) => {
    updateJourneyNodeData(nodeId, (node) => {
      const props = node.data.nodeTypeProps;
      if (props.type === JourneyNodeType.WaitForNode) {
        props.timeoutSeconds = seconds;
      }
    });

    updateLabelNode(nodeProps.timeoutLabelNodeId, waitForTimeoutLabel(seconds));
  };

  const onSegmentChangeHandler = (
    _event: unknown,
    segment: PartialSegmentResource | null,
  ) => {
    updateJourneyNodeData(nodeId, (node) => {
      const props = node.data.nodeTypeProps;
      if (
        props.type === JourneyNodeType.WaitForNode &&
        props.segmentChildren[0]
      ) {
        props.segmentChildren[0].segmentId = segment?.id;
      }
    });
  };

  const segment =
    segments.find((t) => t.id === nodeProps.segmentChildren[0]?.segmentId) ??
    null;

  return (
    <>
      <Autocomplete
        value={segment}
        options={segments}
        getOptionLabel={getLabel}
        onChange={onSegmentChangeHandler}
        renderInput={(params) => (
          <TextField {...params} label="segment" variant="outlined" />
        )}
        disabled={disabled}
      />
      <DurationSelect
        inputLabel="Timeout"
        description="Will timeout after"
        value={nodeProps.timeoutSeconds}
        onChange={handleDurationChange}
        disabled={disabled}
      />
    </>
  );
}

function NodeLayout({
  deleteButton,
  children,
  nodeId,
}: {
  deleteButton?: boolean;
  children?: ReactNode;
  nodeId: string;
}) {
  const theme = useTheme();

  const { setSelectedNodeId, deleteJourneyNode } = useAppStorePick([
    "setSelectedNodeId",
    "deleteJourneyNode",
  ]);

  const handleDelete = () => {
    setSelectedNodeId(null);
    deleteJourneyNode(nodeId);
  };
  return (
    <Stack
      sx={{ height: "100%" }}
      justifyContent="space-between"
      direction="column"
    >
      <Stack
        spacing={2}
        sx={{
          paddingLeft: 2,
          paddingRight: 2,
          paddingTop: 2,
        }}
      >
        {children}
      </Stack>
      <Stack
        flexDirection="row"
        justifyContent="right"
        alignItems="center"
        sx={{
          height: theme.spacing(8),
          paddingRight: 2,
          backgroundColor: theme.palette.grey[200],
        }}
      >
        {deleteButton ? (
          <Button
            variant="contained"
            color="error"
            startIcon={<Delete />}
            onClick={handleDelete}
          >
            Delete Journey Node
          </Button>
        ) : null}
      </Stack>
    </Stack>
  );
}

function NodeFields({
  node,
  disabled,
}: {
  node: Node<JourneyUiNodeDefinitionProps>;
  disabled?: boolean;
}) {
  const nodeProps = node.data.nodeTypeProps;

  switch (nodeProps.type) {
    case AdditionalJourneyNodeType.EntryUiNode:
      return (
        <NodeLayout nodeId={node.id}>
          <EntryNodeFields
            nodeId={node.id}
            nodeProps={nodeProps}
            disabled={disabled}
          />
        </NodeLayout>
      );
    case JourneyNodeType.SegmentSplitNode:
      return (
        <NodeLayout deleteButton nodeId={node.id}>
          <SegmentSplitNodeFields
            nodeId={node.id}
            nodeProps={nodeProps}
            disabled={disabled}
          />
        </NodeLayout>
      );
    case JourneyNodeType.RandomCohortNode:
      return (
        <NodeLayout deleteButton nodeId={node.id}>
          <RandomCohortNodeFields
            nodeId={node.id}
            nodeProps={nodeProps}
            disabled={disabled}
          />
        </NodeLayout>
      );
    case JourneyNodeType.MessageNode: {
      return (
        <NodeLayout deleteButton nodeId={node.id}>
          <MessageNodeFields
            nodeId={node.id}
            nodeProps={nodeProps}
            disabled={disabled}
          />
        </NodeLayout>
      );
    }
    case JourneyNodeType.ExitNode:
      return <NodeLayout nodeId={node.id} />;
    case JourneyNodeType.DelayNode:
      return (
        <NodeLayout deleteButton nodeId={node.id}>
          <DelayNodeFields
            nodeId={node.id}
            nodeProps={nodeProps}
            disabled={disabled}
          />
        </NodeLayout>
      );
    case JourneyNodeType.WaitForNode:
      return (
        <NodeLayout deleteButton nodeId={node.id}>
          <WaitForNodeFields
            nodeId={node.id}
            nodeProps={nodeProps}
            disabled={disabled}
          />
        </NodeLayout>
      );
  }
}

function NodeEditorContents({
  node,
  disabled,
}: {
  disabled?: boolean;
  node: Node<JourneyUiNodeDefinitionProps>;
}) {
  const { setSelectedNodeId } = useAppStorePick(["setSelectedNodeId"]);
  const closeNodeEditor = () => {
    setSelectedNodeId(null);
  };
  return (
    <Stack
      sx={{
        width: "100%",
        height: "100%",
      }}
    >
      <Stack
        sx={{
          padding: 2,
        }}
        alignItems="center"
        direction="row"
      >
        <Typography variant="h5" flexGrow={1}>
          Edit {journeyNodeLabel(node.data.nodeTypeProps.type)}
        </Typography>
        <IconButton onClick={closeNodeEditor}>
          <CloseOutlined />
        </IconButton>
      </Stack>
      <NodeFields node={node} disabled={disabled} />
    </Stack>
  );
}

export const journeyNodeEditorId = "journey-node-editor";

export default function NodeEditor({ disabled }: { disabled?: boolean }) {
  const theme = useTheme();
  const { journeySelectedNodeId, journeyNodes, journeyNodesIndex } =
    useAppStorePick([
      "journeySelectedNodeId",
      "journeyNodes",
      "journeyNodesIndex",
    ]);
  const selectedNode = useMemo(
    () =>
      journeySelectedNodeId
        ? findJourneyNode(
            journeySelectedNodeId,
            journeyNodes,
            journeyNodesIndex,
          )
        : null,
    [journeySelectedNodeId, journeyNodes, journeyNodesIndex],
  );
  const isOpen = !!selectedNode;

  return (
    <Box
      id={journeyNodeEditorId}
      sx={{
        // uses full-width on mobile screens to avoid going off-screen
        width: `min(100%, ${width}px)`,
        right: isOpen ? 0 : -width,
        opacity: isOpen ? 1 : 0,
        visibility: isOpen ? "visible" : "hidden",
        height: "100%",
        transition: `opacity ${transitionDuration} ease,visibility ${transitionDuration},right ${transitionDuration} cubic-bezier(0.820, 0.085, 0.395, 0.895)`,
        border: `1px solid ${theme.palette.grey[200]}`,
        boxShadow: "0 4px 20px rgb(47 50 106 / 15%)",
        position: "absolute",
        zIndex: 20,
        backgroundColor: "white",
      }}
    >
      <>
        {selectedNode ? (
          <NodeEditorContents node={selectedNode} disabled={disabled} />
        ) : null}
      </>
    </Box>
  );
}
