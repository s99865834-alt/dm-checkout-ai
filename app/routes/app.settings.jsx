import { useLoaderData, useFetcher } from "react-router";
import { authenticate } from "../shopify.server";
import { getShopWithPlan } from "../lib/loader-helpers.server";
import { getSettings, updateSettings } from "../lib/db.server";
import { PlanGate } from "../components/PlanGate";

export const loader = async ({ request }) => {
  const { shop, plan } = await getShopWithPlan(request);
  await authenticate.admin(request);

  let settings = null;
  if (shop?.id) {
    settings = await getSettings(shop.id);
  }

  return { shop, plan, settings };
};

export const action = async ({ request }) => {
  const { shop } = await getShopWithPlan(request);
  await authenticate.admin(request);

  if (!shop?.id) {
    return { error: "Shop not found" };
  }

  const formData = await request.formData();
  const dmAutomationEnabled = formData.get("dm_automation_enabled") === "true";
  const commentAutomationEnabled = formData.get("comment_automation_enabled") === "true";

  try {
    await updateSettings(shop.id, {
      dm_automation_enabled: dmAutomationEnabled,
      comment_automation_enabled: commentAutomationEnabled,
      // Note: enabled_post_ids is now managed on the Instagram Feed page
    });

    return { success: true, message: "Settings updated successfully" };
  } catch (error) {
    console.error("[settings] Error updating settings:", error);
    return { error: error.message || "Failed to update settings" };
  }
};

export default function SettingsPage() {
  const { shop, plan, settings } = useLoaderData();
  const fetcher = useFetcher();

  const dmAutomationEnabled = settings?.dm_automation_enabled ?? true;
  const commentAutomationEnabled = settings?.comment_automation_enabled ?? true;

  // Check plan access directly from loader data
  const planHierarchy = { FREE: 0, GROWTH: 1, PRO: 2 };
  const currentPlanLevel = planHierarchy[plan?.name] || 0;
  const requiredPlanLevel = planHierarchy["PRO"] || 0;
  const hasAccess = currentPlanLevel >= requiredPlanLevel;

  if (!hasAccess) {
    return (
      <s-page heading="Publish Mode Settings">
        <s-callout variant="info" title="Settings requires Pro plan">
          <s-stack direction="block" gap="base">
            <s-paragraph>
              <s-text>
                This feature is available on the <s-text variant="strong">Pro</s-text> plan ($99/month).
              </s-text>
            </s-paragraph>
            <s-paragraph>
              <s-text variant="subdued">
                Upgrade to unlock Settings and other premium features.
              </s-text>
            </s-paragraph>
            <s-button href="/app/billing/select" variant="primary">
              Upgrade to Pro
            </s-button>
          </s-stack>
        </s-callout>
      </s-page>
    );
  }

  return (
    <s-page heading="Publish Mode Settings">
      {shop && plan && (
          <s-section>
            <s-stack direction="inline" gap="base">
              <s-badge tone={plan.name === "FREE" ? "subdued" : plan.name === "GROWTH" ? "info" : "success"}>
                {plan.name} Plan
              </s-badge>
            </s-stack>
          </s-section>
        )}

        <s-section heading="Automation Controls">
          <s-paragraph>
            Control which types of messages are automatically processed and responded to.
          </s-paragraph>

          <fetcher.Form method="post">
            <s-stack direction="block" gap="base">
              <s-box padding="base" borderWidth="base" borderRadius="base">
                <s-stack direction="block" gap="base">
                  <s-stack direction="inline" gap="base" alignment="space-between">
                    <s-stack direction="block" gap="tight">
                      <s-text variant="strong">DM Automation</s-text>
                      <s-text variant="subdued">
                        Automatically process and respond to Instagram Direct Messages
                      </s-text>
                    </s-stack>
                    <label style={{ display: "flex", alignItems: "center", cursor: "pointer" }}>
                      <input
                        type="checkbox"
                        name="dm_automation_enabled"
                        value="true"
                        defaultChecked={dmAutomationEnabled}
                        style={{ width: "20px", height: "20px", cursor: "pointer" }}
                      />
                    </label>
                  </s-stack>
                </s-stack>
              </s-box>

              <s-box padding="base" borderWidth="base" borderRadius="base">
                <s-stack direction="block" gap="base">
                  <s-stack direction="inline" gap="base" alignment="space-between">
                    <s-stack direction="block" gap="tight">
                      <s-text variant="strong">Comment Automation</s-text>
                      <s-text variant="subdued">
                        Automatically process and respond to Instagram comments
                      </s-text>
                    </s-stack>
                    <label style={{ display: "flex", alignItems: "center", cursor: "pointer" }}>
                      <input
                        type="checkbox"
                        name="comment_automation_enabled"
                        value="true"
                        defaultChecked={commentAutomationEnabled}
                        style={{ width: "20px", height: "20px", cursor: "pointer" }}
                      />
                    </label>
                  </s-stack>
                </s-stack>
              </s-box>

              <s-button type="submit" variant="primary" disabled={fetcher.state !== "idle"}>
                {fetcher.state === "submitting" ? "Saving..." : "Save Settings"}
              </s-button>
            </s-stack>
          </fetcher.Form>
        </s-section>


        {fetcher.data?.success && (
          <s-banner tone="success">
            <s-text>{fetcher.data.message}</s-text>
          </s-banner>
        )}

        {fetcher.data?.error && (
          <s-banner tone="critical">
            <s-text>{fetcher.data.error}</s-text>
          </s-banner>
        )}
      </s-page>
  );
}

