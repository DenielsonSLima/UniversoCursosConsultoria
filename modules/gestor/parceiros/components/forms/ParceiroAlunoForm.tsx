
import React from 'react';

const ParceiroAlunoForm: React.FC = () => {
  return (
    <form className="space-y-6">
      <h3 className="text-lg font-bold text-[#001a33] border-b border-slate-100 pb-2 mb-4">
        Cadastro de Aluno (Vínculo Parceiro)
      </h3>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-2">
          <label className="text-xs font-bold text-slate-500 uppercase">Nome Completo</label>
          <input 
            type="text" 
            className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl outline-none focus:border-blue-500 text-slate-700"
            placeholder="Nome do aluno"
          />
        </div>
        
        <div className="space-y-2">
          <label className="text-xs font-bold text-slate-500 uppercase">CPF</label>
          <input 
            type="text" 
            className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl outline-none focus:border-blue-500 text-slate-700"
            placeholder="000.000.000-00"
          />
        </div>

        <div className="space-y-2">
          <label className="text-xs font-bold text-slate-500 uppercase">E-mail</label>
          <input 
            type="email" 
            className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl outline-none focus:border-blue-500 text-slate-700"
            placeholder="aluno@email.com"
          />
        </div>

        <div className="space-y-2">
          <label className="text-xs font-bold text-slate-500 uppercase">Matrícula</label>
          <input 
            type="text" 
            className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl outline-none focus:border-blue-500 text-slate-700"
            placeholder="Gerada automaticamente"
            disabled
          />
        </div>
      </div>

      <div className="flex justify-end gap-3 pt-4">
        <button type="button" className="px-6 py-3 rounded-xl border border-slate-200 text-slate-600 font-bold text-sm hover:bg-slate-50">
          Cancelar
        </button>
        <button type="submit" className="px-6 py-3 rounded-xl bg-blue-600 text-white font-bold text-sm hover:bg-blue-700 shadow-lg shadow-blue-900/20">
          Salvar Aluno
        </button>
      </div>
    </form>
  );
};

export default ParceiroAlunoForm;
