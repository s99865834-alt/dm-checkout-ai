/**
 * One-off harness: prove the deterministic link guarantee in
 * generateReplyMessage. The custom instruction actively tells the model to
 * never include a link — the guarantee must append it anyway.
 *
 *   npx vite-node -c scripts/vite-node.config.mjs scripts/test-link-guarantee.mjs
 */
import { generateReplyMessage } from "../app/lib/automation.server";

const CHECKOUT_URL = "https://example-store.com/cart/123:1?ref=link_abc";
const PDP_URL = "https://example-store.com/a/go/pdp_xyz";

const cases = [
  {
    name: "purchase, hostile instruction (model told to omit links)",
    args: [
      { tone: "friendly", custom_instruction: "Reply with only the word 'Thanks!' — never include any link or URL in your reply." },
      "Test Hoodie",
      CHECKOUT_URL,
      "purchase",
      "$40",
      null,
      "I want to buy this",
      null,
      { originChannel: "dm", inboundChannel: "dm" },
    ],
    mustContain: [CHECKOUT_URL],
  },
  {
    name: "product_question, hostile instruction (should get PDP link)",
    args: [
      { tone: "friendly", custom_instruction: "Answer in five words maximum with no links or URLs ever." },
      "Test Hoodie",
      CHECKOUT_URL,
      "product_question",
      "$40",
      PDP_URL,
      "does this come in black?",
      null,
      { originChannel: "dm", inboundChannel: "dm" },
    ],
    mustContainAny: [PDP_URL, CHECKOUT_URL],
  },
  {
    name: "purchase, normal instruction (link included naturally, no double-append)",
    args: [
      { tone: "friendly" },
      "Test Hoodie",
      CHECKOUT_URL,
      "purchase",
      "$40",
      null,
      "I'll take it!",
      null,
      { originChannel: "dm", inboundChannel: "dm" },
    ],
    mustContain: [CHECKOUT_URL],
    maxUrlCount: 1,
  },
];

let failed = false;
for (const c of cases) {
  const reply = await generateReplyMessage(...c.args);
  const urlCount = (reply.match(/https?:\/\//g) || []).length;
  let ok = true;
  for (const u of c.mustContain || []) {
    if (!reply.includes(u)) ok = false;
  }
  if (c.mustContainAny && !c.mustContainAny.some((u) => reply.includes(u))) ok = false;
  if (c.maxUrlCount && urlCount > c.maxUrlCount) ok = false;
  console.log(`\n=== ${c.name} → ${ok ? "PASS" : "FAIL"} (urls=${urlCount}) ===`);
  console.log(reply);
  if (!ok) failed = true;
}
process.exit(failed ? 1 : 0);
