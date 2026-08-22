import React from 'react';
import { CalendarDays, GraduationCap, Info, MapPin, Settings2, Users } from 'lucide-react';
import type { Turma } from '../../gestao.types';
import { formatDateBR } from '../formatters';
import CodigoCondicaoPlanoFinanceiroUnicoCard from './CodigoCondicaoPlanoFinanceiroUnicoCard';

interface TurmaPlanoFinanceiroUnicoConfiguracoesProps {
  turma: Turma;
  canManageFinanceiro?: boolean;
}

const TurmaPlanoFinanceiroUnicoConfiguracoes: React.FC<TurmaPlanoFinanceiroUnicoConfiguracoesProps> = ({
  turma,
  canManageFinanceiro = false,
}) => (
  <div className="space-y-6">
    <section className="rounded-[2rem] border border-slate-100 bg-white p-6 shadow-sm">
      <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.18em] text-blue-600"><Settings2 size={14} /> Dados da turma</p>
      <h3 className="mt-2 text-xl font-black text-[#001a33]">Configurações acadêmicas</h3>
      <p className="mt-1 text-sm font-medium text-slate-500">Informações definidas na abertura desta turma de Curso Livre ou Especialização.</p>

      <dl className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><dt className="flex items-center gap-2 text-[10px] font-black uppercase tracking-wider text-slate-500"><GraduationCap size={13} /> Curso</dt><dd className="mt-2 text-sm font-black text-[#001a33]">{turma.cursoNome}</dd></div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><dt className="flex items-center gap-2 text-[10px] font-black uppercase tracking-wider text-slate-500"><MapPin size={13} /> Polo</dt><dd className="mt-2 text-sm font-black text-[#001a33]">{turma.poloNome || 'Não informado'}</dd></div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><dt className="flex items-center gap-2 text-[10px] font-black uppercase tracking-wider text-slate-500"><Users size={13} /> Vagas e turno</dt><dd className="mt-2 text-sm font-black text-[#001a33]">{turma.vagasTotais} vagas · {turma.turno}</dd></div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><dt className="flex items-center gap-2 text-[10px] font-black uppercase tracking-wider text-slate-500"><CalendarDays size={13} /> Início</dt><dd className="mt-2 text-sm font-black text-[#001a33]">{formatDateBR(turma.dataInicio)}</dd></div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><dt className="flex items-center gap-2 text-[10px] font-black uppercase tracking-wider text-slate-500"><CalendarDays size={13} /> Término previsto</dt><dd className="mt-2 text-sm font-black text-[#001a33]">{formatDateBR(turma.dataPrevisaoTermino)}</dd></div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><dt className="text-[10px] font-black uppercase tracking-wider text-slate-500">Inscrições online</dt><dd className="mt-2 text-sm font-black text-[#001a33]">{turma.permitirInscricoesOnline ? 'Permitidas' : 'Não habilitadas'}</dd></div>
      </dl>
    </section>

    {turma.modalidade === 'LIVRE' ? <CodigoCondicaoPlanoFinanceiroUnicoCard turmaId={turma.id} canManageFinanceiro={canManageFinanceiro} /> : null}

    <section className="flex items-start gap-3 rounded-2xl border border-blue-100 bg-blue-50 p-5 text-sm text-blue-900">
      <Info className="mt-0.5 shrink-0 text-blue-600" size={20} />
      <div><p className="font-black">Plano financeiro separado</p><p className="mt-1 font-medium leading-relaxed">O valor total, quantidade variável de parcelas, vencimentos e encargos são consultados na aba Financeiro. Esta modalidade não utiliza cobranças de matrícula ou rematrícula.</p></div>
    </section>
  </div>
);

export default TurmaPlanoFinanceiroUnicoConfiguracoes;
