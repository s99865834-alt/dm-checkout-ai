import { useLoaderData } from "react-router";

export const loader = async () => {
  return {
    lastUpdated: new Date().toISOString().split('T')[0],
  };
};

export default function PrivacyPolicy() {
  const { lastUpdated } = useLoaderData();

  return (
    <div className="srLegal">
      <h1>Privacy Policy</h1>
      <p className="srLegalMeta">Last Updated: {lastUpdated}</p>

      <section>
        <h2>1. Introduction</h2>
        <p>
          Tennyson Labs LLC, operator of SocialRepl.ai ("we," "our," or "us"), is committed to protecting your privacy. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use SocialRepl.ai (the "Service"). Please read this Privacy Policy carefully. If you do not agree with the terms of this Privacy Policy, please do not access or use the Service.
        </p>
      </section>

      <section>
        <h2>2. Information We Collect</h2>
        
        <h3>2.1 Information You Provide</h3>
        <p>We collect information that you provide directly to us, including:</p>
        <ul>
          <li>Shopify store information (store name, domain, and related data)</li>
          <li>Instagram account information when you connect your account</li>
          <li>Settings and preferences for automated messaging</li>
          <li>Brand voice customization data</li>
        </ul>

        <h3>2.2 Information We Collect Automatically</h3>
        <p>When you use our Service, we automatically collect certain information, including:</p>
        <ul>
          <li>Instagram messages and comments received by your account, including the message text, sender's Instagram user ID, and sender's username</li>
          <li>Customer interaction data (message content, timestamps, channel type, AI-classified intent and sentiment)</li>
          <li>Click-through data from checkout links sent via our Service, including IP addresses and user agent strings of visitors who click checkout links</li>
          <li>Order attribution data when customers make purchases through our checkout links</li>
          <li>Analytics and usage statistics</li>
        </ul>

        <h3>2.3 Information from Third Parties</h3>
        <p>We receive information from third-party services you connect to our Service:</p>
        <ul>
          <li>
            <strong>Shopify:</strong> Store metadata, product catalog data,
            store policies and pages, and order metadata (order ID, total
            amount, currency, attribution URLs such as <code>landing_site</code>
            and <code>referring_site</code>). We do not request or store
            individual Shopify customer profiles, addresses, emails, or
            payment information.
          </li>
          <li>
            <strong>Meta (Facebook/Instagram):</strong> Instagram account
            data, messages, comments, and media content for the connected
            Instagram Business account.
          </li>
        </ul>
      </section>

      <section>
        <h2>3. How We Use Your Information</h2>
        <p>We use the information we collect to:</p>
        <ul>
          <li>Provide, operate, and maintain our Service</li>
          <li>Process and respond to Instagram messages and comments</li>
          <li>Generate and send automated checkout links to customers</li>
          <li>Track and attribute orders to Instagram interactions</li>
          <li>Generate analytics and insights about your messaging performance</li>
          <li>Improve, personalize, and expand our Service</li>
          <li>Communicate with you about your account and our Service</li>
          <li>Detect, prevent, and address technical issues and security threats</li>
          <li>Comply with legal obligations</li>
        </ul>
      </section>

      <section>
        <h2>4. Data Processing and AI</h2>
        <p>
          Our Service uses artificial intelligence (AI) to analyze customer messages and generate automated responses. This includes:
        </p>
        <ul>
          <li>Classifying message intent and sentiment</li>
          <li>Generating personalized response messages based on your brand voice</li>
          <li>Determining when to send automated checkout links</li>
        </ul>
        <p>
          Message content is processed by OpenAI's API to provide these features. Message text is sent to OpenAI for classification and reply generation but is not used by OpenAI to train their models. We ensure that any third-party AI services we use comply with applicable data protection standards.
        </p>
      </section>

      <section>
        <h2>5. Information Sharing and Disclosure</h2>
        <p>We do not sell your personal information. We may share your information in the following circumstances:</p>
        
        <h3>5.1 Service Providers</h3>
        <p>We may share information with third-party service providers who perform services on our behalf, including:</p>
        <ul>
          <li>Cloud hosting and database services (Supabase)</li>
          <li>AI and machine learning services (OpenAI)</li>
          <li>Analytics and monitoring services</li>
        </ul>

        <h3>5.2 Legal Requirements</h3>
        <p>We may disclose your information if required to do so by law or in response to valid requests by public authorities.</p>

        <h3>5.3 Business Transfers</h3>
        <p>If we are involved in a merger, acquisition, or asset sale, your information may be transferred as part of that transaction.</p>
      </section>

      <section>
        <h2>6. Data Security</h2>
        <p>
          We implement appropriate technical and organizational security measures to protect your information against unauthorized access, alteration, disclosure, or destruction. However, no method of transmission over the Internet or electronic storage is 100% secure, and we cannot guarantee absolute security.
        </p>
      </section>

      <section>
        <h2>7. Data Retention and Deletion</h2>
        <p>
          We retain your information only as long as necessary to provide
          the Service. While the app is installed on your Shopify store,
          message and click data is retained so we can power analytics,
          attribution, and follow-up automation. When you uninstall the app
          from Shopify, all shop-scoped data — including messages, checkout
          links, click records, follow-ups, attribution, settings, and
          brand voice configuration — is automatically deleted within
          48 hours of uninstall via Shopify's mandatory{" "}
          <code>shop/redact</code> compliance webhook.
        </p>

        <h3>7.1 Shopify privacy compliance</h3>
        <p>
          We comply with Shopify's mandatory privacy webhooks
          (<code>customers/data_request</code>,{" "}
          <code>customers/redact</code>, and <code>shop/redact</code>) per
          Shopify's privacy law compliance requirements. Because we do not
          store individual Shopify customer profiles, the customer-scoped
          webhooks are processed and acknowledged but require no data
          deletion on our side. The shop-scoped webhook performs the full
          cascade delete described above.
        </p>

        <h3>7.2 Meta (Instagram) data deletion</h3>
        <p>
          We support Meta's Data Deletion Callback. The callback endpoint
          is{" "}
          <code>
            https://dm-checkout-ai-production.up.railway.app/meta/data-deletion
          </code>
          . When an Instagram user requests deletion of their data through
          Meta, we automatically remove their messages, checkout links,
          click records, follow-up records, and attribution data from our
          systems. End-users can also email{" "}
          <a href="mailto:support@socialrepl.ai">support@socialrepl.ai</a>{" "}
          to request deletion of their data; we will respond within 30
          days.
        </p>
      </section>

      <section>
        <h2>8. Your Rights</h2>
        <p>Depending on your location, you may have certain rights regarding your personal information, including:</p>
        <ul>
          <li><strong>Access:</strong> Request access to your personal information</li>
          <li><strong>Correction:</strong> Request correction of inaccurate information</li>
          <li><strong>Deletion:</strong> Request deletion of your personal information</li>
          <li><strong>Portability:</strong> Request transfer of your data to another service</li>
          <li><strong>Objection:</strong> Object to certain processing of your information</li>
        </ul>
        <p>
          To exercise these rights, please contact us using the information provided in the "Contact Us" section below.
        </p>

        <h3>8.1 California residents (CCPA / CPRA)</h3>
        <p>
          Under the California Consumer Privacy Act (CCPA), as amended by
          the California Privacy Rights Act (CPRA), California residents
          have the following rights regarding their personal information:
        </p>
        <ul>
          <li>
            <strong>Right to know:</strong> Request disclosure of the
            categories and specific pieces of personal information we
            collect, the sources of that information, the purposes for
            collecting it, and the categories of third parties with whom
            we share it.
          </li>
          <li>
            <strong>Right to delete:</strong> Request deletion of personal
            information we have collected from you, subject to certain
            exceptions.
          </li>
          <li>
            <strong>Right to correct:</strong> Request correction of
            inaccurate personal information.
          </li>
          <li>
            <strong>Right to opt out of sale or sharing:</strong>{" "}
            <strong>
              We do not sell personal information, and we do not share
              personal information for cross-context behavioral
              advertising.
            </strong>
          </li>
          <li>
            <strong>Right to limit use of sensitive personal
            information:</strong> We do not use or disclose sensitive
            personal information for purposes other than providing the
            Service.
          </li>
          <li>
            <strong>Right to non-discrimination:</strong> We will not
            discriminate against you for exercising any of your CCPA
            rights.
          </li>
        </ul>
        <p>
          To exercise these rights, email{" "}
          <a href="mailto:support@socialrepl.ai">support@socialrepl.ai</a>.
          We will respond within 45 days of receiving a verifiable request.
          You may also designate an authorized agent to make a request on
          your behalf.
        </p>
      </section>

      <section>
        <h2>9. Children's Privacy</h2>
        <p>
          Our Service is not intended for individuals under the age of 18. We do not knowingly collect personal information from children. If you believe we have collected information from a child, please contact us immediately.
        </p>
      </section>

      <section>
        <h2>10. International Data Transfers</h2>
        <p>
          Your information may be transferred to and processed in countries other than your country of residence. These countries may have data protection laws that differ from those in your country. By using our Service, you consent to the transfer of your information to these countries.
        </p>
      </section>

      <section>
        <h2>11. Changes to This Privacy Policy</h2>
        <p>
          We may update this Privacy Policy from time to time. We will notify you of any changes by posting the new Privacy Policy on this page and updating the "Last Updated" date. You are advised to review this Privacy Policy periodically for any changes.
        </p>
      </section>

      <section>
        <h2>12. Contact Us</h2>
        <p>
          If you have any questions about this Privacy Policy or our data practices, please contact us at:
        </p>
        <p>
          <strong>Tennyson Labs LLC</strong><br />
          SocialRepl.ai<br />
          Email: support@socialrepl.ai<br />
          Website: https://www.socialrepl.ai
        </p>
      </section>
    </div>
  );
}

