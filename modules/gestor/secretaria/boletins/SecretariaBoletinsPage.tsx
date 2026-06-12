
// File: modules/gestor/secretaria/boletins/SecretariaBoletinsPage.tsx

import React, { useState } from 'react';
import { ScrollText, Users, Search, Printer, Download } from 'lucide-react';

const SecretariaBoletinsPage: React.FC = () => {
  const [mode, setMode] = useState<'individual' | 'lote'>('individual');

  return (
    <div className="animate-fadeIn">
      <div className="flex justify-center mb-8">
        <div className="bg-white p-1 rounded-2xl border border-slate-200 shadow-sm inline-flex">
            <button
                onClick={() => setMode('individual')}
                className={`px-6 py-3 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center gap-2 transition-all ${mode === 'individual' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-500 hover:bg-slate-50'}`}
            >
                <Search size={16} /> Individual (Por Aluno)
            </button>
            <button
                onClick={() => setMode('lote')}
                className={`px-6 py-3 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center gap-2 transition-all ${mode === 'lote' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-500 hover:bg-slate-50'}`}
            >
                <Users size={16} /> Em Lote (Por Turma)
            </button>
        </div>
      </div>

      <div className="max-w-4xl mx-auto bg-white p-10 rounded-[2.5rem] border border-slate-100 shadow-xl">
        
        {mode === 'individual' ? (
            <div className="animate-fadeIn">
                <h3 className="text-xl font-black text-[#001a33] mb-6 uppercase tracking-tight">Boletim Individual</h3>
                <div className="flex gap-4 mb-8">
                    <input 
                        type="text" 
                        placeholder="Buscar aluno por nome ou matrícula..."
                        className="flex-1 px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:border-indigo-500 text-slate-700"
                    />
                    <button className="bg-indigo-600 text-white px-8 rounded-2xl hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-900/20">
                        <Search size={24} />
                    </button>
                </div>
                
                {/* Mock Result */}
                <div className="border border-slate-100 rounded-2xl p-6 bg-slate-50 flex items-center justify-between">
                    <div>
                        <p className="font-bold text-[#001a33]">João Pedro Alves</p>
                        <p className="text-xs text-slate-500">Técnico em Enfermagem • 2024.1</p>
                    </div>
                    <button className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold uppercase text-indigo-600 hover:border-indigo-200 shadow-sm">
                        <Printer size={16} /> Gerar Boletim
                    </button>
                </div>
            </div>
        ) : (
            <div className="animate-fadeIn">
                <h3 className="text-xl font-black text-[#001a33] mb-6 uppercase tracking-tight">Boletim em Lote</h3>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Curso</label>
                        <select className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:border-indigo-500 cursor-pointer">
                            <option>Técnico em Enfermagem</option>
                            <option>Técnico em Radiologia</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Turma / Período</label>
                        <select className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:border-indigo-500 cursor-pointer">
                            <option>2024.1 - Noturno</option>
                            <option>2024.1 - Matutino</option>
                        </select>
                    </div>
                </div>

                <div className="bg-indigo-50 p-6 rounded-2xl border border-indigo-100 mb-8">
                    <div className="flex items-center gap-3 mb-2">
                        <Users size={20} className="text-indigo-600" />
                        <span className="font-bold text-indigo-900">45 Alunos Encontrados</span>
                    </div>
                    <p className="text-xs text-indigo-700">Ao confirmar, um arquivo PDF único contendo todos os boletins será gerado.</p>
                </div>

                <button className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-black uppercase tracking-widest hover:bg-indigo-700 transition-colors shadow-xl shadow-indigo-900/20 flex items-center justify-center gap-3">
                    <Download size={20} /> Baixar Arquivo Unificado
                </button>
            </div>
        )}

      </div>
    </div>
  );
};

export default SecretariaBoletinsPage;
