import React from 'react';
import { AlertCircle, Award, CheckCircle, Clock } from 'lucide-react';

interface CourseStatusBadgeProps { status?: string | null }

const CourseStatusBadge: React.FC<CourseStatusBadgeProps> = ({ status }) => {
  switch (String(status || '').toUpperCase()) {
    case 'ATIVO':
      return <span className="inline-flex items-center gap-1 rounded-full border border-emerald-100 bg-emerald-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-emerald-700"><CheckCircle size={10} /> Ativa</span>;
    case 'CONCLUIDO':
      return <span className="inline-flex items-center gap-1 rounded-full border border-blue-100 bg-blue-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-blue-700"><Award size={10} /> Concluída</span>;
    case 'REPROVADO':
      return <span className="inline-flex items-center gap-1 rounded-full border border-rose-100 bg-rose-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-rose-700"><AlertCircle size={10} /> Reprovado</span>;
    case 'PENDENTE':
    case 'AGUARDANDO_PAGAMENTO':
    case 'AGUARDANDO_CONFIRMACAO':
      return <span className="inline-flex items-center gap-1 rounded-full border border-amber-100 bg-amber-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-amber-700"><Clock size={10} /> Pagamento pendente</span>;
    case 'TRANCADO':
      return <span className="inline-flex items-center gap-1 rounded-full border border-amber-100 bg-amber-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-amber-700"><AlertCircle size={10} /> Trancada</span>;
    default:
      return <span className="inline-flex items-center rounded-full border border-slate-100 bg-slate-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-slate-600">Inativa</span>;
  }
};

export default CourseStatusBadge;
