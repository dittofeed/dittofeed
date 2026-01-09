/**
 * @jest-environment jsdom
 */

import {
  DEFAULT_SUBSCRIPTION_TEMPLATE,
  renderSubscriptionManagementPage,
  SUBSCRIPTION_PAGE_SCRIPT,
} from "../subscriptionManagementTemplate";
import { SubscriptionManagementTemplateContext } from "../types";

// Helper to load jsdom dynamically
async function createJSDOM(
  html: string,
  options?: { runScripts?: "dangerously" },
) {
  const { JSDOM } = await import("jsdom");
  return new JSDOM(html, options);
}

// Helper to parse HTML and return a document
async function parseHTML(html: string): Promise<Document> {
  const dom = await createJSDOM(html);
  return dom.window.document;
}

describe("subscriptionManagementPage", () => {
  const createTestContext = (
    overrides: Partial<SubscriptionManagementTemplateContext> = {},
  ): SubscriptionManagementTemplateContext => ({
    workspaceName: "Test Workspace",
    workspaceId: "workspace-123",
    channels: [
      {
        name: "Email",
        subscriptions: [
          { id: "sub-1", name: "Newsletter", isSubscribed: true },
          { id: "sub-2", name: "Marketing", isSubscribed: false },
        ],
      },
      {
        name: "SMS",
        subscriptions: [{ id: "sub-3", name: "Alerts", isSubscribed: true }],
      },
    ],
    hash: "test-hash",
    identifier: "test@example.com",
    identifierKey: "email",
    isPreview: false,
    ...overrides,
  });

  describe("DEFAULT_SUBSCRIPTION_TEMPLATE", () => {
    it("should contain all required CSS classes", () => {
      expect(DEFAULT_SUBSCRIPTION_TEMPLATE).toContain("df-subscription-form");
      expect(DEFAULT_SUBSCRIPTION_TEMPLATE).toContain(
        "df-subscription-checkbox",
      );
      expect(DEFAULT_SUBSCRIPTION_TEMPLATE).toContain("df-channel-toggle");
      expect(DEFAULT_SUBSCRIPTION_TEMPLATE).toContain("df-save-button");
      expect(DEFAULT_SUBSCRIPTION_TEMPLATE).toContain("df-success-message");
      expect(DEFAULT_SUBSCRIPTION_TEMPLATE).toContain("df-error-message");
    });

    it("should contain liquid template variables", () => {
      expect(DEFAULT_SUBSCRIPTION_TEMPLATE).toContain("{{ workspaceName }}");
      expect(DEFAULT_SUBSCRIPTION_TEMPLATE).toContain(
        "{% for channel in channels %}",
      );
      expect(DEFAULT_SUBSCRIPTION_TEMPLATE).toContain(
        "{% for subscription in channel.subscriptions %}",
      );
    });

    it("should use form submission with POST method", () => {
      expect(DEFAULT_SUBSCRIPTION_TEMPLATE).toContain('method="POST"');
      expect(DEFAULT_SUBSCRIPTION_TEMPLATE).toContain(
        "{% subscription_hidden_fields %}",
      );
    });

    it("should have name attributes on checkboxes for form submission", () => {
      expect(DEFAULT_SUBSCRIPTION_TEMPLATE).toContain(
        'name="sub_{{ subscription.id }}"',
      );
    });
  });

  describe("SUBSCRIPTION_PAGE_SCRIPT", () => {
    it("should contain channel toggle UX code", () => {
      expect(SUBSCRIPTION_PAGE_SCRIPT).toContain("initializeChannelStates");
      expect(SUBSCRIPTION_PAGE_SCRIPT).toContain("handleChannelToggle");
      expect(SUBSCRIPTION_PAGE_SCRIPT).toContain("handleSubscriptionChange");
    });

    it("should not contain AJAX fetch code (using form submission instead)", () => {
      expect(SUBSCRIPTION_PAGE_SCRIPT).not.toContain("fetch(");
      expect(SUBSCRIPTION_PAGE_SCRIPT).not.toContain("handleSubmit");
    });
  });

  describe("renderSubscriptionManagementPage", () => {
    it("should render the template with context data", () => {
      const context = createTestContext();
      const html = renderSubscriptionManagementPage(context);

      expect(html).toContain("Test Workspace");
      expect(html).toContain("Newsletter");
      expect(html).toContain("Marketing");
      expect(html).toContain("Alerts");
    });

    it("should render hidden form fields", async () => {
      const context = createTestContext();
      const html = renderSubscriptionManagementPage(context);

      const doc = await parseHTML(html);

      // Check for hidden inputs
      const workspaceInput = doc.querySelector(
        'input[name="w"]',
      ) as HTMLInputElement;
      const hashInput = doc.querySelector(
        'input[name="h"]',
      ) as HTMLInputElement;
      const identifierInput = doc.querySelector(
        'input[name="i"]',
      ) as HTMLInputElement;
      const identifierKeyInput = doc.querySelector(
        'input[name="ik"]',
      ) as HTMLInputElement;

      expect(workspaceInput).not.toBeNull();
      expect(workspaceInput.value).toBe("workspace-123");
      expect(hashInput).not.toBeNull();
      expect(hashInput.value).toBe("test-hash");
      expect(identifierInput).not.toBeNull();
      expect(identifierInput.value).toBe("test@example.com");
      expect(identifierKeyInput).not.toBeNull();
      expect(identifierKeyInput.value).toBe("email");
    });

    it("should inject the channel toggle UX script", () => {
      const context = createTestContext();
      const html = renderSubscriptionManagementPage(context);

      expect(html).toContain("initializeChannelStates");
      expect(html).toContain("handleChannelToggle");
    });

    it("should render subscription change message when provided", () => {
      const context = createTestContext({
        subscriptionChange: "Subscribe",
        changedSubscriptionName: "Newsletter",
      });
      const html = renderSubscriptionManagementPage(context);

      expect(html).toContain("You have subscribed to Newsletter");
    });

    it("should render unsubscribe message with channel when provided", () => {
      const context = createTestContext({
        subscriptionChange: "Unsubscribe",
        changedSubscriptionChannel: "Email",
      });
      const html = renderSubscriptionManagementPage(context);

      expect(html).toContain("You have unsubscribed from all Email messages");
    });

    it("should render checkboxes with correct checked state", async () => {
      const context = createTestContext();
      const html = renderSubscriptionManagementPage(context);

      const doc = await parseHTML(html);

      const sub1Checkbox = doc.querySelector(
        'input[data-subscription-id="sub-1"]',
      ) as HTMLInputElement;
      const sub2Checkbox = doc.querySelector(
        'input[data-subscription-id="sub-2"]',
      ) as HTMLInputElement;
      const sub3Checkbox = doc.querySelector(
        'input[data-subscription-id="sub-3"]',
      ) as HTMLInputElement;

      expect(sub1Checkbox).not.toBeNull();
      expect(sub2Checkbox).not.toBeNull();
      expect(sub3Checkbox).not.toBeNull();
      // Check the attribute presence
      expect(sub1Checkbox.hasAttribute("checked")).toBe(true);
      expect(sub2Checkbox.hasAttribute("checked")).toBe(false);
      expect(sub3Checkbox.hasAttribute("checked")).toBe(true);
    });

    it("should render channel groups correctly", async () => {
      const context = createTestContext();
      const html = renderSubscriptionManagementPage(context);

      const doc = await parseHTML(html);

      const emailToggle = doc.querySelector(
        '.df-channel-toggle[data-channel="Email"]',
      );
      const smsToggle = doc.querySelector(
        '.df-channel-toggle[data-channel="SMS"]',
      );

      expect(emailToggle).not.toBeNull();
      expect(smsToggle).not.toBeNull();
    });
  });

  describe("JavaScript behavior", () => {
    it("should initialize channel toggle states based on subscriptions", async () => {
      const context = createTestContext();
      const html = renderSubscriptionManagementPage(context);

      const dom = await createJSDOM(html, { runScripts: "dangerously" });
      const document = dom.window.document;

      // The script runs synchronously, so channel states should be set
      const emailToggle = document.querySelector(
        '.df-channel-toggle[data-channel="Email"]',
      ) as HTMLInputElement;
      const smsToggle = document.querySelector(
        '.df-channel-toggle[data-channel="SMS"]',
      ) as HTMLInputElement;

      // Email channel has at least one checked subscription (Newsletter)
      expect(emailToggle.checked).toBe(true);
      // SMS channel has one checked subscription (Alerts)
      expect(smsToggle.checked).toBe(true);
    });

    it("should update all channel subscriptions when channel toggle is changed", async () => {
      const context = createTestContext();
      const html = renderSubscriptionManagementPage(context);

      const dom = await createJSDOM(html, { runScripts: "dangerously" });
      const document = dom.window.document;

      const emailToggle = document.querySelector(
        '.df-channel-toggle[data-channel="Email"]',
      ) as HTMLInputElement;
      const sub1Checkbox = document.querySelector(
        'input[data-subscription-id="sub-1"]',
      ) as HTMLInputElement;
      const sub2Checkbox = document.querySelector(
        'input[data-subscription-id="sub-2"]',
      ) as HTMLInputElement;

      // Uncheck the email channel toggle
      emailToggle.checked = false;
      emailToggle.dispatchEvent(new dom.window.Event("change"));

      // Both email subscriptions should now be unchecked
      expect(sub1Checkbox.checked).toBe(false);
      expect(sub2Checkbox.checked).toBe(false);

      // Check the email channel toggle again
      emailToggle.checked = true;
      emailToggle.dispatchEvent(new dom.window.Event("change"));

      // Both email subscriptions should now be checked
      expect(sub1Checkbox.checked).toBe(true);
      expect(sub2Checkbox.checked).toBe(true);
    });

    it("should update channel toggle when individual subscription is changed", async () => {
      const context = createTestContext({
        channels: [
          {
            name: "Email",
            subscriptions: [
              { id: "sub-1", name: "Newsletter", isSubscribed: false },
              { id: "sub-2", name: "Marketing", isSubscribed: false },
            ],
          },
        ],
      });
      const html = renderSubscriptionManagementPage(context);

      const dom = await createJSDOM(html, { runScripts: "dangerously" });
      const document = dom.window.document;

      const emailToggle = document.querySelector(
        '.df-channel-toggle[data-channel="Email"]',
      ) as HTMLInputElement;
      const sub1Checkbox = document.querySelector(
        'input[data-subscription-id="sub-1"]',
      ) as HTMLInputElement;

      // Initially, channel toggle should be unchecked (no subscriptions checked)
      expect(emailToggle.checked).toBe(false);

      // Check one subscription
      sub1Checkbox.checked = true;
      sub1Checkbox.dispatchEvent(new dom.window.Event("change"));

      // Channel toggle should now be checked
      expect(emailToggle.checked).toBe(true);

      // Uncheck the subscription
      sub1Checkbox.checked = false;
      sub1Checkbox.dispatchEvent(new dom.window.Event("change"));

      // Channel toggle should be unchecked again
      expect(emailToggle.checked).toBe(false);
    });

    it("should have form element with POST method", async () => {
      const context = createTestContext();
      const html = renderSubscriptionManagementPage(context);

      const dom = await createJSDOM(html, { runScripts: "dangerously" });
      const document = dom.window.document;

      const form = document.querySelector(
        ".df-subscription-form",
      ) as HTMLFormElement;
      expect(form).not.toBeNull();
      expect(form.method.toLowerCase()).toBe("post");

      const saveButton = document.querySelector(".df-save-button");
      expect(saveButton).not.toBeNull();
    });
  });

  describe("success/error/preview messages", () => {
    it("should show success message when success=true", async () => {
      const context = createTestContext({ success: true });
      const html = renderSubscriptionManagementPage(context);

      const doc = await parseHTML(html);
      const successMessage = doc.querySelector(".df-success-message");
      expect(successMessage).not.toBeNull();
      expect(successMessage?.textContent).toContain(
        "Preferences saved successfully",
      );
    });

    it("should show error message when error=true", async () => {
      const context = createTestContext({ error: true });
      const html = renderSubscriptionManagementPage(context);

      const doc = await parseHTML(html);
      const errorMessage = doc.querySelector(".df-error-message");
      expect(errorMessage).not.toBeNull();
      expect(errorMessage?.textContent).toContain("Failed to save");
    });

    it("should show preview submitted message when previewSubmitted=true", async () => {
      const context = createTestContext({ previewSubmitted: true });
      const html = renderSubscriptionManagementPage(context);

      expect(html).toContain("Preview: Subscription preferences would be");
    });

    it("should include isPreview hidden field when in preview mode", async () => {
      const context = createTestContext({ isPreview: true });
      const html = renderSubscriptionManagementPage(context);

      const doc = await parseHTML(html);
      const isPreviewInput = doc.querySelector(
        'input[name="isPreview"]',
      ) as HTMLInputElement;
      expect(isPreviewInput).not.toBeNull();
      expect(isPreviewInput.value).toBe("true");
    });
  });

  describe("custom templates", () => {
    it("should allow custom templates with form submission", () => {
      const customTemplate = `
        <html>
        <body>
          <h1>Custom: {{ workspaceName }}</h1>
          <form class="df-subscription-form" method="POST">
            {% subscription_hidden_fields %}
            {% for channel in channels %}
              <div>{{ channel.name }}</div>
            {% endfor %}
            <button class="df-save-button">Save</button>
          </form>
        </body>
        </html>
      `;

      const context = createTestContext();
      const html = renderSubscriptionManagementPage(context, customTemplate);

      expect(html).toContain("Custom: Test Workspace");
      expect(html).toContain("Email");
      expect(html).toContain("SMS");
      // Should render hidden form fields
      expect(html).toContain('name="w"');
      expect(html).toContain('value="workspace-123"');
      // Should still inject behavior script
      expect(html).toContain("initializeChannelStates");
    });
  });
});
