import React, { useEffect, useState } from 'react';
import { Cake, Check, Clock, MessageSquareText, RefreshCw, Save, Sparkles } from 'lucide-react';
import {
  BIRTHDAY_MODALITIES,
  BIRTHDAY_TEMPLATE_VARIABLES,
  BirthdayAgentSettings,
  BirthdayBankStats,
  DEFAULT_BIRTHDAY_SETTINGS,
  ENROLLMENT_STATUS_OPTIONS,
} from './birthday.types';

interface BirthdayAgentPanelProps {
  settings: BirthdayAgentSettings | null;
  bankStats: BirthdayBankStats | null;
  loading: boolean;
  saving: boolean;
  onSave: (settings: BirthdayAgentSettings) => void;
}

const toggleListItem = (list: string[], item: string) =>
  list.includes(item) ? list.filter((value) => value !== item) : [...list, item];

const BirthdayAgentPanel: React.FC<BirthdayAgentPanelProps> = ({
  settings,
  bankStats,
  loading,
  saving,
  onSave,
}) => {
  const [draft, setDraft] = useState<BirthdayAgentSettings>(DEFAULT_BIRTHDAY_SETTINGS);

  useEffect(() => {
    setDraft({ ...DEFAULT_BIRTHDAY_SETTINGS, ...(settings || {}) });
  }, [settings]);

  const updateDraft = (patch: Partial<BirthdayAgentSettings>) => {
    setDraft((current) => ({ ...current, ...patch }));
  };

  const appendTemplateVariable = (variable: string) => {
    const separator = draft.messageTemplate.length === 0
      ? ''
      : variable === '{{frase_aniversario}}'
        ? '\n\n'
        : draft.messageTemplate.endsWith(' ') ? '' : ' ';
    updateDraft({ messageTemplate: `${draft.messageTemplate}${separator}${variable}` });
  };

  if (loading) {
    return (
      <div className="min-h-0 flex-1 overflow-y-auto p-5 custom-scrollbar">
        <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-5 text-sm font-bold text-slate-500">
          <RefreshCw size={18} className="animate-spin" />
          Carregando agentes...
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-5 custom-scrollbar">
      <div className="grid max-w-6xl gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-4 border-b border-slate-100 pb-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex gap-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-pink-50 text-pink-600">
                <Cake size={22} />
              </div>
              <div>
                <p className="text-lg font-black text-[#001a33]">Agente de aniversário</p>
                <p className="mt-1 max-w-2xl text-sm font-medium leading-relaxed text-slate-500">
                  Marketing com variação automática de mensagens, nome social e seleção respeitosa pelo cadastro.
                </p>
              </div>
            </div>
            <button
              onClick={() => onSave(draft)}
              disabled={saving}
              className="inline-flex min-h-[42px] items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 text-xs font-bold uppercase tracking-wide text-white shadow-sm transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {saving ? <RefreshCw size={15} className="animate-spin" /> : <Save size={15} />}
              Salvar agente
            </button>
          </div>

          <div className="mt-5 grid gap-4 lg:grid-cols-3">
            <label className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <span className="text-sm font-black text-[#001a33]">Agente ativo</span>
              <span className="mt-1 block text-xs font-semibold leading-relaxed text-slate-500">
                Envia somente no dia do aniversário.
              </span>
              <input
                type="checkbox"
                checked={draft.enabled}
                onChange={(event) => updateDraft({ enabled: event.target.checked })}
                className="mt-4 h-5 w-5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
              />
            </label>

            <label className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <span className="flex items-center gap-2 text-sm font-black text-[#001a33]">
                <Clock size={16} />
                Horário
              </span>
              <input
                type="time"
                value={draft.sendTime}
                onChange={(event) => updateDraft({ sendTime: event.target.value })}
                className="mt-4 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-[#001a33] outline-none focus:border-emerald-300 focus:ring-2 focus:ring-emerald-50"
              />
            </label>

            <label className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <span className="text-sm font-black text-[#001a33]">Nome da escola</span>
              <input
                value={draft.schoolName}
                onChange={(event) => updateDraft({ schoolName: event.target.value })}
                className="mt-4 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-[#001a33] outline-none focus:border-emerald-300 focus:ring-2 focus:ring-emerald-50"
              />
            </label>
          </div>

          <div className="mt-5 grid gap-5 lg:grid-cols-2">
            <div>
              <p className="text-xs font-black uppercase tracking-wide text-slate-500">Modalidades</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {BIRTHDAY_MODALITIES.map((item) => {
                  const checked = draft.modalities.includes(item.id);
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => updateDraft({ modalities: toggleListItem(draft.modalities, item.id) })}
                      className={`inline-flex min-h-[36px] items-center gap-2 rounded-xl border px-3 text-xs font-bold transition-colors ${
                        checked ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-white text-slate-500 hover:text-emerald-700'
                      }`}
                    >
                      {checked && <Check size={13} />}
                      {item.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <p className="text-xs font-black uppercase tracking-wide text-slate-500">Situação da matrícula</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {ENROLLMENT_STATUS_OPTIONS.map((item) => {
                  const checked = draft.enrollmentStatuses.includes(item.id);
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => updateDraft({ enrollmentStatuses: toggleListItem(draft.enrollmentStatuses, item.id) })}
                      className={`inline-flex min-h-[36px] items-center gap-2 rounded-xl border px-3 text-xs font-bold transition-colors ${
                        checked ? 'border-blue-200 bg-blue-50 text-blue-700' : 'border-slate-200 bg-white text-slate-500 hover:text-blue-700'
                      }`}
                    >
                      {checked && <Check size={13} />}
                      {item.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-center gap-2">
              <Sparkles size={17} className="text-pink-500" />
              <p className="text-sm font-black text-[#001a33]">Texto da mensagem</p>
            </div>
            <textarea
              value={draft.messageTemplate}
              onChange={(event) => updateDraft({ messageTemplate: event.target.value })}
              rows={5}
              className="mt-4 w-full rounded-xl border border-slate-200 bg-white p-3 text-sm font-semibold leading-relaxed text-[#001a33] outline-none focus:border-emerald-300 focus:ring-2 focus:ring-emerald-50"
            />
            <div className="mt-3 flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-3 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-wide text-slate-500">Frase motivacional no final</p>
                <p className="mt-1 text-xs font-semibold leading-relaxed text-slate-500">
                  O Supabase escolhe uma frase diferente do banco para variar a mensagem.
                </p>
              </div>
              <input
                type="checkbox"
                checked={draft.quoteEnabled}
                onChange={(event) => updateDraft({ quoteEnabled: event.target.checked })}
                className="h-5 w-5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
              />
            </div>
            <div className="mt-3">
              <p className="text-xs font-black uppercase tracking-wide text-slate-500">Variáveis disponíveis</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {BIRTHDAY_TEMPLATE_VARIABLES.map((variable) => (
                  <button
                    key={variable}
                    type="button"
                    onClick={() => appendTemplateVariable(variable)}
                    className="rounded-lg border border-pink-200 bg-white px-3 py-1.5 text-xs font-bold text-pink-700 transition-colors hover:bg-pink-50"
                  >
                    {variable}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-xs font-semibold leading-relaxed text-slate-500">
                {'{{frase_aniversario}}'} recebe automaticamente uma frase diferente do banco para cada aluno.
              </p>
            </div>
          </div>
        </section>

        <aside className="space-y-5">
          <div className="rounded-2xl border border-pink-100 bg-pink-50 p-5">
            <div className="flex items-center gap-2">
              <MessageSquareText size={18} className="text-pink-600" />
              <p className="text-sm font-black text-pink-900">Banco de mensagens</p>
            </div>
            <p className="mt-3 text-3xl font-black text-pink-700">{bankStats?.activeCount || 0}</p>
            <p className="mt-1 text-xs font-bold text-pink-900/70">combinações de mensagem geradas no Supabase.</p>
            <p className="mt-3 text-sm font-black text-pink-800">{bankStats?.quoteCount || 0} frases finais ativas</p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-black text-[#001a33]">Frases finais</p>
            <div className="mt-4 space-y-3">
              {(bankStats?.samples || []).map((sample) => (
                <div key={sample.id} className="rounded-xl bg-emerald-600 p-3 text-xs font-semibold leading-relaxed text-white">
                  {sample.content}
                </div>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
};

export default BirthdayAgentPanel;
