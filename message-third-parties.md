# Message Third Parties

Currently our codebase assumes that when journeys and broadcasts message users, we message them directly. EX: in the case of emails we send the message to their "email" user property, and send an sms to their "phone" user property. We want to open up these options so that we allow users to message third parties e.g. we might want to respond to user performing an action by messaging their manager.

The way we intend to solve this is by allow message templates to be configured with a custom "to" value, which would be a reference to a particular user property. This value would be optional, but if provided, it would override the recipient address with the resolved value.

An additional constraints:

- Our webhooks, which rely on the users' "to" values (emails, phone numbers), to resolve the user id, must continue to work.
- Our subscription logic, and unsubscribe links, which rely on these values must continue to work.

## Coding Tips

See `./AGENTS.md` for helpful commands e.g. linting, tests, type checking.

## Steps

FIXME
