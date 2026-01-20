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
  ArrowRight
} from 'lucide-react';

export default function Home() {
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  const faqs = [
    {
      question: "How does PriceIQ integrate with my existing workflow?",
      answer: "PriceIQ seamlessly imports your RFP documents and exports to Excel. Our platform works alongside your current tools, enhancing rather than replacing your workflow."
    },
    {
      question: "What data sources does PriceIQ use for wage rates?",
      answer: "We leverage official BLS OEWS data with over 6M wage records, ensuring your pricing is based on accurate, government-recognized labor rates."
    },
    {
      question: "Is my pricing data secure and compliant?",
      answer: "Yes. PriceIQ uses enterprise-grade encryption, maintains full audit trails, and supports government compliance standards including NIST and SOC 2."
    },
    {
      question: "Can my team collaborate on proposals?",
      answer: "Absolutely. PriceIQ supports organization-wide workspaces with role-based access control, allowing your team to collaborate in real-time."
    },
    {
      question: "How long does implementation take?",
      answer: "Most teams are up and running within hours. Our intuitive interface requires minimal training, and our support team is available to help you get started."
    }
  ];

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
            <a href="tel:1-888-555-0123" className="hidden sm:block text-base text-white/80 hover:text-white transition-colors font-medium">
              Talk to Sales: 1-888-555-0123
            </a>
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
            <div className="inline-flex items-center rounded-full bg-white/10 backdrop-blur-sm px-4 py-2 text-sm font-bold text-white mb-8 border border-white/20 animate-fade-in">
              <span className="flex h-2 w-2 rounded-full bg-[#22C55E] mr-2 animate-pulse"></span>
              AI-POWERED PRICING INTELLIGENCE
            </div>

            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white mb-6 leading-[1.1] tracking-tight animate-slide-up">
              Win more government contracts with{' '}
              <span className="text-[#22C55E]">intelligent pricing</span>
            </h1>

            <p className="text-lg sm:text-xl text-white/90 max-w-3xl mx-auto mb-10 leading-relaxed animate-slide-up" style={{ animationDelay: '0.1s' }}>
              Save time, automate tasks, and grow your business with the power of AI and trusted experts. Generate compliant pricing volumes in minutes—not days.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-5 animate-slide-up" style={{ animationDelay: '0.2s' }}>
              <Link href="/auth/signup">
                <button className="w-full sm:w-auto bg-[#22C55E] hover:bg-[#16A34A] text-white px-10 py-5 rounded-xl font-bold text-lg transition-all duration-300 hover:shadow-2xl hover:shadow-[#22C55E]/30 hover:-translate-y-1">
                  Get started free
                </button>
              </Link>
              <Link href="#demo">
                <button className="w-full sm:w-auto bg-transparent border-2 border-white/30 hover:border-white/60 text-white px-10 py-5 rounded-xl font-semibold text-lg transition-all duration-300 hover:bg-white/5">
                  Learn more
                </button>
              </Link>
            </div>
          </div>
        </section>

        {/* Testimonial Section */}
        <section className="py-16 lg:py-20 bg-white">
          <div className="max-w-7xl mx-auto px-6 sm:px-8">
            <p className="text-center text-xs sm:text-sm font-bold text-gray-500 mb-4 uppercase tracking-widest">
              WHAT OUR CUSTOMERS SAY
            </p>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-center mb-12 lg:mb-16 text-gray-900 leading-tight">
              The smart money is on PriceIQ
            </h2>

            <div className="grid md:grid-cols-2 gap-6 lg:gap-8">
              {/* Navy stat card */}
              <div className="bg-[#0D2B50] text-white rounded-2xl p-8 lg:p-10 hover:shadow-2xl transition-shadow duration-300">
                <h3 className="text-2xl lg:text-3xl font-bold mb-4 leading-tight">
                  87% of customers say PriceIQ gives them{' '}
                  <span className="text-[#22C55E]">better pricing accuracy</span>
                  <sup className="text-base">5</sup>
                </h3>
                <p className="text-white/70 text-sm">
                  Based on customer surveys conducted in Q3 2024
                </p>
              </div>

              {/* Cyan testimonial card */}
              <div className="bg-[#E8F9FA] rounded-2xl p-8 lg:p-10 flex flex-col justify-between hover:shadow-2xl transition-shadow duration-300">
                <div>
                  <p className="text-gray-900 text-lg lg:text-xl mb-8 leading-relaxed">
                    "PriceIQ has completely transformed our proposal process. What used to take us 2-3 days now takes just a few hours. The AI matching is incredibly accurate, and the compliance features give us confidence in every bid."
                  </p>
                </div>
                <div className="flex items-center gap-4">
                  {/* TODO: Replace with actual customer photo */}
                  {/* <img src="/images/testimonials/customer-1.jpg" alt="Michael Johnson" className="w-14 h-14 rounded-full object-cover" /> */}

                  {/* Placeholder avatar (remove when real photo is added) */}
                  <div className="w-16 h-16 rounded-full bg-gradient-to-br from-[#2563eb] to-[#1d4ed8] flex items-center justify-center text-white font-bold text-2xl">
                    MJ
                  </div>

                  <div>
                    <p className="font-bold text-gray-900 text-lg">Michael Johnson</p>
                    <p className="text-base text-gray-600">Capture Manager, Federal Solutions Inc</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Product Showcase */}
        <section className="py-16 lg:py-24 bg-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6">
            <div className="grid lg:grid-cols-3 gap-8 lg:gap-12 items-center mb-16">
              {/* Left feature */}
              <div className="text-center lg:text-right">
                <h3 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-4 leading-tight">
                  Create and send proposals from anywhere
                </h3>
                <p className="text-base sm:text-lg text-gray-600 leading-relaxed">
                  Upload RFPs, extract job descriptions, and generate pricing with our intelligent automation—whether you're in the office or on the go.
                </p>
              </div>

              {/* Center iPhone mockup */}
              <div className="flex justify-center">
                <div className="relative w-[280px] h-[560px]">
                  {/* iPhone frame */}
                  <div className="absolute inset-0 bg-black rounded-[3rem] shadow-2xl p-3">
                    {/* Screen */}
                    <div className="w-full h-full bg-white rounded-[2.5rem] overflow-hidden relative">
                      {/* Status bar */}
                      <div className="h-6 bg-white flex items-center justify-between px-6 text-xs font-semibold">
                        <span>9:41</span>
                        <div className="flex gap-1">
                          <div className="w-4 h-4 bg-gray-900 rounded-sm"></div>
                        </div>
                      </div>

                      {/* App content */}
                      <div className="p-4 bg-gradient-to-br from-blue-50 to-cyan-50 h-full">
                        <div className="bg-white rounded-xl p-4 shadow-sm mb-4">
                          <div className="flex items-center justify-between mb-3">
                            <div className="h-3 w-24 bg-gray-200 rounded"></div>
                            <div className="h-8 w-16 bg-[#22C55E] rounded-lg"></div>
                          </div>
                          <div className="space-y-2">
                            <div className="h-2 w-full bg-gray-100 rounded"></div>
                            <div className="h-2 w-3/4 bg-gray-100 rounded"></div>
                          </div>
                        </div>

                        <div className="bg-white rounded-xl p-4 shadow-sm">
                          <div className="h-3 w-20 bg-gray-200 rounded mb-3"></div>
                          <div className="space-y-3">
                            {[1,2,3].map((i) => (
                              <div key={i} className="flex items-center justify-between">
                                <div className="h-2 w-24 bg-gray-100 rounded"></div>
                                <div className="h-2 w-16 bg-[#2563eb] rounded"></div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                  {/* Notch */}
                  <div className="absolute top-0 left-1/2 -translate-x-1/2 w-1/3 h-7 bg-black rounded-b-3xl z-10"></div>
                </div>
              </div>

              {/* Right feature */}
              <div className="text-center lg:text-left">
                <h3 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-4 leading-tight">
                  Automation you can always count on
                </h3>
                <p className="text-base sm:text-lg text-gray-600 leading-relaxed">
                  Our AI agents categorize positions, match to wage data, and calculate rates automatically—so you can focus on strategy, not spreadsheets.
                </p>
              </div>
            </div>

            {/* Bottom feature boxes */}
            <div className="grid md:grid-cols-2 gap-8 lg:gap-10">
              <div className="text-center md:text-left">
                <h3 className="text-xl sm:text-2xl font-bold text-[#2563eb] mb-4 leading-tight">
                  Stay in control with real-time collaboration
                </h3>
                <p className="text-base sm:text-lg text-gray-600 leading-relaxed">
                  Your team's workspace is the home base for efficiency. Share proposals, track changes, and collaborate with confidence.
                </p>
              </div>

              <div className="text-center md:text-left">
                <h3 className="text-xl sm:text-2xl font-bold text-[#2563eb] mb-4 leading-tight">
                  Set your path to winning more contracts
                </h3>
                <p className="text-base sm:text-lg text-gray-600 leading-relaxed">
                  Access historical data, benchmark against competitors, and optimize your pricing strategy with data-driven insights.
                </p>
              </div>
            </div>

            <div className="text-center mt-12">
              <Link href="/auth/signup">
                <button className="bg-[#22C55E] hover:bg-[#16A34A] text-white px-10 py-4 rounded-xl font-bold text-lg transition-all duration-300 hover:shadow-lg hover:shadow-[#22C55E]/30 hover:-translate-y-0.5">
                  Learn more
                </button>
              </Link>
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
              AI-POWERED AUTOMATION
            </p>
            <h2 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white mb-8 leading-tight">
              Pricing intelligence, automated
            </h2>
            <p className="text-lg sm:text-xl text-white/90 max-w-3xl mx-auto mb-12 leading-relaxed">
              Transform your pricing process with AI that learns from BLS data, understands government contracting, and delivers accurate rates every time.
            </p>
            <Link href="/pricing">
              <button className="bg-white hover:bg-gray-100 text-gray-900 px-12 py-5 rounded-xl font-bold text-lg transition-all duration-300 hover:shadow-2xl hover:-translate-y-1">
                See plans & pricing
              </button>
            </Link>
          </div>
        </section>

        {/* Feature Grid */}
        <section className="py-16 lg:py-24 bg-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6">
            <div className="grid md:grid-cols-2 gap-6 lg:gap-8">
              {/* Feature 1 */}
              <div className="bg-[#E8F9FA] rounded-2xl p-10 lg:p-12 hover:shadow-xl transition-all duration-300">
                <div className="flex items-center gap-2 mb-5">
                  <Target className="w-6 h-6 text-[#2563eb]" />
                  <p className="text-sm font-bold text-gray-600 uppercase tracking-wider">TRACK PERFORMANCE</p>
                </div>
                <h3 className="text-2xl lg:text-3xl font-bold text-gray-900 mb-5 leading-tight">
                  Stay on top of your pipeline
                </h3>
                <p className="text-base text-gray-600 mb-6 leading-relaxed">
                  Monitor all active proposals, track win rates, and identify trends that help you refine your pricing strategy over time.
                </p>
                <ul className="space-y-3">
                  {['Real-time proposal tracking', 'Win rate analytics', 'Historical comparisons'].map((item, i) => (
                    <li key={i} className="flex items-center text-base text-gray-700">
                      <CheckCircle2 className="w-6 h-6 text-[#22C55E] mr-3 flex-shrink-0" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Feature 2 */}
              <div className="bg-white border-2 border-gray-200 rounded-2xl p-10 lg:p-12 hover:shadow-xl transition-all duration-300">
                <div className="flex items-center gap-2 mb-5">
                  <TrendingUp className="w-6 h-6 text-[#2563eb]" />
                  <p className="text-sm font-bold text-gray-600 uppercase tracking-wider">SEE INSIGHTS</p>
                </div>
                <h3 className="text-2xl lg:text-3xl font-bold text-gray-900 mb-5 leading-tight">
                  Spot growth opportunities
                </h3>
                <p className="text-base text-gray-600 mb-6 leading-relaxed">
                  Leverage wage data trends, market analysis, and competitive intelligence to position your bids for maximum success.
                </p>
                <ul className="space-y-3">
                  {['Market trend analysis', 'Competitive benchmarking', 'Smart recommendations'].map((item, i) => (
                    <li key={i} className="flex items-center text-base text-gray-700">
                      <CheckCircle2 className="w-6 h-6 text-[#22C55E] mr-3 flex-shrink-0" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Feature 3 */}
              <div className="bg-white border-2 border-gray-200 rounded-2xl p-10 lg:p-12 hover:shadow-xl transition-all duration-300">
                <div className="flex items-center gap-2 mb-5">
                  <FileText className="w-6 h-6 text-[#2563eb]" />
                  <p className="text-sm font-bold text-gray-600 uppercase tracking-wider">RUN REPORTS</p>
                </div>
                <h3 className="text-2xl lg:text-3xl font-bold text-gray-900 mb-5 leading-tight">
                  Insightful reports in seconds
                </h3>
                <p className="text-base text-gray-600 mb-6 leading-relaxed">
                  Generate compliance-ready pricing volumes with detailed breakdowns, audit trails, and exportable formats your clients expect.
                </p>
                <ul className="space-y-3">
                  {['One-click exports', 'Compliance documentation', 'Audit trail tracking'].map((item, i) => (
                    <li key={i} className="flex items-center text-base text-gray-700">
                      <CheckCircle2 className="w-6 h-6 text-[#22C55E] mr-3 flex-shrink-0" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Feature 4 */}
              <div className="bg-[#E8F9FA] rounded-2xl p-10 lg:p-12 hover:shadow-xl transition-all duration-300">
                <div className="flex items-center gap-2 mb-5">
                  <Clock className="w-6 h-6 text-[#2563eb]" />
                  <p className="text-sm font-bold text-gray-600 uppercase tracking-wider">SAVE TIME</p>
                </div>
                <h3 className="text-2xl lg:text-3xl font-bold text-gray-900 mb-5 leading-tight">
                  Accelerate your proposal process
                </h3>
                <p className="text-base text-gray-600 mb-6 leading-relaxed">
                  Reduce proposal development time from days to hours with intelligent automation and pre-built compliance templates.
                </p>
                <ul className="space-y-3">
                  {['Automated calculations', 'Template library', 'Bulk processing'].map((item, i) => (
                    <li key={i} className="flex items-center text-base text-gray-700">
                      <CheckCircle2 className="w-6 h-6 text-[#22C55E] mr-3 flex-shrink-0" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* FAQ Section */}
        <section className="py-20 lg:py-28 bg-gray-50">
          <div className="max-w-4xl mx-auto px-6 sm:px-8">
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-center mb-16 text-gray-900 leading-tight">
              Frequently asked questions
            </h2>

            <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
              {faqs.map((faq, index) => (
                <div key={index} className="border-b border-gray-200 last:border-b-0">
                  <button
                    onClick={() => setOpenFaq(openFaq === index ? null : index)}
                    className="w-full px-8 lg:px-10 py-7 flex items-center justify-between text-left hover:bg-gray-50 transition-colors duration-200"
                  >
                    <span className="text-base lg:text-lg font-semibold text-gray-900 pr-8 leading-tight">
                      {faq.question}
                    </span>
                    <ChevronDown
                      className={`w-6 h-6 text-gray-500 flex-shrink-0 transition-transform duration-200 ${
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

        {/* Integrations Section */}
        <section className="py-20 lg:py-28 bg-white">
          <div className="max-w-6xl mx-auto px-6 sm:px-8 text-center">
            <p className="text-xs sm:text-sm font-bold text-gray-500 mb-6 uppercase tracking-widest">
              SEAMLESSLY CONNECT APPS
            </p>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold mb-10 text-gray-900 leading-tight">
              Dozens of integrations
            </h2>

            <button className="mb-16 bg-black hover:bg-gray-800 text-white px-10 py-4 rounded-xl font-bold text-base transition-all duration-300 hover:shadow-lg hover:-translate-y-0.5">
              See all integrations
            </button>

            {/* Integration logo grid */}
            <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-8 lg:gap-12 mb-12">
              {Array.from({ length: 10 }).map((_, i) => (
                <div
                  key={i}
                  className="flex items-center justify-center h-16 bg-gradient-to-br from-gray-100 to-gray-200 rounded-lg hover:from-gray-200 hover:to-gray-300 transition-all duration-300 hover:scale-105 cursor-pointer"
                >
                  <div className="w-12 h-12 bg-white/50 rounded-lg flex items-center justify-center">
                    <div className="w-8 h-8 bg-gradient-to-br from-[#2563eb] to-[#1d4ed8] rounded"></div>
                  </div>
                </div>
              ))}
            </div>

            <p className="text-xl lg:text-2xl font-semibold text-gray-900 leading-tight">
              Unlock ways to work smarter and save time
            </p>
          </div>
        </section>

        {/* Final CTA */}
        <section className="py-24 lg:py-32 bg-[#2563eb] relative overflow-hidden">
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff12_1px,transparent_1px),linear-gradient(to_bottom,#ffffff12_1px,transparent_1px)] bg-[size:32px_32px] opacity-20"></div>

          <div className="max-w-5xl mx-auto px-6 sm:px-8 text-center relative z-10">
            <h2 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white mb-8 leading-tight">
              Ready to transform your pricing?
            </h2>
            <p className="text-lg sm:text-xl text-white/95 mb-12 max-w-3xl mx-auto leading-relaxed">
              Join hundreds of government contractors who are winning more business with PriceIQ's intelligent automation.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-6">
              <Link href="/auth/signup">
                <button className="bg-white hover:bg-gray-100 text-[#2563eb] px-12 py-5 rounded-xl font-bold text-lg transition-all duration-300 hover:shadow-2xl hover:-translate-y-1">
                  Get started for free
                </button>
              </Link>
              <div className="flex items-center gap-3 text-white/95">
                <CheckCircle2 className="w-6 h-6" />
                <span className="text-base font-medium">No credit card required</span>
              </div>
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="bg-black text-white py-12 lg:py-16">
          <div className="max-w-7xl mx-auto px-4 sm:px-6">
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
                  <li><Link href="#" className="text-gray-400 hover:text-white transition-colors">Features</Link></li>
                  <li><Link href="#" className="text-gray-400 hover:text-white transition-colors">Pricing</Link></li>
                  <li><Link href="#" className="text-gray-400 hover:text-white transition-colors">Integrations</Link></li>
                  <li><Link href="#" className="text-gray-400 hover:text-white transition-colors">API</Link></li>
                  <li><Link href="#" className="text-gray-400 hover:text-white transition-colors">Security</Link></li>
                  <li><Link href="#" className="text-gray-400 hover:text-white transition-colors">Roadmap</Link></li>
                </ul>
              </div>

              <div>
                <h3 className="font-bold mb-4 text-sm uppercase tracking-wider">Resources</h3>
                <ul className="space-y-3 text-sm">
                  <li><Link href="#" className="text-gray-400 hover:text-white transition-colors">Documentation</Link></li>
                  <li><Link href="#" className="text-gray-400 hover:text-white transition-colors">Tutorials</Link></li>
                  <li><Link href="#" className="text-gray-400 hover:text-white transition-colors">Blog</Link></li>
                  <li><Link href="#" className="text-gray-400 hover:text-white transition-colors">Case Studies</Link></li>
                  <li><Link href="#" className="text-gray-400 hover:text-white transition-colors">Webinars</Link></li>
                  <li><Link href="#" className="text-gray-400 hover:text-white transition-colors">Templates</Link></li>
                </ul>
              </div>

              <div>
                <h3 className="font-bold mb-4 text-sm uppercase tracking-wider">Company</h3>
                <ul className="space-y-3 text-sm">
                  <li><Link href="#" className="text-gray-400 hover:text-white transition-colors">About Us</Link></li>
                  <li><Link href="#" className="text-gray-400 hover:text-white transition-colors">Customers</Link></li>
                  <li><Link href="#" className="text-gray-400 hover:text-white transition-colors">Careers</Link></li>
                  <li><Link href="#" className="text-gray-400 hover:text-white transition-colors">Partners</Link></li>
                  <li><Link href="#" className="text-gray-400 hover:text-white transition-colors">Press Kit</Link></li>
                  <li><Link href="#" className="text-gray-400 hover:text-white transition-colors">Contact</Link></li>
                </ul>
              </div>

              <div>
                <h3 className="font-bold mb-4 text-sm uppercase tracking-wider">Support</h3>
                <ul className="space-y-3 text-sm">
                  <li><Link href="#" className="text-gray-400 hover:text-white transition-colors">Help Center</Link></li>
                  <li><Link href="#" className="text-gray-400 hover:text-white transition-colors">Community</Link></li>
                  <li><Link href="#" className="text-gray-400 hover:text-white transition-colors">Status</Link></li>
                  <li><Link href="/legal/terms" className="text-gray-400 hover:text-white transition-colors">Terms</Link></li>
                  <li><Link href="#" className="text-gray-400 hover:text-white transition-colors">Privacy</Link></li>
                  <li><Link href="#" className="text-gray-400 hover:text-white transition-colors">Compliance</Link></li>
                </ul>
              </div>
            </div>

            <div className="pt-8 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-gray-400">
              <p>© 2024 PriceIQ. All rights reserved.</p>
              <div className="flex items-center gap-6">
                <Link href="#" className="hover:text-white transition-colors">Privacy Policy</Link>
                <Link href="/legal/terms" className="hover:text-white transition-colors">Terms of Service</Link>
                <Link href="#" className="hover:text-white transition-colors">Cookie Settings</Link>
              </div>
            </div>
          </div>
        </footer>
      </main>
    </div>
  );
}
