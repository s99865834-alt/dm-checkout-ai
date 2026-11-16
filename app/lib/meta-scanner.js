// Meta's link scanner opens every checkout link a customer taps in Instagram,
// from Meta's own network and disguised as an ordinary browser, so the user
// agent can't identify it. Before this filter it was a third of all recorded
// clicks, and a scan alone marked a link "clicked", which suppressed the
// follow-up for a customer who never opened it.
//
// Must match is_meta_scanner_ip() in supabase_migration_meta_scanner_clicks.sql.
export const META_IPV4_CIDRS = [
  "31.13.24.0/21",
  "31.13.64.0/18",
  "57.141.0.0/16",
  "66.220.144.0/20",
  "69.63.176.0/20",
  "69.171.224.0/19",
  "102.132.96.0/20",
  "129.134.0.0/16",
  "157.240.0.0/16",
  "173.252.64.0/18",
  "179.60.192.0/22",
  "185.60.216.0/22",
  "204.15.20.0/22",
];
export const META_IPV6_PREFIX = "2a03:2880:";

function ipv4ToInt(ip) {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let n = 0;
  for (const p of parts) {
    const v = Number(p);
    if (!Number.isInteger(v) || v < 0 || v > 255 || p === "") return null;
    n = n * 256 + v;
  }
  return n;
}

const RANGES = META_IPV4_CIDRS.map((cidr) => {
  const [base, bits] = cidr.split("/");
  const size = 2 ** (32 - Number(bits));
  const start = ipv4ToInt(base);
  return [start, start + size];
});

export function isMetaScannerIp(ip) {
  if (!ip || typeof ip !== "string") return false;
  const addr = ip.trim().toLowerCase().replace(/^::ffff:/, "");
  if (addr.includes(":")) return addr.startsWith(META_IPV6_PREFIX);
  const n = ipv4ToInt(addr);
  if (n === null) return false;
  return RANGES.some(([start, end]) => n >= start && n < end);
}
