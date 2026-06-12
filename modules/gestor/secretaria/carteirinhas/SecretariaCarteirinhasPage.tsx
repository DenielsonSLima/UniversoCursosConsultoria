
// File: modules/gestor/secretaria/carteirinhas/SecretariaCarteirinhasPage.tsx

import React, { useState } from 'react';
import { CreditCard, Users, Search, Printer, Image } from 'lucide-react';

const SecretariaCarteirinhasPage: React.FC = () => {
  const [mode, setMode] = useState<'individual' | 'lote'>('individual');

  return (
    <div className="animate-fadeIn">
      <div className="flex justify-center mb-8">
        <div className="bg-white p-1 rounded-2xl border border-slate-200 shadow-sm inline-flex">
            <button
                onClick={() => setMode('individual')}
                className={`px-6 py-3 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center gap-2 transition-all ${mode === 'individual' ? 'bg-purple-600 text-white shadow-md' : 'text-slate-500 hover:bg-slate-50'}`}
            >
                <Search size={16} /> Individual
            </button>
            <button
                onClick={() => setMode('lote')}
                className={`px-6 py-3 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center gap-2 transition-all ${mode === 'lote' ? 'bg-purple-600 text-white shadow-md' : 'text-slate-500 hover:bg-slate-50'}`}
            >
                <Users size={16} /> Em Lote (Turma)
            </button>
        </div>
      </div>

      <div className="max-w-4xl mx-auto bg-white p-10 rounded-[2.5rem] border border-slate-100 shadow-xl">
        
        {mode === 'individual' ? (
            <div className="animate-fadeIn">
                <h3 className="text-xl font-black text-[#001a33] mb-6 uppercase tracking-tight">Carteirinha Individual</h3>
                
                <div className="flex gap-4 mb-8">
                    <input 
                        type="text" 
                        placeholder="Buscar aluno..."
                        className="flex-1 px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:border-purple-500 text-slate-700"
                    />
                    <button className="bg-purple-600 text-white px-8 rounded-2xl hover:bg-purple-700 transition-colors shadow-lg shadow-purple-900/20">
                        <Search size={24} />
                    </button>
                </div>

                <div className="border-2 border-dashed border-slate-200 rounded-3xl p-8 flex flex-col items-center justify-center text-center bg-slate-50/50">
                    <div className="w-64 h-40 bg-gradient-to-r from-purple-600 to-blue-600 rounded-xl shadow-lg mb-4 relative overflow-hidden">
                        {/* Mock Visual Carteirinha */}
                        <div className="absolute top-4 left-4 w-12 h-12 bg-white rounded-full"></div>
                        <div className="absolute top-4 right-4 text-white text-[10px] font-bold">2024</div>
                        <div className="absolute bottom-4 left-4 text-white text-left">
                            <div className="h-2 w-24 bg-white/50 rounded mb-1"></div>
                            <div className="h-2 w-16 bg-white/30 rounded"></div>
                        </div>
                    </div>
                    <p className="text-slate-500 text-sm font-medium mb-4">Pré-visualização do modelo padrão</p>
                    <button className="px-6 py-3 bg-[#001a33] text-white rounded-xl font-bold uppercase text-xs tracking-wider hover:bg-blue-900 transition-colors shadow-lg flex items-center gap-2">
                        <Printer size={16} /> Imprimir Carteirinha
                    </button>
                </div>
            </div>
        ) : (
            <div className="animate-fadeIn">
                <h3 className="text-xl font-black text-[#001a33] mb-6 uppercase tracking-tight">Emissão em Lote</h3>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Selecione a Turma</label>
                        <select className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:border-purple-500 cursor-pointer">
                            <option>Enfermagem - 2024.1 - Noturno</option>
                            <option>Radiologia - 2023.2 - Matutino</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Validade</label>
                        <input type="date" className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:border-purple-500" />
                    </div>
                </div>

                <div className="bg-purple-50 p-6 rounded-2xl border border-purple-100 mb-8 flex items-start gap-3">
                    <Image className="text-purple-600 mt-1" size={20} />
                    <div>
                        <h4 className="font-bold text-purple-900 text-sm">Verificação de Fotos</h4>
                        <p className="text-xs text-purple-700 mt-1">
                            O sistema irá gerar carteirinhas apenas para alunos com fotos cadastradas. 
                            <span className="font-bold"> 3 alunos desta turma estão sem foto.</span>
                        </p>
                    </div>
                </div>

                <div className="flex gap-4">
                    <button className="flex-1 py-4 border border-slate-200 text-slate-600 rounded-2xl font-bold uppercase text-xs tracking-wider hover:bg-slate-50 transition-colors">
                        Ver Lista de Alunos
                    </button>
                    <button className="flex-1 py-4 bg-purple-600 text-white rounded-2xl font-black uppercase tracking-widest hover:bg-purple-700 transition-colors shadow-xl shadow-purple-900/20 flex items-center justify-center gap-2">
                        <Printer size={18} /> Imprimir Todas
                    </button>
                </div>
            </div>
        )}

      </div>
    </div>
  );
};

export default SecretariaCarteirinhasPage;
