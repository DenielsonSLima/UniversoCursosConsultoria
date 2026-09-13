import type { FC } from 'react';
import type { HistoricalField as Field, SourceReference } from './diario-historico.types';
import { historicalFieldNeedsReview, historicalFieldText } from './diario-historico.presentation';

export const ReviewBadge = ({ state }: { state?: string }) => (
  state === 'REVIEW' || state === 'EM_CONFERENCIA'
    ? <span className="inline-flex rounded-md bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">Conferir</span>
    : null
);

export const HistoricalSources = ({ refs }: { refs?: SourceReference[] }) => (
  refs?.length ? (
    <details className="mt-1 text-[10px] font-normal text-slate-500">
      <summary className="cursor-pointer text-blue-600">Ver origem</summary>
      <ul className="mt-1 space-y-1">
        {refs.map((source, index) => <li key={`${source.locator}-${index}`} className="break-all">{source.locator || source.part || 'Documento original'}</li>)}
      </ul>
    </details>
  ) : null
);

const HistoricalField: FC<{ field?: Field; state?: string; fallback?: string }> = ({ field, state, fallback }) => (
  <div className="space-y-1">
    <span className="whitespace-pre-wrap break-words">{field ? historicalFieldText(field) : fallback || '—'}</span>
    {historicalFieldNeedsReview(field, state) && <div><ReviewBadge state="REVIEW" /></div>}
    <HistoricalSources refs={field?.sourceRefs} />
  </div>
);

export default HistoricalField;
