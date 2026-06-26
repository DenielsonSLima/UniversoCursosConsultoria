// File: modules/gestor/gestao/tecnicos/detalhes/components/financeiro/FinanceiroAlunosList.tsx

import React, { useEffect, useState } from 'react';
import { Search, MoreHorizontal, CheckCircle2, AlertTriangle, XCircle, FileText, Download, Loader2, Copy, ExternalLink } from 'lucide-react';
import { Turma } from '../../../../gestao.types';
import { supabase } from '../../../../../../../lib/supabase';
import ToastNotification, { useToast } from '../../../../../parceiros/components/shared/ToastNotification';
import { formatMatricula } from '../../../../../../../lib/academicUtils';
import AlunoFinanceiroExtrato from './extrato/AlunoFinanceiroExtrato';


interface FinanceiroAlunosListProps {
  turma: Turma;
}

interface AlunoFinanceiro {
  id: string;
  nome: string;
  matricula: string;
  status: 'em_dia' | 'atrasado' | 'inadimplente';
  parcelasPagas: number;
  totalParcelas: number;
  cobrancaUrl?: string;
  cobrancaDescricao?: string;
}

const FinanceiroAlunosList: React.FC<FinanceiroAlunosListProps> = ({ turma }) => {
  const { toasts, removeToast, toast } = useToast();
  const [searchTerm, setSearchTerm] = useState('');
  const [alunos, setAlunos] = useState<AlunoFinanceiro[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMatriculaId, setSelectedMatriculaId] = useState<string | null>(null);

  useEffect(() => {
    const fetchFinanceiroAlunos = async () => {
      setLoading(true);
      try {
        const [
          { data, error },
          { data: receivables, error: receivablesError },
        ] = await Promise.all([
          supabase
            .from('matriculas')
            .select('id, status, data_matricula, parceiros(*)')
            .eq('turma_id', turma.id),
          supabase
            .from('contas_receber')
            .select('matricula_id, status, data_vencimento, asaas_invoice_url, descricao')
            .eq('turma_id', turma.id),
        ]);

        if (error) throw error;
        if (receivablesError) throw receivablesError;

        const mapped: AlunoFinanceiro[] = (data || [])
          .filter((m: any) => m.parceiros)
          .map((m: any) => {
            const studentReceivables = (receivables || []).filter((item: any) => item.matricula_id === m.id);
            const hasOverdue = studentReceivables.some((item: any) =>
              item.status === 'VENCIDO'
              || (item.status === 'PENDENTE' && item.data_vencimento < new Date().toISOString().slice(0, 10))
            );
            const paid = studentReceivables.filter((item: any) => item.status === 'PAGO').length;
            const nextCharge = studentReceivables
              .filter((item: any) => ['PENDENTE', 'VENCIDO'].includes(item.status) && item.asaas_invoice_url)
              .sort((a: any, b: any) => String(a.data_vencimento).localeCompare(String(b.data_vencimento)))[0];

            return {
              id: m.id,
              nome: m.parceiros.nome,
              matricula: formatMatricula(m.id, m.data_matricula, m.parceiros.polo_id),
              status: hasOverdue ? 'inadimplente' : 'em_dia',
              parcelasPagas: paid,
              totalParcelas: studentReceivables.length,
              cobrancaUrl: nextCharge?.asaas_invoice_url,
              cobrancaDescricao: nextCharge?.descricao,
            };
          });

        setAlunos(mapped);
      } catch (err) {
        console.error('Erro ao buscar dados financeiros dos alunos:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchFinanceiroAlunos();
  }, [turma.id]);

  const filteredAlunos = alunos.filter(a => 
    a.nome.toLowerCase().includes(searchTerm.toLowerCase()) || 
    a.matricula.includes(searchTerm)
  );

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'em_dia':
        return <span className="flex items-center gap-1 bg-emerald-100 text-emerald-700 px-2 py-1 rounded text-[10px] font-bold uppercase"><CheckCircle2 size={12} /> Em Dia</span>;
      case 'atrasado':
        return <span className="flex items-center gap-1 bg-amber-100 text-amber-700 px-2 py-1 rounded text-[10px] font-bold uppercase"><AlertTriangle size={12} /> Atrasado</span>;
      case 'inadimplente':
        return <span className="flex items-center gap-1 bg-red-100 text-red-700 px-2 py-1 rounded text-[10px] font-bold uppercase"><XCircle size={12} /> Inadimplente</span>;
      default:
        return null;
    }
  };

  const openExtrato = (matriculaId: string) => {
    setSelectedMatriculaId(matriculaId);
  };

  const copyChargeLink = async (aluno: AlunoFinanceiro) => {
    if (!aluno.cobrancaUrl) {
      toast.warning('Cobrança sem link', 'Sincronize a cobrança com o Asaas para liberar o compartilhamento.');
      return;
    }
    await navigator.clipboard.writeText(aluno.cobrancaUrl);
    toast.success('Link copiado', `Envie a cobrança de ${aluno.nome} pelo canal de atendimento.`);
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-10 bg-white rounded-[2rem] border border-slate-100 shadow-sm">
        <Loader2 className="animate-spin text-[#001a33]" size={24} />
        <span className="text-slate-500 font-bold ml-2 text-sm">Carregando listagem financeira...</span>
      </div>
    );
  }

  if (selectedMatriculaId) {
    return (
      <AlunoFinanceiroExtrato
        matriculaId={selectedMatriculaId}
        onBack={() => setSelectedMatriculaId(null)}
      />
    );
  }

  return (
    <div className="bg-white rounded-[2rem] border border-slate-100 shadow-sm overflow-hidden animate-fadeIn">
      
      {/* Header da Lista */}
      <div className="p-6 border-b border-slate-100 flex flex-col md:flex-row justify-between items-center gap-4">
        <div>
          <h3 className="text-lg font-bold text-[#001a33]">Situação Financeira dos Alunos</h3>
          <p className="text-xs text-slate-500 mt-0.5">Acompanhamento de mensalidades e conciliação.</p>
        </div>
        
        <div className="flex gap-3 w-full md:w-auto">
          <div className="relative flex-1 md:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input 
              type="text" 
              placeholder="Buscar aluno..." 
              className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm outline-none focus:border-blue-500 transition-all text-slate-700"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <button className="flex items-center gap-2 px-4 py-2.5 bg-slate-100 text-slate-600 rounded-xl font-bold text-xs uppercase hover:bg-slate-200 transition-colors">
            <Download size={16} /> <span className="hidden md:inline">Exportar</span>
          </button>
        </div>
      </div>

      {/* Tabela */}
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead className="bg-slate-50 border-b border-slate-100">
            <tr>
              <th className="px-6 py-4 text-xs font-black text-slate-500 uppercase tracking-wider">Aluno</th>
              <th className="px-6 py-4 text-xs font-black text-slate-500 uppercase tracking-wider">Matrícula</th>
              <th className="px-6 py-4 text-xs font-black text-slate-500 uppercase tracking-wider">Progresso Pagto.</th>
              <th className="px-6 py-4 text-xs font-black text-slate-500 uppercase tracking-wider">Status</th>
              <th className="px-6 py-4 text-xs font-black text-slate-500 uppercase tracking-wider text-right">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {filteredAlunos.length === 0 ? (
                <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-slate-400 text-sm">
                        <XCircle size={32} className="mx-auto mb-2 opacity-50 text-slate-300" />
                        <p className="font-bold">Nenhum aluno matriculado na turma.</p>
                        <p className="text-xs text-slate-500 mt-0.5">Vincule alunos na aba "Alunos" para gerar lançamentos financeiros.</p>
                    </td>
                </tr>
            ) : (
                filteredAlunos.map((aluno) => (
                <tr
                  key={aluno.id}
                  onClick={() => openExtrato(aluno.id)}
                  className="group cursor-pointer hover:bg-blue-50/30 transition-colors"
                  title="Abrir extrato financeiro do aluno"
                >
                    <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-xs font-bold text-slate-500 border-2 border-white shadow-sm">
                        {aluno.nome.charAt(0)}
                        </div>
                        <span className="font-bold text-[#001a33] text-sm">{aluno.nome}</span>
                    </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-500 font-mono">{aluno.matricula}</td>
                    <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                            <div className="flex-1 h-2 w-24 bg-slate-100 rounded-full overflow-hidden">
                                <div 
                                    className={`h-full rounded-full ${aluno.status === 'inadimplente' ? 'bg-red-500' : 'bg-blue-500'}`} 
                                    style={{ width: `${aluno.totalParcelas > 0 ? (aluno.parcelasPagas / aluno.totalParcelas) * 100 : 0}%` }}
                                ></div>
                            </div>
                            <span className="text-[10px] font-bold text-slate-500">{aluno.parcelasPagas}/{aluno.totalParcelas}</span>
                        </div>
                    </td>
                    <td className="px-6 py-4">
                        {getStatusBadge(aluno.status)}
                    </td>
                    <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2" onClick={(event) => event.stopPropagation()}>
                        <button onClick={() => openExtrato(aluno.id)} title="Extrato Financeiro" className="p-2 bg-blue-50 hover:bg-blue-100 text-blue-600 rounded-lg transition-colors border border-blue-100">
                            <FileText size={16} />
                        </button>
                        {aluno.cobrancaUrl ? (
                          <>
                            <button onClick={() => copyChargeLink(aluno)} title="Copiar link de cobrança" className="p-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-600 rounded-lg transition-colors border border-emerald-100">
                                <Copy size={16} />
                            </button>
                            <a href={aluno.cobrancaUrl} target="_blank" rel="noreferrer" title={aluno.cobrancaDescricao || 'Abrir cobrança'} className="p-2 bg-slate-50 hover:bg-slate-100 text-slate-600 rounded-lg transition-colors border border-slate-100">
                                <ExternalLink size={16} />
                            </a>
                          </>
                        ) : (
                          <button onClick={() => copyChargeLink(aluno)} title="Cobrança ainda sem link Asaas" className="p-2 bg-slate-50 text-slate-300 rounded-lg border border-slate-100">
                              <Copy size={16} />
                          </button>
                        )}
                        <button title="Mais opções" className="p-2 hover:bg-slate-100 text-slate-400 hover:text-slate-600 rounded-lg transition-colors border border-transparent hover:border-slate-200">
                            <MoreHorizontal size={16} />
                        </button>
                    </div>
                    </td>
                </tr>
                ))
            )}
          </tbody>
        </table>
      </div>
      <ToastNotification toasts={toasts} onRemove={removeToast} />
    </div>
  );
};

export default FinanceiroAlunosList;
