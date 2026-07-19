import React from 'react';
import { Syringe } from 'lucide-react';
import { CursoVacinasConfig } from '../cadastros.types';

interface CursoVacinasTabProps {
  config: CursoVacinasConfig;
  setConfig: React.Dispatch<React.SetStateAction<CursoVacinasConfig>>;
  onUseHealthPreset: () => void;
  onToggleObrigatoria: (codigo: string) => void;
}

const CursoVacinasTab: React.FC<CursoVacinasTabProps> = ({
  config,
  setConfig,
  onUseHealthPreset,
  onToggleObrigatoria
}) => (
  <div className="grid grid-cols-1 xl:grid-cols-[0.95fr_1.05fr] gap-8 pb-20 animate-fadeIn">
    <div className="bg-white rounded-[2rem] border border-slate-200 p-8 shadow-sm space-y-6">
      <div className="flex items-start gap-4 border-b border-slate-100 pb-5">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700"><Syringe size={22} /></div>
        <div>
          <span className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-600">Estágio técnico</span>
          <h4 className="mt-1 text-xl font-black text-[#001a33]">Carteirinha de vacinação</h4>
          <p className="mt-1 text-xs font-semibold leading-relaxed text-slate-500">Defina se este curso exige vacinas aprovadas antes da liberação do estágio.</p>
        </div>
      </div>

      <div className="flex items-start justify-between gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-5">
        <div>
          <p className="text-sm font-black text-[#001a33]">Exigir carteirinha para estágio</p>
          <p className="mt-1 text-xs font-semibold leading-relaxed text-slate-500">Quando ativo, o aluno precisará enviar as doses e a secretaria deverá aprovar antes do estágio.</p>
        </div>
        <button type="button" onClick={() => setConfig(prev => ({ ...prev, exigirCarteiraEstagio: !prev.exigirCarteiraEstagio }))} className={`h-8 w-14 shrink-0 rounded-full p-1 transition-colors ${config.exigirCarteiraEstagio ? 'bg-emerald-500' : 'bg-slate-300'}`} title={config.exigirCarteiraEstagio ? 'Desativar exigência' : 'Ativar exigência'}>
          <span className={`block h-6 w-6 rounded-full bg-white shadow-sm transition-transform ${config.exigirCarteiraEstagio ? 'translate-x-6' : 'translate-x-0'}`} />
        </button>
      </div>

      <label className="block space-y-2">
        <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Observação interna</span>
        <textarea value={config.observacao || ''} onChange={(event) => setConfig(prev => ({ ...prev, observacao: event.target.value }))} rows={4} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700 outline-none transition focus:border-emerald-300 focus:bg-white" placeholder="Ex: obrigatório para estágio supervisionado em unidade de saúde." />
      </label>

      <button type="button" onClick={onUseHealthPreset} className="inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-emerald-700 transition hover:border-emerald-300">
        <Syringe size={14} /> Usar padrão Enfermagem/Radiologia
      </button>
    </div>

    <div className="bg-white rounded-[2rem] border border-slate-200 p-8 shadow-sm space-y-5">
      <div className="flex items-center justify-between gap-4 border-b border-slate-100 pb-5">
        <div>
          <span className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">Vacinas obrigatórias</span>
          <h4 className="mt-1 text-xl font-black text-[#001a33]">Doses exigidas</h4>
        </div>
        <span className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-500">
          {config.vacinas.filter(vacina => vacina.obrigatoria).length} ativa(s)
        </span>
      </div>

      {config.vacinas.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center">
          <p className="text-sm font-black text-[#001a33]">Nenhuma vacina configurada</p>
          <p className="mt-1 text-xs font-semibold text-slate-500">Use o padrão da área da saúde para iniciar rapidamente.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {config.vacinas.map(vacina => (
            <div key={vacina.codigo} className={`rounded-2xl border p-5 transition-colors ${vacina.obrigatoria ? 'border-emerald-100 bg-emerald-50/50' : 'border-slate-200 bg-slate-50'}`}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-base font-black text-[#001a33]">{vacina.nome}</p>
                  <p className="mt-1 text-xs font-bold text-slate-500">{vacina.doses.map(dose => dose.label).join(' • ')}</p>
                </div>
                <button type="button" onClick={() => onToggleObrigatoria(vacina.codigo)} className={`rounded-xl px-3 py-2 text-[10px] font-black uppercase tracking-widest transition ${vacina.obrigatoria ? 'bg-emerald-600 text-white' : 'border border-slate-200 bg-white text-slate-500 hover:text-slate-800'}`}>
                  {vacina.obrigatoria ? 'Obrigatória' : 'Opcional'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  </div>
);

export default CursoVacinasTab;
