'use client';

import Link from 'next/link';
import Button from '@/components/ui/Button';
import { Sparkles, Zap, Shield, TrendingUp, ArrowRight, CheckCircle2 } from 'lucide-react';

export default function Home() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 overflow-hidden selection:bg-sky-500/30">
      {/* Nav */}
      <header className="fixed top-0 z-40 w-full border-b border-slate-800/50 bg-slate-950/50 backdrop-blur-xl">
        <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-3 group cursor-pointer">
            <div className="flex flex-col">
              <span className="text-lg font-bold tracking-tight text-slate-50 group-hover:text-sky-400 transition-colors">PriceIQ</span>
            </div>
          </div>
          <div className="flex items-center space-x-4">
            <Link href="/auth/login">
              <Button variant="ghost" size="sm" className="hidden sm:inline-flex">
                Sign in
              </Button>
            </Link>
            <Link href="/auth/signup">
              <Button variant="primary" size="sm" className="shadow-lg shadow-sky-500/20">
                Get started
                <ArrowRight className="w-4 h-4 ml-1" />
              </Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <main className="flex-1 pt-24">
        <section className="relative">
          {/* Background - Clean & Professional */}
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px]"></div>
            <div className="absolute left-0 right-0 top-0 -z-10 m-auto h-[310px] w-[310px] rounded-full bg-sky-500 opacity-20 blur-[100px]"></div>
          </div>

          <div className="relative mx-auto w-full max-w-7xl px-4 sm:px-6 pt-20 pb-32 sm:pt-32 sm:pb-40">
            <div className="max-w-4xl mx-auto text-center">


              <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold tracking-tight text-slate-50 mb-8 leading-[1.1] animate-slide-up">
                Win more contracts with <br />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-sky-400 via-blue-500 to-indigo-500">Intelligent Pricing</span>
              </h1>

              <p className="text-xl text-slate-400 max-w-2xl mx-auto mb-10 leading-relaxed animate-slide-up" style={{ animationDelay: '0.1s' }}>
                Import RFPs, model scenarios, and generate compliant pricing volumes in minutes.
                Unify spreadsheets, narratives, and approvals into one secure workspace.
              </p>

              <div className="flex flex-col sm:flex-row items-center justify-center space-y-4 sm:space-y-0 sm:space-x-6 animate-slide-up" style={{ animationDelay: '0.2s' }}>
                <Link href="/auth/signup" className="w-full sm:w-auto">
                  <Button variant="primary" size="lg" className="w-full sm:w-auto h-14 px-8 text-lg shadow-xl shadow-sky-500/20 hover:shadow-sky-500/30">
                    Start free trial
                    <ArrowRight className="w-5 h-5 ml-2" />
                  </Button>
                </Link>
                <Link href="/auth/login" className="w-full sm:w-auto">
                  <Button variant="glass" size="lg" className="w-full sm:w-auto h-14 px-8 text-lg">
                    View demo
                  </Button>
                </Link>
              </div>

              {/* Social Proof / Trust */}
              <div className="mt-16 pt-8 border-t border-slate-800/50 animate-fade-in" style={{ animationDelay: '0.4s' }}>
                <p className="text-sm text-slate-500 mb-6 font-medium uppercase tracking-wider">Trusted by pricing teams at</p>
                <div className="flex flex-wrap justify-center gap-8 opacity-50 grayscale hover:grayscale-0 transition-all duration-500">
                  {/* Placeholders for logos */}
                  <div className="h-8 w-24 bg-slate-800/50 rounded animate-pulse"></div>
                  <div className="h-8 w-24 bg-slate-800/50 rounded animate-pulse delay-75"></div>
                  <div className="h-8 w-24 bg-slate-800/50 rounded animate-pulse delay-150"></div>
                  <div className="h-8 w-24 bg-slate-800/50 rounded animate-pulse delay-200"></div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Features */}
        <section className="py-24 relative">
          <div className="mx-auto w-full max-w-7xl px-4 sm:px-6">
            <div className="text-center mb-16">
              <h2 className="text-3xl sm:text-4xl font-bold text-slate-50 mb-4">Everything you need to win</h2>
              <p className="text-lg text-slate-400 max-w-2xl mx-auto">
                Powerful features designed specifically for the complexities of government contracting.
              </p>
            </div>

            <div className="grid md:grid-cols-3 gap-8">
              {[
                {
                  icon: Zap,
                  title: 'AI-Powered Analysis',
                  desc: 'Automatically extract job descriptions and match to BLS wage data with AI precision.',
                  color: 'text-amber-400',
                  bg: 'bg-amber-500/10',
                  border: 'border-amber-500/20'
                },
                {
                  icon: TrendingUp,
                  title: 'Smart Pricing Models',
                  desc: 'Calculate FBLR, escalation, and indirect rates with built-in government compliance.',
                  color: 'text-sky-400',
                  bg: 'bg-sky-500/10',
                  border: 'border-sky-500/20'
                },
                {
                  icon: Shield,
                  title: 'Secure & Compliant',
                  desc: 'Enterprise-grade security with full audit trails and compliance documentation.',
                  color: 'text-emerald-400',
                  bg: 'bg-emerald-500/10',
                  border: 'border-emerald-500/20'
                }
              ].map((feature, i) => (
                <div key={i} className="bg-slate-900/50 border border-slate-800 hover:border-slate-700 rounded-2xl p-8 group transition-all duration-300 hover:shadow-lg hover:shadow-slate-900/50">
                  <div className={`h-12 w-12 rounded-xl ${feature.bg} ${feature.color} flex items-center justify-center mb-6 ring-1 ring-inset ${feature.border}`}>
                    <feature.icon className="w-6 h-6" />
                  </div>
                  <h3 className="text-xl font-bold text-slate-50 mb-3 group-hover:text-sky-400 transition-colors">{feature.title}</h3>
                  <p className="text-slate-400 leading-relaxed">
                    {feature.desc}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="py-24 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-b from-slate-950 to-sky-950/20"></div>
          <div className="mx-auto w-full max-w-5xl px-4 sm:px-6 relative z-10">
            <div className="glass rounded-3xl p-12 text-center border border-sky-500/20 shadow-2xl shadow-sky-500/10">
              <h2 className="text-3xl sm:text-4xl font-bold text-slate-50 mb-6">Ready to transform your pricing?</h2>
              <p className="text-lg text-slate-400 mb-8 max-w-2xl mx-auto">
                Join high-performing capture teams who are winning more business with PriceIQ.
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center space-y-4 sm:space-y-0 sm:space-x-4">
                <Link href="/auth/signup">
                  <Button variant="primary" size="lg" className="h-12 px-8">
                    Get started for free
                  </Button>
                </Link>
                <div className="flex items-center space-x-2 text-sm text-slate-400">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span>No credit card required</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="py-12 border-t border-slate-800/50 bg-slate-950">
          <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 flex flex-col md:flex-row items-center justify-between">
            <div className="flex items-center space-x-2 mb-4 md:mb-0">
              <span className="text-lg font-bold text-slate-400">PriceIQ</span>
            </div>
            <p className="text-sm text-slate-500">
              © 2024 PriceIQ. All rights reserved.
            </p>
          </div>
        </footer>
      </main>
    </div>
  );
}
