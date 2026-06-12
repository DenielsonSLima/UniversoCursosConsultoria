
import React, { useState } from 'react';
import { Calendar, Save, Settings2, Image, FileText, ChevronRight, Layers, LayoutTemplate } from 'lucide-react';

const mockCursos = [
  { id: 1, nome: 'Técnico em Enfermagem' },
  { id: 2, nome: 'Técnico em Radiologia' },
  { id: 3, nome: 'Técnico em Segurança do Trabalho' }
];

const DiariosPage: React.FC = () => {
  const [selectedCurso, setSelectedCurso] = useState<number | null>(mockCursos[0].id);

  return (
    <div className="bg-white p-6 md:p-8 rounded-[2rem] shadow-sm border border-slate-100 animate-fadeIn">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8 border-b border-slate-100 pb-6">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-indigo-50 text-indigo-600 rounded-2xl">
            <Calendar size={32} />
          </div>
          <div>
            <h3 className="text-2xl font-black text-[#001a33] uppercase tracking-tight">Modelos de Diários</h3>
            <p className="text-slate-500 font-medium">Configure layouts e capas por curso.</p>
          </div>
        </div>
        <button className="px-6 py-3 bg-[#001a33] text-white rounded-xl font-bold uppercase text-xs tracking-wider flex items-center justify-center gap-2 hover:bg-blue-900 transition-colors">
          <Save size={16} /> Salvar Configurações
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
         <div className="col-span-1 border-r border-slate-100 pr-4">
            <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4">Cursos</h4>
            <div className="space-y-2">
               {mockCursos.map(curso => (
                  <button 
                     key={curso.id}
                     onClick={() => setSelectedCurso(curso.id)}
                     className={`w-full text-left px-4 py-3 rounded-xl flex items-center justify-between transition-colors ${
                        selectedCurso === curso.id 
                           ? 'bg-indigo-50 border border-indigo-100 text-indigo-700 font-bold' 
                           : 'bg-white border border-transparent text-slate-600 hover:bg-slate-50 hover:border-slate-100 font-medium'
                     }`}
                  >
                     <span className="text-sm">{curso.nome}</span>
                     {selectedCurso === curso.id && <ChevronRight size={16} className="text-indigo-400" />}
                  </button>
               ))}
            </div>
         </div>

         <div className="col-span-1 lg:col-span-3">
            {selectedCurso ? (
               <div className="space-y-8 animate-fadeIn">
                  
                  {/* Capa e Contra-capa */}
                  <div>
                     <div className="flex items-center gap-2 mb-4">
                        <Image className="text-slate-400" size={20} />
                        <h4 className="text-lg font-black text-[#001a33]">Capa e Contra-Capa</h4>
                     </div>
                     <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="bg-slate-50 rounded-2xl p-6 border border-slate-200 border-dashed text-center hover:bg-slate-100 transition-colors cursor-pointer group flex flex-col items-center justify-center min-h-[250px]">
                           <div className="w-16 h-16 bg-white rounded-2xl shadow-sm flex items-center justify-center text-slate-400 group-hover:text-indigo-500 mb-4 transition-colors">
                              <LayoutTemplate size={28} />
                           </div>
                           <p className="font-bold text-slate-700 mb-1">Capa Frontal</p>
                           <p className="text-xs text-slate-400">Clique para enviar a imagem da capa (A4)</p>
                        </div>
                        <div className="bg-slate-50 rounded-2xl p-6 border border-slate-200 border-dashed text-center hover:bg-slate-100 transition-colors cursor-pointer group flex flex-col items-center justify-center min-h-[250px]">
                           <div className="w-16 h-16 bg-white rounded-2xl shadow-sm flex items-center justify-center text-slate-400 group-hover:text-indigo-500 mb-4 transition-colors">
                              <LayoutTemplate size={28} />
                           </div>
                           <p className="font-bold text-slate-700 mb-1">Verso / Contra-Capa</p>
                           <p className="text-xs text-slate-400">Clique para enviar a imagem do verso (A4)</p>
                        </div>
                     </div>
                  </div>

                  {/* Configurações de Layout */}
                  <div>
                     <div className="flex items-center gap-2 mb-4">
                        <Settings2 className="text-slate-400" size={20} />
                        <h4 className="text-lg font-black text-[#001a33]">Configurações da Folha de Rosto</h4>
                     </div>
                     <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                           <div>
                              <label className="text-xs font-bold text-slate-500 uppercase tracking-widest block mb-2">Cabeçalho Personalizado</label>
                              <textarea 
                                 className="w-full bg-slate-50 border border-slate-200 rounded-xl p-4 text-sm font-medium text-slate-700 outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-50 min-h-[100px] resize-none"
                                 placeholder="Digite o texto padrão para o cabeçalho..."
                                 defaultValue="MINISTÉRIO DA EDUCAÇÃO&#10;SECRETARIA DE EDUCAÇÃO PROFISSIONAL E TECNOLÓGICA"
                              ></textarea>
                           </div>
                           <div>
                              <label className="text-xs font-bold text-slate-500 uppercase tracking-widest block mb-2">Rodapé Opcional</label>
                              <textarea 
                                 className="w-full bg-slate-50 border border-slate-200 rounded-xl p-4 text-sm font-medium text-slate-700 outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-50 min-h-[100px] resize-none"
                                 placeholder="Texto exibido no final de cada folha..."
                                 defaultValue="Documento Oficial - Diário de Classe Emitido Eletronicamente"
                              ></textarea>
                           </div>
                        </div>

                        <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
                           <div>
                              <p className="font-bold text-slate-700">Imprimir Instruções Normativas</p>
                              <p className="text-xs text-slate-500">Incluir as instruções de preenchimento na contracapa.</p>
                           </div>
                           <label className="relative inline-flex items-center cursor-pointer">
                              <input type="checkbox" className="sr-only peer" defaultChecked />
                              <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                           </label>
                        </div>
                     </div>
                  </div>

               </div>
            ) : (
               <div className="flex flex-col items-center justify-center p-12 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-200 h-full min-h-[400px]">
                  <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center text-slate-300 mb-4 shadow-sm">
                     <Layers size={32} />
                  </div>
                  <h4 className="font-bold text-slate-500 mb-2">Selecione um curso alado</h4>
                  <p className="text-sm text-slate-400 max-w-sm">Escolha o curso na lista ao lado para configurar as capas e personalizações do diário de classe exclusivo dele.</p>
               </div>
            )}
         </div>
      </div>
    </div>
  );
};

export default DiariosPage;
