## TwentyCRM

I'm developing Dittofeed, an open source customer engagement platform. It's equivalent to a customer.io, braze, or klaviyo.

I'm developing a new integration with TwentyCRM, an open source CRM platform. The main purpose of this integration is to allow Dittofeed to sync "segments" to TwentyCRM. Segments in Dittofeed are a collection of users that match a set of criteria.

The integration should feature the following:

- [ ] **Settings UI**: Settings UI for the integration
  - [ ] **Take API Key**: A field to enter the API key for the TwentyCRM account.
  - [ ] **Segment Selection**: A dropdown to select the segments to sync.
  - [ ] **Create Custom Object**: Create a custom object in TwentyCRM for the segments if one doesn't exist. This should be a one to many relationship to people.
- [ ] **Sync Workflow**: A workflow that runs on a schedule, and syncs the segments to TwentyCRM.
  - [ ] **Sync Segment Members**: Sync segment members to TwentyCRM contacts.
  - [ ] **Sync Segment Members**: Sync segment members to TwentyCRM contacts.

## Notes

- On first pass, we should only sync their email and phone number.
  - email -> "Emails"
  - phone -> "Phones"