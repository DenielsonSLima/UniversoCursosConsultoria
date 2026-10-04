import React, { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import StartConversationModal, { type StartConversationBatchResult } from './components/whatsapp-panel/StartConversationModal';
import { whatsappService } from './components/whatsapp/whatsapp.service';
import { defaultMessageFor, normalizePhone } from './components/whatsapp/whatsapp.utils';
import type { WhatsAppContact } from './components/whatsapp/whatsapp.types';

interface UnifiedWhatsAppStartProps {
  connectionId: string | null;
  apiReady: boolean;
  onClose: () => void;
  onCreated: (conversationId: string, connectionId: string) => void;
  onError: (title: string, message: string) => void;
  onSuccess: (title: string, message: string) => void;
}

const UnifiedWhatsAppStart: React.FC<UnifiedWhatsAppStartProps> = ({
  connectionId, apiReady, onClose, onCreated, onError, onSuccess,
}) => {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [selectedContact, setSelectedContact] = useState<WhatsAppContact | null>(null);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const contactsQuery = useQuery({
    queryKey: ['whatsapp', 'iniciar-conversa-alunos'],
    queryFn: whatsappService.getContacts,
    staleTime: 60_000,
  });
  const contacts = contactsQuery.data || [];
  const filteredContacts = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('pt-BR');
    if (!term) return contacts;
    return contacts.filter((contact) => [
      contact.nome, contact.email, contact.telefone, contact.cpfCnpj, contact.cidade, contact.poloNome,
      ...contact.matriculas.flatMap((enrollment) => [enrollment.cursoNome, enrollment.turmaNome, enrollment.turmaCodigo]),
    ].filter(Boolean).join(' ').toLocaleLowerCase('pt-BR').includes(term));
  }, [contacts, search]);

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['whatsapp', connectionId, 'conversas'] });
    void queryClient.invalidateQueries({ queryKey: ['whatsapp', connectionId, 'mensagens'] });
    void queryClient.invalidateQueries({ queryKey: ['whatsapp', 'uso-mensal'] });
  };

  const sendIndividual = async () => {
    const phone = normalizePhone(selectedContact?.telefone);
    if (!selectedContact || !connectionId || !apiReady || !phone || !message.trim() || sending) return;
    setSending(true);
    try {
      const result = await whatsappService.sendMessage({ connectionId, alunoId: selectedContact.id, to: phone, message: message.trim() });
      await refresh();
      onSuccess('WhatsApp enviado', `Mensagem enviada para ${selectedContact.nome}.`);
      onClose();
      if (result?.conversaId) onCreated(String(result.conversaId), connectionId);
    } catch (error) {
      onError('Erro no WhatsApp', error instanceof Error ? error.message : 'Não foi possível enviar pela API da Meta.');
    } finally {
      setSending(false);
    }
  };

  const sendBatch = async (recipients: WhatsAppContact[], text: string): Promise<StartConversationBatchResult> => {
    if (!connectionId || !apiReady || !text.trim()) {
      return { sent: 0, skipped: recipients.length, failures: ['A API não está disponível ou a mensagem está vazia.'] };
    }
    const result: StartConversationBatchResult = { sent: 0, skipped: 0, failures: [] };
    for (const contact of recipients) {
      const phone = normalizePhone(contact.telefone);
      if (!phone) { result.skipped += 1; continue; }
      try {
        await whatsappService.sendMessage({ connectionId, alunoId: contact.id, to: phone, message: text.trim() });
        result.sent += 1;
      } catch (error) {
        result.failures.push(`${contact.nome}: ${error instanceof Error ? error.message : 'falha no envio'}`);
      }
    }
    await refresh();
    return result;
  };

  return (
    <>
      {contactsQuery.error && <p role="alert" className="fixed right-4 top-4 z-[120] rounded-xl bg-rose-50 p-3 text-xs font-bold text-rose-700">Não foi possível carregar os alunos. Feche e tente novamente.</p>}
      <StartConversationModal
        contacts={contacts}
        filteredContacts={filteredContacts}
        loadingContacts={contactsQuery.isLoading}
        contactSearch={search}
        selectedContact={selectedContact}
        quickMessage={message}
        isSendingWhatsApp={sending}
        apiReady={apiReady}
        onSearchChange={setSearch}
        onSelectContact={(contact) => { setSelectedContact(contact); setMessage(defaultMessageFor(contact)); }}
        onQuickMessageChange={setMessage}
        onSendWhatsAppMessage={sendIndividual}
        onSendWhatsAppBatch={sendBatch}
        onOpenWhatsApp={() => {
          const phone = normalizePhone(selectedContact?.telefone);
          if (phone) window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer');
        }}
        onClose={onClose}
      />
    </>
  );
};

export default UnifiedWhatsAppStart;
