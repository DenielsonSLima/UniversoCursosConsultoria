import React from 'react';
import {
  ArrowLeft,
  BookOpen,
  Calculator,
  Calendar,
  CheckCircle2,
  LockKeyhole,
  Printer,
  ShieldCheck,
} from 'lucide-react';
import { DiarioActiveTab } from './diario-classe.types';

interface DiarioClasseHeaderProps {
  disciplina: any;
  moduloNome: string;
  turma: any;
  onBack: () => void;
  onOpenExportModal: () => void;
  exportDisabled: boolean;
  isReadOnly: boolean;
  readOnlyLabel: string;
  readOnlyMessage: string;
  activeTab: DiarioActiveTab;
  setActiveTab: (tab: DiarioActiveTab) => void;
}

const DiarioClasseHeader: React.FC<DiarioClasseHeaderProps> = ({
  disciplina,
  moduloNome,
  turma,
  onBack,
  onOpenExportModal,
  exportDisabled,
  isReadOnly,
  readOnlyLabel,
  readOnlyMessage,
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
        <button
          onClick={onOpenExportModal}
          disabled={exportDisabled}
          className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-2 shadow-md shadow-blue-600/20 transition-all hover:scale-[1.02] disabled:cursor-wait disabled:opacity-50 disabled:hover:scale-100"
        >
          <Printer size={16} /> Imprimir / Exportar Diário
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

    <nav
      aria-label="Seções do diário"
      className="mb-6 flex max-w-full flex-nowrap items-center gap-6 overflow-x-auto border-b border-slate-200 bg-white px-5 pb-2 [scrollbar-color:#94a3b8_#e2e8f0] [scrollbar-width:thin] [&::-webkit-scrollbar]:h-2 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-400 [&::-webkit-scrollbar-thumb:hover]:bg-slate-500 [&::-webkit-scrollbar-track]:rounded-full [&::-webkit-scrollbar-track]:bg-slate-200"
    >
      <TabButton active={activeTab === 'frequencia'} onClick={() => setActiveTab('frequencia')} icon={<Calendar size={15} />}>
        Frequência
      </TabButton>
      <TabButton active={activeTab === 'resultado'} onClick={() => setActiveTab('resultado')} icon={<Calculator size={15} />}>
        Notas e Resultados
      </TabButton>
      <TabButton active={activeTab === 'conteudo'} onClick={() => setActiveTab('conteudo')} icon={<BookOpen size={15} />}>
        Conteúdo das Aulas
      </TabButton>
      <TabButton active={activeTab === 'observacoes'} onClick={() => setActiveTab('observacoes')} icon={<BookOpen size={15} />}>
        Observações
      </TabButton>
      <TabButton active={activeTab === 'fechamento'} onClick={() => setActiveTab('fechamento')} icon={<ShieldCheck size={15} />}>
        Fechamento
      </TabButton>
    </nav>
  </>
);

interface TabButtonProps {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}

const TabButton: React.FC<TabButtonProps> = ({ active, onClick, icon, children }) => (
  <button
    type="button"
    onClick={onClick}
    aria-current={active ? 'page' : undefined}
    className={`relative flex h-12 shrink-0 items-center justify-center gap-2 px-0.5 text-xs font-bold uppercase tracking-wide whitespace-nowrap transition-colors after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:origin-center after:rounded-full after:bg-blue-600 after:transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 ${
      active
        ? 'text-[#001a33] after:scale-x-100'
        : 'text-slate-400 after:scale-x-0 hover:text-blue-700 hover:after:scale-x-50'
    }`}
  >
    <span className={active ? 'text-blue-600' : undefined}>{icon}</span>
    {children}
  </button>
);

export default DiarioClasseHeader;
