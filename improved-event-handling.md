## Implementation

I'm building dittofeed, an open source customer engagement platform, which is an alternative to platforms like Klaviyo, and Customer.io.

We have a concept of user "journeys", which are used to automate customer engagement. They're constructed in a low code visual editor, and are triggered by events. These journeys run on temporal, the workflow orchestration engine.

Background concepts:
- Segments: a set of users that match a certain criteria based on their traits and behaviors. Used to determine journey behavior.
- User properties: JSON values that are associated with a user, defined based on their traits and behaviors. Used to render messages, and to determine journey behavior.
- ClickHouse: our primary event and user store.

Both user properties and segments are typically recalculated asynchrously by issuing clickhouse queries with the exception of keyed user properties and segments, which are recalculated synchronously in memory.

Currently, we have two types of journeys:
- Event entry journeys:
    - Used to trigger journeys immediately when an event is received.
    - Better for handling low latency use cases.
    - Event entry journeys are "keyed" so e.g. if we receive an APPOINTMENT_BOOKED event, the journey might define an `appointmentId` key, and the journey will be triggered for each unique appointmentId.
    - Event entry journeys also allow the use of "keyed" user properties and segments. These are calculated in-memory, using the events submitted directly journey  

However, we're currently having the problem that routing events to journeys workflows, and back out through their activities, is massively inflating the workflow history size. This is a consequence of some developers submitting very large events containing payloads with large html fragments inside of them, to render in the messages.

As a solution, this branch contains new code which instead passes the event ids into the journey, to then later be used to fetch the events from clickhouse within the activities. Passing events by reference rather than by value should hopefully help reduce the size of the workflow history substantially.

I'd like you to use git to review the changes, and provide feedback on the approach.

Known dangers:
- This *might* introduce a race condition. We submit events to clickhouse through kafka. This means writes are asynchronous. Likewise journeys run asynchrously, so it's possible that the events are not yet available when the journey activities are run. However, in practice event writes are substantially faster than journey runs, so this is unlikely to be a problem in my view.
- I've made large edits to the user journey workflow code, and I've made a best effort not to introduce breaking changes that will cause history conflict errors. However, I'm not 100% sure that I've done this correctly. I'd like you to review the changes, and do your best to see if you can spot any potential issues along these lines.

Relevant files:
- packages/backend-lib/src/journeys/userWorkflow.ts
- packages/backend-lib/src/journeys/userWorkflow/activities.ts
- packages/backend-lib/src/apps.ts

## Tests

- packages/backend-lib/src/journeys/keyedEventEntry.test.ts

useful commands:
- run a test: yarn jest packages/backend-lib/src/journeys/keyedEventEntry.test.ts
- run type checking: yarn workspace backend-lib check
