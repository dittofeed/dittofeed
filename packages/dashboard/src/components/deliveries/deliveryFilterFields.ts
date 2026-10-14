import { TableFilters } from "isomorphic-lib/src/tableFilters";
import {
  ChannelType,
  InternalEventType,
  MessageTemplateResource,
} from "isomorphic-lib/src/types";

import { expandCascadingMessageFilters } from "../../lib/cascadingMessageFilters";
import { TableFilterFieldConfig } from "../tableFilters/advancedTableFilter";

const STATUS_OPTIONS = [
  { id: InternalEventType.MessageSent, label: "Sent" },
  { id: InternalEventType.EmailBounced, label: "Email Bounced" },
  { id: InternalEventType.EmailMarkedSpam, label: "Email Marked as Spam" },
  { id: InternalEventType.EmailOpened, label: "Email Opened" },
  { id: InternalEventType.EmailClicked, label: "Email Link Clicked" },
  { id: InternalEventType.EmailDelivered, label: "Email Delivered" },
  { id: InternalEventType.EmailDropped, label: "Email Dropped" },
  { id: InternalEventType.SmsDelivered, label: "Sms Delivered" },
  { id: InternalEventType.SmsFailed, label: "Sms Failed" },
];

const CHANNEL_OPTIONS = [
  { id: ChannelType.Email, label: "Email" },
  { id: ChannelType.Sms, label: "SMS" },
  { id: ChannelType.Webhook, label: "Webhook" },
];

// Keys must match DELIVERY_*_FILTER_FIELDS in backend-lib/src/deliveries.ts.
export function getDeliveryFilterFields(
  templates: Pick<MessageTemplateResource, "id" | "name">[],
): TableFilterFieldConfig[] {
  return [
    {
      key: "template",
      label: "Template",
      type: "Enum",
      options: templates.map((t) => ({ id: t.id, label: t.name })),
    },
    { key: "status", label: "Status", type: "Enum", options: STATUS_OPTIONS },
    {
      key: "channel",
      label: "Channel",
      type: "Enum",
      options: CHANNEL_OPTIONS,
    },
    { key: "to", label: "To", type: "String" },
    { key: "from", label: "From", type: "String" },
    { key: "userId", label: "User ID", type: "String" },
  ];
}

// Matches the old status filter: e.g. "Email Delivered" also includes opened
// and clicked messages.
export function expandDeliveryStatusFilters(
  filters: TableFilters,
): TableFilters {
  return filters.map((filter) =>
    filter.field === "status" && filter.operator === "In"
      ? {
          ...filter,
          value: expandCascadingMessageFilters(
            Array.isArray(filter.value) ? filter.value : [],
          ),
        }
      : filter,
  );
}
