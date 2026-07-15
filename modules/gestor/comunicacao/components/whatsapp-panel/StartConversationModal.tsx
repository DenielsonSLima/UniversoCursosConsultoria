import React from 'react';
import {
  BookUser,
  CheckCircle2,
  Clock3,
  FileText,
  Mail,
  MessageCircle,
  Phone,
  RefreshCw,
  Search,
  Send,
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
  onOpenWhatsApp: () => void;
  onClose: () => void;
}

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
  onOpenWhatsApp,
  onClose,
}) => {
  const contactStats = {
    total: contacts.length,
    telefone: contacts.filter((contact) => normalizePhone(contact.telefone)).length,
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#001a33]/45 p-4 backdrop-blur-sm">
      <div className="flex max-h-[88vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex min-h-[70px] items-center justify-between border-b border-slate-100 px-5">
          <div>
            <h3 className="text-lg font-bold tracking-tight text-[#001a33]">Iniciar conversa WhatsApp</h3>
            <p className="mt-1 text-xs font-medium text-slate-500">Pesquise o aluno, confira CPF e telefone, depois envie pela API.</p>
          </div>
          <button onClick={onClose} className="flex h-10 w-10 items-center justify-center rounded-xl text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700" title="Fechar">
            <X size={18} />
          </button>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden lg:grid-cols-[390px_minmax(0,1fr)]">
          <aside className="flex min-h-0 flex-col border-r border-slate-100 bg-slate-50/70">
            <div className="space-y-3 border-b border-slate-100 bg-white p-4">
              <label className="relative block">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  autoFocus
                  value={contactSearch}
                  onChange={(event) => onSearchChange(event.target.value)}
                  placeholder="Digite nome, CPF ou telefone..."
                  className="h-12 w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-4 text-sm font-medium text-slate-700 outline-none transition-all placeholder:text-slate-400 focus:border-emerald-500 focus:bg-white"
                />
              </label>
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-xl bg-[#001a33] p-3 text-white">
                  <p className="text-[10px] font-bold uppercase tracking-wide opacity-70">Alunos</p>
                  <p className="mt-1 text-xl font-bold">{contactStats.total}</p>
                </div>
                <div className="rounded-xl bg-emerald-50 p-3 text-emerald-700">
                  <p className="text-[10px] font-bold uppercase tracking-wide opacity-70">Com telefone</p>
                  <p className="mt-1 text-xl font-bold">{contactStats.telefone}</p>
                </div>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-2 custom-scrollbar">
              {loadingContacts ? (
                <div className="p-6 text-center text-xs font-bold text-slate-400">Carregando alunos...</div>
              ) : filteredContacts.length === 0 ? (
                <div className="p-6 text-center text-xs font-bold text-slate-400">Nenhum aluno encontrado.</div>
              ) : (
                filteredContacts.map((contact) => {
                  const tone = contactTone(contact.tipo);
                  const isSelected = selectedContact?.id === contact.id;

                  return (
                    <button
                      key={contact.id}
                      onClick={() => onSelectContact(contact)}
                      className={`flex w-full items-center gap-3 rounded-xl p-3 text-left transition-all ${isSelected ? 'bg-white shadow-sm ring-1 ring-emerald-200' : 'hover:bg-white'}`}
                    >
                      <div className={`h-11 w-11 shrink-0 overflow-hidden rounded-xl ${tone.avatar} text-white shadow-sm`}>
                        {contact.foto ? (
                          <img src={contact.foto} alt={contact.nome} className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-xs font-bold">{initials(contact.nome)}</div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold text-[#001a33]">{contact.nome}</p>
                        <p className="mt-1 truncate text-xs font-medium text-slate-500">{formatPhone(contact.telefone)}</p>
                      </div>
                      {normalizePhone(contact.telefone) ? (
                        <CheckCircle2 size={16} className="text-emerald-500" />
                      ) : (
                        <Clock3 size={16} className="text-amber-500" />
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </aside>

          <section className="min-h-0 overflow-y-auto p-5 custom-scrollbar">
            {selectedContact ? (
              <div className="space-y-5">
                <div className="flex flex-col gap-4 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm md:flex-row md:items-center md:justify-between">
                  <div className="flex min-w-0 items-center gap-4">
                    <div className={`h-16 w-16 shrink-0 overflow-hidden rounded-2xl ${contactTone(selectedContact.tipo).avatar} text-white shadow-sm`}>
                      {selectedContact.foto ? (
                        <img src={selectedContact.foto} alt={selectedContact.nome} className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-lg font-bold">{initials(selectedContact.nome)}</div>
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold uppercase tracking-wide text-emerald-600">Aluno selecionado</p>
                      <h4 className="mt-1 truncate text-2xl font-bold tracking-tight text-[#001a33]">{selectedContact.nome}</h4>
                      <p className="mt-1 truncate text-xs font-medium text-slate-500">{selectedContact.poloNome || selectedContact.cidade || 'Cadastro geral'}</p>
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

                <div className="rounded-2xl border border-amber-100 bg-amber-50 p-4">
                  <p className="text-sm font-bold text-amber-900">Teste da Meta</p>
                  <p className="mt-1 text-xs font-medium leading-relaxed text-amber-800">
                    Se o aluno ainda não estiver como destinatário de teste no painel da Meta, ou se não houver janela de atendimento aberta, a Meta pode aceitar a chamada mas não entregar mensagem livre. Para abrir conversa real fora da janela, o próximo passo é usar template aprovado.
                  </p>
                </div>

                <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                  <div className="mb-3 flex items-center gap-2">
                    <MessageCircle size={17} className="text-emerald-600" />
                    <p className="text-sm font-bold text-[#001a33]">Mensagem</p>
                  </div>
                  <textarea value={quickMessage} onChange={(event) => onQuickMessageChange(event.target.value)} className="h-36 w-full resize-none rounded-xl border border-slate-200 bg-white p-4 text-sm font-semibold leading-relaxed text-slate-700 outline-none transition-all focus:border-emerald-500" placeholder="Escreva a mensagem para este aluno..." />

                  <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                    <button onClick={onSendWhatsAppMessage} disabled={isSendingWhatsApp || !apiReady || !normalizePhone(selectedContact.telefone)} className="inline-flex min-h-[46px] items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 text-xs font-bold uppercase tracking-wide text-white transition-all hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40">
                      {isSendingWhatsApp ? <RefreshCw size={15} className="animate-spin" /> : <Send size={15} />}
                      {isSendingWhatsApp ? 'Enviando...' : 'Enviar pela API'}
                    </button>
                    <button onClick={onOpenWhatsApp} className="inline-flex min-h-[46px] items-center justify-center gap-2 rounded-xl bg-[#001a33] px-5 text-xs font-bold uppercase tracking-wide text-white transition-all hover:bg-blue-900">
                      <MessageCircle size={15} />
                      Abrir manual
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex min-h-[520px] flex-col items-center justify-center text-center">
                <BookUser size={42} className="text-slate-300" />
                <p className="mt-4 text-base font-bold text-slate-600">Digite e selecione um aluno</p>
                <p className="mt-1 max-w-sm text-sm font-medium leading-relaxed text-slate-400">
                  Depois da seleção, o nome, CPF formatado e telefone formatado aparecem aqui para conferência antes do envio.
                </p>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
};

const InfoBlock = ({ icon: Icon, label, value, mono }: {
  icon: React.ElementType;
  label: string;
  value: string;
  mono?: boolean;
}) => (
  <div className="rounded-2xl bg-slate-50 p-4">
    <div className="flex items-center gap-2 text-xs font-semibold text-slate-400">
      <Icon size={14} />
      {label}
    </div>
    <p className={`mt-2 truncate text-sm font-bold text-slate-800 ${mono ? 'font-mono' : ''}`}>{value}</p>
  </div>
);

export default StartConversationModal;
