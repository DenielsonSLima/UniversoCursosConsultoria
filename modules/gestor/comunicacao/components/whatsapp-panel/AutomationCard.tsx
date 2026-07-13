import React from 'react';
import { ChevronDown, RefreshCw, Save } from 'lucide-react';
import { COURSE_MODALITIES } from './constants';
import { AutomationKey, AutomationTone } from './types';

const AUTOMATION_TONES: Record<AutomationTone, {
  section: string;
  rail: string;
  icon: string;
  step: string;
  panel: string;
  focus: string;
  variable: string;
}> = {
  blue: {
    section: 'border-blue-200 bg-blue-50/45',
    rail: 'bg-blue-600',
    icon: 'bg-blue-100 text-blue-700',
    step: 'bg-blue-600 text-white',
    panel: 'border-blue-100 bg-white/75 text-blue-900',
    focus: 'focus-within:border-blue-500 focus:border-blue-500',
    variable: 'hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700',
  },
  emerald: {
    section: 'border-emerald-200 bg-emerald-50/45',
    rail: 'bg-emerald-600',
    icon: 'bg-emerald-100 text-emerald-700',
    step: 'bg-emerald-600 text-white',
    panel: 'border-emerald-100 bg-white/75 text-emerald-900',
    focus: 'focus-within:border-emerald-500 focus:border-emerald-500',
    variable: 'hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-700',
  },
  amber: {
    section: 'border-amber-200 bg-amber-50/50',
    rail: 'bg-amber-500',
    icon: 'bg-amber-100 text-amber-700',
    step: 'bg-amber-500 text-white',
    panel: 'border-amber-100 bg-white/75 text-amber-900',
    focus: 'focus-within:border-amber-500 focus:border-amber-500',
    variable: 'hover:border-amber-200 hover:bg-amber-50 hover:text-amber-700',
  },
  rose: {
    section: 'border-rose-200 bg-rose-50/45',
    rail: 'bg-rose-600',
    icon: 'bg-rose-100 text-rose-700',
    step: 'bg-rose-600 text-white',
    panel: 'border-rose-100 bg-white/75 text-rose-900',
    focus: 'focus-within:border-rose-500 focus:border-rose-500',
    variable: 'hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700',
  },
};

interface AutomationCardProps {
  icon: React.ElementType;
  automationKey: AutomationKey;
  step: string;
  tone: AutomationTone;
  title: string;
  description: string;
  triggerValue: string;
  audienceValue: string;
  isOpen: boolean;
  onToggleOpen: () => void;
  checked: boolean;
  onChange: (checked: boolean) => void;
  timingLabel?: string;
  timingValue?: number;
  onTimingChange?: (value: number) => void;
  timingSuffix?: string;
  message: string;
  onMessageChange: (value: string) => void;
  variables: string[];
  modalities: string[];
  onModalitiesChange: (value: string[]) => void;
  onSave: (key: AutomationKey) => void;
  isSaving: boolean;
}

const AutomationCard: React.FC<AutomationCardProps> = ({
  icon: Icon,
  automationKey,
  step,
  tone,
  title,
  description,
  triggerValue,
  audienceValue,
  isOpen,
  onToggleOpen,
  checked,
  onChange,
  timingLabel,
  timingValue,
  onTimingChange,
  timingSuffix,
  message,
  onMessageChange,
  variables,
  modalities,
  onModalitiesChange,
  onSave,
  isSaving,
}) => {
  const classes = AUTOMATION_TONES[tone];
  const selectedLabels = COURSE_MODALITIES
    .filter((item) => modalities.includes(item.id))
    .map((item) => item.label)
    .join(', ');

  const toggleModality = (modality: string) => {
    const next = modalities.includes(modality)
      ? modalities.filter((item) => item !== modality)
      : [...modalities, modality];
    onModalitiesChange(next.length > 0 ? next : [modality]);
  };

  return (
    <section className={`relative overflow-hidden rounded-xl border transition-colors ${checked ? classes.section : 'border-slate-100 bg-slate-50 opacity-70'}`}>
      <span className={`absolute left-0 top-0 h-full w-1 ${checked ? classes.rail : 'bg-slate-200'}`} />
      <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
        <button type="button" onClick={onToggleOpen} className="flex flex-1 items-start gap-3 text-left">
          <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${checked ? classes.icon : 'bg-slate-100 text-slate-400'}`}>
            <Icon size={18} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`inline-flex h-6 items-center rounded-full px-2 text-[10px] font-black uppercase tracking-wide ${checked ? classes.step : 'bg-slate-200 text-slate-500'}`}>
                {step}
              </span>
              <h3 className="text-base font-black tracking-tight text-[#001a33]">{title}</h3>
            </div>
            <p className="mt-1 text-xs font-medium leading-relaxed text-slate-500">{description}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <span className={`rounded-lg border px-2.5 py-1 text-[11px] font-bold ${classes.panel}`}>{triggerValue}</span>
              <span className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-bold text-slate-600">
                Cursos: {selectedLabels || 'nenhum'}
              </span>
            </div>
          </div>
          <ChevronDown size={18} className={`mt-2 shrink-0 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </button>
        <div className="flex shrink-0 items-center gap-2">
          <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-500">
            <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="h-5 w-5 accent-emerald-600" />
            {checked ? 'Ativo' : 'Inativo'}
          </label>
          {!isOpen && (
            <button type="button" onClick={onToggleOpen} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 transition-colors hover:border-emerald-200 hover:text-emerald-700">
              Editar
            </button>
          )}
        </div>
      </div>

      {isOpen && (
        <div className="border-t border-white/70 p-4 pt-5">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className={`rounded-xl border p-3 ${classes.panel}`}>
              <p className="text-[10px] font-black uppercase tracking-wide opacity-60">Quando dispara</p>
              <p className="mt-1 text-sm font-black">{triggerValue}</p>
            </div>
            <div className={`rounded-xl border p-3 ${classes.panel}`}>
              <p className="text-[10px] font-black uppercase tracking-wide opacity-60">Quem recebe</p>
              <p className="mt-1 text-sm font-black">{audienceValue}</p>
            </div>
          </div>

          {timingLabel && onTimingChange && (
            <label className="mt-4 block space-y-2">
              <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{timingLabel}</span>
              <div className={`flex items-center overflow-hidden rounded-lg border border-slate-200 bg-white ${classes.focus}`}>
                <input type="number" min="0" value={timingValue ?? 0} onChange={(event) => onTimingChange(Number(event.target.value))} className="h-11 w-24 border-0 px-4 text-sm font-bold text-[#001a33] outline-none" />
                <span className="border-l border-slate-100 px-3 text-xs font-semibold text-slate-500">{timingSuffix}</span>
              </div>
            </label>
          )}

          <div className="mt-4 space-y-2">
            <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Exibir cobrança para</span>
            <div className="flex flex-wrap gap-2">
              {COURSE_MODALITIES.map((modality) => {
                const selected = modalities.includes(modality.id);
                return (
                  <button key={`${title}-${modality.id}`} type="button" onClick={() => toggleModality(modality.id)} className={`inline-flex min-h-[34px] items-center gap-2 rounded-lg border px-3 text-xs font-bold transition-colors ${selected ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300'}`}>
                    <span className={`h-2 w-2 rounded-full ${selected ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                    {modality.label}
                  </button>
                );
              })}
            </div>
          </div>

          <label className="mt-4 block space-y-2">
            <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Mensagem enviada</span>
            <textarea value={message} onChange={(event) => onMessageChange(event.target.value)} className={`h-28 w-full resize-none rounded-lg border border-slate-200 bg-white p-4 text-sm font-semibold leading-relaxed text-slate-700 outline-none ${classes.focus}`} />
          </label>

          <div className="mt-3 flex flex-wrap gap-2">
            {variables.map((variable) => (
              <button key={`${title}-${variable}`} type="button" onClick={() => onMessageChange(`${message}${message.endsWith(' ') || message.length === 0 ? '' : ' '}${variable}`)} className={`rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-bold text-slate-600 transition-colors ${classes.variable}`}>
                {variable}
              </button>
            ))}
          </div>

          <div className="mt-4 flex justify-end">
            <button type="button" onClick={() => onSave(automationKey)} disabled={isSaving} className="inline-flex min-h-[42px] items-center justify-center gap-2 rounded-lg bg-[#001a33] px-5 text-xs font-bold uppercase tracking-wide text-white transition-colors hover:bg-blue-900 disabled:opacity-50">
              {isSaving ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />}
              Salvar este aviso
            </button>
          </div>
        </div>
      )}
    </section>
  );
};

export default AutomationCard;
