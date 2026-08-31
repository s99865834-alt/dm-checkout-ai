import { useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";

export default function SupportPage() {
    return (
      <s-page heading="Support">
        <s-section heading="We're here to help">
          <div className="srVStack">
            <span className="srCardDesc">
              Whether you have a question about features, need help with setup, or want to share
              feedback, we&apos;re here for you.
            </span>
            <s-link href="mailto:support@socialrepl.ai">support@socialrepl.ai</s-link>
            <span className="srTextSubdued">
              We typically respond within 24 hours on business days. For urgent matters, mark your
              email as urgent and we&apos;ll prioritize it.
            </span>
          </div>
        </s-section>

        <s-section heading="Common Questions">
          <s-stack direction="block" gap="tight">
            <details className="srFaqItem">
              <summary className="srFaqSummary">How do I connect my Instagram account?</summary>
              <p className="srFaqAnswer">Go to the Home page and click "Connect Instagram" in the Plan & Instagram section. You'll be guided through the Meta authorization process.</p>
            </details>
            <details className="srFaqItem">
              <summary className="srFaqSummary">What do the message-access statuses on the Home page mean?</summary>
              <div className="srFaqAnswer">
                <p>Under your Instagram handle in Plan &amp; Instagram you&apos;ll see one of three states:</p>
                <ul>
                  <li><strong>Green &ldquo;Message access verified/working&rdquo;</strong> — we confirmed Instagram is letting the app read and reply to your DMs. Nothing to do.</li>
                  <li><strong>Red &ldquo;Instagram is blocking message access&rdquo;</strong> — Instagram told us directly that your &ldquo;Allow access to messages&rdquo; setting is off. Automation can&apos;t reply until you turn it on (see the next question), then tap <strong>Check again</strong> for instant confirmation.</li>
                  <li><strong>Orange &ldquo;Couldn&apos;t verify message access right now&rdquo;</strong> — rare. The check didn&apos;t get a clear answer from Instagram, usually a temporary hiccup on their side. Tap <strong>Check again</strong> and it will normally turn green (or red) immediately. If it stays orange, confirm the &ldquo;Allow access to messages&rdquo; setting manually (see the next question).</li>
                </ul>
              </div>
            </details>
            <details className="srFaqItem">
              <summary className="srFaqSummary">How do I turn on &ldquo;Allow access to messages&rdquo; in Instagram?</summary>
              <div className="srFaqAnswer">
                <p>
                  Instagram has a privacy setting that controls whether connected apps like SocialRepl.ai can see and reply to your DMs.
                  It must be turned on for automation to work, and only you can change it — from the Instagram app on your phone:
                </p>
                <ol>
                  <li>Open the <strong>Instagram app</strong> and go to your profile.</li>
                  <li>Tap the menu (☰) and open <strong>Settings and activity</strong>.</li>
                  <li>Tap <strong>Messages and story replies</strong>.</li>
                  <li>Tap <strong>Message requests</strong>.</li>
                  <li>Under <strong>Connected tools</strong>, turn on <strong>&ldquo;Allow access to messages&rdquo;</strong>.</li>
                </ol>
                <p>
                  No need to reconnect or restart anything afterwards — the change takes effect right away.
                  Go back to the Home page and tap <strong>Check again</strong> in the Plan &amp; Instagram
                  section to confirm instantly that the status is green.
                </p>
              </div>
            </details>
            <details className="srFaqItem">
              <summary className="srFaqSummary">Instagram is connected but the app isn&apos;t replying — what should I check?</summary>
              <div className="srFaqAnswer">
                <p>Work through these in order:</p>
                <ol>
                  <li><strong>Message access:</strong> confirm &ldquo;Allow access to messages&rdquo; is on in Instagram (see above). This is the most common cause.</li>
                  <li><strong>Automation toggles:</strong> on the Home page, check that DM automation (and comment automation, if your plan includes it) is switched on and you clicked &ldquo;Save settings.&rdquo;</li>
                  <li><strong>Monthly limit:</strong> check the usage bar in Plan &amp; Instagram — once you hit your plan&apos;s message cap, replies pause until next month.</li>
                  <li><strong>Per-post toggles:</strong> if only certain posts get no replies, check that automation is enabled on those posts in &ldquo;Your Instagram Posts.&rdquo;</li>
                  <li><strong>Account type:</strong> your Instagram must be a professional account (Business or Creator) — personal accounts don&apos;t support message automation.</li>
                  <li><strong>Did you reply to that customer yourself?</strong> When you send a manual reply from your Instagram inbox, the AI steps aside for that conversation for 6 hours (see the next question). Other customers still get automated replies.</li>
                </ol>
                <p>Still stuck? Email us and we&apos;ll investigate your account directly.</p>
              </div>
            </details>
            <details className="srFaqItem">
              <summary className="srFaqSummary">What happens when I reply to a customer myself?</summary>
              <div className="srFaqAnswer">
                <p>
                  The AI steps aside automatically. When you send a manual reply to a customer from your
                  Instagram inbox, SocialRepl.ai detects it and pauses automation <strong>for that one
                  conversation</strong> for 6 hours, so it never talks over you mid-conversation. Every
                  manual reply you send resets the 6-hour clock, and all your other conversations keep
                  getting automated replies as normal.
                </p>
                <p>
                  Once you&apos;ve been quiet in that thread for 6 hours, the AI picks the conversation
                  back up automatically — there&apos;s nothing to turn on or off.
                </p>
              </div>
            </details>
            <details className="srFaqItem">
              <summary className="srFaqSummary">I use another automation tool (like ManyChat). How do they work together?</summary>
              <div className="srFaqAnswer">
                <p>
                  Running two tools that both answer Instagram messages on the same account causes
                  problems: customers get two different replies, and whichever tool answers second
                  looks broken. SocialRepl.ai protects your customers from that automatically. When
                  it detects that a conversation has already been answered by someone else (you or
                  another tool), it steps aside in that conversation instead of piling on.
                </p>
                <p>
                  The trade-off: while another tool is answering first, SocialRepl.ai can&apos;t send
                  product answers or checkout links in those conversations, so you lose the sale
                  tracking and attribution this app provides. If you want SocialRepl.ai to be your
                  sales assistant, turn off message automation (DM and comment replies) in the other
                  tool. You can keep using other tools for things that don&apos;t reply to customers,
                  like scheduling posts.
                </p>
                <p>
                  When we detect another tool actively replying on your account, we show a notice on
                  your Home page so you always know why message counts might look lower than expected.
                </p>
              </div>
            </details>
            <details className="srFaqItem">
              <summary className="srFaqSummary">How do I map products to posts?</summary>
              <p className="srFaqAnswer">On the Home page, scroll to "Your Instagram Posts." Select a post, choose a Shopify product and variant, then click "Save mapping." The AI will use this to send the right checkout links.</p>
            </details>
            <details className="srFaqItem">
              <summary className="srFaqSummary">Why did comment automation stop working?</summary>
              <div className="srFaqAnswer">
                <p>
                  On the Free plan, comment-to-DM automation runs free for 14 days after you connect
                  Instagram. That window exists so you can watch it answer your real customers, and
                  see any sales it drives in Analytics, before deciding whether it&apos;s worth paying
                  for. When the window ends, comment automation switches off and your DM automation
                  keeps running as normal.
                </p>
                <p>
                  Your Home page shows how many comments with buying interest came in after the window
                  closed, and Analytics lists the actual comments so you can see exactly what went
                  unanswered. Comment automation continues on Growth ($39/mo).
                </p>
              </div>
            </details>
            <details className="srFaqItem">
              <summary className="srFaqSummary">Does the app reply to Instagram story replies?</summary>
              <div className="srFaqAnswer">
                <p>
                  Story replies and story mentions are answered on the Pro plan. Someone who watches
                  your story and then responds to it is about as warm as an Instagram lead gets, so
                  these are worth answering quickly.
                </p>
                <p>
                  If you&apos;re on Free or Growth, story replies are still recorded, and your Home
                  page will tell you how many arrived this month so you can judge whether Pro is
                  worth it for your account rather than guessing.
                </p>
              </div>
            </details>
            <details className="srFaqItem">
              <summary className="srFaqSummary">How do I change my plan?</summary>
              <p className="srFaqAnswer">Go to the Billing page to upgrade or manage your subscription. Upgrades take effect immediately. To cancel, use the "Billing settings" link on the Billing page.</p>
            </details>
          </s-stack>
        </s-section>
      </s-page>
    );
  }

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
