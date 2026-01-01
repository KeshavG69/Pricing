/**
 * Enterprise Addendum Content
 * Edit this file to update the enterprise addendum content
 */

import React from 'react';

export function EnterpriseAddendumContent() {
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

      <h1>Enterprise Addendum</h1>

      <p><strong>Price IQ</strong> — Government Contractor Use</p>

      <p>
        This Addendum supplements the Price IQ Terms and Conditions for enterprise and prime contractor
        customers.
      </p>

      <h2>1. No Government Endorsement</h2>

      <p>
        Use of Price IQ does not imply endorsement, approval, or authorization by any government entity.
      </p>

      <h2>2. Compliance Responsibility</h2>

      <p>Customer acknowledges that:</p>

      <ul>
        <li>Price IQ is a tool, not a compliance solution</li>
        <li>Customer retains all responsibility for FAR, DFARS, TINA, and agency-specific rules</li>
      </ul>

      <h2>3. Data Handling</h2>

      <p>Unless expressly agreed in writing:</p>

      <ul>
        <li>Price IQ is not FedRAMP authorized</li>
        <li>Customer shall not upload CUI, ITAR, or classified information</li>
      </ul>

      <h2>4. Audit & Records</h2>

      <p>Price IQ outputs are:</p>

      <ul>
        <li>Analytical aids only</li>
        <li>Not audit records</li>
        <li>Not certifications of cost or pricing data</li>
      </ul>

      <h2>5. Indemnification (Enterprise)</h2>

      <p>Customer agrees to indemnify Intrepix for claims arising from:</p>

      <ul>
        <li>Government submissions</li>
        <li>Regulatory actions</li>
        <li>Data misuse</li>
      </ul>

      <h2>6. Custom Security Terms</h2>

      <p>
        Any enhanced security, SLAs, or compliance requirements must be agreed to in a written Enterprise
        Order Form.
      </p>
    </div>
  );
}
