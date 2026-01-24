'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  BarChart3,
  ChevronDown,
  CheckCircle2,
  Zap,
  Shield,
  TrendingUp,
  FileText,
  Users,
  Clock,
  Target,
  Upload,
  Eye,
  UserCheck,
  Download,
  Send
} from 'lucide-react';

export default function Home() {
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  const faqs = [
    {
      question: "How fast can I generate a pricing proposal?",
      answer: "Upload your RFP and get a professional pricing volume in minutes. What traditionally takes weeks of manual work (SOC matching, wage lookups, FBLR calculations) is automated instantly."
    },
    {
      question: "What makes PriceIQ proposals more competitive?",
      answer: "Our AI leverages official BLS OEWS data (6M+ wage records) to ensure accurate, defensible pricing. Plus, competitive intelligence helps you price at the sweet spot for winning without leaving money on the table."
    },
    {
      question: "Can PriceIQ handle government compliance requirements?",
      answer: "Yes. Every proposal includes complete FBLR breakdowns, audit trails, and documentation that meets strict government contracting standards. Export directly to Excel for submission."
    },
    {
      question: "How does team collaboration improve win rates?",
      answer: "Organization-wide workspaces let your capture managers, pricing analysts, and proposal writers collaborate in real-time. Share strategies, track changes, and coordinate winning approaches across all active bids."
    },
    {
      question: "What's the learning curve to start winning with PriceIQ?",
      answer: "Most teams create their first proposal within minutes of signing up. The interface is intuitive, and our support team helps you optimize your win strategy from day one."
    }
  ];

  return (
    <div className="min-h-screen bg-white">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-40 bg-black/95 backdrop-blur-md border-b border-white/10 animate-slide-down">
        <div className="max-w-7xl mx-auto px-6 sm:px-8 h-20 flex items-center justify-between">
          {/* Logo */}
          <Link href="/" className="flex items-center space-x-3 group">
            <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-[#2563eb] text-white transition-transform duration-300 group-hover:scale-105">
              <BarChart3 className="w-6 h-6" />
            </div>
            <span className="text-2xl font-bold text-white tracking-tight">PriceIQ</span>
          </Link>

          {/* Navigation Links - Hidden on mobile */}
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

          {/* Right side actions */}
          <div className="flex items-center space-x-4">
            <Link
              href="/auth/login"
              className="text-white/90 hover:text-white transition-colors font-semibold text-base"
            >
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
        <section className="relative min-h-[700px] flex items-center justify-center overflow-hidden">
          {/* Background with video/image placeholder */}
          <div className="absolute inset-0 z-0">
            {/* TODO: Replace with your background video */}
            {/* Uncomment and add your video file:
            <video
              autoPlay
              loop
              muted
              playsInline
              className="absolute inset-0 w-full h-full object-cover"
            >
              <source src="/videos/hero-background.mp4" type="video/mp4" />
            </video>
            */}

            {/* Placeholder gradient (remove when video is added) */}
            <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900" />

            {/* Dark overlay for text readability */}
            <div className="absolute inset-0 bg-black/60 z-10" />

            {/* Subtle grid pattern */}
            <div className="absolute inset-0 z-10 opacity-10" style={{
              backgroundImage: 'linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)',
              backgroundSize: '50px 50px'
            }} />
          </div>

          {/* Content */}
          <div className="relative z-20 max-w-6xl mx-auto px-6 sm:px-8 text-center py-24 sm:py-32">
            <h1 className="text-5xl sm:text-6xl lg:text-7xl xl:text-8xl font-bold text-white mb-6 leading-[1.05] tracking-tight animate-slide-up">
              <span className="block mb-2">Win more</span>
              <span className="text-[#2563eb] inline-block animate-pulse" style={{ animationDuration: '3s' }}>proposals</span>
              <span className="block mt-2 text-4xl sm:text-5xl lg:text-6xl xl:text-7xl">with AI powered pricing</span>
            </h1>

            <p className="text-lg sm:text-xl text-white/90 max-w-3xl mx-auto mb-4 leading-relaxed animate-slide-up" style={{ animationDelay: '0.1s' }}>
              Transform weeks of work into minutes with AI powered government contracting pricing automation.
            </p>

            <p className="text-base sm:text-lg text-white/70 max-w-2xl mx-auto mb-10 animate-fade-in" style={{ animationDelay: '0.15s' }}>
              Generate professional pricing volumes with accurate BLS wage data, automated FBLR calculations, and intelligent SOC matching trusted by government contractors nationwide.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-5 animate-slide-up" style={{ animationDelay: '0.2s' }}>
              <Link href="/auth/signup">
                <button className="w-full sm:w-auto bg-[#2563eb] hover:bg-[#1d4ed8] text-white px-10 py-5 rounded-xl font-bold text-lg transition-all duration-300 hover:shadow-2xl hover:shadow-[#2563eb]/30 hover:-translate-y-1 hover:scale-105">
                  Get started free
                </button>
              </Link>
              <Link href="#features">
                <button className="w-full sm:w-auto bg-transparent border-2 border-white/30 hover:border-white/60 text-white px-10 py-5 rounded-xl font-semibold text-lg transition-all duration-300 hover:bg-white/5">
                  See how it works
                </button>
              </Link>
            </div>
          </div>
        </section>

        {/* Testimonial Section */}
        <section className="py-16 lg:py-20 bg-white overflow-hidden">
          <div className="max-w-7xl mx-auto px-6 sm:px-8">
            <p className="text-center text-xs sm:text-sm font-bold text-gray-500 mb-4 uppercase tracking-widest animate-fade-in">
              SUBMITTING MORE WITH PRICEIQ
            </p>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-center mb-12 lg:mb-16 text-gray-900 leading-tight animate-slide-up">
              Join contractors winning more government contracts
            </h2>

            <div className="grid md:grid-cols-2 gap-6 lg:gap-8">
              {/* Navy stat card */}
              <div className="bg-[#0D2B50] text-white rounded-2xl p-8 lg:p-10 hover:shadow-2xl hover:scale-105 transition-all duration-500 animate-slide-in-left group relative overflow-hidden">
                {/* Animated gradient overlay */}
                <div className="absolute inset-0 bg-gradient-to-r from-[#2563eb]/0 via-[#2563eb]/10 to-[#2563eb]/0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 animate-shimmer"></div>

                <div className="relative z-10">
                  <h3 className="text-2xl lg:text-3xl font-bold mb-4 leading-tight">
                    Government contractors are{' '}
                    <span className="text-[#60a5fa]">submitting 3x faster</span>{' '}
                    with PriceIQ
                  </h3>
                </div>
              </div>

              {/* Cyan testimonial card */}
              <div className="bg-[#E8F9FA] rounded-2xl p-8 lg:p-10 flex flex-col justify-between hover:shadow-2xl hover:scale-105 transition-all duration-500 animate-slide-in-right group relative overflow-hidden">
                {/* Animated gradient overlay */}
                <div className="absolute inset-0 bg-gradient-to-r from-[#2563eb]/0 via-[#2563eb]/10 to-[#2563eb]/0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 animate-shimmer"></div>

                <div className="relative z-10">
                  <div className="mb-8">
                    <svg className="w-12 h-12 text-[#2563eb] mb-4 opacity-50" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M14.017 21v-7.391c0-5.704 3.731-9.57 8.983-10.609l.995 2.151c-2.432.917-3.995 3.638-3.995 5.849h4v10h-9.983zm-14.017 0v-7.391c0-5.704 3.748-9.57 9-10.609l.996 2.151c-2.433.917-3.996 3.638-3.996 5.849h3.983v10h-9.983z" />
                    </svg>
                    <p className="text-gray-900 text-lg lg:text-xl leading-relaxed">
                      "PriceIQ has completely transformed our proposal process. What used to take us <span className="font-bold text-gray-900">weeks</span> is now done in <span className="font-bold text-[#2563eb]">minutes</span>. The AI matching is incredibly accurate and the compliance features give us confidence in every bid."
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-4 relative z-10">
                  {/* Placeholder avatar with pulse animation */}
                  <div className="w-16 h-16 rounded-full bg-gradient-to-br from-[#2563eb] to-[#1d4ed8] flex items-center justify-center text-white font-bold text-2xl relative group-hover:scale-110 transition-transform duration-300">
                    <div className="absolute inset-0 rounded-full bg-[#2563eb] animate-ping opacity-20"></div>
                    <span className="relative z-10">NN</span>
                  </div>

                  <div>
                    <p className="font-bold text-gray-900 text-lg">Pricing Analyst</p>
                    <p className="text-base text-gray-600">Nexagen Networks</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* How It Works - Workflow */}
        <section className="py-20 lg:py-28 bg-gradient-to-br from-slate-50 via-white to-slate-50 overflow-hidden relative">
          {/* Background decoration */}
          <div className="absolute inset-0 opacity-5">
            <div className="absolute top-20 left-10 w-72 h-72 bg-[#2563eb] rounded-full blur-3xl"></div>
            <div className="absolute bottom-20 right-10 w-96 h-96 bg-[#2563eb] rounded-full blur-3xl"></div>
          </div>

          <div className="max-w-7xl mx-auto px-6 sm:px-8 relative z-10">
            {/* Section Header */}
            <div className="text-center mb-16 lg:mb-20">
              <p className="text-sm font-bold text-[#2563eb] mb-4 uppercase tracking-widest animate-fade-in">
                SIMPLE 5-STEP PROCESS
              </p>
              <h2 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-gray-900 mb-6 leading-tight animate-slide-up">
                From RFP to Submission<br />in <span className="text-[#2563eb]">Minutes</span>
              </h2>
              <p className="text-xl text-gray-600 max-w-3xl mx-auto animate-fade-in" style={{ animationDelay: '0.1s' }}>
                Stop spending weeks on pricing. Our automated workflow gets you from upload to submission faster than ever.
              </p>
            </div>

            {/* Workflow Steps - Horizontal Layout */}
            <div className="flex flex-col lg:flex-row items-end justify-center gap-6 lg:gap-6 max-w-[1700px] mx-auto">
              {/* Step 1 - Upload RFP */}
              <div className="bg-white rounded-3xl p-8 shadow-lg flex-shrink-0 w-[260px] mx-auto lg:mx-0 relative">
                <div className="flex flex-col items-center text-center h-full">
                  <div className="absolute -top-3 -left-3 w-12 h-12 rounded-full bg-[#2563eb] text-white flex items-center justify-center text-lg font-bold shadow-lg">
                    1
                  </div>
                  <div className="w-16 h-16 rounded-2xl bg-[#2563eb] flex items-center justify-center shadow-md mb-5">
                    <Upload className="w-8 h-8 text-white" />
                  </div>
                  <h3 className="text-xl font-bold text-gray-900 mb-3">Upload RFP</h3>
                  <p className="text-gray-600 text-sm leading-relaxed">
                    Simply drag and drop your government RFP document. We support PDF, Word, and text files.
                  </p>
                </div>
              </div>

              {/* Step 2 - AI Review */}
              <div className="bg-white rounded-3xl p-8 shadow-lg flex-shrink-0 w-[260px] mx-auto lg:mx-0 relative">
                <div className="flex flex-col items-center text-center h-full">
                  <div className="absolute -top-3 -left-3 w-12 h-12 rounded-full bg-[#2563eb] text-white flex items-center justify-center text-lg font-bold shadow-lg">
                    2
                  </div>
                  <div className="w-16 h-16 rounded-2xl bg-[#2563eb] flex items-center justify-center shadow-md mb-5">
                    <Eye className="w-8 h-8 text-white" />
                  </div>
                  <h3 className="text-xl font-bold text-gray-900 mb-3">AI Review</h3>
                  <p className="text-gray-600 text-sm leading-relaxed">
                    Our AI extracts job descriptions, matches SOC codes, and calculates FBLR rates automatically with 95%+ accuracy.
                  </p>
                </div>
              </div>

              {/* Step 3 - Human Review */}
              <div className="bg-white rounded-3xl p-8 shadow-lg flex-shrink-0 w-[260px] mx-auto lg:mx-0 relative">
                <div className="flex flex-col items-center text-center h-full">
                  <div className="absolute -top-3 -left-3 w-12 h-12 rounded-full bg-[#2563eb] text-white flex items-center justify-center text-lg font-bold shadow-lg">
                    3
                  </div>
                  <div className="w-16 h-16 rounded-2xl bg-[#2563eb] flex items-center justify-center shadow-md mb-5">
                    <UserCheck className="w-8 h-8 text-white" />
                  </div>
                  <h3 className="text-xl font-bold text-gray-900 mb-3">Human Review</h3>
                  <p className="text-gray-600 text-sm leading-relaxed">
                    Review and validate AI-generated pricing. Adjust rates, add your expertise, and ensure accuracy before submission.
                  </p>
                </div>
              </div>

              {/* Step 4 - Export to Excel */}
              <div className="bg-white rounded-3xl p-8 shadow-lg flex-shrink-0 w-[260px] mx-auto lg:mx-0 relative">
                <div className="flex flex-col items-center text-center h-full">
                  <div className="absolute -top-3 -left-3 w-12 h-12 rounded-full bg-[#2563eb] text-white flex items-center justify-center text-lg font-bold shadow-lg">
                    4
                  </div>
                  <div className="w-16 h-16 rounded-2xl bg-[#2563eb] flex items-center justify-center shadow-md mb-5">
                    <Download className="w-8 h-8 text-white" />
                  </div>
                  <h3 className="text-xl font-bold text-gray-900 mb-3">Export to Excel</h3>
                  <p className="text-gray-600 text-sm leading-relaxed">
                    Download your complete pricing volume with FBLR breakdowns, audit trails, and government-ready formatting.
                  </p>
                </div>
              </div>

              {/* Step 5 - Submit & Win - Large */}
              <div className="bg-white rounded-3xl p-10 shadow-2xl flex-shrink-0 w-[360px] mx-auto lg:mx-0 relative border-2 border-[#2563eb]">
                <div className="flex flex-col items-center text-center h-full">
                  <div className="absolute -top-3 -right-3 w-14 h-14 rounded-full bg-[#2563eb] text-white flex items-center justify-center text-xl font-bold shadow-xl">
                    5
                  </div>
                  <div className="w-20 h-20 rounded-3xl bg-[#2563eb] flex items-center justify-center shadow-lg mb-6">
                    <Send className="w-10 h-10 text-white" />
                  </div>
                  <h3 className="text-3xl font-bold text-gray-900 mb-4">Submit & Win</h3>
                  <p className="text-gray-600 leading-relaxed text-base">
                    Submit your professional, competitive proposal with confidence. Your weeks of work done in minutes.
                  </p>
                </div>
              </div>
            </div>

          </div>
        </section>

        {/* Product Showcase */}
        <section className="py-16 lg:py-24 bg-white overflow-hidden">
          <div className="max-w-7xl mx-auto px-4 sm:px-6">
            <div className="grid lg:grid-cols-3 gap-8 lg:gap-12 items-center mb-16">
              {/* Left feature */}
              <div className="text-center lg:text-right animate-slide-in-left">
                <h3 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-4 leading-tight">
                  Win proposals faster than ever
                </h3>
                <p className="text-base sm:text-lg text-gray-600 leading-relaxed">
                  Upload government RFPs, extract requirements, and generate accurate pricing in minutes, giving you more time to focus on winning.
                </p>
              </div>

              {/* Center Laptop mockup */}
              <div className="flex justify-center animate-scale-in" style={{ animationDelay: '0.2s' }}>
                <div className="relative w-full max-w-[480px]">
                  {/* Laptop */}
                  <div className="relative">
                    {/* Screen */}
                    <div className="bg-gray-900 rounded-t-2xl p-3 shadow-2xl">
                      <div className="bg-white rounded-lg overflow-hidden aspect-[16/10] relative">
                        {/* Browser chrome */}
                        <div className="bg-gray-100 px-4 py-2 flex items-center gap-2 border-b border-gray-200">
                          <div className="flex gap-1.5">
                            <div className="w-3 h-3 rounded-full bg-red-400"></div>
                            <div className="w-3 h-3 rounded-full bg-yellow-400"></div>
                            <div className="w-3 h-3 rounded-full bg-green-400"></div>
                          </div>
                          <div className="flex-1 bg-white rounded px-3 py-1 text-xs text-gray-500 ml-2">
                            priceiq.org/proposal
                          </div>
                        </div>

                        {/* App content */}
                        <div className="p-4 bg-gradient-to-br from-slate-50 to-blue-50 h-full">
                          {/* Header */}
                          <div className="bg-white rounded-lg p-3 shadow-sm mb-3">
                            <div className="flex items-center justify-between mb-2">
                              <div className="h-4 w-32 bg-gray-200 rounded"></div>
                              <div className="h-6 w-20 bg-[#2563eb] rounded"></div>
                            </div>
                            <div className="space-y-1.5">
                              <div className="h-2 w-full bg-gray-100 rounded"></div>
                              <div className="h-2 w-3/4 bg-gray-100 rounded"></div>
                            </div>
                          </div>

                          {/* Data grid */}
                          <div className="bg-white rounded-lg p-3 shadow-sm">
                            <div className="grid grid-cols-3 gap-2 mb-2">
                              <div className="h-2 w-full bg-gray-300 rounded"></div>
                              <div className="h-2 w-full bg-gray-300 rounded"></div>
                              <div className="h-2 w-full bg-gray-300 rounded"></div>
                            </div>
                            <div className="space-y-2">
                              {[1,2,3,4].map((i) => (
                                <div key={i} className="grid grid-cols-3 gap-2">
                                  <div className="h-2 w-full bg-gray-100 rounded"></div>
                                  <div className="h-2 w-full bg-blue-100 rounded"></div>
                                  <div className="h-2 w-full bg-blue-200 rounded"></div>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Laptop base */}
                    <div className="h-3 bg-gradient-to-b from-gray-700 to-gray-800 rounded-b-xl"></div>
                    <div className="h-2 bg-gradient-to-b from-gray-800 to-gray-900 mx-auto w-[60%] rounded-b-lg"></div>
                  </div>
                </div>
              </div>

              {/* Right feature */}
              <div className="text-center lg:text-left animate-slide-in-right" style={{ animationDelay: '0.1s' }}>
                <h3 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-4 leading-tight">
                  Precision automation for government contracts
                </h3>
                <p className="text-base sm:text-lg text-gray-600 leading-relaxed">
                  AI powered SOC matching, BLS wage data, and FBLR calculations ensure every proposal meets strict compliance requirements automatically.
                </p>
              </div>
            </div>

            {/* Bottom feature boxes */}
            <div className="grid md:grid-cols-2 gap-8 lg:gap-10">
              <div className="text-center md:text-left animate-fade-in" style={{ animationDelay: '0.3s' }}>
                <h3 className="text-xl sm:text-2xl font-bold text-[#2563eb] mb-4 leading-tight">
                  Collaborate to win more together
                </h3>
                <p className="text-base sm:text-lg text-gray-600 leading-relaxed">
                  Share proposals across your team, track changes in real-time, and coordinate winning strategies with organization-wide workspaces.
                </p>
              </div>

              <div className="text-center md:text-left animate-fade-in" style={{ animationDelay: '0.4s' }}>
                <h3 className="text-xl sm:text-2xl font-bold text-[#2563eb] mb-4 leading-tight">
                  Accurate BLS wage data at your fingertips
                </h3>
                <p className="text-base sm:text-lg text-gray-600 leading-relaxed">
                  Access over 6 million wage records from the Bureau of Labor Statistics, with intelligent SOC matching and automated calculations for accurate, defensible pricing.
                </p>
              </div>
            </div>

          </div>
        </section>

        {/* Full-width CTA Section */}
        <section className="relative min-h-[600px] flex items-center justify-center overflow-hidden">
          <div className="absolute inset-0 z-0">
            {/* TODO: Replace with your background video/image */}
            {/* Uncomment and add your video or image file:
            <video
              autoPlay
              loop
              muted
              playsInline
              className="absolute inset-0 w-full h-full object-cover"
            >
              <source src="/videos/cta-background.mp4" type="video/mp4" />
            </video>
            OR
            <img src="/images/office-team.jpg" alt="Team collaboration" className="absolute inset-0 w-full h-full object-cover" />
            */}

            {/* Placeholder gradient (remove when video/image is added) */}
            <div className="absolute inset-0 bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900" />

            {/* Dark overlay for text readability */}
            <div className="absolute inset-0 bg-black/40 z-10" />
          </div>

          <div className="relative z-20 max-w-5xl mx-auto px-6 sm:px-8 text-center">
            <p className="text-sm sm:text-base font-bold text-white/90 mb-6 uppercase tracking-widest">
              FROM WEEKS TO MINUTES
            </p>
            <h2 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white mb-8 leading-tight">
              Accelerate your path to winning
            </h2>
            <p className="text-lg sm:text-xl text-white/90 max-w-3xl mx-auto mb-12 leading-relaxed">
              Stop losing opportunities to slow proposal processes. Our AI powered platform turns government RFPs into accurate, competitive pricing in minutes, not weeks.
            </p>
            <Link href="/pricing">
              <button className="bg-white hover:bg-gray-100 text-gray-900 px-12 py-5 rounded-xl font-bold text-lg transition-all duration-300 hover:shadow-2xl hover:-translate-y-1">
                See plans & pricing
              </button>
            </Link>
          </div>
        </section>

        {/* Feature Grid */}
        <section id="features" className="py-16 lg:py-24 bg-white overflow-hidden">
          <div className="max-w-7xl mx-auto px-4 sm:px-6">
            <div className="grid md:grid-cols-2 gap-6 lg:gap-8">
              {/* Feature 1 */}
              <div className="bg-[#E8F9FA] rounded-2xl p-10 lg:p-12 hover:shadow-xl hover:scale-105 transition-all duration-500 animate-slide-in-left group relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-r from-[#2563eb]/0 via-[#2563eb]/5 to-[#2563eb]/0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 animate-shimmer"></div>
                <div className="relative z-10">
                  <div className="flex items-center gap-2 mb-5">
                    <Target className="w-6 h-6 text-[#2563eb]" />
                    <p className="text-sm font-bold text-gray-600 uppercase tracking-wider">MAXIMIZE WIN RATES</p>
                  </div>
                  <h3 className="text-2xl lg:text-3xl font-bold text-gray-900 mb-5 leading-tight">
                    Track and improve your success
                  </h3>
                  <p className="text-base text-gray-600 mb-6 leading-relaxed">
                    Monitor proposal performance, analyze win rates by contract type, and identify patterns that lead to more awarded contracts.
                  </p>
                  <ul className="space-y-3">
                    {['Win/loss tracking', 'Performance analytics', 'Success pattern insights'].map((item, i) => (
                      <li key={i} className="flex items-center text-base text-gray-700">
                        <CheckCircle2 className="w-6 h-6 text-[#2563eb] mr-3 flex-shrink-0" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* Feature 2 */}
              <div className="bg-white border-2 border-gray-200 rounded-2xl p-10 lg:p-12 hover:shadow-xl hover:scale-105 transition-all duration-500 animate-slide-in-right group relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-r from-[#2563eb]/0 via-[#2563eb]/5 to-[#2563eb]/0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 animate-shimmer"></div>
                <div className="relative z-10">
                  <div className="flex items-center gap-2 mb-5">
                    <TrendingUp className="w-6 h-6 text-[#2563eb]" />
                    <p className="text-sm font-bold text-gray-600 uppercase tracking-wider">COMPETITIVE EDGE</p>
                  </div>
                  <h3 className="text-2xl lg:text-3xl font-bold text-gray-900 mb-5 leading-tight">
                    Price to win every time
                  </h3>
                  <p className="text-base text-gray-600 mb-6 leading-relaxed">
                    Leverage real-time BLS wage data, market intelligence, and competitive analysis to price your proposals at the sweet spot for winning.
                  </p>
                  <ul className="space-y-3">
                    {['Market rate intelligence', 'Competitive positioning', 'Win probability scoring'].map((item, i) => (
                      <li key={i} className="flex items-center text-base text-gray-700">
                        <CheckCircle2 className="w-6 h-6 text-[#2563eb] mr-3 flex-shrink-0" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* Feature 3 */}
              <div className="bg-white border-2 border-gray-200 rounded-2xl p-10 lg:p-12 hover:shadow-xl hover:scale-105 transition-all duration-500 animate-slide-in-left group relative overflow-hidden" style={{ animationDelay: '0.2s' }}>
                <div className="absolute inset-0 bg-gradient-to-r from-[#2563eb]/0 via-[#2563eb]/5 to-[#2563eb]/0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 animate-shimmer"></div>
                <div className="relative z-10">
                  <div className="flex items-center gap-2 mb-5">
                    <FileText className="w-6 h-6 text-[#2563eb]" />
                    <p className="text-sm font-bold text-gray-600 uppercase tracking-wider">SUBMIT WITH CONFIDENCE</p>
                  </div>
                  <h3 className="text-2xl lg:text-3xl font-bold text-gray-900 mb-5 leading-tight">
                    Professional proposals, every time
                  </h3>
                  <p className="text-base text-gray-600 mb-6 leading-relaxed">
                    Export government-ready pricing volumes with complete FBLR breakdowns, audit trails, and documentation that pass the strictest reviews.
                  </p>
                  <ul className="space-y-3">
                    {['Excel export ready', 'Complete documentation', 'Complete audit trails'].map((item, i) => (
                      <li key={i} className="flex items-center text-base text-gray-700">
                        <CheckCircle2 className="w-6 h-6 text-[#2563eb] mr-3 flex-shrink-0" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* Feature 4 */}
              <div className="bg-[#E8F9FA] rounded-2xl p-10 lg:p-12 hover:shadow-xl hover:scale-105 transition-all duration-500 animate-slide-in-right group relative overflow-hidden" style={{ animationDelay: '0.2s' }}>
                <div className="absolute inset-0 bg-gradient-to-r from-[#2563eb]/0 via-[#2563eb]/5 to-[#2563eb]/0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 animate-shimmer"></div>
                <div className="relative z-10">
                  <div className="flex items-center gap-2 mb-5">
                    <Clock className="w-6 h-6 text-[#2563eb]" />
                    <p className="text-sm font-bold text-gray-600 uppercase tracking-wider">SPEED WINS</p>
                  </div>
                  <h3 className="text-2xl lg:text-3xl font-bold text-gray-900 mb-5 leading-tight">
                    From weeks to minutes
                  </h3>
                  <p className="text-base text-gray-600 mb-6 leading-relaxed">
                    Submit more proposals and win more contracts. What used to take weeks of manual work now takes minutes with AI powered automation.
                  </p>
                  <ul className="space-y-3">
                    {['Instant SOC matching', 'Auto FBLR calculation', 'Batch RFP processing'].map((item, i) => (
                      <li key={i} className="flex items-center text-base text-gray-700">
                        <CheckCircle2 className="w-6 h-6 text-[#2563eb] mr-3 flex-shrink-0" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* FAQ Section */}
        <section id="faq" className="py-20 lg:py-28 bg-gray-50 overflow-hidden">
          <div className="max-w-4xl mx-auto px-6 sm:px-8">
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-center mb-16 text-gray-900 leading-tight animate-slide-up">
              Frequently asked questions
            </h2>

            <div className="bg-white rounded-2xl shadow-sm overflow-hidden animate-scale-in" style={{ animationDelay: '0.1s' }}>
              {faqs.map((faq, index) => (
                <div key={index} className="border-b border-gray-200 last:border-b-0 hover:bg-gray-50/50 transition-all duration-200">
                  <button
                    onClick={() => setOpenFaq(openFaq === index ? null : index)}
                    className="w-full px-8 lg:px-10 py-7 flex items-center justify-between text-left group"
                  >
                    <span className="text-base lg:text-lg font-semibold text-gray-900 pr-8 leading-tight group-hover:text-[#2563eb] transition-colors duration-200">
                      {faq.question}
                    </span>
                    <ChevronDown
                      className={`w-6 h-6 text-gray-500 flex-shrink-0 transition-all duration-300 group-hover:text-[#2563eb] ${
                        openFaq === index ? 'rotate-180' : ''
                      }`}
                    />
                  </button>
                  {openFaq === index && (
                    <div className="px-8 lg:px-10 pb-7 text-base text-gray-600 leading-relaxed animate-slide-down">
                      {faq.answer}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section className="py-24 lg:py-32 bg-[#2563eb] relative overflow-hidden">
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff12_1px,transparent_1px),linear-gradient(to_bottom,#ffffff12_1px,transparent_1px)] bg-[size:32px_32px] opacity-20"></div>

          <div className="max-w-5xl mx-auto px-6 sm:px-8 text-center relative z-10">
            <h2 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white mb-8 leading-tight animate-scale-in">
              Start winning more proposals today
            </h2>
            <p className="text-lg sm:text-xl text-white/95 mb-12 max-w-3xl mx-auto leading-relaxed animate-fade-in" style={{ animationDelay: '0.1s' }}>
              Join hundreds of government contractors turning weeks of pricing work into minutes and dramatically improving their win rates.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-6 animate-slide-up" style={{ animationDelay: '0.2s' }}>
              <Link href="/auth/signup">
                <button className="bg-white hover:bg-gray-100 text-[#2563eb] px-12 py-5 rounded-xl font-bold text-lg transition-all duration-300 hover:shadow-2xl hover:-translate-y-1 hover:scale-105">
                  Get started for free
                </button>
              </Link>
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="bg-black text-white py-12 lg:py-16">
          <div className="max-w-7xl mx-auto px-4 sm:px-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-8 lg:gap-12 mb-12">
              <div className="md:col-span-2 lg:col-span-1">
                <Link href="/" className="flex items-center space-x-3 mb-4">
                  <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-[#2563eb] text-white">
                    <BarChart3 className="w-6 h-6" />
                  </div>
                  <span className="text-xl font-bold">PriceIQ</span>
                </Link>
                <p className="text-sm text-gray-400 leading-relaxed mb-6">
                  AI-native pricing intelligence for government contractors.
                </p>
                <div className="flex items-center gap-4">
                  <a href="#" className="text-gray-400 hover:text-white transition-colors">
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M8.29 20.251c7.547 0 11.675-6.253 11.675-11.675 0-.178 0-.355-.012-.53A8.348 8.348 0 0022 5.92a8.19 8.19 0 01-2.357.646 4.118 4.118 0 001.804-2.27 8.224 8.224 0 01-2.605.996 4.107 4.107 0 00-6.993 3.743 11.65 11.65 0 01-8.457-4.287 4.106 4.106 0 001.27 5.477A4.072 4.072 0 012.8 9.713v.052a4.105 4.105 0 003.292 4.022 4.095 4.095 0 01-1.853.07 4.108 4.108 0 003.834 2.85A8.233 8.233 0 012 18.407a11.616 11.616 0 006.29 1.84" />
                    </svg>
                  </a>
                  <a href="#" className="text-gray-400 hover:text-white transition-colors">
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                      <path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd" />
                    </svg>
                  </a>
                  <a href="#" className="text-gray-400 hover:text-white transition-colors">
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                      <path fillRule="evenodd" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10c5.51 0 10-4.48 10-10S17.51 2 12 2zm6.605 4.61a8.502 8.502 0 011.93 5.314c-.281-.054-3.101-.629-5.943-.271-.065-.141-.12-.293-.184-.445a25.416 25.416 0 00-.564-1.236c3.145-1.28 4.577-3.124 4.761-3.362zM12 3.475c2.17 0 4.154.813 5.662 2.148-.152.216-1.443 1.941-4.48 3.08-1.399-2.57-2.95-4.675-3.189-5A8.687 8.687 0 0112 3.475zm-3.633.803a53.896 53.896 0 013.167 4.935c-3.992 1.063-7.517 1.04-7.896 1.04a8.581 8.581 0 014.729-5.975zM3.453 12.01v-.26c.37.01 4.512.065 8.775-1.215.25.477.477.965.694 1.453-.109.033-.228.065-.336.098-4.404 1.42-6.747 5.303-6.942 5.629a8.522 8.522 0 01-2.19-5.705zM12 20.547a8.482 8.482 0 01-5.239-1.8c.152-.315 1.888-3.656 6.703-5.337.022-.01.033-.01.054-.022a35.318 35.318 0 011.823 6.475 8.4 8.4 0 01-3.341.684zm4.761-1.465c-.086-.52-.542-3.015-1.659-6.084 2.679-.423 5.022.271 5.314.369a8.468 8.468 0 01-3.655 5.715z" clipRule="evenodd" />
                    </svg>
                  </a>
                </div>
              </div>

              <div>
                <h3 className="font-bold mb-4 text-sm uppercase tracking-wider">Product</h3>
                <ul className="space-y-3 text-sm">
                  <li><Link href="/#features" className="text-gray-400 hover:text-white transition-colors">Features</Link></li>
                  <li><Link href="/pricing" className="text-gray-400 hover:text-white transition-colors">Pricing</Link></li>
                  <li><Link href="/security" className="text-gray-400 hover:text-white transition-colors">Security</Link></li>
                </ul>
              </div>

              <div>
                <h3 className="font-bold mb-4 text-sm uppercase tracking-wider">Resources</h3>
                <ul className="space-y-3 text-sm">
                  <li><Link href="/resources" className="text-gray-400 hover:text-white transition-colors">Blog & Resources</Link></li>
                  <li><Link href="/#faq" className="text-gray-400 hover:text-white transition-colors">FAQ</Link></li>
                </ul>
              </div>

              <div>
                <h3 className="font-bold mb-4 text-sm uppercase tracking-wider">Company</h3>
                <ul className="space-y-3 text-sm">
                  <li><Link href="/about" className="text-gray-400 hover:text-white transition-colors">About Us</Link></li>
                  <li><Link href="/contact" className="text-gray-400 hover:text-white transition-colors">Contact</Link></li>
                </ul>
              </div>

              <div>
                <h3 className="font-bold mb-4 text-sm uppercase tracking-wider">Legal</h3>
                <ul className="space-y-3 text-sm">
                  <li><Link href="/support" className="text-gray-400 hover:text-white transition-colors">Help Center</Link></li>
                  <li><Link href="/legal/terms?tab=terms" className="text-gray-400 hover:text-white transition-colors">Terms & Conditions</Link></li>
                  <li><Link href="/legal/privacy" className="text-gray-400 hover:text-white transition-colors">Privacy Policy</Link></li>
                </ul>
              </div>
            </div>

            <div className="pt-8 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-gray-400">
              <p>© 2026 PriceIQ by Intrepix LLC. All rights reserved.</p>
              <div className="flex items-center gap-6">
                <Link href="/legal/privacy" className="hover:text-white transition-colors">Privacy Policy</Link>
                <Link href="/legal/terms?tab=terms" className="hover:text-white transition-colors">Terms & Conditions</Link>
                <Link href="/security" className="hover:text-white transition-colors">Security</Link>
              </div>
            </div>
          </div>
        </footer>
      </main>
    </div>
  );
}
