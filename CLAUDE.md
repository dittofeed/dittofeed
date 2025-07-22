## Aggregated Subscriptions By Channel

### Concepts

This is new functionality for Dittofeed, an open-source customer engagement platform. It's alternative to platforms like Klaviyo, Braze, and Customer.io.

This app currently has several concepts which are worth understanding before we can implement this feature:

- channels: are the different ways that a user can be messaged e.g. email, sms, webhook, etc.
    - webhook: a webhook is a channel that be used to issue arbitrary requests to an external service.
- subscription group: a mechanism which allows users to subscribe and unsubscribe from a channel.

### Changes

- I'd like to modify packages/dashboard/src/pages/public/subscription-management.page.tsx, and packages/dashboard/src/components/subscriptionManagement.tsx in the following ways:
    - Add a new checkbox to collect all of a user's subscription groups for a given channel. Visually, this should look like an e.g. "Email" under which all of the email subscription groups are listed, indented to indicate they are children of the "Email" checkbox. When the user unchecks the "Email" checkbox, all of the email subscription groups should be unchecked. When a user checks an email subscription group, and the "Email" checkbox is unchecked, the "Email" checkbox should be checked. This logic should also be applied to the "SMS" and "Webhook" channels.
    - Refactor the request logic to use react-query by implementing a new mutation hook in the style of packages/dashboard/src/lib/useUpdateSegmentsMutation.ts.
    - If the unsubscribe action is requested when loading the subscription management page, the page should unsubscribe the user from all subscription groups in the related subscription group's channel, rather than just the subscription group that was requested as it currently does. The message displayed on page load should be updated to reflect this.
