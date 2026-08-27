export const formatBaneseDateTime = (value?: string | null) => value
  ? new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'medium',
    timeZone: 'America/Maceio',
  }).format(new Date(value))
  : 'Ainda não registrado';

const statusTone = (status: string) => {
  if (['SUCCESS', 'PAID', 'STABLE'].includes(status)) {
    return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  }
  if (['FAILED', 'ERROR', 'SUSPENDED', 'THROTTLED'].includes(status)) {
    return 'border-red-200 bg-red-50 text-red-700';
  }
  return 'border-amber-200 bg-amber-50 text-amber-700';
};

export const BaneseStatusPill = ({ value }: { value: string }) => (
  <span className={`inline-flex rounded-full border px-2.5 py-1 text-[9px] font-black uppercase tracking-wider ${statusTone(value)}`}>
    {value}
  </span>
);
