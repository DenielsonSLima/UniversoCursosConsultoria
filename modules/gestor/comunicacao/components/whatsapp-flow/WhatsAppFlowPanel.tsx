import React, { useEffect, useMemo, useState } from 'react';
import { Bot, CheckCircle2, ChevronDown, MessageSquareText, PauseCircle, RefreshCcw, Save, ShieldCheck } from 'lucide-react';
import { DEFAULT_WHATSAPP_FLOW_SETTINGS } from '../whatsapp/whatsapp.service';
import { WhatsAppFlowSession, WhatsAppFlowSettings } from '../whatsapp/whatsapp.types';
import { FlowTabId, flowGroupsByTab, flowTabs } from './flowGroups';

interface WhatsAppFlowPanelProps {
  settings?: WhatsAppFlowSettings | null;
  sessions: WhatsAppFlowSession[];
  loading: boolean;
  saving: boolean;
  onSave: (settings: WhatsAppFlowSettings) => void;
  onPauseSession: (conversationId: string) => void;
  onResetSession: (conversationId: string) => void;
}

const statusLabel: Record<WhatsAppFlowSession['status'], string> = {
  awaiting_cpf: 'Aguardando CPF',
  menu: 'Menu ativo',
  choosing_receivable: 'Escolhendo parcela',
  choosing_irpf_year: 'Escolhendo ano IRPF',
  handoff: 'Atendente',
  closed: 'Encerrado',
};

const previewText = (value: unknown) =>
  String(value || '').replace(/\\n/g, '\n').replace(/{{\s*nome_aluno\s*}}/gi, 'Denielson Santos Lima');

const WhatsAppFlowPanel: React.FC<WhatsAppFlowPanelProps> = ({
  settings,
  sessions,
  loading,
  saving,
  onSave,
  onPauseSession,
  onResetSession,
}) => {
  const [draft, setDraft] = useState<WhatsAppFlowSettings>(DEFAULT_WHATSAPP_FLOW_SETTINGS);
  const [activeTab, setActiveTab] = useState<FlowTabId>('geral');
  const [openGroup, setOpenGroup] = useState(flowGroupsByTab.geral[0].title);
  const flowGroups = flowGroupsByTab[activeTab];

  useEffect(() => {
    setDraft({ ...DEFAULT_WHATSAPP_FLOW_SETTINGS, ...(settings || {}) });
  }, [settings]);

  useEffect(() => {
    setOpenGroup(flowGroupsByTab[activeTab][0]?.title || '');
  }, [activeTab]);

  const stats = useMemo(() => ({
    active: sessions.filter((item) => !item.handoff_required && !['handoff', 'closed'].includes(item.status)).length,
    handoff: sessions.filter((item) => item.handoff_required || item.status === 'handoff').length,
  }), [sessions]);

  const previewLines = useMemo(() => {
    const byTab = {
      geral: [
        ['aluno', 'Oi, preciso de atendimento.'],
        ['bot', draft.menu_message],
        ['aluno', '1'],
        ['bot', draft.welcome_message],
        ['aluno', '12345678900'],
      ],
      cobranca: [
        ['aluno', '2'],
        ['bot', draft.pix_intro_message],
        ['bot', '00020101021226880014br.gov.bcb.pix...'],
      ],
      documentos: [
        ['aluno', 'Quero meu IRPF'],
        ['bot', draft.irpf_year_choice_message],
        ['aluno', '1'],
        ['bot', draft.irpf_ready_message],
        ['bot', draft.irpf_link_intro_message],
        ['bot', 'https://www.universocc.com.br/validador?q=IRPF-0000-0000-0000'],
      ],
    }[activeTab];
    return byTab.map(([side, text]) => ({ side, text: previewText(text) }));
  }, [activeTab, draft]);

  const update = (field: keyof WhatsAppFlowSettings, value: string | number | boolean) => {
    setDraft((current) => ({ ...current, [field]: value }));
  };

  const updateAttempts = (value: string) => {
    const next = Math.min(5, Math.max(1, Number(value || 1)));
    update('max_attempts', next);
  };

  const updateAutoCloseHours = (value: string) => {
    const next = Math.min(168, Math.max(1, Number(value || 24)));
    update('auto_close_hours', next);
  };

  if (loading) {
    return <div className="p-8 text-center text-sm font-bold text-slate-400">Carregando fluxo automático...</div>;
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto bg-slate-50 p-5 custom-scrollbar">
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-4">
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700">
                <Bot size={20} />
              </div>
              <div>
                <h3 className="text-lg font-bold text-[#001a33]">Fluxo automático de cobrança</h3>
                <p className="text-sm font-medium text-slate-400">Menu imediato; CPF somente para cobrança e documentos. Atendimento humano sem CPF.</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onSave(draft)}
              disabled={saving}
              className="inline-flex min-h-[40px] items-center gap-2 rounded-xl bg-emerald-600 px-4 text-xs font-bold uppercase tracking-wide text-white transition-colors hover:bg-emerald-700 disabled:opacity-60"
            >
              <Save size={15} />
              {saving ? 'Salvando...' : 'Salvar ajustes gerais'}
            </button>
          </div>

          <div className="grid gap-4 py-5 md:grid-cols-2 xl:grid-cols-4">
            <label className="flex min-h-[84px] cursor-pointer items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4">
              <span>
                <span className="block text-sm font-bold text-[#001a33]">Robô ativo</span>
                <span className="text-xs font-medium text-slate-400">Responde alunos automaticamente.</span>
              </span>
              <input
                type="checkbox"
                checked={draft.enabled}
                onChange={(event) => update('enabled', event.target.checked)}
                className="h-5 w-5 accent-emerald-600"
              />
            </label>
            <label className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <span className="block text-sm font-bold text-[#001a33]">Tentativas</span>
              <input
                type="number"
                min={1}
                max={5}
                value={draft.max_attempts}
                onChange={(event) => updateAttempts(event.target.value)}
                className="mt-2 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 outline-none focus:border-emerald-300"
              />
            </label>
            <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3">
              <div className="flex items-center gap-2 text-sm font-bold text-emerald-800"><ShieldCheck size={16} /> Validação</div>
              <p className="mt-1 text-xs font-semibold leading-relaxed text-emerald-700">CPF com ou sem pontuação. Só libera cobrança se telefone e CPF forem do mesmo aluno.</p>
            </div>
            <label className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <span className="flex items-center justify-between gap-2">
                <span className="text-sm font-bold text-[#001a33]">Encerrar por inatividade</span>
                <input
                  type="checkbox"
                  checked={draft.auto_close_enabled}
                  onChange={(event) => update('auto_close_enabled', event.target.checked)}
                  className="h-5 w-5 accent-emerald-600"
                />
              </span>
              <span className="mt-1 block text-[11px] font-semibold text-slate-400">Prazo sem novas mensagens (horas)</span>
              <input
                type="number"
                min={1}
                max={168}
                disabled={!draft.auto_close_enabled}
                value={draft.auto_close_hours}
                onChange={(event) => updateAutoCloseHours(event.target.value)}
                className="mt-2 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 outline-none focus:border-emerald-300 disabled:opacity-50"
              />
            </label>
          </div>

          <div className="mb-5 grid gap-3 md:grid-cols-3">
            {flowTabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`rounded-2xl border px-4 py-3 text-left transition-colors ${activeTab === tab.id ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-white hover:bg-slate-50'}`}
              >
                <p className={`text-xs font-bold uppercase tracking-wide ${activeTab === tab.id ? 'text-emerald-700' : 'text-slate-500'}`}>{tab.label}</p>
                <p className="mt-1 text-xs font-semibold text-slate-500">{tab.summary}</p>
              </button>
            ))}
          </div>

          <div className="space-y-5">
            {flowGroups.map((group) => (
              <section key={group.title} className="rounded-2xl border border-slate-200 bg-slate-50 shadow-sm">
                <button
                  type="button"
                  onClick={() => setOpenGroup((current) => current === group.title ? '' : group.title)}
                  className="flex w-full items-start justify-between gap-4 px-4 py-4 text-left"
                >
                  <span>
                    <span className="block text-sm font-bold text-[#001a33]">{group.title}</span>
                    <span className="mt-1 block text-xs font-semibold leading-relaxed text-slate-500">{group.description}</span>
                    <span className="mt-3 inline-flex rounded-full bg-white px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                      {group.fields.length} mensagem(ns) configurável(is)
                    </span>
                  </span>
                  <span className={`mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition-transform ${openGroup === group.title ? 'rotate-180' : ''}`}>
                    <ChevronDown size={16} />
                  </span>
                </button>

                {openGroup === group.title && (
                  <div className="border-t border-slate-200 px-4 py-4">
                    <div className="grid gap-4 md:grid-cols-2">
                      {group.fields.map((item) => (
                        <label key={item.field} className="block">
                          <span className="block text-xs font-bold uppercase tracking-wide text-slate-500">{item.label}</span>
                          <span className="mt-1 block min-h-[32px] text-[11px] font-semibold leading-relaxed text-slate-400">{item.help}</span>
                          <textarea
                            value={String(draft[item.field] || '').replace(/\\n/g, '\n')}
                            onChange={(event) => update(item.field, event.target.value)}
                            rows={item.rows || 3}
                            className="mt-2 w-full resize-y rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium leading-relaxed text-slate-700 outline-none transition-colors focus:border-emerald-300"
                          />
                        </label>
                      ))}
                    </div>
                    <div className="mt-4 flex justify-end">
                      <button
                        type="button"
                        onClick={() => onSave(draft)}
                        disabled={saving}
                        className="inline-flex min-h-[38px] items-center gap-2 rounded-xl bg-emerald-600 px-4 text-xs font-bold uppercase tracking-wide text-white transition-colors hover:bg-emerald-700 disabled:opacity-60"
                      >
                        <Save size={14} />
                        {saving ? 'Salvando...' : 'Salvar esta etapa'}
                      </button>
                    </div>
                  </div>
                )}
              </section>
            ))}
          </div>
        </section>

        <aside className="space-y-5">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center gap-2 text-sm font-bold text-[#001a33]">
              <MessageSquareText size={16} />
              Prévia do roteiro
            </div>
            <div className="space-y-2">
              {previewLines.map((line, index) => (
                <div key={index} className={`flex ${line.side === 'bot' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[88%] whitespace-pre-line rounded-2xl px-3 py-2 text-xs font-semibold leading-relaxed ${line.side === 'bot' ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600'}`}>
                    {line.text}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h4 className="text-sm font-bold text-[#001a33]">Sessões recentes</h4>
                <p className="text-xs font-medium text-slate-400">{stats.active} ativa(s), {stats.handoff} em atendimento</p>
              </div>
              <CheckCircle2 size={18} className={draft.enabled ? 'text-emerald-600' : 'text-slate-300'} />
            </div>

            <div className="space-y-2">
              {sessions.length === 0 ? (
                <p className="rounded-2xl bg-slate-50 px-4 py-6 text-center text-xs font-bold text-slate-400">Nenhuma sessão iniciada ainda.</p>
              ) : sessions.slice(0, 8).map((session) => (
                <div key={session.id} className="rounded-2xl border border-slate-100 bg-slate-50 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-[#001a33]">{session.aluno_nome || session.contato_nome || session.telefone}</p>
                      <p className="text-xs font-semibold text-slate-400">{statusLabel[session.status]}</p>
                    </div>
                    <span className={`rounded-full px-2 py-1 text-[10px] font-bold uppercase ${session.handoff_required ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
                      {session.handoff_required ? 'Atendente' : 'Robô'}
                    </span>
                  </div>
                  <div className="mt-3 flex gap-2">
                    <button onClick={() => onPauseSession(session.conversa_id)} className="inline-flex h-8 items-center gap-1 rounded-lg bg-amber-50 px-2 text-[11px] font-bold text-amber-700">
                      <PauseCircle size={13} /> Atendente
                    </button>
                    <button onClick={() => onResetSession(session.conversa_id)} className="inline-flex h-8 items-center gap-1 rounded-lg bg-slate-100 px-2 text-[11px] font-bold text-slate-600">
                      <RefreshCcw size={13} /> Retomar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
};

export default WhatsAppFlowPanel;
