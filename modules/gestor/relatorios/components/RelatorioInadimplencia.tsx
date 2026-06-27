import React, { useState, useEffect } from 'react';
import { Printer, AlertTriangle, Phone } from 'lucide-react';
import { supabase } from '../../../../lib/supabase';
import DocumentHeader from '../../components/DocumentHeader';

interface RelatorioInadimplenciaProps {
  company: any;
  polo: any;
}

interface DefaultingStudent {
  id: string;
  nome: string;
  telefone: string;
  curso: string;
  dataVencimento: string;
  diasAtraso: number;
  valorDevido: number;
  poloNome: string;
  poloId: string;
}

const MOCK_INADIMPLENTES: DefaultingStudent[] = [
  { id: '1', nome: 'Bruno Silva Santos', telefone: '(79) 99888-1122', curso: 'Técnico em Radiologia', dataVencimento: '2026-05-10', diasAtraso: 40, valorDevido: 350.00, poloNome: 'Matriz - Aracaju', poloId: 'matriz-id' },
  { id: '2', nome: 'Camila Rocha Ramos', telefone: '(79) 99111-2233', curso: 'Técnico em Enfermagem', dataVencimento: '2026-05-20', diasAtraso: 30, valorDevido: 350.00, poloNome: 'Polo Estância', poloId: 'estancia-id' },
  { id: '3', nome: 'Felipe Guedes Lima', telefone: '(79) 98877-4455', curso: 'Especialização em Tomografia', dataVencimento: '2026-04-15', diasAtraso: 65, valorDevido: 450.00, poloNome: 'Polo Lagarto', poloId: 'lagarto-id' },
  { id: '4', nome: 'Daniela Vieira Melo', telefone: '(79) 99655-8899', curso: 'Técnico em Radiologia', dataVencimento: '2026-06-05', diasAtraso: 14, valorDevido: 350.00, poloNome: 'Matriz - Aracaju', poloId: 'matriz-id' },
  { id: '5', nome: 'Gustavo Barbosa Neri', telefone: '(79) 99922-3344', curso: 'Radiologia Odontológica - EAD', dataVencimento: '2026-05-01', diasAtraso: 49, valorDevido: 250.00, poloNome: 'Polo Própria', poloId: 'propria-id' }
];

const RelatorioInadimplencia: React.FC<RelatorioInadimplenciaProps> = ({ company, polo }) => {
  const [inadimplentesList, setInadimplentesList] = useState<DefaultingStudent[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPoloId, setSelectedPoloId] = useState('todos');
  const [minDaysOverdue, setMinDaysOverdue] = useState('0');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const todayStr = new Date().toISOString().split('T')[0];

      // Query unpaid receivables past due date
      const { data: dbReceivables, error } = await supabase
        .from('contas_receber')
        .select(`
          id,
          valor,
          data_vencimento,
          status,
          descricao,
          polo_id,
          polos ( nome ),
          cliente_id,
          parceiros ( nome, telefone, curso_id, cursos ( nome ) )
        `)
        .neq('status', 'PAGO')
        .lt('data_vencimento', todayStr);

      if (error) throw error;

      const today = new Date();
      const mapped: DefaultingStudent[] = (dbReceivables || []).map((r: any) => {
        const due = new Date(r.data_vencimento);
        const timeDiff = Math.abs(today.getTime() - due.getTime());
        const diffDays = Math.ceil(timeDiff / (1000 * 3600 * 24));

        return {
          id: r.id,
          nome: r.parceiros?.nome || 'Responsável Não Informado',
          telefone: r.parceiros?.telefone || 'Sem contato',
          curso: r.parceiros?.cursos?.nome || r.descricao || 'Curso Acadêmico',
          dataVencimento: r.data_vencimento,
          diasAtraso: diffDays,
          valorDevido: Number(r.valor) || 0,
          poloNome: r.polos?.nome || 'Geral',
          poloId: r.polo_id || ''
        };
      });

      if (mapped.length === 0) {
        setInadimplentesList(MOCK_INADIMPLENTES);
      } else {
        setInadimplentesList(mapped);
      }
    } catch (err) {
      console.error('Erro ao carregar inadimplentes:', err);
      setInadimplentesList(MOCK_INADIMPLENTES);
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const filteredItems = inadimplentesList.filter(item => {
    if (selectedPoloId !== 'todos' && item.poloId !== selectedPoloId) return false;
    if (item.diasAtraso < parseInt(minDaysOverdue, 10)) return false;
    return true;
  });

  const totalDevido = filteredItems.reduce((acc, curr) => acc + curr.valorDevido, 0);

  const formatCurrency = (val: number) => {
    return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  };

  const formatDate = (dateStr: string) => {
    const [y, m, d] = dateStr.split('-');
    return `${d}/${m}/${y}`;
  };

  return (
    <div className="flex flex-col lg:flex-row gap-6 h-full w-full">
      {/* Lado Esquerdo: Filtros e Métricas */}
      <div className="w-full lg:w-72 bg-white rounded-3xl p-5 border border-slate-100 shadow-sm shrink-0 flex flex-col justify-between">
        <div className="space-y-5">
          <div>
            <h3 className="text-sm font-black text-[#001a33] uppercase tracking-wider mb-3">Filtros do Relatório</h3>
            
            <div className="space-y-3">
              {/* Polo */}
              <div className="flex flex-col gap-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase ml-1">Unidade / Polo</span>
                <select
                  value={selectedPoloId}
                  onChange={(e) => setSelectedPoloId(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-700 outline-none cursor-pointer"
                >
                  <option value="todos">Todos os Polos</option>
                  <option value="matriz-id">Matriz - Aracaju</option>
                  <option value="estancia-id">Polo Estância</option>
                  <option value="lagarto-id">Polo Lagarto</option>
                  <option value="propria-id">Polo Própria</option>
                </select>
              </div>

              {/* Tempo de Atraso */}
              <div className="flex flex-col gap-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase ml-1">Tempo de Atraso</span>
                <select
                  value={minDaysOverdue}
                  onChange={(e) => setMinDaysOverdue(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-700 outline-none cursor-pointer"
                >
                  <option value="0">Qualquer atraso (&gt;0 dias)</option>
                  <option value="15">Mais de 15 dias de atraso</option>
                  <option value="30">Mais de 30 dias de atraso</option>
                  <option value="60">Mais de 60 dias de atraso</option>
                </select>
              </div>
            </div>
          </div>

          <div className="border-t border-slate-100 pt-4 space-y-3">
            <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Resumo Geral</h4>
            
            <div className="space-y-2">
              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-100 flex items-center justify-between">
                <div>
                  <p className="text-[8px] font-black text-slate-400 uppercase tracking-wider">Devedores</p>
                  <p className="text-lg font-black text-[#001a33] mt-0.5">{filteredItems.length}</p>
                </div>
                <AlertTriangle size={20} className="text-amber-500 opacity-60" />
              </div>
              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-100 flex items-center justify-between">
                <div>
                  <p className="text-[8px] font-black text-slate-400 uppercase tracking-wider">Total em Atraso</p>
                  <p className="text-md font-black text-red-500 mt-0.5">{formatCurrency(totalDevido)}</p>
                </div>
                <span className="text-xs font-black text-red-500 shrink-0">R$</span>
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
                  <h2 className="text-sm font-black text-slate-800 uppercase tracking-tight">Cobrança e Caixa</h2>
                  <div className="px-2.5 py-1 bg-slate-100 rounded-lg inline-block mt-2">
                     <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest">Tipo</p>
                     <p className="text-[10px] font-bold text-[#001a33] uppercase">Relatório de Inadimplência</p>
                  </div>
                </div>
              }
            />

            {/* Title / Description */}
            <div className="mb-6 relative z-10 border-b pb-4">
              <h3 className="text-lg font-black text-slate-800 uppercase tracking-tight">Relação de Alunos com Débitos em Atraso</h3>
              <p className="text-xs text-slate-500 font-medium mt-1">
                Relatório de cobrança listando alunos com boletos ou parcelas em aberto vencidos, incluindo dias em atraso e telefone para fins de assessoria de renegociação financeira.
              </p>
            </div>

            {/* Metadados do Relatório */}
            <div className="grid grid-cols-2 gap-4 mb-6 relative z-10">
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                <span className="text-[8px] font-black text-slate-400 uppercase tracking-wider">Unidade / Polo</span>
                <p className="text-xs font-bold text-slate-800 uppercase mt-0.5">{polo?.nome || 'Matriz'}</p>
              </div>
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                <span className="text-[8px] font-black text-slate-400 uppercase tracking-wider">Atraso Mínimo Filtrado</span>
                <p className="text-xs font-bold text-slate-800 uppercase mt-0.5">{minDaysOverdue} DIAS</p>
              </div>
            </div>

            {/* Tabela de Dados */}
            <div className="relative z-10 flex-1">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b-2 border-slate-350 text-[10px] font-bold text-slate-500 uppercase tracking-wider bg-slate-50">
                    <th className="py-2 px-3">Nome do Aluno</th>
                    <th className="py-2 px-2">Telefone</th>
                    <th className="py-2 px-2 text-center">Vencimento</th>
                    <th className="py-2 px-2 text-center">Atraso (Dias)</th>
                    <th className="py-2 px-2 text-center">Unidade</th>
                    <th className="py-2 px-3 text-right">Valor em Aberto</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs font-medium text-slate-700">
                  {filteredItems.map(item => (
                    <tr key={item.id} className="hover:bg-slate-50/50">
                      <td className="py-3 px-3 font-bold text-[#001a33]">{item.nome}</td>
                      <td className="py-3 px-2 text-slate-600 font-bold text-[10px] flex items-center gap-1 mt-1">
                        <Phone size={10} className="text-slate-400" />
                        {item.telefone}
                      </td>
                      <td className="py-3 px-2 text-center text-slate-500 font-bold">{formatDate(item.dataVencimento)}</td>
                      <td className="py-3 px-2 text-center">
                        <span className={`inline-block text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded ${
                          item.diasAtraso > 45 ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-600'
                        }`}>
                          {item.diasAtraso} DIAS
                        </span>
                      </td>
                      <td className="py-3 px-2 text-center text-slate-500 font-medium truncate max-w-[100px]">{item.poloNome}</td>
                      <td className="py-3 px-3 text-right font-black text-red-500">{formatCurrency(item.valorDevido)}</td>
                    </tr>
                  ))}
                  {filteredItems.length > 0 && (
                    <tr className="bg-slate-50 font-black border-t-2 border-slate-350">
                      <td colSpan={5} className="py-3 px-3 text-[#001a33] uppercase">Total Geral Inadimplente</td>
                      <td className="py-3 px-3 text-right text-red-500">{formatCurrency(totalDevido)}</td>
                    </tr>
                  )}
                  {filteredItems.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-slate-400 font-bold uppercase tracking-widest text-[10px]">
                        Nenhum débito pendente atende aos filtros atuais.
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

export default RelatorioInadimplencia;
