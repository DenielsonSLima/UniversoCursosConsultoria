import { ChevronLeft, ChevronRight } from 'lucide-react';

export default function NfsePager({ page, hasNext, busy, onChange }: {
  page: number; hasNext: boolean; busy?: boolean; onChange: (page: number) => void;
}) {
  return (
    <nav className="nfse-pager" aria-label="Paginação dos registros fiscais">
      <span>Página {page}</span>
      <button type="button" className="nfse-button nfse-button-secondary" disabled={busy || page <= 1} onClick={() => onChange(page - 1)} aria-label="Página anterior"><ChevronLeft size={16} /></button>
      <button type="button" className="nfse-button nfse-button-secondary" disabled={busy || !hasNext} onClick={() => onChange(page + 1)} aria-label="Próxima página"><ChevronRight size={16} /></button>
    </nav>
  );
}
