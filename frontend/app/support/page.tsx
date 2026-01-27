'use client';

import { useState } from 'react';
import Link from 'next/link';
import { BarChart3, Search, BookOpen, MessageCircle, Mail, Video, ChevronDown } from 'lucide-react';

export default function SupportPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [openCategory, setOpenCategory] = useState<number | null>(0);

  const faqCategories = [
    {
      category: "Getting Started",
      questions: [
        {
          q: "How do I create my first proposal?",
          a: "Sign up for an account, upload your RFP document, and our AI will automatically extract job descriptions and generate pricing. You can then review, edit, and export your proposal."
        },
        {
          q: "What file formats can I upload?",
          a: "PriceIQ supports PDF, Word (.doc, .docx), and text files. For best results, use PDF files with searchable text."
        },
        {
          q: "How long does processing take?",
          a: "Most proposals are processed in 2-5 minutes, depending on the size of your RFP. You'll receive a notification when your proposal is ready."
        }
      ]
    },
    {
      category: "Pricing & Billing",
      questions: [
        {
          q: "What plans are available?",
          a: "We offer Free, Professional, and Enterprise plans. The Free plan includes your first proposal. Professional offers unlimited proposals with advanced features. Enterprise includes custom integrations and dedicated support."
        },
        {
          q: "Can I cancel anytime?",
          a: "Yes, you can cancel your subscription at any time. Your access will continue until the end of your billing period."
        },
        {
          q: "Do you offer refunds?",
          a: "We offer a 30-day money-back guarantee. If you're not satisfied, contact support for a full refund."
        }
      ]
    },
    {
      category: "Features & Functionality",
      questions: [
        {
          q: "How accurate is the SOC code matching?",
          a: "Our AI achieves 95%+ accuracy in matching job descriptions to SOC codes. You can review and manually adjust any matches before exporting."
        },
        {
          q: "Where does the wage data come from?",
          a: "We use official Bureau of Labor Statistics (BLS) OEWS data with over 6 million wage records, updated quarterly."
        },
        {
          q: "Can I customize the FBLR rates?",
          a: "Yes, you can customize all indirect rates (Fringe, Overhead, G&A, Fee) and choose different rates for on-site vs off-site positions."
        },
        {
          q: "How do I share proposals with my team?",
          a: "Organization admins can share proposals with team members. Shared proposals can be viewed and edited based on user permissions."
        }
      ]
    },
    {
      category: "Compliance & Security",
      questions: [
        {
          q: "Is my data secure?",
          a: "Yes. We use enterprise-grade encryption, maintain complete audit trails, and implement role-based access control. Our security standards align with NIST guidelines."
        },
        {
          q: "Do proposals meet government requirements?",
          a: "Yes. PriceIQ generates proposals with complete FBLR breakdowns, audit trails, and documentation that meet federal contracting standards."
        },
        {
          q: "Can I export to Excel?",
          a: "Yes, all proposals can be exported to Excel format with detailed breakdowns and formatting ready for submission."
        }
      ]
    },
    {
      category: "Troubleshooting",
      questions: [
        {
          q: "My upload failed. What should I do?",
          a: "Ensure your file is under 10MB and in a supported format (PDF, Word). If the issue persists, try converting your file to PDF or contact support."
        },
        {
          q: "The wage data doesn't match my expectations. Why?",
          a: "Wage data varies by location, experience level, and SOC code. Check that the correct geographic area and percentile (25th, 50th, 75th) are selected."
        },
        {
          q: "I can't see my team's proposals. How do I fix this?",
          a: "Only proposals explicitly shared with you are visible. Contact your organization admin to request access to specific proposals."
        }
      ]
    }
  ];

  const quickLinks = [
    {
      icon: <BookOpen className="w-6 h-6" />,
      title: "Documentation",
      description: "Complete guides and tutorials",
      link: "/resources"
    },
    {
      icon: <Video className="w-6 h-6" />,
      title: "Video Tutorials",
      description: "Step-by-step walkthroughs",
      link: "/resources"
    },
    {
      icon: <MessageCircle className="w-6 h-6" />,
      title: "Live Chat",
      description: "Chat with our support team",
      link: "#"
    },
    {
      icon: <Mail className="w-6 h-6" />,
      title: "Email Support",
      description: "support@priceiq.org",
      link: "mailto:support@priceiq.org"
    }
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
        {/* Hero Section with Search */}
        <section className="py-16 lg:py-24 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white">
          <div className="max-w-4xl mx-auto px-6 sm:px-8 text-center">
            <h1 className="text-5xl sm:text-6xl font-bold mb-6 leading-tight">
              How Can We Help You?
            </h1>
            <p className="text-xl text-white/90 mb-10 leading-relaxed">
              Find answers, guides, and support to help you win more proposals.
            </p>
            <div className="relative max-w-2xl mx-auto">
              <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 w-6 h-6 text-gray-400" />
              <input
                type="text"
                placeholder="Search for help..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-14 pr-4 py-5 rounded-xl text-gray-900 text-lg focus:ring-2 focus:ring-[#2563eb] outline-none"
              />
            </div>
          </div>
        </section>

        {/* Quick Links */}
        <section className="py-16 bg-white">
          <div className="max-w-7xl mx-auto px-6 sm:px-8">
            <div className="grid md:grid-cols-4 gap-6">
              {quickLinks.map((link, index) => (
                <Link key={index} href={link.link}>
                  <div className="bg-gray-50 rounded-2xl p-6 hover:shadow-lg hover:scale-105 transition-all duration-300 cursor-pointer group">
                    <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mb-4 text-[#2563eb] group-hover:bg-[#2563eb] group-hover:text-white transition-all">
                      {link.icon}
                    </div>
                    <h3 className="text-lg font-bold text-gray-900 mb-2">{link.title}</h3>
                    <p className="text-gray-600 text-sm">{link.description}</p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>

        {/* FAQ Section */}
        <section className="py-16 lg:py-24 bg-gray-50">
          <div className="max-w-4xl mx-auto px-6 sm:px-8">
            <h2 className="text-3xl font-bold text-gray-900 mb-12 text-center">Frequently Asked Questions</h2>
            <div className="space-y-4">
              {faqCategories.map((category, catIndex) => (
                <div key={catIndex} className="bg-white rounded-2xl shadow-sm overflow-hidden">
                  <button
                    onClick={() => setOpenCategory(openCategory === catIndex ? null : catIndex)}
                    className="w-full px-6 py-5 flex items-center justify-between text-left bg-gray-50 hover:bg-gray-100 transition-colors"
                  >
                    <h3 className="text-xl font-bold text-gray-900">{category.category}</h3>
                    <ChevronDown
                      className={`w-6 h-6 text-gray-500 transition-transform duration-300 ${
                        openCategory === catIndex ? 'rotate-180' : ''
                      }`}
                    />
                  </button>
                  {openCategory === catIndex && (
                    <div className="px-6 py-4 space-y-6">
                      {category.questions.map((item, qIndex) => (
                        <div key={qIndex} className="border-b border-gray-200 last:border-b-0 pb-6 last:pb-0">
                          <h4 className="text-lg font-semibold text-gray-900 mb-2">{item.q}</h4>
                          <p className="text-gray-600 leading-relaxed">{item.a}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Contact Support CTA */}
        <section className="py-16 lg:py-24 bg-white">
          <div className="max-w-4xl mx-auto px-6 sm:px-8 text-center">
            <h2 className="text-3xl font-bold text-gray-900 mb-6">
              Still Need Help?
            </h2>
            <p className="text-lg text-gray-600 mb-10 leading-relaxed">
              Our support team is here to help you succeed. Get in touch and we'll respond within 24 hours.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link href="/contact">
                <button className="bg-[#2563eb] hover:bg-[#1d4ed8] text-white px-10 py-4 rounded-xl font-bold text-lg transition-all duration-300 hover:shadow-lg">
                  Contact Support
                </button>
              </Link>
              <a href="mailto:support@priceiq.org">
                <button className="bg-white border-2 border-[#2563eb] text-[#2563eb] hover:bg-[#2563eb] hover:text-white px-10 py-4 rounded-xl font-semibold text-lg transition-all duration-300">
                  Email Us
                </button>
              </a>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="bg-black text-white py-12">
        <div className="max-w-7xl mx-auto px-6 sm:px-8 text-center">
          <p className="text-gray-400">© 2026 PriceIQ by Intrepix LLC. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
