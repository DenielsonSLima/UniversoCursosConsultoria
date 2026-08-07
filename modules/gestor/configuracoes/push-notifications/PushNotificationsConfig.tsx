import { useEffect, useMemo, useState } from 'react';
import {
  BellRing,
  BookOpenCheck,
  CalendarClock,
  Check,
  Clock3,
  GraduationCap,
  Landmark,
  Loader2,
  LockKeyhole,
  Megaphone,
  MessageCircleMore,
  Save,
  ShieldCheck,
  TriangleAlert,
} from 'lucide-react';
import {
  DEFAULT_PUSH_NOTIFICATION_POLICY,
  type PushNotificationCategory,
  type PushNotificationPolicy,
} from './push-notifications.types';
import { usePushNotificationPolicy } from './usePushNotificationPolicy';

const categories: Array<{
  id: PushNotificationCategory;
  title: string;
  description: string;
  icon: typeof BellRing;
  accent: string;
}> = [
  { id: 'chat', title: 'Chat e conversas', description: 'Novas mensagens e respostas de atendimento.', icon: MessageCircleMore, accent: 'bg-blue-50 text-blue-700' },
  { id: 'financial', title: 'Financeiro', description: 'Vencimentos, atrasos e confirmação de pagamento.', icon: Landmark, accent: 'bg-emerald-50 text-emerald-700' },
  { id: 'academic', title: 'Aulas e acadêmico', description: 'Lembretes, alterações e cancelamentos de aula.', icon: GraduationCap, accent: 'bg-indigo-50 text-indigo-700' },
  { id: 'calendar', title: 'Calendário', description: 'Datas importantes e compromissos do curso.', icon: CalendarClock, accent: 'bg-amber-50 text-amber-700' },
  { id: 'institutional', title: 'Feriados e institucional', description: 'Funcionamento dos polos e comunicados oficiais.', icon: BookOpenCheck, accent: 'bg-cyan-50 text-cyan-700' },
  { id: 'marketing', title: 'Campanhas e envios em lote', description: 'Mensagens personalizadas, novidades e divulgação.', icon: Megaphone, accent: 'bg-rose-50 text-rose-700' },
];

const Toggle = ({ checked, onChange, label, disabled = false }: { checked: boolean; onChange: () => void; label: string; disabled?: boolean }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={label}
    disabled={disabled}
    onClick={onChange}
    className={`relative h-7 w-12 shrink-0 rounded-full transition ${checked ? 'bg-blue-600' : 'bg-slate-300'} disabled:cursor-not-allowed disabled:opacity-60`}
  >
    <span className={`absolute top-1 flex h-5 w-5 items-center justify-center rounded-full bg-white shadow-sm transition-transform ${checked ? 'translate-x-6' : 'translate-x-1'}`}>
      {checked ? <Check size={12} className="text-blue-600" strokeWidth={3} /> : null}
    </span>
  </button>
);

const clonePolicy = (policy: PushNotificationPolicy): PushNotificationPolicy => ({
  ...policy,
  categories: { ...policy.categories },
  quietHours: { ...policy.quietHours },
  privacy: { ...policy.privacy },
});

const PushNotificationsConfig = () => {
  const { policyQuery, savePolicy } = usePushNotificationPolicy();
  const [draft, setDraft] = useState<PushNotificationPolicy>(() => clonePolicy(DEFAULT_PUSH_NOTIFICATION_POLICY));
  const [saved, setSaved] = useState(false);
  const [isDirty, setIsDirty] = useState(false);

  useEffect(() => {
    if (policyQuery.data && !isDirty) setDraft(clonePolicy(policyQuery.data));
  }, [isDirty, policyQuery.data]);

  const hasChanges = useMemo(() => (
    Boolean(policyQuery.data) && JSON.stringify(draft) !== JSON.stringify(policyQuery.data)
  ), [draft, policyQuery.data]);

  const setCategory = (category: PushNotificationCategory) => {
    setSaved(false);
    setIsDirty(true);
    setDraft((current) => ({
      ...current,
      categories: { ...current.categories, [category]: !current.categories[category] },
    }));
  };

  const handleSave = async () => {
    setSaved(false);
    try {
      const persisted = await savePolicy.mutateAsync(draft);
      setDraft(clonePolicy(persisted));
      setIsDirty(false);
      setSaved(true);
    } catch {
      // O estado de erro da mutation mantém o formulário e exibe a falha sem perder o rascunho.
    }
  };

  if (policyQuery.isLoading) {
    return <div className="flex min-h-[520px] items-center justify-center" role="status"><Loader2 className="animate-spin text-violet-600" size={30} /><span className="sr-only">Carregando políticas de push</span></div>;
  }

  if (policyQuery.isError) {
    return (
      <div className="flex min-h-[520px] flex-col items-center justify-center text-center">
        <TriangleAlert className="text-rose-500" size={38} />
        <h2 className="mt-4 text-xl font-black text-[#001a33]">Não foi possível carregar as políticas</h2>
        <p className="mt-2 max-w-md text-sm font-medium text-slate-500">Confira sua conexão e tente novamente. Nenhuma configuração foi alterada.</p>
        <button type="button" onClick={() => void policyQuery.refetch()} className="mt-5 rounded-xl bg-[#001a33] px-5 py-3 text-xs font-black uppercase tracking-wider text-white">Tentar novamente</button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl">
      <header className="relative overflow-hidden rounded-[2rem] bg-[#001a33] p-6 text-white shadow-xl shadow-blue-950/10 sm:p-8">
        <div aria-hidden="true" className="absolute -right-10 -top-16 h-52 w-52 rounded-full border-[32px] border-violet-400/15" />
        <div className="relative flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div className="mb-3 flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.2em] text-violet-300"><BellRing size={16} /> Governança de notificações</div>
            <h2 className="text-3xl font-black tracking-tight">Políticas de push</h2>
            <p className="mt-2 max-w-2xl text-sm font-medium leading-relaxed text-slate-300">Defina quais eventos podem chegar ao celular. A escolha do aluno e a permissão do aparelho continuam sendo respeitadas.</p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <span className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-emerald-400/10 px-4 text-[10px] font-black uppercase tracking-wider text-emerald-200 ring-1 ring-emerald-300/20"><span className="h-2.5 w-2.5 rounded-full bg-emerald-300" /> Sincronização em tempo real</span>
            <button type="button" disabled={!hasChanges || savePolicy.isPending} onClick={() => void handleSave()} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-white px-5 text-xs font-black uppercase tracking-wider text-[#001a33] shadow-lg transition hover:bg-violet-50 disabled:cursor-not-allowed disabled:opacity-50">
              {savePolicy.isPending ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              {savePolicy.isPending ? 'Salvando' : 'Salvar política'}
            </button>
          </div>
        </div>
      </header>

      {savePolicy.isError ? <div role="alert" className="mt-5 flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-bold text-rose-800"><TriangleAlert className="mt-0.5 shrink-0" size={18} />Não foi possível salvar. A política anterior permanece ativa.</div> : null}
      {saved && !hasChanges ? <div role="status" className="mt-5 flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-800"><ShieldCheck className="mt-0.5 shrink-0" size={18} />Política salva e sincronizada com os outros gestores.</div> : null}

      <section className="mt-6 rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex items-start justify-between gap-5">
          <div><h3 className="text-lg font-black text-[#001a33]">Envio de push pelo sistema</h3><p className="mt-1 text-sm font-medium text-slate-500">A chave geral interrompe novos envios automáticos e manuais, sem alterar o consentimento dos aparelhos.</p></div>
          <Toggle checked={draft.enabled} onChange={() => { setSaved(false); setIsDirty(true); setDraft((current) => ({ ...current, enabled: !current.enabled })); }} label="Ativar envio de notificações push" />
        </div>
      </section>

      <div className={`mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3 ${draft.enabled ? '' : 'pointer-events-none opacity-50'}`} aria-disabled={!draft.enabled}>
        {categories.map(({ id, title, description, icon: Icon, accent }) => (
          <article key={id} className="group rounded-[1.5rem] border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-lg hover:shadow-blue-950/5">
            <div className="flex items-start justify-between gap-4"><div className={`flex h-11 w-11 items-center justify-center rounded-2xl ${accent}`}><Icon size={20} /></div><Toggle checked={draft.categories[id]} onChange={() => setCategory(id)} label={`Permitir ${title}`} disabled={!draft.enabled} /></div>
            <h3 className="mt-5 text-sm font-black text-[#001a33]">{title}</h3>
            <p className="mt-1.5 text-xs font-medium leading-relaxed text-slate-500">{description}</p>
          </article>
        ))}
      </div>

      <div className="mt-6 grid gap-5 xl:grid-cols-2">
        <section className="rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex items-start justify-between gap-4"><div className="flex gap-3"><div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-amber-50 text-amber-700"><Clock3 size={20} /></div><div><h3 className="font-black text-[#001a33]">Horário silencioso</h3><p className="mt-1 text-xs font-medium leading-relaxed text-slate-500">Eventos não urgentes aguardam o fim do período. O fuso é fixo em Maceió.</p></div></div><Toggle checked={draft.quietHours.enabled} onChange={() => { setSaved(false); setIsDirty(true); setDraft((current) => ({ ...current, quietHours: { ...current.quietHours, enabled: !current.quietHours.enabled } })); }} label="Ativar horário silencioso" disabled={!draft.enabled} /></div>
          <div className={`mt-5 grid grid-cols-2 gap-3 ${draft.quietHours.enabled && draft.enabled ? '' : 'opacity-45'}`}>
            <label className="text-[10px] font-black uppercase tracking-wider text-slate-500">Início<input type="time" value={draft.quietHours.start} disabled={!draft.quietHours.enabled || !draft.enabled} onChange={(event) => { setSaved(false); setIsDirty(true); setDraft((current) => ({ ...current, quietHours: { ...current.quietHours, start: event.target.value } })); }} className="mt-2 min-h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-black text-slate-700 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-50" /></label>
            <label className="text-[10px] font-black uppercase tracking-wider text-slate-500">Fim<input type="time" value={draft.quietHours.end} disabled={!draft.quietHours.enabled || !draft.enabled} onChange={(event) => { setSaved(false); setIsDirty(true); setDraft((current) => ({ ...current, quietHours: { ...current.quietHours, end: event.target.value } })); }} className="mt-2 min-h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-black text-slate-700 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-50" /></label>
          </div>
        </section>

        <section className="rounded-[1.75rem] border border-emerald-200 bg-emerald-50/60 p-5 shadow-sm sm:p-6">
          <div className="flex gap-3"><div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-600 text-white"><LockKeyhole size={20} /></div><div><div className="flex flex-wrap items-center gap-2"><h3 className="font-black text-[#001a33]">Conteúdo protegido</h3><span className="rounded-full bg-emerald-100 px-2 py-1 text-[9px] font-black uppercase tracking-wider text-emerald-800">Sempre ativo</span></div><p className="mt-1 text-xs font-medium leading-relaxed text-slate-600">Valores, boletos, situação financeira e conteúdo de conversas não aparecem na tela bloqueada. O aluno abre o app autenticado para consultar os detalhes.</p></div></div>
          <div className="mt-5 flex items-center gap-2 rounded-xl bg-white/80 px-4 py-3 text-[10px] font-black uppercase tracking-wider text-emerald-800 ring-1 ring-emerald-200"><ShieldCheck size={15} /> Proteção aplicada a Android e iPhone</div>
        </section>
      </div>

      <p className="mt-5 text-right text-[10px] font-bold text-slate-400">{draft.updatedAt ? `Última alteração: ${new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(draft.updatedAt))}` : 'Política inicial do sistema'}</p>
    </div>
  );
};

export default PushNotificationsConfig;
