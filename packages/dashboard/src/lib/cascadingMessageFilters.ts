import { InternalEventType } from "isomorphic-lib/src/types";

/**
 * Implements cascading logic for message status filters.
 * Higher-level statuses include lower-level ones:
 * - Click events should include open + delivery statuses
 * - Open events should include delivery statuses
 * - Delivery events remain as-is
 * - Bounced/Failed events remain as-is
 */
export function expandCascadingMessageFilters(
  selectedStatuses: string[],
): string[] {
  if (!selectedStatuses || selectedStatuses.length === 0) {
    return [];
  }

  const expandedStatuses = new Set<string>();

  for (const status of selectedStatuses) {
    switch (status) {
      case InternalEventType.EmailClicked:
        // Clicked emails should also qualify as opened and delivered
        expandedStatuses.add(InternalEventType.EmailClicked);
        expandedStatuses.add(InternalEventType.EmailOpened);
        expandedStatuses.add(InternalEventType.EmailDelivered);
        break;

      case InternalEventType.EmailOpened:
        // Opened emails should also qualify as delivered
        expandedStatuses.add(InternalEventType.EmailOpened);
        expandedStatuses.add(InternalEventType.EmailDelivered);
        break;

      case InternalEventType.EmailDelivered:
      case InternalEventType.SmsDelivered:
        // Delivery events remain as-is
        expandedStatuses.add(status);
        break;

      case InternalEventType.MessageSent:
      case InternalEventType.EmailBounced:
      case InternalEventType.EmailMarkedSpam:
      case InternalEventType.EmailDropped:
      case InternalEventType.SmsFailed:
        // These events don't cascade - they remain as selected
        expandedStatuses.add(status);
        break;

      default:
        // Unknown status types remain as-is
        expandedStatuses.add(status);
        break;
    }
  }

  return Array.from(expandedStatuses);
}
