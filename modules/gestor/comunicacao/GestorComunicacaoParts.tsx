import React, { RefObject } from 'react';
import {
  AlertTriangle, CheckCircle, Clock, File, FileSpreadsheet, FileText, Filter, Image,
  MessageSquare, Mic, Paperclip, Plus, Search, Send, Sparkles, Square, Tag, Trash2, X,
} from 'lucide-react';
import { CommunicationAttachmentPreview } from '../../shared/comunicacao/CommunicationAttachmentPreview';
import {
  formatGestorChatTime,
  GestorCategory,
  GestorChat,
  GestorMessage,
  getGestorCategoryInfo,
} from './gestor-comunicacao.types';

const ACCEPTED_ATTACHMENTS = 'image/jpeg,image/png,image/gif,image/webp,audio/webm,audio/ogg,audio/mp4,audio/mpeg,audio/wav,.mp3,.m4a,.wav,.ogg,.webm,.pdf,.ppt,.pptx,.doc,.docx,.xls,.xlsx';

const formatRecordingTime = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

const FileIcon = ({ type }: { type: string }) => {
  const lower = type.toLowerCase();
  if (lower.startsWith('audio/')) return <Mic size={14} className="text-rose-500" />;
  if (['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(lower)) return <Image size={14} className="text-blue-500" />;
  if (lower.includes('pdf')) return <FileText size={14} className="text-red-500" />;
  if (lower.includes('spreadsheet') || lower.includes('excel')) return <FileSpreadsheet size={14} className="text-emerald-600" />;
  if (lower.includes('word')) return <FileText size={14} className="text-blue-600" />;
  return <File size={14} className="text-slate-500" />;
};

interface GestorInboxProps {
  activeChatId: string | null;
  activeStatus: 'pendente' | 'solucionada';
  categories: GestorCategory[];
  chats: GestorChat[];
  filteredChats: GestorChat[];
  loading: boolean;
  pendingCount: number;
  searchText: string;
  selectedCategory: string;
  solvedCount: number;
  unreadChatIds: Set<string>;
  onActiveChat: (id: string) => void;
  onActiveStatus: (status: 'pendente' | 'solucionada') => void;
  onCategory: (id: string) => void;
  onSearch: (value: string) => void;
  onStart: () => void;
}

export const GestorInbox: React.FC<GestorInboxProps> = ({
  activeChatId, activeStatus, categories, chats, filteredChats, loading, pendingCount,
  searchText, selectedCategory, solvedCount, unreadChatIds, onActiveChat, onActiveStatus,
  onCategory, onSearch, onStart,
}) => {
  const selectStatus = (status: 'pendente' | 'solucionada') => {
    onActiveStatus(status);
    const first = chats.find((chat) => chat.status === status);
    if (first) onActiveChat(first.id);
  };
  return (
    <div className="w-[360px] border-r border-slate-200 flex flex-col bg-white shrink-0">
      <div className="space-y-3 border-b border-slate-100 bg-white p-4">
        <button onClick={onStart} className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-2xl bg-[#001a33] px-4 text-xs font-bold uppercase tracking-wide text-white shadow-sm transition-colors hover:bg-blue-900"><Plus size={15} />Iniciar conversa</button>
        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => selectStatus('pendente')} className={`flex min-h-[38px] items-center justify-center gap-2 rounded-xl text-xs font-bold transition-all ${activeStatus === 'pendente' ? 'bg-amber-50 text-amber-700 ring-1 ring-amber-100' : 'bg-slate-50 text-slate-500 hover:bg-slate-100 hover:text-amber-600'}`}><Clock size={14} /> Abertas <span className="rounded-full bg-white/80 px-1.5 text-[10px]">{pendingCount}</span></button>
          <button onClick={() => selectStatus('solucionada')} className={`flex min-h-[38px] items-center justify-center gap-2 rounded-xl text-xs font-bold transition-all ${activeStatus === 'solucionada' ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100' : 'bg-slate-50 text-slate-500 hover:bg-slate-100 hover:text-emerald-600'}`}><CheckCircle size={14} /> Resolvidas <span className="rounded-full bg-white/80 px-1.5 text-[10px]">{solvedCount}</span></button>
        </div>
        <div className="flex flex-col gap-2">
          <div className="relative">
            <input type="text" placeholder="Buscar conversa..." value={searchText} onChange={(event) => onSearch(event.target.value)} className="h-11 w-full rounded-2xl border border-slate-100 bg-slate-50 pl-9 pr-3 text-sm font-medium text-slate-700 outline-none transition-all placeholder:text-slate-400 focus:border-blue-200 focus:bg-white" />
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          </div>
          <div className="relative">
            <select value={selectedCategory} onChange={(event) => onCategory(event.target.value)} className="h-10 w-full cursor-pointer appearance-none rounded-xl border border-transparent bg-slate-50 pl-9 pr-8 text-xs font-semibold text-slate-600 outline-none transition-colors hover:bg-slate-100">
              <option value="todos">Todas as categorias</option>
              {categories.map((category) => <option key={category.id} value={category.id}>{category.nome}</option>)}
            </select>
            <Filter size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          </div>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-1.5 custom-scrollbar">
        {loading ? <div className="flex justify-center items-center py-10"><div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" /></div>
          : filteredChats.length === 0 ? <div className="px-6 py-12 text-center"><MessageSquare size={26} className="mx-auto mb-3 text-slate-300" /><p className="text-sm font-bold text-slate-600">Nenhuma conversa</p><p className="mt-1 text-xs font-medium leading-relaxed text-slate-400">Inicie uma conversa com um aluno ou altere o filtro.</p></div>
          : filteredChats.map((chat) => {
            const category = getGestorCategoryInfo(categories, chat.categoria_id);
            const selected = activeChatId === chat.id;
            return (
              <button key={chat.id} onClick={() => onActiveChat(chat.id)} className={`w-full flex items-center gap-3 p-3 rounded-2xl text-left transition-all border ${selected ? 'bg-blue-50/80 shadow-sm border-blue-100' : 'hover:bg-slate-50 border-transparent'}`}>
                <div className={`w-11 h-11 rounded-full flex items-center justify-center font-bold text-sm text-white shrink-0 shadow-sm ${chat.remetente_tipo === 'Professor' ? 'bg-purple-600' : chat.remetente_tipo === 'Visitante' ? 'bg-cyan-600' : 'bg-blue-600'}`}>{chat.remetente_nome.slice(0, 2).toUpperCase()}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-baseline mb-0.5"><h4 className="font-bold truncate text-sm text-[#001a33] flex items-center gap-1.5">{chat.remetente_nome}{unreadChatIds.has(chat.id) && <span className="w-2 h-2 bg-red-500 rounded-full shrink-0 animate-pulse" />}</h4><span className="text-[10px] text-slate-400 font-medium shrink-0">{formatGestorChatTime(chat.ultima_data)}</span></div>
                  <p className="text-xs text-slate-500 truncate font-medium">{chat.ultimo_texto || 'Sem mensagens...'}</p>
                  <div className="flex items-center gap-1.5 mt-2"><div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: category.cor }} /><span className="text-[10px] text-slate-400 font-semibold">Setor: {chat.setor ? chat.setor.replaceAll('_', ' ') : category.nome}</span><span className="text-[10px] text-slate-300 font-medium">|</span><span className={`text-[10px] font-bold ${chat.remetente_tipo === 'Professor' ? 'text-purple-600 bg-purple-50' : chat.remetente_tipo === 'Visitante' ? 'text-cyan-700 bg-cyan-50' : 'text-blue-600 bg-blue-50'} px-2 py-0.5 rounded-full`}>{chat.origem === 'publico' ? 'Chat público' : chat.remetente_tipo}</span></div>
                </div>
              </button>
            );
          })}
      </div>
    </div>
  );
};

interface GestorChatPanelProps {
  categories: GestorCategory[];
  chat: GestorChat | undefined;
  fileInputRef: RefObject<HTMLInputElement | null>;
  loading: boolean;
  messageText: string;
  messages: GestorMessage[];
  messagesEndRef: RefObject<HTMLDivElement | null>;
  pendingFile: File | null;
  recording: boolean;
  recordingSeconds: number;
  uploading: boolean;
  onDelete: () => void;
  onFile: (file: File | null) => void;
  onMessage: (value: string) => void;
  onRecord: () => void;
  onSend: () => void;
  onSolve: () => void;
  onTransfer: (categoryId: string) => void;
}

export const GestorChatPanel: React.FC<GestorChatPanelProps> = ({
  categories, chat, fileInputRef, loading, messageText, messages, messagesEndRef,
  pendingFile, recording, recordingSeconds, uploading, onDelete, onFile, onMessage,
  onRecord, onSend, onSolve, onTransfer,
}) => {
  if (!chat) return <div className="flex-1 flex flex-col items-center justify-center bg-slate-50 px-8 text-center"><div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center text-blue-300 mb-4 shadow-sm"><MessageSquare size={30} /></div><h3 className="text-lg font-bold text-[#001a33] tracking-tight">Atendimento ao usuário</h3><p className="text-slate-400 text-xs font-medium max-w-xs mt-1">Selecione um chamado ao lado para iniciar a conversa em tempo real.</p></div>;
  return (
    <div className="flex-1 flex flex-col bg-white">
      <div className="min-h-[72px] border-b border-slate-100 flex justify-between items-center bg-white px-5 z-10">
        <div className="flex items-center gap-3"><div className={`w-11 h-11 rounded-full flex items-center justify-center font-bold text-sm text-white ${chat.remetente_tipo === 'Professor' ? 'bg-purple-600' : chat.remetente_tipo === 'Visitante' ? 'bg-cyan-600' : 'bg-blue-600'}`}>{chat.remetente_nome.slice(0, 2).toUpperCase()}</div><div><h3 className="font-bold text-sm text-[#001a33] flex items-center gap-2">{chat.remetente_nome}<span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${chat.remetente_tipo === 'Professor' ? 'bg-purple-50 text-purple-600 border border-purple-100' : chat.remetente_tipo === 'Visitante' ? 'bg-cyan-50 text-cyan-700 border border-cyan-100' : 'bg-blue-50 text-blue-600 border border-blue-100'}`}>{chat.origem === 'publico' ? 'Chat público' : chat.remetente_tipo}</span></h3><div className="flex flex-wrap items-center gap-2 mt-1"><span className="text-[11px] font-medium text-slate-500 flex items-center gap-1"><Tag size={9} /> Setor: {chat.setor ? chat.setor.replaceAll('_', ' ') : getGestorCategoryInfo(categories, chat.categoria_id).nome}</span>{chat.protocolo ? <><span className="w-1 h-1 bg-slate-300 rounded-full" /><span className="text-[10px] font-black text-blue-600">{chat.protocolo}</span></> : null}<span className="w-1 h-1 bg-slate-300 rounded-full" /><span className={`text-[11px] font-semibold flex items-center gap-1 ${chat.status === 'pendente' ? 'text-amber-500' : 'text-emerald-500'}`}>{chat.status === 'pendente' ? <Clock size={9} /> : <CheckCircle size={9} />}{chat.status === 'pendente' ? 'Aberto' : 'Resolvido'}</span></div></div></div>
        <div className="flex items-center gap-2">{chat.status === 'pendente' && <label className="relative flex items-center"><span className="sr-only">Transferir conversa para outro setor</span><select value={chat.categoria_id || ''} onChange={(event) => onTransfer(event.target.value)} className="h-10 appearance-none rounded-xl border border-slate-200 bg-slate-50 pl-3 pr-8 text-xs font-semibold text-slate-600 outline-none transition-colors hover:bg-white focus:border-blue-500"><option value="" disabled>Transferir setor</option>{categories.filter((category) => category.ativo).map((category) => <option key={category.id} value={category.id}>{category.nome}</option>)}</select><Tag size={12} className="pointer-events-none absolute right-3 text-slate-400" /></label>}{chat.status === 'pendente' && <button onClick={onSolve} className="px-3.5 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-600 border border-emerald-100 rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5"><CheckCircle size={12} /> Finalizar</button>}<button onClick={onDelete} title="Excluir atendimento e arquivos" className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-colors"><Trash2 size={16} /></button></div>
      </div>
      <div className="flex-1 overflow-y-auto p-5 bg-[#f7f9fb] space-y-3 custom-scrollbar">
        {loading ? <div className="flex justify-center items-center py-20"><div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" /></div> : messages.map((message) => {
          const isGestor = message.remetente_tipo === 'gestor';
          if (message.remetente_tipo === 'sistema') return <div key={message.id} className="flex justify-center my-6"><span className="bg-white border border-slate-200 text-slate-500 text-[11px] font-medium px-3 py-1 rounded-full shadow-sm flex items-center gap-1"><Sparkles size={9} /> {message.conteudo}</span></div>;
          const hasText = Boolean(
            message.conteudo
            && !message.conteudo.startsWith('📎')
            && message.conteudo !== '🎤 Mensagem de voz',
          );
          return <div key={message.id} className={`flex items-end gap-2 ${isGestor ? 'justify-end' : 'justify-start'}`}>{!isGestor && <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0 ${chat.remetente_tipo === 'Professor' ? 'bg-purple-500' : 'bg-blue-500'}`}>{message.remetente_nome.slice(0, 2).toUpperCase()}</div>}<div className={`rounded-2xl max-w-md shadow-sm border overflow-hidden ${isGestor ? 'bg-[#001a33] text-white border-transparent rounded-br-sm' : 'bg-white text-slate-700 border-slate-100 rounded-bl-sm'}`}><CommunicationAttachmentPreview attachment={message} outgoing={isGestor} />{hasText && <div className="px-3.5 pt-2.5 pb-1"><p className={`text-[10px] font-semibold mb-1 ${isGestor ? 'text-blue-300' : 'text-blue-600'}`}>{message.remetente_nome}</p><p className="text-sm font-medium leading-relaxed break-words">{message.conteudo}</p></div>}<div className={`flex items-center justify-end px-3 pb-1.5 ${hasText ? '' : 'pt-1.5'}`}><span className="text-[10px] font-medium text-slate-400">{formatGestorChatTime(message.created_at)}</span></div></div></div>;
        })}<div ref={messagesEndRef} />
      </div>
      <div className="shrink-0 border-t border-slate-100 bg-white">{chat.status === 'solucionada' ? <div className="px-4 py-4"><div className="text-center bg-emerald-50 border border-emerald-100 text-emerald-600 rounded-xl py-3 text-xs font-bold flex items-center justify-center gap-2"><CheckCircle size={12} /> Atendimento finalizado.</div></div> : <div className="p-3 space-y-2">{pendingFile && <div className={`flex items-center gap-2 rounded-xl border px-3 py-2 ${pendingFile.type.startsWith('audio/') ? 'border-rose-100 bg-rose-50' : 'border-blue-100 bg-blue-50'}`}><FileIcon type={pendingFile.type} /><span className="text-xs font-bold text-slate-700 truncate flex-1">{pendingFile.name}</span><button onClick={() => onFile(null)} className="p-0.5 hover:bg-white/70 rounded-full transition-colors" title="Remover anexo"><X size={12} className="text-slate-500" /></button></div>}{recording && <div className="flex min-h-11 items-center gap-3 rounded-xl border border-rose-100 bg-rose-50 px-3 text-rose-700"><span className="h-2.5 w-2.5 shrink-0 animate-pulse rounded-full bg-rose-500" /><span className="text-[11px] font-black uppercase tracking-wide">Gravando áudio</span><div className="flex flex-1 items-center justify-center gap-1 overflow-hidden" aria-hidden="true">{Array.from({ length: 18 }, (_, index) => <span key={index} className="w-1 rounded-full bg-rose-300" style={{ height: `${7 + ((index * 7) % 16)}px` }} />)}</div><span className="text-xs font-black tabular-nums">{formatRecordingTime(recordingSeconds)}</span></div>}<div className="flex items-center gap-2"><button onClick={() => fileInputRef.current?.click()} disabled={recording || uploading} className="p-2.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-colors shrink-0 disabled:opacity-40" title="Anexar foto, áudio ou documento"><Paperclip size={18} /></button><input ref={fileInputRef} type="file" accept={ACCEPTED_ATTACHMENTS} className="hidden" onChange={(event) => { onFile(event.target.files?.[0] || null); event.target.value = ''; }} /><button type="button" onClick={onRecord} disabled={uploading || Boolean(pendingFile)} className={`p-2.5 rounded-xl transition-colors shrink-0 disabled:opacity-40 ${recording ? 'bg-rose-600 text-white hover:bg-rose-700' : 'text-slate-400 hover:bg-rose-50 hover:text-rose-600'}`} title={recording ? 'Parar gravação' : 'Gravar áudio'}>{recording ? <Square size={16} fill="currentColor" /> : <Mic size={18} />}</button><div className="flex-1 bg-slate-50 rounded-xl flex items-center px-4 border border-slate-200 focus-within:border-blue-500 focus-within:bg-white transition-all"><input type="text" value={messageText} onChange={(event) => onMessage(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && !event.shiftKey && onSend()} placeholder={recording ? 'Gravando mensagem de voz...' : pendingFile ? 'Adicione uma legenda (opcional)...' : 'Escreva uma mensagem...'} disabled={recording || uploading} className="w-full bg-transparent border-none outline-none text-sm text-slate-700 py-3 font-medium placeholder:text-slate-400 disabled:opacity-60" /></div><button onClick={onSend} disabled={recording || (!messageText.trim() && !pendingFile) || uploading} className="p-2.5 bg-[#001a33] text-white rounded-full hover:bg-blue-900 transition-colors shadow-sm disabled:opacity-40 shrink-0">{uploading ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Send size={16} />}</button></div></div>}</div>
    </div>
  );
};

export const GestorDeleteChatModal: React.FC<{ deleting: boolean; onCancel: () => void; onConfirm: () => void }> = ({ deleting, onCancel, onConfirm }) => (
  <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"><div className="bg-white rounded-[2rem] p-8 max-w-sm w-full border border-slate-100 shadow-2xl relative animate-fadeIn"><div className="flex flex-col items-center text-center gap-4"><div className="w-14 h-14 bg-red-50 text-red-500 rounded-2xl flex items-center justify-center"><AlertTriangle size={28} /></div><div><h4 className="text-base font-bold text-[#001a33] tracking-tight">Excluir atendimento</h4><p className="text-slate-500 text-xs mt-2 leading-relaxed">Esta ação é <strong>irreversível</strong>. O atendimento, todas as mensagens e <strong>todos os arquivos anexados</strong> serão permanentemente deletados. O aluno também perderá acesso ao histórico.</p></div><div className="flex gap-3 w-full mt-2"><button onClick={onCancel} disabled={deleting} className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs uppercase tracking-wide rounded-xl transition-all">Cancelar</button><button onClick={onConfirm} disabled={deleting} className="flex-1 py-3 bg-red-500 hover:bg-red-600 text-white font-bold text-xs uppercase tracking-wide rounded-xl transition-all shadow-md disabled:opacity-50 flex items-center justify-center gap-2">{deleting ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <><Trash2 size={13} /> Excluir Tudo</>}</button></div></div></div></div>
);
