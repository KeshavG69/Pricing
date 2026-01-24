'use client';

import { useState } from 'react';
import Link from 'next/link';
import { BarChart3, Mail, MapPin, Send } from 'lucide-react';

export default function ContactPage() {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    company: '',
    phone: '',
    message: '',
  });

  const [status, setStatus] = useState<'idle' | 'sending' | 'success' | 'error'>('idle');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus('sending');

    // Simulate form submission
    setTimeout(() => {
      setStatus('success');
      setFormData({ name: '', email: '', company: '', phone: '', message: '' });
      setTimeout(() => setStatus('idle'), 3000);
    }, 1000);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData(prev => ({
      ...prev,
      [e.target.name]: e.target.value
    }));
  };

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
            <h1 className="text-5xl sm:text-6xl font-bold mb-6 leading-tight">
              Let's Talk About Winning More Proposals
            </h1>
            <p className="text-xl text-white/90 max-w-3xl mx-auto leading-relaxed">
              Our team is ready to help you transform your government contracting process. Reach out and let's get started.
            </p>
          </div>
        </section>

        {/* Contact Section */}
        <section className="py-16 lg:py-24 bg-white">
          <div className="max-w-7xl mx-auto px-6 sm:px-8">
            <div className="grid lg:grid-cols-2 gap-12">
              {/* Contact Form */}
              <div className="bg-gray-50 rounded-2xl p-8 lg:p-10">
                <h2 className="text-3xl font-bold text-gray-900 mb-6">Send Us a Message</h2>
                <form onSubmit={handleSubmit} className="space-y-6">
                  <div>
                    <label htmlFor="name" className="block text-sm font-semibold text-gray-700 mb-2">
                      Full Name *
                    </label>
                    <input
                      type="text"
                      id="name"
                      name="name"
                      required
                      value={formData.name}
                      onChange={handleChange}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#2563eb] focus:border-transparent outline-none transition-all"
                      placeholder="John Doe"
                    />
                  </div>

                  <div>
                    <label htmlFor="email" className="block text-sm font-semibold text-gray-700 mb-2">
                      Email Address *
                    </label>
                    <input
                      type="email"
                      id="email"
                      name="email"
                      required
                      value={formData.email}
                      onChange={handleChange}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#2563eb] focus:border-transparent outline-none transition-all"
                      placeholder="john@company.com"
                    />
                  </div>

                  <div>
                    <label htmlFor="company" className="block text-sm font-semibold text-gray-700 mb-2">
                      Company Name
                    </label>
                    <input
                      type="text"
                      id="company"
                      name="company"
                      value={formData.company}
                      onChange={handleChange}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#2563eb] focus:border-transparent outline-none transition-all"
                      placeholder="Your Company Inc."
                    />
                  </div>

                  <div>
                    <label htmlFor="phone" className="block text-sm font-semibold text-gray-700 mb-2">
                      Phone Number
                    </label>
                    <input
                      type="tel"
                      id="phone"
                      name="phone"
                      value={formData.phone}
                      onChange={handleChange}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#2563eb] focus:border-transparent outline-none transition-all"
                      placeholder="+1 (555) 123-4567"
                    />
                  </div>

                  <div>
                    <label htmlFor="message" className="block text-sm font-semibold text-gray-700 mb-2">
                      Message *
                    </label>
                    <textarea
                      id="message"
                      name="message"
                      required
                      value={formData.message}
                      onChange={handleChange}
                      rows={6}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#2563eb] focus:border-transparent outline-none transition-all resize-none"
                      placeholder="Tell us about your needs..."
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={status === 'sending'}
                    className="w-full bg-[#2563eb] hover:bg-[#1d4ed8] text-white px-8 py-4 rounded-lg font-bold text-lg transition-all duration-300 hover:shadow-lg hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {status === 'sending' ? (
                      'Sending...'
                    ) : status === 'success' ? (
                      'Message Sent!'
                    ) : (
                      <>
                        <Send className="w-5 h-5" />
                        Send Message
                      </>
                    )}
                  </button>
                </form>
              </div>

              {/* Contact Info */}
              <div className="space-y-8">
                <div>
                  <h2 className="text-3xl font-bold text-gray-900 mb-6">Get in Touch</h2>
                  <p className="text-lg text-gray-600 leading-relaxed mb-8">
                    Have questions about PriceIQ? Want to schedule a demo? Our team is here to help you win more government contracts.
                  </p>
                </div>

                <div className="space-y-6">
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
                      <Mail className="w-6 h-6 text-[#2563eb]" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900 mb-1">Email</h3>
                      <a href="mailto:service@priceiq.org" className="text-gray-600 hover:text-[#2563eb] transition-colors">
                        service@priceiq.org
                      </a>
                      <p className="text-sm text-gray-500 mt-1">We'll respond within 24 hours</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
                      <MapPin className="w-6 h-6 text-[#2563eb]" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900 mb-1">Headquarters</h3>
                      <p className="text-gray-600">
                        Intrepix LLC<br />
                        United States
                      </p>
                    </div>
                  </div>
                </div>

                <div className="bg-gray-50 rounded-2xl p-8 mt-8">
                  <h3 className="text-xl font-bold text-gray-900 mb-4">Prefer to Chat?</h3>
                  <p className="text-gray-600 mb-6">
                    Book a 15-minute call with our team to see how PriceIQ can help you win more proposals.
                  </p>
                  <button className="w-full bg-white border-2 border-[#2563eb] text-[#2563eb] hover:bg-[#2563eb] hover:text-white px-6 py-3 rounded-lg font-semibold transition-all duration-300">
                    Schedule a Demo
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* FAQ Preview */}
        <section className="py-16 lg:py-24 bg-gray-50">
          <div className="max-w-4xl mx-auto px-6 sm:px-8 text-center">
            <h2 className="text-3xl font-bold text-gray-900 mb-6">Common Questions</h2>
            <p className="text-lg text-gray-600 mb-8">
              Check out our FAQ section for quick answers to frequently asked questions.
            </p>
            <Link href="/#faq">
              <button className="bg-[#2563eb] hover:bg-[#1d4ed8] text-white px-8 py-3 rounded-lg font-semibold transition-all duration-300 hover:shadow-lg">
                View FAQ
              </button>
            </Link>
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
