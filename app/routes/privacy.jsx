import { useLoaderData } from "react-router";

export const loader = async () => {
  return {
    lastUpdated: new Date().toISOString().split('T')[0],
  };
};

export default function PrivacyPolicy() {
  const { lastUpdated } = useLoaderData();

  return (
    <div style={{ maxWidth: "900px", margin: "0 auto", padding: "40px 20px", fontFamily: "system-ui, -apple-system, sans-serif", lineHeight: "1.6", color: "#333" }}>
      <h1 style={{ fontSize: "32px", marginBottom: "10px", color: "#000" }}>Privacy Policy</h1>
      <p style={{ color: "#666", marginBottom: "40px" }}>Last Updated: {lastUpdated}</p>

      <section style={{ marginBottom: "30px" }}>
        <h2 style={{ fontSize: "24px", marginBottom: "15px", color: "#000" }}>1. Introduction</h2>
        <p>
          SocialRepl.ai ("we," "our," or "us") is committed to protecting your privacy. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our Shopify application (the "Service"). Please read this Privacy Policy carefully. If you do not agree with the terms of this Privacy Policy, please do not access or use the Service.
        </p>
      </section>

      <section style={{ marginBottom: "30px" }}>
        <h2 style={{ fontSize: "24px", marginBottom: "15px", color: "#000" }}>2. Information We Collect</h2>
        
        <h3 style={{ fontSize: "18px", marginTop: "20px", marginBottom: "10px", color: "#000" }}>2.1 Information You Provide</h3>
        <p>We collect information that you provide directly to us, including:</p>
        <ul style={{ marginLeft: "20px", marginTop: "10px" }}>
          <li>Shopify store information (store name, domain, and related data)</li>
          <li>Instagram account information when you connect your account</li>
          <li>Settings and preferences for automated messaging</li>
          <li>Brand voice customization data</li>
        </ul>

        <h3 style={{ fontSize: "18px", marginTop: "20px", marginBottom: "10px", color: "#000" }}>2.2 Information We Collect Automatically</h3>
        <p>When you use our Service, we automatically collect certain information, including:</p>
        <ul style={{ marginLeft: "20px", marginTop: "10px" }}>
          <li>Instagram messages and comments received by your account</li>
          <li>Customer interaction data (message content, timestamps, channel type)</li>
          <li>Click-through data from checkout links sent via our Service</li>
          <li>Order attribution data when customers make purchases</li>
          <li>Analytics and usage statistics</li>
        </ul>

        <h3 style={{ fontSize: "18px", marginTop: "20px", marginBottom: "10px", color: "#000" }}>2.3 Information from Third Parties</h3>
        <p>We receive information from third-party services you connect to our Service:</p>
        <ul style={{ marginLeft: "20px", marginTop: "10px" }}>
          <li><strong>Shopify:</strong> Store data, product information, order data, and customer information</li>
          <li><strong>Meta (Facebook/Instagram):</strong> Instagram account data, messages, comments, and media content</li>
        </ul>
      </section>

      <section style={{ marginBottom: "30px" }}>
        <h2 style={{ fontSize: "24px", marginBottom: "15px", color: "#000" }}>3. How We Use Your Information</h2>
        <p>We use the information we collect to:</p>
        <ul style={{ marginLeft: "20px", marginTop: "10px" }}>
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

      <section style={{ marginBottom: "30px" }}>
        <h2 style={{ fontSize: "24px", marginBottom: "15px", color: "#000" }}>4. Data Processing and AI</h2>
        <p>
          Our Service uses artificial intelligence (AI) to analyze customer messages and generate automated responses. This includes:
        </p>
        <ul style={{ marginLeft: "20px", marginTop: "10px" }}>
          <li>Classifying message intent and sentiment</li>
          <li>Generating personalized response messages based on your brand voice</li>
          <li>Determining when to send automated checkout links</li>
        </ul>
        <p style={{ marginTop: "15px" }}>
          Message content may be processed by third-party AI services (such as OpenAI) to provide these features. We ensure that any third-party AI services we use comply with applicable data protection standards.
        </p>
      </section>

      <section style={{ marginBottom: "30px" }}>
        <h2 style={{ fontSize: "24px", marginBottom: "15px", color: "#000" }}>5. Information Sharing and Disclosure</h2>
        <p>We do not sell your personal information. We may share your information in the following circumstances:</p>
        
        <h3 style={{ fontSize: "18px", marginTop: "20px", marginBottom: "10px", color: "#000" }}>5.1 Service Providers</h3>
        <p>We may share information with third-party service providers who perform services on our behalf, including:</p>
        <ul style={{ marginLeft: "20px", marginTop: "10px" }}>
          <li>Cloud hosting and database services (Supabase)</li>
          <li>AI and machine learning services (OpenAI)</li>
          <li>Analytics and monitoring services</li>
        </ul>

        <h3 style={{ fontSize: "18px", marginTop: "20px", marginBottom: "10px", color: "#000" }}>5.2 Legal Requirements</h3>
        <p>We may disclose your information if required to do so by law or in response to valid requests by public authorities.</p>

        <h3 style={{ fontSize: "18px", marginTop: "20px", marginBottom: "10px", color: "#000" }}>5.3 Business Transfers</h3>
        <p>If we are involved in a merger, acquisition, or asset sale, your information may be transferred as part of that transaction.</p>
      </section>

      <section style={{ marginBottom: "30px" }}>
        <h2 style={{ fontSize: "24px", marginBottom: "15px", color: "#000" }}>6. Data Security</h2>
        <p>
          We implement appropriate technical and organizational security measures to protect your information against unauthorized access, alteration, disclosure, or destruction. However, no method of transmission over the Internet or electronic storage is 100% secure, and we cannot guarantee absolute security.
        </p>
      </section>

      <section style={{ marginBottom: "30px" }}>
        <h2 style={{ fontSize: "24px", marginBottom: "15px", color: "#000" }}>7. Data Retention</h2>
        <p>
          We retain your information for as long as necessary to provide our Service and fulfill the purposes outlined in this Privacy Policy, unless a longer retention period is required or permitted by law. When you delete your account or uninstall the app, we will delete or anonymize your data in accordance with our data retention policies.
        </p>
      </section>

      <section style={{ marginBottom: "30px" }}>
        <h2 style={{ fontSize: "24px", marginBottom: "15px", color: "#000" }}>8. Your Rights</h2>
        <p>Depending on your location, you may have certain rights regarding your personal information, including:</p>
        <ul style={{ marginLeft: "20px", marginTop: "10px" }}>
          <li><strong>Access:</strong> Request access to your personal information</li>
          <li><strong>Correction:</strong> Request correction of inaccurate information</li>
          <li><strong>Deletion:</strong> Request deletion of your personal information</li>
          <li><strong>Portability:</strong> Request transfer of your data to another service</li>
          <li><strong>Objection:</strong> Object to certain processing of your information</li>
        </ul>
        <p style={{ marginTop: "15px" }}>
          To exercise these rights, please contact us using the information provided in the "Contact Us" section below.
        </p>
      </section>

      <section style={{ marginBottom: "30px" }}>
        <h2 style={{ fontSize: "24px", marginBottom: "15px", color: "#000" }}>9. Children's Privacy</h2>
        <p>
          Our Service is not intended for individuals under the age of 18. We do not knowingly collect personal information from children. If you believe we have collected information from a child, please contact us immediately.
        </p>
      </section>

      <section style={{ marginBottom: "30px" }}>
        <h2 style={{ fontSize: "24px", marginBottom: "15px", color: "#000" }}>10. International Data Transfers</h2>
        <p>
          Your information may be transferred to and processed in countries other than your country of residence. These countries may have data protection laws that differ from those in your country. By using our Service, you consent to the transfer of your information to these countries.
        </p>
      </section>

      <section style={{ marginBottom: "30px" }}>
        <h2 style={{ fontSize: "24px", marginBottom: "15px", color: "#000" }}>11. Changes to This Privacy Policy</h2>
        <p>
          We may update this Privacy Policy from time to time. We will notify you of any changes by posting the new Privacy Policy on this page and updating the "Last Updated" date. You are advised to review this Privacy Policy periodically for any changes.
        </p>
      </section>

      <section style={{ marginBottom: "30px" }}>
        <h2 style={{ fontSize: "24px", marginBottom: "15px", color: "#000" }}>12. Contact Us</h2>
        <p>
          If you have any questions about this Privacy Policy or our data practices, please contact us at:
        </p>
        <p style={{ marginTop: "10px" }}>
          <strong>SocialRepl.ai</strong><br />
          Email: privacy@socialrepl.ai<br />
          Website: https://socialrepl.ai
        </p>
      </section>
    </div>
  );
}

