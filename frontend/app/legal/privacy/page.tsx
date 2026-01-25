'use client';

import Link from 'next/link';
import { BarChart3 } from 'lucide-react';

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-40 bg-black/95 backdrop-blur-md border-b border-white/10">
        <div className="max-w-7xl mx-auto px-6 sm:px-8 h-20 flex items-center justify-between">
          <Link href="/" className="flex items-center space-x-3 group">
            <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-[#2563eb] text-white transition-transform duration-300 group-hover:scale-105">
              <BarChart3 className="w-6 h-6" />
            </div>
            <span className="text-2xl font-bold text-white tracking-tight">PriceIQ</span>
          </Link>

          <div className="hidden lg:flex items-center space-x-8">
            <Link href="/#features" className="text-white/80 hover:text-white transition-colors font-medium text-base">
              Features
            </Link>
            <Link href="/pricing" className="text-white/80 hover:text-white transition-colors font-medium text-base">
              Pricing
            </Link>
            <Link href="/resources" className="text-white/80 hover:text-white transition-colors font-medium text-base">
              Resources
            </Link>
            <Link href="/contact" className="text-white/80 hover:text-white transition-colors font-medium text-base">
              Schedule A Demo
            </Link>
          </div>

          <div className="flex items-center space-x-4">
            <Link href="/auth/login" className="text-white/90 hover:text-white transition-colors font-semibold text-base">
              Sign in
            </Link>
            <Link href="/auth/signup">
              <button className="bg-[#2563eb] hover:bg-[#1d4ed8] text-white px-6 py-2.5 rounded-lg font-bold text-base transition-all duration-300 hover:shadow-lg hover:shadow-[#2563eb]/30 hover:-translate-y-0.5">
                Get Started
              </button>
            </Link>
          </div>
        </div>
      </nav>

      <main className="pt-20">
        {/* Hero Section */}
        <section className="py-16 bg-gray-50">
          <div className="max-w-4xl mx-auto px-6 sm:px-8">
            <h1 className="text-4xl sm:text-5xl font-bold text-gray-900 mb-4">Privacy Policy</h1>
            <p className="text-lg text-gray-600">Last updated: January 20, 2026</p>
          </div>
        </section>

        {/* Content */}
        <section className="py-16 bg-white">
          <div className="max-w-4xl mx-auto px-6 sm:px-8">
            <div className="prose prose-lg max-w-none">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">Introduction</h2>
              <p className="text-gray-600 mb-6 leading-relaxed">
                Intrepix LLC ("we," "our," or "us") operates PriceIQ, a government contracting pricing automation platform. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our service.
              </p>

              <h2 className="text-2xl font-bold text-gray-900 mb-4 mt-8">Information We Collect</h2>
              <h3 className="text-xl font-bold text-gray-900 mb-3 mt-6">Account Information</h3>
              <p className="text-gray-600 mb-4 leading-relaxed">
                When you create an account, we collect:
              </p>
              <ul className="list-disc pl-6 text-gray-600 mb-6 space-y-2">
                <li>Name and email address</li>
                <li>Company information</li>
                <li>Password (encrypted)</li>
                <li>Organization details</li>
              </ul>

              <h3 className="text-xl font-bold text-gray-900 mb-3">Proposal Data</h3>
              <p className="text-gray-600 mb-4 leading-relaxed">
                When you use PriceIQ, we process:
              </p>
              <ul className="list-disc pl-6 text-gray-600 mb-6 space-y-2">
                <li>RFP documents you upload</li>
                <li>Job descriptions and labor categories</li>
                <li>Pricing calculations and rates</li>
                <li>Generated proposals and exports</li>
              </ul>

              <h3 className="text-xl font-bold text-gray-900 mb-3">Usage Information</h3>
              <p className="text-gray-600 mb-6 leading-relaxed">
                We automatically collect information about how you use PriceIQ, including IP addresses, browser type, device information, pages visited, and interaction data.
              </p>

              <h2 className="text-2xl font-bold text-gray-900 mb-4 mt-8">How We Use Your Information</h2>
              <p className="text-gray-600 mb-4 leading-relaxed">
                We use the information we collect to:
              </p>
              <ul className="list-disc pl-6 text-gray-600 mb-6 space-y-2">
                <li>Provide, maintain, and improve PriceIQ services</li>
                <li>Process your proposals and generate pricing</li>
                <li>Authenticate your account and prevent fraud</li>
                <li>Send you service updates and important notices</li>
                <li>Respond to your support requests</li>
                <li>Analyze usage patterns to improve our platform</li>
                <li>Comply with legal obligations</li>
              </ul>

              <h2 className="text-2xl font-bold text-gray-900 mb-4 mt-8">Data Security</h2>
              <p className="text-gray-600 mb-4 leading-relaxed">
                We implement industry-standard security measures to protect your information:
              </p>
              <ul className="list-disc pl-6 text-gray-600 mb-6 space-y-2">
                <li>Encryption in transit (TLS/SSL) and at rest</li>
                <li>Secure password hashing with bcrypt</li>
                <li>Role-based access control (RBAC)</li>
                <li>Regular security audits and monitoring</li>
                <li>Organization-level data isolation</li>
                <li>Complete audit trails for all data access</li>
              </ul>

              <h2 className="text-2xl font-bold text-gray-900 mb-4 mt-8">Data Sharing and Disclosure</h2>
              <p className="text-gray-600 mb-4 leading-relaxed">
                We do not sell your personal information. We may share your information only in the following circumstances:
              </p>
              <ul className="list-disc pl-6 text-gray-600 mb-6 space-y-2">
                <li><strong>Within Your Organization:</strong> With other users in your organization workspace based on access permissions</li>
                <li><strong>Service Providers:</strong> With third-party vendors who help us operate PriceIQ (cloud hosting, analytics)</li>
                <li><strong>Legal Requirements:</strong> When required by law or to protect our rights and safety</li>
                <li><strong>Business Transfers:</strong> In connection with a merger, acquisition, or sale of assets</li>
              </ul>

              <h2 className="text-2xl font-bold text-gray-900 mb-4 mt-8">Your Rights and Choices</h2>
              <p className="text-gray-600 mb-4 leading-relaxed">
                You have the following rights regarding your personal information:
              </p>
              <ul className="list-disc pl-6 text-gray-600 mb-6 space-y-2">
                <li><strong>Access:</strong> Request a copy of your personal data</li>
                <li><strong>Correction:</strong> Update or correct inaccurate information</li>
                <li><strong>Deletion:</strong> Request deletion of your account and data</li>
                <li><strong>Export:</strong> Download your proposals and data</li>
                <li><strong>Opt-out:</strong> Unsubscribe from marketing communications</li>
              </ul>
              <p className="text-gray-600 mb-6 leading-relaxed">
                To exercise these rights, contact us at <a href="mailto:service@priceiq.org" className="text-[#2563eb] hover:underline">service@priceiq.org</a>
              </p>

              <h2 className="text-2xl font-bold text-gray-900 mb-4 mt-8">Data Retention</h2>
              <p className="text-gray-600 mb-6 leading-relaxed">
                We retain your information for as long as your account is active or as needed to provide services. After account deletion, we may retain certain data for legal compliance, fraud prevention, and backup purposes for up to 90 days.
              </p>

              <h2 className="text-2xl font-bold text-gray-900 mb-4 mt-8">Cookies and Tracking</h2>
              <p className="text-gray-600 mb-6 leading-relaxed">
                We use cookies and similar technologies to maintain your session, remember your preferences, and analyze platform usage. You can control cookies through your browser settings, but some features may not function properly if cookies are disabled.
              </p>

              <h2 className="text-2xl font-bold text-gray-900 mb-4 mt-8">Children's Privacy</h2>
              <p className="text-gray-600 mb-6 leading-relaxed">
                PriceIQ is not intended for users under 18 years of age. We do not knowingly collect information from children.
              </p>

              <h2 className="text-2xl font-bold text-gray-900 mb-4 mt-8">International Data Transfers</h2>
              <p className="text-gray-600 mb-6 leading-relaxed">
                Your information may be transferred to and processed in the United States or other countries where our service providers operate. We ensure appropriate safeguards are in place for international data transfers.
              </p>

              <h2 className="text-2xl font-bold text-gray-900 mb-4 mt-8">Changes to This Privacy Policy</h2>
              <p className="text-gray-600 mb-6 leading-relaxed">
                We may update this Privacy Policy from time to time. We will notify you of significant changes by email or through a prominent notice on our platform. Your continued use of PriceIQ after changes become effective constitutes acceptance of the updated policy.
              </p>

              <h2 className="text-2xl font-bold text-gray-900 mb-4 mt-8">Contact Us</h2>
              <p className="text-gray-600 mb-4 leading-relaxed">
                If you have questions about this Privacy Policy or our data practices, please contact us:
              </p>
              <div className="bg-gray-50 rounded-lg p-6 mb-6">
                <p className="text-gray-900 font-semibold mb-2">Intrepix LLC</p>
                <p className="text-gray-600">Email: <a href="mailto:service@priceiq.org" className="text-[#2563eb] hover:underline">service@priceiq.org</a></p>
              </div>

              <h2 className="text-2xl font-bold text-gray-900 mb-4 mt-8">Compliance</h2>
              <p className="text-gray-600 mb-6 leading-relaxed">
                PriceIQ is designed to support government contracting compliance requirements. We maintain security standards aligned with NIST guidelines and work to ensure our platform meets the needs of contractors working with federal agencies.
              </p>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="bg-black text-white py-12">
        <div className="max-w-7xl mx-auto px-6 sm:px-8 text-center">
          <p className="text-gray-400">© 2026 PriceIQ by Intrepix LLC. All rights reserved.</p>
          <div className="flex items-center justify-center gap-6 mt-4">
            <Link href="/legal/privacy" className="text-gray-400 hover:text-white transition-colors">Privacy Policy</Link>
            <Link href="/legal/terms" className="text-gray-400 hover:text-white transition-colors">Terms of Service</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
