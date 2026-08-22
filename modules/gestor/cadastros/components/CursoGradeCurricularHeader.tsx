import React from 'react';
import { ArrowLeft, Loader2, Save } from 'lucide-react';
import { Curso } from '../cadastros.types';
import { getModalidadeConfig } from './cursoGradeCurricular.helpers';

export type CursoGradeTab = 'grade' | 'turmas' | 'financeiro' | 'avaliacao' | 'vacinas' | 'publico';

interface GradeKpis {
  carga_horaria_total: number;
  carga_horaria_cadastrada: number;
  carga_horaria_restante: number;
}

interface CursoGradeCurricularHeaderProps {
  curso: Curso;
  config: ReturnType<typeof getModalidadeConfig>;
  activeTab: CursoGradeTab;
  setActiveTab: React.Dispatch<React.SetStateAction<CursoGradeTab>>;
  turmasCount: number;
  loading: boolean;
  isSaving: boolean;
  isSavingVacinas: boolean;
  loadingKpis: boolean;
  kpis: GradeKpis | null;
  onBack: () => void;
  onSave: () => void;
  onSaveVacinas: () => void;
}

const CursoGradeCurricularHeader: React.FC<CursoGradeCurricularHeaderProps> = ({
  curso,
  config,
  activeTab,
  setActiveTab,
  turmasCount,
  loading,
  isSaving,
  isSavingVacinas,
  loadingKpis,
  kpis,
  onBack,
  onSave,
  onSaveVacinas
}) => (
  <>
    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6 border-b border-slate-100 pb-6">
      <div className="flex items-center gap-4">
        <button onClick={onBack} className={`p-2 rounded-xl border border-slate-200 text-slate-400 hover:text-${config.themeColor}-600 hover:border-${config.themeColor}-200 transition-colors`}>
          <ArrowLeft size={20} />
        </button>
        <div>
          <h3 className="text-2xl font-black text-[#001a33]">
            {curso.nome}{' '}
            <span className="text-sm bg-slate-100 text-slate-500 px-2.5 py-1 rounded-full font-bold ml-2">
              v{curso.versao}
            </span>
          </h3>
          <p className="text-xs text-slate-400 mt-1 font-medium max-w-xl truncate">
            {curso.descricao || 'Formação profissionalizante regulamentada.'}
          </p>
        </div>
      </div>

      {activeTab === 'grade' && (
        <button
          onClick={onSave}
          disabled={isSaving || loading}
          className="flex items-center gap-2 bg-[#001a33] text-white px-6 py-3 rounded-xl font-bold uppercase text-xs tracking-wider hover:bg-blue-900 transition-colors shadow-lg shadow-blue-900/20 disabled:opacity-70"
        >
          <Save size={16} /> {isSaving ? 'Salvando...' : config.labelSave}
        </button>
      )}

      {activeTab === 'vacinas' && (
        <button
          onClick={onSaveVacinas}
          disabled={isSavingVacinas}
          className="flex items-center gap-2 bg-[#001a33] text-white px-6 py-3 rounded-xl font-bold uppercase text-xs tracking-wider hover:bg-blue-900 transition-colors shadow-lg shadow-blue-900/20 disabled:opacity-70"
        >
          {isSavingVacinas ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
          {isSavingVacinas ? 'Salvando...' : 'Salvar vacinas'}
        </button>
      )}
    </div>

    {loadingKpis ? (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        {[1, 2, 3].map(i => (
          <div key={i} className="bg-slate-50 border border-slate-200 rounded-2xl h-24 animate-pulse" />
        ))}
      </div>
    ) : kpis ? (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-sm flex flex-col justify-between">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Carga Total do Curso</span>
          <div className="flex items-baseline gap-1 mt-2">
            <span className="text-2xl font-black text-[#001a33]">{kpis.carga_horaria_total}</span>
            <span className="text-xs font-bold text-slate-500">horas</span>
          </div>
          <p className="text-[10px] text-slate-500 font-medium mt-1">Definido no cadastro do curso</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-sm flex flex-col justify-between">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Carga Cadastrada</span>
          <div className="flex items-baseline gap-1 mt-2">
            <span className="text-2xl font-black text-emerald-600">{kpis.carga_horaria_cadastrada}</span>
            <span className="text-xs font-bold text-emerald-600">horas</span>
          </div>
          <p className="text-[10px] text-slate-500 font-medium mt-1">Soma das disciplinas da grade</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-sm flex flex-col justify-between">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Carga Restante</span>
          <div className="flex items-baseline gap-1 mt-2">
            <span className={`text-2xl font-black ${kpis.carga_horaria_restante < 0 ? 'text-red-500' : kpis.carga_horaria_restante === 0 ? 'text-emerald-600' : 'text-amber-500'}`}>
              {kpis.carga_horaria_restante}
            </span>
            <span className={`text-xs font-bold ${kpis.carga_horaria_restante < 0 ? 'text-red-500' : kpis.carga_horaria_restante === 0 ? 'text-emerald-600' : 'text-amber-500'}`}>horas</span>
          </div>
          <p className="text-[10px] text-slate-500 font-medium mt-1">
            {kpis.carga_horaria_restante < 0 ? 'Excesso de horas na grade!' : kpis.carga_horaria_restante === 0 ? 'Grade concluída e exata' : 'Horas pendentes de cadastro'}
          </p>
        </div>
      </div>
    ) : null}

    <div className={`grid grid-cols-2 ${curso.modalidade === 'TECNICO' || curso.modalidade === 'LIVRE' ? 'lg:grid-cols-5' : 'lg:grid-cols-4'} gap-2 mb-8 bg-slate-100 p-1 rounded-2xl max-w-4xl border border-slate-200`}>
      {([
        ['grade', 'Grade Curricular'],
        ['turmas', `Turmas (${turmasCount})`],
        ['financeiro', 'Financeiro'],
        ...(curso.modalidade === 'LIVRE' ? [['avaliacao', 'Avaliação final']] : []),
        ...(curso.modalidade === 'TECNICO' ? [['vacinas', 'Vacinas']] : []),
        ['publico', 'Público (Site)']
      ] as [CursoGradeTab, string][]).map(([tab, label]) => (
        <button
          key={tab}
          onClick={() => setActiveTab(tab)}
          className={`flex-1 py-2.5 text-xs font-bold uppercase tracking-wider rounded-xl transition-all ${activeTab === tab ? `bg-white text-${config.themeColor}-600 shadow-sm` : 'text-slate-500 hover:text-slate-700'}`}
        >
          {label}
        </button>
      ))}
    </div>
  </>
);

export default CursoGradeCurricularHeader;
