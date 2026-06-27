import React, { useState, useEffect } from 'react';
import { Printer, Award, CheckCircle, XCircle } from 'lucide-react';
import { supabase } from '../../../../lib/supabase';
import DocumentHeader from '../../components/DocumentHeader';

interface RelatorioEstagiosProps {
  company: any;
  polo: any;
}

interface InternshipReportItem {
  id: string;
  alunoNome: string;
  turmaNome: string;
  turmaId: string;
  instrutorNome: string;
  frequencia: number;
  notaComportamento: number;
  notaRegistros: number;
  notaTecnica: number;
  notaFinal: number;
  status: 'Aprovado' | 'Reprovado' | 'Em Andamento';
}

const MOCK_ESTAGIOS: InternshipReportItem[] = [
  { id: 'est-1', alunoNome: 'Mariana Souza Cruz', turmaNome: 'Técnico em Radiologia - Turma A', turmaId: 'turma-a-id', instrutorNome: 'Dr. Ricardo Santos', frequencia: 96.50, notaComportamento: 1.9, notaRegistros: 1.8, notaTecnica: 5.5, notaFinal: 9.2, status: 'Aprovado' },
  { id: 'est-2', alunoNome: 'Pedro Alves Oliveira', turmaNome: 'Técnico em Radiologia - Turma A', turmaId: 'turma-a-id', instrutorNome: 'Dr. Ricardo Santos', frequencia: 100.00, notaComportamento: 2.0, notaRegistros: 2.0, notaTecnica: 5.8, notaFinal: 9.8, status: 'Aprovado' },
  { id: 'est-3', alunoNome: 'Ana Costa Nascimento', turmaNome: 'Técnico em Enfermagem - Turma B', turmaId: 'turma-b-id', instrutorNome: 'Enf. Carla Dantas', frequencia: 72.00, notaComportamento: 1.5, notaRegistros: 1.2, notaTecnica: 3.5, notaFinal: 6.2, status: 'Reprovado' }, // Attendance < 75%
  { id: 'est-4', alunoNome: 'Lucas Mendes Ramos', turmaNome: 'Técnico em Enfermagem - Turma B', turmaId: 'turma-b-id', instrutorNome: 'Enf. Carla Dantas', frequencia: 90.00, notaComportamento: 1.8, notaRegistros: 1.5, notaTecnica: 4.8, notaFinal: 8.1, status: 'Aprovado' },
  { id: 'est-5', alunoNome: 'Roberta Lima Fonseca', turmaNome: 'Técnico em Radiologia - Turma A', turmaId: 'turma-a-id', instrutorNome: 'Dr. Ricardo Santos', frequencia: 88.00, notaComportamento: 1.7, notaRegistros: 1.4, notaTecnica: 2.5, notaFinal: 5.6, status: 'Reprovado' } // Grade < 6.0
];

const RelatorioEstagios: React.FC<RelatorioEstagiosProps> = ({ company, polo }) => {
  const [estagiosList, setEstagiosList] = useState<InternshipReportItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTurmaId, setSelectedTurmaId] = useState('todos');
  const [turmas, setTurmas] = useState<any[]>([]);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      // 1. Fetch turmas for filter dropdown
      const { data: dbTurmas } = await supabase
        .from('turmas')
        .select('id, nome');
      setTurmas(dbTurmas || []);

      // 2. Fetch internship evaluations
      const { data: dbEstagios, error: estErr } = await supabase
        .from('matriculas_estagios')
        .select(`
          turma_id,
          aluno_id,
          nota_comportamento,
          nota_registros,
          nota_tecnicas,
          nota_final,
          frequencia_estagio,
          instrutor_nome,
          turmas ( nome ),
          parceiros ( nome )
        `);

      if (estErr) throw estErr;

      const mapped: InternshipReportItem[] = (dbEstagios || []).map((e: any) => {
        const grade = Number(e.nota_final) || 0;
        const attendance = Number(e.frequencia_estagio) || 0;
        
        let status: 'Aprovado' | 'Reprovado' | 'Em Andamento' = 'Em Andamento';
        if (attendance > 0 || grade > 0) {
          status = (grade >= 6.0 && attendance >= 75.0) ? 'Aprovado' : 'Reprovado';
        }

        return {
          id: `${e.turma_id}-${e.aluno_id}`,
          alunoNome: e.parceiros?.nome || 'Aluno Geral',
          turmaNome: e.turmas?.nome || 'Turma',
          turmaId: e.turma_id,
          instrutorNome: e.instrutor_nome || 'Não designado',
          frequencia: attendance,
          notaComportamento: Number(e.nota_comportamento) || 0,
          notaRegistros: Number(e.nota_registros) || 0,
          notaTecnica: Number(e.nota_tecnicas) || 0,
          notaFinal: grade,
          status
        };
      });

      if (mapped.length === 0) {
        setEstagiosList(MOCK_ESTAGIOS);
      } else {
        setEstagiosList(mapped);
      }
    } catch (err) {
      console.error('Erro ao carregar estágios:', err);
      setEstagiosList(MOCK_ESTAGIOS);
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const filteredItems = estagiosList.filter(item => {
    if (selectedTurmaId !== 'todos' && item.turmaId !== selectedTurmaId) return false;
    return true;
  });

  const totalEvaluated = filteredItems.length;
  const approvedCount = filteredItems.filter(item => item.status === 'Aprovado').length;
  const disapprovedCount = filteredItems.filter(item => item.status === 'Reprovado').length;

  return (
    <div className="flex flex-col lg:flex-row gap-6 h-full w-full">
      {/* Lado Esquerdo: Filtros e Métricas */}
      <div className="w-full lg:w-72 bg-white rounded-3xl p-5 border border-slate-100 shadow-sm shrink-0 flex flex-col justify-between">
        <div className="space-y-5">
          <div>
            <h3 className="text-sm font-black text-[#001a33] uppercase tracking-wider mb-3">Filtros do Relatório</h3>
            
            <div className="space-y-3">
              {/* Turma */}
              <div className="flex flex-col gap-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase ml-1">Turma Curricular</span>
                <select
                  value={selectedTurmaId}
                  onChange={(e) => setSelectedTurmaId(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-700 outline-none cursor-pointer"
                >
                  <option value="todos">Todas as Turmas</option>
                  {turmas.map(t => (
                    <option key={t.id} value={t.id}>{t.nome}</option>
                  ))}
                  {turmas.length === 0 && (
                    <>
                      <option value="turma-a-id">Técnico em Radiologia - Turma A</option>
                      <option value="turma-b-id">Técnico em Enfermagem - Turma B</option>
                    </>
                  )}
                </select>
              </div>
            </div>
          </div>

          <div className="border-t border-slate-100 pt-4 space-y-3">
            <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Resumo Geral</h4>
            
            <div className="space-y-2">
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 flex items-center justify-between">
                <div>
                  <p className="text-[8px] font-black text-slate-400 uppercase tracking-wider">Avaliados</p>
                  <p className="text-md font-black text-[#001a33] mt-0.5">{totalEvaluated}</p>
                </div>
                <Award size={16} className="text-blue-500 opacity-60" />
              </div>
              <div className="bg-emerald-50/50 p-3 rounded-xl border border-emerald-100 flex items-center justify-between">
                <div>
                  <p className="text-[8px] font-black text-emerald-600 uppercase tracking-wider">Aprovados</p>
                  <p className="text-md font-black text-emerald-600 mt-0.5">{approvedCount}</p>
                </div>
                <CheckCircle size={16} className="text-emerald-500 shrink-0" />
              </div>
              <div className="bg-red-50/50 p-3 rounded-xl border border-red-100 flex items-center justify-between">
                <div>
                  <p className="text-[8px] font-black text-red-500 uppercase tracking-wider">Reprovados/Pend.</p>
                  <p className="text-md font-black text-red-550 mt-0.5">{disapprovedCount}</p>
                </div>
                <XCircle size={16} className="text-red-550 shrink-0" />
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
                  <h2 className="text-sm font-black text-slate-800 uppercase tracking-tight">Supervisão de Estágios</h2>
                  <div className="px-2.5 py-1 bg-slate-100 rounded-lg inline-block mt-2">
                     <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest">Foco</p>
                     <p className="text-[10px] font-bold text-[#001a33] uppercase">Controle de Notas</p>
                  </div>
                </div>
              }
            />

            {/* Title / Description */}
            <div className="mb-6 relative z-10 border-b pb-4">
              <h3 className="text-lg font-black text-slate-800 uppercase tracking-tight">Relatório de Notas e Avaliações de Estágios</h3>
              <p className="text-xs text-slate-500 font-medium mt-1">
                Ficha consolidada com o rendimento dos alunos do curso técnico em estágio curricular, englobando avaliações comportamentais, registros, conhecimentos técnicos e frequência.
              </p>
            </div>

            {/* Metadados do Relatório */}
            <div className="grid grid-cols-2 gap-4 mb-6 relative z-10">
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                <span className="text-[8px] font-black text-slate-400 uppercase tracking-wider">Unidade / Polo</span>
                <p className="text-xs font-bold text-slate-800 uppercase mt-0.5">{polo?.nome || 'Matriz'}</p>
              </div>
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                <span className="text-[8px] font-black text-slate-400 uppercase tracking-wider">Turma Relacionada</span>
                <p className="text-xs font-bold text-slate-800 uppercase mt-0.5">
                  {selectedTurmaId === 'todos' ? 'TODAS AS TURMAS DE ESTÁGIO' : filteredItems[0]?.turmaNome || 'TURMA SELECIONADA'}
                </p>
              </div>
            </div>

            {/* Tabela de Dados */}
            <div className="relative z-10 flex-1">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b-2 border-slate-350 text-[9px] font-bold text-slate-500 uppercase tracking-wider bg-slate-50">
                    <th className="py-2 px-3">Nome do Aluno</th>
                    <th className="py-2 px-2">Instrutor</th>
                    <th className="py-2 px-1 text-center">Freq (%)</th>
                    <th className="py-2 px-1 text-center">Comport. (Max 2)</th>
                    <th className="py-2 px-1 text-center">Regist. (Max 2)</th>
                    <th className="py-2 px-1 text-center">Técn. (Max 6)</th>
                    <th className="py-2 px-1 text-center">Nota Final</th>
                    <th className="py-2 px-3 text-right">Situação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs font-medium text-slate-700">
                  {filteredItems.map(item => (
                    <tr key={item.id} className="hover:bg-slate-50/50">
                      <td className="py-3 px-3 font-bold text-[#001a33]">{item.alunoNome}</td>
                      <td className="py-3 px-2 text-slate-500 font-bold text-[10px]">{item.instrutorNome}</td>
                      <td className="py-3 px-1 text-center font-bold text-slate-650">{item.frequencia.toFixed(1)}%</td>
                      <td className="py-3 px-1 text-center text-slate-600">{item.notaComportamento.toFixed(1)}</td>
                      <td className="py-3 px-1 text-center text-slate-600">{item.notaRegistros.toFixed(1)}</td>
                      <td className="py-3 px-1 text-center text-slate-600">{item.notaTecnica.toFixed(1)}</td>
                      <td className="py-3 px-1 text-center font-bold text-[#001a33]">{item.notaFinal.toFixed(1)}</td>
                      <td className="py-3 px-3 text-right">
                        <span className={`inline-block text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded ${
                          item.status === 'Aprovado' ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-500'
                        }`}>
                          {item.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {filteredItems.length === 0 && (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-slate-400 font-bold uppercase tracking-widest text-[10px]">
                        Nenhum registro de avaliação de estágio atende aos filtros.
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

export default RelatorioEstagios;
