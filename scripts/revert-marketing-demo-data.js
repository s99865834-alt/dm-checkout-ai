/**
 * Removes marketing demo data created by scripts/seed-marketing-demo-data.js
 * using scripts/.marketing-seed-state.json (written by the seed script).
 *
 * Run from repo root:
 *   node --env-file=.env scripts/revert-marketing-demo-data.js
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const STATE_PATH = join(__dirname, ".marketing-seed-state.json");

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });

async function deleteByIds(table, ids, label) {
  if (!ids?.length) {
    console.log(`${label}: (none)`);
    return;
  }
  const chunk = 200;
  for (let i = 0; i < ids.length; i += chunk) {
    const slice = ids.slice(i, i + chunk);
    const { error } = await supabase.from(table).delete().in("id", slice);
    if (error) {
      console.error(`${table} delete error:`, error.message);
      throw error;
    }
  }
  console.log(`${label}: deleted ${ids.length}`);
}

async function run() {
  if (!existsSync(STATE_PATH)) {
    console.error(`No state file at ${STATE_PATH}`);
    console.error("Nothing to revert (run seed script first, or restore from backup manually).");
    process.exit(1);
  }

  let state;
  try {
    state = JSON.parse(readFileSync(STATE_PATH, "utf8"));
  } catch (e) {
    console.error("Invalid state file:", e.message);
    process.exit(1);
  }

  const { shop_id, batch } = state;
  if (!shop_id) {
    console.error("State file missing shop_id");
    process.exit(1);
  }

  console.log(`Reverting marketing seed batch=${batch} shop_id=${shop_id}`);

  await deleteByIds("clicks", state.click_ids, "clicks");
  await deleteByIds("attribution", state.attribution_ids, "attribution");
  await deleteByIds("followups", state.followup_ids, "followups");
  await deleteByIds("links_sent", state.links_sent_ids, "links_sent");
  await deleteByIds("messages", state.message_ids, "messages");

  console.log("Revert complete. You can delete scripts/.marketing-seed-state.json if you want.");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
