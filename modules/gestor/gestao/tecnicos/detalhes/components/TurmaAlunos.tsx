
import React, { useState } from 'react';
import { Search, MoreHorizontal, FileText, DollarSign, UserX, UserPlus, X, CheckCircle2 } from 'lucide-react';

type StatusTurma = 'ATIVO' | 'DESISTENTE' | 'TRANCADO' | 'CONCLUÍDO';
type StatusFinanceiro = 'REGULAR' | 'INADIMPLENTE';

interface AlunoTurma {
  id: number;
  nome: string;
  matricula: string;
  cpf: string;
  dataNasc: string;
  statusFinanceiro: StatusFinanceiro;
  statusTurma: StatusTurma;
  frequencia: number;
}

// Mock de alunos não matriculados (para pesquisa)
const ALUNOS_DISPONIVEIS = [
  { id: 101, nome: 'João Pedro Silva', cpf: '123.456.789-00', dataNasc: '15/04/1998' },
  { id: 102, nome: 'Maria Clara Oliveira', cpf: '098.765.432-11', dataNasc: '22/07/2000' },
  { id: 103, nome: 'Marcos Vinícius Santos', cpf: '111.222.333-44', dataNasc: '10/11/1995' },
  { id: 104, nome: 'Ana Beatriz Souza', cpf: '555.666.777-88', dataNasc: '05/01/2002' },
];

const TurmaAlunos: React.FC = () => {
  const [showMatricularModal, setShowMatricularModal] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  
  // State for dummy action modal
  const [actionModal, setActionModal] = useState<{ isOpen: boolean; type: string; alunoName: string }>({ isOpen: false, type: '', alunoName: '' });
  
  // Mock de alunos na turma
  const [alunos, setAlunos] = useState<AlunoTurma[]>(Array.from({ length: 8 }).map((_, i) => ({
    id: i,
    nome: `Estudante Técnico ${i + 1}`,
    matricula: `2024.1.00${i}`,
    cpf: `000.000.000-0${i}`,
    dataNasc: `0${i+1}/08/2000`,
    statusFinanceiro: i === 2 ? 'INADIMPLENTE' : 'REGULAR',
    statusTurma: i === 4 ? 'DESISTENTE' : 'ATIVO',
    frequencia: 85 + i
  })));

  const handleStatusChange = (id: number, newStatus: StatusTurma) => {
    setAlunos(alunos.map(a => a.id === id ? { ...a, statusTurma: newStatus } : a));
  };

  const handleAction = (type: string, alunoName: string) => {
    setActionModal({ isOpen: true, type, alunoName });
  };

  const alunosFiltrados = ALUNOS_DISPONIVEIS.filter(a => 
    a.nome.toLowerCase().includes(searchTerm.toLowerCase()) || 
    a.cpf.includes(searchTerm)
  );

  return (
    <div className="animate-fadeIn">
      <div className="flex justify-between items-center mb-6">
        <div className="relative w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input 
            type="text" 
            placeholder="Buscar aluno na turma..." 
            className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-sm outline-none focus:border-emerald-500"
          />
        </div>
        <button 
          onClick={() => setShowMatricularModal(true)}
          className="px-4 py-2 bg-emerald-600 text-white rounded-xl text-xs font-bold uppercase tracking-wider hover:bg-emerald-700 transition-colors flex items-center gap-2"
        >
          <UserPlus size={16} /> Matricular Aluno
        </button>
      </div>

      <div className="bg-white rounded-[2rem] border border-slate-100 shadow-sm overflow-visible">
        <table className="w-full text-left border-collapse">
          <thead className="bg-[#001a33] text-white">
            <tr>
              <th className="px-6 py-4 text-xs font-black uppercase tracking-wider rounded-tl-[2rem]">Aluno</th>
              <th className="px-6 py-4 text-xs font-black uppercase tracking-wider">Matrícula</th>
              <th className="px-6 py-4 text-xs font-black uppercase tracking-wider">Status Turma</th>
              <th className="px-6 py-4 text-xs font-black uppercase tracking-wider">Status Fin.</th>
              <th className="px-6 py-4 text-xs font-black uppercase tracking-wider">Frequência</th>
              <th className="px-6 py-4 text-xs font-black uppercase tracking-wider text-right rounded-tr-[2rem]">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {alunos.map((aluno) => (
              <tr key={aluno.id} className="hover:bg-slate-50 transition-colors group">
                <td className="px-6 py-5">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-sm font-black text-slate-500 border border-slate-200">
                      {aluno.nome.charAt(0)}
                    </div>
                    <div>
                      <span className="font-bold text-[#001a33] text-sm block">{aluno.nome}</span>
                      <span className="text-[10px] text-slate-500 font-medium">CPF: {aluno.cpf} • Nasc: {aluno.dataNasc}</span>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-5 text-sm text-slate-500 font-mono">{aluno.matricula}</td>
                <td className="px-6 py-5">
                   <select 
                     value={aluno.statusTurma} 
                     onChange={(e) => handleStatusChange(aluno.id, e.target.value as StatusTurma)}
                     className={`text-[10px] font-bold uppercase px-2 py-1.5 rounded-lg outline-none cursor-pointer transition-colors border-none ${
                        aluno.statusTurma === 'ATIVO' ? 'bg-emerald-100 text-emerald-700' :
                        aluno.statusTurma === 'DESISTENTE' ? 'bg-red-100 text-red-700' :
                        aluno.statusTurma === 'TRANCADO' ? 'bg-amber-100 text-amber-700' :
                        'bg-blue-100 text-blue-700'
                     }`}
                   >
                      <option value="ATIVO" className="bg-white text-slate-700">Ativo</option>
                      <option value="DESISTENTE" className="bg-white text-slate-700">Desistente</option>
                      <option value="TRANCADO" className="bg-white text-slate-700">Trancado</option>
                      <option value="CONCLUÍDO" className="bg-white text-slate-700">Concluído</option>
                   </select>
                </td>
                <td className="px-6 py-5">
                  <span className={`px-2 py-1 rounded-md text-[10px] font-bold uppercase ${
                    aluno.statusFinanceiro === 'REGULAR' 
                      ? 'bg-emerald-50 text-emerald-600' 
                      : 'bg-rose-50 text-rose-600'
                  }`}>
                    {aluno.statusFinanceiro}
                  </span>
                </td>
                <td className="px-6 py-5 text-sm font-bold text-slate-700">{aluno.frequencia}%</td>
                <td className="px-6 py-5 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <button onClick={() => handleAction('Financeiro', aluno.nome)} title="Financeiro" className="p-2 hover:bg-emerald-50 text-slate-400 hover:text-emerald-600 rounded-lg transition-colors">
                      <DollarSign size={16} />
                    </button>
                    <button onClick={() => handleAction('Documentos', aluno.nome)} title="Documentos" className="p-2 hover:bg-blue-50 text-slate-400 hover:text-blue-600 rounded-lg transition-colors">
                      <FileText size={16} />
                    </button>
                    <button onClick={() => handleAction('Opções', aluno.nome)} title="Mais opções" className="p-2 hover:bg-slate-100 text-slate-400 hover:text-slate-600 rounded-lg transition-colors">
                      <MoreHorizontal size={16} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {actionModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white rounded-3xl p-6 max-w-sm w-full shadow-2xl relative text-center">
             <button 
               type="button" 
               onClick={() => setActionModal({ isOpen: false, type: '', alunoName: '' })}
               className="absolute top-4 right-4 p-2 rounded-full text-slate-400 hover:bg-slate-100 transition-colors"
             >
                <X size={20} />
             </button>
             <div className="w-16 h-16 bg-blue-50 text-blue-500 rounded-full flex items-center justify-center mx-auto mb-4">
                {actionModal.type === 'Financeiro' && <DollarSign size={32} />}
                {actionModal.type === 'Documentos' && <FileText size={32} />}
                {actionModal.type === 'Opções' && <MoreHorizontal size={32} />}
             </div>
             <h3 className="text-lg font-black text-[#001a33] mb-1">Módulo {actionModal.type}</h3>
             <p className="text-slate-500 text-sm mb-6">Acessando informações de <strong className="text-slate-700">{actionModal.alunoName}</strong>. Esta funcionalidade será implementada no backend.</p>
             <button 
               onClick={() => setActionModal({ isOpen: false, type: '', alunoName: '' })}
               className="w-full py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl uppercase tracking-wider text-xs transition-colors"
             >
               Fechar
             </button>
          </div>
        </div>
      )}

      {/* Modal Matricular Aluno (Quick Search) */}
      {showMatricularModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white rounded-[2rem] w-full max-w-2xl shadow-2xl relative overflow-hidden flex flex-col max-h-[80vh]">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-3">
                 <div className="w-10 h-10 bg-emerald-100 text-emerald-600 flex items-center justify-center rounded-xl">
                   <UserPlus size={20} />
                 </div>
                 <div>
                   <h3 className="font-black text-[#001a33] text-lg uppercase tracking-tight">Vincular Aluno à Turma</h3>
                   <p className="text-xs font-medium text-slate-500">Pesquise alunos cadastrados no sistema.</p>
                 </div>
              </div>
              <button 
                onClick={() => setShowMatricularModal(false)}
                className="p-2 text-slate-400 hover:bg-slate-200 hover:text-rose-500 rounded-full transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-6 border-b border-slate-100">
               <div className="relative">
                 <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                 <input 
                   type="text" 
                   value={searchTerm}
                   onChange={e => setSearchTerm(e.target.value)}
                   autoFocus
                   placeholder="Pesquisar por nome ou CPF..." 
                   className="w-full pl-12 pr-4 py-4 bg-slate-50 border border-slate-200 rounded-xl text-slate-700 font-medium focus:border-emerald-500 outline-none transition-all placeholder:text-slate-400"
                 />
               </div>
            </div>

            <div className="overflow-y-auto p-4 flex-1">
               {alunosFiltrados.length === 0 ? (
                 <div className="py-12 text-center text-slate-400 flex flex-col items-center">
                    <UserX size={48} className="mb-4 opacity-50 text-slate-300" />
                    <p className="font-bold text-sm">Nenhum aluno encontrado.</p>
                 </div>
               ) : (
                 <div className="space-y-2">
                   {alunosFiltrados.map(aluno => (
                     <div key={aluno.id} className="p-4 border border-slate-100 rounded-2xl flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center hover:border-emerald-200 hover:shadow-md transition-all group">
                        <div>
                           <h4 className="font-bold text-[#001a33]">{aluno.nome}</h4>
                           <span className="text-xs font-mono text-slate-500 mt-1 block">CPF: {aluno.cpf}</span>
                        </div>
                        <button 
                          onClick={() => {
                            setAlunos([...alunos, {
                              id: aluno.id,
                              nome: aluno.nome,
                              matricula: `2024.2.${aluno.id}`,
                              statusFinanceiro: 'REGULAR',
                              statusTurma: 'ATIVO',
                              frequencia: 0
                            }]);
                            setShowMatricularModal(false);
                          }}
                          className="px-4 py-2 bg-slate-100 text-slate-600 hover:bg-emerald-500 hover:text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-colors shrink-0"
                        >
                          Vincular à Turma
                        </button>
                     </div>
                   ))}
                 </div>
               )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TurmaAlunos;
