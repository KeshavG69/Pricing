'use client';

import Link from 'next/link';
import Image from 'next/image';
import { ArrowRight, Clock } from 'lucide-react';

export interface RelatedArticle {
  href: string;
  image: string;
  category: string;
  readTime: string;
  title: string;
  excerpt: string;
}

export default function RelatedArticles({ articles }: { articles: RelatedArticle[] }) {
  if (!articles.length) return null;

  return (
    <section className="border-t border-gray-100 bg-gray-50">
      <div className="max-w-6xl mx-auto px-6 sm:px-8 py-16 lg:py-20">
        <h2 className="text-3xl font-bold text-gray-900 mb-10">Keep reading</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {articles.map((a) => (
            <Link
              key={a.href}
              href={a.href}
              className="group flex flex-col rounded-2xl overflow-hidden border border-gray-200 bg-white shadow-sm hover:shadow-xl transition-all duration-300 hover:-translate-y-1"
            >
              <div className="relative overflow-hidden bg-slate-900">
                <Image
                  src={a.image}
                  alt={a.title}
                  width={1200}
                  height={630}
                  className="w-full h-auto transition-transform duration-500 group-hover:scale-[1.03]"
                />
              </div>
              <div className="flex flex-col flex-1 p-7">
                <div className="flex items-center gap-3 text-sm font-semibold text-[#2563eb] mb-3">
                  <span className="px-3 py-1 rounded-full bg-[#5B7FFF]/10 border border-[#5B7FFF]/20">
                    {a.category}
                  </span>
                  <span className="flex items-center gap-1.5 text-gray-500">
                    <Clock className="w-4 h-4" />
                    {a.readTime}
                  </span>
                </div>
                <h3 className="text-xl font-bold text-gray-900 leading-snug mb-2 group-hover:text-[#2563eb] transition-colors">
                  {a.title}
                </h3>
                <p className="text-gray-600 leading-relaxed mb-5 flex-1">{a.excerpt}</p>
                <span className="inline-flex items-center gap-2 text-[#2563eb] font-semibold">
                  Read article
                  <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
                </span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
