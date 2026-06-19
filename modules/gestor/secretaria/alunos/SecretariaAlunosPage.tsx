
// File: modules/gestor/secretaria/alunos/SecretariaAlunosPage.tsx

import React, { useState } from 'react';
import { Search, User, DollarSign, FileText, GraduationCap, X } from 'lucide-react';

// Mock Data
const MOCK_ALUNOS = [
  { id: '1', nome: 'Ana Clara Souza', matricula: '2024001', curso: 'Técnico em Enfermagem', status: 'Ativo' },
  { id: '2', nome: 'João Pedro Alves', matricula: '2024002', curso: 'Técnico em Radiologia', status: 'Inadimplente' },
  { id: '3', nome: 'Maria Eduarda Costa', matricula: '2024003', curso: 'Especialização Instr. Cirúrgica', status: 'Ativo' },
];

const SecretariaAlunosPage: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedAluno, setSelectedAluno] = useState<any | null>(null);
  const [activeTab, setActiveTab] = useState<'geral' | 'financeiro' | 'academico'>('geral');

  const filteredAlunos = searchTerm 
    ? MOCK_ALUNOS.filter(a => a.nome.toLowerCase().includes(searchTerm.toLowerCase()) || a.matricula.includes(searchTerm))
    : [];

  if (selectedAluno) {
    return (
      <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-xl overflow-hidden animate-fadeIn min-h-[600px]">
        {/* Profile Header */}
        <div className="bg-slate-50 p-8 border-b border-slate-100 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <div className="flex items-center gap-6">
            <div className="w-24 h-24 bg-white rounded-3xl border-4 border-white shadow-md flex items-center justify-center text-slate-300">
                <User size={48} />
            </div>
            <div>
                <h3 className="text-2xl font-black text-[#001a33]">{selectedAluno.nome}</h3>
                <p className="text-slate-500 font-bold uppercase text-xs tracking-wider mt-1">
                    Matrícula: {selectedAluno.matricula} • <span className={selectedAluno.status === 'Ativo' ? 'text-emerald-600' : 'text-red-500'}>{selectedAluno.status}</span>
                </p>
                <div className="flex items-center gap-2 mt-3">
                    <span className="bg-blue-100 text-blue-700 px-3 py-1 rounded-lg text-xs font-bold">{selectedAluno.curso}</span>
                </div>
            </div>
          </div>
          <button 
            onClick={() => setSelectedAluno(null)}
            className="p-2 bg-white text-slate-400 hover:text-red-500 rounded-xl border border-slate-200 shadow-sm transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-100 px-8">
            <button 
                onClick={() => setActiveTab('geral')}
                className={`px-6 py-4 text-sm font-bold uppercase tracking-wider border-b-2 transition-colors flex items-center gap-2 ${activeTab === 'geral' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
            >
                <User size={16} /> Dados Gerais
            </button>
            <button 
                onClick={() => setActiveTab('financeiro')}
                className={`px-6 py-4 text-sm font-bold uppercase tracking-wider border-b-2 transition-colors flex items-center gap-2 ${activeTab === 'financeiro' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
            >
                <DollarSign size={16} /> Financeiro
            </button>
            <button 
                onClick={() => setActiveTab('academico')}
                className={`px-6 py-4 text-sm font-bold uppercase tracking-wider border-b-2 transition-colors flex items-center gap-2 ${activeTab === 'academico' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
            >
                <GraduationCap size={16} /> Acadêmico
            </button>
        </div>

        {/* Content */}
        <div className="p-8">
            {activeTab === 'geral' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 animate-fadeIn">
                    <div className="space-y-4">
                        <h4 className="text-sm font-black text-[#001a33] uppercase border-b border-slate-100 pb-2">Informações Pessoais</h4>
                        <div className="grid grid-cols-2 gap-4 text-sm">
                            <div>
                                <p className="text-slate-400 text-xs uppercase font-bold">CPF</p>
                                <p className="text-slate-700 font-medium">000.000.000-00</p>
                            </div>
                            <div>
                                <p className="text-slate-400 text-xs uppercase font-bold">Identidade (CIN/CNH)</p>
                                <p className="text-slate-700 font-medium">00.000.000-0</p>
                            </div>
                            <div>
                                <p className="text-slate-400 text-xs uppercase font-bold">Data Nasc.</p>
                                <p className="text-slate-700 font-medium">01/01/2000</p>
                            </div>
                            <div>
                                <p className="text-slate-400 text-xs uppercase font-bold">Sexo</p>
                                <p className="text-slate-700 font-medium">Feminino</p>
                            </div>
                        </div>
                    </div>
                    <div className="space-y-4">
                        <h4 className="text-sm font-black text-[#001a33] uppercase border-b border-slate-100 pb-2">Contato</h4>
                        <div className="space-y-3 text-sm">
                            <div>
                                <p className="text-slate-400 text-xs uppercase font-bold">E-mail</p>
                                <p className="text-slate-700 font-medium">aluno@email.com</p>
                            </div>
                            <div>
                                <p className="text-slate-400 text-xs uppercase font-bold">Telefone</p>
                                <p className="text-slate-700 font-medium">(79) 99999-9999</p>
                            </div>
                            <div>
                                <p className="text-slate-400 text-xs uppercase font-bold">Endereço</p>
                                <p className="text-slate-700 font-medium">Rua Principal, 123, Centro - Japoatã/SE</p>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {activeTab === 'financeiro' && (
                <div className="animate-fadeIn">
                    <div className="flex gap-4 mb-6">
                        <div className="flex-1 bg-emerald-50 border border-emerald-100 p-4 rounded-xl">
                            <p className="text-emerald-600 text-xs font-bold uppercase">Status</p>
                            <p className="text-2xl font-black text-emerald-800">Em dia</p>
                        </div>
                        <div className="flex-1 bg-white border border-slate-200 p-4 rounded-xl">
                            <p className="text-slate-400 text-xs font-bold uppercase">Próximo Vencimento</p>
                            <p className="text-2xl font-black text-[#001a33]">10/04</p>
                        </div>
                    </div>
                    <table className="w-full text-left border border-slate-100 rounded-xl overflow-hidden">
                        <thead className="bg-slate-50">
                            <tr>
                                <th className="p-3 text-xs font-bold text-slate-500 uppercase">Referência</th>
                                <th className="p-3 text-xs font-bold text-slate-500 uppercase">Vencimento</th>
                                <th className="p-3 text-xs font-bold text-slate-500 uppercase">Valor</th>
                                <th className="p-3 text-xs font-bold text-slate-500 uppercase">Status</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            <tr>
                                <td className="p-3 text-sm text-slate-700">Mensalidade 03/2024</td>
                                <td className="p-3 text-sm text-slate-700">10/03/2024</td>
                                <td className="p-3 text-sm text-slate-700">R$ 350,00</td>
                                <td className="p-3"><span className="bg-emerald-100 text-emerald-700 px-2 py-1 rounded text-[10px] font-bold uppercase">Pago</span></td>
                            </tr>
                            <tr>
                                <td className="p-3 text-sm text-slate-700">Mensalidade 04/2024</td>
                                <td className="p-3 text-sm text-slate-700">10/04/2024</td>
                                <td className="p-3 text-sm text-slate-700">R$ 350,00</td>
                                <td className="p-3"><span className="bg-blue-100 text-blue-700 px-2 py-1 rounded text-[10px] font-bold uppercase">Aberto</span></td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            )}

            {activeTab === 'academico' && (
                <div className="animate-fadeIn">
                    <h4 className="text-sm font-black text-[#001a33] uppercase mb-4">Histórico de Turmas</h4>
                    <div className="space-y-3">
                        <div className="p-4 border border-slate-200 rounded-xl flex justify-between items-center bg-slate-50">
                            <div>
                                <p className="font-bold text-[#001a33] text-sm">Turma 2024.1 - Enfermagem Noturno</p>
                                <p className="text-xs text-slate-500">Status: Cursando</p>
                            </div>
                            <div className="text-right">
                                <p className="text-xs font-bold text-slate-400 uppercase">Frequência</p>
                                <p className="font-black text-blue-600">92%</p>
                            </div>
                        </div>
                    </div>
                    
                    <div className="mt-8 flex gap-3">
                        <button className="px-4 py-2 border border-slate-200 rounded-lg text-xs font-bold text-slate-600 uppercase hover:bg-slate-50 flex items-center gap-2">
                            <FileText size={14} /> Imprimir Boletim
                        </button>
                        <button className="px-4 py-2 border border-slate-200 rounded-lg text-xs font-bold text-slate-600 uppercase hover:bg-slate-50 flex items-center gap-2">
                            <FileText size={14} /> Imprimir Histórico
                        </button>
                    </div>
                </div>
            )}
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fadeIn">
      <div className="bg-white p-12 rounded-[2.5rem] shadow-xl border border-slate-100 text-center">
        <h3 className="text-2xl font-black text-[#001a33] mb-6 uppercase tracking-tight">Buscar Aluno</h3>
        
        <div className="max-w-xl mx-auto relative group mb-8">
            <div className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-600 transition-colors">
                <Search size={24} />
            </div>
            <input 
                type="text" 
                placeholder="Digite o nome, CPF ou matrícula..."
                className="w-full pl-16 pr-6 py-5 bg-slate-50 border-2 border-slate-200 rounded-2xl outline-none focus:border-blue-500 focus:bg-white text-lg font-medium transition-all shadow-sm"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                autoFocus
            />
        </div>

        {searchTerm && (
            <div className="max-w-2xl mx-auto text-left space-y-3 animate-fadeIn">
                {filteredAlunos.length > 0 ? (
                    filteredAlunos.map(aluno => (
                        <div 
                            key={aluno.id}
                            onClick={() => setSelectedAluno(aluno)}
                            className="bg-white p-4 rounded-2xl border border-slate-200 hover:border-blue-300 hover:shadow-lg transition-all cursor-pointer flex items-center justify-between group"
                        >
                            <div className="flex items-center gap-4">
                                <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center text-slate-400 font-bold group-hover:bg-blue-100 group-hover:text-blue-600 transition-colors">
                                    {aluno.nome.charAt(0)}
                                </div>
                                <div>
                                    <h4 className="font-bold text-[#001a33] text-sm group-hover:text-blue-700">{aluno.nome}</h4>
                                    <p className="text-xs text-slate-500">{aluno.curso} • Matr: {aluno.matricula}</p>
                                </div>
                            </div>
                            <span className={`text-[10px] font-bold uppercase px-3 py-1 rounded-full ${aluno.status === 'Ativo' ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'}`}>
                                {aluno.status}
                            </span>
                        </div>
                    ))
                ) : (
                    <div className="text-center py-8 text-slate-400">
                        Nenhum aluno encontrado com este termo.
                    </div>
                )}
            </div>
        )}
      </div>
    </div>
  );
};

export default SecretariaAlunosPage;
