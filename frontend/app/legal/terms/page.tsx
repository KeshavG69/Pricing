'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { termsApi } from '@/lib/api/terms';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowLeft, FileText, Shield, Building2 } from 'lucide-react';
import { TermsContent } from '@/components/terms/content/TermsContent';
import { SummaryContent } from '@/components/terms/content/SummaryContent';
import { EnterpriseAddendumContent } from '@/components/terms/content/EnterpriseAddendumContent';

type TabType = 'summary' | 'terms' | 'enterprise';

/**
 * Terms page content component
 */
function TermsPageContent() {
  const searchParams = useSearchParams();
  const tabFromUrl = searchParams.get('tab') as TabType | null;
  const [activeTab, setActiveTab] = useState<TabType>(
    tabFromUrl && ['summary', 'terms', 'enterprise'].includes(tabFromUrl) ? tabFromUrl : 'summary'
  );

  // Get version from config
  const version = termsApi.getCurrentVersion();

  const tabs = [
    {
      id: 'summary' as TabType,
      label: 'Plain English Summary',
      icon: FileText,
      description: 'Easy-to-read overview'
    },
    {
      id: 'terms' as TabType,
      label: 'Full Terms & Conditions',
      icon: Shield,
      description: 'Complete legal document'
    },
    {
      id: 'enterprise' as TabType,
      label: 'Enterprise Addendum',
      icon: Building2,
      description: 'For enterprise customers'
    }
  ];

  return (
    <div className="min-h-screen bg-muted/30">
      {/* Header */}
      <header className="border-b bg-white sticky top-0 z-50 shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center space-x-2">
            <Image
              src="/logo.svg"
              alt="PriceIQ Logo"
              width={40}
              height={40}
            />
            <div className="flex flex-col">
              <span className="text-lg font-bold tracking-tight text-foreground">
                Price<span className="text-[#5B7FFF]">IQ</span>
              </span>
              <span className="text-xs text-muted-foreground">
                Gov Pricing Intelligence
              </span>
            </div>
          </Link>

          <Link
            href="/"
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to home
          </Link>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-6xl mx-auto px-6 py-12">
        {/* Title */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-foreground mb-2">
            Terms and Conditions
          </h1>
          <p className="text-muted-foreground">
            Version {version} • Last updated: December 29, 2025
          </p>
        </div>

        {/* Tabs */}
        <div className="border-b mb-6">
          <div className="flex gap-1 -mb-px">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;

              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`
                    flex items-center gap-2 px-4 py-3 border-b-2 transition-colors
                    ${isActive
                      ? 'border-primary text-primary font-semibold'
                      : 'border-transparent text-muted-foreground hover:text-foreground hover:border-gray-300'
                    }
                  `}
                >
                  <Icon className="w-4 h-4" />
                  <div className="text-left">
                    <div className="text-sm">{tab.label}</div>
                    <div className="text-xs opacity-70">{tab.description}</div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Content */}
        <>
          {/* Info Banner */}
          {activeTab === 'summary' && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg px-6 py-4 mb-6">
              <p className="text-sm text-blue-900">
                <strong>Note:</strong> This is a plain-English summary for your convenience.
                For the complete legal terms, please see the "Full Terms & Conditions" tab.
              </p>
            </div>
          )}

          {activeTab === 'enterprise' && (
            <div className="bg-purple-50 border border-purple-200 rounded-lg px-6 py-4 mb-6">
              <p className="text-sm text-purple-900">
                <strong>Enterprise Customers:</strong> This addendum supplements the main Terms
                and Conditions and applies to enterprise and prime contractor customers.
              </p>
            </div>
          )}

          {/* Content */}
          <div className="bg-white rounded-lg p-8 border shadow-sm">
            {activeTab === 'summary' && <SummaryContent />}
            {activeTab === 'terms' && <TermsContent />}
            {activeTab === 'enterprise' && <EnterpriseAddendumContent />}
          </div>
        </>

        {/* Related Links */}
        <div className="mt-8 p-6 bg-blue-50 border border-blue-200 rounded-lg">
          <h3 className="font-semibold text-blue-900 mb-3">Related Documents</h3>
          <ul className="space-y-2 text-sm text-blue-700">
            <li>
              <Link href="/legal/privacy" className="hover:underline">
                Privacy Policy
              </Link>
            </li>
            <li>
              <Link href="/legal/cookies" className="hover:underline">
                Cookie Policy
              </Link>
            </li>
            <li>
              <Link href="/auth/signup" className="hover:underline font-semibold">
                Create Account →
              </Link>
            </li>
          </ul>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t bg-white mt-12 py-8">
        <div className="max-w-6xl mx-auto px-6 text-center text-sm text-muted-foreground">
          © 2025 PriceIQ by Intrepix LLC. All rights reserved.
        </div>
      </footer>
    </div>
  );
}

/**
 * Public Terms and Conditions page (with Suspense boundary)
 * Accessible without authentication at /legal/terms
 * Shows 3 tabs: Plain English Summary, Full Terms, Enterprise Addendum
 */
export default function TermsPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-muted/30 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    }>
      <TermsPageContent />
    </Suspense>
  );
}
