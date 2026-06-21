// File: modules/gestor/gestao/tecnicos/detalhes/components/TurmaAlunos.tsx

import React, { useState, useEffect } from 'react';
import { Search, MoreHorizontal, FileText, DollarSign, UserX, UserPlus, X, CheckCircle2, Loader2, Trash2 } from 'lucide-react';
import { Turma } from '../../../gestao.types';
import { supabase } from '../../../../../../lib/supabase';
import ToastNotification, { useToast } from '../../../../parceiros/components/shared/ToastNotification';
import { formatMatricula } from '../../../../../../lib/academicUtils';


type StatusTurma = 'ATIVO' | 'DESISTENTE' | 'TRANCADO' | 'CONCLUÍDO';
type StatusFinanceiro = 'REGULAR' | 'INADIMPLENTE';

interface AlunoTurma {
  id: string; // ID da matrícula
  alunoId: string;
  nome: string;
  matricula: string;
  cpf: string;
  dataNasc: string;
  statusFinanceiro: StatusFinanceiro;
  statusTurma: string; // valor do banco (ativo, trancado, cancelado, concluido)
  frequencia: number;
}

interface TurmaAlunosProps {
  turma: Turma;
}

const TurmaAlunos: React.FC<TurmaAlunosProps> = ({ turma }) => {
  const { toasts, removeToast, toast } = useToast();
  const [showMatricularModal, setShowMatricularModal] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [alunos, setAlunos] = useState<AlunoTurma[]>([]);
  const [alunosDisponiveis, setAlunosDisponiveis] = useState<any[]>([]);

  // State for dummy action modal
  const [actionModal, setActionModal] = useState<{ isOpen: boolean; type: string; alunoName: string }>({ isOpen: false, type: '', alunoName: '' });

  useEffect(() => {
    loadEnrolledStudents();
  }, [turma.id]);

  const loadEnrolledStudents = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('matriculas')
        .select('id, status, data_matricula, parceiros(*)')
        .eq('turma_id', turma.id);

      if (error) throw error;

      const mapped: AlunoTurma[] = (data || []).map((m: any) => ({
        id: m.id,
        alunoId: m.parceiros?.id || '',
        nome: m.parceiros?.nome || 'Estudante sem Nome',
        matricula: formatMatricula(m.id, m.data_matricula, m.parceiros?.polo_id),
        cpf: m.parceiros?.cpf_cnpj || '000.000.000-00',
        dataNasc: m.parceiros?.data_nascimento
          ? new Date(m.parceiros.data_nascimento + 'T12:00:00').toLocaleDateString('pt-BR')
          : '—',
        statusFinanceiro: 'REGULAR',
        statusTurma: m.status || 'ativo',
        frequencia: 100
      }));

      setAlunos(mapped);
    } catch (err) {
      console.error('Erro ao buscar alunos matriculados:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadAlunosDisponiveis = async () => {
    try {
      const { data, error } = await supabase
        .from('parceiros')
        .select('*')
        .eq('tipo', 'Aluno')
        .order('nome', { ascending: true });

      if (error) throw error;

      // Filtra os alunos que já estão matriculados nessa turma
      const enrolledIds = new Set(alunos.map(a => a.alunoId));
      const filtered = (data || []).filter((p: any) => !enrolledIds.has(p.id));
      setAlunosDisponiveis(filtered);
    } catch (err) {
      console.error('Erro ao buscar alunos disponíveis:', err);
    }
  };

  useEffect(() => {
    if (showMatricularModal) {
      loadAlunosDisponiveis();
    }
  }, [showMatricularModal, alunos]);

  const handleStatusChange = async (matriculaId: string, selectValue: string) => {
    let dbStatus = 'ATIVO';
    if (selectValue === 'DESISTENTE') dbStatus = 'CANCELADO';
    if (selectValue === 'TRANCADO') dbStatus = 'TRANCADO';
    if (selectValue === 'CONCLUÍDO') dbStatus = 'CONCLUIDO';

    try {
      const { error } = await supabase
        .from('matriculas')
        .update({ status: dbStatus })
        .eq('id', matriculaId);

      if (error) throw error;

      setAlunos(alunos.map(a => a.id === matriculaId ? { ...a, statusTurma: dbStatus } : a));
    } catch (err) {
      console.error('Erro ao atualizar status da matrícula:', err);
      toast.error('Erro', 'Erro ao atualizar status no banco de dados.');
    }
  };

  const handleMatricular = async (alunoId: string) => {
    try {
      const { error } = await supabase
        .from('matriculas')
        .insert({
          aluno_id: alunoId,
          turma_id: turma.id,
          status: 'ATIVO'
        });

      if (error) throw error;

      setShowMatricularModal(false);
      setSearchTerm('');
      await loadEnrolledStudents();
    } catch (err) {
      console.error('Erro ao matricular aluno:', err);
      toast.error('Erro', 'Erro ao matricular o aluno nesta turma.');
    }
  };

  const handleDesvincular = async (matriculaId: string, name: string) => {
    if (!confirm(`Deseja realmente remover o aluno ${name} desta turma?`)) return;
    try {
      const { error } = await supabase
        .from('matriculas')
        .delete()
        .eq('id', matriculaId);

      if (error) throw error;

      await loadEnrolledStudents();
    } catch (err) {
      console.error('Erro ao desvincular aluno:', err);
      toast.error('Erro', 'Erro ao desvincular o aluno no banco de dados.');
    }
  };

  const handleAction = (type: string, alunoName: string) => {
    setActionModal({ isOpen: true, type, alunoName });
  };

  const alunosFiltrados = alunosDisponiveis.filter(a =>
    a.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (a.cpf_cnpj && a.cpf_cnpj.includes(searchTerm))
  );

  const getDisplayStatus = (dbStatus: string) => {
    const s = (dbStatus || 'ATIVO').toUpperCase();
    if (s === 'ATIVO') return 'ATIVO';
    if (s === 'CANCELADO' || s === 'DESISTENTE') return 'DESISTENTE';
    if (s === 'TRANCADO') return 'TRANCADO';
    if (s === 'CONCLUIDO' || s === 'CONCLUÍDO') return 'CONCLUÍDO';
    return 'ATIVO';
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-20">
        <Loader2 className="animate-spin text-emerald-600" size={32} />
        <span className="text-slate-500 font-bold ml-3">Carregando alunos matriculados...</span>
      </div>
    );
  }

  return (
    <div className="animate-fadeIn">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h3 className="text-lg font-bold text-[#001a33] mb-1">Lista de Alunos</h3>
          <p className="text-slate-500 text-xs">Total de {alunos.length} alunos vinculados.</p>
        </div>
        <button
          onClick={() => setShowMatricularModal(true)}
          className="px-4 py-2 bg-emerald-600 text-white rounded-xl text-xs font-bold uppercase tracking-wider hover:bg-emerald-700 transition-colors flex items-center gap-2 shadow-md"
        >
          <UserPlus size={16} /> Matricular Aluno
        </button>
      </div>

      <div className="bg-white rounded-[2rem] border border-slate-100 shadow-sm overflow-visible">
        {alunos.length === 0 ? (
          <div className="py-20 text-center text-slate-400 flex flex-col items-center">
            <UserX size={48} className="mb-4 opacity-50 text-slate-300" />
            <p className="font-bold text-sm">Nenhum aluno matriculado nesta turma ainda.</p>
            <p className="text-xs text-slate-500 mt-1 max-w-sm">Use o botão "Matricular Aluno" acima para vincular alunos cadastrados no sistema.</p>
          </div>
        ) : (
          <table className="w-full text-left border-collapse">
            <thead className="bg-[#001a33] text-white">
              <tr>
                <th className="px-6 py-4 text-xs font-black uppercase tracking-wider rounded-tl-[2rem]">Aluno</th>
                <th className="px-6 py-4 text-xs font-black uppercase tracking-wider">Matrícula</th>
                <th className="px-6 py-4 text-xs font-black uppercase tracking-wider">Status Turma</th>
                <th className="px-6 py-4 text-xs font-black uppercase tracking-wider">Status Fin.</th>
                <th className="px-6 py-4 text-xs font-black uppercase tracking-wider">Frequência</th>
                <th className="px-6 py-4 text-xs font-black uppercase tracking-wider text-right rounded-tr-[2rem]">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {alunos.map((aluno) => {
                const currentDisplayStatus = getDisplayStatus(aluno.statusTurma);
                return (
                  <tr key={aluno.id} className="hover:bg-slate-50 transition-colors group">
                    <td className="px-6 py-5">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-sm font-black text-slate-500 border border-slate-200">
                          {aluno.nome.charAt(0)}
                        </div>
                        <div>
                          <span className="font-bold text-[#001a33] text-sm block">{aluno.nome}</span>
                          <span className="text-[10px] text-slate-500 font-medium">CPF: {aluno.cpf} • Nasc: {aluno.dataNasc}</span>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-5 text-sm text-slate-500 font-mono">{aluno.matricula}</td>
                    <td className="px-6 py-5">
                      <select
                        value={currentDisplayStatus}
                        onChange={(e) => handleStatusChange(aluno.id, e.target.value)}
                        className={`text-[10px] font-bold uppercase px-2 py-1.5 rounded-lg outline-none cursor-pointer transition-colors border-none ${
                          currentDisplayStatus === 'ATIVO' ? 'bg-emerald-100 text-emerald-700' :
                          currentDisplayStatus === 'DESISTENTE' ? 'bg-red-100 text-red-700' :
                          currentDisplayStatus === 'TRANCADO' ? 'bg-amber-100 text-amber-700' :
                          'bg-blue-100 text-blue-700'
                        }`}
                      >
                        <option value="ATIVO" className="bg-white text-slate-700">Ativo</option>
                        <option value="DESISTENTE" className="bg-white text-slate-700">Desistente</option>
                        <option value="TRANCADO" className="bg-white text-slate-700">Trancado</option>
                        <option value="CONCLUÍDO" className="bg-white text-slate-700">Concluído</option>
                      </select>
                    </td>
                    <td className="px-6 py-5">
                      <span className={`px-2 py-1 rounded-md text-[10px] font-bold uppercase ${
                        aluno.statusFinanceiro === 'REGULAR'
                          ? 'bg-emerald-50 text-emerald-600'
                          : 'bg-rose-50 text-rose-600'
                      }`}>
                        {aluno.statusFinanceiro}
                      </span>
                    </td>
                    <td className="px-6 py-5 text-sm font-bold text-slate-700">{aluno.frequencia}%</td>
                    <td className="px-6 py-5 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button onClick={() => handleAction('Financeiro', aluno.nome)} title="Financeiro" className="p-2 hover:bg-emerald-50 text-slate-400 hover:text-emerald-600 rounded-lg transition-colors">
                          <DollarSign size={16} />
                        </button>
                        <button onClick={() => handleAction('Documentos', aluno.nome)} title="Documentos" className="p-2 hover:bg-blue-50 text-slate-400 hover:text-blue-600 rounded-lg transition-colors">
                          <FileText size={16} />
                        </button>
                        <button onClick={() => handleDesvincular(aluno.id, aluno.nome)} title="Remover Matrícula" className="p-2 hover:bg-rose-50 text-slate-400 hover:text-rose-600 rounded-lg transition-colors">
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {actionModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white rounded-3xl p-6 max-w-sm w-full shadow-2xl relative text-center">
            <button
              type="button"
              onClick={() => setActionModal({ isOpen: false, type: '', alunoName: '' })}
              className="absolute top-4 right-4 p-2 rounded-full text-slate-400 hover:bg-slate-100 transition-colors"
            >
              <X size={20} />
            </button>
            <div className="w-16 h-16 bg-blue-50 text-blue-500 rounded-full flex items-center justify-center mx-auto mb-4">
              {actionModal.type === 'Financeiro' && <DollarSign size={32} />}
              {actionModal.type === 'Documentos' && <FileText size={32} />}
            </div>
            <h3 className="text-lg font-black text-[#001a33] mb-1">Módulo {actionModal.type}</h3>
            <p className="text-slate-500 text-sm mb-6">Acessando informações de <strong className="text-slate-700">{actionModal.alunoName}</strong>. Esta funcionalidade será implementada no backend.</p>
            <button
              onClick={() => setActionModal({ isOpen: false, type: '', alunoName: '' })}
              className="w-full py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl uppercase tracking-wider text-xs transition-colors"
            >
              Fechar
            </button>
          </div>
        </div>
      )}

      {/* Modal Matricular Aluno (Quick Search) */}
      {showMatricularModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white rounded-[2rem] w-full max-w-2xl shadow-2xl relative overflow-hidden flex flex-col max-h-[80vh]">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-emerald-100 text-emerald-600 flex items-center justify-center rounded-xl">
                  <UserPlus size={20} />
                </div>
                <div>
                  <h3 className="font-black text-[#001a33] text-lg uppercase tracking-tight">Vincular Aluno à Turma</h3>
                  <p className="text-xs font-medium text-slate-500">Pesquise alunos cadastrados no sistema.</p>
                </div>
              </div>
              <button
                onClick={() => setShowMatricularModal(false)}
                className="p-2 text-slate-400 hover:bg-slate-200 hover:text-rose-500 rounded-full transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-6 border-b border-slate-100">
              <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  autoFocus
                  placeholder="Pesquisar por nome ou CPF..."
                  className="w-full pl-12 pr-4 py-4 bg-slate-50 border border-slate-200 rounded-xl text-slate-700 font-medium focus:border-emerald-500 outline-none transition-all placeholder:text-slate-400"
                />
              </div>
            </div>

            <div className="overflow-y-auto p-4 flex-1">
              {alunosFiltrados.length === 0 ? (
                <div className="py-12 text-center text-slate-400 flex flex-col items-center">
                  <UserX size={48} className="mb-4 opacity-50 text-slate-300" />
                  <p className="font-bold text-sm">
                    {alunosDisponiveis.length === 0 
                      ? 'Nenhum aluno cadastrado no sistema.' 
                      : 'Nenhum aluno correspondente encontrado.'}
                  </p>
                  <p className="text-xs text-slate-500 mt-1 max-w-sm">
                    {alunosDisponiveis.length === 0
                      ? 'Por favor, cadastre primeiro os alunos no módulo de Parceiros antes de vinculá-los a esta turma.'
                      : 'Verifique se digitou o nome ou CPF corretamente.'}
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {alunosFiltrados.map(aluno => (
                    <div key={aluno.id} className="p-4 border border-slate-100 rounded-2xl flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center hover:border-emerald-200 hover:shadow-md transition-all group">
                      <div>
                        <h4 className="font-bold text-[#001a33]">{aluno.nome}</h4>
                        <span className="text-xs font-mono text-slate-500 mt-1 block">CPF: {aluno.cpf_cnpj || '—'}</span>
                      </div>
                      <button
                        onClick={() => handleMatricular(aluno.id)}
                        className="px-4 py-2 bg-slate-100 text-slate-600 hover:bg-emerald-500 hover:text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-colors shrink-0"
                      >
                        Vincular à Turma
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      <ToastNotification toasts={toasts} onRemove={removeToast} />
    </div>
  );
};

export default TurmaAlunos;
