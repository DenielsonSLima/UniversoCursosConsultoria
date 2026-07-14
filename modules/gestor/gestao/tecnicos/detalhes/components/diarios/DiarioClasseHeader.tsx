import React from 'react';
import {
  ArrowLeft,
  BookOpen,
  Calculator,
  Calendar,
  CheckCircle2,
  Download,
  Loader2,
  LockKeyhole,
  Printer,
  Save,
} from 'lucide-react';
import { DiarioActiveTab } from './diario-classe.types';

interface DiarioClasseHeaderProps {
  disciplina: any;
  moduloNome: string;
  turma: any;
  onBack: () => void;
  onDownloadPdf: () => void;
  downloadingPdf: boolean;
  isReadOnly: boolean;
  readOnlyLabel: string;
  readOnlyMessage: string;
  novaAulaTitulo: string;
  novaAulaData: string;
  novaAulaCarga: string;
  setNovaAulaTitulo: (value: string) => void;
  setNovaAulaData: (value: string) => void;
  setNovaAulaCarga: (value: string) => void;
  onAddAula: () => void;
  addingAula: boolean;
  activeTab: DiarioActiveTab;
  setActiveTab: (tab: DiarioActiveTab) => void;
}

const DiarioClasseHeader: React.FC<DiarioClasseHeaderProps> = ({
  disciplina,
  moduloNome,
  turma,
  onBack,
  onDownloadPdf,
  downloadingPdf,
  isReadOnly,
  readOnlyLabel,
  readOnlyMessage,
  novaAulaTitulo,
  novaAulaData,
  novaAulaCarga,
  setNovaAulaTitulo,
  setNovaAulaData,
  setNovaAulaCarga,
  onAddAula,
  addingAula,
  activeTab,
  setActiveTab,
}) => (
  <>
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
      <div className="flex items-center gap-4">
        <button
          onClick={onBack}
          className="w-10 h-10 flex items-center justify-center rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50 transition-colors bg-white shrink-0 shadow-sm"
        >
          <ArrowLeft size={20} />
        </button>
        <div>
          <h3 className="text-2xl font-black text-[#001a33] uppercase tracking-tight">Diário de Classe</h3>
          <p className="text-sm font-bold text-slate-500">{disciplina.nome} • {moduloNome}</p>
        </div>
      </div>
      <div className="flex gap-2">
        <button onClick={onDownloadPdf} disabled={downloadingPdf} className="px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded-xl text-xs font-bold uppercase tracking-wider hover:bg-slate-50 flex items-center gap-2 shadow-sm disabled:opacity-60">
          {downloadingPdf ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />} Baixar PDF
        </button>
        <button onClick={() => window.print()} className="px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded-xl text-xs font-bold uppercase tracking-wider hover:bg-slate-50 flex items-center gap-2 shadow-sm">
          <Printer size={16} /> Imprimir Diário
        </button>
        <button
          type="button"
          disabled
          className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center gap-2 shadow-sm ${
            isReadOnly
              ? 'bg-slate-100 text-slate-500 border border-slate-200'
              : 'bg-emerald-50 text-emerald-700 border border-emerald-100'
          }`}
        >
          {isReadOnly ? <LockKeyhole size={16} /> : <CheckCircle2 size={16} />}
          {isReadOnly ? readOnlyLabel : 'Salvamento automático'}
        </button>
      </div>
    </div>

    {isReadOnly && (
      <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold text-amber-900">
        <div className="flex items-start gap-3">
          <LockKeyhole size={18} className="mt-0.5 shrink-0 text-amber-700" />
          <div>
            <p className="font-black uppercase tracking-wider text-[11px]">Diário em modo leitura</p>
            <p className="mt-1 text-xs leading-relaxed text-amber-800">{readOnlyMessage}</p>
          </div>
        </div>
      </div>
    )}

    <div className="bg-white rounded-2xl border border-slate-200 p-6 mb-6 shadow-sm">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div>
          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-1">Curso</p>
          <p className="font-bold text-slate-700">{turma.cursoNome}</p>
        </div>
        <div>
          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-1">Módulo</p>
          <p className="font-bold text-slate-700">{moduloNome}</p>
        </div>
        <div>
          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-1">Disciplina</p>
          <p className="font-bold text-slate-700">{disciplina.nome}</p>
        </div>
        <div>
          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-1">Professor(a)</p>
          <p className={`font-bold ${disciplina.professor === 'Não atribuído' ? 'text-rose-500' : 'text-slate-700'}`}>
            {disciplina.professor}
          </p>
        </div>
      </div>
    </div>

    {!isReadOnly && (
      <div className="bg-white rounded-2xl border border-slate-200 p-4 mb-6 shadow-sm">
        <div className="flex flex-col xl:flex-row xl:items-end gap-3">
          <div className="flex-1 min-w-[220px]">
            <label className="text-[10px] text-slate-400 font-black uppercase tracking-widest mb-1.5 block">Descrição da aula</label>
            <input
              type="text"
              value={novaAulaTitulo}
              onChange={(event) => setNovaAulaTitulo(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') document.getElementById(`diario-aula-data-${disciplina.id}`)?.focus();
              }}
              placeholder="Conteúdo ministrado..."
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3 text-xs font-bold text-slate-700 outline-none transition-colors focus:border-blue-500 focus:bg-white"
            />
          </div>
          <div className="w-full sm:w-44">
            <label className="text-[10px] text-slate-400 font-black uppercase tracking-widest mb-1.5 block">Data da aula</label>
            <input
              id={`diario-aula-data-${disciplina.id}`}
              type="date"
              value={novaAulaData}
              onChange={(event) => setNovaAulaData(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') document.getElementById(`diario-aula-carga-${disciplina.id}`)?.focus();
              }}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3 text-xs font-bold text-slate-700 outline-none transition-colors focus:border-blue-500 focus:bg-white"
            />
          </div>
          <div className="w-full sm:w-36">
            <label className="text-[10px] text-slate-400 font-black uppercase tracking-widest mb-1.5 block">Carga horária</label>
            <input
              id={`diario-aula-carga-${disciplina.id}`}
              type="number"
              min="0"
              step="0.5"
              value={novaAulaCarga}
              onChange={(event) => setNovaAulaCarga(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') onAddAula();
              }}
              placeholder="Hrs"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3 text-center text-xs font-black text-slate-700 outline-none transition-colors focus:border-blue-500 focus:bg-white"
            />
          </div>
          <button
            type="button"
            onClick={onAddAula}
            disabled={addingAula}
            className="inline-flex min-h-[42px] w-full items-center justify-center gap-2 rounded-xl bg-[#001a33] px-4 py-3 text-[10px] font-black uppercase tracking-widest text-white shadow-sm transition-colors hover:bg-blue-900 disabled:cursor-not-allowed disabled:opacity-70 sm:w-auto"
          >
            {addingAula ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
            Salvar aula
          </button>
        </div>
      </div>
    )}

    <div className="flex overflow-x-auto hide-scrollbar gap-2 mb-6 bg-slate-200/50 p-1.5 rounded-2xl border border-slate-100">
      <TabButton active={activeTab === 'frequencia'} onClick={() => setActiveTab('frequencia')} activeClass="text-blue-600" icon={<Calendar size={18} />}>
        Frequência
      </TabButton>
      <TabButton active={activeTab === 'resultado'} onClick={() => setActiveTab('resultado')} activeClass="text-emerald-600" icon={<Calculator size={18} />}>
        Notas e Resultados
      </TabButton>
      <TabButton active={activeTab === 'conteudo'} onClick={() => setActiveTab('conteudo')} activeClass="text-purple-600" icon={<BookOpen size={18} />}>
        Conteúdo das Aulas
      </TabButton>
      <TabButton active={activeTab === 'observacoes'} onClick={() => setActiveTab('observacoes')} activeClass="text-orange-600" icon={<BookOpen size={18} />}>
        Observações
      </TabButton>
    </div>
  </>
);

interface TabButtonProps {
  active: boolean;
  onClick: () => void;
  activeClass: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}

const TabButton: React.FC<TabButtonProps> = ({ active, onClick, activeClass, icon, children }) => (
  <button
    onClick={onClick}
    className={`flex-1 min-w-[150px] flex items-center justify-center gap-2 py-3 px-6 rounded-xl text-sm font-bold uppercase tracking-wider transition-all ${
      active ? `bg-white ${activeClass} shadow-sm` : 'text-slate-500 hover:text-slate-700'
    }`}
  >
    {icon} {children}
  </button>
);

export default DiarioClasseHeader;
