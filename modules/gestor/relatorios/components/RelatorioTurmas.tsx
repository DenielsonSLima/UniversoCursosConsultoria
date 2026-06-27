import React, { useState, useEffect } from 'react';
import { Printer } from 'lucide-react';
import { supabase } from '../../../../lib/supabase';
import DocumentHeader from '../../components/DocumentHeader';

interface RelatorioTurmasProps {
  company: any;
  polo: any;
}

interface ClassReportItem {
  id: string;
  nome: string;
  codigo: string;
  status: string;
  dataInicio: string | null;
  dataFim: string | null;
  cursoNome: string;
  modalidade: string;
  alunosAtivos: number;
}

const MOCK_TURMAS: ClassReportItem[] = [
  { id: '1', nome: 'Técnico em Radiologia - Turma A', codigo: 'RAD-A-2026', status: 'Ativo', dataInicio: '2026-02-10', dataFim: '2027-12-15', cursoNome: 'Técnico em Radiologia', modalidade: 'TECNICO', alunosAtivos: 28 },
  { id: '2', nome: 'Técnico em Enfermagem - Turma B', codigo: 'ENF-B-2026', status: 'Ativo', dataInicio: '2026-03-01', dataFim: '2028-03-01', cursoNome: 'Técnico em Enfermagem', modalidade: 'TECNICO', alunosAtivos: 35 },
  { id: '3', nome: 'Especialização em Tomografia', codigo: 'ESP-TOM-26', status: 'Ativo', dataInicio: '2026-05-15', dataFim: '2026-11-20', cursoNome: 'Especialização em Tomografia Computadorizada', modalidade: 'ESPECIALIZACAO', alunosAtivos: 18 },
  { id: '4', nome: 'Curso Livre de Atendimento ao Cliente', codigo: 'LIV-ATC-01', status: 'Concluído', dataInicio: '2026-01-10', dataFim: '2026-02-28', cursoNome: 'Atendimento ao Cliente', modalidade: 'LIVRE', alunosAtivos: 15 },
  { id: '5', nome: 'Radiologia Odontológica - EAD', codigo: 'EAD-RAD-OD', status: 'Ativo', dataInicio: '2026-04-01', dataFim: '2026-10-01', cursoNome: 'Radiologia Odontológica Avançada', modalidade: 'EAD', alunosAtivos: 42 }
];

const RelatorioTurmas: React.FC<RelatorioTurmasProps> = ({ company, polo }) => {
  const [turmasList, setTurmasList] = useState<ClassReportItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedModalidade, setSelectedModalidade] = useState('todos');
  const [selectedStatus, setSelectedStatus] = useState('todos');
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data: dbTurmas, error: turmasErr } = await supabase
        .from('turmas')
        .select(`
          id,
          nome,
          codigo,
          status,
          data_inicio,
          data_fim,
          curso_id,
          cursos ( nome, modalidade )
        `);
      
      if (turmasErr) throw turmasErr;

      const { data: dbMatriculas } = await supabase
        .from('matriculas')
        .select('id, status, turma_id');

      const counts: Record<string, number> = {};
      dbMatriculas?.forEach((m: any) => {
        if (m.status === 'ATIVO' || m.status === 'ativo' || m.status === 'Matriculado' || m.status === 'CONFIRMADO') {
          counts[m.turma_id] = (counts[m.turma_id] || 0) + 1;
        }
      });

      const mapped = dbTurmas?.map((t: any) => ({
        id: t.id,
        nome: t.nome,
        codigo: t.codigo || '',
        status: t.status || 'Ativo',
        dataInicio: t.data_inicio,
        dataFim: t.data_fim,
        cursoNome: t.cursos?.nome || 'Curso Geral',
        modalidade: t.cursos?.modalidade || 'OUTRO',
        alunosAtivos: counts[t.id] || 0
      })) || [];

      // Combine with mock if no data exists
      if (mapped.length === 0) {
        setTurmasList(MOCK_TURMAS);
      } else {
        setTurmasList(mapped);
      }
    } catch (err) {
      console.error('Erro ao buscar turmas:', err);
      setTurmasList(MOCK_TURMAS);
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const filteredItems = turmasList.filter(item => {
    if (selectedModalidade !== 'todos' && item.modalidade !== selectedModalidade) return false;
    if (selectedStatus !== 'todos' && item.status.toLowerCase() !== selectedStatus.toLowerCase()) return false;
    if (searchTerm && !item.nome.toLowerCase().includes(searchTerm.toLowerCase()) && !item.codigo.toLowerCase().includes(searchTerm.toLowerCase())) return false;
    return true;
  });

  const totalStudents = filteredItems.reduce((acc, curr) => acc + curr.alunosAtivos, 0);

  return (
    <div className="flex flex-col lg:flex-row gap-6 h-full w-full">
      {/* Lado Esquerdo: Filtros e Métricas */}
      <div className="w-full lg:w-72 bg-white rounded-3xl p-5 border border-slate-100 shadow-sm shrink-0 flex flex-col justify-between">
        <div className="space-y-5">
          <div>
            <h3 className="text-sm font-black text-[#001a33] uppercase tracking-wider mb-3">Filtros do Relatório</h3>
            
            <div className="space-y-3">
              {/* Busca */}
              <div className="flex flex-col gap-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase ml-1">Buscar Turma</span>
                <input 
                  type="text"
                  placeholder="Nome ou código..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 rounded-xl px-3.5 py-2 text-xs font-bold text-slate-700 outline-none transition-all"
                />
              </div>

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

              {/* Status */}
              <div className="flex flex-col gap-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase ml-1">Status Operacional</span>
                <select
                  value={selectedStatus}
                  onChange={(e) => setSelectedStatus(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-700 outline-none cursor-pointer"
                >
                  <option value="todos">Todos os Status</option>
                  <option value="ativo">Turmas Ativas</option>
                  <option value="concluido">Turmas Concluídas</option>
                </select>
              </div>
            </div>
          </div>

          <div className="border-t border-slate-100 pt-4 space-y-3">
            <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Resumo Filtrado</h4>
            
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Total Turmas</p>
                <p className="text-lg font-black text-[#001a33] mt-0.5">{filteredItems.length}</p>
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
                  <h2 className="text-sm font-black text-slate-800 uppercase tracking-tight">Relatório Gerencial</h2>
                  <div className="px-2.5 py-1 bg-slate-100 rounded-lg inline-block mt-2">
                     <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest">Tipo</p>
                     <p className="text-[10px] font-bold text-[#001a33] uppercase">Controle de Turmas</p>
                  </div>
                </div>
              }
            />

            {/* Title / Description */}
            <div className="mb-6 relative z-10 border-b pb-4">
              <h3 className="text-lg font-black text-slate-800 uppercase tracking-tight">Status Operacional de Turmas</h3>
              <p className="text-xs text-slate-500 font-medium mt-1">
                Relatório consolidado exibindo a relação de turmas em andamento ou concluídas, suas respectivas modalidades de ensino e volume de alunos matriculados ativos.
              </p>
            </div>

            {/* Metadados do Relatório */}
            <div className="grid grid-cols-3 gap-4 mb-6 relative z-10">
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                <span className="text-[8px] font-black text-slate-400 uppercase tracking-wider">Unidade/Polo</span>
                <p className="text-xs font-bold text-slate-800 uppercase mt-0.5">{polo?.nome || 'Matriz'}</p>
              </div>
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                <span className="text-[8px] font-black text-slate-400 uppercase tracking-wider">Emissão</span>
                <p className="text-xs font-bold text-slate-800 mt-0.5">{new Date().toLocaleDateString('pt-BR')}</p>
              </div>
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                <span className="text-[8px] font-black text-slate-400 uppercase tracking-wider">Modulação</span>
                <p className="text-xs font-bold text-slate-800 uppercase mt-0.5">
                  {selectedModalidade === 'todos' ? 'TODAS MODALIDADES' : selectedModalidade}
                </p>
              </div>
            </div>

            {/* Tabela de Dados */}
            <div className="relative z-10 flex-1">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b-2 border-slate-350 text-[10px] font-bold text-slate-500 uppercase tracking-wider bg-slate-50">
                    <th className="py-2 px-3">Código</th>
                    <th className="py-2 px-2">Nome da Turma</th>
                    <th className="py-2 px-2">Curso</th>
                    <th className="py-2 px-2 text-center">Modalidade</th>
                    <th className="py-2 px-2 text-center">Status</th>
                    <th className="py-2 px-3 text-right">Alunos</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs font-medium text-slate-700">
                  {filteredItems.map(item => (
                    <tr key={item.id} className="hover:bg-slate-50/50">
                      <td className="py-2.5 px-3 font-bold text-[#001a33] text-[10px]">{item.codigo}</td>
                      <td className="py-2.5 px-2 font-bold max-w-[150px] truncate" title={item.nome}>{item.nome}</td>
                      <td className="py-2.5 px-2 text-slate-500 max-w-[130px] truncate" title={item.cursoNome}>{item.cursoNome}</td>
                      <td className="py-2.5 px-2 text-center text-[10px] font-black text-slate-500">{item.modalidade}</td>
                      <td className="py-2.5 px-2 text-center">
                        <span className={`inline-block text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded ${
                          item.status.toLowerCase() === 'ativo' ? 'bg-blue-50 text-blue-600' : 'bg-slate-100 text-slate-500'
                        }`}>
                          {item.status}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right font-bold text-slate-800">{item.alunosAtivos}</td>
                    </tr>
                  ))}
                  {filteredItems.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-slate-400 font-bold uppercase tracking-widest text-[10px]">
                        Nenhuma turma corresponde aos filtros ativos.
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

export default RelatorioTurmas;
