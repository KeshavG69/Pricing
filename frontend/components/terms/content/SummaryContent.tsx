/**
 * Plain-English Terms Summary Content
 * Edit this file to update the summary content
 */

import React from 'react';

export function SummaryContent() {
  return (
    <div className="prose max-w-none pb-6
      prose-headings:font-bold prose-headings:text-gray-900 prose-headings:tracking-tight
      prose-h1:text-3xl prose-h1:mb-6 prose-h1:mt-10 prose-h1:pb-4 prose-h1:border-b-2 prose-h1:border-gray-200
      prose-h2:text-2xl prose-h2:mb-4 prose-h2:mt-10 prose-h2:font-semibold
      prose-h3:text-xl prose-h3:mb-3 prose-h3:mt-8 prose-h3:font-semibold
      prose-p:text-gray-700 prose-p:text-[15px] prose-p:leading-[1.75] prose-p:mb-5
      prose-strong:text-gray-900 prose-strong:font-semibold
      prose-ul:my-5 prose-ul:ml-6 prose-ul:space-y-2
      prose-ol:my-5 prose-ol:ml-6 prose-ol:space-y-2
      prose-li:text-gray-700 prose-li:text-[15px] prose-li:leading-[1.7]
      prose-a:text-blue-600 prose-a:font-medium prose-a:no-underline hover:prose-a:underline
      [&>*:first-child]:mt-0">

      <h1>Price IQ — Plain-English Terms Summary</h1>

      <p><em>This is NOT a replacement for the legal Terms — it's a trust-builder.</em></p>

      <h2>What Price IQ Does</h2>

      <ul>
        <li>Price IQ helps you analyze solicitations and build draft pricing models</li>
        <li>It does not make final pricing decisions</li>
        <li>You must review, edit, and approve everything</li>
      </ul>

      <h2>What Price IQ Does NOT Do</h2>

      <ul>
        <li>We don't certify pricing</li>
        <li>We don't guarantee accuracy</li>
        <li>We don't ensure FAR, DFARS, or TINA compliance</li>
        <li>We don't submit anything to the government on your behalf</li>
      </ul>

      <h2>Your Responsibility</h2>

      <p>You are responsible for:</p>

      <ul>
        <li>Pricing decisions</li>
        <li>Compliance</li>
        <li>Submissions</li>
        <li>Assumptions and edits</li>
      </ul>

      <h2>Data You Can Upload</h2>

      <ul>
        <li>Public solicitations</li>
        <li>Your own internal pricing data (non-classified)</li>
        <li>Sanitized documents only</li>
      </ul>

      <h2>Do NOT Upload</h2>

      <ul>
        <li>Classified data</li>
        <li>ITAR or export-controlled data</li>
        <li>CUI (until Price IQ is FedRAMP authorized)</li>
      </ul>

      <h2>AI Disclaimer</h2>

      <ul>
        <li>AI can make mistakes</li>
        <li>You must validate outputs</li>
        <li>Price IQ supports judgment — it doesn't replace it</li>
      </ul>

      <h2>Ownership</h2>

      <ul>
        <li>You own your data and outputs</li>
        <li>We own the software</li>
      </ul>

      <h2>Bottom Line</h2>

      <p>Price IQ helps you work faster — you stay in control.</p>
    </div>
  );
}
