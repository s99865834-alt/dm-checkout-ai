import { Form, useActionData, useLoaderData } from "react-router";
import supabase from "../lib/supabase.server";
import { verifyUnsubscribeToken } from "../lib/email-unsubscribe.server";

async function readParams(request) {
  const url = new URL(request.url);
  let shopId = url.searchParams.get("s");
  let token = url.searchParams.get("t");
  if (request.method === "POST" && (!shopId || !token)) {
    const form = await request.formData();
    shopId = shopId || form.get("s");
    token = token || form.get("t");
  }
  return { shopId: shopId ? String(shopId) : "", token: token ? String(token) : "" };
}

export const meta = () => [{ title: "Email preferences | SocialRepl.ai" }, { name: "robots", content: "noindex" }];

// Opening the link only shows a button: mail scanners follow links on their
// own, and a GET that unsubscribed would remove people who never clicked.
export const loader = async ({ request }) => {
  const { shopId, token } = await readParams(request);
  return { shopId, token, valid: verifyUnsubscribeToken(shopId, token) };
};

// Also the target of one-click unsubscribe (RFC 8058), which mail apps POST.
export const action = async ({ request }) => {
  const { shopId, token } = await readParams(request);
  if (!verifyUnsubscribeToken(shopId, token)) return { done: false, error: "This link is not valid." };
  const { error } = await supabase
    .from("email_optouts")
    .upsert({ shop_id: shopId, reason: "unsubscribe_link" }, { onConflict: "shop_id" });
  if (error) {
    console.error("[email] unsubscribe failed:", error.message);
    return { done: false, error: "Something went wrong. Reply to any of our emails and we'll remove you." };
  }
  return { done: true };
};

export default function Unsubscribe() {
  const { shopId, token, valid } = useLoaderData();
  const result = useActionData();

  return (
    <div className="srLegal">
      <h1>Email preferences</h1>
      {result?.done ? (
        <p>You&apos;re unsubscribed. SocialRepl.ai won&apos;t send weekly emails to this store again. The app keeps working as before.</p>
      ) : !valid ? (
        <p>This unsubscribe link isn&apos;t valid. Reply to any of our emails and we&apos;ll take you off the list.</p>
      ) : (
        <>
          <p>Stop the weekly SocialRepl.ai emails for this store? The app itself keeps working.</p>
          {result?.error && <p>{result.error}</p>}
          <Form method="post">
            <input type="hidden" name="s" value={shopId} />
            <input type="hidden" name="t" value={token} />
            <button type="submit" className="srPrimaryBtn">Unsubscribe</button>
          </Form>
        </>
      )}
    </div>
  );
}
