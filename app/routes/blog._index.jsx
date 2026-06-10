import { BLOG_POSTS, SITE_URL, postUrl } from "../lib/blog-posts";

export const meta = () => [
  { title: "Blog — Instagram automation guides for Shopify merchants | SocialRepl.ai" },
  {
    name: "description",
    content:
      "Guides on Instagram DM automation, comment-to-DM, checkout links, and selling on Instagram for Shopify merchants.",
  },
  { tagName: "link", rel: "canonical", href: `${SITE_URL}/blog` },
  { property: "og:title", content: "SocialRepl.ai Blog — Instagram automation for Shopify" },
  { property: "og:type", content: "website" },
  { property: "og:url", content: `${SITE_URL}/blog` },
];

const JSON_LD = {
  "@context": "https://schema.org",
  "@type": "Blog",
  name: "SocialRepl.ai Blog",
  url: `${SITE_URL}/blog`,
  description:
    "Guides on Instagram DM automation, comment-to-DM, and selling on Instagram for Shopify merchants.",
  publisher: { "@type": "Organization", name: "Tennyson Labs", url: SITE_URL },
  blogPost: BLOG_POSTS.map((post) => ({
    "@type": "BlogPosting",
    headline: post.title,
    url: postUrl(post.slug),
    datePublished: post.datePublished,
    dateModified: post.dateModified,
  })),
};

export default function BlogIndex() {
  return (
    <div className="srBlogIndex">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }}
      />
      <header className="srBlogIndexHead">
        <span className="srEyebrow">Blog</span>
        <h1>Instagram automation guides for Shopify merchants</h1>
        <p>
          Practical guides on automating Instagram DMs and comments, sending
          checkout links, and turning conversations into orders.
        </p>
      </header>
      <ul className="srBlogList">
        {BLOG_POSTS.map((post) => (
          <li key={post.slug} className="srBlogListItem">
            <a href={`/blog/${post.slug}`}>
              <h2>{post.title}</h2>
              <p>{post.description}</p>
              <span className="srBlogListMore">Read the guide →</span>
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
