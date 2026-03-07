#!/usr/bin/env node

/**
 * Export all beta codes and magic links to a CSV file for Google Sheets.
 *
 * Usage:
 *   node scripts/export-beta-codes-csv.js
 *   node scripts/export-beta-codes-csv.js --out my-codes.csv
 */

import { readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";

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
} catch { /* .env not found */ }

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const APP_URL = process.env.SHOPIFY_APP_URL || "https://socialrepl.ai";

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false },
});

function parseArgs() {
  const args = process.argv.slice(2);
  let out = "beta-codes.csv";
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--out" && args[i + 1]) out = args[++i];
  }
  return { out };
}

function escapeCsv(value) {
  const s = String(value);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

async function main() {
  const { out } = parseArgs();

  const { data: rows, error } = await supabase
    .from("beta_codes")
    .select("code, times_used, max_uses, created_at")
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Failed to fetch beta codes:", error.message);
    process.exit(1);
  }

  const headers = ["code", "magic_link", "times_used", "max_uses", "created_at"];
  const lines = [headers.map(escapeCsv).join(",")];

  for (const row of rows || []) {
    const magicLink = `${APP_URL}/app/beta?code=${encodeURIComponent(row.code)}`;
    lines.push(
      [
        escapeCsv(row.code),
        escapeCsv(magicLink),
        escapeCsv(row.times_used ?? 0),
        escapeCsv(row.max_uses ?? 1),
        escapeCsv(row.created_at ?? ""),
      ].join(",")
    );
  }

  const csv = lines.join("\n");
  const outPath = resolve(__dirname, "..", out);
  writeFileSync(outPath, csv, "utf-8");

  console.log(`Exported ${rows?.length ?? 0} codes to ${outPath}`);
}

main();
