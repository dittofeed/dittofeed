import { Liquid, TagToken, Context, Emitter, TopLevelToken } from "liquidjs";

import { SubscriptionManagementTemplateContext } from "./types";

/**
 * CSS Class API for Subscription Management Pages
 *
 * These classes are used by the inline JavaScript to attach behavior:
 * - df-subscription-form: Main form container
 * - df-subscription-checkbox: Individual subscription checkboxes (data-subscription-id, data-channel)
 * - df-channel-toggle: Channel-level toggle (data-channel)
 * - df-save-button: Save preferences button
 * - df-success-message: Success notification container
 * - df-error-message: Error notification container
 */

// Create the Liquid engine and register custom tags
const liquid = new Liquid();

/**
 * Custom Liquid tag that renders all hidden form fields needed for subscription management.
 * Usage: {% subscription_hidden_fields %}
 *
 * Renders:
 * - w (workspaceId)
 * - h (hash)
 * - i (identifier)
 * - ik (identifierKey)
 * - isPreview (if in preview mode)
 */
liquid.registerTag("subscription_hidden_fields", {
  parse(tagToken: TagToken, remainTokens: TopLevelToken[]) {
    // No arguments to parse
  },
  *render(ctx: Context, emitter: Emitter) {
    const workspaceId = ctx.get(["workspaceId"]) as string;
    const hash = ctx.get(["hash"]) as string;
    const identifier = ctx.get(["identifier"]) as string;
    const identifierKey = ctx.get(["identifierKey"]) as string;
    const isPreview = ctx.get(["isPreview"]) as boolean;

    let html = `<input type="hidden" name="w" value="${escapeHtml(workspaceId)}">
    <input type="hidden" name="h" value="${escapeHtml(hash)}">
    <input type="hidden" name="i" value="${escapeHtml(identifier)}">
    <input type="hidden" name="ik" value="${escapeHtml(identifierKey)}">`;

    if (isPreview) {
      html += `\n    <input type="hidden" name="isPreview" value="true">`;
    }

    emitter.write(html);
  },
});

/**
 * Escapes HTML special characters to prevent XSS
 */
function escapeHtml(str: string): string {
  if (!str) return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export const DEFAULT_SUBSCRIPTION_TEMPLATE = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Subscription Preferences - {{ workspaceName }}</title>
  <style>
    * {
      box-sizing: border-box;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
      background-color: #f5f5f5;
      margin: 0;
      padding: 20px;
      min-height: 100vh;
      display: flex;
      justify-content: center;
      align-items: center;
    }
    .container {
      background: white;
      border-radius: 8px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
      padding: 32px;
      max-width: 500px;
      width: 100%;
    }
    h1 {
      font-size: 1.5rem;
      font-weight: 500;
      margin: 0 0 24px 0;
      color: #333;
    }
    .alert {
      background-color: #e3f2fd;
      border: 1px solid #90caf9;
      border-radius: 4px;
      padding: 12px 16px;
      margin-bottom: 24px;
      color: #1565c0;
    }
    .channel-group {
      margin-bottom: 16px;
    }
    .channel-label {
      display: flex;
      align-items: center;
      font-weight: 500;
      cursor: pointer;
      padding: 8px 0;
    }
    .channel-label input {
      margin-right: 12px;
      width: 18px;
      height: 18px;
      cursor: pointer;
    }
    .subscriptions {
      margin-left: 30px;
      border-left: 2px solid #e0e0e0;
      padding-left: 16px;
    }
    .subscription-label {
      display: flex;
      align-items: center;
      cursor: pointer;
      padding: 6px 0;
      color: #666;
    }
    .subscription-label input {
      margin-right: 12px;
      width: 16px;
      height: 16px;
      cursor: pointer;
    }
    .df-save-button {
      background-color: #1976d2;
      color: white;
      border: none;
      border-radius: 4px;
      padding: 12px 24px;
      font-size: 1rem;
      cursor: pointer;
      margin-top: 16px;
      transition: background-color 0.2s;
    }
    .df-save-button:hover {
      background-color: #1565c0;
    }
    .df-save-button:disabled {
      background-color: #bdbdbd;
      cursor: not-allowed;
    }
    .df-success-message {
      background-color: #e8f5e9;
      border: 1px solid #a5d6a7;
      border-radius: 4px;
      padding: 12px 16px;
      margin-bottom: 24px;
      color: #2e7d32;
    }
    .df-error-message {
      background-color: #ffebee;
      border: 1px solid #ef9a9a;
      border-radius: 4px;
      padding: 12px 16px;
      margin-bottom: 24px;
      color: #c62828;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>Manage your subscription preferences for {{ workspaceName }}</h1>

    {% if success %}
    <div class="df-success-message">
      Preferences saved successfully!
    </div>
    {% endif %}

    {% if previewSubmitted %}
    <div class="df-success-message">
      Preview: Subscription preferences would be updated.
    </div>
    {% endif %}

    {% if error %}
    <div class="df-error-message">
      Failed to save preferences. Please try again.
    </div>
    {% endif %}

    {% if subscriptionChange %}
    <div class="alert">
      {% if subscriptionChange == "Subscribe" %}
        You have subscribed to {{ changedSubscriptionName }}
      {% else %}
        You have unsubscribed from all {{ changedSubscriptionChannel }} messages
      {% endif %}
    </div>
    {% endif %}

    <form class="df-subscription-form" method="POST">
      {% subscription_hidden_fields %}

      {% for channel in channels %}
      <div class="channel-group">
        <label class="channel-label">
          <input type="checkbox"
                 class="df-channel-toggle"
                 data-channel="{{ channel.name }}" />
          {{ channel.name }}
        </label>

        <div class="subscriptions">
          {% for subscription in channel.subscriptions %}
          <label class="subscription-label">
            <input type="checkbox"
                   class="df-subscription-checkbox"
                   name="sub_{{ subscription.id }}"
                   value="true"
                   data-subscription-id="{{ subscription.id }}"
                   data-channel="{{ channel.name }}"
                   {% if subscription.isSubscribed %}checked{% endif %} />
            {{ subscription.name }}
          </label>
          {% endfor %}
        </div>
      </div>
      {% endfor %}

      <button type="submit" class="df-save-button">
        Save Preferences
      </button>
    </form>
  </div>
</body>
</html>`;

/**
 * Inline JavaScript that attaches behavior to the subscription management page.
 * This script provides optional channel toggle UX - the form works without JS.
 */
export const SUBSCRIPTION_PAGE_SCRIPT = `
<script>
(function() {
  var channelToggles = document.querySelectorAll('.df-channel-toggle');
  var subscriptionCheckboxes = document.querySelectorAll('.df-subscription-checkbox');

  // Initialize channel toggle states based on subscriptions
  function initializeChannelStates() {
    channelToggles.forEach(function(toggle) {
      var channel = toggle.getAttribute('data-channel');
      var channelCheckboxes = document.querySelectorAll(
        '.df-subscription-checkbox[data-channel="' + channel + '"]'
      );
      var anyChecked = Array.from(channelCheckboxes).some(function(cb) {
        return cb.checked;
      });
      toggle.checked = anyChecked;
    });
  }

  // Handle channel toggle change - check/uncheck all subscriptions in channel
  function handleChannelToggle(event) {
    var channel = event.target.getAttribute('data-channel');
    var isChecked = event.target.checked;
    var channelCheckboxes = document.querySelectorAll(
      '.df-subscription-checkbox[data-channel="' + channel + '"]'
    );
    channelCheckboxes.forEach(function(cb) {
      cb.checked = isChecked;
    });
  }

  // Handle individual subscription checkbox change - update channel toggle state
  function handleSubscriptionChange(event) {
    var channel = event.target.getAttribute('data-channel');
    var channelCheckboxes = document.querySelectorAll(
      '.df-subscription-checkbox[data-channel="' + channel + '"]'
    );
    var channelToggle = document.querySelector(
      '.df-channel-toggle[data-channel="' + channel + '"]'
    );
    if (channelToggle) {
      var anyChecked = Array.from(channelCheckboxes).some(function(cb) {
        return cb.checked;
      });
      channelToggle.checked = anyChecked;
    }
  }

  // Attach event listeners
  channelToggles.forEach(function(toggle) {
    toggle.addEventListener('change', handleChannelToggle);
  });

  subscriptionCheckboxes.forEach(function(cb) {
    cb.addEventListener('change', handleSubscriptionChange);
  });

  // Initialize
  initializeChannelStates();
})();
</script>`;

/**
 * Renders a subscription management page using a Liquid template.
 *
 * @param context - The data to render into the template
 * @param template - Optional custom Liquid template. Uses default if not provided.
 * @returns The rendered HTML string with inline JavaScript for channel toggle UX
 */
export function renderSubscriptionManagementPage(
  context: SubscriptionManagementTemplateContext,
  template: string = DEFAULT_SUBSCRIPTION_TEMPLATE,
): string {
  const renderedTemplate = liquid.parseAndRenderSync(template, context);

  // Inject the behavior script before closing body tag for channel toggle UX
  return renderedTemplate.replace("</body>", `${SUBSCRIPTION_PAGE_SCRIPT}</body>`);
}
