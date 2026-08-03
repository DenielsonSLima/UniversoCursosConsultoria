import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  ArrowLeft, BellRing, Clock3, Loader2, MessageCircle,
  Plus, RotateCcw, Send, TicketCheck,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import AdaptiveTurnstileWidget from '../../shared/auth/AdaptiveTurnstileWidget';
import { formatCpf, isValidCpf } from '../../shared/utils/identityValidation';
import { normalizeFlowDefinition } from '../../gestor/comunicacao/components/whatsapp-flow/flowBuilder';
import type { WhatsAppFlowOption } from '../../gestor/comunicacao/components/whatsapp/whatsapp.types';
import {
  PUBLIC_SUPPORT_STORAGE_KEY,
  publicSupportService,
} from './public-support.service';
import { PublicSupportAttachment, PublicSupportComposer } from './PublicSupportChatParts';
import {
  playPublicSupportMessageSound,
  unlockPublicSupportSound,
} from './public-support-media';

type ChatMessage = {
  id: string;
  side: 'student' | 'uni';
  text: string;
  action?: 'courses' | 'secure-access' | 'handoff';
};

type RouteContext = {
  poloLabel: string | null;
  sector: string;
  subject: string;
};

const cleanMessage = (value: string) => value.replace(/\*/g, '').trim();
const formatSla = (minutes: number) => minutes < 60 ? `${minutes} minutos` : `${Math.round(minutes / 60)} ${Math.round(minutes / 60) === 1 ? 'hora' : 'horas'}`;

const AlunoPublicSupportPage: React.FC = () => {
  const bootstrap = useQuery({
    queryKey: ['public-support', 'bootstrap'],
    queryFn: publicSupportService.bootstrap,
    staleTime: 60_000,
  });
  const definition = useMemo(() => normalizeFlowDefinition(bootstrap.data?.flow, 'universo_main'), [bootstrap.data?.flow]);
  const startNode = definition.nodes.find((node) => node.id === definition.startNodeId) || definition.nodes[0];
  const [currentNodeId, setCurrentNodeId] = useState(startNode.id);
  const [messages, setMessages] = useState<ChatMessage[]>([{ id: `uni-${startNode.id}`, side: 'uni', text: cleanMessage(startNode.message) }]);
  const [route, setRoute] = useState<RouteContext>({ poloLabel: null, sector: 'atendimento_geral', subject: 'Atendimento geral' });
  const [accessToken, setAccessToken] = useState(() => {
    try { return window.localStorage.getItem(PUBLIC_SUPPORT_STORAGE_KEY) || ''; } catch { return ''; }
  });
  const [cpf, setCpf] = useState('');
  const [ticketMessage, setTicketMessage] = useState('');
  const [selectedPoloId, setSelectedPoloId] = useState('');
  const [notifyReply, setNotifyReply] = useState(true);
  const [turnstileToken, setTurnstileToken] = useState('');
  const [turnstileReset, setTurnstileReset] = useState(0);
  const [errorMessage, setErrorMessage] = useState('');
  const [newReplyAnnouncement, setNewReplyAnnouncement] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const seenManagerMessageIdsRef = useRef<Set<string> | null>(null);

  useEffect(() => {
    setCurrentNodeId(startNode.id);
    setMessages([{ id: `uni-${startNode.id}`, side: 'uni', text: cleanMessage(startNode.message) }]);
  }, [startNode.id]);

  useEffect(() => {
    if (!selectedPoloId && bootstrap.data?.polos.length) {
      setSelectedPoloId(bootstrap.data.polos.find((polo) => polo.is_matriz)?.id || bootstrap.data.polos[0].id);
    }
  }, [bootstrap.data?.polos, selectedPoloId]);

  const history = useQuery({
    queryKey: ['public-support', 'history', accessToken],
    queryFn: () => publicSupportService.history(accessToken),
    enabled: Boolean(accessToken),
    staleTime: 0,
    refetchInterval: accessToken ? 15_000 : false,
    refetchOnWindowFocus: true,
    retry: false,
  });

  useEffect(() => {
    if (history.isError && accessToken) {
      try { window.localStorage.removeItem(PUBLIC_SUPPORT_STORAGE_KEY); } catch { /* storage indisponível */ }
      setAccessToken('');
    }
  }, [accessToken, history.isError]);

  useEffect(() => {
    seenManagerMessageIdsRef.current = null;
    setNewReplyAnnouncement('');
  }, [accessToken]);

  useEffect(() => {
    const unlock = () => { void unlockPublicSupportSound(); };
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, []);

  useEffect(() => {
    if (!history.data) return;
    const managerMessages = history.data.messages.filter((message) => message.remetente_tipo === 'gestor');
    const currentIds = new Set(managerMessages.map((message) => message.id));
    const previousIds = seenManagerMessageIdsRef.current;
    seenManagerMessageIdsRef.current = currentIds;
    if (!previousIds) return;
    const newMessages = managerMessages.filter((message) => !previousIds.has(message.id));
    if (!newMessages.length) return;
    setNewReplyAnnouncement(newMessages.length === 1 ? 'Nova mensagem da equipe Universo.' : `${newMessages.length} novas mensagens da equipe Universo.`);
    void playPublicSupportMessageSound();
  }, [history.data]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }, [history.data?.messages, messages]);

  const currentNode = useMemo(() => definition.nodes.find((node) => node.id === currentNodeId) || null, [currentNodeId, definition.nodes]);
  const currentOptions = currentNode?.options.filter((option) => option.enabled) || [];

  const resetFlow = () => {
    setCurrentNodeId(startNode.id);
    setMessages([{ id: `uni-${startNode.id}-${Date.now()}`, side: 'uni', text: cleanMessage(startNode.message) }]);
    setRoute({ poloLabel: null, sector: 'atendimento_geral', subject: 'Atendimento geral' });
    setTicketMessage('');
    setErrorMessage('');
  };

  const newTicket = () => {
    try { window.localStorage.removeItem(PUBLIC_SUPPORT_STORAGE_KEY); } catch { /* storage indisponível */ }
    setAccessToken('');
    setCpf('');
    resetFlow();
  };

  const openHandoff = (studentMessage: ChatMessage, option: WhatsAppFlowOption) => {
    const nextRoute = {
      poloLabel: option.poloMode === 'label' ? option.poloLabel || route.poloLabel : route.poloLabel,
      sector: option.sector || route.sector || 'atendimento_geral',
      subject: cleanMessage(option.subject || option.label || route.subject),
    };
    setRoute(nextRoute);
    const matchingPolo = bootstrap.data?.polos.find((polo) => polo.nome.toLocaleLowerCase('pt-BR') === nextRoute.poloLabel?.toLocaleLowerCase('pt-BR'));
    if (matchingPolo) setSelectedPoloId(matchingPolo.id);
    setMessages((current) => [...current, studentMessage, {
      id: `uni-handoff-${Date.now()}`,
      side: 'uni',
      text: 'Certo. Para encaminhar de verdade e gerar seu protocolo, confirme os dados abaixo.',
      action: 'handoff',
    }]);
    setCurrentNodeId('');
  };

  const selectOption = (option: WhatsAppFlowOption) => {
    const studentMessage: ChatMessage = { id: `student-${option.id}-${Date.now()}`, side: 'student', text: option.label };
    if (option.poloMode === 'label' && option.poloLabel) setRoute((current) => ({ ...current, poloLabel: option.poloLabel || null }));
    if (option.sector || option.subject) setRoute((current) => ({ ...current, sector: option.sector || current.sector, subject: cleanMessage(option.subject || current.subject) }));

    if (option.action === 'goto' && option.targetNodeId) {
      const nextNode = definition.nodes.find((node) => node.id === option.targetNodeId);
      if (nextNode) {
        setMessages((current) => [...current, studentMessage, { id: `uni-${nextNode.id}-${Date.now()}`, side: 'uni', text: cleanMessage(nextNode.message) }]);
        setCurrentNodeId(nextNode.id);
        return;
      }
    }
    if (option.action === 'course_agent') {
      setMessages((current) => [...current, studentMessage, { id: `uni-courses-${Date.now()}`, side: 'uni', text: 'Posso apresentar os cursos publicados. Escolha uma modalidade para continuar.', action: 'courses' }]);
      setCurrentNodeId('');
      return;
    }
    if (['finance_link', 'finance_pix', 'finance_irpf'].includes(option.action)) {
      setMessages((current) => [...current, studentMessage, { id: `uni-secure-${Date.now()}`, side: 'uni', text: 'Essa solicitação usa dados pessoais. Entre na sua conta ou recupere o acesso para continuar com segurança.', action: 'secure-access' }]);
      setCurrentNodeId('');
      return;
    }
    if (option.action === 'route' || option.action === 'handoff') {
      openHandoff(studentMessage, option);
      return;
    }
    const response = option.responseMessage || (option.action === 'redirect' ? `Vou encaminhar você para o atendimento da ${option.institution === 'anhanguera' ? 'Anhanguera' : 'Unopar'}.` : 'Certo. Vamos continuar seu atendimento.');
    setMessages((current) => [...current, studentMessage, { id: `uni-response-${Date.now()}`, side: 'uni', text: cleanMessage(response) }]);
    setCurrentNodeId('');
  };

  const createTicketMutation = useMutation({
    mutationFn: () => publicSupportService.createTicket({
      turnstileToken,
      cpf,
      subject: route.subject,
      message: ticketMessage,
      sector: route.sector,
      poloId: selectedPoloId,
      poloLabel: route.poloLabel,
      notifyReply,
    }),
    onSuccess: (result) => {
      try { window.localStorage.setItem(PUBLIC_SUPPORT_STORAGE_KEY, result.accessToken); } catch { /* storage indisponível */ }
      setAccessToken(result.accessToken);
      setTurnstileToken('');
      setErrorMessage('');
    },
    onError: (error: Error) => {
      setErrorMessage(error.message);
      setTurnstileToken('');
      setTurnstileReset((value) => value + 1);
    },
  });

  const sendMutation = useMutation({
    mutationFn: (message: string) => publicSupportService.sendMessage(accessToken, message),
    onSuccess: () => { void history.refetch(); },
    onError: (error: Error) => setErrorMessage(error.message),
  });

  const attachmentMutation = useMutation({
    mutationFn: (file: File) => publicSupportService.sendAttachment(accessToken, file),
    onSuccess: () => { void history.refetch(); },
    onError: (error: Error) => setErrorMessage(error.message),
  });

  const configuredPolo = bootstrap.data?.configs.find((config) => config.polo_id === selectedPoloId);
  const averageResponse = Number(configuredPolo?.tempo_medio_resposta_minutos || 120);
  const showTicketForm = messages.some((message) => message.action === 'handoff');

  return (
    <main className="relative flex h-dvh min-h-[36rem] overflow-hidden bg-[#001a33] text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_0%,rgba(37,99,235,.42),transparent_36%),radial-gradient(circle_at_90%_85%,rgba(14,165,233,.20),transparent_34%),linear-gradient(155deg,#001126_0%,#002c63_55%,#001a33_100%)]" />
      <div className="absolute inset-0 opacity-20 [background-image:linear-gradient(rgba(255,255,255,.06)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.06)_1px,transparent_1px)] [background-size:28px_28px]" />
      <section className="relative z-10 mx-auto flex h-full w-full max-w-[34rem] flex-col px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))] sm:px-6">
        <header className="flex shrink-0 items-center gap-3 py-2"><Link to="/aluno/login-app" aria-label="Voltar ao login" className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/15 bg-white/10 text-blue-100 backdrop-blur-md"><ArrowLeft size={20} /></Link><div className="flex h-11 flex-1 items-center justify-center rounded-2xl bg-white px-4 shadow-lg"><img src="/LogoUniverso.png" alt="Universo Cursos e Consultoria" className="h-8 w-full object-contain" /></div><button type="button" onClick={accessToken ? newTicket : resetFlow} aria-label={accessToken ? 'Abrir novo chamado' : 'Reiniciar atendimento'} className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-600 shadow-lg shadow-blue-950/30">{accessToken ? <Plus size={19} /> : <RotateCcw size={19} />}</button></header>
        <div className="mt-3 flex min-h-0 flex-1 flex-col overflow-hidden rounded-[2rem] border border-white/15 bg-white shadow-2xl shadow-black/30">
          <div className="shrink-0 border-b border-slate-100 bg-slate-50 px-5 py-4 text-slate-900"><div className="flex items-center gap-3"><span className="relative flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-600 text-white"><MessageCircle size={20} /><i className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full border-2 border-white bg-emerald-500" /></span><div className="min-w-0 flex-1"><h1 className="font-black text-[#001a33]">Fale com a Uni</h1><p className="truncate text-xs font-semibold text-slate-500">{accessToken ? `Protocolo ${history.data?.chat.protocolo || 'carregando…'}` : 'Fluxo Universo Principal · atendimento público'}</p></div>{accessToken ? <button type="button" onClick={newTicket} className="text-xs font-black text-blue-700">Novo</button> : null}</div></div>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain bg-[#f3f7fb] p-4 sm:p-5 custom-scrollbar">
            <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">{newReplyAnnouncement}</span>
            {accessToken ? (
              history.isLoading ? <div className="flex justify-center py-14"><Loader2 className="animate-spin text-blue-600" /></div> : history.data ? <><div className="rounded-2xl border border-blue-100 bg-blue-50 p-4 text-slate-700"><div className="flex items-center gap-2 text-blue-700"><TicketCheck size={18} /><b className="text-sm">Chamado registrado</b></div><p className="mt-2 text-xs font-semibold">{history.data.chat.assunto} · {history.data.chat.status === 'pendente' ? 'em atendimento' : 'resolvido'}</p><p className="mt-2 flex items-center gap-1.5 text-xs font-black text-slate-500"><Clock3 size={13} /> Tempo médio informado: {formatSla(averageResponse)}</p></div>{history.data.messages.map((message) => { const outgoing = message.remetente_tipo === 'aluno'; const hasText = Boolean(message.conteudo?.trim() && !message.conteudo.startsWith('📎')); return <div key={message.id} className={`${outgoing ? 'ml-auto rounded-tr-md bg-blue-600 text-white' : 'rounded-tl-md bg-white text-slate-700 ring-1 ring-slate-100'} max-w-[90%] space-y-2 whitespace-pre-line rounded-2xl p-4 text-sm font-medium leading-6 shadow-sm`}><PublicSupportAttachment path={message.anexo_path} url={message.anexo_url} outgoing={outgoing} />{hasText ? <p className="break-words">{message.conteudo}</p> : null}<span className={`block text-[10px] font-bold ${outgoing ? 'text-blue-100' : 'text-slate-400'}`}>{message.remetente_nome} · {new Date(message.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span></div>; })}</> : null
            ) : <>
              {messages.map((message) => <React.Fragment key={message.id}><div className={`${message.side === 'student' ? 'ml-auto rounded-tr-md bg-blue-600 text-white' : 'rounded-tl-md bg-white text-slate-700 ring-1 ring-slate-100'} max-w-[90%] whitespace-pre-line rounded-2xl p-4 text-sm font-medium leading-6 shadow-sm`}>{message.text}</div>{message.action === 'courses' ? <div className="flex flex-wrap gap-2"><Link to="/cursos-tecnicos" className="rounded-xl bg-blue-600 px-3 py-2 text-xs font-black text-white">Cursos técnicos</Link><Link to="/ead" className="rounded-xl bg-[#001a33] px-3 py-2 text-xs font-black text-white">Cursos EAD</Link></div> : null}{message.action === 'secure-access' ? <div className="flex flex-wrap gap-2"><Link to="/aluno/login-app" className="rounded-xl bg-blue-600 px-3 py-2 text-xs font-black text-white">Entrar</Link><Link to="/aluno/recuperar-senha-app" className="rounded-xl border border-blue-200 bg-white px-3 py-2 text-xs font-black text-blue-700">Recuperar acesso</Link></div> : null}</React.Fragment>)}
              {currentOptions.length > 0 ? <div className="grid gap-2.5">{currentOptions.map((option, index) => <button key={option.id} type="button" onClick={() => selectOption(option)} className="flex min-h-14 items-center gap-3 rounded-2xl border border-blue-100 bg-white p-3 text-left text-slate-700 shadow-sm transition hover:border-blue-300 hover:bg-blue-50/40"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-xs font-black text-blue-700">{index + 1}</span><b className="text-sm text-[#001a33]">{option.label}</b></button>)}</div> : null}
              {showTicketForm ? <form onSubmit={(event) => { event.preventDefault(); setErrorMessage(''); createTicketMutation.mutate(); }} className="space-y-3 rounded-2xl border border-blue-100 bg-white p-4 text-slate-700 shadow-sm"><div><h2 className="font-black text-[#001a33]">Abrir chamado</h2><p className="mt-1 text-xs font-semibold text-slate-500">Informe seu CPF para localizarmos seu cadastro. Seu histórico ficará salvo neste aparelho por 90 dias.</p></div><Field label="CPF" value={cpf} onChange={(value) => setCpf(formatCpf(value))} placeholder="000.000.000-00" inputMode="numeric" autoComplete="off" /><label className="block"><span className="text-[10px] font-black uppercase tracking-wide text-slate-500">Polo</span><select value={selectedPoloId} onChange={(event) => setSelectedPoloId(event.target.value)} className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-bold outline-none focus:border-blue-500">{bootstrap.data?.polos.map((polo) => <option key={polo.id} value={polo.id}>{polo.nome} · {polo.cidade}</option>)}</select></label><label className="block"><span className="text-[10px] font-black uppercase tracking-wide text-slate-500">Como podemos ajudar?</span><textarea required minLength={2} value={ticketMessage} onChange={(event) => setTicketMessage(event.target.value)} className="mt-1.5 h-24 w-full resize-none rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm font-semibold outline-none focus:border-blue-500" /></label><label className="flex items-start gap-3 rounded-xl bg-violet-50 p-3 text-xs font-semibold text-violet-800"><input type="checkbox" checked={notifyReply} onChange={(event) => setNotifyReply(event.target.checked)} className="mt-0.5" /><BellRing size={16} className="shrink-0" /><span>Quero ativar as notificações quando a equipe responder. A permissão do celular será solicitada em uma etapa própria.</span></label><AdaptiveTurnstileWidget action="support" resetSignal={turnstileReset} onTokenChange={setTurnstileToken} />{errorMessage ? <p role="alert" className="rounded-xl bg-rose-50 p-3 text-xs font-bold text-rose-700">{errorMessage}</p> : null}<button type="submit" disabled={!turnstileToken || createTicketMutation.isPending || !isValidCpf(cpf) || !ticketMessage.trim()} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-black text-white disabled:opacity-40">{createTicketMutation.isPending ? <Loader2 size={17} className="animate-spin" /> : <TicketCheck size={17} />}Gerar protocolo e enviar</button></form> : null}
              {!showTicketForm && currentOptions.length === 0 ? <button type="button" onClick={resetFlow} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-blue-200 bg-white px-4 text-xs font-black text-blue-700"><RotateCcw size={15} />Voltar ao menu principal</button> : null}
            </>}
            <div ref={bottomRef} />
          </div>
          <div className="shrink-0 border-t border-slate-100 bg-white p-3">{accessToken && history.data?.chat.status === 'pendente' ? <PublicSupportComposer sending={sendMutation.isPending || attachmentMutation.isPending} onSendMessage={async (message) => { setErrorMessage(''); await sendMutation.mutateAsync(message); }} onSendAttachment={async (file) => { setErrorMessage(''); await attachmentMutation.mutateAsync(file); }} /> : <div className="flex h-12 items-center gap-2 rounded-2xl bg-slate-100 px-4 text-xs font-semibold text-slate-400"><span className="flex-1">{accessToken ? 'Atendimento encerrado. Abra um novo chamado quando precisar.' : 'Escolha uma opção do fluxo para continuar'}</span><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-200"><Send size={16} /></span></div>}</div>
        </div>
      </section>
    </main>
  );
};

const Field = ({ label, value, onChange, placeholder, inputMode, autoComplete }: { label: string; value: string; onChange: (value: string) => void; placeholder: string; inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode']; autoComplete?: string }) => <label className="block"><span className="text-[10px] font-black uppercase tracking-wide text-slate-500">{label}</span><input required value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} inputMode={inputMode} autoComplete={autoComplete} className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-semibold outline-none focus:border-blue-500" /></label>;

export default AlunoPublicSupportPage;
