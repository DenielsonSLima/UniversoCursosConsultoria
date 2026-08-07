import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  BookOpenCheck,
  Bot,
  Check,
  ChevronDown,
  Database,
  GraduationCap,
  MessageCircleQuestion,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Search,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import {
  CourseAgentFaq,
  CourseAgentSettings,
  CourseAgentStats,
  DEFAULT_COURSE_AGENT_SETTINGS,
  EMPTY_COURSE_AGENT_FAQ,
} from './course-agent.types';

interface CourseSupportAgentPanelProps {
  connectionId: string;
  settings: CourseAgentSettings | null;
  faqs: CourseAgentFaq[];
  stats: CourseAgentStats | null;
  loading: boolean;
  savingSettings: boolean;
  savingFaq: boolean;
  deletingFaq: boolean;
  onSaveSettings: (settings: CourseAgentSettings) => void;
  onSaveFaq: (faq: CourseAgentFaq) => Promise<unknown>;
  onDeleteFaq: (id: string) => void;
}

const categoryLabels: Record<string, string> = {
  geral: 'Geral',
  matricula: 'Matrícula',
  documentos: 'Documentos',
  certificado: 'Certificado',
  valor: 'Valores',
  turma: 'Turmas',
  modalidade: 'Modalidades',
  estagio: 'Estágio',
  reconhecimento: 'Reconhecimento',
};

const CourseSupportAgentPanel: React.FC<CourseSupportAgentPanelProps> = ({
  connectionId,
  settings,
  faqs,
  stats,
  loading,
  savingSettings,
  savingFaq,
  deletingFaq,
  onSaveSettings,
  onSaveFaq,
  onDeleteFaq,
}) => {
  const [draft, setDraft] = useState<CourseAgentSettings>({
    connectionId,
    ...DEFAULT_COURSE_AGENT_SETTINGS,
  });
  const [faqDraft, setFaqDraft] = useState<CourseAgentFaq | null>(null);
  const [keywordText, setKeywordText] = useState('');
  const [search, setSearch] = useState('');
  const [showMessages, setShowMessages] = useState(false);

  useEffect(() => {
    setDraft({
      connectionId,
      ...DEFAULT_COURSE_AGENT_SETTINGS,
      ...(settings || {}),
    });
  }, [connectionId, settings]);

  const filteredFaqs = useMemo(() => {
    const normalized = search.trim().toLocaleLowerCase('pt-BR');
    if (!normalized) return faqs;
    return faqs.filter((faq) => [
      faq.question,
      faq.answer,
      faq.category,
      faq.courseName,
      ...faq.keywords,
    ].some((value) => String(value || '').toLocaleLowerCase('pt-BR').includes(normalized)));
  }, [faqs, search]);

  const openFaqEditor = (faq?: CourseAgentFaq, suggestedQuestion = '') => {
    const next = faq
      ? { ...faq, keywords: [...faq.keywords] }
      : {
        ...EMPTY_COURSE_AGENT_FAQ,
        connectionId,
        question: suggestedQuestion,
      };
    setFaqDraft(next);
    setKeywordText(next.keywords.join(', '));
  };

  const saveFaq = async () => {
    if (!faqDraft) return;
    try {
      await onSaveFaq({
        ...faqDraft,
        keywords: keywordText.split(',').map((item) => item.trim()).filter(Boolean),
      });
      setFaqDraft(null);
      setKeywordText('');
    } catch {
      // O hook já exibe o erro; o formulário permanece aberto para correção.
    }
  };

  const modalityEntries = (Object.entries(stats?.modalityCounts || {}) as Array<[string, number]>)
    .sort(([, countA], [, countB]) => countB - countA);

  if (loading) {
    return (
      <div className="min-h-0 flex-1 overflow-y-auto bg-slate-50 p-5 custom-scrollbar">
        <div className="flex items-center gap-3 border-b border-slate-200 bg-white p-5 text-sm font-bold text-slate-500">
          <RefreshCw size={18} className="animate-spin" />
          Preparando catálogo e base de respostas...
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto bg-slate-50 custom-scrollbar">
      <div className="mx-auto max-w-7xl">
        <header className="sticky top-0 z-10 flex flex-col gap-4 border-b border-slate-200 bg-white/95 px-6 py-5 backdrop-blur lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
              <BookOpenCheck size={21} />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-black text-[#001a33]">Agente de cursos e dúvidas</h2>
                <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-black uppercase tracking-wide text-blue-700">
                  Semiautomático
                </span>
              </div>
              <p className="mt-1 text-sm font-medium text-slate-500">
                Responde somente com cursos, turmas e informações aprovadas. Se não tiver segurança, chama o Comercial.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onSaveSettings(draft)}
            disabled={savingSettings || !draft.greetingMessage.trim() || !draft.fallbackMessage.trim() || !draft.handoffMessage.trim()}
            className="inline-flex min-h-[42px] shrink-0 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 text-xs font-black uppercase tracking-wide text-white shadow-sm transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {savingSettings ? <RefreshCw size={15} className="animate-spin" /> : <Save size={15} />}
            Salvar agente
          </button>
        </header>

        <section className="border-b border-slate-200 bg-white px-6 py-5">
          <div className="grid gap-x-8 gap-y-5 xl:grid-cols-[minmax(0,1fr)_420px]">
            <div>
              <div className="flex flex-wrap items-center gap-x-8 gap-y-4">
                <label className="flex cursor-pointer items-center gap-3">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={draft.enabled}
                    onClick={() => setDraft((current) => ({ ...current, enabled: !current.enabled }))}
                    className={`relative h-7 w-12 rounded-full transition-colors ${draft.enabled ? 'bg-emerald-600' : 'bg-slate-300'}`}
                  >
                    <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-transform ${draft.enabled ? 'translate-x-6' : 'translate-x-1'}`} />
                  </button>
                  <span>
                    <span className="block text-sm font-black text-[#001a33]">Agente ativo</span>
                    <span className="block text-xs font-medium text-slate-500">Atende a opção 4 do fluxo principal.</span>
                  </span>
                </label>

                <label className="flex min-w-[250px] flex-1 items-center gap-3">
                  <span className="shrink-0 text-sm font-bold text-slate-700">Segurança mínima</span>
                  <input
                    type="range"
                    min="0.15"
                    max="0.85"
                    step="0.05"
                    value={draft.confidenceThreshold}
                    onChange={(event) => setDraft((current) => ({
                      ...current,
                      confidenceThreshold: Number(event.target.value),
                    }))}
                    className="min-w-[120px] flex-1 accent-emerald-600"
                  />
                  <span className="w-11 text-right text-sm font-black text-emerald-700">
                    {Math.round(draft.confidenceThreshold * 100)}%
                  </span>
                </label>

                <label className="flex items-center gap-2 text-sm font-bold text-slate-700">
                  <span>Tentativas antes do humano</span>
                  <select
                    value={draft.maxClarifications}
                    onChange={(event) => setDraft((current) => ({
                      ...current,
                      maxClarifications: Number(event.target.value),
                    }))}
                    className="h-10 rounded-lg border border-slate-200 bg-white px-3 font-black text-[#001a33] outline-none focus:border-emerald-400"
                  >
                    {[0, 1, 2, 3].map((value) => <option key={value} value={value}>{value}</option>)}
                  </select>
                </label>
              </div>

              <div className="mt-5 flex flex-wrap gap-2">
                {[
                  { key: 'showPrices' as const, label: 'Mostrar valores publicados' },
                  { key: 'showOpenClasses' as const, label: 'Mostrar turmas publicadas' },
                ].map((item) => {
                  const checked = draft[item.key];
                  return (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => setDraft((current) => ({ ...current, [item.key]: !current[item.key] }))}
                      className={`inline-flex min-h-[38px] items-center gap-2 rounded-lg border px-3 text-xs font-bold transition-colors ${
                        checked
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                          : 'border-slate-200 bg-white text-slate-500'
                      }`}
                    >
                      <span className={`flex h-4 w-4 items-center justify-center rounded border ${checked ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-slate-300'}`}>
                        {checked && <Check size={11} />}
                      </span>
                      {item.label}
                    </button>
                  );
                })}
                <button
                  type="button"
                  onClick={() => setShowMessages((current) => !current)}
                  className="inline-flex min-h-[38px] items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-600 hover:border-slate-300"
                >
                  Mensagens do agente
                  <ChevronDown size={14} className={`transition-transform ${showMessages ? 'rotate-180' : ''}`} />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-3 divide-x divide-slate-200 rounded-xl border border-slate-200 bg-slate-50">
              <div className="px-4 py-3">
                <GraduationCap size={16} className="text-blue-600" />
                <p className="mt-2 text-xl font-black text-[#001a33]">{stats?.publicCourseCount || 0}</p>
                <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Cursos públicos</p>
              </div>
              <div className="px-4 py-3">
                <Users size={16} className="text-violet-600" />
                <p className="mt-2 text-xl font-black text-[#001a33]">{stats?.publicClassCount || 0}</p>
                <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Turmas públicas</p>
              </div>
              <div className="px-4 py-3">
                <Database size={16} className="text-emerald-600" />
                <p className="mt-2 text-xl font-black text-[#001a33]">{stats?.activeFaqCount || 0}</p>
                <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Respostas ativas</p>
              </div>
            </div>
          </div>

          {showMessages && (
            <div className="mt-5 grid gap-4 border-t border-slate-100 pt-5 lg:grid-cols-3">
              {[
                { key: 'greetingMessage' as const, label: 'Apresentação' },
                { key: 'fallbackMessage' as const, label: 'Pedir mais detalhes' },
                { key: 'handoffMessage' as const, label: 'Encaminhar ao Comercial' },
              ].map((item) => (
                <label key={item.key}>
                  <span className="text-xs font-black uppercase tracking-wide text-slate-500">{item.label}</span>
                  <textarea
                    rows={4}
                    value={draft[item.key]}
                    onChange={(event) => setDraft((current) => ({ ...current, [item.key]: event.target.value }))}
                    className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm font-semibold leading-relaxed text-[#001a33] outline-none focus:border-emerald-300 focus:bg-white focus:ring-2 focus:ring-emerald-50"
                  />
                </label>
              ))}
            </div>
          )}
        </section>

        <div className="grid min-h-[560px] xl:grid-cols-[minmax(0,1fr)_340px]">
          <section className="border-b border-slate-200 bg-white p-6 xl:border-b-0 xl:border-r">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <h3 className="flex items-center gap-2 text-base font-black text-[#001a33]">
                  <MessageCircleQuestion size={18} className="text-emerald-600" />
                  Base de respostas aprovadas
                </h3>
                <p className="mt-1 text-xs font-medium text-slate-500">
                  Cadastre perguntas de formas diferentes usando palavras-chave. O agente nunca inventa uma resposta.
                </p>
              </div>
              <button
                type="button"
                onClick={() => openFaqEditor()}
                className="inline-flex min-h-[40px] items-center justify-center gap-2 rounded-xl bg-[#001a33] px-4 text-xs font-black uppercase tracking-wide text-white hover:bg-[#00315d]"
              >
                <Plus size={15} /> Nova resposta
              </button>
            </div>

            {faqDraft && (
              <div className="mt-5 border-y border-emerald-200 bg-emerald-50/50 px-1 py-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-black text-emerald-900">
                      {faqDraft.id ? 'Editar resposta' : 'Cadastrar resposta'}
                    </p>
                    <p className="mt-0.5 text-xs font-medium text-emerald-700">
                      {faqDraft.connectionId ? 'Exclusiva deste número' : 'Base geral compartilhada'}
                    </p>
                  </div>
                  <button type="button" onClick={() => setFaqDraft(null)} className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-white">
                    <X size={17} />
                  </button>
                </div>
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <label className="md:col-span-2">
                    <span className="text-xs font-black uppercase tracking-wide text-slate-500">Pergunta ou dúvida</span>
                    <input
                      value={faqDraft.question}
                      onChange={(event) => setFaqDraft((current) => current && ({ ...current, question: event.target.value }))}
                      placeholder="Ex.: Quanto custa o curso de Enfermagem?"
                      className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-[#001a33] outline-none focus:border-emerald-400"
                    />
                  </label>
                  <label className="md:col-span-2">
                    <span className="text-xs font-black uppercase tracking-wide text-slate-500">Resposta aprovada</span>
                    <textarea
                      rows={4}
                      value={faqDraft.answer}
                      onChange={(event) => setFaqDraft((current) => current && ({ ...current, answer: event.target.value }))}
                      placeholder="Escreva somente a informação que o agente pode afirmar ao aluno."
                      className="mt-2 w-full rounded-xl border border-slate-200 bg-white p-3 text-sm font-semibold leading-relaxed text-[#001a33] outline-none focus:border-emerald-400"
                    />
                  </label>
                  <label>
                    <span className="text-xs font-black uppercase tracking-wide text-slate-500">Curso relacionado (opcional)</span>
                    <select
                      value={faqDraft.courseId || ''}
                      onChange={(event) => setFaqDraft((current) => current && ({ ...current, courseId: event.target.value || null }))}
                      className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-[#001a33] outline-none focus:border-emerald-400"
                    >
                      <option value="">Todos os cursos</option>
                      {(stats?.catalog || []).map((course) => (
                        <option key={course.id} value={course.id}>{course.name} · {course.modality}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span className="text-xs font-black uppercase tracking-wide text-slate-500">Categoria</span>
                    <select
                      value={faqDraft.category}
                      onChange={(event) => setFaqDraft((current) => current && ({ ...current, category: event.target.value }))}
                      className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-[#001a33] outline-none focus:border-emerald-400"
                    >
                      {Object.entries(categoryLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                  </label>
                  <label>
                    <span className="text-xs font-black uppercase tracking-wide text-slate-500">Palavras-chave, separadas por vírgula</span>
                    <input
                      value={keywordText}
                      onChange={(event) => setKeywordText(event.target.value)}
                      placeholder="preço, mensalidade, custa"
                      className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-[#001a33] outline-none focus:border-emerald-400"
                    />
                  </label>
                  <div className="flex flex-wrap items-end gap-4">
                    <label className="flex items-center gap-2 text-sm font-bold text-slate-700">
                      <input
                        type="checkbox"
                        checked={faqDraft.active}
                        onChange={(event) => setFaqDraft((current) => current && ({ ...current, active: event.target.checked }))}
                        className="h-5 w-5 rounded border-slate-300 text-emerald-600"
                      />
                      Resposta ativa
                    </label>
                    <label className="flex items-center gap-2 text-sm font-bold text-slate-700">
                      Prioridade
                      <input
                        type="number"
                        min="-100"
                        max="100"
                        value={faqDraft.priority}
                        onChange={(event) => setFaqDraft((current) => current && ({ ...current, priority: Number(event.target.value) }))}
                        className="h-10 w-20 rounded-lg border border-slate-200 bg-white px-2 text-center font-black text-[#001a33]"
                      />
                    </label>
                  </div>
                </div>
                <div className="mt-4 flex justify-end gap-2">
                  <button type="button" onClick={() => setFaqDraft(null)} className="min-h-[40px] rounded-xl px-4 text-xs font-black uppercase tracking-wide text-slate-500 hover:bg-white">
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={saveFaq}
                    disabled={savingFaq || faqDraft.question.trim().length < 3 || faqDraft.answer.trim().length < 3}
                    className="inline-flex min-h-[40px] items-center gap-2 rounded-xl bg-emerald-600 px-4 text-xs font-black uppercase tracking-wide text-white hover:bg-emerald-700 disabled:bg-slate-300"
                  >
                    {savingFaq ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />}
                    Salvar resposta
                  </button>
                </div>
              </div>
            )}

            <div className="relative mt-5">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar pergunta, resposta, curso ou palavra-chave..."
                className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-3 text-sm font-semibold text-[#001a33] outline-none focus:border-emerald-300 focus:bg-white"
              />
            </div>

            <div className="mt-3 divide-y divide-slate-100 border-y border-slate-200">
              {filteredFaqs.map((faq) => (
                <article key={faq.id} className={`group py-4 ${faq.active ? '' : 'opacity-55'}`}>
                  <div className="flex items-start gap-3">
                    <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${faq.active ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-black text-[#001a33]">{faq.question}</p>
                        <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-slate-500">
                          {categoryLabels[faq.category] || faq.category}
                        </span>
                        <span className={`rounded px-2 py-0.5 text-[10px] font-black uppercase tracking-wide ${faq.connectionId ? 'bg-blue-50 text-blue-700' : 'bg-violet-50 text-violet-700'}`}>
                          {faq.connectionId ? 'Esta linha' : 'Base geral'}
                        </span>
                      </div>
                      <p className="mt-1.5 line-clamp-2 text-sm font-medium leading-relaxed text-slate-500">{faq.answer}</p>
                      {(faq.courseName || faq.keywords.length > 0) && (
                        <p className="mt-2 text-xs font-semibold text-slate-400">
                          {[faq.courseName, ...faq.keywords].filter(Boolean).join(' · ')}
                        </p>
                      )}
                    </div>
                    <div className="flex shrink-0 gap-1 opacity-60 transition-opacity group-hover:opacity-100">
                      <button type="button" onClick={() => openFaqEditor(faq)} className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-blue-50 hover:text-blue-700" aria-label="Editar resposta">
                        <Pencil size={15} />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (faq.id && window.confirm('Remover esta resposta da base de conhecimento?')) onDeleteFaq(faq.id);
                        }}
                        disabled={deletingFaq}
                        className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
                        aria-label="Remover resposta"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                </article>
              ))}
              {filteredFaqs.length === 0 && (
                <div className="py-12 text-center">
                  <Bot size={24} className="mx-auto text-slate-300" />
                  <p className="mt-3 text-sm font-bold text-slate-500">Nenhuma resposta encontrada.</p>
                </div>
              )}
            </div>
          </section>

          <aside className="bg-slate-50 p-6">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">Catálogo conectado</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {modalityEntries.map(([modality, count]) => (
                  <span key={modality} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600">
                    {modality} <strong className="ml-1 text-[#001a33]">{count}</strong>
                  </span>
                ))}
              </div>
              <p className="mt-3 text-xs font-medium leading-relaxed text-slate-500">
                Alterações em cursos e turmas publicados entram na consulta automaticamente, sem duplicar cadastro.
              </p>
            </div>

            <div className="mt-7 border-t border-slate-200 pt-6">
              <div className="flex items-center gap-2">
                <MessageCircleQuestion size={17} className="text-amber-600" />
                <h3 className="text-sm font-black text-[#001a33]">Dúvidas sem resposta</h3>
              </div>
              <p className="mt-1 text-xs font-medium leading-relaxed text-slate-500">
                Perguntas com baixa confiança ficam aqui para você aprovar uma resposta.
              </p>
              <div className="mt-4 divide-y divide-slate-200">
                {(stats?.unanswered || []).map((item) => (
                  <button
                    key={`${item.query}-${item.lastAskedAt}`}
                    type="button"
                    onClick={() => openFaqEditor(undefined, item.query)}
                    className="group flex w-full items-start gap-3 py-3 text-left"
                  >
                    <span className="flex h-7 min-w-7 items-center justify-center rounded-lg bg-amber-50 px-2 text-xs font-black text-amber-700">
                      {item.count}×
                    </span>
                    <span className="min-w-0 flex-1 text-xs font-bold leading-relaxed text-slate-600">{item.query}</span>
                    <ArrowRight size={14} className="mt-1 shrink-0 text-slate-300 group-hover:text-emerald-600" />
                  </button>
                ))}
                {(stats?.unanswered || []).length === 0 && (
                  <div className="py-7 text-center">
                    <Check size={20} className="mx-auto text-emerald-500" />
                    <p className="mt-2 text-xs font-bold text-slate-500">Nenhuma dúvida pendente.</p>
                  </div>
                )}
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
};

export default CourseSupportAgentPanel;
