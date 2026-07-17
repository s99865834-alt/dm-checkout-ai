import { SITE_URL, postUrl } from "../../lib/blog-posts";
import { appStoreUrl } from "./MarketingChrome";

/** Build meta tags for an article route from its post metadata. */
export function articleMeta(post) {
  const url = postUrl(post.slug);
  return [
    { title: `${post.title} — SocialRepl.ai` },
    { name: "description", content: post.description },
    { tagName: "link", rel: "canonical", href: url },
    { property: "og:title", content: post.title },
    { property: "og:description", content: post.description },
    { property: "og:type", content: "article" },
    { property: "og:url", content: url },
    { property: "og:image", content: `${SITE_URL}/landing/hero.png` },
    { name: "twitter:card", content: "summary_large_image" },
  ];
}

/** Article + BreadcrumbList (+ optional FAQPage) JSON-LD for an article. */
function buildJsonLd(post, faqs) {
  const url = postUrl(post.slug);
  const graphs = [
    {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: post.title,
      description: post.description,
      datePublished: post.datePublished,
      dateModified: post.dateModified,
      mainEntityOfPage: url,
      image: `${SITE_URL}/landing/hero.png`,
      author: {
        "@type": "Organization",
        name: "SocialRepl.ai",
        url: SITE_URL,
      },
      publisher: {
        "@type": "Organization",
        name: "Tennyson Labs",
        url: SITE_URL,
      },
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
        { "@type": "ListItem", position: 2, name: "Blog", item: `${SITE_URL}/blog` },
        { "@type": "ListItem", position: 3, name: post.title, item: url },
      ],
    },
  ];

  if (faqs?.length) {
    graphs.push({
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: faqs.map(({ q, a }) => ({
        "@type": "Question",
        name: q,
        acceptedAnswer: { "@type": "Answer", text: a },
      })),
    });
  }

  return graphs;
}

/**
 * Shared article shell: JSON-LD, breadcrumb, header, body, optional FAQ
 * section (rendered from the same data that feeds FAQPage schema), and CTA.
 */
export function Article({ post, faqs, children }) {
  const jsonLd = buildJsonLd(post, faqs);

  return (
    <article className="srArticle">
      {jsonLd.map((graph, i) => (
        <script
          key={i}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(graph) }}
        />
      ))}

      <nav className="srArticleBreadcrumb" aria-label="Breadcrumb">
        <a href="/">Home</a> <span aria-hidden="true">/</span> <a href="/blog">Blog</a>
      </nav>

      <header className="srArticleHeader">
        <h1>{post.title}</h1>
        <p className="srArticleLede">{post.description}</p>
        <p className="srArticleDate">
          Updated{" "}
          {new Date(`${post.dateModified}T00:00:00Z`).toLocaleDateString("en-US", {
            year: "numeric",
            month: "long",
            day: "numeric",
            timeZone: "UTC",
          })}
        </p>
      </header>

      <div className="srArticleBody">{children}</div>

      {faqs?.length ? (
        <section className="srArticleFaq" aria-label="Frequently asked questions">
          <h2>Frequently asked questions</h2>
          {faqs.map(({ q, a }) => (
            <details key={q} className="srFaqCard">
              <summary>{q}</summary>
              <p>{a}</p>
            </details>
          ))}
        </section>
      ) : null}

      <aside className="srArticleCta">
        <h2>Try SocialReplAI on your store</h2>
        <p>
          SocialReplAI replies to Instagram DMs and comments with AI-generated,
          brand-voiced messages and one-click Shopify checkout links. Free plan
          includes 100 messages per month — no credit card required.
        </p>
        <a
          className="srBtnPrimary"
          href={appStoreUrl("blog_article_cta")}
          target="_blank"
          rel="noopener noreferrer"
        >
          Install free from the Shopify App Store
        </a>
      </aside>
    </article>
  );
}
