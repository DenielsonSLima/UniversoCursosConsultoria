
// File: modules/gestor/gestao/tecnicos/detalhes/components/financeiro/FinanceiroAlunosList.tsx

import React, { useState } from 'react';
import { Search, MoreHorizontal, CheckCircle2, AlertTriangle, XCircle, FileText, Download } from 'lucide-react';

const FinanceiroAlunosList: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('');

  // Mock de Alunos
  const alunos = [
    { id: 1, nome: 'Ana Clara Souza', matricula: '2024001', status: 'em_dia', parcelasPagas: 5, totalParcelas: 24 },
    { id: 2, nome: 'João Pedro Alves', matricula: '2024002', status: 'atrasado', parcelasPagas: 3, totalParcelas: 24 },
    { id: 3, nome: 'Maria Eduarda Costa', matricula: '2024003', status: 'em_dia', parcelasPagas: 5, totalParcelas: 24 },
    { id: 4, nome: 'Lucas Oliveira', matricula: '2024004', status: 'inadimplente', parcelasPagas: 1, totalParcelas: 24 },
    { id: 5, nome: 'Fernanda Lima', matricula: '2024005', status: 'em_dia', parcelasPagas: 5, totalParcelas: 24 },
  ];

  const filteredAlunos = alunos.filter(a => 
    a.nome.toLowerCase().includes(searchTerm.toLowerCase()) || 
    a.matricula.includes(searchTerm)
  );

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'em_dia':
        return <span className="flex items-center gap-1 bg-emerald-100 text-emerald-700 px-2 py-1 rounded text-[10px] font-bold uppercase"><CheckCircle2 size={12} /> Em Dia</span>;
      case 'atrasado':
        return <span className="flex items-center gap-1 bg-amber-100 text-amber-700 px-2 py-1 rounded text-[10px] font-bold uppercase"><AlertTriangle size={12} /> Atrasado</span>;
      case 'inadimplente':
        return <span className="flex items-center gap-1 bg-red-100 text-red-700 px-2 py-1 rounded text-[10px] font-bold uppercase"><XCircle size={12} /> Inadimplente</span>;
      default:
        return null;
    }
  };

  return (
    <div className="bg-white rounded-[2rem] border border-slate-100 shadow-sm overflow-hidden animate-fadeIn">
      
      {/* Header da Lista */}
      <div className="p-6 border-b border-slate-100 flex flex-col md:flex-row justify-between items-center gap-4">
        <h3 className="text-lg font-bold text-[#001a33]">Situação Financeira dos Alunos</h3>
        
        <div className="flex gap-3 w-full md:w-auto">
          <div className="relative flex-1 md:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input 
              type="text" 
              placeholder="Buscar aluno..." 
              className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm outline-none focus:border-blue-500 transition-all text-slate-700"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <button className="flex items-center gap-2 px-4 py-2.5 bg-slate-100 text-slate-600 rounded-xl font-bold text-xs uppercase hover:bg-slate-200 transition-colors">
            <Download size={16} /> <span className="hidden md:inline">Exportar</span>
          </button>
        </div>
      </div>

      {/* Tabela */}
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead className="bg-slate-50 border-b border-slate-100">
            <tr>
              <th className="px-6 py-4 text-xs font-black text-slate-500 uppercase tracking-wider">Aluno</th>
              <th className="px-6 py-4 text-xs font-black text-slate-500 uppercase tracking-wider">Matrícula</th>
              <th className="px-6 py-4 text-xs font-black text-slate-500 uppercase tracking-wider">Progresso Pagto.</th>
              <th className="px-6 py-4 text-xs font-black text-slate-500 uppercase tracking-wider">Status</th>
              <th className="px-6 py-4 text-xs font-black text-slate-500 uppercase tracking-wider text-right">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {filteredAlunos.length === 0 ? (
                <tr>
                    <td colSpan={5} className="px-6 py-8 text-center text-slate-400 text-sm">
                        Nenhum aluno encontrado.
                    </td>
                </tr>
            ) : (
                filteredAlunos.map((aluno) => (
                <tr key={aluno.id} className="hover:bg-blue-50/30 transition-colors group">
                    <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-xs font-bold text-slate-500 border-2 border-white shadow-sm">
                        {aluno.nome.charAt(0)}
                        </div>
                        <span className="font-bold text-[#001a33] text-sm">{aluno.nome}</span>
                    </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-500 font-mono">{aluno.matricula}</td>
                    <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                            <div className="flex-1 h-2 w-24 bg-slate-100 rounded-full overflow-hidden">
                                <div 
                                    className={`h-full rounded-full ${aluno.status === 'inadimplente' ? 'bg-red-500' : 'bg-blue-500'}`} 
                                    style={{ width: `${(aluno.parcelasPagas / aluno.totalParcelas) * 100}%` }}
                                ></div>
                            </div>
                            <span className="text-[10px] font-bold text-slate-500">{aluno.parcelasPagas}/{aluno.totalParcelas}</span>
                        </div>
                    </td>
                    <td className="px-6 py-4">
                        {getStatusBadge(aluno.status)}
                    </td>
                    <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                        <button title="Extrato Financeiro" className="p-2 bg-blue-50 hover:bg-blue-100 text-blue-600 rounded-lg transition-colors border border-blue-100">
                            <FileText size={16} />
                        </button>
                        <button title="Mais opções" className="p-2 hover:bg-slate-100 text-slate-400 hover:text-slate-600 rounded-lg transition-colors border border-transparent hover:border-slate-200">
                            <MoreHorizontal size={16} />
                        </button>
                    </div>
                    </td>
                </tr>
                ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default FinanceiroAlunosList;
