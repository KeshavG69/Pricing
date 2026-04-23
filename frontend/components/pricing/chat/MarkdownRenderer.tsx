'use client';

/**
 * MarkdownRenderer for PricingChatPanel.
 *
 * Modeled on Kroolo's enterprise-search-frontend chat renderer:
 *   - react-markdown with remark-gfm (tables, task lists, strikethrough)
 *     and rehype-raw (inline HTML passthrough).
 *   - Custom component overrides for headings, lists, code, tables, blockquotes,
 *     links, etc., so the chat feels like a polished assistant surface rather
 *     than raw text.
 *
 * No artifacts/charts/image-download machinery — this agent doesn't produce those.
 */

import type { FC, ComponentPropsWithoutRef } from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeRaw from 'rehype-raw';
import remarkGfm from 'remark-gfm';

interface MarkdownRendererProps {
  children: string;
  className?: string;
}

// Strip react-markdown's `node` prop so it doesn't hit the DOM as an unknown attr.
function filterNodeProp<T extends object>(props: T): Omit<T, 'node'> {
  const out = { ...props };
  if ('node' in out) delete (out as Record<string, unknown>).node;
  return out;
}

const components = {
  // ─── Headings ──────────────────────────────────────────────────────
  h1: (p: ComponentPropsWithoutRef<'h1'>) => (
    <h1 className="mt-4 mb-2 text-lg font-bold text-foreground" {...filterNodeProp(p)} />
  ),
  h2: (p: ComponentPropsWithoutRef<'h2'>) => (
    <h2 className="mt-4 mb-2 text-base font-bold text-foreground" {...filterNodeProp(p)} />
  ),
  h3: (p: ComponentPropsWithoutRef<'h3'>) => (
    <h3 className="mt-3 mb-1.5 text-sm font-semibold text-foreground" {...filterNodeProp(p)} />
  ),
  h4: (p: ComponentPropsWithoutRef<'h4'>) => (
    <h4 className="mt-3 mb-1 text-sm font-semibold text-foreground" {...filterNodeProp(p)} />
  ),
  h5: (p: ComponentPropsWithoutRef<'h5'>) => (
    <h5 className="mt-2 mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground" {...filterNodeProp(p)} />
  ),
  h6: (p: ComponentPropsWithoutRef<'h6'>) => (
    <h6 className="mt-2 mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground" {...filterNodeProp(p)} />
  ),

  // ─── Paragraph ─────────────────────────────────────────────────────
  p: (p: ComponentPropsWithoutRef<'p'>) => (
    <p className="my-2 leading-relaxed [&:first-child]:mt-0 [&:last-child]:mb-0" {...filterNodeProp(p)} />
  ),

  // ─── Inline emphasis ───────────────────────────────────────────────
  strong: (p: ComponentPropsWithoutRef<'strong'>) => (
    <strong className="font-semibold text-foreground" {...filterNodeProp(p)} />
  ),
  b: (p: ComponentPropsWithoutRef<'b'>) => (
    <b className="font-semibold text-foreground" {...filterNodeProp(p)} />
  ),
  em: (p: ComponentPropsWithoutRef<'em'>) => (
    <em className="italic" {...filterNodeProp(p)} />
  ),
  del: (p: ComponentPropsWithoutRef<'del'>) => (
    <del className="text-muted-foreground line-through" {...filterNodeProp(p)} />
  ),

  // ─── Links ─────────────────────────────────────────────────────────
  a: (p: ComponentPropsWithoutRef<'a'>) => (
    <a
      className="text-blue-600 underline-offset-2 hover:underline"
      target="_blank"
      rel="noopener noreferrer"
      {...filterNodeProp(p)}
    />
  ),

  // ─── Lists ─────────────────────────────────────────────────────────
  ul: (p: ComponentPropsWithoutRef<'ul'>) => (
    <ul className="my-2 list-disc space-y-1 pl-5 marker:text-muted-foreground" {...filterNodeProp(p)} />
  ),
  ol: (p: ComponentPropsWithoutRef<'ol'>) => (
    <ol className="my-2 list-decimal space-y-1 pl-5 marker:text-muted-foreground" {...filterNodeProp(p)} />
  ),
  li: (p: ComponentPropsWithoutRef<'li'>) => (
    <li className="leading-relaxed [&>p]:my-0" {...filterNodeProp(p)} />
  ),

  // ─── Blockquote ────────────────────────────────────────────────────
  blockquote: (p: ComponentPropsWithoutRef<'blockquote'>) => (
    <blockquote
      className="my-3 border-l-4 border-blue-200 bg-blue-50/40 py-1 pl-3 italic text-muted-foreground"
      {...filterNodeProp(p)}
    />
  ),

  // ─── Horizontal rule ───────────────────────────────────────────────
  hr: (p: ComponentPropsWithoutRef<'hr'>) => (
    <hr className="my-4 border-border" {...filterNodeProp(p)} />
  ),

  // ─── Code (inline + block) ─────────────────────────────────────────
  code: ({ className, children, ...rest }: ComponentPropsWithoutRef<'code'>) => {
    const isBlock = /language-/.test(className || '');
    if (!isBlock) {
      return (
        <code
          className="rounded border border-border bg-muted px-1 py-0.5 font-mono text-[0.85em] text-foreground"
          {...filterNodeProp(rest)}
        >
          {children}
        </code>
      );
    }
    // Block-level code (inside <pre>) — styled via pre below
    return (
      <code className={`${className ?? ''} font-mono text-xs text-foreground`} {...filterNodeProp(rest)}>
        {children}
      </code>
    );
  },
  pre: (p: ComponentPropsWithoutRef<'pre'>) => (
    <pre
      className="my-3 overflow-x-auto rounded-lg border border-border bg-muted p-3 text-xs leading-snug"
      {...filterNodeProp(p)}
    />
  ),

  // ─── Tables ────────────────────────────────────────────────────────
  table: (p: ComponentPropsWithoutRef<'table'>) => (
    <div className="my-3 overflow-x-auto">
      <table className="w-full border-collapse text-xs" {...filterNodeProp(p)} />
    </div>
  ),
  thead: (p: ComponentPropsWithoutRef<'thead'>) => (
    <thead className="bg-muted" {...filterNodeProp(p)} />
  ),
  tbody: (p: ComponentPropsWithoutRef<'tbody'>) => (
    <tbody {...filterNodeProp(p)} />
  ),
  tr: (p: ComponentPropsWithoutRef<'tr'>) => (
    <tr className="border-b border-border last:border-0" {...filterNodeProp(p)} />
  ),
  th: (p: ComponentPropsWithoutRef<'th'>) => (
    <th className="border border-border px-2 py-1.5 text-left font-semibold text-foreground" {...filterNodeProp(p)} />
  ),
  td: (p: ComponentPropsWithoutRef<'td'>) => (
    <td className="border border-border px-2 py-1.5 align-top text-foreground" {...filterNodeProp(p)} />
  ),

  // ─── Images ────────────────────────────────────────────────────────
  img: (p: ComponentPropsWithoutRef<'img'>) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img className="my-3 max-w-full rounded-lg" alt={p.alt ?? ''} {...filterNodeProp(p)} />
  ),
};

const MarkdownRenderer: FC<MarkdownRendererProps> = ({ children, className }) => (
  <div className={className}>
    <ReactMarkdown
      components={components}
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[rehypeRaw]}
    >
      {children}
    </ReactMarkdown>
  </div>
);

export default MarkdownRenderer;
