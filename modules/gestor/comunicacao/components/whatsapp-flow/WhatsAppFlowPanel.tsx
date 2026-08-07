import React, { useEffect, useMemo, useState } from 'react';
import {
  Bot,
  CheckCircle2,
  Clock3,
  Eye,
  FileText,
  MessageSquareText,
  PauseCircle,
  RefreshCcw,
  Save,
  ShieldCheck,
  SlidersHorizontal,
  Users,
  Workflow,
  X,
} from 'lucide-react';
import { DEFAULT_WHATSAPP_FLOW_SETTINGS } from '../whatsapp/whatsapp.service';
import { WhatsAppFlowSession, WhatsAppFlowSettings } from '../whatsapp/whatsapp.types';
import WhatsAppFlowBuilder from './WhatsAppFlowBuilder';
import {
  defaultFlowDefinition,
  getFlowDefinitionIssues,
  normalizeFlowDefinition,
} from './flowBuilder';
import { FlowTabId, flowGroupsByTab, flowTabs } from './flowGroups';

interface WhatsAppFlowPanelProps {
  connectionName?: string;
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
  course_agent: 'Agente de cursos',
  choosing_receivable: 'Escolhendo parcela',
  choosing_irpf_year: 'Escolhendo ano IRPF',
  awaiting_csat: 'Aguardando avaliação',
  handoff: 'Atendente',
  closed: 'Encerrado',
};

const previewText = (value: unknown) =>
  String(value || '').replace(/\\n/g, '\n').replace(/{{\s*nome_aluno\s*}}/gi, 'Denielson Santos Lima');

type PreviewLine = { side: string; text: string };

const formatNodePreview = (
  message: string,
  options: Array<{ label: string; enabled: boolean }>,
) => {
  const activeOptions = options.filter((item) => item.enabled);
  return [
    previewText(message),
    activeOptions.length
      ? activeOptions.map((item, index) => `${index + 1}️⃣ ${item.label}`).join('\n')
      : '',
  ].filter(Boolean).join('\n\n');
};

const FlowPreview: React.FC<{
  lines: PreviewLine[];
  onClose: () => void;
}> = ({ lines, onClose }) => (
  <aside className="border-t border-slate-200 bg-[#f8fafb] xl:border-l xl:border-t-0">
    <div className="sticky top-0">
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-4">
        <div className="flex items-center gap-2">
          <MessageSquareText size={16} className="text-emerald-700" />
          <span className="text-sm font-bold text-[#001a33]">Prévia do roteiro</span>
        </div>
        <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-700" aria-label="Fechar prévia">
          <X size={18} />
        </button>
      </div>
      <div className="max-h-[680px] space-y-3 overflow-y-auto px-4 py-4 custom-scrollbar">
        {lines.map((line, index) => (
          <div key={index} className={`flex ${line.side === 'bot' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[90%] whitespace-pre-line rounded-2xl px-3 py-2 text-sm font-medium leading-relaxed ${line.side === 'bot' ? 'rounded-br-md bg-emerald-600 text-white' : 'rounded-bl-md border border-slate-200 bg-white text-slate-600'}`}>
              {line.text}
            </div>
          </div>
        ))}
      </div>
    </div>
  </aside>
);

const WhatsAppFlowPanel: React.FC<WhatsAppFlowPanelProps> = ({
  connectionName,
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
  const [showPreview, setShowPreview] = useState(false);
  const [showSessions, setShowSessions] = useState(false);
  const [editorMode, setEditorMode] = useState<'builder' | 'messages'>('builder');
  const flowGroups = flowGroupsByTab[activeTab];
  const activeGroup = flowGroups.find((group) => group.title === openGroup) || flowGroups[0];
  const flowDefinition = useMemo(
    () => normalizeFlowDefinition(draft.routing_config?.flow_builder, draft.flow_type),
    [draft.flow_type, draft.routing_config?.flow_builder],
  );
  const builderIssues = useMemo(
    () => getFlowDefinitionIssues(flowDefinition),
    [flowDefinition],
  );

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
    if (editorMode === 'builder') {
      const startNode = flowDefinition.nodes.find((item) => item.id === flowDefinition.startNodeId)
        || flowDefinition.nodes[0];
      if (!startNode) return [];

      const lines: PreviewLine[] = [
        { side: 'aluno', text: 'Olá' },
        { side: 'bot', text: formatNodePreview(startNode.message, startNode.options) },
      ];
      const firstOption = startNode.options.find((item) => item.enabled);
      const nextNode = firstOption?.action === 'goto'
        ? flowDefinition.nodes.find((item) => item.id === firstOption.targetNodeId && item.enabled)
        : null;
      if (firstOption) lines.push({ side: 'aluno', text: '1' });
      if (nextNode) {
        lines.push({ side: 'bot', text: formatNodePreview(nextNode.message, nextNode.options) });
      } else if (firstOption?.responseMessage) {
        lines.push({ side: 'bot', text: previewText(firstOption.responseMessage) });
      }
      return lines;
    }
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
  }, [activeTab, draft, editorMode, flowDefinition]);

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

  const updateFlowDefinition = (flowBuilder: typeof flowDefinition) => {
    setDraft((current) => ({
      ...current,
      routing_config: {
        ...(current.routing_config || {}),
        flow_builder: flowBuilder,
      },
    }));
  };

  const restoreDefaultFlow = () => {
    const confirmed = window.confirm(
      'Restaurar o fluxo padrão desta linha? As alterações atuais só serão substituídas depois que você salvar.',
    );
    if (!confirmed) return;
    updateFlowDefinition(defaultFlowDefinition(draft.flow_type));
  };

  const saveDraft = () => {
    if (builderIssues.length > 0) {
      setEditorMode('builder');
      return;
    }
    onSave(draft);
  };

  if (loading) {
    return <div className="p-8 text-center text-sm font-bold text-slate-400">Carregando fluxo automático...</div>;
  }

  return (
    <div className="min-h-0 flex-1 touch-pan-y overflow-y-auto overscroll-contain bg-[#f4f7fa] pb-10 custom-scrollbar">
      <section className="min-h-full border-y border-slate-200 bg-white">
        <header className="border-b border-slate-200 px-5 py-4 lg:px-7">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
                <Bot size={19} />
              </span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="truncate text-lg font-bold text-[#001a33]">Fluxo automático</h3>
                  <span className="text-sm font-semibold text-slate-300">/</span>
                  <span className="truncate text-sm font-bold text-slate-600">{connectionName || 'linha selecionada'}</span>
                  <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ${draft.enabled ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${draft.enabled ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                    {draft.enabled ? 'Em operação' : 'Pausado'}
                  </span>
                </div>
                <p className="mt-0.5 text-sm font-medium text-slate-400">
                  {draft.flow_type === 'universo_main'
                    ? 'Fluxo compartilhado pelo WhatsApp principal, chat do aluno logado e chat público.'
                    : 'Roteiro independente desta linha de atendimento.'}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setShowSessions((current) => !current)}
                className={`inline-flex min-h-[40px] items-center gap-2 rounded-xl border px-3 text-sm font-bold transition-colors ${showSessions ? 'border-slate-300 bg-slate-100 text-[#001a33]' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}
              >
                <Users size={16} />
                Sessões
                <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-xs">{stats.active + stats.handoff}</span>
              </button>
              <button
                type="button"
                onClick={() => setShowPreview((current) => !current)}
                className={`inline-flex min-h-[40px] items-center gap-2 rounded-xl border px-3 text-sm font-bold transition-colors ${showPreview ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}
              >
                <Eye size={16} />
                {showPreview ? 'Fechar prévia' : 'Ver prévia'}
              </button>
              <button
                type="button"
                onClick={saveDraft}
                disabled={saving}
                className="inline-flex min-h-[40px] items-center gap-2 rounded-xl bg-emerald-600 px-4 text-sm font-bold text-white transition-colors hover:bg-emerald-700 disabled:opacity-60"
              >
                <Save size={16} />
                {saving ? 'Salvando...' : 'Salvar alterações'}
              </button>
            </div>
          </div>
        </header>

        <div className="flex flex-wrap items-center gap-x-6 gap-y-3 border-b border-slate-200 bg-slate-50/70 px-5 py-3 lg:px-7">
          <label className="inline-flex cursor-pointer items-center gap-3">
            <input
              type="checkbox"
              checked={draft.enabled}
              onChange={(event) => update('enabled', event.target.checked)}
              className="peer sr-only"
            />
            <span className="relative h-6 w-11 rounded-full bg-slate-300 transition-colors after:absolute after:left-1 after:top-1 after:h-4 after:w-4 after:rounded-full after:bg-white after:shadow-sm after:transition-transform peer-checked:bg-emerald-600 peer-checked:after:translate-x-5" />
            <span>
              <span className="block text-sm font-bold text-[#001a33]">Robô ativo</span>
              <span className="block text-xs font-medium text-slate-400">Respostas automáticas desta linha</span>
            </span>
          </label>

          <span className="hidden h-8 w-px bg-slate-200 sm:block" />

          <label className="inline-flex items-center gap-2 text-sm font-bold text-slate-600">
            <SlidersHorizontal size={15} className="text-slate-400" />
            Tentativas
            <input
              type="number"
              min={1}
              max={5}
              value={draft.max_attempts}
              onChange={(event) => updateAttempts(event.target.value)}
              className="h-9 w-16 rounded-lg border border-slate-200 bg-white px-2 text-sm font-bold text-slate-700 outline-none focus:border-emerald-400"
            />
          </label>

          <span className="hidden h-8 w-px bg-slate-200 sm:block" />

          <label className="inline-flex items-center gap-2 text-sm font-bold text-slate-600">
            <input
              type="checkbox"
              checked={draft.auto_close_enabled}
              onChange={(event) => update('auto_close_enabled', event.target.checked)}
              className="h-4 w-4 accent-emerald-600"
            />
            <Clock3 size={15} className="text-slate-400" />
            Encerrar após
            <input
              type="number"
              min={1}
              max={168}
              disabled={!draft.auto_close_enabled}
              value={draft.auto_close_hours}
              onChange={(event) => updateAutoCloseHours(event.target.value)}
              className="h-9 w-16 rounded-lg border border-slate-200 bg-white px-2 text-sm font-bold text-slate-700 outline-none focus:border-emerald-400 disabled:bg-slate-100 disabled:text-slate-400"
            />
            <span className="text-xs font-semibold text-slate-400">horas sem mensagem</span>
          </label>

          <div className="ml-auto inline-flex items-center gap-2 text-xs font-semibold text-emerald-700">
            <ShieldCheck size={15} />
            CPF e telefone precisam pertencer ao mesmo aluno
          </div>
        </div>

        {showSessions && (
          <section className="border-b border-slate-200 bg-white px-5 py-4 lg:px-7">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <h4 className="text-sm font-bold text-[#001a33]">Sessões recentes</h4>
                <p className="text-xs font-medium text-slate-400">{stats.active} ativa(s) no robô e {stats.handoff} com atendente</p>
              </div>
              <button type="button" onClick={() => setShowSessions(false)} className="text-slate-400 hover:text-slate-700" aria-label="Fechar sessões">
                <X size={18} />
              </button>
            </div>
            {sessions.length === 0 ? (
              <p className="border-t border-slate-100 py-4 text-sm font-medium text-slate-400">Nenhuma sessão iniciada ainda.</p>
            ) : (
              <div className="flex gap-3 overflow-x-auto pb-1 custom-scrollbar">
                {sessions.slice(0, 8).map((session) => (
                  <article key={session.id} className="min-w-[245px] border-l-2 border-slate-200 pl-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-[#001a33]">{session.aluno_nome || session.contato_nome || session.telefone}</p>
                        <p className="text-xs font-semibold text-slate-400">{statusLabel[session.status]}</p>
                      </div>
                      <CheckCircle2 size={15} className={session.handoff_required ? 'text-amber-500' : 'text-emerald-600'} />
                    </div>
                    <div className="mt-2 flex gap-2">
                      <button type="button" onClick={() => onPauseSession(session.conversa_id)} className="inline-flex h-8 items-center gap-1 rounded-lg bg-amber-50 px-2 text-xs font-bold text-amber-700">
                        <PauseCircle size={13} /> Atendente
                      </button>
                      <button type="button" onClick={() => onResetSession(session.conversa_id)} className="inline-flex h-8 items-center gap-1 rounded-lg bg-slate-100 px-2 text-xs font-bold text-slate-600">
                        <RefreshCcw size={13} /> Retomar
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-5 py-3 lg:px-7">
          <div className="inline-flex rounded-xl bg-slate-100 p-1">
            <button
              type="button"
              onClick={() => setEditorMode('builder')}
              className={`inline-flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-bold transition-colors ${editorMode === 'builder' ? 'bg-white text-[#001a33] shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              <Workflow size={15} />
              Construtor do fluxo
            </button>
            <button
              type="button"
              onClick={() => setEditorMode('messages')}
              className={`inline-flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-bold transition-colors ${editorMode === 'messages' ? 'bg-white text-[#001a33] shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              <FileText size={15} />
              Mensagens técnicas
            </button>
          </div>
          <p className="text-xs font-medium text-slate-400">
            {editorMode === 'builder'
              ? draft.flow_type === 'universo_main'
                ? 'Edite uma vez: este roteiro atende o número principal, o app e o site público.'
                : 'Edite etapas, opções, ordem e destinos exclusivos deste número.'
              : 'Ajuste textos de CPF, cobrança, IRPF, falha e transferência.'}
          </p>
        </div>

        {editorMode === 'builder' ? (
          <div className={`grid min-h-0 ${showPreview ? 'xl:grid-cols-[minmax(0,1fr)_340px]' : ''}`}>
            <WhatsAppFlowBuilder
              definition={flowDefinition}
              validationIssues={builderIssues}
              onChange={updateFlowDefinition}
              onRestoreDefault={restoreDefaultFlow}
            />
            {showPreview && (
              <FlowPreview lines={previewLines} onClose={() => setShowPreview(false)} />
            )}
          </div>
        ) : (
          <div className={`grid min-h-0 ${showPreview ? 'xl:grid-cols-[220px_minmax(0,1fr)_340px]' : 'xl:grid-cols-[220px_minmax(0,1fr)]'}`}>
          <nav className="border-b border-slate-200 bg-[#fbfcfd] px-4 py-4 xl:border-b-0 xl:border-r">
            <p className="mb-3 px-2 text-xs font-bold uppercase tracking-[0.14em] text-slate-400">Etapas do fluxo</p>
            <div className="flex gap-2 overflow-x-auto pb-1 xl:block xl:space-y-1 custom-scrollbar">
              {flowTabs.map((tab, index) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`group flex min-w-[190px] items-start gap-3 rounded-xl px-3 py-3 text-left transition-colors xl:w-full xl:min-w-0 ${activeTab === tab.id ? 'bg-emerald-50 text-emerald-800' : 'text-slate-500 hover:bg-slate-100 hover:text-[#001a33]'}`}
                >
                  <span className={`mt-0.5 text-xs font-black ${activeTab === tab.id ? 'text-emerald-600' : 'text-slate-300 group-hover:text-slate-400'}`}>0{index + 1}</span>
                  <span>
                    <span className="block text-sm font-bold">{tab.label}</span>
                    <span className="mt-0.5 block text-xs font-medium leading-snug opacity-70">{tab.summary}</span>
                  </span>
                </button>
              ))}
            </div>
          </nav>

          <main className="min-w-0 px-5 py-5 lg:px-7">
            <section>
              <div className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-200 pb-3">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.14em] text-emerald-600">{flowTabs.find((tab) => tab.id === activeTab)?.label}</p>
                  <h4 className="mt-1 text-lg font-bold text-[#001a33]">{activeGroup.title}</h4>
                  <p className="mt-1 max-w-3xl text-sm font-medium leading-relaxed text-slate-500">{activeGroup.description}</p>
                </div>
                {flowGroups.length > 1 && (
                  <div className="flex rounded-xl bg-slate-100 p-1">
                    {flowGroups.map((group) => (
                      <button
                        key={group.title}
                        type="button"
                        onClick={() => setOpenGroup(group.title)}
                        className={`rounded-lg px-3 py-2 text-xs font-bold transition-colors ${activeGroup.title === group.title ? 'bg-white text-[#001a33] shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                      >
                        {group.title}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div>
                {activeGroup.fields.map((item) => (
                  <label key={item.field} className="grid gap-3 border-b border-slate-100 py-5 lg:grid-cols-[230px_minmax(0,1fr)]">
                    <span>
                      <span className="block text-sm font-bold text-[#001a33]">{item.label}</span>
                      <span className="mt-1 block text-xs font-medium leading-relaxed text-slate-400">{item.help}</span>
                    </span>
                    <textarea
                      value={String(draft[item.field] || '').replace(/\\n/g, '\n')}
                      onChange={(event) => update(item.field, event.target.value)}
                      rows={item.rows || 3}
                      className="w-full resize-y rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3 text-sm font-medium leading-relaxed text-slate-700 outline-none transition-colors placeholder:text-slate-300 focus:border-emerald-400 focus:bg-white focus:ring-4 focus:ring-emerald-50"
                    />
                  </label>
                ))}
              </div>

              <div className="flex items-center justify-between gap-4 pt-5">
                <p className="text-xs font-medium text-slate-400">{activeGroup.fields.length} mensagens nesta etapa</p>
                <button
                  type="button"
                  onClick={saveDraft}
                  disabled={saving}
                  className="inline-flex min-h-[40px] items-center gap-2 rounded-xl bg-emerald-600 px-4 text-sm font-bold text-white transition-colors hover:bg-emerald-700 disabled:opacity-60"
                >
                  <Save size={15} />
                  {saving ? 'Salvando...' : 'Salvar esta etapa'}
                </button>
              </div>
            </section>
          </main>

            {showPreview && (
              <FlowPreview lines={previewLines} onClose={() => setShowPreview(false)} />
            )}
          </div>
        )}
      </section>
    </div>
  );
};

export default WhatsAppFlowPanel;
