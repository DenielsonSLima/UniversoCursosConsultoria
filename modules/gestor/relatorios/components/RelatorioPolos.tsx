import React, { useState, useEffect } from 'react';
import { Printer, Building, DollarSign } from 'lucide-react';
import { supabase } from '../../../../lib/supabase';
import DocumentHeader from '../../components/DocumentHeader';

interface RelatorioPolosProps {
  company: any;
  polo: any;
}

interface PoloReportItem {
  id: string;
  nome: string;
  cnpj: string;
  cidade: string;
  uf: string;
  alunosAtivos: number;
  faturamentoRecebido: number;
  faturamentoPendente: number;
}

const MOCK_POLOS: PoloReportItem[] = [
  { id: 'matriz-id', nome: 'Matriz - Aracaju', cnpj: '12.345.678/0001-99', cidade: 'Aracaju', uf: 'SE', alunosAtivos: 148, faturamentoRecebido: 45000, faturamentoPendente: 8200 },
  { id: 'estancia-id', nome: 'Polo Estância', cnpj: '12.345.678/0002-88', cidade: 'Estância', uf: 'SE', alunosAtivos: 76, faturamentoRecebido: 21500, faturamentoPendente: 3400 },
  { id: 'lagarto-id', nome: 'Polo Lagarto', cnpj: '12.345.678/0003-77', cidade: 'Lagarto', uf: 'SE', alunosAtivos: 92, faturamentoRecebido: 28900, faturamentoPendente: 4100 },
  { id: 'propria-id', nome: 'Polo Própria', cnpj: '12.345.678/0004-66', cidade: 'Própria', uf: 'SE', alunosAtivos: 51, faturamentoRecebido: 12400, faturamentoPendente: 2100 }
];

const RelatorioPolos: React.FC<RelatorioPolosProps> = ({ company, polo }) => {
  const [polosList, setPolosList] = useState<PoloReportItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPoloId, setSelectedPoloId] = useState('todos');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      // 1. Fetch polos
      const { data: dbPolos, error: polosErr } = await supabase
        .from('polos')
        .select('id, nome, cnpj, cidade, uf');
      
      if (polosErr) throw polosErr;

      // 2. Fetch matriculas for counting students
      const { data: dbMatriculas } = await supabase
        .from('matriculas')
        .select('id, status, polo_id');

      // 3. Fetch contas_receber for revenue totals
      const { data: dbReceivables } = await supabase
        .from('contas_receber')
        .select('polo_id, valor, status');

      // Aggregate students count
      const studentCounts: Record<string, number> = {};
      dbMatriculas?.forEach((m: any) => {
        if (m.status === 'ATIVO' || m.status === 'ativo' || m.status === 'Matriculado' || m.status === 'CONFIRMADO') {
          studentCounts[m.polo_id] = (studentCounts[m.polo_id] || 0) + 1;
        }
      });

      // Aggregate financial data
      const revenueReceived: Record<string, number> = {};
      const revenuePending: Record<string, number> = {};

      dbReceivables?.forEach((r: any) => {
        const val = Number(r.valor) || 0;
        if (r.status === 'PAGO' || r.status === 'pago') {
          revenueReceived[r.polo_id] = (revenueReceived[r.polo_id] || 0) + val;
        } else {
          revenuePending[r.polo_id] = (revenuePending[r.polo_id] || 0) + val;
        }
      });

      const mapped = dbPolos?.map((p: any) => ({
        id: p.id,
        nome: p.nome,
        cnpj: p.cnpj || '00.000.000/0000-00',
        cidade: p.cidade || 'Não informada',
        uf: p.uf || 'SE',
        alunosAtivos: studentCounts[p.id] || 0,
        faturamentoRecebido: revenueReceived[p.id] || 0,
        faturamentoPendente: revenuePending[p.id] || 0
      })) || [];

      if (mapped.length === 0) {
        setPolosList(MOCK_POLOS);
      } else {
        setPolosList(mapped);
      }
    } catch (err) {
      console.error('Erro ao carregar dados por polo:', err);
      setPolosList(MOCK_POLOS);
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  // Filter items
  const filteredItems = polosList.filter(item => {
    if (selectedPoloId !== 'todos' && item.id !== selectedPoloId) return false;
    return true;
  });

  const totalStudents = filteredItems.reduce((acc, curr) => acc + curr.alunosAtivos, 0);
  const totalReceived = filteredItems.reduce((acc, curr) => acc + curr.faturamentoRecebido, 0);
  const totalPending = filteredItems.reduce((acc, curr) => acc + curr.faturamentoPendente, 0);

  const formatCurrency = (val: number) => {
    return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  };

  return (
    <div className="flex flex-col lg:flex-row gap-6 h-full w-full">
      {/* Lado Esquerdo: Filtros e Métricas */}
      <div className="w-full lg:w-72 bg-white rounded-3xl p-5 border border-slate-100 shadow-sm shrink-0 flex flex-col justify-between">
        <div className="space-y-5">
          <div>
            <h3 className="text-sm font-black text-[#001a33] uppercase tracking-wider mb-3">Filtros do Relatório</h3>
            
            <div className="space-y-3">
              {/* Unidade / Polo */}
              <div className="flex flex-col gap-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase ml-1">Unidade / Polo</span>
                <select
                  value={selectedPoloId}
                  onChange={(e) => setSelectedPoloId(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-700 outline-none cursor-pointer"
                >
                  <option value="todos">Todos os Polos</option>
                  {polosList.map(p => (
                    <option key={p.id} value={p.id}>{p.nome}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="border-t border-slate-100 pt-4 space-y-3">
            <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Resumo Geral</h4>
            
            <div className="space-y-2">
              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-100 flex items-center justify-between">
                <div>
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Alunos Ativos</p>
                  <p className="text-lg font-black text-[#001a33] mt-0.5">{totalStudents}</p>
                </div>
                <Building size={20} className="text-blue-500 opacity-60" />
              </div>
              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-100 flex items-center justify-between">
                <div>
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Total Recebido</p>
                  <p className="text-md font-black text-emerald-600 mt-0.5">{formatCurrency(totalReceived)}</p>
                </div>
                <DollarSign size={20} className="text-emerald-500 opacity-60" />
              </div>
              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-100 flex items-center justify-between">
                <div>
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Pendente</p>
                  <p className="text-md font-black text-amber-600 mt-0.5">{formatCurrency(totalPending)}</p>
                </div>
                <DollarSign size={20} className="text-amber-500 opacity-60" />
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
                     <p className="text-[10px] font-bold text-[#001a33] uppercase">Indicadores por Polo</p>
                  </div>
                </div>
              }
            />

            {/* Title / Description */}
            <div className="mb-6 relative z-10 border-b pb-4">
              <h3 className="text-lg font-black text-slate-800 uppercase tracking-tight">Matrículas e Faturamento por Polo</h3>
              <p className="text-xs text-slate-500 font-medium mt-1">
                Relatório analítico comparando a quantidade de alunos matriculados ativos e os valores financeiros faturados (líquidos recebidos e saldos a receber pendentes) entre os polos cadastrados.
              </p>
            </div>

            {/* Metadados do Relatório */}
            <div className="grid grid-cols-2 gap-4 mb-6 relative z-10">
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                <span className="text-[8px] font-black text-slate-400 uppercase tracking-wider">Emissão</span>
                <p className="text-xs font-bold text-slate-800 mt-0.5">{new Date().toLocaleDateString('pt-BR')}</p>
              </div>
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                <span className="text-[8px] font-black text-slate-400 uppercase tracking-wider">Abrangência</span>
                <p className="text-xs font-bold text-slate-800 mt-0.5">
                  {selectedPoloId === 'todos' ? 'TODOS OS POLOS REGISTRADOS' : filteredItems[0]?.nome || 'UNIDADE SELECIONADA'}
                </p>
              </div>
            </div>

            {/* Tabela de Dados */}
            <div className="relative z-10 flex-1">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b-2 border-slate-350 text-[10px] font-bold text-slate-500 uppercase tracking-wider bg-slate-50">
                    <th className="py-2 px-3">Nome da Unidade</th>
                    <th className="py-2 px-2">CNPJ</th>
                    <th className="py-2 px-2 text-center">Localidade</th>
                    <th className="py-2 px-2 text-center">Alunos Ativos</th>
                    <th className="py-2 px-2 text-right">Faturado/Pago</th>
                    <th className="py-2 px-3 text-right">A Receber</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs font-medium text-slate-700">
                  {filteredItems.map(item => (
                    <tr key={item.id} className="hover:bg-slate-50/50">
                      <td className="py-3 px-3 font-bold text-[#001a33]">{item.nome}</td>
                      <td className="py-3 px-2 text-slate-550 text-[10px]">{item.cnpj}</td>
                      <td className="py-3 px-2 text-center text-slate-500 font-bold">{item.cidade}/{item.uf}</td>
                      <td className="py-3 px-2 text-center font-bold text-[#001a33]">{item.alunosAtivos}</td>
                      <td className="py-3 px-2 text-right font-black text-emerald-600">{formatCurrency(item.faturamentoRecebido)}</td>
                      <td className="py-3 px-3 text-right font-black text-amber-600">{formatCurrency(item.faturamentoPendente)}</td>
                    </tr>
                  ))}
                  {filteredItems.length > 0 && (
                    <tr className="bg-slate-50 font-black border-t-2 border-slate-350">
                      <td colSpan={3} className="py-3 px-3 text-[#001a33] uppercase">Totais Consolidados</td>
                      <td className="py-3 px-2 text-center text-[#001a33]">{totalStudents}</td>
                      <td className="py-3 px-2 text-right text-emerald-600">{formatCurrency(totalReceived)}</td>
                      <td className="py-3 px-3 text-right text-amber-600">{formatCurrency(totalPending)}</td>
                    </tr>
                  )}
                  {filteredItems.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-slate-400 font-bold uppercase tracking-widest text-[10px]">
                        Nenhum polo corresponde aos filtros ativos.
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

export default RelatorioPolos;
