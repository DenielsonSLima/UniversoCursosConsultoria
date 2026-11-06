import React from 'react';
import { MessageSquare } from 'lucide-react';
import ToastNotification, { type Toast } from '../components/ToastNotification';
import StartInternalConversationModal, { type InternalConversationContact } from './components/StartInternalConversationModal';
import { GestorChatPanel, GestorDeleteChatModal, GestorInbox } from './GestorComunicacaoParts';
import type { GestorChat } from './gestor-comunicacao.types';
import type { useGestorComunicacaoRealtime } from './useGestorComunicacaoRealtime';

interface InternalCommunicationViewProps {
  embedded: boolean;
  realtime: ReturnType<typeof useGestorComunicacaoRealtime>;
  toasts: Toast[];
  removeToast: (id: string) => void;
  showStartConversation: boolean;
  setShowStartConversation: React.Dispatch<React.SetStateAction<boolean>>;
  handleStartInternalConversation: (contact: InternalConversationContact, content: string, categoryId: string | null) => Promise<void>;
  activeTicketStatus: 'pendente' | 'solucionada';
  searchText: string;
  selectedCategoryFilter: string;
  setActiveTicketStatus: React.Dispatch<React.SetStateAction<'pendente' | 'solucionada'>>;
  setSelectedCategoryFilter: React.Dispatch<React.SetStateAction<string>>;
  setSearchText: React.Dispatch<React.SetStateAction<string>>;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  messageText: string;
  pendingFile: File | null;
  recording: boolean;
  recordingSeconds: number;
  uploadingFile: boolean;
  setShowDeleteConfirm: React.Dispatch<React.SetStateAction<boolean>>;
  setPendingFile: React.Dispatch<React.SetStateAction<File | null>>;
  setMessageText: React.Dispatch<React.SetStateAction<string>>;
  onRecord: () => void;
  handleSendMessage: () => Promise<void>;
  handleMarkAsSolved: () => Promise<void>;
  handleTransferCategory: (categoryId: string) => Promise<void>;
  showDeleteConfirm: boolean;
  deletingChat: boolean;
  handleDeleteChat: () => Promise<void>;
  currentChat: GestorChat | undefined;
}

const InternalCommunicationView: React.FC<InternalCommunicationViewProps> = ({
  embedded,
  realtime,
  toasts,
  removeToast,
  showStartConversation,
  setShowStartConversation,
  handleStartInternalConversation,
  activeTicketStatus,
  searchText,
  selectedCategoryFilter,
  setActiveTicketStatus,
  setSelectedCategoryFilter,
  setSearchText,
  fileInputRef,
  messageText,
  pendingFile,
  recording,
  recordingSeconds,
  uploadingFile,
  setShowDeleteConfirm,
  setPendingFile,
  setMessageText,
  onRecord,
  handleSendMessage,
  handleMarkAsSolved,
  handleTransferCategory,
  showDeleteConfirm,
  deletingChat,
  handleDeleteChat,
  currentChat,
}: InternalCommunicationViewProps) => {
  const {
    activeChatId,
    categories,
    chats,
    loadingChats,
    loadingMessages,
    messages,
    messagesEndRef,
    setActiveChatId,
    unreadChatIds,
  } = realtime;
  // Get active chat data
  const pendingCount = chats.filter(chat => chat.status === 'pendente').length;
  const solvedCount = chats.filter(chat => chat.status === 'solucionada').length;

  // Filtered chats list
  const filteredChats = chats.filter(c => {
    if (c.status !== activeTicketStatus) return false;
    if (selectedCategoryFilter !== 'todos' && c.categoria_id !== selectedCategoryFilter) return false;
    if (searchText && !c.remetente_nome.toLowerCase().includes(searchText.toLowerCase())) return false;
    return true;
  });

  return (
    <div className={`comunicacao-workspace comunicacao-internal-shell flex min-h-0 flex-col overflow-hidden bg-white antialiased ${embedded ? 'h-full flex-1' : 'h-[calc(100vh-120px)] rounded-3xl border border-slate-100 shadow-sm animate-fadeIn'}`}>
      <ToastNotification toasts={toasts} onRemove={removeToast} />
      <StartInternalConversationModal
        open={showStartConversation}
        categories={categories}
        onClose={() => setShowStartConversation(false)}
        onStart={handleStartInternalConversation}
      />
  
      {!embedded && (
        <div className="comunicacao-internal-heading flex shrink-0 items-center justify-between border-b border-slate-100 bg-white px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="comunicacao-internal-icon flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
              <MessageSquare size={22} />
            </div>
            <div>
              <h1 className="comunicacao-internal-title text-xl font-bold tracking-tight text-[#001a33]">Mensagens internas</h1>
              <p className="text-xs font-medium text-slate-400">
                {pendingCount} em aberto, {solvedCount} solucionadas
              </p>
            </div>
          </div>
        </div>
      )}
  
      <div className="comunicacao-internal-body flex-1 flex overflow-hidden min-h-0">
        <GestorInbox
          activeChatId={activeChatId}
          activeStatus={activeTicketStatus}
          categories={categories}
          chats={chats}
          filteredChats={filteredChats}
          loading={loadingChats}
          pendingCount={pendingCount}
          searchText={searchText}
          selectedCategory={selectedCategoryFilter}
          solvedCount={solvedCount}
          unreadChatIds={unreadChatIds}
          onActiveChat={setActiveChatId}
          onActiveStatus={setActiveTicketStatus}
          onCategory={setSelectedCategoryFilter}
          onSearch={setSearchText}
          onStart={() => setShowStartConversation(true)}
        />
        <GestorChatPanel
          categories={categories}
          chat={currentChat}
          fileInputRef={fileInputRef}
          loading={loadingMessages}
          messageText={messageText}
          messages={messages}
          messagesEndRef={messagesEndRef}
          pendingFile={pendingFile}
          recording={recording}
          recordingSeconds={recordingSeconds}
          uploading={uploadingFile}
          onDelete={() => setShowDeleteConfirm(true)}
          onFile={setPendingFile}
          onMessage={setMessageText}
          onRecord={onRecord}
          onSend={handleSendMessage}
          onSolve={handleMarkAsSolved}
          onTransfer={handleTransferCategory}
        />
      </div>
  
      {showDeleteConfirm && (
        <GestorDeleteChatModal
          deleting={deletingChat}
          onCancel={() => setShowDeleteConfirm(false)}
          onConfirm={handleDeleteChat}
        />
      )}
    </div>
  );
};

export default InternalCommunicationView;
