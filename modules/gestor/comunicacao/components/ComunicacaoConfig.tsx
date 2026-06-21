import React, { useState, useEffect } from 'react';
import { Trash2, Plus, Save, Smartphone, User, Play, Sparkles, Send, MessageSquare } from 'lucide-react';
import { supabase } from '../../../../lib/supabase';
import ToastNotification, { useToast } from '../../components/ToastNotification';

interface Category {
  id: string;
  nome: string;
  descricao: string;
  cor: string;
  ativo: boolean;
}

interface Config {
  id: string;
  mensagem_boas_vindas: string;
  whatsapp_conectado: boolean;
  whatsapp_numero: string | null;
}

interface Partner {
  id: string;
  nome: string;
  tipo: 'Aluno' | 'Professor';
}

const PRESET_COLORS = [
  '#7c3aed', // Purple
  '#059669', // Emerald
  '#d97706', // Amber
  '#dc2626', // Red
  '#2563eb', // Blue
  '#db2777', // Pink
  '#0891b2', // Cyan
  '#475569', // Slate
];

const ComunicacaoConfig: React.FC = () => {
  const { toasts, removeToast, toast } = useToast();
  const [activeSubTab, setActiveSubTab] = useState<'welcome' | 'categories' | 'simulator'>('welcome');
  
  // Data States
  const [categories, setCategories] = useState<Category[]>([]);
  const [config, setConfig] = useState<Config | null>(null);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // New Category Form State
  const [newCat, setNewCat] = useState({ nome: '', descricao: '', cor: PRESET_COLORS[0] });

  // Welcome Message Editor State
  const [welcomeText, setWelcomeText] = useState('');

  // Simulator State
  const [simStep, setSimStep] = useState<1 | 2 | 3>(1);
  const [selectedPartnerId, setSelectedPartnerId] = useState('');
  const [simChatId, setSimChatId] = useState<string | null>(null);
  const [simMessages, setSimMessages] = useState<any[]>([]);
  const [simInput, setSimInput] = useState('');

  useEffect(() => {
    loadConfigData();
  }, []);

  const loadConfigData = async () => {
    setLoading(true);
    try {
      // 1. Fetch Config
      const { data: configData } = await supabase
        .from('comunicacao_config')
        .select('*')
        .limit(1)
        .single();
      
      if (configData) {
        setConfig(configData);
        setWelcomeText(configData.mensagem_boas_vindas);
      }

      // 2. Fetch Categories
      const { data: catData } = await supabase
        .from('comunicacao_categorias')
        .select('*')
        .order('nome', { ascending: true });
      
      setCategories(catData || []);

      // 3. Fetch Partners (Students and Teachers) for Simulator
      const { data: partnerData } = await supabase
        .from('parceiros')
        .select('id, nome, tipo')
        .eq('status', 'ATIVO')
        .order('nome', { ascending: true });
      
      setPartners(partnerData || []);
      if (partnerData && partnerData.length > 0) {
        setSelectedPartnerId(partnerData[0].id);
      }
    } catch (err) {
      console.error('Erro ao carregar configurações de comunicação:', err);
    } finally {
      setLoading(false);
    }
  };

  // --- Actions: Welcome Message ---
  const handleSaveWelcomeMessage = async () => {
    if (!config) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from('comunicacao_config')
        .update({ mensagem_boas_vindas: welcomeText, updated_at: new Date().toISOString() })
        .eq('id', config.id);

      if (error) throw error;
      
      setConfig({ ...config, mensagem_boas_vindas: welcomeText });
      toast.success('Configuração salva', 'Mensagem de boas-vindas salva com sucesso!');
    } catch (err) {
      console.error('Erro ao salvar mensagem de boas-vindas:', err);
      toast.error('Erro ao salvar', 'Não foi possível salvar a configuração.');
    } finally {
      setSaving(false);
    }
  };

  // --- Actions: Categories CRUD ---
  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCat.nome.trim()) return;

    try {
      const { data, error } = await supabase
        .from('comunicacao_categorias')
        .insert({
          nome: newCat.nome,
          descricao: newCat.descricao,
          cor: newCat.cor,
          ativo: true
        })
        .select()
        .single();

      if (error) throw error;

      setCategories([...categories, data]);
      setNewCat({ nome: '', descricao: '', cor: PRESET_COLORS[0] });
      toast.success('Categoria adicionada', `Setor "${data.nome}" criado com sucesso.`);
    } catch (err) {
      console.error('Erro ao adicionar categoria:', err);
      toast.error('Erro ao criar', 'Não foi possível adicionar a categoria.');
    }
  };

  const handleDeleteCategory = async (id: string) => {
    if (!confirm('Deseja realmente excluir esta categoria? Os atendimentos vinculados a ela ficarão como "Geral".')) return;

    try {
      const { error } = await supabase
        .from('comunicacao_categorias')
        .delete()
        .eq('id', id);

      if (error) throw error;

      setCategories(categories.filter(c => c.id !== id));
      toast.success('Categoria excluída', 'Setor removido com sucesso.');
    } catch (err) {
      console.error('Erro ao deletar categoria:', err);
      toast.error('Erro ao excluir', 'Não foi possível excluir a categoria.');
    }
  };

  // --- Actions: Chatbot Simulator ---
  const startSimulation = () => {
    const selectedPartner = partners.find(p => p.id === selectedPartnerId);
    if (!selectedPartner) {
      toast.error('Erro de simulação', 'Por favor, cadastre ou ative um parceiro (aluno/professor) para simular.');
      return;
    }
    
    // Reset simulator chat state
    setSimChatId(null);
    setSimMessages([
      {
        id: 'welcome-msg',
        remetente_nome: 'Atendente Virtual',
        remetente_tipo: 'sistema',
        conteudo: config?.mensagem_boas_vindas || 'Olá! Escolha uma categoria para iniciar:',
        created_at: new Date().toISOString()
      }
    ]);
    setSimStep(2);
  };

  const handleSelectCategorySim = async (category: Category) => {
    const selectedPartner = partners.find(p => p.id === selectedPartnerId);
    if (!selectedPartner) return;

    try {
      // 1. Create a real conversation/chat ticket in Supabase
      const { data: chat, error: chatErr } = await supabase
        .from('comunicacao_chats')
        .insert({
          remetente_id: selectedPartner.id,
          remetente_nome: selectedPartner.nome,
          remetente_tipo: selectedPartner.tipo,
          categoria_id: category.id,
          status: 'pendente',
          ultimo_texto: `Categoria selecionada: ${category.nome}`,
          ultima_data: new Date().toISOString()
        })
        .select()
        .single();

      if (chatErr) throw chatErr;

      setSimChatId(chat.id);

      // 2. Insert standard welcome log messages into the chat database
      const { error: msgErr1 } = await supabase
        .from('comunicacao_mensagens')
        .insert({
          chat_id: chat.id,
          remetente_nome: 'Atendente Virtual',
          remetente_tipo: 'sistema',
          conteudo: config?.mensagem_boas_vindas || 'Olá! Escolha uma categoria:'
        });

      if (msgErr1) throw msgErr1;

      const { error: msgErr2 } = await supabase
        .from('comunicacao_mensagens')
        .insert({
          chat_id: chat.id,
          remetente_id: selectedPartner.id,
          remetente_nome: selectedPartner.nome,
          remetente_tipo: selectedPartner.tipo === 'Aluno' ? 'aluno' : 'professor',
          conteudo: `[GATILHO AUTO-DIRECIONAMENTO] Selecionou a Categoria: ${category.nome}`
        });

      if (msgErr2) throw msgErr2;

      // Update local simulator messages
      setSimMessages(prev => [
        ...prev,
        {
          id: 'trigger-msg',
          remetente_nome: selectedPartner.nome,
          remetente_tipo: 'aluno',
          conteudo: `Opção Escolhida: ${category.nome}`,
          created_at: new Date().toISOString()
        },
        {
          id: 'bot-reply',
          remetente_nome: 'Atendente Virtual',
          remetente_tipo: 'sistema',
          conteudo: `Entendido! Seu atendimento foi direcionado para o setor "${category.nome}". Um gestor da escola foi notificado e responderá aqui em breve. Pode enviar sua dúvida ou mensagem abaixo:`,
          created_at: new Date().toISOString()
        }
      ]);

      setSimStep(3);
    } catch (err) {
      console.error('Erro ao inicializar chat no simulador:', err);
      toast.error('Erro no simulador', 'Erro ao inicializar o chat do simulador no banco.');
    }
  };

  const handleSendSimMessage = async () => {
    if (!simInput.trim() || !simChatId) return;
    const selectedPartner = partners.find(p => p.id === selectedPartnerId);
    if (!selectedPartner) return;

    const textToSend = simInput;
    setSimInput('');

    try {
      const typeStr = selectedPartner.tipo === 'Aluno' ? 'aluno' : 'professor';

      // Insert message in Supabase
      const { data: newMsg, error } = await supabase
        .from('comunicacao_mensagens')
        .insert({
          chat_id: simChatId,
          remetente_id: selectedPartner.id,
          remetente_nome: selectedPartner.nome,
          remetente_tipo: typeStr,
          conteudo: textToSend
        })
        .select()
        .single();

      if (error) throw error;

      // Update chat's last message text and date
      await supabase
        .from('comunicacao_chats')
        .update({
          ultimo_texto: textToSend,
          ultima_data: new Date().toISOString()
        })
        .eq('id', simChatId);

      // Add to local message list
      setSimMessages(prev => [
        ...prev,
        {
          id: newMsg.id,
          remetente_nome: selectedPartner.nome,
          remetente_tipo: typeStr,
          conteudo: textToSend,
          created_at: new Date().toISOString()
        }
      ]);
    } catch (err) {
      console.error('Erro ao enviar mensagem no simulador:', err);
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex justify-center items-center py-20">
        <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="flex-1 bg-white p-6 flex flex-col h-full overflow-hidden">
      <ToastNotification toasts={toasts} onRemove={removeToast} />
      
      {/* Sub-Tabs de Configurações */}
      <div className="flex gap-1 bg-slate-100 p-1 rounded-xl self-start mb-6 shrink-0">
        <button
          onClick={() => setActiveSubTab('welcome')}
          className={`px-4 py-2 text-xs font-bold uppercase tracking-widest rounded-lg transition-all ${
            activeSubTab === 'welcome' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-blue-600'
          }`}
        >
          Mensagem de Boas-Vindas
        </button>
        <button
          onClick={() => setActiveSubTab('categories')}
          className={`px-4 py-2 text-xs font-bold uppercase tracking-widest rounded-lg transition-all ${
            activeSubTab === 'categories' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-blue-600'
          }`}
        >
          Categorias/Setores
        </button>
        <button
          onClick={() => setActiveSubTab('simulator')}
          className={`px-4 py-2 text-xs font-bold uppercase tracking-widest rounded-lg transition-all ${
            activeSubTab === 'simulator' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-blue-600'
          }`}
        >
          Simulador Chatbot
        </button>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 min-h-0">
        
        {/* SUBTAB: MENSAGEM DE BOAS-VINDAS */}
        {activeSubTab === 'welcome' && (
          <div className="max-w-2xl bg-slate-50/50 border border-slate-100 rounded-3xl p-6 shadow-sm">
            <h3 className="text-lg font-black text-[#001a33] uppercase tracking-tight mb-2">Mensagem de Boas-vindas</h3>
            <p className="text-xs text-slate-500 font-medium mb-6">
              Esta é a mensagem inicial exibida pelo atendente virtual (chatbot) assim que o aluno ou professor inicia um atendimento. Ela serve para instruí-lo a selecionar uma categoria de assunto.
            </p>

            <div className="space-y-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Conteúdo da Mensagem</label>
                <textarea
                  value={welcomeText}
                  onChange={(e) => setWelcomeText(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-2xl p-4 text-sm text-slate-700 font-medium outline-none focus:border-blue-500 resize-none h-32 focus:shadow-sm transition-all"
                  placeholder="Escreva a mensagem que o aluno receberá ao iniciar o atendimento..."
                />
              </div>

              <button
                onClick={handleSaveWelcomeMessage}
                disabled={saving || !welcomeText.trim()}
                className="flex items-center gap-2 px-5 py-3 bg-[#001a33] hover:bg-blue-900 text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-colors shadow-lg disabled:opacity-50"
              >
                <Save size={14} /> {saving ? 'Salvando...' : 'Salvar Alteração'}
              </button>
            </div>
          </div>
        )}

        {/* SUBTAB: CATEGORIAS (CRUD) */}
        {activeSubTab === 'categories' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            {/* Lista de Categorias */}
            <div className="lg:col-span-7 space-y-4">
              <h3 className="text-lg font-black text-[#001a33] uppercase tracking-tight">Categorias de Atendimento</h3>
              <p className="text-xs text-slate-500 font-medium mb-4">
                Configure os setores disponíveis para direcionamento automático de chamados.
              </p>

              <div className="space-y-3">
                {categories.map((cat) => (
                  <div key={cat.id} className="flex justify-between items-center p-4 bg-slate-50 border border-slate-100 rounded-2xl hover:shadow-sm transition-all">
                    <div className="flex items-center gap-3">
                      <div className="w-3.5 h-3.5 rounded-full shrink-0 shadow-sm" style={{ backgroundColor: cat.cor }}></div>
                      <div>
                        <h4 className="text-sm font-bold text-slate-800">{cat.nome}</h4>
                        <p className="text-xs text-slate-400 font-medium mt-0.5">{cat.descricao || 'Sem descrição'}</p>
                      </div>
                    </div>
                    <button
                      onClick={() => handleDeleteCategory(cat.id)}
                      className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
                {categories.length === 0 && (
                  <div className="text-center py-8 text-slate-400 text-sm bg-slate-50 border border-dashed border-slate-200 rounded-2xl">
                    Nenhuma categoria cadastrada.
                  </div>
                )}
              </div>
            </div>

            {/* Criar Categoria Form */}
            <div className="lg:col-span-5 bg-slate-50 border border-slate-200 rounded-3xl p-5 shadow-inner">
              <h3 className="text-sm font-black text-[#001a33] uppercase tracking-wider mb-4">Nova Categoria</h3>
              <form onSubmit={handleAddCategory} className="space-y-4">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Nome do Setor</label>
                  <input
                    type="text"
                    required
                    value={newCat.nome}
                    onChange={(e) => setNewCat({ ...newCat, nome: e.target.value })}
                    placeholder="Ex: Financeiro, Pedagógico"
                    className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2 text-sm font-bold text-slate-700 outline-none focus:border-blue-500"
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Descrição</label>
                  <textarea
                    value={newCat.descricao}
                    onChange={(e) => setNewCat({ ...newCat, descricao: e.target.value })}
                    placeholder="Descrição breve sobre as solicitações deste setor..."
                    className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2 text-xs text-slate-600 outline-none focus:border-blue-500 resize-none h-16"
                  />
                </div>

                {/* Seleção de Cor Preset */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Cor Identificadora</label>
                  <div className="flex flex-wrap gap-2">
                    {PRESET_COLORS.map(color => (
                      <button
                        key={color}
                        type="button"
                        onClick={() => setNewCat({ ...newCat, cor: color })}
                        className={`w-6 h-6 rounded-full border transition-all ${
                          newCat.cor === color ? 'border-slate-800 scale-110 shadow-md ring-2 ring-white' : 'border-transparent hover:scale-105'
                        }`}
                        style={{ backgroundColor: color }}
                      />
                    ))}
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={!newCat.nome.trim()}
                  className="w-full py-3 bg-[#001a33] hover:bg-blue-900 text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-colors shadow-lg flex items-center justify-center gap-2"
                >
                  <Plus size={14} /> Adicionar Categoria
                </button>
              </form>
            </div>
          </div>
        )}

        {/* SUBTAB: SIMULADOR DE CHATBOT */}
        {activeSubTab === 'simulator' && (
          <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-start">
            
            {/* Esquerda: Instruções do Simulador */}
            <div className="md:col-span-6 space-y-4">
              <h3 className="text-lg font-black text-[#001a33] uppercase tracking-tight flex items-center gap-2">
                <Smartphone size={20} className="text-blue-600 animate-bounce" /> Simulador de URA / Atendimento
              </h3>
              <p className="text-xs text-slate-500 font-medium leading-relaxed">
                Use este simulador para testar o direcionamento automático (chatbot). 
                Ao escolher um aluno ou professor e selecionar a categoria, o sistema cria um ticket real de atendimento no Supabase.
              </p>
              
              <div className="p-4 bg-blue-50 border border-blue-100 rounded-2xl space-y-3">
                <h4 className="text-xs font-black text-blue-800 uppercase tracking-wider flex items-center gap-1.5">
                  <Sparkles size={12} /> Como funciona?
                </h4>
                <ol className="list-decimal list-inside text-[11px] text-blue-700 font-medium space-y-1.5">
                  <li>Escolha o Aluno ou Professor que está simulando o acesso.</li>
                  <li>Clique em "Iniciar Fluxo" para abrir a tela simulada de chat.</li>
                  <li>Selecione o setor de atendimento na tela simulada.</li>
                  <li>Envie mensagens de teste para ver o funcionamento.</li>
                  <li>Mude para a aba de "Atendimentos" no painel principal e responda em tempo real.</li>
                </ol>
              </div>

              {simStep === 1 && (
                <div className="space-y-4 p-5 bg-slate-50 border border-slate-200 rounded-3xl">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-bold text-slate-400 uppercase ml-1 flex items-center gap-1">
                      <User size={10} /> Personagem da Simulação
                    </label>
                    <select
                      value={selectedPartnerId}
                      onChange={(e) => setSelectedPartnerId(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs font-bold text-slate-700 outline-none focus:border-blue-500 cursor-pointer"
                    >
                      {partners.map(p => (
                        <option key={p.id} value={p.id}>{p.nome} ({p.tipo})</option>
                      ))}
                      {partners.length === 0 && (
                        <option value="">Nenhum parceiro cadastrado</option>
                      )}
                    </select>
                  </div>

                  <button
                    onClick={startSimulation}
                    disabled={partners.length === 0}
                    className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-all shadow-lg shadow-blue-500/10 flex items-center justify-center gap-2"
                  >
                    <Play size={14} fill="white" /> Iniciar Fluxo de Atendimento
                  </button>
                </div>
              )}

              {simStep > 1 && (
                <button
                  onClick={() => setSimStep(1)}
                  className="px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-500 hover:text-slate-800 rounded-xl text-xs font-bold uppercase tracking-widest transition-colors shadow-sm"
                >
                  Voltar e Trocar Usuário
                </button>
              )}
            </div>

            {/* Direita: Celular Simulado */}
            <div className="md:col-span-6 flex justify-center">
              <div className="w-[310px] h-[550px] bg-slate-900 rounded-[2.5rem] border-8 border-slate-800 shadow-2xl overflow-hidden flex flex-col relative ring-4 ring-slate-950/5">
                
                {/* Entalhe do Celular (Notch) */}
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-28 h-4 bg-slate-800 rounded-b-xl z-20"></div>

                {/* Tela do Celular */}
                <div className="flex-1 bg-[#f4f7f6] pt-5 flex flex-col h-full overflow-hidden text-slate-800">
                  
                  {/* Celular Header */}
                  <div className="bg-white border-b border-slate-200 py-3 px-4 flex items-center justify-between shadow-sm shrink-0">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></div>
                      <span className="text-[10px] font-black text-slate-800 uppercase tracking-wider">Atendente Universo</span>
                    </div>
                    <span className="text-[9px] font-medium text-slate-400">Online</span>
                  </div>

                  {/* Celular Chat Area */}
                  {simStep === 1 ? (
                    <div className="flex-1 flex flex-col items-center justify-center p-6 text-center text-slate-400 bg-white">
                      <Smartphone size={32} className="text-slate-300 mb-3" />
                      <p className="text-xs font-bold uppercase tracking-widest">Aguardando início</p>
                      <p className="text-[10px] text-slate-400 mt-1">Configure o personagem na esquerda e clique em Iniciar.</p>
                    </div>
                  ) : (
                    <div className="flex-1 overflow-y-auto p-3 space-y-3 custom-scrollbar flex flex-col">
                      {simMessages.map((msg, index) => {
                        const isSelf = msg.remetente_tipo !== 'sistema';
                        return (
                          <div
                            key={msg.id || index}
                            className={`flex flex-col max-w-[85%] ${
                              isSelf ? 'align-self-end items-end self-end' : 'align-self-start items-start self-start'
                            }`}
                          >
                            <span className="text-[8px] font-bold text-slate-400 mb-0.5 ml-1 px-1">{msg.remetente_nome}</span>
                            <div
                              className={`p-2.5 rounded-xl text-[11px] leading-snug shadow-sm ${
                                isSelf
                                  ? 'bg-blue-600 text-white rounded-br-sm'
                                  : 'bg-white text-slate-700 border border-slate-200 rounded-bl-sm'
                              }`}
                            >
                              {msg.conteudo}
                            </div>
                          </div>
                        );
                      })}

                      {/* Simulador Passo 2: Botões das Categorias */}
                      {simStep === 2 && (
                        <div className="bg-white border border-slate-200 rounded-2xl p-3 space-y-2 mt-2 shadow-sm animate-fadeIn">
                          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest text-center border-b pb-1">
                            Setores de Atendimento
                          </p>
                          <div className="grid grid-cols-2 gap-1.5 pt-1">
                            {categories.map((cat) => (
                              <button
                                key={cat.id}
                                onClick={() => handleSelectCategorySim(cat)}
                                className="py-2 px-2 bg-slate-50 hover:bg-blue-50 border border-slate-100 hover:border-blue-200 text-[#001a33] rounded-lg text-[10px] font-bold uppercase truncate transition-all text-center"
                              >
                                {cat.nome}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Celular Input Area (Apenas no Passo 3) */}
                  <div className="p-2 border-t border-slate-200 bg-white shrink-0">
                    {simStep === 3 ? (
                      <div className="flex gap-1.5 items-center">
                        <input
                          type="text"
                          value={simInput}
                          onChange={(e) => setSimInput(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && handleSendSimMessage()}
                          placeholder="Digite sua dúvida..."
                          className="flex-1 bg-slate-50 border border-slate-250 rounded-lg py-1 px-2.5 text-xs text-slate-700 outline-none focus:border-blue-500 focus:bg-white transition-all font-medium"
                        />
                        <button
                          onClick={handleSendSimMessage}
                          disabled={!simInput.trim()}
                          className="p-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50"
                        >
                          <Send size={12} />
                        </button>
                      </div>
                    ) : (
                      <div className="text-center py-2 text-[9px] font-black text-slate-400 uppercase tracking-widest bg-slate-50 rounded-lg">
                        Chatbot Direcionando...
                      </div>
                    )}
                  </div>

                </div>
              </div>
            </div>

          </div>
        )}

      </div>

    </div>
  );
};

export default ComunicacaoConfig;
