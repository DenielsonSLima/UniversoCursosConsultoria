import React, { useState } from 'react';
import { Search, MessageSquare, CheckCircle, Clock, Send, Paperclip, MoreVertical, Filter, Tag } from 'lucide-react';

type TicketStatus = 'pendente' | 'solucionada';

const ComunicacaoPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TicketStatus>('pendente');
  const [tipoFiltro, setTipoFiltro] = useState<string>('todos');
  const [activeChat, setActiveChat] = useState<number | null>(1);
  const [message, setMessage] = useState('');

  // Dados mockados focados em solicitações de alunos
  const solicitacoes = [
    { id: 1, status: 'pendente', tipo: 'Financeira', name: 'João Silva', curso: 'Administração', avatar: 'JS', unread: 2, polo: 'Polo Aracaju', ultimaData: '10:42' },
    { id: 2, status: 'pendente', tipo: 'Secretaria', name: 'Maria Souza', curso: 'Engenharia', avatar: 'MS', unread: 1, polo: 'Polo Aracaju', ultimaData: '09:15' },
    { id: 3, status: 'pendente', tipo: 'Pedagógica', name: 'Pedro Alves', curso: 'Direito', avatar: 'PA', unread: 0, polo: 'Matriz', ultimaData: 'Ontem' },
    
    { id: 4, status: 'solucionada', tipo: 'Financeira', name: 'Ana Costa', curso: 'Administração', avatar: 'AC', unread: 0, polo: 'Polo Estância', ultimaData: 'Ontem' },
    { id: 5, status: 'solucionada', tipo: 'Suporte', name: 'Lucas Mendes', curso: 'Sistemas', avatar: 'LM', unread: 0, polo: 'Matriz', ultimaData: 'Segunda' },
  ];

  const filteredTickets = solicitacoes.filter(c => {
    if (c.status !== activeTab) return false;
    if (tipoFiltro !== 'todos' && c.tipo !== tipoFiltro) return false;
    return true;
  });

  const currentChatData = solicitacoes.find(c => c.id === activeChat);

  const handleSendMessage = () => {
    if (!message.trim()) return;
    alert(`Mensagem enviada com sucesso: ${message}`);
    setMessage('');
  };

  const handleMarkAsSolved = () => {
    alert("Solicitação marcada como solucionada!");
  };

  return (
    <div className="flex h-[calc(100vh-140px)] bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-sm animate-fadeIn">
      
      {/* Sidebar de Tickets */}
      <div className="w-80 border-r border-slate-200 flex flex-col bg-slate-50/50">
        <div className="p-4 border-b border-slate-200 bg-white">
          <h2 className="text-xl font-black text-[#001a33] uppercase tracking-tight mb-4 flex items-center gap-2">
            <MessageSquare size={20} className="text-blue-600" /> Atendimento
          </h2>
          
          <div className="flex gap-1 bg-slate-100 p-1 rounded-xl mb-4">
            <button 
              onClick={() => setActiveTab('pendente')}
              className={`flex-1 flex items-center justify-center gap-2 py-2 text-xs font-bold uppercase tracking-widest rounded-lg transition-all ${
                activeTab === 'pendente' ? 'bg-white text-amber-600 shadow-sm' : 'text-slate-500 hover:text-amber-600'
              }`}
            >
              <Clock size={14} /> Pendentes
            </button>
            <button 
              onClick={() => setActiveTab('solucionada')}
              className={`flex-1 flex items-center justify-center gap-2 py-2 text-xs font-bold uppercase tracking-widest rounded-lg transition-all ${
                activeTab === 'solucionada' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-500 hover:text-emerald-600'
              }`}
            >
              <CheckCircle size={14} /> Solucionadas
            </button>
          </div>

          <div className="flex gap-2 mb-4">
            <div className="relative flex-1">
              <input 
                type="text" 
                placeholder="Buscar aluno..."
                className="w-full bg-slate-100 border-none outline-none rounded-xl pl-9 pr-3 py-2 text-sm font-medium text-slate-700"
              />
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            </div>
            
            <div className="relative">
              <select
                value={tipoFiltro}
                onChange={(e) => setTipoFiltro(e.target.value)}
                className="appearance-none bg-slate-100 border-none outline-none rounded-xl pl-9 pr-6 py-2 text-sm font-bold text-slate-700 cursor-pointer"
              >
                <option value="todos">Todos</option>
                <option value="Financeira">Financeira</option>
                <option value="Secretaria">Secretaria</option>
                <option value="Pedagógica">Pedagógica</option>
                <option value="Suporte">Suporte</option>
              </select>
              <Filter size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar">
          {filteredTickets.map(chat => (
            <button 
              key={chat.id}
              onClick={() => setActiveChat(chat.id)}
              className={`w-full flex items-center gap-3 p-3 rounded-xl text-left transition-all group ${
                activeChat === chat.id ? 'bg-blue-50' : 'hover:bg-slate-100'
              }`}
            >
              <div className="relative">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm text-white ${
                  activeChat === chat.id ? 'bg-blue-600' : 'bg-slate-300 group-hover:bg-blue-400 transition-colors'
                }`}>
                  {chat.avatar}
                </div>
                {chat.unread > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full text-white text-[9px] font-bold flex items-center justify-center ring-2 ring-white">
                    {chat.unread}
                  </span>
                )}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-baseline mb-0.5">
                  <h4 className={`font-bold truncate text-sm ${activeChat === chat.id ? 'text-blue-900' : 'text-slate-700'}`}>
                    {chat.name}
                  </h4>
                  <span className="text-[10px] text-slate-400 font-medium">{chat.ultimaData}</span>
                </div>
                <div className="flex items-center gap-1 mt-1">
                   <Tag size={10} className="text-slate-400" />
                   <span className="text-[9px] text-slate-500 uppercase font-bold tracking-wider">{chat.tipo}</span>
                </div>
              </div>
            </button>
          ))}
          {filteredTickets.length === 0 && (
            <div className="text-center py-8 text-slate-400">
              <p className="text-xs font-bold uppercase tracking-widest">Nenhuma solicitação encontrada.</p>
            </div>
          )}
        </div>
      </div>

      {/* Área de Chat (Right Panel) */}
      {activeChat && currentChatData ? (
        <div className="flex-1 flex flex-col bg-white">
          {/* Topbar */}
          <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-white shadow-sm z-10">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center font-bold text-lg text-blue-600">
                {currentChatData.avatar}
              </div>
              <div>
                <h3 className="font-bold text-slate-800">{currentChatData.name} <span className="text-xs font-normal text-slate-400 ml-1">({currentChatData.curso})</span></h3>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider flex items-center gap-1">
                    <Tag size={10} /> {currentChatData.tipo}
                  </span>
                  <span className="w-1 h-1 bg-slate-300 rounded-full"></span>
                  <span className={`text-[10px] uppercase font-bold tracking-wider flex items-center gap-1 ${
                    currentChatData.status === 'pendente' ? 'text-amber-500' : 'text-emerald-500'
                  }`}>
                    {currentChatData.status === 'pendente' ? <Clock size={10} /> : <CheckCircle size={10} />}
                    {currentChatData.status}
                  </span>
                </div>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              {currentChatData.status === 'pendente' && (
                <button 
                  onClick={handleMarkAsSolved}
                  className="px-4 py-2 bg-emerald-50 text-emerald-600 rounded-lg text-xs font-bold uppercase tracking-widest hover:bg-emerald-100 transition-colors flex items-center gap-2"
                >
                  <CheckCircle size={14} /> Finalizar Atendimento
                </button>
              )}
              <button className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
                <MoreVertical size={20} />
              </button>
            </div>
          </div>

          {/* Messages Area */}
          <div className="flex-1 overflow-y-auto p-6 bg-slate-50 space-y-6">
            <div className="text-center text-xs text-slate-400 font-bold uppercase tracking-widest my-8">
              Ontem
            </div>
            
            {/* Mensagem do Aluno */}
            <div className="flex items-end gap-2">
              <div className="w-8 h-8 rounded-full bg-slate-200 flex-shrink-0 flex items-center justify-center text-xs font-bold text-slate-500">
                {currentChatData.avatar}
              </div>
              <div className="bg-white p-4 rounded-2xl rounded-bl-sm shadow-sm border border-slate-100 max-w-md relative group">
                <p className="text-[10px] font-bold text-blue-600 mb-1">{currentChatData.name}</p>
                <p className="text-sm text-slate-700 font-medium leading-relaxed">
                  Olá, boa tarde! Gostaria de saber como faço para alterar a data de vencimento do meu boleto deste mês. Recebi um pouco mais tarde.
                </p>
                <div className="flex items-center gap-1 mt-1 justify-end">
                   <span className="text-[10px] text-slate-400 font-bold">14:22</span>
                </div>
              </div>
            </div>

            <div className="text-center text-xs text-slate-400 font-bold uppercase tracking-widest my-8 relative">
              <span className="bg-slate-50 px-2 relative z-10">Hoje</span>
              <div className="absolute top-1/2 left-0 w-full border-t border-slate-200 -z-0"></div>
            </div>

            {/* Resposta do Gestor */}
            <div className="flex items-end justify-end gap-2">
              <div className="bg-[#001a33] text-white p-4 rounded-2xl rounded-br-sm shadow-sm max-w-md">
                <p className="text-sm font-medium leading-relaxed">
                  Boa tarde, {currentChatData.name.split(' ')[0]}! Tudo bem? Claro, podemos ajustar para você. Para qual data você gostaria de reagendar o vencimento?
                </p>
                <div className="flex items-center gap-1 mt-1 justify-end">
                   <span className="text-[10px] text-blue-200 font-bold">10:41</span>
                </div>
              </div>
            </div>
            
            {/* Nova Mensagem do Aluno */}
            <div className="flex items-end gap-2">
              <div className="w-8 h-8 rounded-full bg-slate-200 flex-shrink-0 flex items-center justify-center text-xs font-bold text-slate-500">
                {currentChatData.avatar}
              </div>
              <div className="bg-white p-4 rounded-2xl rounded-bl-sm shadow-sm border border-slate-100 max-w-md relative group">
                <p className="text-[10px] font-bold text-blue-600 mb-1">{currentChatData.name}</p>
                <p className="text-sm text-slate-700 font-medium leading-relaxed">
                  Pode ser para o dia 15?
                </p>
                <div className="flex items-center gap-1 mt-1 justify-end">
                   <span className="text-[10px] text-slate-400 font-bold">10:42</span>
                </div>
              </div>
            </div>
          </div>

          {/* Input Area */}
          <div className="p-4 bg-white border-t border-slate-200">
            {currentChatData.status === 'solucionada' ? (
              <div className="text-center py-3 bg-slate-50 rounded-xl border border-slate-200 text-slate-500 text-sm font-bold uppercase tracking-widest">
                Esta solicitação já foi finalizada.
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <button className="p-3 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-colors">
                  <Paperclip size={20} />
                </button>
                
                <div className="flex-1 bg-slate-100 rounded-xl overflow-hidden flex items-center px-4 py-2 border border-transparent focus-within:border-blue-500 focus-within:bg-white transition-all shadow-inner">
                  <input 
                    type="text" 
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                    placeholder="Escreva sua resposta..."
                    className="w-full bg-transparent border-none outline-none text-sm text-slate-700 py-1"
                  />
                </div>

                <button 
                  onClick={handleSendMessage}
                  disabled={!message.trim()}
                  className="p-3 bg-[#001a33] text-white rounded-xl hover:bg-blue-900 transition-colors shadow-lg shadow-blue-900/20 disabled:opacity-50 disabled:shadow-none"
                >
                  <Send size={20} />
                </button>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center bg-slate-50 px-8 text-center">
          <div className="w-20 h-20 bg-blue-50 rounded-full flex items-center justify-center text-blue-200 mb-6">
            <MessageSquare size={40} />
          </div>
          <h3 className="text-xl font-black text-[#001a33] tracking-tight mb-2">Atendimento ao Aluno</h3>
          <p className="text-slate-500 font-medium max-w-sm">
            Selecione uma solicitação ao lado para iniciar o atendimento. Use os filtros para categorizar os pedidos recebidos.
          </p>
        </div>
      )}
    </div>
  );
};

export default ComunicacaoPage;
