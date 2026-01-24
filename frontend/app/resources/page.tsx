'use client';

import Link from 'next/link';
import { BarChart3, BookOpen, Download } from 'lucide-react';

export default function ResourcesPage() {
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
            <div className="flex items-center justify-center min-h-[300px]">
              <div className="text-center">
                <BookOpen className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                <p className="text-2xl font-semibold text-gray-400">Coming Soon</p>
                <p className="text-gray-500 mt-2">We're working on bringing you valuable content.</p>
              </div>
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
                <p className="text-gray-500 mt-2">We're preparing helpful resources for you.</p>
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
              Put these insights into action with PriceIQ's automated pricing platform.
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
