#!/usr/bin/env node

/**
 * Generate beta trial codes and insert them into Supabase.
 *
 * Usage:
 *   node scripts/generate-beta-codes.js                  # 1 code, 60 days
 *   node scripts/generate-beta-codes.js --count 5        # 5 codes
 *   node scripts/generate-beta-codes.js --days 90        # 90-day trial
 *   node scripts/generate-beta-codes.js --uses 3         # each code redeemable 3 times
 */

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, "..", ".env");
try {
  const envContent = readFileSync(envPath, "utf-8");
  for (const line of envContent.split("\n")) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match && !process.env[match[1].trim()]) {
      process.env[match[1].trim()] = match[2].trim().replace(/^['"]|['"]$/g, "");
    }
  }
} catch { /* .env not found, rely on existing env */ }

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const APP_URL = "https://socialrepl.ai";

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false },
});

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { count: 1, days: 60, uses: 1 };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--count" && args[i + 1]) opts.count = parseInt(args[++i], 10);
    if (args[i] === "--days" && args[i + 1]) opts.days = parseInt(args[++i], 10);
    if (args[i] === "--uses" && args[i + 1]) opts.uses = parseInt(args[++i], 10);
  }
  return opts;
}

function generateCode() {
  const hex = randomBytes(4).toString("hex").toUpperCase();
  return `BETA-${hex.slice(0, 4)}-${hex.slice(4, 8)}`;
}

async function main() {
  const { count, days, uses } = parseArgs();

  const codes = [];
  for (let i = 0; i < count; i++) {
    codes.push({
      code: generateCode(),
      max_uses: uses,
      trial_days: days,
      plan_level: "PRO",
    });
  }

  const { data, error } = await supabase.from("beta_codes").insert(codes).select();

  if (error) {
    console.error("Failed to insert beta codes:", error.message);
    process.exit(1);
  }

  console.log(`\nGenerated ${data.length} beta code(s) (${days}-day trial, PRO plan, ${uses} use(s) each):\n`);
  console.log(`  Link format: ${APP_URL}/invite?beta_code=CODE&shop=STORE_HANDLE\n`);
  for (const row of data) {
    console.log(`  ${row.code}`);
  }
  console.log();
}

main();
