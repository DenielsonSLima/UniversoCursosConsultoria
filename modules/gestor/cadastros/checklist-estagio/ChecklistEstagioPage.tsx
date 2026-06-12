
import React, { useState } from 'react';
import { Save, FileText, ChevronRight, Layers, FileCheck, Plus, ClipboardCheck } from 'lucide-react';

const mockCursos = [
  { id: 1, nome: 'Técnico em Enfermagem' },
  { id: 2, nome: 'Técnico em Radiologia' },
  { id: 3, nome: 'Técnico em Segurança do Trabalho' }
];

const mockUnidadesCurriculares = [
  'Fundamentos de Enfermagem',
  'Enfermagem Médica',
  'Enfermagem em Saúde Coletiva',
  'Enfermagem em Saúde Mental',
  'Enfermagem em Urgência e Emergência',
  'Enfermagem Cirúrgica e em Centro Cirúrgico',
  'Enfermagem em Saúde da Mulher, Obstetrícia e Neonatologia',
  'Administração em Enfermagem',
  'Enfermagem em Saúde da Criança e do Adolescente'
];

const ChecklistEstagioPage: React.FC = () => {
  const [selectedCurso, setSelectedCurso] = useState<number | null>(mockCursos[0].id);
  const [activeTab, setActiveTab] = useState<'avaliativos' | 'unidades'>('avaliativos');

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
        <button className="px-6 py-3 bg-[#001a33] text-white rounded-xl font-bold uppercase text-xs tracking-wider flex items-center justify-center gap-2 hover:bg-blue-900 transition-colors">
          <Save size={16} /> Salvar Configurações
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
         <div className="col-span-1 border-r border-slate-100 pr-4">
            <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4">Cursos</h4>
            <div className="space-y-2 mb-6">
               {mockCursos.map(curso => (
                  <button 
                     key={curso.id}
                     onClick={() => setSelectedCurso(curso.id)}
                     className={`w-full text-left px-4 py-3 rounded-xl flex items-center justify-between transition-colors ${
                        selectedCurso === curso.id 
                           ? 'bg-teal-50 border border-teal-100 text-teal-700 font-bold' 
                           : 'bg-white border border-transparent text-slate-600 hover:bg-slate-50 hover:border-slate-100 font-medium'
                     }`}
                  >
                     <span className="text-sm">{curso.nome}</span>
                     {selectedCurso === curso.id && <ChevronRight size={16} className="text-teal-400" />}
                  </button>
               ))}
            </div>
         </div>

         <div className="col-span-1 lg:col-span-3">
            {selectedCurso ? (
               <div className="space-y-6 animate-fadeIn">
                  
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

                  {activeTab === 'avaliativos' && (
                     <div className="space-y-6">
                        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-6">
                           <div className="flex items-center justify-between">
                              <h4 className="text-lg font-black text-[#001a33]">Critérios de Avaliação Gerais</h4>
                              <button className="text-xs font-bold text-teal-600 bg-teal-50 px-3 py-1.5 rounded-lg flex items-center gap-1 hover:bg-teal-100 transition-colors uppercase tracking-wider">
                                 <Plus size={14} /> Novo Grupo
                              </button>
                           </div>
                           
                           {/* Exemplo Comportamento */}
                           <div className="border border-slate-200 rounded-xl overflow-hidden">
                              <div className="bg-slate-50 p-4 border-b border-slate-200 flex items-center justify-between">
                                 <h5 className="font-bold text-slate-700 uppercase tracking-wide text-sm">Comportamento</h5>
                                 <div className="flex items-center gap-2 text-xs font-bold text-slate-500">
                                    <span>VALOR MÁX:</span>
                                    <input type="text" className="w-16 bg-white border border-slate-200 rounded p-1 text-center" defaultValue="2,0" />
                                 </div>
                              </div>
                              <div className="p-4 space-y-2">
                                 {['Assiduidade e Pontualidade', 'Aparência Pessoal', 'Iniciativa', 'Interesse', 'Responsabilidade', 'Sociabilidade', 'Espírito de Equipe', 'Equilíbrio Emocional', 'Ética Profissional', 'Aceitação ao Ensino'].map((item, i) => (
                                    <div key={i} className="flex gap-4 items-center">
                                       <span className="text-xs font-mono text-slate-400 font-bold">{String(i + 1).padStart(2, '0')}</span>
                                       <input type="text" className="flex-1 bg-slate-50 border border-slate-200 rounded-lg p-2 text-sm text-slate-700 font-medium" defaultValue={item} />
                                    </div>
                                 ))}
                                 <button className="text-xs font-bold text-slate-500 hover:text-teal-600 flex items-center gap-1 mt-2 p-2">
                                    <Plus size={14} /> Adicionar Item
                                 </button>
                              </div>
                           </div>
                           
                           {/* Exemplo Desempenho nos Registros */}
                           <div className="border border-slate-200 rounded-xl overflow-hidden">
                              <div className="bg-slate-50 p-4 border-b border-slate-200 flex items-center justify-between">
                                 <h5 className="font-bold text-slate-700 uppercase tracking-wide text-sm">Desempenho nos Registros</h5>
                                 <div className="flex items-center gap-2 text-xs font-bold text-slate-500">
                                    <span>VALOR MÁX:</span>
                                    <input type="text" className="w-16 bg-white border border-slate-200 rounded p-1 text-center" defaultValue="2,0" />
                                 </div>
                              </div>
                              <div className="p-4 space-y-2">
                                 {['Registro de Prescrições', 'Registro de Enfermagem', 'Conhecimento Científico'].map((item, i) => (
                                    <div key={i} className="flex gap-4 items-center">
                                       <span className="text-xs font-mono text-slate-400 font-bold">{String(i + 1).padStart(2, '0')}</span>
                                       <input type="text" className="flex-1 bg-slate-50 border border-slate-200 rounded-lg p-2 text-sm text-slate-700 font-medium" defaultValue={item} />
                                    </div>
                                 ))}
                                 <button className="text-xs font-bold text-slate-500 hover:text-teal-600 flex items-center gap-1 mt-2 p-2">
                                    <Plus size={14} /> Adicionar Item
                                 </button>
                              </div>
                           </div>
                           
                           {/* Exemplo Desempenho das Técnicas */}
                           <div className="border border-slate-200 rounded-xl overflow-hidden">
                              <div className="bg-slate-50 p-4 border-b border-slate-200 flex items-center justify-between">
                                 <h5 className="font-bold text-slate-700 uppercase tracking-wide text-sm">Desempenho das Técnicas</h5>
                                 <div className="flex items-center gap-2 text-xs font-bold text-slate-500">
                                    <span>VALOR MÁX:</span>
                                    <input type="text" className="w-16 bg-white border border-slate-200 rounded p-1 text-center" defaultValue="6,0" />
                                 </div>
                              </div>
                              <div className="p-4 space-y-2">
                                 {['Destreza Manual', 'Eficiência', 'Manuseio de Material Estéril', 'Economia de Material', 'Organização e Limpeza', 'Associação Teoria e Prática', 'Técnicas', 'Cuidados de Enfermagem', 'Administração de Medicamentos', 'Passagem de Plantão'].map((item, i) => (
                                    <div key={i} className="flex gap-4 items-center">
                                       <span className="text-xs font-mono text-slate-400 font-bold">{String(i + 1).padStart(2, '0')}</span>
                                       <input type="text" className="flex-1 bg-slate-50 border border-slate-200 rounded-lg p-2 text-sm text-slate-700 font-medium" defaultValue={item} />
                                    </div>
                                 ))}
                                 <button className="text-xs font-bold text-slate-500 hover:text-teal-600 flex items-center gap-1 mt-2 p-2">
                                    <Plus size={14} /> Adicionar Item
                                 </button>
                              </div>
                           </div>

                        </div>
                     </div>
                  )}

                  {activeTab === 'unidades' && (
                     <div className="space-y-6">
                        <div className="flex flex-col sm:flex-row gap-6">
                           <div className="w-full sm:w-1/3 space-y-2">
                              <h5 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3">Unidades Curriculares</h5>
                              {mockUnidadesCurriculares.map((uc, idx) => (
                                 <button key={idx} className={`w-full text-left p-3 rounded-xl border border-slate-200 text-xs font-bold transition-colors ${idx === 0 ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'bg-white text-slate-600 hover:bg-slate-50'}`}>
                                    {uc}
                                 </button>
                              ))}
                              <button className="w-full text-center p-3 rounded-xl border border-dashed border-slate-300 text-xs font-bold text-slate-400 hover:text-indigo-600 hover:border-indigo-300 transition-colors flex items-center justify-center gap-2">
                                 <Plus size={14} /> Nova Especialidade
                              </button>
                           </div>

                           <div className="w-full sm:w-2/3 bg-white rounded-2xl border border-slate-200 p-6 shadow-sm flex flex-col h-[700px]">
                              <div className="flex justify-between items-start mb-4 border-b border-slate-100 pb-4 shrink-0">
                                 <div>
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Configurando Check List para:</p>
                                    <h4 className="text-lg font-black text-[#001a33]">Fundamentos de Enfermagem</h4>
                                 </div>
                                 <div className="px-3 py-1 bg-slate-100 text-slate-500 rounded-lg text-[10px] font-bold uppercase">
                                    A - Ajudou • E - Executou • O - Observou
                                 </div>
                              </div>
                              
                              <div className="space-y-3 flex-1 overflow-y-auto pr-2 custom-scrollbar">
                                 {[
                                    'Admissão', 'Alimentação do acamado', 'Alimentação por S.N.G ou S.N.E', 'Alta hospitalar', 
                                    'Anotação de Enfermagem', 'Arrumação do leito', 'Banho no leito', 'Cateterismo vesical',
                                    'Coleta de material para exame', 'Controle de gotejamento', 'Cuidado com o corpo pós morte',
                                    'Curativos', 'Encaminhamento', 'Hidratação da pele', 'Lavagem gástrica', 'Lavagem intestinal',
                                    'Medicação E.V', 'Medicação I.M', 'Medicação S.C', 'Medicação tópica', 'Medicação V.O',
                                    'Mudança de decúbito', 'Nebulização – NBZ', 'Ordem no Posto de Enfermagem', 'Oxigenoterapia',
                                    'Passagem de plantão', 'Punção venosa', 'Realização de glicemia capilar', 'Retirada de pontos',
                                    'S.N.G ou S.N.E', 'Transferência do cliente', 'Venóclise', 'Sinais vitais', 'Outros'
                                 ].map((atividade, i) => (
                                    <div key={i} className="flex gap-4 items-center">
                                       <span className="text-[10px] font-mono text-slate-400 font-bold">{String(i + 1).padStart(2, '0')}</span>
                                       <input type="text" className="flex-1 bg-white border border-slate-200 rounded-lg p-2.5 text-xs text-slate-700 font-bold focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 outline-none transition-all" defaultValue={atividade} />
                                       <button className="text-red-400 hover:text-red-600 p-1" title="Remover">
                                          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                                       </button>
                                    </div>
                                 ))}
                                 <button className="w-full mt-4 p-3 border border-dashed border-slate-300 rounded-xl text-center text-xs font-bold text-slate-500 hover:text-indigo-600 hover:bg-slate-50 transition-all">
                                    + Adicionar Atividade
                                 </button>
                              </div>
                           </div>
                        </div>
                     </div>
                  )}

               </div>
            ) : (
               <div className="flex flex-col items-center justify-center p-12 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-200 h-full min-h-[400px]">
                  <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center text-slate-300 mb-4 shadow-sm">
                     <Layers size={32} />
                  </div>
                  <h4 className="font-bold text-slate-500 mb-2">Selecione um curso ao lado</h4>
                  <p className="text-sm text-slate-400 max-w-sm">Escolha o curso para configurar seus formulários e critérios de avaliação de estágio.</p>
               </div>
            )}
         </div>
      </div>
    </div>
  );
};

export default ChecklistEstagioPage;
