'use client';

import Link from 'next/link';
import Image from 'next/image';
import { Download, ArrowRight, Clock } from 'lucide-react';

export default function ResourcesPage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-40 bg-black/95 backdrop-blur-md border-b border-white/10">
        <div className="max-w-7xl mx-auto px-6 sm:px-8 h-20 flex items-center justify-between">
          <Link href="/" className="flex items-center space-x-3 group">
            <Image
              src="/logo.svg"
              alt="PriceIQ Logo"
              width={48}
              height={48}
              className="transition-transform duration-300 group-hover:scale-105"
            />
            <span className="text-2xl font-bold text-white tracking-tight">
              Price<span className="text-[#5B7FFF]">IQ</span>
            </span>
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
        <section className="py-16 lg:py-24 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white">
          <div className="max-w-5xl mx-auto px-6 sm:px-8 text-center">
            <h1 className="text-5xl sm:text-6xl font-bold mb-6 leading-tight">
              Resources to Help You Win More
            </h1>
            <p className="text-xl text-white/90 max-w-3xl mx-auto leading-relaxed">
              Expert guides, templates, webinars, and insights to help government contractors succeed.
            </p>
          </div>
        </section>

        {/* Blog Posts */}
        <section className="py-16 lg:py-24 bg-white">
          <div className="max-w-7xl mx-auto px-6 sm:px-8">
            <h2 className="text-3xl font-bold text-gray-900 mb-12">Latest Articles</h2>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <Link
                href="/resources/how-ai-is-rewriting-federal-pricing"
                className="group lg:col-span-2 flex flex-col rounded-2xl overflow-hidden border border-gray-200 bg-white shadow-sm hover:shadow-xl transition-all duration-300 hover:-translate-y-1"
              >
                <div className="relative overflow-hidden bg-slate-900">
                  <Image
                    src="/blog/federal-pricing-cover.svg"
                    alt="How AI is rewriting the rules of federal pricing"
                    width={1200}
                    height={630}
                    className="w-full h-auto transition-transform duration-500 group-hover:scale-[1.03]"
                  />
                </div>
                <div className="flex flex-col flex-1 p-8">
                  <div className="flex items-center gap-3 text-sm font-semibold text-[#2563eb] mb-4">
                    <span className="px-3 py-1 rounded-full bg-[#5B7FFF]/10 border border-[#5B7FFF]/20">
                      Federal Pricing
                    </span>
                    <span className="flex items-center gap-1.5 text-gray-500">
                      <Clock className="w-4 h-4" />6 min read
                    </span>
                  </div>
                  <h3 className="text-2xl font-bold text-gray-900 leading-snug mb-3 group-hover:text-[#2563eb] transition-colors">
                    Less Time, Fewer Errors, Better Decisions: How AI Is Quietly Rewriting the Rules of Federal Pricing
                  </h3>
                  <p className="text-gray-600 leading-relaxed mb-6 flex-1">
                    The hidden tax of federal pricing was never the difficulty of the work — it was the
                    volume of manual, error-prone effort behind a single compliant pricing volume. Here&apos;s
                    how automation is giving contractors back time, peace of mind, and good judgment.
                  </p>
                  <span className="inline-flex items-center gap-2 text-[#2563eb] font-semibold">
                    Read article
                    <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
                  </span>
                </div>
              </Link>

              <Link
                href="/resources/is-your-pricing-tool-securing-your-proposal"
                className="group flex flex-col rounded-2xl overflow-hidden border border-gray-200 bg-white shadow-sm hover:shadow-xl transition-all duration-300 hover:-translate-y-1"
              >
                <div className="relative overflow-hidden bg-slate-900">
                  <Image
                    src="/blog/proposal-security-cover.svg"
                    alt="Is your pricing tool securing your proposal data?"
                    width={1200}
                    height={630}
                    className="w-full h-auto transition-transform duration-500 group-hover:scale-[1.03]"
                  />
                </div>
                <div className="flex flex-col flex-1 p-8">
                  <div className="flex items-center gap-3 text-sm font-semibold text-[#2563eb] mb-4">
                    <span className="px-3 py-1 rounded-full bg-[#5B7FFF]/10 border border-[#5B7FFF]/20">
                      Security
                    </span>
                    <span className="flex items-center gap-1.5 text-gray-500">
                      <Clock className="w-4 h-4" />6 min read
                    </span>
                  </div>
                  <h3 className="text-2xl font-bold text-gray-900 leading-snug mb-3 group-hover:text-[#2563eb] transition-colors">
                    Your Proposal Is Your Most Sensitive Asset. Is Your Pricing Tool Treating It That Way?
                  </h3>
                  <p className="text-gray-600 leading-relaxed mb-6 flex-1">
                    A pricing volume is a map of how your business wins. Here are the security questions
                    every contractor should ask before uploading a single RFP — and how to think about
                    your own posture.
                  </p>
                  <span className="inline-flex items-center gap-2 text-[#2563eb] font-semibold">
                    Read article
                    <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
                  </span>
                </div>
              </Link>
            </div>
          </div>
        </section>

        {/* Downloadable Resources */}
        <section className="py-16 lg:py-24 bg-gray-50">
          <div className="max-w-7xl mx-auto px-6 sm:px-8">
            <h2 className="text-3xl font-bold text-gray-900 mb-12">Downloadable Resources</h2>
            <div className="flex items-center justify-center min-h-[300px]">
              <div className="text-center">
                <Download className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                <p className="text-2xl font-semibold text-gray-400">Coming Soon</p>
                <p className="text-gray-500 mt-2">We&apos;re preparing helpful resources for you.</p>
              </div>
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="py-24 lg:py-32 bg-[#2563eb]">
          <div className="max-w-4xl mx-auto px-6 sm:px-8 text-center text-white">
            <h2 className="text-4xl sm:text-5xl font-bold mb-6">
              Ready to Win More Proposals?
            </h2>
            <p className="text-xl text-white/90 mb-10 leading-relaxed">
              Put these insights into action with PriceIQ&apos;s automated pricing platform.
            </p>
            <Link href="/auth/signup">
              <button className="bg-white hover:bg-gray-100 text-[#2563eb] px-12 py-5 rounded-xl font-bold text-lg transition-all duration-300 hover:shadow-2xl hover:-translate-y-1">
                Get Started Free
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
