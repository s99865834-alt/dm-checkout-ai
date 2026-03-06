/**
 * One-off script: delete all message-related data.
 * Run from repo root: node --env-file=.env scripts/clear-message-data.js
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });

// Order matters: delete child tables first, then parents.
async function run() {
  const tables = [
    "followups",
    "clicks",
    "attribution",
    "links_sent",
    "messages",
    "outbound_dm_queue",
    "dm_rate_limit",
  ];

  for (const table of tables) {
    let result;
    if (table === "dm_rate_limit") {
      result = await supabase.from(table).delete().gte("count", 0);
    } else {
      result = await supabase.from(table).delete().neq("id", "00000000-0000-0000-0000-000000000000");
    }
    if (result.error) {
      console.error(`${table}: ${result.error.message}`);
    } else {
      console.log(`${table}: OK`);
    }
  }
  console.log("Done.");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
