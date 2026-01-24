'use client';

import Link from 'next/link';
import { BarChart3, Target, Users, Zap, Award, TrendingUp } from 'lucide-react';

export default function AboutPage() {
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
        <section className="py-24 lg:py-32 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white">
          <div className="max-w-5xl mx-auto px-6 sm:px-8 text-center">
            <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold mb-6 leading-tight">
              Transforming Government Contracting
            </h1>
            <p className="text-xl sm:text-2xl text-white/90 max-w-3xl mx-auto leading-relaxed">
              We're on a mission to help government contractors win more proposals by automating the most time-consuming part of the bidding process.
            </p>
          </div>
        </section>

        {/* Story Section */}
        <section className="py-16 lg:py-24 bg-white">
          <div className="max-w-4xl mx-auto px-6 sm:px-8">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-8 text-center">Our Story</h2>
            <div className="prose prose-lg max-w-none text-gray-600 leading-relaxed space-y-6">
              <p>
                PriceIQ was founded by Intrepix LLC with a clear vision: to eliminate the weeks of manual labor that go into creating government contract pricing proposals.
              </p>
              <p>
                We saw talented contractors spending countless hours matching job descriptions to SOC codes, looking up wage data, calculating FBLR rates, and formatting Excel spreadsheets—time that could be better spent on strategy and winning contracts.
              </p>
              <p>
                By combining AI-powered automation with official BLS wage data and deep government contracting expertise, we've built a platform that turns weeks of work into minutes—without sacrificing accuracy or compliance.
              </p>
              <p>
                Today, PriceIQ serves hundreds of government contractors nationwide, helping them win more proposals and grow their businesses.
              </p>
            </div>
          </div>
        </section>

        {/* Mission & Vision */}
        <section className="py-16 lg:py-24 bg-gray-50">
          <div className="max-w-7xl mx-auto px-6 sm:px-8">
            <div className="grid md:grid-cols-2 gap-12">
              <div className="bg-white rounded-2xl p-10 shadow-lg">
                <div className="w-16 h-16 bg-[#2563eb] rounded-xl flex items-center justify-center mb-6">
                  <Target className="w-8 h-8 text-white" />
                </div>
                <h3 className="text-2xl font-bold text-gray-900 mb-4">Our Mission</h3>
                <p className="text-lg text-gray-600 leading-relaxed">
                  To empower government contractors with AI-powered tools that automate pricing, ensure compliance, and maximize win rates—so they can focus on what matters most: serving our nation.
                </p>
              </div>

              <div className="bg-white rounded-2xl p-10 shadow-lg">
                <div className="w-16 h-16 bg-[#2563eb] rounded-xl flex items-center justify-center mb-6">
                  <TrendingUp className="w-8 h-8 text-white" />
                </div>
                <h3 className="text-2xl font-bold text-gray-900 mb-4">Our Vision</h3>
                <p className="text-lg text-gray-600 leading-relaxed">
                  To become the essential platform for every government contractor, transforming how the industry approaches pricing and making competitive, professional proposals accessible to all.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Values Section */}
        <section className="py-16 lg:py-24 bg-white">
          <div className="max-w-7xl mx-auto px-6 sm:px-8">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-12 text-center">Our Values</h2>
            <div className="grid md:grid-cols-3 gap-8">
              <div className="text-center">
                <div className="w-16 h-16 bg-blue-100 rounded-xl flex items-center justify-center mx-auto mb-4">
                  <Zap className="w-8 h-8 text-[#2563eb]" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-3">Speed & Efficiency</h3>
                <p className="text-gray-600 leading-relaxed">
                  We believe contractors shouldn't waste weeks on pricing. Our automation delivers results in minutes, not days.
                </p>
              </div>

              <div className="text-center">
                <div className="w-16 h-16 bg-blue-100 rounded-xl flex items-center justify-center mx-auto mb-4">
                  <Award className="w-8 h-8 text-[#2563eb]" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-3">Accuracy & Compliance</h3>
                <p className="text-gray-600 leading-relaxed">
                  Every proposal must meet strict government standards. We ensure accuracy with official BLS data and complete audit trails.
                </p>
              </div>

              <div className="text-center">
                <div className="w-16 h-16 bg-blue-100 rounded-xl flex items-center justify-center mx-auto mb-4">
                  <Users className="w-8 h-8 text-[#2563eb]" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-3">Customer Success</h3>
                <p className="text-gray-600 leading-relaxed">
                  Your wins are our wins. We're committed to helping you improve win rates and grow your contracting business.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Stats Section */}
        <section className="py-16 lg:py-24 bg-[#2563eb]">
          <div className="max-w-7xl mx-auto px-6 sm:px-8">
            <div className="grid md:grid-cols-4 gap-8 text-center text-white">
              <div>
                <div className="text-5xl font-bold mb-2">6M+</div>
                <div className="text-white/90 text-lg">BLS Wage Records</div>
              </div>
              <div>
                <div className="text-5xl font-bold mb-2">500+</div>
                <div className="text-white/90 text-lg">Active Contractors</div>
              </div>
              <div>
                <div className="text-5xl font-bold mb-2">95%</div>
                <div className="text-white/90 text-lg">Faster Than Manual</div>
              </div>
              <div>
                <div className="text-5xl font-bold mb-2">3x</div>
                <div className="text-white/90 text-lg">Improved Win Rates</div>
              </div>
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="py-24 lg:py-32 bg-white">
          <div className="max-w-4xl mx-auto px-6 sm:px-8 text-center">
            <h2 className="text-4xl sm:text-5xl font-bold text-gray-900 mb-6">
              Join Us in Transforming Government Contracting
            </h2>
            <p className="text-xl text-gray-600 mb-10 leading-relaxed">
              See why hundreds of contractors trust PriceIQ to win more proposals.
            </p>
            <Link href="/auth/signup">
              <button className="bg-[#2563eb] hover:bg-[#1d4ed8] text-white px-12 py-5 rounded-xl font-bold text-lg transition-all duration-300 hover:shadow-2xl hover:-translate-y-1">
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
