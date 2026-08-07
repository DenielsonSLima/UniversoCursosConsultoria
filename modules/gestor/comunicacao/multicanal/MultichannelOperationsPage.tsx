import React, { useMemo, useState } from 'react';
import {
  BellRing, Bot, Check, Globe2, Inbox, MessageCircle,
  Settings2, ShieldCheck, Smartphone, Users, WalletCards,
} from 'lucide-react';

export type MultichannelOperationsMode = 'overdue' | 'agents' | 'settings';

interface MultichannelOperationsPageProps {
  mode: MultichannelOperationsMode;
}

const CONVERSATION_CHANNELS = [
  { id: 'public', label: 'Chat público', detail: 'Sem login, com identificação progressiva', icon: Globe2, tone: 'border-cyan-200 bg-cyan-50 text-cyan-800' },
  { id: 'app', label: 'App do aluno', detail: 'Chat autenticado + notificação no celular', icon: Smartphone, tone: 'border-blue-200 bg-blue-50 text-blue-800' },
  { id: 'whatsapp', label: 'WhatsApp', detail: 'Atendimento pela API oficial da Meta', icon: MessageCircle, tone: 'border-emerald-200 bg-emerald-50 text-emerald-800' },
] as const;

const MODE_CONTENT = {
  overdue: {
    eyebrow: 'Cobrança multicanal',
    title: 'Atrasados',
    description: 'Prepare avisos para o app do aluno, WhatsApp ou os dois canais, sem duplicar a regra financeira.',
    icon: WalletCards,
  },
  agents: {
    eyebrow: 'Inteligência compartilhada',
    title: 'Agentes',
    description: 'Conhecimento, segurança e transferência humana configurados uma vez para os três canais.',
    icon: Bot,
  },
  settings: {
    eyebrow: 'Central de canais',
    title: 'Configurações da comunicação',
    description: 'Administre cada canal separadamente sem transformar toda a comunicação em WhatsApp.',
    icon: Settings2,
  },
} as const;

const ChannelCards = ({ activeIds }: { activeIds: string[] }) => (
  <div className="grid gap-3 lg:grid-cols-3">
    {CONVERSATION_CHANNELS.map((channel) => {
      const Icon = channel.icon;
      const active = activeIds.includes(channel.id);
      return (
        <article key={channel.id} className={`rounded-2xl border p-4 ${active ? channel.tone : 'border-slate-200 bg-slate-50 text-slate-500'}`}>
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/80 shadow-sm"><Icon size={19} /></span>
            <div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-2"><h3 className="text-sm font-black">{channel.label}</h3><span className={`h-2.5 w-2.5 rounded-full ${active ? 'bg-emerald-500' : 'bg-slate-300'}`} /></div><p className="mt-1 text-xs font-semibold leading-5 opacity-75">{channel.detail}</p></div>
          </div>
        </article>
      );
    })}
  </div>
);

const OverdueWorkspace = () => {
  const [delivery, setDelivery] = useState<'app' | 'whatsapp' | 'both'>('both');
  const activeIds = delivery === 'both' ? ['app', 'whatsapp'] : [delivery];
  return (
    <div className="space-y-5">
      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between"><div><h2 className="text-lg font-black text-[#001a33]">Destino dos avisos</h2><p className="mt-1 text-sm text-slate-600">No App, a mensagem fica no atendimento do aluno e o push apenas avisa que existe uma nova mensagem.</p></div><div className="grid min-w-[320px] grid-cols-3 rounded-2xl bg-slate-100 p-1">{(['app', 'whatsapp', 'both'] as const).map((id) => <button key={id} type="button" onClick={() => setDelivery(id)} className={`min-h-11 rounded-xl px-3 text-xs font-black transition ${delivery === id ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500'}`}>{id === 'app' ? 'App' : id === 'whatsapp' ? 'WhatsApp' : 'Ambos'}</button>)}</div></div>
        <div className="mt-5"><ChannelCards activeIds={activeIds} /></div>
        <div className="mt-5 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-900"><ShieldCheck size={19} className="mt-0.5 shrink-0" /><div><p className="text-sm font-black">Envio único e rastreável</p><p className="mt-1 text-xs font-semibold leading-5 text-amber-800">“Ambos” deverá gerar duas entregas do mesmo evento, com idempotência e histórico individual por canal. O chat público não recebe cobrança proativa.</p></div></div>
      </section>
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"><div className="flex flex-col items-center justify-center py-10 text-center"><span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-blue-700"><WalletCards size={25} /></span><h3 className="mt-4 text-lg font-black text-[#001a33]">Fila multicanal de atrasos</h3><p className="mt-2 max-w-xl text-sm leading-6 text-slate-600">A carteira financeira será conectada ao novo dispatcher. O envio direto pelo navegador e pelo painel antigo do WhatsApp foi retirado desta rota para evitar canais divergentes.</p><span className="mt-4 rounded-full bg-amber-50 px-3 py-1.5 text-xs font-black text-amber-800 ring-1 ring-amber-200">Integração do dispatcher pendente</span></div></section>
    </div>
  );
};

const AgentWorkspace = () => {
  const agents = useMemo(() => [
    { name: 'Cursos e dúvidas', detail: 'Catálogo, turmas, preços publicados e respostas aprovadas', icon: Bot },
    { name: 'Acesso do aluno', detail: 'Triagem, identificação e transferência para atendimento humano', icon: Users },
  ], []);
  return (
    <div className="space-y-5"><ChannelCards activeIds={['public', 'app', 'whatsapp']} /><div className="grid gap-4 lg:grid-cols-2">{agents.map((agent) => { const Icon = agent.icon; return <article key={agent.name} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-start gap-4"><span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700"><Icon size={22} /></span><div><div className="flex flex-wrap items-center gap-2"><h2 className="text-lg font-black text-[#001a33]">{agent.name}</h2><span className="rounded-full bg-blue-50 px-2 py-1 text-[10px] font-black uppercase tracking-wider text-blue-700">Compartilhado</span></div><p className="mt-2 text-sm leading-6 text-slate-600">{agent.detail}</p></div></div><div className="mt-5 flex flex-wrap gap-2">{CONVERSATION_CHANNELS.map((channel) => <span key={channel.id} className="inline-flex items-center gap-1.5 rounded-xl bg-slate-50 px-2.5 py-2 text-xs font-black text-slate-600 ring-1 ring-slate-200"><Check size={12} className="text-emerald-600" />{channel.label}</span>)}</div></article>; })}</div><div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs font-semibold leading-5 text-amber-800">Aniversário será tratado em Automações, porque é um evento programado — não um agente conversacional.</div></div>
  );
};

const SettingsWorkspace = () => (
  <div className="space-y-5"><ChannelCards activeIds={['public', 'app', 'whatsapp']} /><div className="grid gap-4 lg:grid-cols-3">{[
    ['Chat público', 'Sessão temporária, proteção antirrobô e identificação progressiva', Globe2],
    ['App e notificações', 'Chat autenticado, dispositivos, consentimento e deep links', BellRing],
    ['WhatsApp', 'Linhas, API da Meta, modelos e qualidade da conexão', MessageCircle],
  ].map(([title, detail, Icon]) => <article key={String(title)} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"><span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-50 text-blue-700"><Icon size={20} /></span><h2 className="mt-4 text-base font-black text-[#001a33]">{String(title)}</h2><p className="mt-2 text-sm leading-6 text-slate-600">{String(detail)}</p><button type="button" disabled className="mt-5 min-h-10 w-full rounded-xl bg-slate-100 text-xs font-black text-slate-400">Configuração por canal</button></article>)}</div></div>
);

const MultichannelOperationsPage: React.FC<MultichannelOperationsPageProps> = ({ mode }) => {
  const content = MODE_CONTENT[mode];
  const Icon = content.icon;
  return (
    <div className="animate-fadeIn overflow-hidden rounded-[2rem] border border-slate-200 bg-[#f3f7fb] shadow-sm">
      <header className="relative overflow-hidden bg-[#001a33] px-6 py-7 text-white sm:px-8"><div className="absolute inset-0 opacity-30 [background-image:radial-gradient(circle_at_15%_0%,rgba(37,99,235,.8),transparent_34%),linear-gradient(rgba(255,255,255,.05)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.05)_1px,transparent_1px)] [background-size:auto,28px_28px,28px_28px]" /><div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-start gap-4"><span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-blue-600 shadow-lg shadow-blue-950/40"><Icon size={22} /></span><div><p className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-300">{content.eyebrow}</p><h1 className="mt-1 text-2xl font-black tracking-tight">{content.title}</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">{content.description}</p></div></div><span className="inline-flex items-center gap-2 self-start rounded-full bg-white/10 px-3 py-2 text-xs font-black ring-1 ring-inset ring-white/15"><Inbox size={14} /> Público · App · WhatsApp</span></div></header>
      <div className="p-4 sm:p-6">{mode === 'overdue' ? <OverdueWorkspace /> : mode === 'agents' ? <AgentWorkspace /> : <SettingsWorkspace />}</div>
    </div>
  );
};

export default MultichannelOperationsPage;
