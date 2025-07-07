## TwentyCRM

I'm developing Dittofeed, an open source customer engagement platform. It's equivalent to a customer.io, braze, or klaviyo.

I'm developing a new integration with TwentyCRM, an open source CRM platform. The main purpose of this integration is to allow Dittofeed to sync "segments" to TwentyCRM. Segments in Dittofeed are a collection of users that match a set of criteria.

The integration should feature the following:

- [ ] **Settings UI**: Settings UI for the integration
  - [ ] **Create Custom Object**: Create a custom object in TwentyCRM for the segments if one doesn't exist. This should be a one to many relationship to people.
  - [ ] **Take API Key**: A field to enter the API key for the TwentyCRM account.
  - [ ] **Segment Selection**: A dropdown to select the segments to sync.
  - [ ] **Disable Button**: A button to disable the integration so that it stops syncing.
- [ ] **Sync Workflow**: A workflow that runs on a schedule, and syncs the segments to TwentyCRM.
  - [ ] **Sync Segment Members**: Sync segment members to TwentyCRM contacts.
  - [ ] **Sync Segment Members**: Sync segment members to TwentyCRM contacts.

### Settings UI Flow

Background:

- Twenty API Key is stored in secrets resource through our API.
- We have a backend Integration resource, also created through our API. This resources has a record of which segments are enabled for syncing, and has an "enabled" flag.
- Before we can perform syncing in the background, we need to perform a one off operation in twenty to create the custom object. This one off operation should be performed after the API key is entered, and prior to selecting the segments to sync.
- The user should be able to enable/disable the integration after all these settings are entered.
- The user should be able to update the API key after the integration is enabled.

## Notes

- On first pass, we should only sync their email and phone number.
  - email -> "Emails"
  - phone -> "Phones"