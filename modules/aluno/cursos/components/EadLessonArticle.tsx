import React, { useMemo } from 'react';
import { sanitizeHtml } from '../../../../lib/htmlSanitizer';

export function EadLessonArticle({ lesson, fallback }: { lesson: any; fallback?: string }) {
  const html = useMemo(() => sanitizeHtml(lesson?.textoHtml), [lesson?.textoHtml]);
  const sources = Array.isArray(lesson?.referencias)
    ? lesson.referencias.filter((source: any) => /^https:\/\//.test(source?.url || '')) : [];
  if (!Array.isArray(lesson?.habilidades)) {
    return <div className="whitespace-pre-line rounded-3xl border border-slate-100 bg-slate-50/70 p-5 text-sm font-medium leading-8 text-slate-700">{fallback}</div>;
  }
  return (
    <article className="min-w-0 space-y-5 text-sm leading-8 text-slate-700">
      <div
        className="overflow-x-auto break-words rounded-3xl border border-slate-100 bg-slate-50/70 p-5 [&_h2]:mb-3 [&_h2]:mt-6 [&_h2]:text-lg [&_h2]:font-black [&_h3]:mb-2 [&_h3]:mt-5 [&_h3]:font-bold [&_p]:mb-4 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:pl-6 [&_table]:w-full [&_td]:border [&_td]:border-slate-300 [&_td]:p-2 [&_th]:border [&_th]:border-slate-300 [&_th]:p-2"
        dangerouslySetInnerHTML={{ __html: html }}
      />
      {sources.length > 0 && (
        <section aria-label="Referências da aula" className="rounded-2xl border border-blue-100 bg-blue-50/50 p-4">
          <h4 className="font-bold text-[#001a33]">Para aprofundar e praticar</h4>
          <ul className="list-disc space-y-2 pl-5">
            {sources.map((source: any) => (
              <li key={source.id}><a href={source.url} target="_blank" rel="noopener noreferrer" className="break-words text-blue-700 underline">{source.title}</a></li>
            ))}
          </ul>
        </section>
      )}
    </article>
  );
}
