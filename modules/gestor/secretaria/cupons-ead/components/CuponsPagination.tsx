import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface Props { page: number; pageSize: number; total: number; pending: boolean; onChange: (page: number) => void }

export function CuponsPagination({ page, pageSize, total, pending, onChange }: Props) {
  const pages = Math.max(1, Math.ceil(total / Math.max(1, pageSize)));
  if (pages <= 1) return null;
  return <nav className="cupons-pagination" aria-label="Paginação de cupons">
    <span>Página {page} de {pages} · {total} registros</span>
    <div><button type="button" className="cupom-secondary" aria-label="Página anterior" disabled={pending || page <= 1}
      onClick={() => onChange(page - 1)}><ChevronLeft size={16} />Anterior</button>
    <button type="button" className="cupom-secondary" aria-label="Próxima página" disabled={pending || page >= pages}
      onClick={() => onChange(page + 1)}>Próxima<ChevronRight size={16} /></button></div>
  </nav>;
}
