import React, { useEffect, useMemo, useState } from 'react';
import {
  BellRing, Building2, Check, Clock3, Globe2, Loader2, MessageSquare,
  Plus, Save, Smartphone, Trash2, UserRound, Users, Wifi, WifiOff,
} from 'lucide-react';
import type {
  AtendimentoConfig,
  AtendimentoHorarios,
  AtendimentoStatusMode,
} from './atendimento-config.types';
import { useAtendimentoConfig } from './useAtendimentoConfig';

interface AtendimentoConfigPageProps {
  poloId: string | null;
  isGlobal: boolean;
}

const DAYS = [
  ['1', 'Segunda'], ['2', 'Terça'], ['3', 'Quarta'], ['4', 'Quinta'],
  ['5', 'Sexta'], ['6', 'Sábado'], ['0', 'Domingo'],
] as const;

const DEFAULT_HOURS: AtendimentoHorarios = Object.fromEntries(DAYS.map(([id]) => [
  id,
  { ativo: Number(id) >= 1 && Number(id) <= 5, inicio: '08:00', fim: id === '6' || id === '0' ? '12:00' : '18:00' },
]));

const createDefaultConfig = (poloId: string): AtendimentoConfig => ({
  polo_id: poloId,
  status_modo: 'automatico',
  permite_chat_publico: true,
  permite_chat_app: true,
  permite_novo_chamado: true,
  solicitar_notificacao_resposta: true,
  tempo_medio_resposta_minutos: 120,
  mensagem_online: 'Olá! Nossa equipe está online e responderá o mais rápido possível.',
  mensagem_offline: 'Não temos atendentes online neste momento. Deixe sua mensagem e retornaremos o mais rápido possível.',
  texto_notificacao_optin: 'Ative as notificações para ser avisado quando sua solicitação for respondida.',
  horarios: DEFAULT_HOURS,
});

const getInitials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase();

const formatSla = (minutes: number) => {
  if (minutes < 60) return `até ${minutes} min`;
  const hours = Math.round(minutes / 60);
  return `até ${hours} ${hours === 1 ? 'hora' : 'horas'}`;
};

const isOnlineNow = (config: AtendimentoConfig) => {
  if (config.status_modo === 'online') return true;
  if (config.status_modo === 'offline') return false;
  const now = new Date();
  const rule = config.horarios[String(now.getDay())];
  if (!rule?.ativo) return false;
  const current = now.getHours() * 60 + now.getMinutes();
  const [startHour, startMinute] = rule.inicio.split(':').map(Number);
  const [endHour, endMinute] = rule.fim.split(':').map(Number);
  return current >= startHour * 60 + startMinute && current < endHour * 60 + endMinute;
};

const AtendimentoConfigPage: React.FC<AtendimentoConfigPageProps> = ({ poloId, isGlobal }) => {
  const { workspace, saveConfig, addResponsavel, removeResponsavel } = useAtendimentoConfig(isGlobal ? null : poloId);
  const [selectedPoloId, setSelectedPoloId] = useState<string | null>(poloId);
  const [draft, setDraft] = useState<AtendimentoConfig | null>(null);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [selectedSector, setSelectedSector] = useState('atendimento_geral');
  const [feedback, setFeedback] = useState<string | null>(null);
  const data = workspace.data;

  useEffect(() => {
    if (!data?.polos.length) return;
    if (selectedPoloId && data.polos.some((item) => item.id === selectedPoloId)) return;
    setSelectedPoloId(poloId && data.polos.some((item) => item.id === poloId) ? poloId : data.polos[0].id);
  }, [data?.polos, poloId, selectedPoloId]);

  useEffect(() => {
    if (!selectedPoloId || !data) return;
    const stored = data.configs.find((item) => item.polo_id === selectedPoloId);
    setDraft(stored ? { ...stored, horarios: { ...DEFAULT_HOURS, ...stored.horarios } } : createDefaultConfig(selectedPoloId));
    setFeedback(null);
  }, [data, selectedPoloId]);

  const selectedPolo = data?.polos.find((item) => item.id === selectedPoloId) || null;
  const responsaveis = data?.responsaveis.filter((item) => item.polo_id === selectedPoloId) || [];
  const assignedUserIds = new Set(responsaveis.map((item) => item.usuario_id));
  const eligibleUsers = useMemo(() => (data?.usuarios || []).filter((user) => (
    user.pode_visualizar_todos_polos
    || user.polo_comunicacao_id === selectedPoloId
    || user.polo_ids.includes(selectedPoloId || '')
  )), [data?.usuarios, selectedPoloId]);
  const online = draft ? isOnlineNow(draft) : false;

  const update = <K extends keyof AtendimentoConfig>(field: K, value: AtendimentoConfig[K]) => {
    setDraft((current) => current ? { ...current, [field]: value } : current);
    setFeedback(null);
  };

  const updateSchedule = (day: string, field: 'ativo' | 'inicio' | 'fim', value: boolean | string) => {
    if (!draft) return;
    update('horarios', {
      ...draft.horarios,
      [day]: { ...draft.horarios[day], [field]: value },
    });
  };

  const handleSave = async () => {
    if (!draft) return;
    try {
      await saveConfig.mutateAsync(draft);
      setFeedback('Configuração salva e sincronizada em tempo real.');
    } catch (error: any) {
      setFeedback(error?.message || 'Não foi possível salvar a configuração.');
    }
  };

  const handleAddResponsible = async () => {
    if (!selectedPoloId || !selectedUserId) return;
    await addResponsavel.mutateAsync({
      polo_id: selectedPoloId,
      usuario_id: selectedUserId,
      setor: selectedSector,
      ativo: true,
      prioridade: 100,
    });
    setSelectedUserId('');
  };

  if (workspace.isLoading) return <div className="flex min-h-[520px] items-center justify-center rounded-[2rem] bg-white"><Loader2 className="animate-spin text-blue-600" size={30} /></div>;
  if (workspace.isError || !data) return <div className="rounded-[2rem] border border-rose-200 bg-white p-10 text-center font-bold text-rose-700">Não foi possível carregar as configurações de atendimento.</div>;

  return (
    <div className="animate-fadeIn overflow-hidden rounded-[2rem] border border-slate-200 bg-[#f3f7fb] shadow-sm">
      <header className="relative overflow-hidden bg-[#001a33] px-6 py-7 text-white sm:px-8">
        <div className="absolute inset-0 opacity-30 [background-image:radial-gradient(circle_at_15%_0%,rgba(37,99,235,.8),transparent_34%),linear-gradient(rgba(255,255,255,.05)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.05)_1px,transparent_1px)] [background-size:auto,28px_28px,28px_28px]" />
        <div className="relative flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-4"><span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-blue-600"><Users size={23} /></span><div><p className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-300">Operação por unidade</p><h1 className="mt-1 text-2xl font-black">Atendimento por polo</h1><p className="mt-2 max-w-3xl text-sm text-slate-300">Defina disponibilidade, prazo de resposta, mensagens e responsáveis. Esta tela não altera fluxos nem automações.</p></div></div>
          {draft ? <span className={`inline-flex items-center gap-2 self-start rounded-full px-4 py-2 text-xs font-black ring-1 ring-inset ${online ? 'bg-emerald-400/15 text-emerald-200 ring-emerald-300/20' : 'bg-amber-400/15 text-amber-100 ring-amber-300/20'}`}>{online ? <Wifi size={15} /> : <WifiOff size={15} />}{online ? 'Atendimento online' : 'Atendimento offline'}</span> : null}
        </div>
      </header>

      <div className="grid min-h-[680px] lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="border-b border-slate-200 bg-white p-4 lg:border-b-0 lg:border-r">
          <p className="px-2 text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Polos</p>
          <div className="mt-3 space-y-2">
            {data.polos.map((item) => {
              const config = data.configs.find((entry) => entry.polo_id === item.id) || createDefaultConfig(item.id);
              return <button key={item.id} type="button" onClick={() => setSelectedPoloId(item.id)} className={`w-full rounded-2xl border p-3 text-left transition ${selectedPoloId === item.id ? 'border-blue-200 bg-blue-50 shadow-sm' : 'border-transparent hover:bg-slate-50'}`}><div className="flex items-start gap-3"><span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${selectedPoloId === item.id ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500'}`}><Building2 size={17} /></span><div className="min-w-0"><p className="truncate text-sm font-black text-[#001a33]">{item.nome}</p><p className="mt-0.5 truncate text-xs font-semibold text-slate-500">{item.cidade} · {item.estado}</p><span className={`mt-2 inline-flex items-center gap-1 text-[10px] font-black uppercase ${isOnlineNow(config) ? 'text-emerald-700' : 'text-amber-700'}`}><i className={`h-2 w-2 rounded-full ${isOnlineNow(config) ? 'bg-emerald-500' : 'bg-amber-500'}`} />{isOnlineNow(config) ? 'Online' : 'Offline'}</span></div></div></button>;
            })}
          </div>
        </aside>

        {draft && selectedPolo ? (
          <div className="min-w-0 space-y-5 p-4 sm:p-6">
            <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between"><div><h2 className="text-lg font-black text-[#001a33]">{selectedPolo.nome}</h2><p className="mt-1 text-sm text-slate-500">Como a disponibilidade deve aparecer no chat público e no app.</p></div><div className="grid grid-cols-3 rounded-2xl bg-slate-100 p-1">{(['automatico', 'online', 'offline'] as AtendimentoStatusMode[]).map((mode) => <button key={mode} type="button" onClick={() => update('status_modo', mode)} className={`min-h-10 rounded-xl px-3 text-xs font-black capitalize ${draft.status_modo === mode ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500'}`}>{mode}</button>)}</div></div>
              <div className={`mt-5 rounded-2xl border p-4 ${online ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}><div className="flex gap-3"><span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white ${online ? 'text-emerald-700' : 'text-amber-700'}`}>{online ? <Wifi size={19} /> : <WifiOff size={19} />}</span><div><p className="text-sm font-black text-[#001a33]">{online ? 'Equipe disponível agora' : 'Fora do horário de atendimento'}</p><p className="mt-1 text-sm font-medium leading-5 text-slate-600">{online ? draft.mensagem_online : draft.mensagem_offline}</p><p className="mt-2 text-xs font-black text-blue-700">Tempo médio informado: {formatSla(draft.tempo_medio_resposta_minutos)}</p></div></div></div>
            </section>

            <section className="grid gap-5 xl:grid-cols-2">
              <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center gap-3"><Clock3 className="text-blue-600" size={20} /><div><h3 className="font-black text-[#001a33]">Horários e prazo</h3><p className="text-xs text-slate-500">Usados quando o modo está em automático.</p></div></div><label className="mt-5 block"><span className="text-xs font-black uppercase tracking-wide text-slate-500">Tempo médio de resposta (minutos)</span><input type="number" min={1} max={10080} value={draft.tempo_medio_resposta_minutos} onChange={(event) => update('tempo_medio_resposta_minutos', Math.max(1, Number(event.target.value)))} className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 font-bold text-slate-700 outline-none focus:border-blue-500" /></label><div className="mt-4 space-y-2">{DAYS.map(([id, label]) => { const rule = draft.horarios[id]; return <div key={id} className="grid grid-cols-[95px_1fr_1fr] items-center gap-2 rounded-xl bg-slate-50 p-2"><label className="flex items-center gap-2 text-xs font-bold text-slate-700"><input type="checkbox" checked={rule.ativo} onChange={(event) => updateSchedule(id, 'ativo', event.target.checked)} />{label}</label><input type="time" disabled={!rule.ativo} value={rule.inicio} onChange={(event) => updateSchedule(id, 'inicio', event.target.value)} className="h-9 min-w-0 rounded-lg border border-slate-200 px-2 text-xs font-bold disabled:opacity-40" /><input type="time" disabled={!rule.ativo} value={rule.fim} onChange={(event) => updateSchedule(id, 'fim', event.target.value)} className="h-9 min-w-0 rounded-lg border border-slate-200 px-2 text-xs font-bold disabled:opacity-40" /></div>; })}</div></div>
              <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center gap-3"><MessageSquare className="text-blue-600" size={20} /><div><h3 className="font-black text-[#001a33]">Mensagens ao usuário</h3><p className="text-xs text-slate-500">Textos curtos, claros e específicos do polo.</p></div></div><label className="mt-5 block"><span className="text-xs font-black uppercase tracking-wide text-slate-500">Quando online</span><textarea value={draft.mensagem_online} onChange={(event) => update('mensagem_online', event.target.value)} className="mt-2 h-24 w-full resize-none rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm font-semibold leading-5 outline-none focus:border-blue-500" /></label><label className="mt-4 block"><span className="text-xs font-black uppercase tracking-wide text-slate-500">Quando offline</span><textarea value={draft.mensagem_offline} onChange={(event) => update('mensagem_offline', event.target.value)} className="mt-2 h-28 w-full resize-none rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm font-semibold leading-5 outline-none focus:border-blue-500" /></label></div>
            </section>

            <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center gap-3"><Globe2 className="text-blue-600" size={20} /><div><h3 className="font-black text-[#001a33]">Canais e continuidade</h3><p className="text-xs text-slate-500">O histórico continua salvo mesmo quando o aluno fecha o app.</p></div></div><div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4"><ToggleCard icon={Globe2} title="Chat público" checked={draft.permite_chat_publico} onChange={(value) => update('permite_chat_publico', value)} /><ToggleCard icon={Smartphone} title="Chat no app" checked={draft.permite_chat_app} onChange={(value) => update('permite_chat_app', value)} /><ToggleCard icon={Plus} title="Novo chamado" checked={draft.permite_novo_chamado} onChange={(value) => update('permite_novo_chamado', value)} /><ToggleCard icon={BellRing} title="Oferecer notificações" checked={draft.solicitar_notificacao_resposta} onChange={(value) => update('solicitar_notificacao_resposta', value)} /></div><label className="mt-4 block"><span className="text-xs font-black uppercase tracking-wide text-slate-500">Convite para notificações</span><input value={draft.texto_notificacao_optin} onChange={(event) => update('texto_notificacao_optin', event.target.value)} className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-semibold outline-none focus:border-blue-500" /></label></section>

            <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between"><div><div className="flex items-center gap-3"><UserRound className="text-blue-600" size={20} /><h3 className="font-black text-[#001a33]">Responsáveis do polo</h3></div><p className="mt-1 text-xs text-slate-500">A foto e os dados pessoais são editados em Configurações → Usuários; aqui você define somente a fila de atendimento.</p></div><div className="flex flex-col gap-2 sm:flex-row"><select value={selectedUserId} onChange={(event) => setSelectedUserId(event.target.value)} className="h-11 min-w-[220px] rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold"><option value="">Selecione um usuário</option>{eligibleUsers.filter((user) => !assignedUserIds.has(user.id)).map((user) => <option key={user.id} value={user.id}>{user.nome}</option>)}</select><select value={selectedSector} onChange={(event) => setSelectedSector(event.target.value)} className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold"><option value="atendimento_geral">Atendimento geral</option><option value="secretaria">Secretaria</option><option value="financeiro">Financeiro</option><option value="comercial_matriculas">Comercial</option><option value="pedagogico_coordenacao">Pedagógico</option></select><button type="button" disabled={!selectedUserId || addResponsavel.isPending} onClick={handleAddResponsible} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#001a33] px-4 text-xs font-black text-white disabled:opacity-40"><Plus size={15} />Adicionar</button></div></div><div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">{responsaveis.length ? responsaveis.map((responsavel) => { const user = data.usuarios.find((item) => item.id === responsavel.usuario_id); if (!user) return null; return <article key={responsavel.id} className="flex items-center gap-3 rounded-2xl border border-slate-200 p-3"><span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-blue-50 text-sm font-black text-blue-700">{getInitials(user.nome)}</span><div className="min-w-0 flex-1"><p className="truncate text-sm font-black text-[#001a33]">{user.nome}</p><p className="truncate text-xs font-semibold text-slate-500">{responsavel.setor.replaceAll('_', ' ')}</p></div><button type="button" aria-label={`Remover ${user.nome}`} onClick={() => removeResponsavel.mutate(responsavel.id)} className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-400 hover:bg-rose-50 hover:text-rose-600"><Trash2 size={16} /></button></article>; }) : <div className="md:col-span-2 xl:col-span-3 rounded-2xl border border-dashed border-slate-300 p-6 text-center text-sm font-semibold text-slate-500">Nenhum responsável foi vinculado a este polo.</div>}</div></section>

            <div className="sticky bottom-4 z-10 flex flex-col items-stretch justify-between gap-3 rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-xl backdrop-blur sm:flex-row sm:items-center"><p className={`px-2 text-xs font-bold ${feedback?.startsWith('Configuração') ? 'text-emerald-700' : 'text-slate-500'}`}>{feedback || 'As alterações só entram em vigor depois de salvar.'}</p><button type="button" onClick={handleSave} disabled={saveConfig.isPending} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 text-xs font-black uppercase tracking-wide text-white shadow-lg shadow-blue-200 disabled:opacity-50">{saveConfig.isPending ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}Salvar atendimento</button></div>
          </div>
        ) : null}
      </div>
    </div>
  );
};

const ToggleCard = ({ icon: Icon, title, checked, onChange }: { icon: React.ElementType; title: string; checked: boolean; onChange: (value: boolean) => void }) => (
  <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)} className={`flex min-h-16 items-center gap-3 rounded-2xl border p-3 text-left ${checked ? 'border-blue-200 bg-blue-50' : 'border-slate-200 bg-slate-50'}`}><span className={`flex h-9 w-9 items-center justify-center rounded-xl ${checked ? 'bg-blue-600 text-white' : 'bg-white text-slate-400'}`}><Icon size={17} /></span><span className="min-w-0 flex-1 text-xs font-black text-[#001a33]">{title}</span><span className={`flex h-6 w-6 items-center justify-center rounded-full ${checked ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-400'}`}>{checked ? <Check size={13} /> : null}</span></button>
);

export default AtendimentoConfigPage;

