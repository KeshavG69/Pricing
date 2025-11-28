'use client';

import Link from 'next/link';
import Button from '@/components/ui/Button';
import { Sparkles, Zap, Shield, TrendingUp, ArrowRight, CheckCircle2, BarChart3, PieChart, FileText } from 'lucide-react';

export default function Home() {
  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden">
      {/* Nav */}
      <header className="fixed top-0 z-40 w-full border-b border-border bg-background/80 backdrop-blur-md">
        <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-3 group cursor-pointer">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary text-primary-foreground">
              <BarChart3 className="w-5 h-5" />
            </div>
            <span className="text-lg font-bold tracking-tight text-foreground">PriceIQ</span>
          </div>
          <div className="flex items-center space-x-4">
            <Link href="/auth/login">
              <Button variant="ghost" size="sm" className="hidden sm:inline-flex">
                Sign in
              </Button>
            </Link>
            <Link href="/auth/signup">
              <Button variant="primary" size="sm">
                Get started
                <ArrowRight className="w-4 h-4 ml-1" />
              </Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <main className="flex-1 pt-24">
        <section className="relative overflow-hidden pb-16 sm:pb-24">
          <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 pt-16 sm:pt-24 text-center">
            <div className="mx-auto max-w-3xl">
              <div className="inline-flex items-center rounded-full border border-border bg-secondary/50 px-3 py-1 text-sm font-medium text-secondary-foreground mb-8 animate-fade-in">
                <span className="flex h-2 w-2 rounded-full bg-primary mr-2"></span>
                New: AI-Powered Rate Analysis
              </div>
              
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-foreground mb-6 leading-[1.1] animate-slide-up">
                Win more government contracts with <span className="text-primary">Intelligent Pricing</span>
              </h1>

              <p className="text-xl text-muted-foreground max-w-2xl mx-auto mb-10 leading-relaxed animate-slide-up" style={{ animationDelay: '0.1s' }}>
                Streamline your pricing strategy. Import RFPs, model complex scenarios, and generate compliant pricing volumes in minutes—not days.
              </p>

              <div className="flex flex-col sm:flex-row items-center justify-center space-y-4 sm:space-y-0 sm:space-x-4 animate-slide-up" style={{ animationDelay: '0.2s' }}>
                <Link href="/auth/signup" className="w-full sm:w-auto">
                  <Button variant="primary" size="lg" className="w-full sm:w-auto h-12 px-8 text-base shadow-lg shadow-primary/20">
                    Start free trial
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </Link>
                <Link href="/auth/login" className="w-full sm:w-auto">
                  <Button variant="outline" size="lg" className="w-full sm:w-auto h-12 px-8 text-base">
                    View demo
                  </Button>
                </Link>
              </div>

              <div className="mt-12 pt-8 border-t border-border animate-fade-in" style={{ animationDelay: '0.3s' }}>
                <p className="text-sm text-muted-foreground mb-6 font-medium uppercase tracking-wider">Trusted by pricing teams at</p>
                <div className="flex flex-wrap justify-center gap-8 opacity-60 grayscale hover:grayscale-0 transition-all duration-500">
                  {/* Mock Logos - Replace with SVGs if available */}
                  <div className="h-8 w-24 bg-muted rounded animate-pulse"></div>
                  <div className="h-8 w-24 bg-muted rounded animate-pulse delay-75"></div>
                  <div className="h-8 w-24 bg-muted rounded animate-pulse delay-150"></div>
                  <div className="h-8 w-24 bg-muted rounded animate-pulse delay-200"></div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Features Grid */}
        <section className="py-24 bg-secondary/30 border-y border-border">
          <div className="mx-auto w-full max-w-7xl px-4 sm:px-6">
            <div className="text-center mb-16">
              <h2 className="text-3xl font-bold text-foreground mb-4">Everything you need to win</h2>
              <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
                Powerful features designed specifically for the complexities of government contracting and proposal management.
              </p>
            </div>

            <div className="grid md:grid-cols-3 gap-8">
              {[
                {
                  icon: Zap,
                  title: 'AI-Powered Analysis',
                  desc: 'Automatically extract job descriptions and match to BLS wage data with AI precision.',
                  color: 'text-amber-600',
                  bg: 'bg-amber-100',
                },
                {
                  icon: TrendingUp,
                  title: 'Smart Pricing Models',
                  desc: 'Calculate FBLR, escalation, and indirect rates with built-in government compliance.',
                  color: 'text-blue-600',
                  bg: 'bg-blue-100',
                },
                {
                  icon: Shield,
                  title: 'Secure & Compliant',
                  desc: 'Enterprise-grade security with full audit trails and compliance documentation.',
                  color: 'text-emerald-600',
                  bg: 'bg-emerald-100',
                }
              ].map((feature, i) => (
                <div key={i} className="bg-card border border-border rounded-xl p-8 hover-card group">
                  <div className={`h-12 w-12 rounded-lg ${feature.bg} ${feature.color} flex items-center justify-center mb-6`}>
                    <feature.icon className="w-6 h-6" />
                  </div>
                  <h3 className="text-xl font-bold text-foreground mb-3">{feature.title}</h3>
                  <p className="text-muted-foreground leading-relaxed">
                    {feature.desc}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Feature Highlight Section */}
        <section className="py-24">
          <div className="mx-auto w-full max-w-7xl px-4 sm:px-6">
            <div className="grid md:grid-cols-2 gap-12 items-center">
              <div className="order-2 md:order-1">
                <div className="bg-secondary/50 rounded-2xl p-8 border border-border shadow-sm">
                  {/* Abstract UI Mockup */}
                  <div className="space-y-4">
                    <div className="flex items-center justify-between border-b border-border pb-4">
                      <div className="h-4 w-1/3 bg-muted rounded"></div>
                      <div className="h-8 w-24 bg-primary/10 rounded"></div>
                    </div>
                    <div className="space-y-2">
                      <div className="h-4 w-full bg-muted/50 rounded"></div>
                      <div className="h-4 w-5/6 bg-muted/50 rounded"></div>
                      <div className="h-4 w-4/6 bg-muted/50 rounded"></div>
                    </div>
                    <div className="grid grid-cols-3 gap-4 pt-4">
                      <div className="h-20 bg-background rounded border border-border"></div>
                      <div className="h-20 bg-background rounded border border-border"></div>
                      <div className="h-20 bg-background rounded border border-border"></div>
                    </div>
                  </div>
                </div>
              </div>
              <div className="order-1 md:order-2">
                <div className="inline-flex items-center rounded-full bg-blue-100 px-3 py-1 text-sm font-medium text-blue-800 mb-6">
                  <PieChart className="w-4 h-4 mr-2" />
                  Data Visualization
                </div>
                <h2 className="text-3xl font-bold text-foreground mb-6">Visualize your pricing strategy</h2>
                <p className="text-lg text-muted-foreground mb-8">
                  Gain deep insights into your pricing models with interactive charts and real-time analytics. 
                  Make data-driven decisions to optimize your win probability.
                </p>
                <ul className="space-y-4">
                  {[
                    'Real-time margin analysis',
                    'Competitor rate benchmarking',
                    'Historical data comparison'
                  ].map((item, i) => (
                    <li key={i} className="flex items-center text-foreground">
                      <CheckCircle2 className="w-5 h-5 text-primary mr-3" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="py-24 bg-primary text-primary-foreground relative overflow-hidden">
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff12_1px,transparent_1px),linear-gradient(to_bottom,#ffffff12_1px,transparent_1px)] bg-[size:24px_24px] opacity-20"></div>
          <div className="mx-auto w-full max-w-4xl px-4 sm:px-6 relative z-10 text-center">
            <h2 className="text-3xl sm:text-4xl font-bold mb-6">Ready to transform your pricing?</h2>
            <p className="text-xl text-primary-foreground/80 mb-10 max-w-2xl mx-auto">
              Join high-performing capture teams who are winning more business with PriceIQ.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center space-y-4 sm:space-y-0 sm:space-x-4">
              <Link href="/auth/signup">
                <Button variant="secondary" size="lg" className="h-14 px-8 text-lg font-semibold text-primary bg-white hover:bg-gray-50 border-none">
                  Get started for free
                </Button>
              </Link>
              <div className="flex items-center space-x-2 text-sm text-primary-foreground/80 mt-4 sm:mt-0 sm:ml-6">
                <CheckCircle2 className="w-4 h-4" />
                <span>No credit card required</span>
              </div>
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="py-12 bg-background border-t border-border">
          <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 flex flex-col md:flex-row items-center justify-between">
            <div className="flex items-center space-x-2 mb-4 md:mb-0">
              <BarChart3 className="w-6 h-6 text-primary" />
              <span className="text-lg font-bold text-foreground">PriceIQ</span>
            </div>
            <div className="flex space-x-6 text-sm text-muted-foreground">
              <Link href="#" className="hover:text-foreground transition-colors">Privacy</Link>
              <Link href="#" className="hover:text-foreground transition-colors">Terms</Link>
              <Link href="#" className="hover:text-foreground transition-colors">Contact</Link>
            </div>
            <p className="text-sm text-muted-foreground mt-4 md:mt-0">
              © 2024 PriceIQ. All rights reserved.
            </p>
          </div>
        </footer>
      </main>
    </div>
  );
}
