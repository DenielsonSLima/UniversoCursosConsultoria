import React, { useState } from 'react';
import { ArrowLeft, Save, Printer, Calendar, BookOpen, Calculator, CheckCircle2 } from 'lucide-react';

interface DiarioClasseProps {
  disciplina: any;
  moduloNome: string;
  onBack: () => void;
}

const MOCK_ALUNOS = [
  { id: 1, nome: 'Alice Santos Bispo', faltas: [false, false, false], notas: { p: 8.5, ti: 9.0, tg: 8.0, s: 8.5, cq: 1.0, o: 0 }, mediaParcial: 8.5, rec: null, mediaFinal: 8.5, frequencia: 100, resultado: 'APROVADO' },
  { id: 2, nome: 'Adriany Victoria Dos Santos Silva', faltas: [true, false, false], notas: { p: 7.0, ti: 8.0, tg: 7.5, s: 7.0, cq: 1.0, o: 0 }, mediaParcial: 7.5, rec: null, mediaFinal: 7.5, frequencia: 90, resultado: 'APROVADO' },
  { id: 3, nome: 'Arianna Victória Vieira Fortaleza', faltas: [false, false, false], notas: { p: 9.0, ti: 9.5, tg: 9.0, s: 9.0, cq: 1.0, o: 0 }, mediaParcial: 9.2, rec: null, mediaFinal: 9.2, frequencia: 100, resultado: 'APROVADO' },
  { id: 4, nome: 'Caroline Da Silva Santos', faltas: [false, true, true], notas: { p: 4.0, ti: 5.0, tg: 5.5, s: 5.0, cq: 0.5, o: 0 }, mediaParcial: 4.5, rec: 6.5, mediaFinal: 6.5, frequencia: 70, resultado: 'APROVADO' },
  { id: 5, nome: 'Camyle Sales Puça', faltas: [false, false, false], notas: { p: 8.0, ti: 8.5, tg: 8.0, s: 8.5, cq: 1.0, o: 0 }, mediaParcial: 8.3, rec: null, mediaFinal: 8.3, frequencia: 100, resultado: 'APROVADO' },
];

const MOCK_AULAS_DATAS = ['01/03', '08/03', '15/03'];

const MOCK_CONTEUDO = [
  { data: '01/03', conteudo: 'Introdução à Anatomia', pratica: 'Demonstração em modelos' },
  { data: '08/03', conteudo: 'Sistema Ósseo', pratica: 'Aula prática no laboratório' },
  { data: '15/03', conteudo: 'Sistema Muscular', pratica: 'Identificação de grupos musculares' },
];

const DiarioClasse: React.FC<DiarioClasseProps> = ({ disciplina, moduloNome, onBack }) => {
  const [activeTab, setActiveTab] = useState<'frequencia' | 'resultado' | 'conteudo'>('frequencia');

  return (
    <div className="animate-fadeIn max-w-[1400px] mx-auto">
      {/* Header Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-4">
          <button 
            onClick={onBack}
            className="w-10 h-10 flex items-center justify-center rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50 transition-colors bg-white shrink-0"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <h3 className="text-2xl font-black text-[#001a33] uppercase tracking-tight">Diário de Classe</h3>
            <p className="text-sm font-bold text-slate-500">{disciplina.nome} • {moduloNome}</p>
          </div>
        </div>
        <div className="flex gap-2">
           <button className="px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded-xl text-xs font-bold uppercase tracking-wider hover:bg-slate-50 flex items-center gap-2">
             <Printer size={16} /> Imprimir Diário
           </button>
           <button className="px-4 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold uppercase tracking-wider hover:bg-blue-700 flex items-center gap-2">
             <Save size={16} /> Salvar Alterações
           </button>
        </div>
      </div>

      {/* Diary Header Info */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 mb-6 shadow-sm">
         <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div>
               <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-1">Curso</p>
               <p className="font-bold text-slate-700">Técnico em Enfermagem</p>
            </div>
            <div>
               <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-1">Módulo / Área Temática</p>
               <p className="font-bold text-slate-700">{moduloNome}</p>
            </div>
            <div>
               <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-1">Unidade Educacional (Disciplina)</p>
               <p className="font-bold text-slate-700">{disciplina.nome}</p>
            </div>
            <div>
               <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-1">Professor(a)</p>
               <p className="font-bold text-slate-700">{disciplina.professor}</p>
            </div>
         </div>
      </div>

      {/* Tabs */}
      <div className="flex overflow-x-auto hide-scrollbar gap-2 mb-6 bg-slate-200/50 p-1.5 rounded-2xl border border-slate-100">
         <button 
            onClick={() => setActiveTab('frequencia')}
            className={`flex-1 min-w-[200px] flex items-center justify-center gap-2 py-3 px-6 rounded-xl text-sm font-bold uppercase tracking-wider transition-all ${
               activeTab === 'frequencia' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
         >
            <Calendar size={18} /> Frequência
         </button>
         <button 
            onClick={() => setActiveTab('resultado')}
            className={`flex-1 min-w-[200px] flex items-center justify-center gap-2 py-3 px-6 rounded-xl text-sm font-bold uppercase tracking-wider transition-all ${
               activeTab === 'resultado' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
         >
            <Calculator size={18} /> Resultado Final
         </button>
         <button 
            onClick={() => setActiveTab('conteudo')}
            className={`flex-1 min-w-[200px] flex items-center justify-center gap-2 py-3 px-6 rounded-xl text-sm font-bold uppercase tracking-wider transition-all ${
               activeTab === 'conteudo' ? 'bg-white text-purple-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
         >
            <BookOpen size={18} /> Conteúdo Programático
         </button>
         <button 
            onClick={() => setActiveTab('observacoes')}
            className={`flex-1 min-w-[200px] flex items-center justify-center gap-2 py-3 px-6 rounded-xl text-sm font-bold uppercase tracking-wider transition-all ${
               activeTab === 'observacoes' ? 'bg-white text-orange-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
         >
            <BookOpen size={18} /> Observações
         </button>
      </div>

      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden flex flex-col min-h-[500px]">
         {/* Tab Content */}
         
         <div className="flex-1">
         {activeTab === 'frequencia' && (
            <div>
               <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                     <thead>
                        <tr>
                           <th className="p-4 border-b border-slate-200 border-r w-12 text-center text-xs font-black text-slate-400">Nº</th>
                           <th className="p-4 border-b border-slate-200 border-r min-w-[250px] text-xs font-black text-[#001a33] uppercase">Nome do Aluno</th>
                           <th className="p-4 border-b border-slate-200 text-center text-xs font-black text-slate-400 border-r" colSpan={MOCK_AULAS_DATAS.length}>DIA/MÊS</th>
                           <th className="p-4 border-b border-slate-200 text-center text-xs font-black text-slate-400 w-32">TOTAL DE FALTAS</th>
                        </tr>
                        <tr>
                           <th className="p-2 border-b border-slate-200 border-r bg-slate-50"></th>
                           <th className="p-2 border-b border-slate-200 border-r bg-slate-50"></th>
                           {MOCK_AULAS_DATAS.map((data, idx) => (
                              <th key={idx} className="p-2 border-b border-slate-200 border-r bg-slate-50 text-center text-[10px] font-bold text-slate-600 min-w-[60px] truncate">{data}</th>
                           ))}
                           <th className="p-2 border-b border-slate-200 bg-slate-50 text-center"></th>
                        </tr>
                     </thead>
                     <tbody className="divide-y divide-slate-100">
                        {MOCK_ALUNOS.map((aluno, idx) => {
                           const totalFaltas = aluno.faltas.filter(f => f).length;
                           return (
                              <tr key={aluno.id} className="hover:bg-slate-50/50 transition-colors group">
                                 <td className="p-3 text-center border-r border-slate-100 text-slate-400 font-mono text-xs">{String(idx + 1).padStart(2, '0')}</td>
                                 <td className="p-3 border-r border-slate-100 font-bold text-sm text-[#001a33] truncate max-w-[250px]">{aluno.nome}</td>
                                 {aluno.faltas.map((foiFalta, fIdx) => (
                                    <td key={fIdx} className="p-2 border-r border-slate-100 text-center">
                                       <button className={`w-8 h-8 rounded-lg flex items-center justify-center mx-auto text-xs font-bold transition-all ${
                                          foiFalta 
                                             ? 'bg-red-50 text-red-600 border border-red-200' 
                                             : 'bg-emerald-50 text-emerald-600 border border-emerald-200'
                                       }`}>
                                          {foiFalta ? 'F' : 'P'}
                                       </button>
                                    </td>
                                 ))}
                                 <td className="p-3 text-center">
                                    <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full font-bold text-sm ${totalFaltas > 0 ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-500'}`}>
                                       {totalFaltas}
                                    </span>
                                 </td>
                              </tr>
                           );
                        })}
                     </tbody>
                  </table>
               </div>
            </div>
         )}

         {activeTab === 'resultado' && (
            <div>
               <div className="overflow-x-auto">
                  <table className="w-full text-center border-collapse">
                     <thead>
                        <tr>
                           <th className="p-4 border-b border-slate-200 border-r w-12 text-xs font-black text-slate-400" rowSpan={2}>Nº</th>
                           <th className="p-4 border-b border-slate-200 border-r min-w-[250px] text-xs font-black text-[#001a33] uppercase text-left" rowSpan={2}>Nome do Aluno</th>
                           <th className="p-2 border-b border-slate-200 border-r text-xs font-black text-blue-700 bg-blue-50/50" colSpan={6}>INSTRUMENTOS AVALIATIVOS</th>
                           <th className="p-4 border-b border-slate-200 border-r text-[10px] font-black text-slate-500 bg-slate-50" rowSpan={2}>MÉDIA PARCIAL</th>
                           <th className="p-4 border-b border-slate-200 border-r text-[10px] font-black text-slate-500 bg-slate-50" rowSpan={2}>REC</th>
                           <th className="p-4 border-b border-slate-200 border-r text-[10px] font-black text-slate-500 bg-slate-50" rowSpan={2}>MÉDIA FINAL</th>
                           <th className="p-2 border-b border-slate-200 border-r text-xs font-black text-amber-700 bg-amber-50/50" colSpan={2}>FREQUÊNCIA</th>
                           <th className="p-4 border-b border-slate-200 text-xs font-black text-[#001a33] uppercase" rowSpan={2}>RESULTADO FINAL</th>
                        </tr>
                        <tr>
                           <th className="p-2 border-b border-slate-200 border-r text-[10px] uppercase font-bold text-slate-400 w-12">P</th>
                           <th className="p-2 border-b border-slate-200 border-r text-[10px] uppercase font-bold text-slate-400 w-12">TI</th>
                           <th className="p-2 border-b border-slate-200 border-r text-[10px] uppercase font-bold text-slate-400 w-12">TG</th>
                           <th className="p-2 border-b border-slate-200 border-r text-[10px] uppercase font-bold text-slate-400 w-12">S</th>
                           <th className="p-2 border-b border-slate-200 border-r text-[10px] uppercase font-bold text-slate-400 w-12">CQ</th>
                           <th className="p-2 border-b border-slate-200 border-r text-[10px] uppercase font-bold text-slate-400 w-12">O</th>
                           <th className="p-2 border-b border-slate-200 border-r text-[10px] uppercase font-bold text-slate-400 w-16">FALTA</th>
                           <th className="p-2 border-b border-slate-200 border-r text-[10px] uppercase font-bold text-slate-400 w-16">%</th>
                        </tr>
                     </thead>
                     <tbody className="divide-y divide-slate-100">
                        {MOCK_ALUNOS.map((aluno, idx) => {
                           const totalFaltas = aluno.faltas.filter(f => f).length;
                           return (
                              <tr key={aluno.id} className="hover:bg-slate-50/50 transition-colors">
                                 <td className="p-2 text-center border-r border-slate-100 text-slate-400 font-mono text-xs">{String(idx + 1).padStart(2, '0')}</td>
                                 <td className="p-2 border-r border-slate-100 font-bold text-xs text-[#001a33] text-left truncate max-w-[200px]">{aluno.nome}</td>
                                 <td className="p-1 border-r border-slate-100"><input type="number" step="0.5" className="w-full text-center text-xs font-bold text-slate-700 bg-transparent outline-none" defaultValue={aluno.notas.p} /></td>
                                 <td className="p-1 border-r border-slate-100"><input type="number" step="0.5" className="w-full text-center text-xs font-bold text-slate-700 bg-transparent outline-none" defaultValue={aluno.notas.ti} /></td>
                                 <td className="p-1 border-r border-slate-100"><input type="number" step="0.5" className="w-full text-center text-xs font-bold text-slate-700 bg-transparent outline-none" defaultValue={aluno.notas.tg} /></td>
                                 <td className="p-1 border-r border-slate-100"><input type="number" step="0.5" className="w-full text-center text-xs font-bold text-slate-700 bg-transparent outline-none" defaultValue={aluno.notas.s} /></td>
                                 <td className="p-1 border-r border-slate-100"><input type="number" step="0.5" className="w-full text-center text-xs font-bold text-slate-700 bg-transparent outline-none" defaultValue={aluno.notas.cq} /></td>
                                 <td className="p-1 border-r border-slate-100"><input type="number" step="0.5" className="w-full text-center text-xs font-bold text-slate-700 bg-transparent outline-none" defaultValue={aluno.notas.o} /></td>
                                 
                                 <td className="p-2 border-r border-slate-100 font-bold text-xs bg-slate-50">{aluno.mediaParcial.toFixed(1)}</td>
                                 <td className="p-1 border-r border-slate-100"><input type="number" step="0.5" className="w-full text-center text-xs font-bold text-slate-700 bg-transparent outline-none text-blue-600" defaultValue={aluno.rec || ''} /></td>
                                 <td className="p-2 border-r border-slate-100 font-black text-sm bg-slate-50 text-[#001a33]">{aluno.mediaFinal.toFixed(1)}</td>
                                 
                                 <td className="p-2 border-r border-slate-100 font-bold text-xs text-red-600">{totalFaltas}</td>
                                 <td className="p-2 border-r border-slate-100 font-bold text-xs">{aluno.frequencia}%</td>
                                 
                                 <td className="p-2">
                                    <span className={`inline-block px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider ${aluno.resultado === 'APROVADO' ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'}`}>
                                       {aluno.resultado}
                                    </span>
                                 </td>
                              </tr>
                           );
                        })}
                     </tbody>
                  </table>
               </div>
               
               <div className="p-6 bg-slate-50 border-t border-slate-200">
                  <p className="text-xs font-bold text-slate-500 mb-2">LEGENDA. Instrumentos Avaliativos:</p>
                  <div className="flex flex-wrap gap-4 text-[10px] font-medium text-slate-600">
                     <span><strong>P</strong> - Prova</span>
                     <span><strong>TI</strong> - Trabalho Individual</span>
                     <span><strong>TG</strong> - Trabalho em Grupo</span>
                     <span><strong>S</strong> - Seminários</span>
                     <span><strong>CQ</strong> - Critérios Qualitativos (assiduidade, pontualidade, etc = 1 ponto)</span>
                     <span><strong>O</strong> - Outros</span>
                  </div>
               </div>
            </div>
         )}
         
         {activeTab === 'conteudo' && (
            <div className="p-6">
               <div className="overflow-x-auto rounded-xl border border-slate-200 overflow-hidden mb-6">
                  <table className="w-full text-left border-collapse">
                     <thead>
                        <tr className="bg-slate-50">
                           <th className="p-4 border-b border-slate-200 border-r w-32 text-xs font-black text-slate-500 uppercase">DIA/MÊS</th>
                           <th className="p-4 border-b border-slate-200 border-r text-xs font-black text-[#001a33] uppercase">CONTEÚDO PROGRAMÁTICO</th>
                           <th className="p-4 border-b border-slate-200 text-xs font-black text-slate-500 uppercase">PRÁTICA PEDAGÓGICA</th>
                        </tr>
                     </thead>
                     <tbody className="divide-y divide-slate-100">
                        {MOCK_CONTEUDO.map((row, idx) => (
                           <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                              <td className="p-3 border-r border-slate-100">
                                 <input type="text" className="w-full bg-transparent outline-none font-bold text-sm text-slate-700" defaultValue={row.data} placeholder="Ex: 10/05" />
                              </td>
                              <td className="p-3 border-r border-slate-100">
                                 <textarea className="w-full bg-transparent outline-none text-sm text-slate-700 resize-none h-10" defaultValue={row.conteudo} placeholder="Descreva o conteúdo..."></textarea>
                              </td>
                              <td className="p-3">
                                 <textarea className="w-full bg-transparent outline-none text-sm text-slate-700 resize-none h-10" defaultValue={row.pratica} placeholder="Descreva a prática..."></textarea>
                              </td>
                           </tr>
                        ))}
                        <tr className="hover:bg-slate-50/50 transition-colors">
                           <td className="p-3 border-r border-slate-100">
                              <input type="text" className="w-full bg-transparent outline-none font-bold text-sm text-slate-400 placeholder-slate-300" placeholder="Ex: 10/05" />
                           </td>
                           <td className="p-3 border-r border-slate-100">
                              <textarea className="w-full bg-transparent outline-none text-sm text-slate-400 placeholder-slate-300 resize-none h-10" placeholder="+ Adicionar conteúdo..."></textarea>
                           </td>
                           <td className="p-3">
                              <textarea className="w-full bg-transparent outline-none text-sm text-slate-400 placeholder-slate-300 resize-none h-10" placeholder="+ Adicionar prática..."></textarea>
                           </td>
                        </tr>
                     </tbody>
                  </table>
               </div>
            </div>
         )}

         {activeTab === 'observacoes' && (
            <div className="p-6">
               <div className="space-y-4 max-w-4xl">
                  <div>
                     <label className="text-xs font-bold tracking-wider uppercase text-slate-500 mb-2 block">Anotações do Docente:</label>
                     <textarea 
                        className="w-full rounded-2xl border border-slate-200 p-5 text-sm font-medium text-slate-700 min-h-[300px] outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100 transition-all bg-slate-50 focus:bg-white resize-none" 
                        placeholder="Digite aqui as observações gerais sobre a unidade educacional, ocorrências em sala, rendimento da turma, etc..."
                     ></textarea>
                  </div>
               </div>
            </div>
         )}
         </div>

         {/* Footer / Signatures - Attached to the bottom of the card */}
         <div className="bg-slate-50 p-6 md:px-8 border-t border-slate-200 mt-auto">
            <div className="flex flex-col xl:flex-row justify-between items-center gap-8 text-xs font-bold text-slate-500 uppercase tracking-widest">
               <div className="flex flex-wrap items-center gap-x-12 gap-y-4">
                  <div>Carga Horária: <span className="text-slate-700">{disciplina.cargaHoraria}H</span></div>
                  <div>Horas Realizadas: <span className="text-slate-700">{disciplina.horasRealizadas}H</span></div>
                  <div>Encerrado em: <span className="text-slate-700 border-b border-dashed border-slate-400 px-8 text-transparent">____/____/_____</span></div>
               </div>
               <div className="flex flex-wrap items-center gap-12 mt-4 xl:mt-0">
                  <div className="text-center">
                     <div className="w-56 border-b border-slate-400 mb-2 h-4"></div>
                     <p>Assinatura Professor(a)</p>
                  </div>
                  <div className="text-center">
                     <div className="w-56 border-b border-slate-400 mb-2 h-4"></div>
                     <p>Assinatura Coordenador(a)</p>
                  </div>
               </div>
            </div>
         </div>
      </div>
    </div>
  );
};

export default DiarioClasse;
