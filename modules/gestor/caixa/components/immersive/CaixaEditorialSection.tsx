import React from 'react';

interface CaixaEditorialSectionProps {
  id: string;
  title: string;
  eyebrow?: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  aside?: React.ReactNode;
  children: React.ReactNode;
  tone?: 'plain' | 'soft';
}

/**
 * Moldura editorial para agrupar componentes existentes sem alterar seus
 * contratos, dados ou comportamento interno.
 */
export const CaixaEditorialSection = ({
  id,
  title,
  eyebrow,
  description,
  action,
  aside,
  children,
  tone = 'plain',
}: CaixaEditorialSectionProps) => {
  const titleId = `${id}-title`;

  return (
    <section
      id={id}
      aria-labelledby={titleId}
      className="scroll-mt-28"
    >
      <div className={`overflow-hidden rounded-[28px] border border-slate-200 shadow-[0_20px_60px_-48px_rgba(15,23,42,0.55)] ${
        tone === 'soft' ? 'bg-slate-50/80' : 'bg-white'
      }`}>
        <header className="flex flex-col gap-4 border-b border-slate-200 px-5 py-5 sm:px-7 lg:flex-row lg:items-end lg:justify-between lg:px-8">
          <div className="max-w-3xl">
            {eyebrow ? (
              <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-blue-700">
                {eyebrow}
              </p>
            ) : null}
            <h2 id={titleId} className={`${eyebrow ? 'mt-1.5' : ''} text-xl font-black tracking-[-0.025em] text-[#001a33] sm:text-2xl`}>
              {title}
            </h2>
            {description ? (
              <div className="mt-2 text-sm leading-6 text-slate-500">{description}</div>
            ) : null}
          </div>
          {action ? <div className="shrink-0">{action}</div> : null}
        </header>

        <div className={aside ? 'grid lg:grid-cols-[minmax(0,1fr)_280px]' : undefined}>
          <div className="min-w-0 p-4 sm:p-6 lg:p-8">{children}</div>
          {aside ? (
            <aside className="border-t border-slate-200 bg-blue-50/45 p-5 sm:p-6 lg:border-l lg:border-t-0 lg:p-7">
              {aside}
            </aside>
          ) : null}
        </div>
      </div>
    </section>
  );
};

