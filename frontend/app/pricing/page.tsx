'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  BarChart3,
  Check,
  X,
  Zap,
  Sparkles,
  ArrowRight,
  HelpCircle
} from 'lucide-react';

export default function PricingPage() {
  const plans = [
    {
      name: 'Initial Analysis',
      description: 'Essential pricing automation for standard proposals',
      price: 100,
      priceLabel: '$100',
      priceSubtext: 'per proposal',
      icon: Zap,
      color: '#22C55E',
      features: [
        { name: 'AI-powered SOC matching', included: true },
        { name: 'BLS wage data access (6M+ records)', included: true },
        { name: 'FBLR calculations', included: true },
        { name: 'GSA contract processing', included: true },
        { name: 'Multi-year escalation modeling', included: true },
        { name: 'Web-based workspace', included: true },
        { name: 'Email support', included: true },
        { name: 'Excel export', included: false },
        { name: 'Subcontractor pricing', included: false }
      ],
      cta: 'Get started',
      popular: false
    },
    {
      name: 'Advanced Analysis',
      description: 'Add Excel export and subcontractor pricing',
      price: 250,
      priceLabel: '+$250',
      priceSubtext: 'upgrade to Advanced (in addition to Initial)',
      icon: Sparkles,
      color: '#2563eb',
      features: [
        { name: 'AI-powered SOC matching', included: true },
        { name: 'BLS wage data access (6M+ records)', included: true },
        { name: 'FBLR calculations', included: true },
        { name: 'GSA contract processing', included: true },
        { name: 'Multi-year escalation modeling', included: true },
        { name: 'Web-based workspace', included: true },
        { name: 'Email support', included: true },
        { name: 'Excel export', included: true },
        { name: 'Subcontractor pricing', included: true }
      ],
      cta: 'Get started',
      popular: true
    }
  ];

  const faqs = [
    {
      question: 'How does pay-as-you-go pricing work?',
      answer: 'You only pay for the proposals you process. Your first proposal is completely free. After that, each proposal starts with Initial Analysis ($100). If you need Excel export and subcontractor pricing, you can upgrade to Advanced Analysis for an additional $250.'
    },
    {
      question: 'Is my first proposal really free?',
      answer: 'Yes! Your first proposal is 100% free with no credit card required. This lets you test our platform and see the quality of our analysis before committing to paid proposals.'
    },
    {
      question: 'What\'s the difference between Initial and Advanced Analysis?',
      answer: 'Both include AI-powered SOC matching, BLS wage data, FBLR calculations, GSA contract processing, and multi-year escalation. Advanced Analysis (additional $250 on top of Initial $100) adds Excel export and subcontractor pricing—essential for complex proposals with multiple vendors.'
    },
    {
      question: 'Can I upgrade from Initial to Advanced Analysis?',
      answer: 'Yes! Every proposal starts with Initial Analysis ($100). If you need Excel export or subcontractor pricing features, you can upgrade to Advanced Analysis by paying an additional $250.'
    },
    {
      question: 'When do I get charged?',
      answer: 'You\'re charged $100 when you submit a proposal for Initial Analysis. If you decide to upgrade to Advanced Analysis for that proposal, you\'ll be charged an additional $250. No monthly fees or subscriptions.'
    },
    {
      question: 'What payment methods do you accept?',
      answer: 'We accept all major credit cards (Visa, MasterCard, American Express, Discover). Your payment information is securely stored for seamless per-proposal billing.'
    }
  ];

  const [openFaq, setOpenFaq] = useState<number | null>(null);

  return (
    <div className="min-h-screen bg-white">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-40 bg-black/95 backdrop-blur-md border-b border-white/10">
        <div className="max-w-7xl mx-auto px-6 sm:px-8 h-18 flex items-center justify-between">
          <Link href="/" className="flex items-center space-x-3 group">
            <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-[#2563eb] text-white transition-transform duration-300 group-hover:scale-105">
              <BarChart3 className="w-6 h-6" />
            </div>
            <span className="text-2xl font-bold text-white tracking-tight">PriceIQ</span>
          </Link>

          <div className="flex items-center space-x-4 sm:space-x-8">
            <Link
              href="/"
              className="hidden sm:block text-base text-white/80 hover:text-white transition-colors font-medium"
            >
              Home
            </Link>
            <Link
              href="/auth/login"
              className="text-base text-white/90 hover:text-white transition-colors font-semibold"
            >
              Sign in
            </Link>
          </div>
        </div>
      </nav>

      <main className="pt-20">
        {/* Hero Section */}
        <section className="py-16 lg:py-24 bg-gradient-to-br from-slate-50 to-white">
          <div className="max-w-7xl mx-auto px-6 sm:px-8 text-center">
            <div className="inline-flex items-center rounded-full bg-[#E8F9FA] px-4 py-2 text-sm font-bold text-gray-700 mb-8 border border-[#2563eb]/20">
              <span className="flex h-2 w-2 rounded-full bg-[#22C55E] mr-2 animate-pulse"></span>
              PAY-PER-PROPOSAL PRICING
            </div>

            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-gray-900 mb-6 leading-tight">
              Pay only for the proposals you process
            </h1>

            <p className="text-base sm:text-lg text-gray-600 max-w-3xl mx-auto mb-4 leading-relaxed">
              No subscriptions, no monthly fees. Your <span className="font-bold text-[#22C55E]">first proposal is free</span>—then $100 per proposal. Upgrade to Advanced ($250 extra) for Excel export and subcontractor pricing.
            </p>

            <div className="inline-flex items-center gap-2 bg-[#22C55E]/10 px-4 py-2 rounded-lg mb-10">
              <Check className="w-5 h-5 text-[#22C55E]" />
              <span className="text-sm font-semibold text-gray-700">First proposal free • No credit card required</span>
            </div>
          </div>
        </section>

        {/* Pricing Cards */}
        <section className="py-16 bg-white">
          <div className="max-w-6xl mx-auto px-6 sm:px-8">
            <div className="grid md:grid-cols-2 gap-8 max-w-5xl mx-auto">
              {plans.map((plan) => {
                const Icon = plan.icon;

                return (
                  <div
                    key={plan.name}
                    className={`relative rounded-2xl border-2 p-8 lg:p-10 transition-all duration-300 ${
                      plan.popular
                        ? 'border-[#2563eb] shadow-2xl scale-105 bg-gradient-to-br from-blue-50 to-white'
                        : 'border-gray-200 hover:border-gray-300 hover:shadow-xl bg-white'
                    }`}
                  >
                    {plan.popular && (
                      <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                        <div className="bg-[#2563eb] text-white px-6 py-2 rounded-full text-sm font-bold shadow-lg">
                          Most Popular
                        </div>
                      </div>
                    )}

                    <div className="flex items-center gap-3 mb-4">
                      <div
                        className="w-10 h-10 rounded-xl flex items-center justify-center"
                        style={{ backgroundColor: `${plan.color}20` }}
                      >
                        <Icon className="w-5 h-5" style={{ color: plan.color }} />
                      </div>
                      <h3 className="text-xl font-bold text-gray-900">{plan.name}</h3>
                    </div>

                    <p className="text-gray-600 text-sm mb-6 leading-relaxed">
                      {plan.description}
                    </p>

                    <div className="mb-8">
                      <div className="flex items-baseline gap-2 mb-2">
                        <span className="text-4xl font-bold text-gray-900">{plan.priceLabel}</span>
                      </div>
                      <p className="text-gray-600 text-sm">{plan.priceSubtext}</p>
                    </div>

                    <Link href="/auth/signup">
                      <button
                        className={`w-full py-4 rounded-xl font-bold text-base transition-all duration-300 mb-8 ${
                          plan.popular
                            ? 'bg-[#2563eb] text-white hover:bg-[#1d4ed8] shadow-lg hover:shadow-xl hover:-translate-y-1'
                            : 'bg-gray-900 text-white hover:bg-gray-800 shadow-md hover:shadow-lg hover:-translate-y-1'
                        }`}
                      >
                        {plan.cta}
                      </button>
                    </Link>

                    <div className="space-y-4">
                      <p className="text-sm font-bold text-gray-900 uppercase tracking-wider mb-4">
                        What's included
                      </p>
                      {plan.features.map((feature, index) => (
                        <div key={index} className="flex items-start gap-3">
                          {feature.included ? (
                            <Check className="w-5 h-5 text-[#22C55E] flex-shrink-0 mt-0.5" />
                          ) : (
                            <X className="w-5 h-5 text-gray-300 flex-shrink-0 mt-0.5" />
                          )}
                          <span
                            className={`text-sm ${
                              feature.included ? 'text-gray-700' : 'text-gray-400'
                            }`}
                          >
                            {feature.name}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* Comparison Table */}
        <section className="py-16 lg:py-24 bg-gray-50">
          <div className="max-w-5xl mx-auto px-6 sm:px-8">
            <div className="text-center mb-16">
              <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900 mb-4 leading-tight">
                Feature comparison
              </h2>
              <p className="text-base text-gray-600 max-w-2xl mx-auto">
                All proposals start with Initial Analysis—upgrade to Advanced for Excel export and subcontractor pricing
              </p>
            </div>

            <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-200 bg-gray-50">
                      <th className="text-left py-6 px-6 text-sm font-bold text-gray-900 uppercase tracking-wider">
                        Features
                      </th>
                      {plans.map((plan) => (
                        <th
                          key={plan.name}
                          className="py-6 px-6 text-center min-w-[200px]"
                        >
                          <div className="font-bold text-base text-gray-900">{plan.name}</div>
                          <div className="text-xl font-bold text-[#2563eb] mt-2">
                            {plan.priceLabel}
                          </div>
                          <div className="text-xs text-gray-500 mt-1">{plan.priceSubtext}</div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {plans[0].features.map((_, featureIndex) => (
                      <tr key={featureIndex} className="hover:bg-gray-50 transition-colors">
                        <td className="py-5 px-6 text-sm text-gray-700 font-medium">
                          {plans[0].features[featureIndex].name}
                        </td>
                        {plans.map((plan) => (
                          <td key={plan.name} className="py-5 px-6 text-center">
                            {plan.features[featureIndex].included ? (
                              <Check className="w-6 h-6 text-[#22C55E] mx-auto" />
                            ) : (
                              <X className="w-6 h-6 text-gray-300 mx-auto" />
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </section>

        {/* FAQ Section */}
        <section className="py-16 lg:py-24 bg-white">
          <div className="max-w-4xl mx-auto px-6 sm:px-8">
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-center mb-12 text-gray-900 leading-tight">
              Pricing FAQs
            </h2>

            <div className="bg-white rounded-2xl shadow-sm overflow-hidden border border-gray-200">
              {faqs.map((faq, index) => (
                <div key={index} className="border-b border-gray-200 last:border-b-0">
                  <button
                    onClick={() => setOpenFaq(openFaq === index ? null : index)}
                    className="w-full px-8 py-6 flex items-start justify-between text-left hover:bg-gray-50 transition-colors duration-200"
                  >
                    <div className="flex items-start gap-3 flex-1">
                      <HelpCircle className="w-5 h-5 text-[#2563eb] flex-shrink-0 mt-1" />
                      <span className="text-sm lg:text-base font-semibold text-gray-900 pr-8 leading-tight">
                        {faq.question}
                      </span>
                    </div>
                    <ArrowRight
                      className={`w-5 h-5 text-gray-500 flex-shrink-0 transition-transform duration-200 ${
                        openFaq === index ? 'rotate-90' : ''
                      }`}
                    />
                  </button>
                  {openFaq === index && (
                    <div className="px-8 pb-6 pl-16 text-sm text-gray-600 leading-relaxed animate-slide-down">
                      {faq.answer}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section className="py-20 lg:py-28 bg-[#2563eb] relative overflow-hidden">
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff12_1px,transparent_1px),linear-gradient(to_bottom,#ffffff12_1px,transparent_1px)] bg-[size:32px_32px] opacity-20"></div>

          <div className="max-w-4xl mx-auto px-6 sm:px-8 text-center relative z-10">
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-6 leading-tight">
              Try your first proposal for free
            </h2>
            <p className="text-base text-white/95 mb-10 max-w-2xl mx-auto leading-relaxed">
              No credit card required. Process your first proposal completely free and see the power of automated pricing intelligence.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-6">
              <Link href="/auth/signup">
                <button className="bg-white hover:bg-gray-100 text-[#2563eb] px-10 py-4 rounded-xl font-bold text-base transition-all duration-300 hover:shadow-2xl hover:-translate-y-1">
                  Get started free
                </button>
              </Link>
              <Link href="/contact">
                <button className="bg-transparent border-2 border-white/30 hover:border-white/60 text-white px-10 py-4 rounded-xl font-semibold text-base transition-all duration-300 hover:bg-white/5">
                  Talk to sales
                </button>
              </Link>
            </div>

            <p className="text-xs text-white/80 mt-6">
              First proposal free • No subscription • Pay only for what you use
            </p>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="bg-black text-white py-12 lg:py-16">
        <div className="max-w-7xl mx-auto px-6 sm:px-8">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-8 lg:gap-12 mb-12">
            <div className="col-span-2 md:col-span-1">
              <Link href="/" className="flex items-center space-x-3 mb-4">
                <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-[#2563eb] text-white">
                  <BarChart3 className="w-6 h-6" />
                </div>
                <span className="text-xl font-bold">PriceIQ</span>
              </Link>
              <p className="text-sm text-gray-400 leading-relaxed mb-6">
                AI-native pricing intelligence for government contractors.
              </p>
            </div>

            <div>
              <h3 className="font-bold mb-4 text-sm uppercase tracking-wider">Product</h3>
              <ul className="space-y-3 text-sm">
                <li><Link href="#" className="text-gray-400 hover:text-white transition-colors">Features</Link></li>
                <li><Link href="/pricing" className="text-gray-400 hover:text-white transition-colors">Pricing</Link></li>
                <li><Link href="#" className="text-gray-400 hover:text-white transition-colors">Security</Link></li>
              </ul>
            </div>

            <div>
              <h3 className="font-bold mb-4 text-sm uppercase tracking-wider">Resources</h3>
              <ul className="space-y-3 text-sm">
                <li><Link href="#" className="text-gray-400 hover:text-white transition-colors">Documentation</Link></li>
                <li><Link href="#" className="text-gray-400 hover:text-white transition-colors">Blog</Link></li>
                <li><Link href="#" className="text-gray-400 hover:text-white transition-colors">Case Studies</Link></li>
              </ul>
            </div>

            <div>
              <h3 className="font-bold mb-4 text-sm uppercase tracking-wider">Company</h3>
              <ul className="space-y-3 text-sm">
                <li><Link href="#" className="text-gray-400 hover:text-white transition-colors">About Us</Link></li>
                <li><Link href="#" className="text-gray-400 hover:text-white transition-colors">Careers</Link></li>
                <li><Link href="#" className="text-gray-400 hover:text-white transition-colors">Contact</Link></li>
              </ul>
            </div>

            <div>
              <h3 className="font-bold mb-4 text-sm uppercase tracking-wider">Support</h3>
              <ul className="space-y-3 text-sm">
                <li><Link href="#" className="text-gray-400 hover:text-white transition-colors">Help Center</Link></li>
                <li><Link href="/legal/terms" className="text-gray-400 hover:text-white transition-colors">Terms</Link></li>
                <li><Link href="#" className="text-gray-400 hover:text-white transition-colors">Privacy</Link></li>
              </ul>
            </div>
          </div>

          <div className="pt-8 border-t border-white/10 text-center text-sm text-gray-400">
            <p>© 2024 PriceIQ. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
