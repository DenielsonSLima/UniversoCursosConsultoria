import React, { useMemo, useState } from 'react';
import { FileText, Loader2, Search } from 'lucide-react';
import type { Turma } from '../../../../gestao.types';
import TechnicalDataError from '../TechnicalDataError';
import AlunoFinanceiroExtrato from './extrato/AlunoFinanceiroExtrato';
import type { AlunoFinanceiro } from './financeiro-alunos.service';

interface FinanceiroAlunosListLegacyProps {
  turma: Turma;
  alunos: AlunoFinanceiro[];
  isLoading: boolean;
  isError: boolean;
  isFetching: boolean;
  onRetry: () => void;
}

const formatMoney = (value: number) => new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
}).format(value || 0);

const STATUS_LABELS = {
  em_dia: 'Em dia',
  atrasado: 'Atrasado',
  inadimplente: 'Inadimplente',
} as const;

const FinanceiroAlunosListLegacy: React.FC<FinanceiroAlunosListLegacyProps> = ({
  alunos,
  isLoading,
  isError,
  isFetching,
  onRetry,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedMatriculaId, setSelectedMatriculaId] = useState<string | null>(null);
  const filtered = useMemo(() => {
    const search = searchTerm.trim().toLocaleLowerCase('pt-BR');
    if (!search) return alunos;
    return alunos.filter((aluno) => aluno.nome.toLocaleLowerCase('pt-BR').includes(search)
      || aluno.matricula.toLocaleLowerCase('pt-BR').includes(search));
  }, [alunos, searchTerm]);

  if (isLoading) return (
    <div className="flex items-center justify-center rounded-[2rem] border border-slate-100 bg-white py-10">
      <Loader2 className="animate-spin text-[#001a33]" size={24} />
      <span className="ml-2 text-sm font-bold text-slate-500">Carregando listagem financeira...</span>
    </div>
  );
  if (isError) return (
    <TechnicalDataError
      title="Situação financeira dos alunos não carregada"
      message="A lista foi bloqueada para não confundir falha de consulta com ausência de cobrança."
      retrying={isFetching}
      onRetry={onRetry}
    />
  );
  if (selectedMatriculaId) return (
    <AlunoFinanceiroExtrato matriculaId={selectedMatriculaId} onBack={() => setSelectedMatriculaId(null)} />
  );

  return (
    <section className="overflow-hidden rounded-[2rem] border border-slate-100 bg-white shadow-sm">
      <div className="flex flex-col gap-4 border-b border-slate-100 p-6 sm:flex-row sm:items-center sm:justify-between">
        <div><h3 className="text-lg font-black text-[#001a33]">Situação financeira dos alunos</h3><p className="text-xs font-semibold text-slate-500">Consulta das cobranças já existentes.</p></div>
        <div className="relative sm:w-64"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={17} /><input value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Buscar aluno..." className="w-full rounded-xl border border-slate-200 py-2.5 pl-10 pr-4 text-sm outline-none focus:border-blue-500" /></div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead className="border-b border-slate-100 bg-slate-50"><tr><th className="px-6 py-4 text-[10px] font-black uppercase text-slate-500">Aluno</th><th className="px-6 py-4 text-[10px] font-black uppercase text-slate-500">Matrícula</th><th className="px-6 py-4 text-[10px] font-black uppercase text-slate-500">Valores</th><th className="px-6 py-4 text-[10px] font-black uppercase text-slate-500">Status</th><th className="px-6 py-4" /></tr></thead>
          <tbody className="divide-y divide-slate-50">
            {filtered.length === 0 ? <tr><td colSpan={5} className="px-6 py-12 text-center text-sm font-semibold text-slate-400">Nenhum aluno encontrado.</td></tr> : filtered.map((aluno) => (
              <tr key={aluno.id} className="hover:bg-slate-50">
                <td className="px-6 py-4 text-sm font-black text-[#001a33]">{aluno.nome}</td>
                <td className="px-6 py-4 font-mono text-[10px] text-slate-500">{aluno.matricula}</td>
                <td className="px-6 py-4 text-[10px] font-bold text-slate-600">Mat. {formatMoney(aluno.valorMatricula)}<span className="block">Mens. {formatMoney(aluno.valorMensalidade)}</span></td>
                <td className="px-6 py-4"><span className="rounded-full bg-slate-100 px-2.5 py-1 text-[9px] font-black uppercase text-slate-600">{STATUS_LABELS[aluno.status]}</span></td>
                <td className="px-6 py-4 text-right"><button type="button" onClick={() => setSelectedMatriculaId(aluno.id)} aria-label={`Abrir extrato de ${aluno.nome}`} className="rounded-lg border border-blue-100 bg-blue-50 p-2 text-blue-600"><FileText size={15} /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
};

export default FinanceiroAlunosListLegacy;

