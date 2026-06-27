// File: modules/gestor/gestao/tecnicos/detalhes/components/TurmaEstagio.tsx

import React, { useState, useEffect } from 'react';
import { Turma } from '../../../gestao.types';
import { 
  Activity, BookOpen, User, ClipboardCheck, Calendar, 
  FileText, CheckCircle2, ChevronRight, Loader2, Save, Printer, ArrowLeft
} from 'lucide-react';
import ToastNotification, { useToast } from '../../../../parceiros/components/shared/ToastNotification';
import {
  useAvaliacaoEstagioCalculada,
  useSaveEstagioEvaluationMutation,
  useTurmaEstagioAvaliacoes,
  useTurmaEstagioData,
} from '../hooks/useTurmaEstagio';
import { turmaEstagioService } from '../turma-estagio.service';
import {
  EstagioCriteriosValores,
  EstagioProcedimentosLog,
  ProcedimentoStatus,
} from '../turma-estagio.types';

interface TurmaEstagioProps {
  turma: Turma;
  disciplinaIdRestrita?: string;
}

const TurmaEstagio: React.FC<TurmaEstagioProps> = ({ turma, disciplinaIdRestrita }) => {
  const { toasts, removeToast, toast } = useToast();
  const [loadingConfig, setLoadingConfig] = useState(false);

  // Dados da turma e curso
  const [selectedDiscId, setSelectedDiscId] = useState<string>('');
  const { data: estagioData, isLoading: loading } = useTurmaEstagioData(turma.id, turma.cursoId);
  const disciplinasEstagio = estagioData?.disciplinasEstagio || [];
  const disciplinasEstagioDisponiveis = disciplinaIdRestrita
    ? disciplinasEstagio.filter((disciplina: any) => disciplina.id === disciplinaIdRestrita)
    : disciplinasEstagio;
  const alunos = estagioData?.alunos || [];
  const { data: avaliacoesExistentes = {} } = useTurmaEstagioAvaliacoes(turma.id, selectedDiscId);
  
  // Aluno sendo avaliado atualmente
  const [selectedAluno, setSelectedAluno] = useState<any | null>(null);

  // Configurações de estágio carregadas
  const [instrumentosConfig, setInstrumentosConfig] = useState<any[]>([]);
  const [checklistUcsConfig, setChecklistUcsConfig] = useState<any[]>([]);

  // Estados do Formulário de Avaliação do Aluno
  const [criteriosValores, setCriteriosValores] = useState<EstagioCriteriosValores>({});
  const [procedimentosLog, setProcedimentosLog] = useState<EstagioProcedimentosLog>({});
  const [perfilAluno, setPerfilAluno] = useState<string>('');
  const [instrutorNome, setInstrutorNome] = useState<string>('');
  const [dataAvaliacao, setDataAvaliacao] = useState<string>(new Date().toISOString().split('T')[0]);
  const [frequenciaEstagio, setFrequenciaEstagio] = useState<number>(100);

  const { data: avaliacaoCalculada } = useAvaliacaoEstagioCalculada(
    criteriosValores,
    !!selectedAluno && !loadingConfig,
  );
  const saveEvaluationMutation = useSaveEstagioEvaluationMutation(turma.id, selectedDiscId);
  const saving = saveEvaluationMutation.isPending;

  useEffect(() => {
    if (!selectedDiscId && disciplinasEstagioDisponiveis[0]?.id) {
      setSelectedDiscId(disciplinasEstagioDisponiveis[0].id);
    }
  }, [disciplinasEstagioDisponiveis, selectedDiscId]);

  const startEvaluation = async (aluno: any) => {
    setSelectedAluno(aluno);
    setLoadingConfig(true);
    try {
      const draft = await turmaEstagioService.buildEvaluationDraft(turma.cursoId, avaliacoesExistentes[aluno.id]);
      setInstrumentosConfig(draft.instrumentosConfig);
      setChecklistUcsConfig(draft.checklistUcsConfig);
      setPerfilAluno(draft.perfilAluno);
      setInstrutorNome(draft.instrutorNome);
      setDataAvaliacao(draft.dataAvaliacao);
      setFrequenciaEstagio(draft.frequenciaEstagio);
      setCriteriosValores(draft.criteriosValores);
      setProcedimentosLog(draft.procedimentosLog);
    } catch (err) {
      console.error(err);
      toast.error('Erro', 'Erro ao carregar a ficha de estágio do aluno.');
    } finally {
      setLoadingConfig(false);
    }
  };

  const getSubtotal = (grupoNome: string): number => {
    if (grupoNome === 'Comportamento') return Number(avaliacaoCalculada?.comportamento || 0);
    if (grupoNome === 'Desempenho nos Registros') return Number(avaliacaoCalculada?.registros || 0);
    if (grupoNome === 'Desempenho das Técnicas') return Number(avaliacaoCalculada?.tecnicas || 0);
    return 0;
  };

  const handleCriterioObsChange = (grupoNome: string, itemNome: string, obs: string) => {
    setCriteriosValores(prev => {
      const g = prev[grupoNome] || {};
      return {
        ...prev,
        [grupoNome]: {
          ...g,
          [itemNome]: {
            ...(g[itemNome] || { nota: 0 }),
            obs
          }
        }
      };
    });
  };

  const handleCriterioNotaChange = (grupoNome: string, itemNome: string, nota: number) => {
    setCriteriosValores(prev => {
      const g = prev[grupoNome] || {};
      return {
        ...prev,
        [grupoNome]: {
          ...g,
          [itemNome]: {
            ...(g[itemNome] || { obs: '' }),
            nota: isNaN(nota) ? 0 : nota
          }
        }
      };
    });
  };

  const handleProcedureStatus = (atividade: string, status: ProcedimentoStatus) => {
    setProcedimentosLog(prev => {
      const current = prev[atividade] || { status: '', data: '' };
      return {
        ...prev,
        [atividade]: {
          ...current,
          status,
          data: status === '' ? '' : current.data || new Date().toISOString().split('T')[0]
        }
      };
    });
  };

  const handleProcedureDate = (atividade: string, data: string) => {
    setProcedimentosLog(prev => {
      const current = prev[atividade] || { status: '', data: '' };
      return {
        ...prev,
        [atividade]: {
          ...current,
          data
        }
      };
    });
  };

  // --- SALVAR NO BANCO ---
  const handleSaveEvaluation = async () => {
    if (!selectedAluno || !selectedDiscId) return;
    try {
      const currentDisc = disciplinasEstagioDisponiveis.find(d => d.id === selectedDiscId);
      const currentDiscName = currentDisc?.nome || '';

      await saveEvaluationMutation.mutateAsync({
        turmaId: turma.id,
        disciplinaId: selectedDiscId,
        alunoId: selectedAluno.id,
        frequencia: frequenciaEstagio,
        criterios: criteriosValores,
        procedimentosLog,
        perfilAluno,
        instrutorNome,
        dataAvaliacao,
      });

      toast.success('Sucesso', `Avaliação de ${selectedAluno.nome} em ${currentDiscName} salva com sucesso!`);
      setSelectedAluno(null);
    } catch (err) {
      console.error(err);
      toast.error('Erro', 'Não foi possível salvar a avaliação do estágio.');
    }
  };

  // --- IMPRESSÃO DA FICHA ---
  const handlePrint = () => {
    window.print();
  };

  // Encontra a lista de procedimentos configurada para a UC selecionada
  const currentDiscObj = disciplinasEstagioDisponiveis.find(d => d.id === selectedDiscId);
  const ucConfig = checklistUcsConfig.find(u => u.uc.toLowerCase().trim() === currentDiscObj?.nome.toLowerCase().trim()) || { uc: currentDiscObj?.nome || '', atividades: [] };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-20 bg-white rounded-[2rem] border border-slate-100">
        <Loader2 className="animate-spin text-teal-600" size={32} />
        <span className="text-slate-500 font-bold ml-3">Carregando módulo de estágio...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ---------------- AVISO PARA PRINT CSS (IMPRESSÃO DA FICHA) ---------------- */}
      {selectedAluno && (
        <div id="print-area" className="hidden print:block bg-white text-black p-4 text-[12px] font-sans">
          <style>{`
            @media print {
              body * {
                visibility: hidden;
              }
              #print-area, #print-area * {
                visibility: visible;
              }
              #print-area {
                position: absolute;
                left: 0;
                top: 0;
                width: 100%;
              }
              .no-print { display: none !important; }
              table { width: 100%; border-collapse: collapse; margin-top: 10px; margin-bottom: 10px; }
              th, td { border: 1px solid black; padding: 6px; text-align: left; font-size: 11px; }
              th { background-color: #f2f2f2 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
              .section-title { font-weight: bold; text-transform: uppercase; background-color: #e6e6e6 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
              .header-logo { text-align: center; font-weight: 900; font-size: 15px; border-bottom: 2px solid black; padding-bottom: 10px; margin-bottom: 15px; }
            }
          `}</style>
          
          <div className="header-logo">
            UNIVERSO CURSOS E CONSULTORIA<br/>
            <span className="text-sm font-bold">CURSO PROFISSIONALIZANTE TÉCNICO EM ENFERMAGEM</span><br/>
            <span className="text-xs uppercase font-medium">Instrumentos Avaliativos para Estágio Supervisionado</span>
          </div>

          <div className="grid grid-cols-2 gap-4 mb-4 border border-black p-3 rounded bg-slate-50">
            <div>
              <p><strong>Aluno(a):</strong> {selectedAluno.nome}</p>
              <p><strong>Turma / Código:</strong> {turma.nome} ({turma.codigo})</p>
              <p><strong>Unidade Curricular:</strong> {currentDiscObj?.nome}</p>
            </div>
            <div>
              <p><strong>Instrutor(a) / Supervisor(a):</strong> {instrutorNome || '_____________________________________'}</p>
              <p><strong>Data de Avaliação:</strong> {dataAvaliacao ? new Date(dataAvaliacao + 'T12:00:00').toLocaleDateString('pt-BR') : '__/__/____'}</p>
              <p><strong>Frequência no Estágio:</strong> {frequenciaEstagio}%</p>
            </div>
          </div>

          <h3 className="font-bold text-sm uppercase border-b border-black pb-1 mb-2">Critérios de Avaliação Acadêmica</h3>
          
          {instrumentosConfig.map((grupo, gIdx) => (
            <div key={gIdx} className="mb-4">
              <table className="min-w-full">
                <thead>
                  <tr className="section-title">
                    <th style={{ width: '8%' }}>Item</th>
                    <th style={{ width: '50%' }}>{grupo.grupo} (Máx: {grupo.valorMax} pts)</th>
                    <th style={{ width: '30%' }}>Observações</th>
                    <th style={{ width: '12%' }}>Nota</th>
                  </tr>
                </thead>
                <tbody>
                  {grupo.itens.map((item: string, iIdx: number) => {
                    const savedItem = criteriosValores[grupo.grupo]?.[item] || { nota: 0, obs: '' };
                    return (
                      <tr key={iIdx}>
                        <td className="text-center font-mono">{String(iIdx + 1).padStart(2, '0')}</td>
                        <td>{item}</td>
                        <td>{savedItem.obs || '—'}</td>
                        <td className="text-center font-bold">{savedItem.nota.toFixed(2)}</td>
                      </tr>
                    );
                  })}
                  <tr className="bg-slate-100 font-bold">
                    <td colSpan={3} className="text-right uppercase">Subtotal {grupo.grupo}:</td>
                    <td className="text-center">{getSubtotal(grupo.grupo).toFixed(2)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          ))}

          <div className="flex justify-end gap-4 p-3 border border-black rounded mb-6 bg-slate-50">
            <span className="font-black text-sm uppercase">Nota Final de Estágio (E):</span>
            <span className="font-black text-sm text-emerald-700">{Number(avaliacaoCalculada?.final || 0).toFixed(2)} / 10.00</span>
          </div>

          {ucConfig.atividades.length > 0 && (
            <>
              <h3 className="font-bold text-sm uppercase border-b border-black pb-1 mb-2">Checklist de Competências / Procedimentos Práticos</h3>
              <table className="min-w-full">
                <thead>
                  <tr className="section-title">
                    <th style={{ width: '60%' }}>Procedimento / Atividade Realizada</th>
                    <th style={{ width: '15%' }} className="text-center">Participação</th>
                    <th style={{ width: '25%' }} className="text-center">Data Realização</th>
                  </tr>
                </thead>
                <tbody>
                  {ucConfig.atividades.map((atividade: string, aIdx: number) => {
                    const statusVal = procedimentosLog[atividade]?.status || '';
                    const dateVal = procedimentosLog[atividade]?.data || '';
                    
                    let statusLabel = 'Não Realizado';
                    if (statusVal === 'A') statusLabel = 'Ajudou (A)';
                    if (statusVal === 'E') statusLabel = 'Executou (E)';
                    if (statusVal === 'O') statusLabel = 'Observou (O)';

                    return (
                      <tr key={aIdx}>
                        <td>{atividade}</td>
                        <td className="text-center font-bold text-xs">{statusLabel}</td>
                        <td className="text-center">{dateVal ? new Date(dateVal + 'T12:00:00').toLocaleDateString('pt-BR') : '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <p className="text-[10px] italic text-slate-500 mb-4">Legenda de Participação: A - Ajudou; E - Executou; O - Observou</p>
            </>
          )}

          <div className="mb-6">
            <h4 className="font-bold text-xs uppercase mb-1">Perfil do Aluno (a) / Comentários Qualitativos:</h4>
            <div className="border border-black p-3 rounded min-h-[80px] bg-slate-50 text-xs">
              {perfilAluno || 'Nenhuma observação cadastrada.'}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-6 pt-8 mt-12 text-center text-xs font-bold no-print">
            <div className="border-t border-black pt-2">
              <p>{selectedAluno.nome}</p>
              <p className="font-normal text-slate-500">Assinatura do(a) Aluno(a)</p>
            </div>
            <div className="border-t border-black pt-2">
              <p>{instrutorNome || '___________________________'}</p>
              <p className="font-normal text-slate-500">Assinatura e Carimbo do Instrutor(a)</p>
            </div>
            <div className="border-t border-black pt-2">
              <p>___________________________</p>
              <p className="font-normal text-slate-500">Assinatura do(a) Coordenador(a)</p>
            </div>
          </div>
        </div>
      )}

      {/* ---------------- VIEW NORMAL DO REACT (INTERACTIVE UI) ---------------- */}
      {!selectedAluno ? (
        <div className="bg-white p-6 md:p-8 rounded-[2rem] shadow-sm border border-slate-100 animate-fadeIn">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8 border-b border-slate-100 pb-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-teal-50 text-teal-600 rounded-2xl">
                <Activity size={32} />
              </div>
              <div>
                <h3 className="text-xl font-black text-[#001a33] uppercase tracking-tight">Estágio Supervisionado</h3>
                <p className="text-slate-500 text-xs font-medium">Lance avaliações, controle checklists de técnicas e gere fichas em PDF.</p>
              </div>
            </div>

            {disciplinasEstagioDisponiveis.length > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider shrink-0">Unidade:</span>
                <select
                  value={selectedDiscId}
                  onChange={(e) => setSelectedDiscId(e.target.value)}
                  className="text-xs font-bold bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-teal-500 px-3.5 py-3 transition-colors text-slate-700 shadow-sm"
                >
                  {disciplinasEstagioDisponiveis.map(d => (
                    <option key={d.id} value={d.id}>{d.nome} ({d.cargaHorariaEstagio}h estágio)</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {disciplinasEstagioDisponiveis.length === 0 ? (
            <div className="text-center py-20 bg-slate-50 rounded-3xl border border-dashed border-slate-200">
              <BookOpen className="text-slate-300 mx-auto mb-4" size={48} />
              <h4 className="font-bold text-slate-500">Nenhuma disciplina com estágio</h4>
              <p className="text-xs text-slate-400 max-w-sm mx-auto mt-2">
                Para utilizar este módulo, acesse a grade curricular deste curso nos cadastros e configure horas de estágio (E) em pelo menos uma disciplina.
              </p>
            </div>
          ) : (
            <div className="bg-white border border-slate-100 rounded-[2rem] overflow-hidden shadow-sm">
              <table className="w-full text-left border-collapse">
                <thead className="bg-[#001a33] text-white">
                  <tr>
                    <th className="px-6 py-4 text-xs font-black uppercase tracking-wider rounded-tl-[2rem]">Aluno</th>
                    <th className="px-6 py-4 text-xs font-black uppercase tracking-wider">Status Ficha</th>
                    <th className="px-6 py-4 text-xs font-black uppercase tracking-wider">Frequência</th>
                    <th className="px-6 py-4 text-xs font-black uppercase tracking-wider">Nota Estágio</th>
                    <th className="px-6 py-4 text-xs font-black uppercase tracking-wider text-right rounded-tr-[2rem]">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {alunos.map(aluno => {
                    const av = avaliacoesExistentes[aluno.id];
                    const isEvaluated = !!av;
                    const notaFinal = Number(av?.nota_final || 0);
                    
                    return (
                      <tr key={aluno.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-6 py-5">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-full bg-teal-50 text-teal-600 flex items-center justify-center text-xs font-black border border-teal-100">
                              {aluno.nome.charAt(0)}
                            </div>
                            <div>
                              <span className="font-bold text-[#001a33] text-sm block">{aluno.nome}</span>
                              <span className="text-[10px] text-slate-500 font-medium">CPF: {aluno.cpf || '—'}</span>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-5">
                          <span className={`text-[10px] font-bold px-2.5 py-1 rounded-lg ${
                            isEvaluated 
                              ? 'bg-teal-50 border border-teal-100 text-teal-700' 
                              : 'bg-slate-50 border border-slate-200 text-slate-500'
                          }`}>
                            {isEvaluated ? 'AVALIADO' : 'PENDENTE'}
                          </span>
                        </td>
                        <td className="px-6 py-5 text-xs font-bold text-slate-600">
                          {isEvaluated ? `${av.frequencia_estagio}%` : '—'}
                        </td>
                        <td className="px-6 py-5">
                          {isEvaluated ? (
                            <span className="text-sm font-black text-teal-700">
                              {notaFinal.toFixed(1)} / 10.0
                            </span>
                          ) : (
                            <span className="text-xs text-slate-400 italic font-semibold">Pendente</span>
                          )}
                        </td>
                        <td className="px-6 py-5 text-right">
                          <button
                            onClick={() => startEvaluation(aluno)}
                            className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-colors ${
                              isEvaluated 
                                ? 'bg-slate-100 hover:bg-[#001a33] text-slate-600 hover:text-white' 
                                : 'bg-teal-600 hover:bg-teal-700 text-white shadow-sm'
                            }`}
                          >
                            {isEvaluated ? 'Editar Ficha' : 'Avaliar Estágio'}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        /* Painel do Aluno Sendo Avaliado (Ficha Aberta) */
        <div className="bg-white p-6 md:p-8 rounded-[2rem] border border-slate-100 shadow-sm space-y-8 animate-fadeIn">
          {/* Header Ficha */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-6">
            <div className="flex items-center gap-4">
              <button 
                onClick={() => setSelectedAluno(null)}
                className="p-2 rounded-xl border border-slate-200 text-slate-400 hover:text-teal-600 hover:border-teal-200 transition-colors bg-slate-50"
              >
                <ArrowLeft size={20} />
              </button>
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="bg-teal-50 border border-teal-100 text-teal-700 px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-widest">
                    Avaliando Estágio
                  </span>
                  <span className="bg-slate-100 text-slate-500 px-2 py-0.5 rounded text-[9px] font-bold">
                    {currentDiscObj?.nome}
                  </span>
                </div>
                <h3 className="text-xl font-black text-[#001a33] uppercase tracking-tight">{selectedAluno.nome}</h3>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              {avaliacoesExistentes[selectedAluno.id] && (
                <button
                  onClick={handlePrint}
                  className="px-5 py-3 border border-slate-200 text-slate-600 rounded-xl font-bold uppercase text-xs tracking-wider flex items-center justify-center gap-2 hover:bg-slate-50 transition-colors"
                >
                  <Printer size={16} /> Imprimir PDF
                </button>
              )}
              <button
                onClick={handleSaveEvaluation}
                disabled={saving || loadingConfig}
                className="px-6 py-3 bg-[#001a33] text-white rounded-xl font-bold uppercase text-xs tracking-wider flex items-center justify-center gap-2 hover:bg-blue-900 transition-colors disabled:opacity-70"
              >
                <Save size={16} /> {saving ? 'Salvando...' : 'Salvar Ficha'}
              </button>
            </div>
          </div>

          {loadingConfig ? (
            <div className="flex justify-center items-center py-20">
              <Loader2 className="animate-spin text-teal-600" size={32} />
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              
              {/* Lado Esquerdo: Instrumentos Avaliativos (Comportamento, Registro, Tecnicas) */}
              <div className="lg:col-span-2 space-y-6">
                <div className="flex items-center gap-2 mb-2">
                  <ClipboardCheck size={20} className="text-teal-600" />
                  <h4 className="text-base font-black text-[#001a33] uppercase tracking-tight">1. Critérios de Rendimento</h4>
                </div>

                {instrumentosConfig.map((grupo, gIdx) => {
                  const valorMax = parseFloat(grupo.valorMax.replace(',', '.')) || 2.0;

                  return (
                    <div key={gIdx} className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                      <div className="bg-slate-50 px-5 py-4 border-b border-slate-200 flex justify-between items-center select-none">
                        <span className="font-bold text-[#001a33] text-xs uppercase tracking-wider">{grupo.grupo}</span>
                        <span className="text-[10px] font-black text-slate-500 bg-white border border-slate-200 px-2.5 py-1 rounded-lg">
                          Subtotal: <strong className="text-teal-600">{getSubtotal(grupo.grupo).toFixed(2)}</strong> / {grupo.valorMax}
                        </span>
                      </div>
                      
                      <div className="divide-y divide-slate-100">
                        {grupo.itens.map((item: string, iIdx: number) => {
                          const val = criteriosValores[grupo.grupo]?.[item] || { nota: 0, obs: '' };
                          
                          return (
                            <div key={iIdx} className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-slate-50/20 transition-colors">
                              <div className="flex items-start gap-3 flex-1">
                                <div className="text-left">
                                  <span className="text-xs font-bold text-slate-700">{item}</span>
                                  <span className="text-[9px] text-slate-400 font-medium block mt-0.5">Informe a pontuação conforme a avaliação do supervisor.</span>
                                </div>
                              </div>

                              <div className="flex items-center gap-3 flex-wrap">
                                <input
                                  type="text"
                                  placeholder="Nota/Obs rápida..."
                                  className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 outline-none focus:bg-white w-48 font-medium"
                                  value={val.obs}
                                  onChange={(e) => handleCriterioObsChange(grupo.grupo, item, e.target.value)}
                                />
                                <div className="flex items-center gap-1.5">
                                  <input 
                                    type="number"
                                    step="0.05"
                                    min="0"
                                    max={valorMax}
                                    title="Nota manual"
                                    className="w-16 text-center text-xs font-bold text-slate-700 bg-slate-50 px-2 py-1.5 rounded-lg border border-slate-200 outline-none"
                                    value={val.nota}
                                    onChange={(e) => handleCriterioNotaChange(grupo.grupo, item, parseFloat(e.target.value))}
                                  />
                                  <span className="text-[10px] font-bold text-slate-400">pts</span>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Lado Direito: Checklist de Procedimentos e Metadados da Ficha */}
              <div className="space-y-6">
                {/* Notas de Controle (Preceptor, Data, Freq) */}
                <div className="bg-[#001a33] text-white p-6 rounded-3xl space-y-4 shadow-md">
                  <h4 className="text-xs font-black uppercase tracking-widest text-slate-300">Controles do Supervisor</h4>
                  
                  <div className="space-y-3">
                    {/* Nota Final Card */}
                    <div className="bg-blue-900/40 p-4 rounded-2xl flex items-center justify-between border border-blue-800/50">
                      <span className="text-[10px] font-bold text-slate-300 uppercase tracking-wider">Nota Final Estágio</span>
                      <span className="text-xl font-black text-teal-400">{Number(avaliacaoCalculada?.final || 0).toFixed(2)} / 10.0</span>
                    </div>

                    <div className="flex flex-col">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Nome do Instrutor(a)</label>
                      <input
                        type="text"
                        placeholder="Nome do preceptor de campo..."
                        className="bg-blue-950 border border-blue-900 focus:border-teal-500 rounded-xl px-3.5 py-3 text-xs outline-none font-bold text-white placeholder:text-slate-500"
                        value={instrutorNome}
                        onChange={(e) => setInstrutorNome(e.target.value)}
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="flex flex-col">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Data Avaliação</label>
                        <input
                          type="date"
                          className="bg-blue-950 border border-blue-900 focus:border-teal-500 rounded-xl px-3 py-3 text-xs outline-none font-bold text-white"
                          value={dataAvaliacao}
                          onChange={(e) => setDataAvaliacao(e.target.value)}
                        />
                      </div>
                      <div className="flex flex-col">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Frequência (%)</label>
                        <input
                          type="number"
                          min="0"
                          max="100"
                          className="bg-blue-950 border border-blue-900 focus:border-teal-500 rounded-xl px-3 py-3 text-xs outline-none font-bold text-white text-center"
                          value={frequenciaEstagio}
                          onChange={(e) => setFrequenciaEstagio(parseInt(e.target.value) || 0)}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Checklist de Procedimentos */}
                <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm space-y-4">
                  <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
                    <ClipboardCheck className="text-teal-600" size={18} />
                    <span className="font-bold text-[#001a33] text-sm uppercase tracking-wide">2. Competências Práticas</span>
                  </div>

                  {ucConfig.atividades.length === 0 ? (
                    <div className="py-6 text-center text-xs text-slate-400 font-semibold italic bg-slate-50 rounded-xl">
                      Nenhum procedimento cadastrado para esta matéria.
                    </div>
                  ) : (
                    <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1 custom-scrollbar">
                      {ucConfig.atividades.map((atividade: string, aIdx: number) => {
                        const val = procedimentosLog[atividade] || { status: '', data: '' };
                        return (
                          <div key={aIdx} className="p-3 bg-slate-50/50 hover:bg-slate-50 border border-slate-150 rounded-2xl flex flex-col gap-2">
                            <span className="text-xs font-bold text-slate-700 leading-tight">{atividade}</span>
                            <div className="flex justify-between items-center gap-2">
                              {/* Botões A E O */}
                              <div className="flex bg-slate-200 p-0.5 rounded-lg">
                                {['A', 'E', 'O'].map((st) => (
                                  <button
                                    key={st}
                                    type="button"
                                    onClick={() => handleProcedureStatus(atividade, val.status === st ? '' : st as any)}
                                    className={`px-2.5 py-1 rounded-md text-[10px] font-black transition-all ${
                                      val.status === st 
                                        ? 'bg-[#001a33] text-white shadow-sm' 
                                        : 'text-slate-600 hover:bg-slate-300'
                                    }`}
                                  >
                                    {st}
                                  </button>
                                ))}
                              </div>

                              {val.status !== '' && (
                                <input
                                  type="date"
                                  className="text-[10px] font-bold bg-white border border-slate-200 rounded-lg px-2 py-1 outline-none text-slate-600"
                                  value={val.data}
                                  onChange={(e) => handleProcedureDate(atividade, e.target.value)}
                                />
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  <div className="text-[9px] text-slate-400 font-bold uppercase tracking-wider text-center">
                    Legenda: A - Ajudou • E - Executou • O - Observou
                  </div>
                </div>

                {/* Perfil do Aluno */}
                <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm space-y-3">
                  <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
                    <FileText className="text-teal-600" size={18} />
                    <span className="font-bold text-[#001a33] text-sm uppercase tracking-wide">3. Perfil do Aluno</span>
                  </div>
                  <textarea
                    placeholder="Escreva anotações gerais sobre o perfil comportamental, técnico e ético do aluno durante o estágio..."
                    className="w-full h-28 bg-slate-50 border border-slate-200 rounded-2xl p-4 text-xs font-semibold outline-none focus:bg-white focus:border-teal-500 placeholder:text-slate-400 text-slate-700 leading-relaxed shadow-inner"
                    value={perfilAluno}
                    onChange={(e) => setPerfilAluno(e.target.value)}
                  />
                </div>
              </div>

            </div>
          )}
        </div>
      )}
      <ToastNotification toasts={toasts} onRemove={removeToast} />
    </div>
  );
};

export default TurmaEstagio;
