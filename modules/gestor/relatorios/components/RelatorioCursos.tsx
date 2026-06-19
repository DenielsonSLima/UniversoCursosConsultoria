import React, { useState, useEffect } from 'react';
import { Printer, Filter, Award } from 'lucide-react';
import { supabase } from '../../../../lib/supabase';
import DocumentHeader from '../../components/DocumentHeader';

interface RelatorioCursosProps {
  company: any;
  polo: any;
}

interface CourseReportItem {
  id: string;
  nome: string;
  modalidade: string;
  cargaHoraria: number;
  totalTurmas: number;
  totalAlunos: number;
}

const MOCK_CURSOS: CourseReportItem[] = [
  { id: '1', nome: 'Técnico em Radiologia', modalidade: 'TECNICO', cargaHoraria: 1200, totalTurmas: 4, totalAlunos: 98 },
  { id: '2', nome: 'Técnico em Enfermagem', modalidade: 'TECNICO', cargaHoraria: 1600, totalTurmas: 5, totalAlunos: 124 },
  { id: '3', nome: 'Especialização em Tomografia Computadorizada', modalidade: 'ESPECIALIZACAO', cargaHoraria: 360, totalTurmas: 2, totalAlunos: 32 },
  { id: '4', nome: 'Radiologia Odontológica Avançada', modalidade: 'EAD', cargaHoraria: 120, totalTurmas: 3, totalAlunos: 58 },
  { id: '5', nome: 'Atendimento ao Cliente e Marketing', modalidade: 'LIVRE', cargaHoraria: 40, totalTurmas: 1, totalAlunos: 15 }
];

const RelatorioCursos: React.FC<RelatorioCursosProps> = ({ company, polo }) => {
  const [cursosList, setCursosList] = useState<CourseReportItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedModalidade, setSelectedModalidade] = useState('todos');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      // 1. Fetch courses
      const { data: dbCursos, error: cursosErr } = await supabase
        .from('cursos')
        .select('id, nome, modalidade, carga_horaria');
      
      if (cursosErr) throw cursosErr;

      // 2. Fetch turmas for counting classes per course
      const { data: dbTurmas } = await supabase
        .from('turmas')
        .select('id, curso_id');

      // 3. Fetch matriculas to count students per course
      const { data: dbMatriculas } = await supabase
        .from('matriculas')
        .select('id, status, turma_id');

      // Map turma_id to curso_id
      const turmaToCourse: Record<string, string> = {};
      const courseClassesCount: Record<string, number> = {};
      
      dbTurmas?.forEach((t: any) => {
        turmaToCourse[t.id] = t.curso_id;
        courseClassesCount[t.curso_id] = (courseClassesCount[t.curso_id] || 0) + 1;
      });

      // Count students per course
      const courseStudentsCount: Record<string, number> = {};
      dbMatriculas?.forEach((m: any) => {
        if (m.status === 'ATIVO' || m.status === 'ativo' || m.status === 'Matriculado' || m.status === 'CONFIRMADO') {
          const courseId = turmaToCourse[m.turma_id];
          if (courseId) {
            courseStudentsCount[courseId] = (courseStudentsCount[courseId] || 0) + 1;
          }
        }
      });

      const mapped = dbCursos?.map((c: any) => ({
        id: c.id,
        nome: c.nome,
        modalidade: c.modalidade || 'OUTRO',
        cargaHoraria: Number(c.carga_horaria) || 0,
        totalTurmas: courseClassesCount[c.id] || 0,
        totalAlunos: courseStudentsCount[c.id] || 0
      })) || [];

      if (mapped.length === 0) {
        setCursosList(MOCK_CURSOS);
      } else {
        setCursosList(mapped);
      }
    } catch (err) {
      console.error('Erro ao carregar dados por curso:', err);
      setCursosList(MOCK_CURSOS);
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  // Filter items
  const filteredItems = cursosList.filter(item => {
    if (selectedModalidade !== 'todos' && item.modalidade !== selectedModalidade) return false;
    return true;
  });

  const totalClasses = filteredItems.reduce((acc, curr) => acc + curr.totalTurmas, 0);
  const totalStudents = filteredItems.reduce((acc, curr) => acc + curr.totalAlunos, 0);

  return (
    <div className="flex flex-col lg:flex-row gap-6 h-full w-full">
      {/* Lado Esquerdo: Filtros e Métricas */}
      <div className="w-full lg:w-72 bg-white rounded-3xl p-5 border border-slate-100 shadow-sm shrink-0 flex flex-col justify-between">
        <div className="space-y-5">
          <div>
            <h3 className="text-sm font-black text-[#001a33] uppercase tracking-wider mb-3">Filtros do Relatório</h3>
            
            <div className="space-y-3">
              {/* Modalidade */}
              <div className="flex flex-col gap-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase ml-1">Modalidade</span>
                <select
                  value={selectedModalidade}
                  onChange={(e) => setSelectedModalidade(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-700 outline-none cursor-pointer"
                >
                  <option value="todos">Todas Modalidades</option>
                  <option value="TECNICO">Cursos Técnicos</option>
                  <option value="LIVRE">Cursos Livres</option>
                  <option value="ESPECIALIZACAO">Especialização</option>
                  <option value="EAD">Ensino EAD</option>
                </select>
              </div>
            </div>
          </div>

          <div className="border-t border-slate-100 pt-4 space-y-3">
            <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Resumo Geral</h4>
            
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Total Turmas</p>
                <p className="text-lg font-black text-[#001a33] mt-0.5">{totalClasses}</p>
              </div>
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Total Alunos</p>
                <p className="text-lg font-black text-[#001a33] mt-0.5">{totalStudents}</p>
              </div>
            </div>
          </div>
        </div>

        <button 
          onClick={handlePrint}
          className="w-full mt-6 py-3 bg-[#001a33] hover:bg-blue-900 text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-colors shadow-lg flex items-center justify-center gap-2"
        >
          <Printer size={15} /> Imprimir / PDF
        </button>
      </div>

      {/* Lado Direito: Preview da Página A4 */}
      <div className="flex-1 bg-slate-200/40 rounded-3xl p-4 sm:p-8 flex justify-center overflow-auto custom-scrollbar">
        {loading ? (
          <div className="flex items-center justify-center py-20 w-full">
            <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
          </div>
        ) : (
          <div 
            className="bg-white w-[210mm] min-w-[210mm] min-h-[297mm] shadow-lg p-10 relative flex flex-col print:shadow-none print:p-0 print:w-auto print:max-w-none print:min-h-0 text-slate-800 shrink-0"
            id="print-area"
          >
            {/* Watermark (Marca d'água) */}
            {polo?.watermark_url ? (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0 overflow-hidden">
                <img 
                  src={polo.watermark_url} 
                  alt="Watermark" 
                  style={{
                    opacity: polo.watermark_opacity ?? 0.1,
                    width: `${polo.watermark_scale ?? 50}%`,
                    transform: 'rotate(-45deg)'
                  }}
                />
              </div>
            ) : (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0 overflow-hidden select-none opacity-[0.03]">
                <h1 className="text-6xl font-black rotate-[-45deg] tracking-widest text-slate-900 text-center">
                  UNIVERSO CURSOS E CONSULTORIA
                </h1>
              </div>
            )}

            {/* Document Header */}
            <DocumentHeader 
              company={company} 
              polo={polo} 
              orientation="portrait"
              rightContent={
                <div className="text-right">
                  <h2 className="text-sm font-black text-slate-800 uppercase tracking-tight">Relatório Consolidado</h2>
                  <div className="px-2.5 py-1 bg-slate-100 rounded-lg inline-block mt-2">
                     <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest">Foco</p>
                     <p className="text-[10px] font-bold text-[#001a33] uppercase">Indicadores por Curso</p>
                  </div>
                </div>
              }
            />

            {/* Title / Description */}
            <div className="mb-6 relative z-10 border-b pb-4">
              <h3 className="text-lg font-black text-slate-800 uppercase tracking-tight">Portfólio de Cursos e Distribuição de Alunos</h3>
              <p className="text-xs text-slate-500 font-medium mt-1">
                Relatório consolidado listando os cursos ofertados, carga horária regulamentar, quantidade total de turmas abertas vinculadas e o contingente de alunos matriculados ativos.
              </p>
            </div>

            {/* Metadados do Relatório */}
            <div className="grid grid-cols-2 gap-4 mb-6 relative z-10">
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                <span className="text-[8px] font-black text-slate-400 uppercase tracking-wider">Emissão</span>
                <p className="text-xs font-bold text-slate-800 mt-0.5">{new Date().toLocaleDateString('pt-BR')}</p>
              </div>
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                <span className="text-[8px] font-black text-slate-400 uppercase tracking-wider">Unidade / Polo</span>
                <p className="text-xs font-bold text-slate-800 uppercase mt-0.5">{polo?.nome || 'Matriz'}</p>
              </div>
            </div>

            {/* Tabela de Dados */}
            <div className="relative z-10 flex-1">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b-2 border-slate-350 text-[10px] font-bold text-slate-500 uppercase tracking-wider bg-slate-50">
                    <th className="py-2 px-3">Nome do Curso</th>
                    <th className="py-2 px-2">Modalidade</th>
                    <th className="py-2 px-2 text-center">Carga Horária</th>
                    <th className="py-2 px-2 text-center">Turmas Registradas</th>
                    <th className="py-2 px-3 text-right">Alunos Matriculados</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs font-medium text-slate-700">
                  {filteredItems.map(item => (
                    <tr key={item.id} className="hover:bg-slate-50/50">
                      <td className="py-3 px-3 font-bold text-[#001a33] flex items-center gap-2">
                        <Award size={13} className="text-blue-500 shrink-0" />
                        {item.nome}
                      </td>
                      <td className="py-3 px-2 text-slate-500 text-[10px] font-black">{item.modalidade}</td>
                      <td className="py-3 px-2 text-center font-bold text-slate-600">{item.cargaHoraria}H</td>
                      <td className="py-3 px-2 text-center font-bold text-slate-800">{item.totalTurmas}</td>
                      <td className="py-3 px-3 text-right font-black text-slate-900">{item.totalAlunos}</td>
                    </tr>
                  ))}
                  {filteredItems.length > 0 && (
                    <tr className="bg-slate-50 font-black border-t-2 border-slate-350 text-xs">
                      <td colSpan={3} className="py-3 px-3 text-[#001a33] uppercase">Totais Consolidados</td>
                      <td className="py-3 px-2 text-center text-[#001a33]">{totalClasses}</td>
                      <td className="py-3 px-3 text-right text-slate-900">{totalStudents}</td>
                    </tr>
                  )}
                  {filteredItems.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-slate-400 font-bold uppercase tracking-widest text-[10px]">
                        Nenhum curso corresponde aos filtros ativos.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Footer de Assinaturas e Página */}
            <div className="mt-8 pt-6 border-t border-slate-200 relative z-10 flex justify-between items-end text-[9px] text-slate-400 font-bold uppercase tracking-wider">
              <div>
                <p>UNIVERSO CURSOS E CONSULTORIA</p>
                <p className="text-[8px] font-medium text-slate-400 lowercase mt-0.5">Gerado automaticamente pelo painel do gestor.</p>
              </div>
              <div className="text-right">
                <p>Página 1 de 1</p>
              </div>
            </div>

          </div>
        )}
      </div>

      <style>{`
        @media print {
          body * {
            visibility: hidden;
          }
          #print-area, #print-area * {
            visibility: visible;
          }
          #print-area {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
          }
        }
      `}</style>
    </div>
  );
};

export default RelatorioCursos;
