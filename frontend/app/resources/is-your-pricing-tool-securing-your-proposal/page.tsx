'use client';

import Link from 'next/link';
import Image from 'next/image';
import { ArrowLeft, ArrowRight, Lock, Users, Server, ScrollText, ShieldCheck } from 'lucide-react';

export default function ProposalSecurityArticle() {
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
        {/* Article header */}
        <header className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white">
          <div className="max-w-3xl mx-auto px-6 sm:px-8 py-14 lg:py-20">
            <Link
              href="/resources"
              className="inline-flex items-center gap-2 text-white/70 hover:text-white transition-colors text-sm font-medium mb-8"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Resources
            </Link>
            <div className="flex items-center gap-3 text-sm text-[#9db4ff] font-semibold mb-5">
              <span className="px-3 py-1 rounded-full bg-[#5B7FFF]/15 border border-[#5B7FFF]/30">Security</span>
              <span>·</span>
              <span>6 min read</span>
            </div>
            <h1 className="text-4xl sm:text-5xl font-bold leading-tight mb-6">
              Your Proposal Is Your Most Sensitive Asset. Is Your Pricing Tool Treating It That Way?
            </h1>
            <p className="text-xl text-white/80 leading-relaxed">
              A pricing volume is a map of how your business wins — and what it would cost a competitor
              to know it. Before you upload a single RFP, there&apos;s one question worth asking: where is
              this data going, and who can touch it?
            </p>
          </div>
        </header>

        {/* Cover image */}
        <div className="max-w-4xl mx-auto px-6 sm:px-8 mt-10 lg:mt-12 relative z-10">
          <div className="rounded-2xl overflow-hidden shadow-2xl ring-1 ring-black/5">
            <Image
              src="/blog/proposal-security-cover.svg"
              alt="Your proposal is your most sensitive asset — is your pricing tool treating it that way?"
              width={1200}
              height={630}
              className="w-full h-auto"
              priority
            />
          </div>
        </div>

        {/* Article body */}
        <article className="max-w-3xl mx-auto px-6 sm:px-8 py-14 lg:py-20">
          <div className="prose-article">
            <p>
              When a government contractor builds a pricing volume, they&apos;re not just assembling numbers.
              They&apos;re concentrating some of the most sensitive information their company owns into a
              single document: their cost structure, their labor rates, their fully burdened markups, their
              competitive strategy, and often details drawn directly from a solicitation that may itself
              involve Controlled Unclassified Information. A pricing volume is, in a very real sense, a map of
              how your business wins — and what it would cost a competitor to know it.
            </p>
            <p>
              So here&apos;s a question every contractor evaluating a new pricing tool should ask before
              uploading a single RFP: <em>where is this data going, and who can touch it?</em>
            </p>
            <p>
              It&apos;s an uncomfortable question, because the honest answer for a lot of teams is &ldquo;into a
              spreadsheet emailed around the company, stored on someone&apos;s laptop, and copied into a
              shared drive nobody fully controls.&rdquo; The irony is sharp. The same contractors who must
              demonstrate rigorous cybersecurity to win federal work often handle their own most sensitive
              proposal data in ways that would never pass their own compliance review.
            </p>
            <p>
              As AI-powered tools move into the pricing workflow, this question gets more urgent, not less.
              Adopting a new platform means trusting it with exactly the information you&apos;d least want
              exposed. That trust has to be earned with architecture, not promises. Here&apos;s what to look
              for — and how to think about your own security posture in the process.
            </p>

            <h2>The security questions that actually matter</h2>
            <p>
              When contractors raise security concerns about a cloud pricing tool, the worry usually isn&apos;t
              abstract. It clusters around a handful of specific, legitimate fears. Each one deserves a real
              answer.
            </p>

            <figure>
              <Image
                src="/blog/security-pillars.svg"
                alt="Five security questions that matter: encryption, access control, tenant isolation, audit trails, and standards alignment"
                width={1000}
                height={430}
                className="w-full h-auto rounded-2xl"
              />
            </figure>

            <h3>
              <Lock className="inline-block w-6 h-6 text-[#2563eb] mr-2 -mt-1" />
              Is my data encrypted — everywhere?
            </h3>
            <p>
              Encryption is the baseline, but the detail matters. Data needs protection in two states: <em>in
              transit</em>, as it moves between your browser and the platform, and <em>at rest</em>, as it sits
              stored on the platform&apos;s servers. A tool that encrypts one but not the other has left a door
              open. The modern standard is TLS 1.3 for data in transit and AES-256 for data at rest — the same
              caliber of encryption used to protect financial and government systems. If a vendor can&apos;t
              tell you both, that&apos;s your answer.
            </p>

            <h3>
              <Users className="inline-block w-6 h-6 text-[#2563eb] mr-2 -mt-1" />
              Who can see my data inside the platform?
            </h3>
            <p>
              Encryption protects against outsiders. Access controls protect against the more common risk: the
              wrong person inside seeing something they shouldn&apos;t. This is where role-based access control
              (RBAC) comes in. Not everyone on a proposal team needs to see everything — your pricing strategy
              may be need-to-know even internally. Granular roles that separate administrators from standard
              users, and limit each person to the data their job requires, are what turn &ldquo;we trust our
              team&rdquo; into &ldquo;our system enforces it.&rdquo;
            </p>

            <h3>
              <Server className="inline-block w-6 h-6 text-[#2563eb] mr-2 -mt-1" />
              What if I share infrastructure with other companies?
            </h3>
            <p>
              This is the fear unique to cloud and multi-tenant platforms, and it&apos;s a reasonable one: <em>if
              another contractor uses the same tool, could our data ever bleed into theirs?</em> The answer that
              should reassure you is multi-tenant isolation — an architecture where each organization&apos;s
              data is walled off completely, with no possibility of cross-contamination or unauthorized
              cross-access. One tenant&apos;s pricing volume should be invisible and inaccessible to every other
              tenant, by design, at the infrastructure level.
            </p>

            <h3>
              <ScrollText className="inline-block w-6 h-6 text-[#2563eb] mr-2 -mt-1" />
              Can I prove what happened, and when?
            </h3>
            <p>
              Federal work runs on accountability. When a contracting officer, an auditor, or your own
              compliance team asks who accessed a document and what they did with it, &ldquo;we think so&rdquo;
              is not an acceptable answer. Comprehensive audit trails — a complete, tamper-evident log of every
              action taken in the system — turn that question into a report you can pull on demand. They&apos;re
              not just a security feature; they&apos;re a compliance instrument.
            </p>

            <h3>
              <ShieldCheck className="inline-block w-6 h-6 text-[#2563eb] mr-2 -mt-1" />
              Does this align with the standards I&apos;m already held to?
            </h3>
            <p>
              Government contractors live under frameworks like the NIST Cybersecurity Framework, and
              increasingly under CMMC requirements for handling sensitive defense information. A pricing tool
              that aligns its controls with NIST standards isn&apos;t just checking a box — it&apos;s making
              sure that adopting the tool doesn&apos;t <em>introduce</em> a gap in the compliance posture
              you&apos;ve worked to build. Your vendors are part of your security perimeter now. They need to
              meet the bar you&apos;re held to.
            </p>

            <h2>Security is a chain, and your vendor is a link</h2>
            <p>
              Here&apos;s the strategic reframe that mature contractors have internalized: your security is only
              as strong as your weakest vendor. You can run a tight ship internally — trained staff,
              locked-down systems, careful CUI handling — and still expose yourself by routing sensitive
              proposal data through a tool that doesn&apos;t take security as seriously as you do.
            </p>

            <figure>
              <Image
                src="/blog/security-chain.svg"
                alt="Moving from scattered spreadsheets and email to a purpose-built, secured platform"
                width={1000}
                height={340}
                className="w-full h-auto rounded-2xl"
              />
            </figure>

            <p>
              This is why evaluating a pricing platform&apos;s security isn&apos;t a box-checking exercise to
              delegate to IT at the end. It&apos;s a core part of the buying decision, because the platform
              becomes an extension of your own attack surface. The right tool <em>strengthens</em> your posture
              by giving sensitive data a more controlled, more auditable, more isolated home than the
              spreadsheet-and-email status quo it replaces. The wrong tool quietly weakens it.
            </p>
            <blockquote>
              The good news: choosing well can actually be an upgrade. Moving pricing data off scattered laptops
              and ad-hoc shared drives into a purpose-built platform with enterprise-grade encryption, enforced
              access controls, and complete audit trails is, for many teams, a meaningful improvement over how
              they handle that data today.
            </blockquote>

            <h2>How PriceIQ approaches security</h2>
            <p>
              PriceIQ was built on the premise that proposal data is critical and should be treated that way —
              with security designed into every layer of the platform, not bolted on afterward. Here&apos;s how
              that maps to the questions above.
            </p>

            <ul className="feature-list">
              <li>
                <strong>Encryption, end to end.</strong> All data is encrypted in transit using TLS 1.3 and at
                rest using AES-256 — the enterprise-grade standard for protecting sensitive information in both
                states.
              </li>
              <li>
                <strong>Role-based access control.</strong> Granular permissions with distinct administrator and
                user roles ensure team members access only the data they need — making need-to-know an enforced
                rule, not a hopeful policy.
              </li>
              <li>
                <strong>Multi-tenant isolation.</strong> Each organization&apos;s data is completely isolated,
                preventing any cross-contamination or unauthorized access between tenants. Your pricing volumes
                are yours alone.
              </li>
              <li>
                <strong>Complete audit trails.</strong> Every action is logged, providing the transparency and
                accountability that federal compliance requirements demand — and the ability to answer
                &ldquo;who did what, when&rdquo; with a report rather than a guess.
              </li>
              <li>
                <strong>NIST-aligned standards.</strong> PriceIQ&apos;s security practices align with NIST
                guidelines to support the requirements government contractors operate under, with SOC 2 Type II
                certification actively being pursued for additional assurance.
              </li>
              <li>
                <strong>Secure infrastructure and defense in depth.</strong> The platform runs on
                industry-leading cloud infrastructure with 99.9% uptime, backed by bcrypt password hashing,
                short-lived session tokens, protection against common web attacks like SQL injection and
                cross-site scripting, rate limiting and DDoS protection, automated backups, and disaster
                recovery. Security monitoring runs around the clock, with an incident response target measured
                in under an hour.
              </li>
            </ul>

            <h2>The bottom line</h2>
            <p>
              Adopting an AI pricing tool shouldn&apos;t mean trading away control of your most sensitive data —
              it should mean giving that data a safer home than it has today. The right platform meets you at
              the security bar you&apos;re already held to as a federal contractor, and then clears it.
            </p>
            <p>
              Ask the hard questions of any tool you&apos;re evaluating. Encryption in transit and at rest.
              Enforced access controls. True tenant isolation. Complete audit trails. Alignment with the
              standards you live under. A vendor confident in its security will have clear answers — and PriceIQ
              was built to.
            </p>
          </div>

          {/* CTA card */}
          <div className="mt-14 rounded-2xl bg-gradient-to-br from-[#2563eb] to-[#1d4ed8] p-8 sm:p-10 text-white text-center shadow-xl">
            <h3 className="text-2xl sm:text-3xl font-bold mb-3">See how PriceIQ protects your proposal data</h3>
            <p className="text-white/90 text-lg mb-7 max-w-xl mx-auto leading-relaxed">
              Give your most sensitive asset a safer home — and your first proposal is on us.
            </p>
            <Link href="/auth/signup">
              <button className="inline-flex items-center gap-2 bg-white hover:bg-gray-100 text-[#2563eb] px-8 py-4 rounded-xl font-bold text-lg transition-all duration-300 hover:shadow-2xl hover:-translate-y-0.5">
                Explore PriceIQ&apos;s security
                <ArrowRight className="w-5 h-5" />
              </button>
            </Link>
          </div>
        </article>
      </main>

      {/* Footer */}
      <footer className="bg-black text-white py-12">
        <div className="max-w-7xl mx-auto px-6 sm:px-8 text-center">
          <p className="text-gray-400">© 2026 PriceIQ by Intrepix LLC. All rights reserved.</p>
        </div>
      </footer>

      <style jsx>{`
        .prose-article :global(p) {
          color: #374151;
          font-size: 1.175rem;
          line-height: 1.85;
          margin-bottom: 1.5rem;
        }
        .prose-article :global(h2) {
          color: #0f172a;
          font-size: 1.875rem;
          font-weight: 700;
          line-height: 1.25;
          margin-top: 3rem;
          margin-bottom: 1.25rem;
        }
        .prose-article :global(h3) {
          color: #0f172a;
          font-size: 1.4rem;
          font-weight: 700;
          line-height: 1.3;
          margin-top: 2.25rem;
          margin-bottom: 1rem;
        }
        .prose-article :global(figure) {
          margin: 2.5rem 0;
        }
        .prose-article :global(blockquote) {
          border-left: 4px solid #2563eb;
          background: #f8fafc;
          padding: 1.25rem 1.5rem;
          margin: 2rem 0;
          border-radius: 0 0.75rem 0.75rem 0;
          color: #1e293b;
          font-size: 1.25rem;
          line-height: 1.7;
          font-style: italic;
        }
        .prose-article :global(strong) {
          color: #0f172a;
          font-weight: 700;
        }
        .feature-list {
          list-style: none;
          padding: 0;
          margin: 2rem 0;
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }
        .feature-list :global(li) {
          position: relative;
          padding: 1.25rem 1.5rem 1.25rem 3.25rem;
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 1rem;
          color: #374151;
          font-size: 1.05rem;
          line-height: 1.65;
        }
        .feature-list :global(li)::before {
          content: '✓';
          position: absolute;
          left: 1.25rem;
          top: 1.25rem;
          width: 1.5rem;
          height: 1.5rem;
          color: #2563eb;
          font-weight: 800;
        }
      `}</style>
    </div>
  );
}
