import React, { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowRight,
  Bot,
  GraduationCap,
  Loader2,
  MessageCircle,
  RotateCcw,
  Send,
  TicketCheck,
  WalletCards,
  X,
} from 'lucide-react';
import {
  normalizeFlowDefinition,
  renderFlowTemplate,
} from '../../gestor/comunicacao/components/whatsapp-flow/flowBuilder';
import type {
  WhatsAppFlowOption,
  WhatsAppSector,
} from '../../gestor/comunicacao/components/whatsapp/whatsapp.types';
import { publicSupportService } from '../login-app/public-support.service';
import { useAccessibleDialog } from './AlunoComunicacaoParts';
import type { CreateAlunoChatInput } from './comunicacao.types';

type FlowMessage = {
  id: string;
  side: 'student' | 'uni';
  text: string;
  action?: 'courses' | 'finance' | 'handoff';
};

type RouteContext = {
  poloLabel: string | null;
  sector: WhatsAppSector;
  subject: string;
};

interface AlunoAutomatedSupportModalProps {
  onClose: () => void;
  onCreate: (input: Pick<CreateAlunoChatInput, 'message' | 'poloLabel' | 'sector' | 'subject'>) => Promise<void>;
  onNavigate?: (moduleId: string) => void;
}

const cleanMessage = (value: string | null | undefined) => String(value || '').replace(/\*/g, '').trim();

const initialRoute = (): RouteContext => ({
  poloLabel: null,
  sector: 'atendimento_geral',
  subject: 'Atendimento geral',
});

const AlunoAutomatedSupportModal: React.FC<AlunoAutomatedSupportModalProps> = ({
  onClose,
  onCreate,
  onNavigate,
}) => {
  const dialogRef = useAccessibleDialog(onClose);
  const bootstrap = useQuery({
    queryKey: ['public-support', 'bootstrap'],
    queryFn: publicSupportService.bootstrap,
    staleTime: 60_000,
  });
  const definition = useMemo(
    () => normalizeFlowDefinition(bootstrap.data?.flow, 'universo_main'),
    [bootstrap.data?.flow],
  );
  const startNode = definition.nodes.find((node) => node.id === definition.startNodeId) || definition.nodes[0];
  const [currentNodeId, setCurrentNodeId] = useState(startNode.id);
  const [messages, setMessages] = useState<FlowMessage[]>([
    { id: `uni-${startNode.id}`, side: 'uni', text: cleanMessage(startNode.message) },
  ]);
  const [route, setRoute] = useState<RouteContext>(initialRoute);
  const [memory, setMemory] = useState<Record<string, string>>({});
  const [ticketMessage, setTicketMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    setCurrentNodeId(startNode.id);
    setMessages([{ id: `uni-${startNode.id}`, side: 'uni', text: cleanMessage(startNode.message) }]);
    setRoute(initialRoute());
    setMemory({});
    setTicketMessage('');
    setErrorMessage('');
  }, [startNode.id, startNode.message]);

  const currentNode = useMemo(
    () => definition.nodes.find((node) => node.id === currentNodeId) || null,
    [currentNodeId, definition.nodes],
  );
  const currentOptions = currentNode?.options.filter((option) => option.enabled) || [];
  const showTicketForm = messages.some((message) => message.action === 'handoff');

  const resetFlow = () => {
    setCurrentNodeId(startNode.id);
    setMessages([{
      id: `uni-${startNode.id}-${Date.now()}`,
      side: 'uni',
      text: cleanMessage(startNode.message),
    }]);
    setRoute(initialRoute());
    setMemory({});
    setTicketMessage('');
    setErrorMessage('');
  };

  const resolveRoute = (option: WhatsAppFlowOption, nextMemory: Record<string, string>): RouteContext => ({
    poloLabel: option.poloMode === 'label'
      ? option.poloLabel || route.poloLabel
      : option.poloMode === 'none'
        ? null
        : route.poloLabel,
    sector: option.sector || route.sector || 'atendimento_geral',
    subject: cleanMessage(renderFlowTemplate(option.subject || option.label || route.subject, nextMemory)),
  });

  const openHandoff = (
    studentMessage: FlowMessage,
    option: WhatsAppFlowOption,
    nextMemory: Record<string, string>,
  ) => {
    setRoute(resolveRoute(option, nextMemory));
    setMessages((current) => [...current, studentMessage, {
      id: `uni-handoff-${Date.now()}`,
      side: 'uni',
      text: 'Certo. Agora descreva com detalhes como podemos ajudar. Como você já está conectado, seu cadastro e sua unidade serão identificados automaticamente.',
      action: 'handoff',
    }]);
    setCurrentNodeId('');
  };

  const selectOption = (option: WhatsAppFlowOption) => {
    setErrorMessage('');
    const nextMemory = option.rememberKey
      ? { ...memory, [option.rememberKey]: option.rememberValue || option.label }
      : memory;
    setMemory(nextMemory);
    const nextRoute = resolveRoute(option, nextMemory);
    setRoute(nextRoute);
    const studentMessage: FlowMessage = {
      id: `student-${option.id}-${Date.now()}`,
      side: 'student',
      text: option.label,
    };

    if (option.action === 'goto' && option.targetNodeId) {
      const nextNode = definition.nodes.find((node) => node.id === option.targetNodeId);
      if (nextNode) {
        setMessages((current) => [...current, studentMessage, {
          id: `uni-${nextNode.id}-${Date.now()}`,
          side: 'uni',
          text: cleanMessage(renderFlowTemplate(nextNode.message, nextMemory)),
        }]);
        setCurrentNodeId(nextNode.id);
        return;
      }
    }

    if (option.action === 'course_agent') {
      setMessages((current) => [...current, studentMessage, {
        id: `uni-courses-${Date.now()}`,
        side: 'uni',
        text: 'Posso levar você diretamente aos cursos disponíveis no seu portal.',
        action: 'courses',
      }]);
      setCurrentNodeId('');
      return;
    }

    if (['finance_link', 'finance_pix', 'finance_irpf'].includes(option.action)) {
      setMessages((current) => [...current, studentMessage, {
        id: `uni-finance-${Date.now()}`,
        side: 'uni',
        text: 'Você já está identificado. Abra sua área financeira para consultar cobranças, pagamentos e documentos com segurança.',
        action: 'finance',
      }]);
      setCurrentNodeId('');
      return;
    }

    if (option.action === 'route' || option.action === 'handoff') {
      openHandoff(studentMessage, option, nextMemory);
      return;
    }

    const response = option.responseMessage || (option.action === 'redirect'
      ? `Este canal atende a Universo Cursos e Consultoria. Para continuar, procure o atendimento da ${option.institution === 'anhanguera' ? 'Anhanguera' : 'Unopar'}.`
      : 'Certo. Vamos continuar seu atendimento.');
    setMessages((current) => [...current, studentMessage, {
      id: `uni-response-${Date.now()}`,
      side: 'uni',
      text: cleanMessage(renderFlowTemplate(response, nextMemory)),
    }]);
    setCurrentNodeId('');
  };

  const submitTicket = async (event: React.FormEvent) => {
    event.preventDefault();
    const message = ticketMessage.trim();
    if (message.length < 3) {
      setErrorMessage('Descreva com um pouco mais de detalhe como podemos ajudar.');
      return;
    }

    setSubmitting(true);
    setErrorMessage('');
    try {
      await onCreate({
        message,
        poloLabel: route.poloLabel,
        sector: route.sector,
        subject: route.subject,
      });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Não foi possível abrir o chamado. Tente novamente.');
    } finally {
      setSubmitting(false);
    }
  };

  const navigateTo = (moduleId: string) => {
    onClose();
    onNavigate?.(moduleId);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/60 p-0 backdrop-blur-sm md:items-center md:p-4">
      <div
        ref={dialogRef}
        className="flex max-h-[calc(100dvh-env(safe-area-inset-top))] w-full max-w-lg flex-col overflow-hidden rounded-t-[2rem] border border-white/10 bg-[#f3f7fb] shadow-2xl animate-fadeIn motion-reduce:animate-none md:max-h-[90dvh] md:rounded-[2rem]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="automated-support-title"
        aria-describedby="automated-support-description"
      >
        <header className="flex shrink-0 items-center gap-3 border-b border-slate-100 bg-white px-4 py-4 md:px-5">
          <span className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-blue-600 text-white">
            <MessageCircle size={20} />
            <i className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full border-2 border-white bg-emerald-500" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="automated-support-title" className="font-black text-[#001a33]">Fale com a Uni</h2>
            <p id="automated-support-description" className="truncate text-xs font-semibold text-slate-500">Atendimento automático · Universo Principal</p>
          </div>
          <button type="button" onClick={resetFlow} className="flex h-11 w-11 items-center justify-center rounded-xl text-blue-700 transition-colors hover:bg-blue-50" aria-label="Reiniciar atendimento"><RotateCcw size={18} /></button>
          <button data-dialog-autofocus type="button" onClick={onClose} className="flex h-11 w-11 items-center justify-center rounded-xl text-slate-500 transition-colors hover:bg-slate-100" aria-label="Fechar atendimento"><X size={19} /></button>
        </header>

        <div className="custom-scrollbar min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain p-4 md:p-5">
          {bootstrap.isLoading ? (
            <div className="flex items-center justify-center gap-2 rounded-2xl bg-white p-4 text-xs font-bold text-slate-500" role="status"><Loader2 size={17} className="animate-spin" />Sincronizando o fluxo de atendimento…</div>
          ) : null}

          {messages.map((message) => (
            <React.Fragment key={message.id}>
              <div className={`${message.side === 'student' ? 'ml-auto rounded-tr-md bg-blue-600 text-white' : 'rounded-tl-md bg-white text-slate-700 ring-1 ring-slate-100'} max-w-[90%] whitespace-pre-line rounded-2xl p-4 text-sm font-medium leading-6 shadow-sm`}>
                {message.side === 'uni' ? <Bot size={15} className="mb-2 text-blue-600" aria-hidden="true" /> : null}
                {message.text}
              </div>
              {message.action === 'courses' ? (
                <button type="button" onClick={() => navigateTo('cursos')} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 text-xs font-black uppercase tracking-wider text-white"><GraduationCap size={17} />Abrir meus cursos<ArrowRight size={15} /></button>
              ) : null}
              {message.action === 'finance' ? (
                <button type="button" onClick={() => navigateTo('financeiro')} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#001a33] px-4 text-xs font-black uppercase tracking-wider text-white"><WalletCards size={17} />Abrir financeiro<ArrowRight size={15} /></button>
              ) : null}
            </React.Fragment>
          ))}

          {currentOptions.length ? (
            <div className="grid gap-2.5">
              {currentOptions.map((option, index) => (
                <button key={option.id} type="button" onClick={() => selectOption(option)} className="flex min-h-14 items-center gap-3 rounded-2xl border border-blue-100 bg-white p-3 text-left text-slate-700 shadow-sm transition-colors hover:border-blue-300 hover:bg-blue-50/40 motion-reduce:transition-none">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-xs font-black text-blue-700">{index + 1}</span>
                  <b className="min-w-0 flex-1 text-sm text-[#001a33]">{option.label}</b>
                  <ArrowRight size={15} className="shrink-0 text-slate-300" />
                </button>
              ))}
            </div>
          ) : null}

          {showTicketForm ? (
            <form onSubmit={submitTicket} className="space-y-3 rounded-2xl border border-blue-100 bg-white p-4 text-slate-700 shadow-sm">
              <div>
                <h3 className="flex items-center gap-2 font-black text-[#001a33]"><TicketCheck size={18} className="text-blue-600" />Abrir chamado</h3>
                <p className="mt-1 text-xs font-semibold text-slate-500">Destino: {route.subject}. Seu cadastro e seu polo serão vinculados automaticamente.</p>
              </div>
              <label className="block">
                <span className="text-[10px] font-black uppercase tracking-wide text-slate-500">Como podemos ajudar?</span>
                <textarea required minLength={3} maxLength={4000} value={ticketMessage} onChange={(event) => setTicketMessage(event.target.value)} placeholder="Descreva sua dúvida ou solicitação…" className="mt-1.5 h-28 w-full resize-none rounded-xl border border-slate-200 bg-slate-50 p-3 text-base font-medium outline-none focus:border-blue-500 md:text-sm" />
              </label>
              {errorMessage ? <p role="alert" className="rounded-xl bg-rose-50 p-3 text-xs font-bold text-rose-700">{errorMessage}</p> : null}
              <button type="submit" disabled={submitting || ticketMessage.trim().length < 3} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-black text-white disabled:opacity-40">
                {submitting ? <Loader2 size={17} className="animate-spin" /> : <Send size={17} />}
                Gerar protocolo e enviar
              </button>
            </form>
          ) : null}

          {!showTicketForm && currentOptions.length === 0 ? (
            <button type="button" onClick={resetFlow} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-blue-200 bg-white px-4 text-xs font-black text-blue-700"><RotateCcw size={15} />Voltar ao menu principal</button>
          ) : null}
        </div>
      </div>
    </div>
  );
};

export default AlunoAutomatedSupportModal;
