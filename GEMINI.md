## Introduction

I'm developing a new feature for Dittofeed, an open-source customer engagement platform which is an alternative to Customer.io, Klaviyo, Braze, etc.

Relevant concepts:
- Subscription groups: provide a mechanism for users to subscribe, and unsubscribe from messages.
- Broadcasts: one off message blasts sent in bulk to a subscription group of users.
- Journeys: a sequence of steps which automate user messaging based on user's traits and behaviors.
- Message Nodes: a node in a journey which sends a message to a user.
    - Message Nodes can optionall by assigned a subscription group.
- Message Templates: a template for rendering messages like emails, SMS, etc before sending them from a user's properties.
    - The message template editor has a "Test" button which allows you to send the message to yourself using fake user properties.
- Channel: a channel is a way to send messages to users e.g. email, SMS, etc.

Currently, the "Test" button can render unsubscribe links, but clicking the link routes to a 404 page. This is a consequence of the fact that by default, a message template does not have an associated subscription group unless rendered in the context of a journey or broadcast.

The goal of this task is to to update the subscription management link generation logic, and subscription management page, such that the links go to the subscription management page with the first subscription group in the message template's channel.

## Outline
