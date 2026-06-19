// File: modules/gestor/secretaria/boletins/SecretariaBoletinsPage.tsx

import React, { useState, useEffect } from 'react';
import { ScrollText, Users, Search, Printer, Download } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../../../lib/supabase';

const SecretariaBoletinsPage: React.FC = () => {
  const [mode, setMode] = useState<'individual' | 'lote'>('individual');

  // Estado para busca individual
  const [individualSearch, setIndividualSearch] = useState('');
  const [selectedIndividualAluno, setSelectedIndividualAluno] = useState<any | null>(null);

  // Estados para seleção em lote
  const [selectedCursoId, setSelectedCursoId] = useState<string>('');
  const [selectedTurmaId, setSelectedTurmaId] = useState<string>('');

  // 1. Busca de alunos no modo individual
  const { data: searchResults = [], isLoading: isSearching } = useQuery({
    queryKey: ['boletins-individual-search', individualSearch],
    queryFn: async () => {
      if (!individualSearch) return [];
      const { data, error } = await supabase
        .from('parceiros')
        .select('*')
        .eq('tipo', 'Aluno')
        .or(`nome.ilike.%${individualSearch}%,cpf_cnpj.ilike.%${individualSearch}%`)
        .order('nome', { ascending: true });
      if (error) {
        console.error('Erro ao buscar alunos para boletim:', error);
        throw error;
      }
      return data || [];
    },
    enabled: individualSearch.length >= 2,
    refetchOnWindowFocus: false,
  });

  // 2. Busca de turmas/matrículas do aluno selecionado individualmente
  const { data: individualMatriculas = [] } = useQuery({
    queryKey: ['boletins-individual-matriculas', selectedIndividualAluno?.id],
    queryFn: async () => {
      if (!selectedIndividualAluno?.id) return [];
      const { data, error } = await supabase
        .from('matriculas')
        .select('*, turmas(*, cursos(*))')
        .eq('aluno_id', selectedIndividualAluno.id);
      if (error) {
        console.error('Erro ao buscar matrículas do aluno:', error);
        throw error;
      }
      return data || [];
    },
    enabled: !!selectedIndividualAluno?.id,
  });

  // 3. Cursos ativos para a seleção em lote
  const { data: cursos = [] } = useQuery({
    queryKey: ['boletins-cursos'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cursos')
        .select('*')
        .eq('status', 'ativo')
        .order('nome', { ascending: true });
      if (error) {
        console.error('Erro ao buscar cursos para lote:', error);
        throw error;
      }
      return data || [];
    }
  });

  // Atualiza automaticamente o curso selecionado quando a lista carregar
  useEffect(() => {
    if (cursos.length > 0 && !selectedCursoId) {
      setSelectedCursoId(cursos[0].id);
    }
  }, [cursos, selectedCursoId]);

  // 4. Turmas em andamento para o curso selecionado
  const { data: turmas = [] } = useQuery({
    queryKey: ['boletins-turmas', selectedCursoId],
    queryFn: async () => {
      if (!selectedCursoId) return [];
      const { data, error } = await supabase
        .from('turmas')
        .select('*')
        .eq('curso_id', selectedCursoId)
        .eq('status', 'EM_ANDAMENTO')
        .order('nome', { ascending: true });
      if (error) {
        console.error('Erro ao buscar turmas do curso:', error);
        throw error;
      }
      return data || [];
    },
    enabled: !!selectedCursoId,
  });

  // Atualiza automaticamente a turma selecionada quando a lista carregar
  useEffect(() => {
    if (turmas.length > 0) {
      setSelectedTurmaId(turmas[0].id);
    } else {
      setSelectedTurmaId('');
    }
  }, [turmas]);

  // 5. Contagem exata de matrículas ativas na turma selecionada
  const { data: matriculasCount = 0 } = useQuery({
    queryKey: ['boletins-matriculas-count', selectedTurmaId],
    queryFn: async () => {
      if (!selectedTurmaId) return 0;
      const { count, error } = await supabase
        .from('matriculas')
        .select('*', { count: 'exact', head: true })
        .eq('turma_id', selectedTurmaId)
        .eq('status', 'ATIVO');
      if (error) {
        console.error('Erro ao contar matrículas da turma:', error);
        throw error;
      }
      return count || 0;
    },
    enabled: !!selectedTurmaId,
  });

  const handleSelectIndividualAluno = (aluno: any) => {
    setSelectedIndividualAluno(aluno);
  };

  return (
    <div className="animate-fadeIn">
      <div className="flex justify-center mb-8">
        <div className="bg-white p-1 rounded-2xl border border-slate-200 shadow-sm inline-flex">
            <button
                onClick={() => { setMode('individual'); setSelectedIndividualAluno(null); setIndividualSearch(''); }}
                className={`px-6 py-3 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center gap-2 transition-all ${mode === 'individual' ? 'bg-[#001a33] text-white shadow-md' : 'text-slate-500 hover:bg-slate-50'}`}
            >
                <Search size={16} /> Individual (Por Aluno)
            </button>
            <button
                onClick={() => setMode('lote')}
                className={`px-6 py-3 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center gap-2 transition-all ${mode === 'lote' ? 'bg-[#001a33] text-white shadow-md' : 'text-slate-500 hover:bg-slate-50'}`}
            >
                <Users size={16} /> Em Lote (Por Turma)
            </button>
        </div>
      </div>

      <div className="max-w-4xl mx-auto bg-white p-10 rounded-[2.5rem] border border-slate-100 shadow-xl">
        
        {mode === 'individual' ? (
            <div className="animate-fadeIn">
                <h3 className="text-xl font-black text-[#001a33] mb-6 uppercase tracking-tight">Boletim Individual</h3>
                
                <div className="relative mb-6">
                    <input 
                        type="text" 
                        placeholder="Buscar aluno por nome, CPF..."
                        className="w-full pl-6 pr-14 py-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:border-blue-500 transition-all text-slate-700"
                        value={individualSearch}
                        onChange={(e) => setIndividualSearch(e.target.value)}
                    />
                    <div className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400">
                        <Search size={20} />
                    </div>
                </div>

                {individualSearch && individualSearch.length >= 2 && !selectedIndividualAluno && (
                    <div className="space-y-2 max-h-60 overflow-y-auto mb-6">
                        {isSearching ? (
                            <div className="text-center py-4 text-slate-400 text-sm">Buscando...</div>
                        ) : searchResults.length > 0 ? (
                            searchResults.map((aluno: any) => (
                                <div 
                                    key={aluno.id}
                                    onClick={() => handleSelectIndividualAluno(aluno)}
                                    className="p-3 bg-slate-50 border border-slate-200 hover:border-blue-300 rounded-xl cursor-pointer transition-all flex justify-between items-center"
                                >
                                    <div>
                                        <p className="font-bold text-slate-800 text-sm">{aluno.nome}</p>
                                        <p className="text-xs text-slate-500">CPF: {aluno.cpf_cnpj || 'Não informado'}</p>
                                    </div>
                                    <span className="text-[10px] bg-blue-100 text-blue-800 px-2 py-1 rounded font-bold uppercase">Selecionar</span>
                                </div>
                            ))
                        ) : (
                            <div className="text-center py-4 text-slate-400 text-sm">Nenhum aluno encontrado.</div>
                        )}
                    </div>
                )}
                
                {selectedIndividualAluno && (
                    <div className="space-y-4">
                        <div className="border border-slate-100 rounded-2xl p-6 bg-slate-50 flex items-center justify-between">
                            <div>
                                <p className="font-bold text-[#001a33]">{selectedIndividualAluno.nome}</p>
                                <p className="text-xs text-slate-500">
                                    CPF: {selectedIndividualAluno.cpf_cnpj || 'Não informado'} • Contato: {selectedIndividualAluno.telefone || 'Não informado'}
                                </p>
                            </div>
                            <button 
                                onClick={() => setSelectedIndividualAluno(null)}
                                className="px-3 py-1 text-xs border border-slate-300 rounded-lg text-slate-500 hover:text-red-500 transition-colors"
                            >
                                Limpar
                            </button>
                        </div>

                        {individualMatriculas.length > 0 ? (
                            <div className="space-y-3 pt-2">
                                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Matrículas e Cursos</p>
                                {individualMatriculas.map((m: any) => (
                                    <div key={m.id} className="p-4 bg-white border border-slate-200 rounded-2xl flex justify-between items-center shadow-sm">
                                        <div>
                                            <p className="font-bold text-[#001a33] text-sm">{m.turmas?.cursos?.nome || 'Curso'}</p>
                                            <p className="text-xs text-slate-500">Turma: {m.turmas?.nome || 'Turma Sem Nome'}</p>
                                        </div>
                                        <button className="flex items-center gap-2 px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold uppercase text-[#001a33] hover:bg-slate-100 transition-all shadow-sm">
                                            <Printer size={16} /> Gerar Boletim
                                        </button>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="text-center py-6 text-slate-400 border border-slate-200 rounded-xl">
                                Nenhuma matrícula registrada para este aluno no momento.
                            </div>
                        )}
                    </div>
                )}
            </div>
        ) : (
            <div className="animate-fadeIn">
                <h3 className="text-xl font-black text-[#001a33] mb-6 uppercase tracking-tight">Boletim em Lote</h3>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Curso</label>
                        <select 
                          className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:border-blue-500 cursor-pointer text-sm font-medium text-slate-700"
                          value={selectedCursoId}
                          onChange={(e) => setSelectedCursoId(e.target.value)}
                        >
                            {cursos.map((c: any) => (
                                <option key={c.id} value={c.id}>{c.nome}</option>
                            ))}
                            {cursos.length === 0 && (
                                <option value="">Nenhum curso cadastrado</option>
                            )}
                        </select>
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Turma / Período</label>
                        <select 
                          className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:border-blue-500 cursor-pointer text-sm font-medium text-slate-700"
                          value={selectedTurmaId}
                          onChange={(e) => setSelectedTurmaId(e.target.value)}
                          disabled={!selectedCursoId}
                        >
                            {turmas.map((t: any) => (
                                <option key={t.id} value={t.id}>{t.nome} ({t.turno})</option>
                            ))}
                            {turmas.length === 0 && (
                                <option value="">Nenhuma turma ativa</option>
                            )}
                        </select>
                    </div>
                </div>

                <div className="bg-indigo-50 p-6 rounded-2xl border border-indigo-100 mb-8">
                    <div className="flex items-center gap-3 mb-2">
                        <Users size={20} className="text-[#001a33]" />
                        <span className="font-bold text-[#001a33]">{matriculasCount} {matriculasCount === 1 ? 'Aluno Encontrado' : 'Alunos Encontrados'}</span>
                    </div>
                    <p className="text-xs text-indigo-700">Ao confirmar, um arquivo PDF único contendo todos os boletins será gerado.</p>
                </div>

                <button 
                  disabled={!selectedTurmaId || matriculasCount === 0}
                  className="w-full py-4 bg-[#001a33] disabled:bg-slate-300 disabled:shadow-none text-white rounded-2xl font-black uppercase tracking-widest hover:bg-blue-900 transition-all shadow-xl shadow-blue-900/20 flex items-center justify-center gap-3"
                >
                    <Download size={20} /> Baixar Arquivo Unificado
                </button>
            </div>
        )}

      </div>
    </div>
  );
};

export default SecretariaBoletinsPage;
