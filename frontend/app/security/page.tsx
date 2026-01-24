'use client';

import Link from 'next/link';
import { BarChart3, Shield, Lock, Eye, FileCheck, Server, Users, CheckCircle2 } from 'lucide-react';

export default function SecurityPage() {
  const securityFeatures = [
    {
      icon: <Lock className="w-8 h-8" />,
      title: "Enterprise-Grade Encryption",
      description: "All data is encrypted in transit (TLS 1.3) and at rest (AES-256) to protect your sensitive proposal information."
    },
    {
      icon: <Eye className="w-8 h-8" />,
      title: "Complete Audit Trails",
      description: "Every action is logged with full audit trails, providing transparency and accountability for compliance requirements."
    },
    {
      icon: <Users className="w-8 h-8" />,
      title: "Role-Based Access Control",
      description: "Granular permissions ensure team members only access the data they need with admin and user roles."
    },
    {
      icon: <Server className="w-8 h-8" />,
      title: "Secure Infrastructure",
      description: "Our platform runs on industry-leading cloud infrastructure with 99.9% uptime and regular security audits."
    },
    {
      icon: <Shield className="w-8 h-8" />,
      title: "Multi-Tenant Isolation",
      description: "Organization data is completely isolated, preventing any cross-contamination or unauthorized access."
    },
    {
      icon: <FileCheck className="w-8 h-8" />,
      title: "NIST-Aligned Standards",
      description: "Our security practices align with NIST guidelines to support government contracting requirements."
    }
  ];

  const complianceStandards = [
    {
      name: "NIST Cybersecurity Framework",
      description: "Our security controls align with NIST standards for government contractors"
    },
    {
      name: "SOC 2 Type II",
      description: "Currently pursuing SOC 2 Type II certification for enhanced security assurance"
    },
    {
      name: "Data Privacy",
      description: "GDPR and privacy-focused data handling practices"
    },
    {
      name: "Regular Audits",
      description: "Continuous security monitoring and quarterly penetration testing"
    }
  ];

  const dataProtection = [
    "Password hashing with bcrypt (industry-standard)",
    "JWT tokens with 30-minute expiration",
    "Token blacklisting for secure logout",
    "Secure session management",
    "Protection against SQL injection, XSS, and CSRF attacks",
    "Rate limiting and DDoS protection",
    "Regular automated backups",
    "Disaster recovery procedures"
  ];

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
              Talk to Sales
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
        <section className="py-16 lg:py-24 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white">
          <div className="max-w-5xl mx-auto px-6 sm:px-8 text-center">
            <div className="w-20 h-20 bg-[#2563eb] rounded-2xl flex items-center justify-center mx-auto mb-6">
              <Shield className="w-10 h-10 text-white" />
            </div>
            <h1 className="text-5xl sm:text-6xl font-bold mb-6 leading-tight">
              Security You Can Trust
            </h1>
            <p className="text-xl text-white/90 max-w-3xl mx-auto leading-relaxed">
              Your proposal data is critical. We protect it with enterprise-grade security, complete transparency, and compliance-ready controls.
            </p>
          </div>
        </section>

        {/* Security Features */}
        <section className="py-16 lg:py-24 bg-white">
          <div className="max-w-7xl mx-auto px-6 sm:px-8">
            <h2 className="text-3xl font-bold text-gray-900 mb-12 text-center">How We Protect Your Data</h2>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
              {securityFeatures.map((feature, index) => (
                <div key={index} className="bg-gray-50 rounded-2xl p-8 hover:shadow-lg transition-all duration-300">
                  <div className="w-16 h-16 bg-blue-100 rounded-xl flex items-center justify-center mb-6 text-[#2563eb]">
                    {feature.icon}
                  </div>
                  <h3 className="text-xl font-bold text-gray-900 mb-3">{feature.title}</h3>
                  <p className="text-gray-600 leading-relaxed">{feature.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Data Protection */}
        <section className="py-16 lg:py-24 bg-gray-50">
          <div className="max-w-7xl mx-auto px-6 sm:px-8">
            <div className="grid lg:grid-cols-2 gap-12 items-center">
              <div>
                <h2 className="text-3xl font-bold text-gray-900 mb-6">Comprehensive Data Protection</h2>
                <p className="text-lg text-gray-600 mb-8 leading-relaxed">
                  We implement multiple layers of security to ensure your sensitive proposal data remains protected at all times.
                </p>
                <div className="space-y-3">
                  {dataProtection.map((item, index) => (
                    <div key={index} className="flex items-start gap-3">
                      <CheckCircle2 className="w-6 h-6 text-[#2563eb] flex-shrink-0 mt-0.5" />
                      <span className="text-gray-700">{item}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="bg-white rounded-2xl p-10 shadow-xl">
                <h3 className="text-2xl font-bold text-gray-900 mb-6">Security Commitment</h3>
                <div className="space-y-6">
                  <div>
                    <div className="text-4xl font-bold text-[#2563eb] mb-2">99.9%</div>
                    <div className="text-gray-600">Platform Uptime</div>
                  </div>
                  <div>
                    <div className="text-4xl font-bold text-[#2563eb] mb-2">24/7</div>
                    <div className="text-gray-600">Security Monitoring</div>
                  </div>
                  <div>
                    <div className="text-4xl font-bold text-[#2563eb] mb-2">100%</div>
                    <div className="text-gray-600">Data Encryption</div>
                  </div>
                  <div>
                    <div className="text-4xl font-bold text-[#2563eb] mb-2">&lt;1hr</div>
                    <div className="text-gray-600">Security Incident Response</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Compliance */}
        <section className="py-16 lg:py-24 bg-white">
          <div className="max-w-7xl mx-auto px-6 sm:px-8">
            <h2 className="text-3xl font-bold text-gray-900 mb-12 text-center">Compliance & Standards</h2>
            <div className="grid md:grid-cols-2 gap-6">
              {complianceStandards.map((standard, index) => (
                <div key={index} className="bg-gray-50 rounded-2xl p-8 border-l-4 border-[#2563eb]">
                  <h3 className="text-xl font-bold text-gray-900 mb-3">{standard.name}</h3>
                  <p className="text-gray-600 leading-relaxed">{standard.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Transparency */}
        <section className="py-16 lg:py-24 bg-gray-50">
          <div className="max-w-4xl mx-auto px-6 sm:px-8">
            <h2 className="text-3xl font-bold text-gray-900 mb-6 text-center">Our Security Promise</h2>
            <div className="bg-white rounded-2xl p-10 shadow-lg">
              <div className="prose prose-lg max-w-none">
                <p className="text-gray-600 leading-relaxed mb-4">
                  At PriceIQ, security isn't an afterthought—it's built into every layer of our platform. We understand that government contractors handle sensitive information and must meet strict compliance requirements.
                </p>
                <p className="text-gray-600 leading-relaxed mb-4">
                  Our commitment to security includes:
                </p>
                <ul className="space-y-2 text-gray-600 mb-4">
                  <li>Transparent security practices and regular updates</li>
                  <li>Prompt disclosure of any security incidents</li>
                  <li>Continuous improvement of our security posture</li>
                  <li>Regular third-party security assessments</li>
                  <li>Employee security training and background checks</li>
                </ul>
                <p className="text-gray-600 leading-relaxed">
                  Have questions about our security practices? Contact our security team at <a href="mailto:service@priceiq.org" className="text-[#2563eb] hover:underline font-semibold">service@priceiq.org</a>
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Responsible Disclosure */}
        <section className="py-16 lg:py-24 bg-white">
          <div className="max-w-4xl mx-auto px-6 sm:px-8 text-center">
            <h2 className="text-3xl font-bold text-gray-900 mb-6">Responsible Disclosure</h2>
            <p className="text-lg text-gray-600 mb-8 leading-relaxed">
              We welcome security researchers to help us maintain the highest security standards. If you discover a security vulnerability, please report it responsibly.
            </p>
            <div className="bg-gray-50 rounded-2xl p-8 text-left">
              <h3 className="text-xl font-bold text-gray-900 mb-4">How to Report</h3>
              <p className="text-gray-600 mb-4">Email us at <a href="mailto:service@priceiq.org" className="text-[#2563eb] hover:underline font-semibold">service@priceiq.org</a> with:</p>
              <ul className="space-y-2 text-gray-600 list-disc pl-6">
                <li>Detailed description of the vulnerability</li>
                <li>Steps to reproduce the issue</li>
                <li>Potential impact assessment</li>
                <li>Your contact information (optional but appreciated)</li>
              </ul>
              <p className="text-gray-600 mt-4">We commit to acknowledging your report within 48 hours and providing updates on our remediation progress.</p>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="py-24 lg:py-32 bg-[#2563eb]">
          <div className="max-w-4xl mx-auto px-6 sm:px-8 text-center text-white">
            <h2 className="text-4xl sm:text-5xl font-bold mb-6">
              Secure, Reliable, Trusted
            </h2>
            <p className="text-xl text-white/90 mb-10 leading-relaxed">
              Join hundreds of government contractors who trust PriceIQ with their most sensitive proposal data.
            </p>
            <Link href="/auth/signup">
              <button className="bg-white hover:bg-gray-100 text-[#2563eb] px-12 py-5 rounded-xl font-bold text-lg transition-all duration-300 hover:shadow-2xl hover:-translate-y-1">
                Get Started Securely
              </button>
            </Link>
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
            <Link href="/security" className="text-gray-400 hover:text-white transition-colors">Security</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
