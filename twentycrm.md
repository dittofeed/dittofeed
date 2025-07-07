## TwentyCRM

I'm developing Dittofeed, an open source customer engagement platform. It's equivalent to a customer.io, braze, or klaviyo.

I'm developing a new integration with TwentyCRM, an open source CRM platform. The main purpose of this integration is to allow Dittofeed to sync "segments" to TwentyCRM. Segments in Dittofeed are a collection of users that match a set of criteria.

The integration should feature the following:

- [ ] **New API Endpoints**:
  - [ ] **Validate API Key**: A new API endpoint to validate the TwentyCRM API key.
- [ ] **Settings UI**: Settings UI for the integration
  - [ ] **Create Custom Object**: Create a custom object in TwentyCRM for the segments if one doesn't exist. This should be a one to many relationship to people.
  - [ ] **Take API Key**: A field to enter the API key for the TwentyCRM account.
  - [ ] **Segment Selection**: A dropdown to select the segments to sync.
  - [ ] **Disable Button**: A button to disable the integration so that it stops syncing.
- [ ] **Sync Workflow**: A workflow that runs on a schedule, and syncs the segments to TwentyCRM.
  - [ ] **Sync Segment Members**: Sync segment members to TwentyCRM contacts, including their email and phone number.
  - [ ] **Compute Properties**: integrate into packages/backend-lib/src/computedProperties/computePropertiesIncremental.ts.

### Settings UI Flow

Background:

- Twenty API Key is stored in secrets resource through our API.
- We have a backend Integration resource, also created through our API. This resources has a record of which segments are enabled for syncing, and has an "enabled" flag.
- Before we can perform syncing in the background, we need to perform a one off operation in twenty to create the custom object. This one off operation should be performed after the API key is entered, and prior to selecting the segments to sync.
- The user should be able to enable/disable the integration after all these settings are entered.
- The user should be able to update the API key after the integration is enabled.

The settings page for the TwentyCRM integration will guide the user through a step-by-step process. The UI will change based on the current state of the integration (e.g., disconnected, connected, enabled).

**State 1: Initial Setup (Disconnected)**

This is the state when the user first visits the settings page.

*   **UI Components:**
    *   An input field for the **TwentyCRM API Key**.
    *   A **"Connect"** button.
    *   Helper text explaining where to find the API key in TwentyCRM.
*   **User Action:**
    1.  The user pastes their API key into the input field.
    2.  The user clicks **"Connect"**.
*   **Backend Logic:**
    1.  The backend receives the API key.
    2.  It attempts to connect to the TwentyCRM API to validate the key.
    3.  It checks if a custom object for Dittofeed segments exists. If not, it creates one.
    4.  If successful, the API key is saved and the UI transitions to the next state.
    5.  If it fails (e.g., invalid key, permissions error), an error message is displayed, and the UI remains in this state.

**State 2: Configuration (Connected, but Disabled)**

After a successful connection, the user can configure the sync settings.

*   **UI Components:**
    *   The API key is displayed in a masked format (e.g., `•••••`) with a **"Change Key"** button.
    *   A multi-select dropdown or checklist appears, labeled **"Select segments to sync"**. This is populated with the user's available segments from Dittofeed.
    *   An **"Enable Sync"** button. The integration is not yet active.
*   **User Action:**
    1.  The user selects one or more segments from the list.
    2.  The user clicks **"Enable Sync"**.
*   **Backend Logic:**
    1.  The list of selected segments is saved to the integration's configuration.
    2.  The integration's `enabled` flag is set to `true`.
    3.  The backend will now start the scheduled workflow to sync these segments.
    4.  The UI transitions to the "Enabled" state.

**State 3: Active (Enabled and Syncing)**

The integration is fully configured and running.

*   **UI Components:**
    *   An "Active" status indicator.
    *   The masked API key with a **"Change Key"** button.
    *   The segment selection dropdown/checklist, showing the currently synced segments. The user can modify this selection.
    *   A **"Save Changes"** button (appears if the segment selection is changed).
    *   A **"Disable Sync"** button (or toggle switch) to pause the integration.
*   **User Actions & Logic:**
    *   **Changing Segments:**
        1.  User modifies the segment selection.
        2.  User clicks **"Save Changes"**.
        3.  The backend updates the list of segments to be synced.
    *   **Disabling Sync:**
        1.  User clicks **"Disable Sync"**.
        2.  The backend sets the `enabled` flag to `false`.
        3.  The UI returns to **State 2**.
    *   **Changing API Key:**
        1.  User clicks **"Change Key"**.
        2.  The UI temporarily reverts to a view similar to **State 1**, with an input for the new key and a "Test and Save" button.
        3.  The backend validates the new key. If successful, it's saved, and the UI returns to **State 3**. If not, an error is shown, and the old key remains in use.

This flow ensures that the user provides the necessary information in the correct order and provides clear feedback on the status of the integration.

## Notes

- On first pass, we should only sync their email and phone number.
  - email -> "Emails"
  - phone -> "Phones"