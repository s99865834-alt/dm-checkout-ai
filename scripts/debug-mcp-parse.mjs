/**
 * One-off check: run the (copied) MCP parse pipeline against the live
 * search_shop_policies_and_faqs response for a store, to verify the answer
 * text that reaches AI context is clean and relevant.
 * Usage: node scripts/debug-mcp-parse.mjs <shop-domain> "<question>"
 */

// --- copies of parseToolContent (storefront-mcp.server.js) and
// --- extractMcpAnswerText (automation.server.js); keep in sync when testing.
function parseToolContent(result) {
  if (!result) return null;
  if (Array.isArray(result.content)) {
    const textBlocks = result.content
      .filter((c) => c?.type === "text" && typeof c.text === "string")
      .map((c) => c.text)
      .filter((t) => !/^\s*DEPRECATION NOTICE/i.test(t));
    if (textBlocks.length === 0) return null;
    if (textBlocks.length === 1) {
      try {
        return JSON.parse(textBlocks[0]);
      } catch {
        return textBlocks[0] || null;
      }
    }
    const parsed = textBlocks.map((t) => {
      try {
        return JSON.parse(t);
      } catch {
        return t;
      }
    });
    return parsed;
  }
  return result;
}

function extractMcpAnswerText(mcpResult) {
  if (!mcpResult) return null;
  if (typeof mcpResult === "string") {
    const cleaned = mcpResult.replace(/DEPRECATION NOTICE:[\s\S]*$/i, "").trim();
    return cleaned || null;
  }
  if (Array.isArray(mcpResult)) {
    const parts = mcpResult.map((item) => extractMcpAnswerText(item)).filter(Boolean);
    return parts.length ? parts.join("\n\n") : null;
  }
  if (typeof mcpResult === "object") {
    if (mcpResult.question && mcpResult.answer) {
      return `Q: ${String(mcpResult.question).trim()}\nA: ${String(mcpResult.answer).trim()}`;
    }
    const candidate =
      mcpResult.answer || mcpResult.text || mcpResult.response || mcpResult.result || null;
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
    if (Array.isArray(mcpResult.content)) {
      const joined = mcpResult.content
        .filter((c) => c?.type === "text" && typeof c.text === "string")
        .map((c) => c.text)
        .filter((t) => !/^\s*DEPRECATION NOTICE/i.test(t))
        .join("\n")
        .trim();
      if (joined) return joined;
    }
  }
  return null;
}

const [shopDomain, question] = process.argv.slice(2);
if (!shopDomain || !question) {
  console.error('Usage: node scripts/debug-mcp-parse.mjs <shop-domain> "<question>"');
  process.exit(1);
}

const res = await fetch(`https://${shopDomain}/api/mcp`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Accept: "application/json" },
  body: JSON.stringify({
    jsonrpc: "2.0",
    method: "tools/call",
    id: 1,
    params: { name: "search_shop_policies_and_faqs", arguments: { query: question } },
  }),
});
const json = await res.json();
const parsed = parseToolContent(json.result);
const answer = extractMcpAnswerText(parsed);
console.log("--- mcpAnswer that would reach AI context ---");
console.log(answer);
console.log("--- contains deprecation notice:", /DEPRECATION/i.test(answer || ""), "---");
