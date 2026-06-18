'use client';

import { useEffect, useState } from 'react';

export interface TOCSection {
  id: string;
  label: string;
}

export default function ArticleTOC({ sections }: { sections: TOCSection[] }) {
  const [active, setActive] = useState<string>(sections[0]?.id ?? '');

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: '-120px 0px -65% 0px', threshold: 0 }
    );

    sections.forEach((s) => {
      const el = document.getElementById(s.id);
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, [sections]);

  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>, id: string) => {
    e.preventDefault();
    const el = document.getElementById(id);
    if (el) {
      const top = el.getBoundingClientRect().top + window.scrollY - 110;
      window.scrollTo({ top, behavior: 'smooth' });
      setActive(id);
    }
  };

  return (
    <aside className="hidden lg:block">
      <div className="sticky top-28">
        <p className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-4">
          On this page
        </p>
        <nav className="flex flex-col border-l border-gray-200">
          {sections.map((s) => {
            const isActive = active === s.id;
            return (
              <a
                key={s.id}
                href={`#${s.id}`}
                onClick={(e) => handleClick(e, s.id)}
                className={`-ml-px border-l-2 pl-4 py-2 text-sm leading-snug transition-colors ${
                  isActive
                    ? 'border-[#2563eb] text-[#2563eb] font-semibold'
                    : 'border-transparent text-gray-500 hover:text-gray-900'
                }`}
              >
                {s.label}
              </a>
            );
          })}
        </nav>
      </div>
    </aside>
  );
}
