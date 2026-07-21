export default function TermsPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-3xl mx-auto px-6 py-12 bg-white">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">FirmTrack User Agreement</h1>
        <p className="text-sm text-gray-500 mb-10">Last updated: [DATE]</p>

        <div className="prose prose-sm max-w-none space-y-8 text-gray-700">
          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">1. Acceptance of Terms</h2>
            <p>
              This User Agreement ("Agreement") governs your organization's access to and use of
              FirmTrack (the "Service"), operated by [COMPANY LEGAL NAME] ("FirmTrack," "we," "us").
              By creating an account, you confirm that you are authorized to accept this Agreement on
              behalf of your organization, and that your organization agrees to be bound by it.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">2. Description of Service</h2>
            <p>
              FirmTrack is a practice management platform for legal practices, providing tools
              including time and billing tracking, accounting, human resources, calendaring, and
              related administrative modules.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-3">3. Security Guaranty</h2>
            <p className="mb-3">
              FirmTrack understands that legal practices handle sensitive client information and hold
              that data to a high standard of care. As part of this Agreement, FirmTrack commits to the
              following technical safeguards for every account, at no additional cost:
            </p>
            <ul className="list-disc pl-6 space-y-1.5">
              <li>
                <strong>Encryption in transit.</strong> All traffic between your browser and FirmTrack
                is encrypted using HTTPS/TLS.
              </li>
              <li>
                <strong>Security audit logging.</strong> Sign-ins, sign-in failures, password resets,
                and administrative actions (role changes, account deactivation, session revocation) are
                logged and visible to your organization's administrators.
              </li>
              <li>
                <strong>Automated lockout.</strong> Accounts and IP addresses are automatically,
                temporarily locked out after repeated failed sign-in attempts.
              </li>
              <li>
                <strong>Session revocation.</strong> An administrator can immediately sign a user out of
                every active session, on every device, if a device or account is lost or compromised.
              </li>
              <li>
                <strong>Multi-factor authentication.</strong> FirmTrack supports authenticator-app-based
                multi-factor authentication (TOTP) and, by default, requires it for every user. Your
                organization's administrator may disable this default only after confirming your
                organization's own identity provider independently enforces multi-factor
                authentication.
              </li>
              <li>
                <strong>Single sign-on.</strong> Organizations may allow their members to sign in with
                their existing Microsoft or Google account, relying on that provider's own security
                controls (e.g., Conditional Access policies).
              </li>
              <li>
                <strong>Tenant data isolation.</strong> Each organization's data is logically separated
                from every other organization's and is accessible only to authorized members of that
                organization.
              </li>
              <li>
                <strong>Role-based access control.</strong> Access to sensitive administrative functions
                is restricted by role within your organization.
              </li>
            </ul>
            <p className="mt-3">
              [ADDITIONAL COMMITMENTS -- e.g. data breach notification timeline, backup/retention
              policy, sub-processor list, security incident response process, cyber insurance -- to be
              added by FirmTrack's counsel before this Agreement is relied upon by customers.]
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">4. Your Account and Data</h2>
            <p>
              You are responsible for maintaining the confidentiality of your account credentials and
              for all activity under your account. You retain ownership of all data you submit to the
              Service. [DATA RETENTION / EXPORT / DELETION TERMS.]
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">5. Acceptable Use</h2>
            <p>
              You agree not to use the Service to violate any applicable law, infringe any third
              party's rights, or attempt to gain unauthorized access to any part of the Service or any
              other organization's data.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">6. Fees and Subscription</h2>
            <p>[FEES, BILLING CYCLE, AND REFUND TERMS.]</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">7. Confidentiality</h2>
            <p>
              FirmTrack will not access, use, or disclose data you submit to the Service except as
              necessary to provide the Service, comply with law, or as you otherwise direct.
              [ADDITIONAL CONFIDENTIALITY TERMS.]
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">8. Disclaimer of Warranties</h2>
            <p>
              Except as expressly stated in Section 3 (Security Guaranty), the Service is provided "as
              is" without warranties of any kind, whether express or implied. [JURISDICTION-SPECIFIC
              WARRANTY DISCLAIMER LANGUAGE.]
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">9. Limitation of Liability</h2>
            <p>[LIABILITY CAP AND EXCLUSIONS -- TO BE SET BY FIRMTRACK WITH COUNSEL.]</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">10. Termination</h2>
            <p>
              Either party may terminate this Agreement as described at [TERMINATION TERMS AND NOTICE
              PERIOD].
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">11. Changes to this Agreement</h2>
            <p>
              We may update this Agreement from time to time. [NOTICE PERIOD AND METHOD FOR MATERIAL
              CHANGES.]
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">12. Governing Law</h2>
            <p>This Agreement is governed by the laws of [GOVERNING LAW JURISDICTION].</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">13. Contact</h2>
            <p>Questions about this Agreement can be sent to [CONTACT EMAIL].</p>
          </section>
        </div>
      </div>
    </div>
  )
}
