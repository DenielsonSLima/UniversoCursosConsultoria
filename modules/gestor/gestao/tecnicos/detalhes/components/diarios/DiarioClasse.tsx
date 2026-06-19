// File: modules/gestor/gestao/tecnicos/detalhes/components/diarios/DiarioClasse.tsx

import React, { useState, useEffect } from 'react';
import { ArrowLeft, Save, Printer, Calendar, BookOpen, Calculator, CheckCircle2, Loader2, AlertCircle } from 'lucide-react';
import { supabase } from '../../../../../../../lib/supabase';
import ToastNotification, { useToast } from '../../../../../parceiros/components/shared/ToastNotification';


interface DiarioClasseProps {
  disciplina: any;
  moduloNome: string;
  turma: any;
  onBack: () => void;
}

const DiarioClasse: React.FC<DiarioClasseProps> = ({ disciplina, moduloNome, turma, onBack }) => {
  const { toasts, removeToast, toast } = useToast();
  const [activeTab, setActiveTab] = useState<'frequencia' | 'resultado' | 'conteudo' | 'observacoes'>('frequencia');
  const [loading, setLoading] = useState(true);
  const [students, setStudents] = useState<any[]>([]);
  const [aulas, setAulas] = useState<any[]>([]);

  // Frequência: studentId -> classId -> 'P' | 'F'
  const [attendance, setAttendance] = useState<Record<string, Record<string, 'P' | 'F'>>>({});
  
  // Notas: studentId -> { p, ti, tg, s, cq, o, rec }
  const [grades, setGrades] = useState<Record<string, any>>({});
  
  // Observações
  const [observacoes, setObservacoes] = useState('');

  // Práticas Pedagógicas das Aulas (aulaId -> texto)
  const [aulaPraticas, setAulaPraticas] = useState<Record<string, string>>({});

  useEffect(() => {
    loadDiarioDetails();
  }, [turma.id, disciplina.id]);

  const loadDiarioDetails = async () => {
    setLoading(true);
    try {
      // 1. Alunos matriculados
      const { data: matriculasData, error: matriculasError } = await supabase
        .from('matriculas')
        .select('id, status, parceiros(*)')
        .eq('turma_id', turma.id);

      if (matriculasError) throw matriculasError;

      const mappedStudents = (matriculasData || [])
        .filter((m: any) => m.parceiros)
        .map((m: any) => ({
          id: m.parceiros.id,
          nome: m.parceiros.nome,
          matricula: m.id.substring(0, 8).toUpperCase(),
          status: m.status
        }));
      setStudents(mappedStudents);

      // Inicializa notas vazias/padrão
      const initialGrades: Record<string, any> = {};
      mappedStudents.forEach(s => {
        initialGrades[s.id] = { p: 0, ti: 0, tg: 0, s: 0, cq: 0, o: 0, rec: null };
      });
      setGrades(initialGrades);

      // 2. Aulas lançadas na turma para esta disciplina
      const { data: aulasData, error: aulasError } = await supabase
        .from('aulas_turma')
        .select('*')
        .eq('turma_id', turma.id)
        .eq('disciplina_id', disciplina.id)
        .order('created_at', { ascending: true });

      if (aulasError) throw aulasError;

      const mappedAulas = (aulasData || []).map((a: any, idx: number) => ({
        id: a.id,
        titulo: a.titulo,
        cargaHoraria: parseFloat(a.carga_horaria),
        dataLabel: a.created_at ? new Date(a.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : `Aula ${idx + 1}`
      }));
      setAulas(mappedAulas);

      // Inicializa presença 'P' (Presença) padrão
      const initialAttendance: Record<string, Record<string, 'P' | 'F'>> = {};
      mappedStudents.forEach(s => {
        initialAttendance[s.id] = {};
        mappedAulas.forEach(a => {
          initialAttendance[s.id][a.id] = 'P';
        });
      });
      setAttendance(initialAttendance);

      // Inicializa campos de práticas
      const initialPraticas: Record<string, string> = {};
      mappedAulas.forEach(a => {
        initialPraticas[a.id] = 'Aula expositiva / Prática padrão';
      });
      setAulaPraticas(initialPraticas);

    } catch (err) {
      console.error('Erro ao buscar dados do diário de classe:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleAttendance = (studentId: string, classId: string) => {
    setAttendance(prev => {
      const current = prev[studentId]?.[classId] || 'P';
      const next = current === 'P' ? 'F' : 'P';
      return {
        ...prev,
        [studentId]: {
          ...prev[studentId],
          [classId]: next
        }
      };
    });
  };

  const handleGradeChange = (studentId: string, field: string, value: string) => {
    const numeric = parseFloat(value) || 0;
    setGrades(prev => ({
      ...prev,
      [studentId]: {
        ...prev[studentId],
        [field]: field === 'rec' ? (value === '' ? null : numeric) : numeric
      }
    }));
  };

  const handleSave = () => {
    toast.success("Sucesso", "Alterações salvas com sucesso! (Salvo no estado local da aplicação - tabelas de avaliações individuais pendentes nas próximas fases do projeto).");
  };

  const calculateStudentStats = (studentId: string) => {
    const studentGrades = grades[studentId] || { p: 0, ti: 0, tg: 0, s: 0, cq: 0, o: 0, rec: null };
    const studentAttendance = attendance[studentId] || {};
    
    // Faltas
    const totalAulas = aulas.length;
    const faltas = Object.values(studentAttendance).filter(v => v === 'F').length;
    const frequencia = totalAulas > 0 ? Math.round(((totalAulas - faltas) / totalAulas) * 100) : 100;

    // Média Parcial
    const { p, ti, tg, s, cq, o, rec } = studentGrades;
    const mediaParcial = Math.min(10, Math.round(((p + ti + tg + s) / 4 + cq + o) * 10) / 10);
    
    // Média Final
    const mediaFinal = rec !== null && rec > mediaParcial ? rec : mediaParcial;
    const aprovado = mediaFinal >= 6.0 && frequencia >= 75;

    return {
      faltas,
      frequencia,
      mediaParcial,
      mediaFinal,
      resultado: aprovado ? 'APROVADO' : 'REPROVADO'
    };
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-20">
        <Loader2 className="animate-spin text-[#001a33]" size={32} />
        <span className="text-slate-500 font-bold ml-3">Carregando detalhes do diário...</span>
      </div>
    );
  }

  return (
    <div className="animate-fadeIn max-w-[1400px] mx-auto">
      {/* Header Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-4">
          <button 
            onClick={onBack}
            className="w-10 h-10 flex items-center justify-center rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50 transition-colors bg-white shrink-0 shadow-sm"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <h3 className="text-2xl font-black text-[#001a33] uppercase tracking-tight">Diário de Classe</h3>
            <p className="text-sm font-bold text-slate-500">{disciplina.nome} • {moduloNome}</p>
          </div>
        </div>
        <div className="flex gap-2">
           <button onClick={() => window.print()} className="px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded-xl text-xs font-bold uppercase tracking-wider hover:bg-slate-50 flex items-center gap-2 shadow-sm">
             <Printer size={16} /> Imprimir Diário
           </button>
           <button onClick={handleSave} className="px-4 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold uppercase tracking-wider hover:bg-blue-700 flex items-center gap-2 shadow-md">
             <Save size={16} /> Salvar Alterações
           </button>
        </div>
      </div>

      {/* Diary Header Info */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 mb-6 shadow-sm">
         <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div>
               <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-1">Curso</p>
               <p className="font-bold text-slate-700">{turma.cursoNome}</p>
            </div>
            <div>
               <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-1">Módulo</p>
               <p className="font-bold text-slate-700">{moduloNome}</p>
            </div>
            <div>
               <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-1">Disciplina</p>
               <p className="font-bold text-slate-700">{disciplina.nome}</p>
            </div>
            <div>
               <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-1">Professor(a)</p>
               <p className={`font-bold ${disciplina.professor === 'Não atribuído' ? 'text-rose-500' : 'text-slate-700'}`}>
                 {disciplina.professor}
               </p>
            </div>
         </div>
      </div>

      {/* Tabs */}
      <div className="flex overflow-x-auto hide-scrollbar gap-2 mb-6 bg-slate-200/50 p-1.5 rounded-2xl border border-slate-100">
         <button 
            onClick={() => setActiveTab('frequencia')}
            className={`flex-1 min-w-[150px] flex items-center justify-center gap-2 py-3 px-6 rounded-xl text-sm font-bold uppercase tracking-wider transition-all ${
               activeTab === 'frequencia' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
         >
            <Calendar size={18} /> Frequência
         </button>
         <button 
            onClick={() => setActiveTab('resultado')}
            className={`flex-1 min-w-[150px] flex items-center justify-center gap-2 py-3 px-6 rounded-xl text-sm font-bold uppercase tracking-wider transition-all ${
               activeTab === 'resultado' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
         >
            <Calculator size={18} /> Notas e Resultados
         </button>
         <button 
            onClick={() => setActiveTab('conteudo')}
            className={`flex-1 min-w-[150px] flex items-center justify-center gap-2 py-3 px-6 rounded-xl text-sm font-bold uppercase tracking-wider transition-all ${
               activeTab === 'conteudo' ? 'bg-white text-purple-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
         >
            <BookOpen size={18} /> Conteúdo das Aulas
         </button>
         <button 
            onClick={() => setActiveTab('observacoes')}
            className={`flex-1 min-w-[150px] flex items-center justify-center gap-2 py-3 px-6 rounded-xl text-sm font-bold uppercase tracking-wider transition-all ${
               activeTab === 'observacoes' ? 'bg-white text-orange-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
         >
            <BookOpen size={18} /> Observações
         </button>
      </div>

      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden flex flex-col min-h-[500px] mb-8">
         <div className="flex-1">
          
          {/* Aba de Frequência */}
          {activeTab === 'frequencia' && (
            <div>
              {students.length === 0 ? (
                <div className="py-20 text-center text-slate-400 flex flex-col items-center">
                  <AlertCircle size={48} className="mb-4 opacity-50 text-slate-300" />
                  <p className="font-bold text-sm">Nenhum aluno matriculado nesta turma.</p>
                  <p className="text-xs text-slate-500 mt-1">Matricule alunos na aba "Alunos" para registrar frequência.</p>
                </div>
              ) : aulas.length === 0 ? (
                <div className="py-20 text-center text-slate-400 flex flex-col items-center">
                  <Calendar size={48} className="mb-4 opacity-50 text-slate-300" />
                  <p className="font-bold text-sm">Nenhuma aula registrada nesta disciplina.</p>
                  <p className="text-xs text-slate-500 mt-1 max-w-md">Adicione aulas no cronograma da disciplina na aba "Grade & Profs" para lançar a folha de presença.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                   <table className="w-full text-left border-collapse">
                      <thead>
                         <tr>
                            <th className="p-4 border-b border-slate-200 border-r w-12 text-center text-xs font-black text-slate-400">Nº</th>
                            <th className="p-4 border-b border-slate-200 border-r min-w-[250px] text-xs font-black text-[#001a33] uppercase">Nome do Aluno</th>
                            <th className="p-4 border-b border-slate-200 text-center text-xs font-black text-slate-400 border-r" colSpan={aulas.length}>AULAS LANÇADAS</th>
                            <th className="p-4 border-b border-slate-200 text-center text-xs font-black text-slate-400 w-32">TOTAL FALTAS</th>
                         </tr>
                         <tr>
                            <th className="p-2 border-b border-slate-200 border-r bg-slate-50"></th>
                            <th className="p-2 border-b border-slate-200 border-r bg-slate-50"></th>
                            {aulas.map((aula) => (
                               <th key={aula.id} className="p-2 border-b border-slate-200 border-r bg-slate-50 text-center text-[10px] font-bold text-slate-600 min-w-[65px] truncate" title={aula.titulo}>
                                 {aula.dataLabel}
                               </th>
                            ))}
                            <th className="p-2 border-b border-slate-200 bg-slate-50 text-center"></th>
                         </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                         {students.map((aluno, idx) => {
                            const stats = calculateStudentStats(aluno.id);
                            return (
                               <tr key={aluno.id} className="hover:bg-slate-50/50 transition-colors group">
                                  <td className="p-3 text-center border-r border-slate-100 text-slate-400 font-mono text-xs">{String(idx + 1).padStart(2, '0')}</td>
                                  <td className="p-3 border-r border-slate-100 font-bold text-sm text-[#001a33] truncate max-w-[250px]">{aluno.nome}</td>
                                  {aulas.map((aula) => {
                                     const foiFalta = attendance[aluno.id]?.[aula.id] === 'F';
                                     return (
                                        <td key={aula.id} className="p-2 border-r border-slate-100 text-center">
                                           <button 
                                             onClick={() => handleToggleAttendance(aluno.id, aula.id)}
                                             className={`w-8 h-8 rounded-lg flex items-center justify-center mx-auto text-xs font-bold transition-all ${
                                                foiFalta 
                                                   ? 'bg-red-50 text-red-600 border border-red-200 hover:bg-red-100' 
                                                   : 'bg-emerald-50 text-emerald-600 border border-emerald-200 hover:bg-emerald-100'
                                             }`}
                                           >
                                              {foiFalta ? 'F' : 'P'}
                                           </button>
                                        </td>
                                     );
                                  })}
                                  <td className="p-3 text-center">
                                     <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full font-bold text-sm ${stats.faltas > 0 ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-500'}`}>
                                        {stats.faltas}
                                     </span>
                                  </td>
                               </tr>
                            );
                         })}
                      </tbody>
                   </table>
                </div>
              )}
            </div>
          )}

          {/* Aba de Notas / Resultados */}
          {activeTab === 'resultado' && (
            <div>
              {students.length === 0 ? (
                <div className="py-20 text-center text-slate-400 flex flex-col items-center">
                  <AlertCircle size={48} className="mb-4 opacity-50 text-slate-300" />
                  <p className="font-bold text-sm">Nenhum aluno matriculado nesta turma.</p>
                  <p className="text-xs text-slate-500 mt-1">Matricule alunos na aba "Alunos" para lançar notas.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                   <table className="w-full text-center border-collapse">
                      <thead>
                         <tr>
                            <th className="p-4 border-b border-slate-200 border-r w-12 text-xs font-black text-slate-400" rowSpan={2}>Nº</th>
                            <th className="p-4 border-b border-slate-200 border-r min-w-[250px] text-xs font-black text-[#001a33] uppercase text-left" rowSpan={2}>Nome do Aluno</th>
                            <th className="p-2 border-b border-slate-200 border-r text-xs font-black text-blue-700 bg-blue-50/50" colSpan={6}>INSTRUMENTOS AVALIATIVOS (0.0 a 10.0)</th>
                            <th className="p-4 border-b border-slate-200 border-r text-[10px] font-black text-slate-500 bg-slate-50" rowSpan={2}>MÉDIA PARCIAL</th>
                            <th className="p-4 border-b border-slate-200 border-r text-[10px] font-black text-slate-500 bg-slate-50" rowSpan={2}>REC</th>
                            <th className="p-4 border-b border-slate-200 border-r text-[10px] font-black text-slate-500 bg-slate-50" rowSpan={2}>MÉDIA FINAL</th>
                            <th className="p-2 border-b border-slate-200 border-r text-xs font-black text-amber-700 bg-amber-50/50" colSpan={2}>FREQUÊNCIA</th>
                            <th className="p-4 border-b border-slate-200 text-xs font-black text-[#001a33] uppercase" rowSpan={2}>RESULTADO FINAL</th>
                         </tr>
                         <tr>
                            <th className="p-2 border-b border-slate-200 border-r text-[10px] uppercase font-bold text-slate-400 w-12" title="Prova">P</th>
                            <th className="p-2 border-b border-slate-200 border-r text-[10px] uppercase font-bold text-slate-400 w-12" title="Trabalho Individual">TI</th>
                            <th className="p-2 border-b border-slate-200 border-r text-[10px] uppercase font-bold text-slate-400 w-12" title="Trabalho em Grupo">TG</th>
                            <th className="p-2 border-b border-slate-200 border-r text-[10px] uppercase font-bold text-slate-400 w-12" title="Seminário">S</th>
                            <th className="p-2 border-b border-slate-200 border-r text-[10px] uppercase font-bold text-slate-400 w-12" title="Critérios Qualitativos">CQ</th>
                            <th className="p-2 border-b border-slate-200 border-r text-[10px] uppercase font-bold text-slate-400 w-12" title="Outros">O</th>
                            <th className="p-2 border-b border-slate-200 border-r text-[10px] uppercase font-bold text-slate-400 w-16">FALTAS</th>
                            <th className="p-2 border-b border-slate-200 border-r text-[10px] uppercase font-bold text-slate-400 w-16">% PRES.</th>
                         </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                         {students.map((aluno, idx) => {
                            const stats = calculateStudentStats(aluno.id);
                            const studentGrades = grades[aluno.id] || { p: 0, ti: 0, tg: 0, s: 0, cq: 0, o: 0, rec: null };
                            return (
                               <tr key={aluno.id} className="hover:bg-slate-50/50 transition-colors">
                                  <td className="p-2 text-center border-r border-slate-100 text-slate-400 font-mono text-xs">{String(idx + 1).padStart(2, '0')}</td>
                                  <td className="p-2 border-r border-slate-100 font-bold text-xs text-[#001a33] text-left truncate max-w-[200px]">{aluno.nome}</td>
                                  <td className="p-1 border-r border-slate-100">
                                    <input 
                                      type="number" min="0" max="10" step="0.1" 
                                      className="w-full text-center text-xs font-bold text-slate-700 bg-transparent outline-none focus:bg-blue-50/50 rounded py-1" 
                                      value={studentGrades.p} 
                                      onChange={(e) => handleGradeChange(aluno.id, 'p', e.target.value)}
                                    />
                                  </td>
                                  <td className="p-1 border-r border-slate-100">
                                    <input 
                                      type="number" min="0" max="10" step="0.1" 
                                      className="w-full text-center text-xs font-bold text-slate-700 bg-transparent outline-none focus:bg-blue-50/50 rounded py-1" 
                                      value={studentGrades.ti} 
                                      onChange={(e) => handleGradeChange(aluno.id, 'ti', e.target.value)}
                                    />
                                  </td>
                                  <td className="p-1 border-r border-slate-100">
                                    <input 
                                      type="number" min="0" max="10" step="0.1" 
                                      className="w-full text-center text-xs font-bold text-slate-700 bg-transparent outline-none focus:bg-blue-50/50 rounded py-1" 
                                      value={studentGrades.tg} 
                                      onChange={(e) => handleGradeChange(aluno.id, 'tg', e.target.value)}
                                    />
                                  </td>
                                  <td className="p-1 border-r border-slate-100">
                                    <input 
                                      type="number" min="0" max="10" step="0.1" 
                                      className="w-full text-center text-xs font-bold text-slate-700 bg-transparent outline-none focus:bg-blue-50/50 rounded py-1" 
                                      value={studentGrades.s} 
                                      onChange={(e) => handleGradeChange(aluno.id, 's', e.target.value)}
                                    />
                                  </td>
                                  <td className="p-1 border-r border-slate-100">
                                    <input 
                                      type="number" min="0" max="10" step="0.1" 
                                      className="w-full text-center text-xs font-bold text-slate-700 bg-transparent outline-none focus:bg-blue-50/50 rounded py-1" 
                                      value={studentGrades.cq} 
                                      onChange={(e) => handleGradeChange(aluno.id, 'cq', e.target.value)}
                                    />
                                  </td>
                                  <td className="p-1 border-r border-slate-100">
                                    <input 
                                      type="number" min="0" max="10" step="0.1" 
                                      className="w-full text-center text-xs font-bold text-slate-700 bg-transparent outline-none focus:bg-blue-50/50 rounded py-1" 
                                      value={studentGrades.o} 
                                      onChange={(e) => handleGradeChange(aluno.id, 'o', e.target.value)}
                                    />
                                  </td>
                                  
                                  <td className="p-2 border-r border-slate-100 font-bold text-xs bg-slate-50">{stats.mediaParcial.toFixed(1)}</td>
                                  <td className="p-1 border-r border-slate-100">
                                    <input 
                                      type="number" min="0" max="10" step="0.1" 
                                      className="w-full text-center text-xs font-bold text-blue-600 bg-transparent outline-none focus:bg-blue-50/50 rounded py-1" 
                                      value={studentGrades.rec === null ? '' : studentGrades.rec} 
                                      placeholder="—"
                                      onChange={(e) => handleGradeChange(aluno.id, 'rec', e.target.value)}
                                    />
                                  </td>
                                  <td className="p-2 border-r border-slate-100 font-black text-sm bg-slate-50 text-[#001a33]">{stats.mediaFinal.toFixed(1)}</td>
                                  
                                  <td className="p-2 border-r border-slate-100 font-bold text-xs text-red-600">{stats.faltas}</td>
                                  <td className="p-2 border-r border-slate-100 font-bold text-xs">{stats.frequencia}%</td>
                                  
                                  <td className="p-2">
                                     <span className={`inline-block px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider ${stats.resultado === 'APROVADO' ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'}`}>
                                        {stats.resultado}
                                     </span>
                                  </td>
                               </tr>
                            );
                         })}
                      </tbody>
                   </table>
                </div>
              )}
              
              <div className="p-6 bg-slate-50 border-t border-slate-200">
                 <p className="text-xs font-bold text-slate-500 mb-2">LEGENDA - Instrumentos Avaliativos:</p>
                 <div className="flex flex-wrap gap-x-6 gap-y-2 text-[10px] font-medium text-slate-600">
                    <span><strong>P</strong> - Prova Escrita</span>
                    <span><strong>TI</strong> - Trabalho Individual</span>
                    <span><strong>TG</strong> - Trabalho em Grupo</span>
                    <span><strong>S</strong> - Seminário</span>
                    <span><strong>CQ</strong> - Critérios Qualitativos (assiduidade, participação, etc.)</span>
                    <span><strong>O</strong> - Outros / Atividades Práticas</span>
                    <span><strong>REC</strong> - Recuperação Semestral</span>
                 </div>
              </div>
            </div>
          )}
          
          {/* Aba de Conteúdo Programático */}
          {activeTab === 'conteudo' && (
            <div className="p-6">
              {aulas.length === 0 ? (
                <div className="py-20 text-center text-slate-400 flex flex-col items-center">
                  <BookOpen size={48} className="mb-4 opacity-50 text-slate-300" />
                  <p className="font-bold text-sm">Nenhuma aula registrada nesta disciplina.</p>
                  <p className="text-xs text-slate-500 mt-1">Adicione aulas e sua carga horária na aba "Grade & Profs".</p>
                </div>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-slate-200 overflow-hidden shadow-sm">
                   <table className="w-full text-left border-collapse">
                      <thead>
                         <tr className="bg-slate-50">
                            <th className="p-4 border-b border-slate-200 border-r w-32 text-xs font-black text-slate-500 uppercase">DIA/MÊS</th>
                            <th className="p-4 border-b border-slate-200 border-r text-xs font-black text-[#001a33] uppercase">AULA / CONTEÚDO PROGRAMÁTICO</th>
                            <th className="p-4 border-b border-slate-200 text-xs font-black text-slate-500 uppercase">PRÁTICA PEDAGÓGICA REGISTRADA</th>
                         </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 bg-white">
                         {aulas.map((aula, idx) => (
                            <tr key={aula.id} className="hover:bg-slate-50/50 transition-colors">
                               <td className="p-3 border-r border-slate-100 font-bold text-sm text-slate-700">
                                  {aula.dataLabel}
                               </td>
                               <td className="p-3 border-r border-slate-100">
                                  <div className="text-sm font-bold text-[#001a33]">{aula.titulo}</div>
                                  <div className="text-[10px] text-slate-500 font-medium font-mono mt-0.5">Carga horária: {aula.cargaHoraria}H</div>
                                </td>
                               <td className="p-3">
                                  <textarea 
                                    className="w-full bg-transparent outline-none text-xs text-slate-700 resize-none h-12 focus:bg-blue-50/20 p-1.5 rounded border border-transparent focus:border-slate-200" 
                                    value={aulaPraticas[aula.id] || ''}
                                    onChange={(e) => {
                                      const text = e.target.value;
                                      setAulaPraticas(prev => ({ ...prev, [aula.id]: text }));
                                    }}
                                    placeholder="Descreva a prática pedagógica executada..."
                                  ></textarea>
                               </td>
                            </tr>
                         ))}
                      </tbody>
                   </table>
                </div>
              )}
            </div>
          )}

          {/* Aba de Observações */}
          {activeTab === 'observacoes' && (
            <div className="p-6">
               <div className="space-y-4 max-w-4xl">
                  <div>
                     <label className="text-xs font-bold tracking-wider uppercase text-slate-500 mb-2 block">Anotações do Docente:</label>
                     <textarea 
                        className="w-full rounded-2xl border border-slate-200 p-5 text-sm font-medium text-slate-700 min-h-[300px] outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100 transition-all bg-slate-50 focus:bg-white resize-none" 
                        value={observacoes}
                        onChange={(e) => setObservacoes(e.target.value)}
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
                  <div>Carga Horária Total: <span className="text-slate-700">{disciplina.cargaHoraria}H</span></div>
                  <div>Horas Lançadas: <span className="text-slate-700">{disciplina.horasRealizadas}H</span></div>
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
      <ToastNotification toasts={toasts} onRemove={removeToast} />
    </div>
  );
};

export default DiarioClasse;
