import { BLOG_POSTS, SITE_URL, postUrl } from "../lib/blog-posts";

const STATIC_PAGES = [
  { loc: `${SITE_URL}/`, changefreq: "weekly", priority: "1.0" },
  { loc: `${SITE_URL}/blog`, changefreq: "weekly", priority: "0.8" },
  { loc: `${SITE_URL}/privacy`, changefreq: "yearly", priority: "0.3" },
  { loc: `${SITE_URL}/terms`, changefreq: "yearly", priority: "0.3" },
];

export async function loader() {
  const urls = [
    ...STATIC_PAGES.map(
      ({ loc, changefreq, priority }) => `  <url>
    <loc>${loc}</loc>
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
  </url>`
    ),
    ...BLOG_POSTS.map(
      (post) => `  <url>
    <loc>${postUrl(post.slug)}</loc>
    <lastmod>${post.dateModified}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>`
    ),
  ].join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;

  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
