import { useLoaderData } from "react-router";

export const loader = async () => {
  return {
    lastUpdated: new Date().toISOString().split('T')[0],
  };
};

export default function TermsOfService() {
  const { lastUpdated } = useLoaderData();

  return (
    <div style={{ maxWidth: "900px", margin: "0 auto", padding: "40px 20px", fontFamily: "system-ui, -apple-system, sans-serif", lineHeight: "1.6", color: "#333" }}>
      <h1 style={{ fontSize: "32px", marginBottom: "10px", color: "#000" }}>Terms of Service</h1>
      <p style={{ color: "#666", marginBottom: "40px" }}>Last Updated: {lastUpdated}</p>

      <section style={{ marginBottom: "30px" }}>
        <h2 style={{ fontSize: "24px", marginBottom: "15px", color: "#000" }}>1. Agreement to Terms</h2>
        <p>
          By accessing or using SocialRepl.ai (the "Service"), you agree to be bound by these Terms of Service ("Terms"). If you disagree with any part of these Terms, then you may not access the Service.
        </p>
        <p style={{ marginTop: "15px" }}>
          These Terms apply to all users of the Service, including merchants who install the app on their Shopify stores and any end users who interact with automated messages sent through the Service.
        </p>
      </section>

      <section style={{ marginBottom: "30px" }}>
        <h2 style={{ fontSize: "24px", marginBottom: "15px", color: "#000" }}>2. Description of Service</h2>
        <p>
          SocialRepl.ai is a Shopify application that provides automated messaging services for Instagram. The Service allows merchants to:
        </p>
        <ul style={{ marginLeft: "20px", marginTop: "10px" }}>
          <li>Connect their Instagram business accounts</li>
          <li>Automatically respond to Instagram direct messages and comments</li>
          <li>Send automated checkout links to customers</li>
          <li>Track and analyze messaging performance and order attribution</li>
          <li>Customize AI-generated responses based on brand voice</li>
        </ul>
      </section>

      <section style={{ marginBottom: "30px" }}>
        <h2 style={{ fontSize: "24px", marginBottom: "15px", color: "#000" }}>3. Eligibility</h2>
        <p>To use the Service, you must:</p>
        <ul style={{ marginLeft: "20px", marginTop: "10px" }}>
          <li>Be at least 18 years old</li>
          <li>Have a valid Shopify store</li>
          <li>Have an Instagram business account</li>
          <li>Have the legal authority to bind your business to these Terms</li>
          <li>Comply with all applicable laws and regulations</li>
        </ul>
      </section>

      <section style={{ marginBottom: "30px" }}>
        <h2 style={{ fontSize: "24px", marginBottom: "15px", color: "#000" }}>4. Account Registration and Security</h2>
        <p>
          You are responsible for maintaining the security of your account and for all activities that occur under your account. You agree to:
        </p>
        <ul style={{ marginLeft: "20px", marginTop: "10px" }}>
          <li>Provide accurate and complete information when registering</li>
          <li>Keep your account credentials secure and confidential</li>
          <li>Notify us immediately of any unauthorized use of your account</li>
          <li>Be responsible for all activities that occur under your account</li>
        </ul>
      </section>

      <section style={{ marginBottom: "30px" }}>
        <h2 style={{ fontSize: "24px", marginBottom: "15px", color: "#000" }}>5. Subscription Plans and Billing</h2>
        <p>
          The Service is offered through subscription plans with different features and usage limits:
        </p>
        <ul style={{ marginLeft: "20px", marginTop: "10px" }}>
          <li><strong>Free Plan:</strong> Limited features and message caps</li>
          <li><strong>Growth Plan:</strong> Enhanced features for growing businesses</li>
          <li><strong>Pro Plan:</strong> Full feature access with advanced analytics</li>
        </ul>
        <p style={{ marginTop: "15px" }}>
          Subscription fees are billed through Shopify and are subject to change with notice. You may cancel your subscription at any time through your Shopify admin panel. Refunds are handled in accordance with Shopify's refund policies.
        </p>
      </section>

      <section style={{ marginBottom: "30px" }}>
        <h2 style={{ fontSize: "24px", marginBottom: "15px", color: "#000" }}>6. Acceptable Use</h2>
        <p>You agree not to use the Service to:</p>
        <ul style={{ marginLeft: "20px", marginTop: "10px" }}>
          <li>Violate any applicable laws or regulations</li>
          <li>Send spam, unsolicited messages, or harassing content</li>
          <li>Impersonate any person or entity</li>
          <li>Infringe upon the intellectual property rights of others</li>
          <li>Transmit any viruses, malware, or harmful code</li>
          <li>Interfere with or disrupt the Service or servers</li>
          <li>Attempt to gain unauthorized access to any part of the Service</li>
          <li>Use the Service for any illegal or unauthorized purpose</li>
        </ul>
      </section>

      <section style={{ marginBottom: "30px" }}>
        <h2 style={{ fontSize: "24px", marginBottom: "15px", color: "#000" }}>7. Automated Messaging and Compliance</h2>
        <p>
          You are responsible for ensuring that automated messages sent through the Service comply with:
        </p>
        <ul style={{ marginLeft: "20px", marginTop: "10px" }}>
          <li>Instagram's Terms of Service and Community Guidelines</li>
          <li>Meta's Business Messaging Policies</li>
          <li>Applicable anti-spam laws (CAN-SPAM Act, GDPR, etc.)</li>
          <li>Any other relevant platform policies or regulations</li>
        </ul>
        <p style={{ marginTop: "15px" }}>
          We reserve the right to suspend or terminate accounts that violate these policies or engage in abusive messaging practices.
        </p>
      </section>

      <section style={{ marginBottom: "30px" }}>
        <h2 style={{ fontSize: "24px", marginBottom: "15px", color: "#000" }}>8. Intellectual Property</h2>
        <p>
          The Service and its original content, features, and functionality are owned by SocialRepl.ai and are protected by international copyright, trademark, patent, trade secret, and other intellectual property laws.
        </p>
        <p style={{ marginTop: "15px" }}>
          You retain ownership of any content you provide through the Service. By using the Service, you grant us a license to use, store, and process your content solely for the purpose of providing the Service.
        </p>
      </section>

      <section style={{ marginBottom: "30px" }}>
        <h2 style={{ fontSize: "24px", marginBottom: "15px", color: "#000" }}>9. Third-Party Services</h2>
        <p>
          The Service integrates with third-party services, including Shopify and Meta (Facebook/Instagram). Your use of these services is subject to their respective terms of service and privacy policies. We are not responsible for the practices of these third-party services.
        </p>
      </section>

      <section style={{ marginBottom: "30px" }}>
        <h2 style={{ fontSize: "24px", marginBottom: "15px", color: "#000" }}>10. Disclaimers</h2>
        <p>
          THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, OR NON-INFRINGEMENT.
        </p>
        <p style={{ marginTop: "15px" }}>
          We do not warrant that the Service will be uninterrupted, secure, or error-free, or that any defects will be corrected. We do not guarantee the accuracy, completeness, or usefulness of any information provided through the Service.
        </p>
      </section>

      <section style={{ marginBottom: "30px" }}>
        <h2 style={{ fontSize: "24px", marginBottom: "15px", color: "#000" }}>11. Limitation of Liability</h2>
        <p>
          TO THE MAXIMUM EXTENT PERMITTED BY LAW, SOCIALREPL.AI SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR ANY LOSS OF PROFITS OR REVENUES, WHETHER INCURRED DIRECTLY OR INDIRECTLY, OR ANY LOSS OF DATA, USE, GOODWILL, OR OTHER INTANGIBLE LOSSES, RESULTING FROM YOUR USE OF THE SERVICE.
        </p>
        <p style={{ marginTop: "15px" }}>
          Our total liability for any claims arising out of or relating to the Service shall not exceed the amount you paid us in the twelve (12) months preceding the claim.
        </p>
      </section>

      <section style={{ marginBottom: "30px" }}>
        <h2 style={{ fontSize: "24px", marginBottom: "15px", color: "#000" }}>12. Indemnification</h2>
        <p>
          You agree to indemnify, defend, and hold harmless SocialRepl.ai and its officers, directors, employees, and agents from and against any claims, liabilities, damages, losses, and expenses, including reasonable attorneys' fees, arising out of or in any way connected with your use of the Service, violation of these Terms, or infringement of any rights of another.
        </p>
      </section>

      <section style={{ marginBottom: "30px" }}>
        <h2 style={{ fontSize: "24px", marginBottom: "15px", color: "#000" }}>13. Termination</h2>
        <p>
          We may terminate or suspend your account and access to the Service immediately, without prior notice or liability, for any reason, including if you breach these Terms. Upon termination, your right to use the Service will cease immediately.
        </p>
        <p style={{ marginTop: "15px" }}>
          You may terminate your account at any time by uninstalling the app from your Shopify store. Upon termination, we will delete or anonymize your data in accordance with our Privacy Policy.
        </p>
      </section>

      <section style={{ marginBottom: "30px" }}>
        <h2 style={{ fontSize: "24px", marginBottom: "15px", color: "#000" }}>14. Governing Law</h2>
        <p>
          These Terms shall be governed by and construed in accordance with the laws of [Your Jurisdiction], without regard to its conflict of law provisions. Any disputes arising out of or relating to these Terms or the Service shall be resolved in the courts of [Your Jurisdiction].
        </p>
      </section>

      <section style={{ marginBottom: "30px" }}>
        <h2 style={{ fontSize: "24px", marginBottom: "15px", color: "#000" }}>15. Changes to Terms</h2>
        <p>
          We reserve the right to modify or replace these Terms at any time. If a revision is material, we will provide at least 30 days' notice prior to any new terms taking effect. What constitutes a material change will be determined at our sole discretion.
        </p>
        <p style={{ marginTop: "15px" }}>
          By continuing to access or use the Service after any revisions become effective, you agree to be bound by the revised Terms.
        </p>
      </section>

      <section style={{ marginBottom: "30px" }}>
        <h2 style={{ fontSize: "24px", marginBottom: "15px", color: "#000" }}>16. Severability</h2>
        <p>
          If any provision of these Terms is held to be invalid or unenforceable by a court, the remaining provisions of these Terms will remain in effect.
        </p>
      </section>

      <section style={{ marginBottom: "30px" }}>
        <h2 style={{ fontSize: "24px", marginBottom: "15px", color: "#000" }}>17. Contact Information</h2>
        <p>
          If you have any questions about these Terms of Service, please contact us at:
        </p>
        <p style={{ marginTop: "10px" }}>
          <strong>SocialRepl.ai</strong><br />
          Email: legal@socialrepl.ai<br />
          Website: https://socialrepl.ai
        </p>
      </section>
    </div>
  );
}

