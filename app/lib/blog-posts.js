/**
 * Canonical metadata for marketing/GEO content pages.
 * Shared by the blog index, sitemap.xml, and llms.txt so links never drift.
 */
export const SITE_URL = "https://www.socialrepl.ai";

export const BLOG_POSTS = [
  {
    slug: "how-to-automatically-reply-to-instagram-dms-shopify",
    title: "How to Automatically Reply to Instagram DMs for Your Shopify Store",
    description:
      "A step-by-step guide to setting up automatic, AI-powered Instagram DM replies that answer product questions and send Shopify checkout links 24/7.",
    datePublished: "2026-06-10",
    dateModified: "2026-06-10",
  },
  {
    slug: "turn-instagram-comments-into-sales",
    title: "How to Turn Instagram Comments into Sales with Comment-to-DM Automation",
    description:
      "Learn how comment-to-DM automation works, why private replies convert better than public ones, and how to send checkout links to everyone who comments on your posts.",
    datePublished: "2026-06-10",
    dateModified: "2026-06-10",
  },
  {
    slug: "instagram-dm-automation-for-shopify-guide",
    title: "Instagram DM Automation for Shopify: The Complete Guide",
    description:
      "Everything Shopify merchants need to know about Instagram DM automation — how it works, Meta's rules, what to automate, tools, pricing, and measuring revenue.",
    datePublished: "2026-06-10",
    dateModified: "2026-06-10",
  },
  {
    slug: "socialreplai-vs-manychat",
    title: "SocialReplAI vs ManyChat: Which Instagram Automation Tool Fits Your Shopify Store?",
    description:
      "An honest comparison of SocialReplAI and ManyChat for Shopify merchants — features, AI capabilities, checkout links, attribution, pricing, and who each is best for.",
    datePublished: "2026-06-10",
    dateModified: "2026-06-10",
  },
];

export function getPost(slug) {
  return BLOG_POSTS.find((p) => p.slug === slug) || null;
}

export function postUrl(slug) {
  return `${SITE_URL}/blog/${slug}`;
}
