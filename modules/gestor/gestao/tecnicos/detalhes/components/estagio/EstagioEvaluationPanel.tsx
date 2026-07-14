import React from 'react';
import { ArrowLeft, ClipboardCheck, FileText, Loader2, LockKeyhole, Printer, Save } from 'lucide-react';
import {
  EstagioCriteriosValores,
  EstagioProcedimentosLog,
  ProcedimentoStatus,
} from '../../turma-estagio.types';

interface EstagioEvaluationPanelProps {
  aluno: any;
  disciplina: any;
  readOnly: boolean;
  readOnlyMessage: string;
  hasExistingEvaluation: boolean;
  loadingConfig: boolean;
  saving: boolean;
  instrumentosConfig: any[];
  criteriosValores: EstagioCriteriosValores;
  procedimentosLog: EstagioProcedimentosLog;
  ucConfig: any;
  avaliacaoCalculada: any;
  instrutorNome: string;
  dataAvaliacao: string;
  frequenciaEstagio: number;
  perfilAluno: string;
  getSubtotal: (grupoNome: string) => number;
  onBack: () => void;
  onPrint: () => void;
  onSave: () => void;
  onCriterioObsChange: (grupo: string, item: string, observacao: string) => void;
  onCriterioNotaChange: (grupo: string, item: string, nota: number) => void;
  onProcedureStatus: (atividade: string, status: ProcedimentoStatus) => void;
  onProcedureDate: (atividade: string, data: string) => void;
  onInstrutorNomeChange: (value: string) => void;
  onDataAvaliacaoChange: (value: string) => void;
  onFrequenciaChange: (value: number) => void;
  onPerfilAlunoChange: (value: string) => void;
}

const EstagioEvaluationPanel: React.FC<EstagioEvaluationPanelProps> = ({
  aluno,
  disciplina,
  readOnly,
  readOnlyMessage,
  hasExistingEvaluation,
  loadingConfig,
  saving,
  instrumentosConfig,
  criteriosValores,
  procedimentosLog,
  ucConfig,
  avaliacaoCalculada,
  instrutorNome,
  dataAvaliacao,
  frequenciaEstagio,
  perfilAluno,
  getSubtotal,
  onBack,
  onPrint,
  onSave,
  onCriterioObsChange,
  onCriterioNotaChange,
  onProcedureStatus,
  onProcedureDate,
  onInstrutorNomeChange,
  onDataAvaliacaoChange,
  onFrequenciaChange,
  onPerfilAlunoChange,
}) => (
  <div className="bg-white p-6 md:p-8 rounded-[2rem] border border-slate-100 shadow-sm space-y-8 animate-fadeIn">
    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-6">
      <div className="flex items-center gap-4">
        <button
          onClick={onBack}
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
              {disciplina?.nome}
            </span>
          </div>
          <h3 className="text-xl font-black text-[#001a33] uppercase tracking-tight">{aluno.nome}</h3>
        </div>
      </div>

      <div className="flex items-center gap-3">
        {hasExistingEvaluation ? (
          <button
            onClick={onPrint}
            className="px-5 py-3 border border-slate-200 text-slate-600 rounded-xl font-bold uppercase text-xs tracking-wider flex items-center justify-center gap-2 hover:bg-slate-50 transition-colors"
          >
            <Printer size={16} /> Imprimir PDF
          </button>
        ) : null}
        <button
          onClick={onSave}
          disabled={readOnly || saving || loadingConfig}
          className="px-6 py-3 bg-[#001a33] text-white rounded-xl font-bold uppercase text-xs tracking-wider flex items-center justify-center gap-2 hover:bg-blue-900 transition-colors disabled:opacity-70"
        >
          {readOnly ? <LockKeyhole size={16} /> : <Save size={16} />}
          {readOnly ? 'Somente leitura' : saving ? 'Salvando...' : 'Salvar Ficha'}
        </button>
      </div>
    </div>

    {readOnly ? (
      <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-800">
        <LockKeyhole className="mt-0.5 shrink-0" size={17} />
        <p className="text-xs font-bold leading-relaxed">{readOnlyMessage}</p>
      </div>
    ) : null}

    {loadingConfig ? (
      <div className="flex justify-center items-center py-20">
        <Loader2 className="animate-spin text-teal-600" size={32} />
      </div>
    ) : (
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          <div className="flex items-center gap-2 mb-2">
            <ClipboardCheck size={20} className="text-teal-600" />
            <h4 className="text-base font-black text-[#001a33] uppercase tracking-tight">1. Critérios de Rendimento</h4>
          </div>

          {instrumentosConfig.map((grupo, grupoIndex) => {
            const valorMax = parseFloat(grupo.valorMax.replace(',', '.')) || 2.0;
            return (
              <div key={grupoIndex} className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                <div className="bg-slate-50 px-5 py-4 border-b border-slate-200 flex justify-between items-center select-none">
                  <span className="font-bold text-[#001a33] text-xs uppercase tracking-wider">{grupo.grupo}</span>
                  <span className="text-[10px] font-black text-slate-500 bg-white border border-slate-200 px-2.5 py-1 rounded-lg">
                    Subtotal: <strong className="text-teal-600">{getSubtotal(grupo.grupo).toFixed(2)}</strong> / {grupo.valorMax}
                  </span>
                </div>
                <div className="divide-y divide-slate-100">
                  {grupo.itens.map((item: string, itemIndex: number) => {
                    const value = criteriosValores[grupo.grupo]?.[item] || { nota: 0, obs: '' };
                    return (
                      <div key={itemIndex} className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-slate-50/20 transition-colors">
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
                            value={value.obs}
                            disabled={readOnly}
                            onChange={(event) => onCriterioObsChange(grupo.grupo, item, event.target.value)}
                          />
                          <div className="flex items-center gap-1.5">
                            <input
                              type="number"
                              step="0.05"
                              min="0"
                              max={valorMax}
                              title="Nota manual"
                              className="w-16 text-center text-xs font-bold text-slate-700 bg-slate-50 px-2 py-1.5 rounded-lg border border-slate-200 outline-none"
                              value={value.nota}
                              disabled={readOnly}
                              onChange={(event) => onCriterioNotaChange(grupo.grupo, item, parseFloat(event.target.value))}
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

        <div className="space-y-6">
          <div className="bg-[#001a33] text-white p-6 rounded-3xl space-y-4 shadow-md">
            <h4 className="text-xs font-black uppercase tracking-widest text-slate-300">Controles do Supervisor</h4>
            <div className="space-y-3">
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
                  disabled={readOnly}
                  onChange={(event) => onInstrutorNomeChange(event.target.value)}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Data Avaliação</label>
                  <input
                    type="date"
                    className="bg-blue-950 border border-blue-900 focus:border-teal-500 rounded-xl px-3 py-3 text-xs outline-none font-bold text-white"
                    value={dataAvaliacao}
                    disabled={readOnly}
                    onChange={(event) => onDataAvaliacaoChange(event.target.value)}
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
                    disabled={readOnly}
                    onChange={(event) => onFrequenciaChange(parseInt(event.target.value) || 0)}
                  />
                </div>
              </div>
            </div>
          </div>

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
                {ucConfig.atividades.map((atividade: string, atividadeIndex: number) => {
                  const value = procedimentosLog[atividade] || { status: '', data: '' };
                  return (
                    <div key={atividadeIndex} className="p-3 bg-slate-50/50 hover:bg-slate-50 border border-slate-150 rounded-2xl flex flex-col gap-2">
                      <span className="text-xs font-bold text-slate-700 leading-tight">{atividade}</span>
                      <div className="flex justify-between items-center gap-2">
                        <div className="flex bg-slate-200 p-0.5 rounded-lg">
                          {(['A', 'E', 'O'] as const).map((status) => (
                            <button
                              key={status}
                              type="button"
                              disabled={readOnly}
                              onClick={() => onProcedureStatus(atividade, value.status === status ? '' : status)}
                              className={`px-2.5 py-1 rounded-md text-[10px] font-black transition-all ${value.status === status
                                ? 'bg-[#001a33] text-white shadow-sm'
                                : 'text-slate-600 hover:bg-slate-300'
                              }`}
                            >
                              {status}
                            </button>
                          ))}
                        </div>
                        {value.status !== '' ? (
                          <input
                            type="date"
                            className="text-[10px] font-bold bg-white border border-slate-200 rounded-lg px-2 py-1 outline-none text-slate-600"
                            value={value.data}
                            disabled={readOnly}
                            onChange={(event) => onProcedureDate(atividade, event.target.value)}
                          />
                        ) : null}
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

          <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm space-y-3">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
              <FileText className="text-teal-600" size={18} />
              <span className="font-bold text-[#001a33] text-sm uppercase tracking-wide">3. Perfil do Aluno</span>
            </div>
            <textarea
              placeholder="Escreva anotações gerais sobre o perfil comportamental, técnico e ético do aluno durante o estágio..."
              className="w-full h-28 bg-slate-50 border border-slate-200 rounded-2xl p-4 text-xs font-semibold outline-none focus:bg-white focus:border-teal-500 placeholder:text-slate-400 text-slate-700 leading-relaxed shadow-inner"
              value={perfilAluno}
              disabled={readOnly}
              onChange={(event) => onPerfilAlunoChange(event.target.value)}
            />
          </div>
        </div>
      </div>
    )}
  </div>
);

export default EstagioEvaluationPanel;
