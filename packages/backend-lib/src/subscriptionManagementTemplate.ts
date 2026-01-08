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
      margin: 0;
      padding: 0;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
      background-color: #fafafa;
      min-height: 100vh;
      display: flex;
      justify-content: center;
      align-items: center;
      padding: 16px;
    }
    .card {
      background: white;
      border-radius: 12px;
      box-shadow: 0 4px 24px rgba(0, 0, 0, 0.08);
      max-width: 640px;
      width: 100%;
      overflow: hidden;
    }
    .card-header {
      padding: 24px;
      border-bottom: 1px solid #e5e5e5;
    }
    .header-content {
      display: flex;
      align-items: flex-start;
      gap: 12px;
    }
    .success-icon {
      flex-shrink: 0;
      width: 40px;
      height: 40px;
      background-color: #dcfce7;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .success-icon svg {
      width: 20px;
      height: 20px;
      color: #16a34a;
    }
    .header-text h1 {
      font-size: 1.25rem;
      font-weight: 600;
      color: #0a0a0a;
      margin-bottom: 4px;
      line-height: 1.4;
    }
    .header-text p {
      font-size: 0.875rem;
      color: #737373;
    }
    .card-content {
      padding: 24px;
    }
    .section-label {
      font-size: 0.875rem;
      font-weight: 500;
      color: #737373;
      margin-bottom: 16px;
    }
    .channel-group {
      margin-bottom: 12px;
    }
    .channel-label {
      display: flex;
      align-items: center;
      gap: 12px;
      cursor: pointer;
      padding: 4px 0;
    }
    .channel-label input[type="checkbox"] {
      width: 18px;
      height: 18px;
      cursor: pointer;
      accent-color: #0858D9;
    }
    .channel-label span {
      font-size: 1rem;
      font-weight: 500;
      color: #0a0a0a;
    }
    .subscriptions {
      margin-left: 36px;
      border-left: 2px solid #e5e5e5;
      padding-left: 24px;
      margin-top: 8px;
    }
    .subscription-label {
      display: flex;
      align-items: center;
      gap: 12px;
      cursor: pointer;
      padding: 6px 0;
    }
    .subscription-label input[type="checkbox"] {
      width: 16px;
      height: 16px;
      cursor: pointer;
      accent-color: #0858D9;
    }
    .subscription-label span {
      font-size: 0.875rem;
      font-weight: 400;
      color: #737373;
    }
    .card-footer {
      padding: 16px 24px;
      border-top: 1px solid #e5e5e5;
      display: flex;
      justify-content: flex-end;
      gap: 12px;
    }
    .btn {
      padding: 10px 20px;
      font-size: 0.875rem;
      font-weight: 500;
      border-radius: 6px;
      cursor: pointer;
      transition: all 0.15s ease;
    }
    .btn-outline {
      background: white;
      border: 1px solid #e5e5e5;
      color: #0a0a0a;
    }
    .btn-outline:hover {
      background: #f5f5f5;
    }
    .btn-primary {
      background: #0858D9;
      border: 1px solid #0858D9;
      color: white;
    }
    .btn-primary:hover {
      background: #0747b3;
      border-color: #0747b3;
    }
    .btn-primary:disabled {
      background: #7fadeb;
      border-color: #7fadeb;
      cursor: not-allowed;
    }
    .df-success-message {
      background-color: #dcfce7;
      border: 1px solid #bbf7d0;
      border-radius: 8px;
      padding: 12px 16px;
      margin-bottom: 16px;
      color: #166534;
      font-size: 0.875rem;
    }
    .df-error-message {
      background-color: #fee2e2;
      border: 1px solid #fecaca;
      border-radius: 8px;
      padding: 12px 16px;
      margin-bottom: 16px;
      color: #991b1b;
      font-size: 0.875rem;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="card-header">
      <div class="header-content">
        <div class="success-icon">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
            <polyline points="22 4 12 14.01 9 11.01"/>
          </svg>
        </div>
        <div class="header-text">
          <h1>
            {% if subscriptionChange %}
              {% if subscriptionChange == "Subscribe" %}
                You have subscribed to {{ changedSubscriptionChannel }} from {{ workspaceName }}
              {% else %}
                You have unsubscribed from {{ changedSubscriptionChannel }} from {{ workspaceName }}
              {% endif %}
            {% else %}
              Manage your preferences for {{ workspaceName }}
            {% endif %}
          </h1>
          <p>Manage your communication preferences below</p>
        </div>
      </div>
    </div>

    <form class="df-subscription-form" method="POST">
      {% subscription_hidden_fields %}

      <div class="card-content">
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

        <div class="section-label">Communication Channels</div>

        {% for channel in channels %}
        <div class="channel-group">
          <label class="channel-label">
            <input type="checkbox"
                   class="df-channel-toggle"
                   data-channel="{{ channel.name }}" />
            <span>{{ channel.name }}</span>
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
              <span>{{ subscription.name }}</span>
            </label>
            {% endfor %}
          </div>
        </div>
        {% endfor %}
      </div>

      <div class="card-footer">
        <button type="button" class="btn btn-outline" onclick="window.history.back()">Cancel</button>
        <button type="submit" class="btn btn-primary df-save-button">Save Preferences</button>
      </div>
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
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const renderedTemplate = liquid.parseAndRenderSync(template, context);

  // Inject the behavior script before closing body tag for channel toggle UX
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
  return renderedTemplate.replace(
    "</body>",
    `${SUBSCRIPTION_PAGE_SCRIPT}</body>`,
  );
}
