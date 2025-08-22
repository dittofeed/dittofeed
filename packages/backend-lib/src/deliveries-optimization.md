Optimize the `searchDeliveries` query so that it does less work parsing JSON.

1. It reuses the existing `properties` column, rather than reparsing it from the `message_raw` column.
2. It parses the properties once into a tuple, rather than parsing it multiple times. This tuple should contain all the fields that are needed for the query including universal fields like `messageId`, `triggeringMessageId`, as well as condition fields like `broadcastId` used in filters.

```sql
SELECT
    inner_grouped.last_event,
    inner_grouped.properties,
    inner_grouped.context,
    inner_grouped.updated_at,
    inner_grouped.sent_at,
    inner_grouped.user_or_anonymous_id,
    inner_grouped.origin_message_id,
    inner_grouped.triggering_message_id,
    inner_grouped.workspace_id,
    inner_grouped.is_anonymous
FROM
    (
        SELECT
            argMax(event, event_time) AS last_event,
            anyIf(properties, properties != '') AS properties,
            anyIf(parsed_properties, parsed_properties.messageId != '') AS parsed_properties,
            anyIf(context, context != '') AS context,
            max(event_time) AS updated_at,
            min(event_time) AS sent_at,
            user_or_anonymous_id,
            origin_message_id,
            any(triggering_message_id) AS triggering_message_id,
            workspace_id,
            is_anonymous
        FROM
            (
                SELECT
                    uev.workspace_id,
                    uev.user_or_anonymous_id,
                    if(
                        uev.event = 'DFInternalMessageSent',
                        uev.properties,
                        ''
                    ) AS properties,
                    -- Parse properties once into a tuple (default to empty strings)
                    if(
                        properties != '',
                        JSONExtract(
                            properties,
                            'Tuple(
                                messageId String,
                                triggeringMessageId String,
                                broadcastId String
                            )'
                        ),
                        CAST(('', '', ''), 'Tuple(messageId String, triggeringMessageId String, broadcastId String)')
                    ) AS parsed_properties,
                    if(
                        uev.event = 'DFInternalMessageSent',
                        JSONExtractString(uev.message_raw, 'context'),
                        ''
                    ) AS context,
                    uev.event,
                    uev.event_time,
                    if(
                        properties != '',
                        uev.message_id,
                        parsed_properties.messageId
                    ) AS origin_message_id,
                    if(
                        properties != '',
                        parsed_properties.triggeringMessageId,
                        ''
                    ) AS triggering_message_id,
                    JSONExtractBool(context, 'hidden') AS hidden,
                    uev.anonymous_id != '' AS is_anonymous
                FROM
                    dittofeed.user_events_v2 AS uev
                WHERE
                    (
                        uev.event IN _CAST(
                            [
                                'DFInternalMessageSent',
                                'DFEmailDropped',
                                'DFEmailDelivered',
                                'DFEmailOpened',
                                'DFEmailClicked',
                                'DFEmailBounced',
                                'DFEmailMarkedSpam'
                            ],
                            'Array(String)'
                        )
                    )
                    AND (
                        uev.workspace_id = 'e42785e7-db2d-41be-85dc-48c95201c932'
                    )
                    AND (hidden = false)
                    AND (
                        processing_time >= parseDateTimeBestEffort('2025-08-22T04:08:17.221Z', 'UTC')
                    )
                    AND (
                        processing_time <= parseDateTimeBestEffort('2025-08-22T05:08:17.221Z', 'UTC')
                    )
            ) AS inner_extracted
        GROUP BY
            workspace_id,
            user_or_anonymous_id,
            origin_message_id,
            is_anonymous
        HAVING
            (origin_message_id != '')
            AND (properties != '')
            AND (
                parsed_properties.broadcastId = '44cd622f-4eef-4ab9-8d67-b361054c973a'
            )
    ) AS inner_grouped
WHERE
    1 = 1
ORDER BY
    sent_at DESC,
    origin_message_id ASC
LIMIT
    _CAST(0, 'UInt64'),
    _CAST(10, 'UInt64')
```

Test the new query by running the related tests.

```bash
yarn jest packages/backend-lib/src/deliveries.ts
```