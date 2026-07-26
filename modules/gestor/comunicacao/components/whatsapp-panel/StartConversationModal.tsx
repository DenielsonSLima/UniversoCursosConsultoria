import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertTriangle,
  BookUser,
  Check,
  CheckCircle2,
  Clock3,
  FileText,
  Filter,
  Mail,
  MessageCircle,
  Phone,
  RefreshCw,
  Search,
  Send,
  UserRound,
  UsersRound,
  X,
} from 'lucide-react';
import { WhatsAppContact } from '../whatsapp/whatsapp.types';
import { formatDocument, formatPhone, initials, normalizePhone } from '../whatsapp/whatsapp.utils';
import { contactTone } from './utils';

interface StartConversationModalProps {
  contacts: WhatsAppContact[];
  filteredContacts: WhatsAppContact[];
  loadingContacts: boolean;
  contactSearch: string;
  selectedContact: WhatsAppContact | null;
  quickMessage: string;
  isSendingWhatsApp: boolean;
  apiReady: boolean;
  onSearchChange: (value: string) => void;
  onSelectContact: (contact: WhatsAppContact) => void;
  onQuickMessageChange: (value: string) => void;
  onSendWhatsAppMessage: () => void;
  onSendWhatsAppBatch: (
    contacts: WhatsAppContact[],
    message: string,
  ) => Promise<StartConversationBatchResult>;
  onOpenWhatsApp: () => void;
  onClose: () => void;
}

export interface StartConversationBatchResult {
  sent: number;
  skipped: number;
  failures: string[];
}

type ConversationMode = 'individual' | 'batch';
type ModalityFilter = 'TODOS' | 'TECNICO' | 'ESPECIALIZACAO' | 'EAD' | 'LIVRE';

const MODALITY_OPTIONS: Array<{ value: ModalityFilter; label: string }> = [
  { value: 'TODOS', label: 'Todos' },
  { value: 'TECNICO', label: 'Técnico' },
  { value: 'ESPECIALIZACAO', label: 'Especialização' },
  { value: 'EAD', label: 'EAD' },
  { value: 'LIVRE', label: 'Livres' },
];

const normalizedStatus = (value: unknown) => String(value || '').trim().toUpperCase();
const enrollmentIsEligible = (status: string, activeOnly: boolean) =>
  !activeOnly || normalizedStatus(status) === 'ATIVO';

const StartConversationModal: React.FC<StartConversationModalProps> = ({
  contacts,
  filteredContacts,
  loadingContacts,
  contactSearch,
  selectedContact,
  quickMessage,
  isSendingWhatsApp,
  apiReady,
  onSearchChange,
  onSelectContact,
  onQuickMessageChange,
  onSendWhatsAppMessage,
  onSendWhatsAppBatch,
  onOpenWhatsApp,
  onClose,
}) => {
  const [mode, setMode] = useState<ConversationMode>('individual');
  const [selectedBatchIds, setSelectedBatchIds] = useState<Set<string>>(new Set());
  const [modalityFilter, setModalityFilter] = useState<ModalityFilter>('TODOS');
  const [courseFilter, setCourseFilter] = useState('');
  const [classFilter, setClassFilter] = useState('');
  const [activeOnly, setActiveOnly] = useState(true);
  const [batchMessage, setBatchMessage] = useState('');
  const [isSendingBatch, setIsSendingBatch] = useState(false);
  const [batchResult, setBatchResult] = useState<StartConversationBatchResult | null>(null);

  const contactStats = {
    total: contacts.length,
    telefone: contacts.filter((contact) => normalizePhone(contact.telefone)).length,
  };

  const courseOptions = useMemo(() => {
    const options = new Map<string, string>();
    contacts.forEach((contact) => {
      contact.matriculas.forEach((enrollment) => {
        if (!enrollmentIsEligible(enrollment.status, activeOnly)) return;
        if (modalityFilter !== 'TODOS' && enrollment.modalidade !== modalityFilter) return;
        if (enrollment.cursoId && enrollment.cursoNome) {
          options.set(enrollment.cursoId, enrollment.cursoNome);
        }
      });
    });
    return [...options.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((left, right) => left.name.localeCompare(right.name, 'pt-BR'));
  }, [activeOnly, contacts, modalityFilter]);

  const classOptions = useMemo(() => {
    const options = new Map<string, string>();
    contacts.forEach((contact) => {
      contact.matriculas.forEach((enrollment) => {
        if (!enrollmentIsEligible(enrollment.status, activeOnly)) return;
        if (modalityFilter !== 'TODOS' && enrollment.modalidade !== modalityFilter) return;
        if (courseFilter && enrollment.cursoId !== courseFilter) return;
        if (enrollment.turmaId && enrollment.turmaNome) {
          options.set(
            enrollment.turmaId,
            [enrollment.turmaCodigo, enrollment.turmaNome].filter(Boolean).join(' · '),
          );
        }
      });
    });
    return [...options.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((left, right) => left.name.localeCompare(right.name, 'pt-BR'));
  }, [activeOnly, contacts, courseFilter, modalityFilter]);

  const batchFilteredContacts = useMemo(() => filteredContacts.filter((contact) => {
    if (activeOnly && normalizedStatus(contact.status) !== 'ATIVO') return false;

    const hasEnrollmentFilter = activeOnly ||
      modalityFilter !== 'TODOS' ||
      Boolean(courseFilter) ||
      Boolean(classFilter);
    if (!hasEnrollmentFilter) return true;

    return contact.matriculas.some((enrollment) => {
      if (!enrollmentIsEligible(enrollment.status, activeOnly)) return false;
      if (modalityFilter !== 'TODOS' && enrollment.modalidade !== modalityFilter) return false;
      if (courseFilter && enrollment.cursoId !== courseFilter) return false;
      if (classFilter && enrollment.turmaId !== classFilter) return false;
      return true;
    });
  }), [activeOnly, classFilter, courseFilter, filteredContacts, modalityFilter]);

  const sendableBatchContacts = useMemo(
    () => batchFilteredContacts.filter((contact) => normalizePhone(contact.telefone)),
    [batchFilteredContacts],
  );
  const selectedBatchContacts = useMemo(
    () => contacts.filter((contact) => selectedBatchIds.has(contact.id)),
    [contacts, selectedBatchIds],
  );
  const sendableSelectedBatchContacts = useMemo(
    () => selectedBatchContacts.filter((contact) => normalizePhone(contact.telefone)),
    [selectedBatchContacts],
  );
  const allFilteredSelected = sendableBatchContacts.length > 0 &&
    sendableBatchContacts.every((contact) => selectedBatchIds.has(contact.id));

  useEffect(() => {
    if (courseFilter && !courseOptions.some((course) => course.id === courseFilter)) {
      setCourseFilter('');
    }
  }, [courseFilter, courseOptions]);

  useEffect(() => {
    if (classFilter && !classOptions.some((item) => item.id === classFilter)) {
      setClassFilter('');
    }
  }, [classFilter, classOptions]);

  const toggleBatchContact = (contact: WhatsAppContact) => {
    if (!normalizePhone(contact.telefone)) return;
    setSelectedBatchIds((current) => {
      const next = new Set(current);
      if (next.has(contact.id)) next.delete(contact.id);
      else next.add(contact.id);
      return next;
    });
    setBatchResult(null);
  };

  const toggleAllFiltered = () => {
    setSelectedBatchIds((current) => {
      const next = new Set(current);
      sendableBatchContacts.forEach((contact) => {
        if (allFilteredSelected) next.delete(contact.id);
        else next.add(contact.id);
      });
      return next;
    });
    setBatchResult(null);
  };

  const handleBatchSend = async () => {
    const message = batchMessage.trim();
    if (!message || isSendingBatch || sendableSelectedBatchContacts.length === 0) return;
    setIsSendingBatch(true);
    setBatchResult(null);
    try {
      setBatchResult(await onSendWhatsAppBatch(sendableSelectedBatchContacts, message));
    } finally {
      setIsSendingBatch(false);
    }
  };

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };

    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center overflow-hidden bg-[#0b141a]/55 p-3 backdrop-blur-[2px] sm:p-6 lg:p-10"
      role="dialog"
      aria-modal="true"
      aria-labelledby="start-whatsapp-conversation-title"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="flex h-[calc(100dvh-24px)] w-full max-w-[1180px] flex-col overflow-hidden rounded-[22px] border border-white/80 bg-white shadow-[0_28px_90px_rgba(0,0,0,0.32)] sm:h-[min(820px,calc(100dvh-48px))]">
        <header className="flex min-h-[76px] items-center justify-between border-b border-[#dfe5e7] bg-white px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#e7fce9] text-[#008069]">
              <MessageCircle size={20} />
            </div>
            <div className="min-w-0">
              <h3 id="start-whatsapp-conversation-title" className="truncate text-base font-semibold text-[#111b21] sm:text-lg">
                Iniciar conversa
              </h3>
              <p className="mt-0.5 hidden truncate text-xs font-normal text-[#667781] sm:block">
                {mode === 'individual'
                  ? 'Selecione um aluno para enviar uma mensagem pelo WhatsApp'
                  : 'Filtre, selecione vários alunos e envie a mesma mensagem'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className={`hidden min-h-8 items-center gap-2 rounded-full px-3 text-[10px] font-semibold sm:inline-flex ${
              apiReady
                ? 'bg-[#e7fce9] text-[#008069]'
                : 'bg-amber-50 text-amber-700'
            }`}>
              <span className={`h-2 w-2 rounded-full ${apiReady ? 'bg-emerald-400' : 'bg-amber-400'}`} />
              {apiReady ? 'API disponível' : 'API indisponível'}
            </span>
            <button
              type="button"
              onClick={onClose}
              className="flex h-10 w-10 items-center justify-center rounded-full text-[#667781] transition-colors hover:bg-[#f0f2f5] hover:text-[#111b21] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00a884]"
              title="Fechar"
              aria-label="Fechar início de conversa"
            >
              <X size={19} />
            </button>
          </div>
        </header>

        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto lg:grid lg:grid-cols-[minmax(380px,430px)_minmax(0,1fr)] lg:overflow-hidden">
          <aside className="flex min-h-[320px] max-h-[44dvh] flex-col border-b border-[#dfe5e7] bg-white lg:min-h-0 lg:max-h-none lg:border-b-0 lg:border-r">
            <div className="space-y-3 border-b border-[#e9edef] bg-white p-4">
              <div className="grid grid-cols-2 rounded-xl bg-[#f0f2f5] p-1">
                <button
                  type="button"
                  onClick={() => setMode('individual')}
                  className={`inline-flex min-h-9 items-center justify-center gap-2 rounded-lg text-xs font-semibold transition-all ${
                    mode === 'individual'
                      ? 'bg-white text-[#008069] shadow-sm'
                      : 'text-[#667781] hover:text-[#111b21]'
                  }`}
                >
                  <UserRound size={15} />
                  Individual
                </button>
                <button
                  type="button"
                  onClick={() => setMode('batch')}
                  className={`inline-flex min-h-9 items-center justify-center gap-2 rounded-lg text-xs font-semibold transition-all ${
                    mode === 'batch'
                      ? 'bg-white text-[#008069] shadow-sm'
                      : 'text-[#667781] hover:text-[#111b21]'
                  }`}
                >
                  <UsersRound size={15} />
                  Em massa
                </button>
              </div>

              <label className="relative block">
                <Search size={17} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#667781]" />
                <input
                  autoFocus
                  value={contactSearch}
                  onChange={(event) => onSearchChange(event.target.value)}
                  placeholder="Digite nome, CPF ou telefone..."
                  className="h-11 w-full rounded-xl border border-transparent bg-[#f0f2f5] pl-10 pr-4 text-sm font-normal text-[#111b21] outline-none transition-all placeholder:text-[#8696a0] focus:border-[#00a884] focus:bg-white focus:ring-2 focus:ring-[#00a884]/10"
                />
              </label>

              {mode === 'batch' ? (
                <div className="space-y-3 rounded-xl border border-[#e9edef] bg-[#f7f9fa] p-3">
                  <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-[#667781]">
                    <Filter size={13} />
                    Filtrar alunos
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    {MODALITY_OPTIONS.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => {
                          setModalityFilter(option.value);
                          setCourseFilter('');
                          setClassFilter('');
                        }}
                        className={`rounded-full px-2.5 py-1.5 text-[10px] font-semibold transition-colors ${
                          modalityFilter === option.value
                            ? 'bg-[#00a884] text-white'
                            : 'bg-white text-[#54656f] ring-1 ring-[#dfe5e7] hover:bg-[#e9edef]'
                        }`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <label>
                      <span className="sr-only">Filtrar por curso</span>
                      <select
                        value={courseFilter}
                        onChange={(event) => {
                          setCourseFilter(event.target.value);
                          setClassFilter('');
                        }}
                        className="h-10 w-full rounded-lg border border-[#dfe5e7] bg-white px-2.5 text-xs font-medium text-[#3b4a54] outline-none focus:border-[#00a884]"
                      >
                        <option value="">Todos os cursos</option>
                        {courseOptions.map((course) => (
                          <option key={course.id} value={course.id}>{course.name}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span className="sr-only">Filtrar por turma</span>
                      <select
                        value={classFilter}
                        onChange={(event) => setClassFilter(event.target.value)}
                        className="h-10 w-full rounded-lg border border-[#dfe5e7] bg-white px-2.5 text-xs font-medium text-[#3b4a54] outline-none focus:border-[#00a884]"
                      >
                        <option value="">Todas as turmas</option>
                        {classOptions.map((item) => (
                          <option key={item.id} value={item.id}>{item.name}</option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <div className="flex items-center justify-between gap-3">
                    <button
                      type="button"
                      role="switch"
                      aria-checked={activeOnly}
                      onClick={() => {
                        setActiveOnly((current) => !current);
                        setCourseFilter('');
                        setClassFilter('');
                      }}
                      className="inline-flex min-h-8 items-center gap-2 text-[11px] font-medium text-[#54656f]"
                    >
                      <span className={`relative h-5 w-9 rounded-full transition-colors ${activeOnly ? 'bg-[#00a884]' : 'bg-[#c8d1d5]'}`}>
                        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${activeOnly ? 'translate-x-[18px]' : 'translate-x-0.5'}`} />
                      </span>
                      Somente ativos
                    </button>
                    <span className="text-[11px] font-semibold text-[#008069]">
                      {batchFilteredContacts.length} resultado(s)
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={toggleAllFiltered}
                    disabled={sendableBatchContacts.length === 0}
                    className="flex min-h-9 w-full items-center justify-center gap-2 rounded-lg border border-[#dfe5e7] bg-white text-[11px] font-semibold text-[#008069] transition-colors hover:bg-[#e7fce9] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <span className={`flex h-4 w-4 items-center justify-center rounded border ${
                      allFilteredSelected ? 'border-[#00a884] bg-[#00a884] text-white' : 'border-[#8696a0]'
                    }`}>
                      {allFilteredSelected ? <Check size={11} strokeWidth={3} /> : null}
                    </span>
                    {allFilteredSelected
                      ? 'Desmarcar resultados'
                      : `Selecionar ${sendableBatchContacts.length} com telefone`}
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-[11px] font-medium text-[#667781]">
                  <span className="rounded-full bg-[#f0f2f5] px-3 py-1.5">
                    {contactStats.total} alunos
                  </span>
                  <span className="rounded-full bg-[#e7fce9] px-3 py-1.5 text-[#008069]">
                    {contactStats.telefone} com telefone
                  </span>
                </div>
              )}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto bg-white px-2 py-1 custom-scrollbar">
              {loadingContacts ? (
                <div className="p-6 text-center text-xs font-medium text-[#8696a0]">Carregando alunos...</div>
              ) : (mode === 'batch' ? batchFilteredContacts : filteredContacts).length === 0 ? (
                <div className="p-6 text-center text-xs font-medium text-[#8696a0]">Nenhum aluno encontrado.</div>
              ) : (
                (mode === 'batch' ? batchFilteredContacts : filteredContacts).map((contact) => {
                  const tone = contactTone(contact.tipo);
                  const isSelected = mode === 'batch'
                    ? selectedBatchIds.has(contact.id)
                    : selectedContact?.id === contact.id;
                  const hasPhone = Boolean(normalizePhone(contact.telefone));
                  const matchingEnrollment = contact.matriculas.find((enrollment) => {
                    if (activeOnly && normalizedStatus(enrollment.status) !== 'ATIVO') return false;
                    if (modalityFilter !== 'TODOS' && enrollment.modalidade !== modalityFilter) return false;
                    if (courseFilter && enrollment.cursoId !== courseFilter) return false;
                    if (classFilter && enrollment.turmaId !== classFilter) return false;
                    return true;
                  });

                  return (
                    <button
                      key={contact.id}
                      type="button"
                      onClick={() => {
                        if (mode === 'batch') toggleBatchContact(contact);
                        else onSelectContact(contact);
                      }}
                      disabled={mode === 'batch' && !hasPhone}
                      className={`group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00a884] ${
                        isSelected
                          ? 'bg-[#e7fce9]'
                          : 'hover:bg-[#f5f6f6]'
                      } disabled:cursor-not-allowed disabled:opacity-55`}
                    >
                      {mode === 'batch' ? (
                        <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors ${
                          isSelected
                            ? 'border-[#00a884] bg-[#00a884] text-white'
                            : 'border-[#c8d1d5] bg-white'
                        }`}>
                          {isSelected ? <Check size={12} strokeWidth={3} /> : null}
                        </span>
                      ) : null}
                      <div className={`h-11 w-11 shrink-0 overflow-hidden rounded-full ${tone.avatar} text-white`}>
                        {contact.foto ? (
                          <img src={contact.foto} alt={contact.nome} className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-xs font-bold">{initials(contact.nome)}</div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-[#111b21]">{contact.nome}</p>
                        <p className="mt-1 truncate text-xs font-normal text-[#667781]">
                          {mode === 'batch' && matchingEnrollment
                            ? [matchingEnrollment.cursoNome, matchingEnrollment.turmaNome].filter(Boolean).join(' · ')
                            : formatPhone(contact.telefone)}
                        </p>
                      </div>
                      {hasPhone ? (
                        <CheckCircle2 size={16} className="text-[#00a884]" />
                      ) : (
                        <Clock3 size={16} className="text-amber-500" />
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </aside>

          <section className="relative shrink-0 overflow-hidden bg-[#f0f2f5] p-4 sm:p-6 lg:min-h-0 lg:overflow-y-auto custom-scrollbar">
            <div className="pointer-events-none absolute inset-0 opacity-[0.08] [background-image:url('/whatsapp-chat-pattern.svg')]" />
            {mode === 'batch' ? (
              <div className="relative mx-auto w-full max-w-[720px] space-y-4 rounded-2xl border border-[#dfe5e7] bg-white p-4 shadow-[0_12px_35px_rgba(11,20,26,0.10)] sm:p-6">
                <div className="flex flex-col gap-3 border-b border-[#e9edef] pb-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#00a884]">Mensagem em massa</p>
                    <h4 className="mt-1 text-xl font-semibold text-[#111b21]">
                      Uma mensagem para vários alunos
                    </h4>
                    <p className="mt-1 text-xs font-normal text-[#667781]">
                      A mesma mensagem será enviada individualmente para cada contato.
                    </p>
                  </div>
                  <div className="shrink-0 rounded-xl bg-[#e7fce9] px-4 py-2 text-center">
                    <p className="text-xl font-semibold text-[#008069]">{sendableSelectedBatchContacts.length}</p>
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-[#008069]">selecionados</p>
                  </div>
                </div>

                {selectedBatchContacts.length > 0 ? (
                  <div>
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <p className="text-xs font-semibold text-[#3b4a54]">Destinatários</p>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedBatchIds(new Set());
                          setBatchResult(null);
                        }}
                        className="text-[11px] font-semibold text-[#008069] hover:underline"
                      >
                        Limpar seleção
                      </button>
                    </div>
                    <div className="flex max-h-24 flex-wrap gap-1.5 overflow-y-auto rounded-xl bg-[#f7f9fa] p-2.5 custom-scrollbar">
                      {selectedBatchContacts.slice(0, 12).map((contact) => (
                        <span key={contact.id} className="inline-flex min-h-7 items-center gap-1.5 rounded-full bg-white px-2.5 text-[11px] font-medium text-[#3b4a54] ring-1 ring-[#dfe5e7]">
                          {contact.nome}
                          <button
                            type="button"
                            onClick={() => toggleBatchContact(contact)}
                            className="text-[#8696a0] hover:text-[#111b21]"
                            aria-label={`Remover ${contact.nome} da seleção`}
                          >
                            <X size={12} />
                          </button>
                        </span>
                      ))}
                      {selectedBatchContacts.length > 12 ? (
                        <span className="inline-flex min-h-7 items-center rounded-full bg-[#e7fce9] px-2.5 text-[11px] font-semibold text-[#008069]">
                          +{selectedBatchContacts.length - 12}
                        </span>
                      ) : null}
                    </div>
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-[#c8d1d5] bg-[#f7f9fa] px-4 py-5 text-center text-xs font-medium text-[#667781]">
                    Use os filtros e marque os alunos na lista ao lado.
                  </div>
                )}

                <label className="block">
                  <span className="text-xs font-semibold text-[#3b4a54]">Mensagem</span>
                  <textarea
                    value={batchMessage}
                    onChange={(event) => {
                      setBatchMessage(event.target.value);
                      setBatchResult(null);
                    }}
                    placeholder="Escreva a mensagem que será enviada para todos os selecionados..."
                    className="mt-2 h-36 w-full resize-none rounded-xl border border-[#dfe5e7] bg-[#f7f9fa] p-4 text-sm font-normal leading-relaxed text-[#111b21] outline-none transition-all placeholder:text-[#8696a0] focus:border-[#00a884] focus:bg-white focus:ring-2 focus:ring-[#00a884]/10"
                  />
                  <span className="mt-1.5 block text-right text-[10px] font-medium text-[#8696a0]">
                    {batchMessage.length} caracteres
                  </span>
                </label>

                <div className="flex gap-3 rounded-xl border border-amber-100 bg-amber-50/80 p-3.5">
                  <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-600" />
                  <p className="text-xs font-medium leading-relaxed text-amber-800">
                    Mensagens livres dependem da janela de atendimento da Meta. Para campanhas ou contatos fora da janela, utilize um template aprovado.
                  </p>
                </div>

                {batchResult ? (
                  <div className={`rounded-xl border p-3.5 text-xs font-medium ${
                    batchResult.failures.length > 0
                      ? 'border-amber-200 bg-amber-50 text-amber-800'
                      : 'border-emerald-200 bg-emerald-50 text-emerald-800'
                  }`}>
                    {batchResult.sent} envio(s) concluído(s) e {batchResult.skipped} ignorado(s).
                    {batchResult.failures.length > 0 ? (
                      <span className="mt-1 block text-rose-700">
                        {batchResult.failures.slice(0, 2).join(' | ')}
                      </span>
                    ) : null}
                  </div>
                ) : null}

                <button
                  type="button"
                  onClick={handleBatchSend}
                  disabled={
                    !apiReady ||
                    isSendingBatch ||
                    !batchMessage.trim() ||
                    sendableSelectedBatchContacts.length === 0
                  }
                  className="inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-[#00a884] px-5 text-sm font-semibold text-white transition-all hover:bg-[#008f72] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00a884] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {isSendingBatch ? <RefreshCw size={16} className="animate-spin" /> : <Send size={16} />}
                  {isSendingBatch
                    ? 'Enviando mensagens...'
                    : `Enviar para ${sendableSelectedBatchContacts.length} aluno(s)`}
                </button>
              </div>
            ) : selectedContact ? (
              <div className="relative mx-auto w-full max-w-[760px] space-y-4 rounded-2xl border border-[#dfe5e7] bg-white p-4 shadow-[0_12px_35px_rgba(11,20,26,0.10)] sm:p-5">
                <div className="flex flex-col gap-4 border-b border-[#e9edef] pb-4 md:flex-row md:items-center md:justify-between">
                  <div className="flex min-w-0 items-center gap-4">
                    <div className={`h-14 w-14 shrink-0 overflow-hidden rounded-full ${contactTone(selectedContact.tipo).avatar} text-white ring-2 ring-[#e9edef]`}>
                      {selectedContact.foto ? (
                        <img src={selectedContact.foto} alt={selectedContact.nome} className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-lg font-bold">{initials(selectedContact.nome)}</div>
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#00a884]">Aluno selecionado</p>
                      <h4 className="mt-1 truncate text-lg font-semibold text-[#111b21] sm:text-xl">{selectedContact.nome}</h4>
                      <p className="mt-1 truncate text-xs font-normal text-[#667781]">{selectedContact.poloNome || selectedContact.cidade || 'Cadastro geral'}</p>
                    </div>
                  </div>
                  <span className={`inline-flex min-h-[30px] items-center rounded-lg border px-3 text-xs font-bold ${contactTone(selectedContact.tipo).badge}`}>
                    {selectedContact.status || 'ATIVO'}
                  </span>
                </div>

                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                  <InfoBlock icon={FileText} label="CPF" value={formatDocument(selectedContact.cpfCnpj)} mono />
                  <InfoBlock icon={Phone} label="Telefone" value={formatPhone(selectedContact.telefone)} mono />
                  <InfoBlock icon={Mail} label="E-mail" value={selectedContact.email || 'Não cadastrado'} />
                </div>

                <div className="rounded-xl border border-amber-100 bg-amber-50/80 p-3.5">
                  <p className="text-xs font-semibold text-amber-900">Entrega pelo WhatsApp</p>
                  <p className="mt-1 text-xs font-medium leading-relaxed text-amber-800">
                    Se o aluno ainda não estiver como destinatário de teste no painel da Meta, ou se não houver janela de atendimento aberta, a Meta pode aceitar a chamada mas não entregar mensagem livre. Para abrir conversa real fora da janela, o próximo passo é usar template aprovado.
                  </p>
                </div>

                <div className="rounded-xl bg-[#f7f9fa] p-4">
                  <div className="mb-3 flex items-center gap-2">
                    <MessageCircle size={17} className="text-[#00a884]" />
                    <p className="text-sm font-semibold text-[#111b21]">Mensagem</p>
                  </div>
                  <textarea value={quickMessage} onChange={(event) => onQuickMessageChange(event.target.value)} className="h-28 w-full resize-none rounded-xl border border-[#dfe5e7] bg-white p-4 text-sm font-normal leading-relaxed text-[#111b21] outline-none transition-all placeholder:text-[#8696a0] focus:border-[#00a884] focus:ring-2 focus:ring-[#00a884]/10" placeholder="Escreva a mensagem para este aluno..." />

                  <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                    <button type="button" onClick={onSendWhatsAppMessage} disabled={isSendingWhatsApp || !apiReady || !normalizePhone(selectedContact.telefone)} className="inline-flex min-h-[46px] items-center justify-center gap-2 rounded-xl bg-[#00a884] px-5 text-xs font-semibold text-white transition-all hover:bg-[#008f72] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00a884] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40">
                      {isSendingWhatsApp ? <RefreshCw size={15} className="animate-spin" /> : <Send size={15} />}
                      {isSendingWhatsApp ? 'Enviando...' : 'Enviar pela API'}
                    </button>
                    <button type="button" onClick={onOpenWhatsApp} className="inline-flex min-h-[46px] items-center justify-center gap-2 rounded-xl border border-[#dfe5e7] bg-white px-5 text-xs font-semibold text-[#54656f] transition-all hover:bg-[#f0f2f5] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8696a0] focus-visible:ring-offset-2">
                      <MessageCircle size={15} />
                      Abrir manual
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="relative flex min-h-[360px] h-full flex-col items-center justify-center text-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white text-[#00a884] shadow-sm">
                  <BookUser size={30} />
                </div>
                <p className="mt-5 text-base font-medium text-[#3b4a54]">Selecione um aluno</p>
                <p className="mt-2 max-w-sm text-sm font-normal leading-relaxed text-[#8696a0]">
                  Depois da seleção, o nome, CPF formatado e telefone formatado aparecem aqui para conferência antes do envio.
                </p>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>,
    document.body,
  );
};

const InfoBlock = ({ icon: Icon, label, value, mono }: {
  icon: React.ElementType;
  label: string;
  value: string;
  mono?: boolean;
}) => (
  <div className="rounded-xl border border-[#e9edef] bg-[#f7f9fa] p-3.5">
    <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-[#8696a0]">
      <Icon size={14} />
      {label}
    </div>
    <p className={`mt-2 truncate text-sm font-semibold text-[#3b4a54] ${mono ? 'font-mono' : ''}`}>{value}</p>
  </div>
);

export default StartConversationModal;
