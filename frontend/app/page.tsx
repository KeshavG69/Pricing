'use client';

import Link from 'next/link';
import Button from '@/components/ui/Button';
import { Sparkles, Zap, Shield, TrendingUp } from 'lucide-react';

export default function Home() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-50">
      {/* Nav */}
      <header className="sticky top-0 z-40 border-b border-slate-800/70 bg-slate-950/70 backdrop-blur-xl">
        <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 py-3 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className="h-7 w-7 rounded-2xl bg-slate-50 text-slate-900 flex items-center justify-center text-xs tracking-tight font-semibold">
              PI
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-semibold tracking-tight text-slate-50">PriceIQ</span>
              <span className="text-xs text-slate-400">Gov Pricing Intelligence</span>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <Link href="/auth/login">
              <Button variant="secondary" size="sm">
                Sign in
              </Button>
            </Link>
            <Link href="/auth/signup">
              <Button variant="primary" size="sm">
                Get started
              </Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <main className="flex-1">
        <section className="relative border-b border-slate-800/70">
          {/* Background glow */}
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            <div className="absolute -top-40 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-emerald-500/10 blur-3xl"></div>
            <div className="absolute top-40 -left-24 h-72 w-72 rounded-full bg-sky-500/10 blur-3xl"></div>
            <div className="absolute top-64 -right-24 h-72 w-72 rounded-full bg-indigo-500/10 blur-3xl"></div>
          </div>

          <div className="relative mx-auto w-full max-w-6xl px-4 sm:px-6 pt-16 pb-20 sm:pt-24 sm:pb-28">
            <div className="max-w-3xl mx-auto text-center">
              <div className="inline-flex items-center space-x-2 rounded-full border border-slate-700 bg-slate-900/70 px-3 py-1.5 text-xs text-slate-300 mb-6">
                <span className="inline-flex items-center rounded-full bg-emerald-500/10 text-emerald-300 px-2 py-0.5">
                  <Sparkles className="w-3 h-3 mr-1" />
                  New
                </span>
                <span>AI-native pricing & proposal workspace for federal contractors</span>
              </div>

              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-semibold tracking-tight text-slate-50 mb-6">
                PriceIQ turns complex government pricing into a single, intelligent surface.
              </h1>

              <p className="text-lg text-slate-300 max-w-2xl mx-auto mb-8">
                Import RFPs, model scenarios, and generate compliant pricing volumes in minutes.
                PriceIQ unifies spreadsheets, narratives, and approvals into one secure workspace
                your entire capture team actually wants to use.
              </p>

              <div className="flex items-center justify-center space-x-4">
                <Link href="/auth/signup">
                  <Button variant="primary" size="lg">
                    Start free trial
                  </Button>
                </Link>
                <Link href="/auth/login">
                  <Button variant="outline" size="lg">
                    Sign in
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* Features */}
        <section className="py-20 border-b border-slate-800/70">
          <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
            <div className="text-center mb-12">
              <h2 className="text-3xl font-semibold text-slate-50 mb-4">Everything you need to win</h2>
              <p className="text-slate-400">Powerful features for government contractors</p>
            </div>

            <div className="grid md:grid-cols-3 gap-6">
              <div className="bg-slate-900/30 border border-slate-800 rounded-lg p-6">
                <div className="h-10 w-10 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center mb-4">
                  <Zap className="w-5 h-5" />
                </div>
                <h3 className="text-lg font-semibold text-slate-50 mb-2">AI-Powered Analysis</h3>
                <p className="text-sm text-slate-400">
                  Automatically extract job descriptions and match to BLS wage data with AI precision.
                </p>
              </div>

              <div className="bg-slate-900/30 border border-slate-800 rounded-lg p-6">
                <div className="h-10 w-10 rounded-lg bg-sky-500/10 text-sky-400 flex items-center justify-center mb-4">
                  <TrendingUp className="w-5 h-5" />
                </div>
                <h3 className="text-lg font-semibold text-slate-50 mb-2">Smart Pricing</h3>
                <p className="text-sm text-slate-400">
                  Calculate FBLR, escalation, and indirect rates with built-in government compliance.
                </p>
              </div>

              <div className="bg-slate-900/30 border border-slate-800 rounded-lg p-6">
                <div className="h-10 w-10 rounded-lg bg-indigo-500/10 text-indigo-400 flex items-center justify-center mb-4">
                  <Shield className="w-5 h-5" />
                </div>
                <h3 className="text-lg font-semibold text-slate-50 mb-2">Secure & Compliant</h3>
                <p className="text-sm text-slate-400">
                  Enterprise-grade security with full audit trails and compliance documentation.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="py-8 border-t border-slate-800/70">
          <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
            <p className="text-center text-sm text-slate-500">
              © 2024 PriceIQ. Government Pricing Intelligence.
            </p>
          </div>
        </footer>
      </main>
    </div>
  );
}
