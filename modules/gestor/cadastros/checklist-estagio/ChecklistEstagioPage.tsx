// File: modules/gestor/cadastros/checklist-estagio/ChecklistEstagioPage.tsx

import React, { useState, useEffect } from 'react';
import { Save, FileText, ChevronRight, Layers, FileCheck, Plus, ClipboardCheck, Loader2, Trash2 } from 'lucide-react';
import { cadastrosService } from '../cadastros.service';
import { checklistEstagioService } from './checklist-estagio.service';
import { Curso } from '../cadastros.types';

// Valores Padrão para inicializar se não houver dados no Supabase
const DEFAULT_INSTRUMENTOS = [
  {
    grupo: 'Comportamento',
    valorMax: '2,0',
    itens: [
      'Assiduidade e Pontualidade', 'Aparência Pessoal', 'Iniciativa', 'Interesse', 
      'Responsabilidade', 'Sociabilidade', 'Espírito de Equipe', 'Equilíbrio Emocional', 
      'Ética Profissional', 'Aceitação ao Ensino'
    ]
  },
  {
    grupo: 'Desempenho nos Registros',
    valorMax: '2,0',
    itens: ['Registro de Prescrições', 'Registro de Enfermagem', 'Conhecimento Científico']
  },
  {
    grupo: 'Desempenho das Técnicas',
    valorMax: '6,0',
    itens: [
      'Destreza Manual', 'Eficiência', 'Manuseio de Material Estéril', 'Economia de Material', 
      'Organização e Limpeza', 'Associação Teoria e Prática', 'Técnicas', 'Cuidados de Enfermagem', 
      'Administração de Medicamentos', 'Passagem de Plantão'
    ]
  }
];

const DEFAULT_UCS = [
  {
    uc: 'Fundamentos de Enfermagem',
    atividades: [
      'Admissão', 'Alimentação do acamado', 'Alimentação por S.N.G ou S.N.E', 'Alta hospitalar', 
      'Anotação de Enfermagem', 'Arrumação do leito', 'Banho no leito', 'Cateterismo vesical',
      'Coleta de material para exame', 'Controle de gotejamento', 'Cuidado com o corpo pós morte',
      'Curativos', 'Encaminhamento', 'Hidratação da pele', 'Lavagem gástrica', 'Lavagem intestinal',
      'Medicação E.V', 'Medicação I.M', 'Medicação S.C', 'Medicação tópica', 'Medicação V.O',
      'Mudança de decúbito', 'Nebulização – NBZ', 'Ordem no Posto de Enfermagem', 'Oxigenoterapia',
      'Passagem de plantão', 'Punção venosa', 'Realização de glicemia capilar', 'Retirada de pontos',
      'S.N.G ou S.N.E', 'Transferência do cliente', 'Venóclise', 'Sinais vitais'
    ]
  },
  {
     uc: 'Enfermagem Médica',
     atividades: ['Sinais vitais', 'Evolução de enfermagem', 'Oxigenoterapia', 'Aspiração de vias aéreas']
  }
];

const ChecklistEstagioPage: React.FC = () => {
  const [cursos, setCursos] = useState<Curso[]>([]);
  const [selectedCursoId, setSelectedCursoId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'avaliativos' | 'unidades'>('avaliativos');
  
  const [loadingCursos, setLoadingCursos] = useState(true);
  const [loadingConfig, setLoadingConfig] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Estados da Configuração do Curso Selecionado
  const [instrumentos, setInstrumentos] = useState<any[]>([]);
  const [checklistUcs, setChecklistUcs] = useState<any[]>([]);
  
  // Estado para UCs selecionada no painel esquerdo
  const [selectedUcIndex, setSelectedUcIndex] = useState<number>(0);

  // Inputs temporários
  const [newUcName, setNewUcName] = useState('');
  const [newAtividadeName, setNewAtividadeName] = useState('');

  // Carrega cursos no Mount
  useEffect(() => {
    loadCursos();
  }, []);

  // Carrega configurações do checklist quando muda de curso
  useEffect(() => {
    if (selectedCursoId) {
      loadConfig(selectedCursoId);
    }
  }, [selectedCursoId]);

  const loadCursos = async () => {
    setLoadingCursos(true);
    try {
      const data = await cadastrosService.getCursosByModalidade('TECNICO');
      setCursos(data);
      if (data.length > 0) {
        setSelectedCursoId(data[0].id);
      }
    } catch (err) {
      console.error(err);
      alert('Erro ao carregar cursos técnicos.');
    } finally {
      setLoadingCursos(false);
    }
  };

  const loadConfig = async (cursoId: string) => {
    setLoadingConfig(true);
    try {
      const data = await checklistEstagioService.getByCursoId(cursoId);
      if (data) {
        setInstrumentos(data.instrumentos_avaliativos || []);
        setChecklistUcs(data.checklist_ucs || []);
      } else {
        // Inicializa com os templates padrão se não houver dados no banco
        setInstrumentos(JSON.parse(JSON.stringify(DEFAULT_INSTRUMENTOS)));
        setChecklistUcs(JSON.parse(JSON.stringify(DEFAULT_UCS)));
      }
      setSelectedUcIndex(0);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingConfig(false);
    }
  };

  // --- AÇÕES DO CHECKLIST UC ---
  const handleAddUc = () => {
    if (!newUcName.trim()) return;
    const newUc = { uc: newUcName, atividades: [] };
    setChecklistUcs([...checklistUcs, newUc]);
    setSelectedUcIndex(checklistUcs.length); // vai para a nova UC
    setNewUcName('');
  };

  const handleRemoveUc = (index: number) => {
    if (confirm('Tem certeza que deseja remover esta Unidade Curricular?')) {
      const updated = checklistUcs.filter((_, idx) => idx !== index);
      setChecklistUcs(updated);
      setSelectedUcIndex(0);
    }
  };

  const handleAddAtividade = () => {
    if (!newAtividadeName.trim() || selectedUcIndex === null) return;
    setChecklistUcs(prev => prev.map((item, idx) => {
      if (idx === selectedUcIndex) {
        return { ...item, atividades: [...item.atividades, newAtividadeName] };
      }
      return item;
    }));
    setNewAtividadeName('');
  };

  const handleRemoveAtividade = (atividadeIdx: number) => {
    setChecklistUcs(prev => prev.map((item, idx) => {
      if (idx === selectedUcIndex) {
        return {
          ...item,
          atividades: item.atividades.filter((_, aIdx) => aIdx !== atividadeIdx)
        };
      }
      return item;
    }));
  };

  const handleAtividadeChange = (value: string, atividadeIdx: number) => {
    setChecklistUcs(prev => prev.map((item, idx) => {
      if (idx === selectedUcIndex) {
        const updatedAtividades = [...item.atividades];
        updatedAtividades[atividadeIdx] = value;
        return { ...item, atividades: updatedAtividades };
      }
      return item;
    }));
  };

  // --- AÇÕES DOS CRITÉRIOS AVALIATIVOS ---
  const handleAddGrupo = () => {
    const grupo = prompt('Digite o nome do novo grupo de critérios:');
    if (!grupo) return;
    const valMax = prompt('Digite o valor máximo (ex: 2,0):', '2,0') || '2,0';
    setInstrumentos([...instrumentos, { grupo, valorMax: valMax, itens: [] }]);
  };

  const handleRemoveGrupo = (grupoIdx: number) => {
    if (confirm('Remover este grupo de avaliação?')) {
      setInstrumentos(instrumentos.filter((_, idx) => idx !== grupoIdx));
    }
  };

  const handleAddItemToGrupo = (grupoIdx: number) => {
    const item = prompt('Digite o nome do novo critério de avaliação:');
    if (!item) return;
    setInstrumentos(prev => prev.map((g, idx) => {
      if (idx === grupoIdx) {
        return { ...g, itens: [...g.itens, item] };
      }
      return g;
    }));
  };

  const handleRemoveItemFromGrupo = (grupoIdx: number, itemIdx: number) => {
    setInstrumentos(prev => prev.map((g, idx) => {
      if (idx === grupoIdx) {
        return { ...g, itens: g.itens.filter((_, iIdx) => iIdx !== itemIdx) };
      }
      return g;
    }));
  };

  const handleItemChange = (value: string, grupoIdx: number, itemIdx: number) => {
    setInstrumentos(prev => prev.map((g, idx) => {
      if (idx === grupoIdx) {
        const updatedItens = [...g.itens];
        updatedItens[itemIdx] = value;
        return { ...g, itens: updatedItens };
      }
      return g;
    }));
  };

  const handleValorMaxChange = (value: string, grupoIdx: number) => {
    setInstrumentos(prev => prev.map((g, idx) => {
      if (idx === grupoIdx) {
        return { ...g, valorMax: value };
      }
      return g;
    }));
  };

  // --- PERSISTÊNCIA ---
  const handleSave = async () => {
    if (!selectedCursoId) return;
    setIsSaving(true);
    try {
      await checklistEstagioService.saveConfig(selectedCursoId, instrumentos, checklistUcs);
      alert('Configurações de checklist de estágio salvas com sucesso no Supabase!');
    } catch (err) {
      console.error(err);
      alert('Erro ao salvar configurações no banco de dados.');
    } finally {
      setIsSaving(false);
    }
  };

  const selectedUc = checklistUcs[selectedUcIndex];

  return (
    <div className="bg-white p-6 md:p-8 rounded-[2rem] shadow-sm border border-slate-100 animate-fadeIn">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8 border-b border-slate-100 pb-6">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-teal-50 text-teal-600 rounded-2xl">
            <ClipboardCheck size={32} />
          </div>
          <div>
            <h3 className="text-2xl font-black text-[#001a33] uppercase tracking-tight">Check List de Estágio</h3>
            <p className="text-slate-500 font-medium">Configure instrumentos de avaliação e checklist por curso.</p>
          </div>
        </div>
        <button 
          onClick={handleSave}
          disabled={isSaving || loadingConfig || !selectedCursoId}
          className="px-6 py-3 bg-[#001a33] text-white rounded-xl font-bold uppercase text-xs tracking-wider flex items-center justify-center gap-2 hover:bg-blue-900 transition-colors disabled:opacity-75"
        >
          <Save size={16} /> {isSaving ? 'Salvando...' : 'Salvar Configurações'}
        </button>
      </div>

      {loadingCursos ? (
        <div className="flex justify-center items-center py-20">
          <Loader2 className="animate-spin text-teal-600" size={32} />
        </div>
      ) : cursos.length === 0 ? (
        <div className="text-center py-20 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
           <Layers className="text-slate-300 mx-auto mb-4" size={48} />
           <h4 className="font-bold text-slate-500">Nenhum Curso Técnico cadastrado</h4>
           <p className="text-sm text-slate-400 max-w-sm mx-auto mt-2">Cadastre primeiro um curso técnico no painel de cadastros para configurar seu checklist de estágio.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          {/* Menu Lateral de Cursos */}
          <div className="col-span-1 border-r border-slate-100 pr-4">
            <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4">Cursos Técnicos</h4>
            <div className="space-y-2 mb-6">
              {cursos.map(curso => (
                <button 
                  key={curso.id}
                  onClick={() => setSelectedCursoId(curso.id)}
                  className={`w-full text-left px-4 py-3 rounded-xl flex items-center justify-between transition-colors ${
                    selectedCursoId === curso.id 
                      ? 'bg-teal-50 border border-teal-100 text-teal-700 font-bold' 
                      : 'bg-white border border-transparent text-slate-600 hover:bg-slate-50 hover:border-slate-100 font-medium'
                  }`}
                >
                  <span className="text-sm">{curso.nome}</span>
                  {selectedCursoId === curso.id && <ChevronRight size={16} className="text-teal-400" />}
                </button>
              ))}
            </div>
          </div>

          {/* Configuração do Curso */}
          <div className="col-span-1 lg:col-span-3">
            {loadingConfig ? (
              <div className="flex justify-center items-center py-20">
                <Loader2 className="animate-spin text-teal-600" size={32} />
              </div>
            ) : selectedCursoId ? (
              <div className="space-y-6 animate-fadeIn">
                {/* Tabs */}
                <div className="flex overflow-x-auto hide-scrollbar gap-2 bg-slate-100 p-1.5 rounded-2xl border border-slate-200">
                  <button 
                    onClick={() => setActiveTab('avaliativos')}
                    className={`flex-1 min-w-[200px] flex items-center justify-center gap-2 py-3 px-6 rounded-xl text-sm font-bold uppercase tracking-wider transition-all ${
                      activeTab === 'avaliativos' ? 'bg-white text-teal-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    <FileText size={18} /> Instrumentos Avaliativos
                  </button>
                  <button 
                    onClick={() => setActiveTab('unidades')}
                    className={`flex-1 min-w-[200px] flex items-center justify-center gap-2 py-3 px-6 rounded-xl text-sm font-bold uppercase tracking-wider transition-all ${
                      activeTab === 'unidades' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    <FileCheck size={18} /> Check List por Unidade (UC)
                  </button>
                </div>

                {/* Tab Instrumentos Avaliativos */}
                {activeTab === 'avaliativos' && (
                  <div className="space-y-6">
                    <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-6">
                      <div className="flex items-center justify-between">
                        <h4 className="text-lg font-black text-[#001a33]">Critérios de Avaliação Gerais</h4>
                        <button 
                          onClick={handleAddGrupo}
                          className="text-xs font-bold text-teal-600 bg-teal-50 px-3 py-1.5 rounded-lg flex items-center gap-1 hover:bg-teal-100 transition-colors uppercase tracking-wider"
                        >
                          <Plus size={14} /> Novo Grupo
                        </button>
                      </div>

                      {instrumentos.map((grupo, gIdx) => (
                        <div key={gIdx} className="border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                          <div className="bg-slate-50 p-4 border-b border-slate-200 flex items-center justify-between">
                            <h5 className="font-bold text-slate-700 uppercase tracking-wide text-sm">{grupo.grupo}</h5>
                            <div className="flex items-center gap-4">
                              <div className="flex items-center gap-2 text-xs font-bold text-slate-500">
                                <span>VALOR MÁX:</span>
                                <input 
                                  type="text" 
                                  className="w-16 bg-white border border-slate-200 rounded p-1 text-center font-bold"
                                  value={grupo.valorMax}
                                  onChange={(e) => handleValorMaxChange(e.target.value, gIdx)}
                                />
                              </div>
                              <button 
                                onClick={() => handleRemoveGrupo(gIdx)}
                                className="text-slate-400 hover:text-red-500 p-1 rounded hover:bg-red-50 transition-colors"
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>
                          </div>
                          <div className="p-4 space-y-2">
                            {grupo.itens.map((item: string, iIdx: number) => (
                              <div key={iIdx} className="flex gap-4 items-center group">
                                <span className="text-xs font-mono text-slate-400 font-bold">{String(iIdx + 1).padStart(2, '0')}</span>
                                <input 
                                  type="text" 
                                  className="flex-1 bg-slate-50 border border-slate-200 rounded-lg p-2 text-sm text-slate-700 font-medium focus:bg-white focus:border-teal-500 outline-none" 
                                  value={item} 
                                  onChange={(e) => handleItemChange(e.target.value, gIdx, iIdx)}
                                />
                                <button 
                                  onClick={() => handleRemoveItemFromGrupo(gIdx, iIdx)}
                                  className="text-slate-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                                >
                                  <X size={16} />
                                </button>
                              </div>
                            ))}
                            <button 
                              onClick={() => handleAddItemToGrupo(gIdx)}
                              className="text-xs font-bold text-slate-500 hover:text-teal-600 flex items-center gap-1 mt-2 p-2 hover:bg-slate-50 rounded-lg"
                            >
                              <Plus size={14} /> Adicionar Item
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Tab Check List por Unidade */}
                {activeTab === 'unidades' && (
                  <div className="space-y-6">
                    <div className="flex flex-col sm:flex-row gap-6">
                      
                      {/* Sub-menu Lateral de UCs */}
                      <div className="w-full sm:w-1/3 space-y-2">
                        <h5 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3">Unidades Curriculares</h5>
                        <div className="space-y-1 max-h-[500px] overflow-y-auto pr-1 custom-scrollbar">
                          {checklistUcs.map((item, idx) => (
                            <div key={idx} className="flex items-center gap-1 group">
                              <button 
                                onClick={() => setSelectedUcIndex(idx)}
                                className={`flex-1 text-left p-3 rounded-xl border text-xs font-bold transition-colors ${
                                  idx === selectedUcIndex 
                                    ? 'bg-indigo-50 border-indigo-200 text-indigo-700' 
                                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                                }`}
                              >
                                {item.uc}
                              </button>
                              <button 
                                onClick={() => handleRemoveUc(idx)}
                                className="p-2 text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          ))}
                        </div>
                        
                        <div className="flex gap-1 mt-4">
                          <input 
                            type="text" 
                            placeholder="Nova UC..."
                            className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs outline-none focus:border-indigo-400"
                            value={newUcName}
                            onChange={(e) => setNewUcName(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleAddUc()}
                          />
                          <button 
                            onClick={handleAddUc}
                            className="p-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-colors"
                          >
                            <Plus size={16} />
                          </button>
                        </div>
                      </div>

                      {/* Atividades da UC selecionada */}
                      <div className="w-full sm:w-2/3 bg-white rounded-2xl border border-slate-200 p-6 shadow-sm flex flex-col h-[600px]">
                        {selectedUc ? (
                          <>
                            <div className="flex justify-between items-start mb-4 border-b border-slate-100 pb-4 shrink-0">
                              <div>
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Configurando Check List para:</p>
                                <h4 className="text-lg font-black text-[#001a33]">{selectedUc.uc}</h4>
                              </div>
                              <div className="px-3 py-1 bg-slate-100 text-slate-500 rounded-lg text-[10px] font-bold uppercase hidden sm:block">
                                A - Ajudou • E - Executou • O - Observou
                              </div>
                            </div>
                            
                            <div className="space-y-3 flex-1 overflow-y-auto pr-2 custom-scrollbar">
                              {selectedUc.atividades.map((atividade: string, i: number) => (
                                <div key={i} className="flex gap-4 items-center group">
                                  <span className="text-[10px] font-mono text-slate-400 font-bold">{String(i + 1).padStart(2, '0')}</span>
                                  <input 
                                    type="text" 
                                    className="flex-1 bg-white border border-slate-200 rounded-lg p-2.5 text-xs text-slate-700 font-bold focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 outline-none transition-all" 
                                    value={atividade} 
                                    onChange={(e) => handleAtividadeChange(e.target.value, i)}
                                  />
                                  <button 
                                    onClick={() => handleRemoveAtividade(i)}
                                    className="text-red-400 hover:text-red-600 p-1 opacity-0 group-hover:opacity-100" 
                                    title="Remover"
                                  >
                                    <X size={16} />
                                  </button>
                                </div>
                              ))}
                            </div>

                            <div className="mt-4 pt-4 border-t border-slate-100 flex gap-2 shrink-0">
                              <input 
                                type="text"
                                placeholder="Adicionar nova atividade à UC..."
                                className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs outline-none focus:border-indigo-400 focus:bg-white"
                                value={newAtividadeName}
                                onChange={(e) => setNewAtividadeName(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleAddAtividade()}
                              />
                              <button 
                                onClick={handleAddAtividade}
                                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold uppercase transition-colors"
                              >
                                Adicionar
                              </button>
                            </div>
                          </>
                        ) : (
                          <div className="flex-1 flex flex-col items-center justify-center text-center text-slate-400">
                            <Layers size={32} className="mb-2 text-slate-300" />
                            <p className="text-sm font-bold uppercase">Nenhuma Unidade Curricular selecionada</p>
                          </div>
                        )}
                      </div>

                    </div>
                  </div>
                )}
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
};

export default ChecklistEstagioPage;
