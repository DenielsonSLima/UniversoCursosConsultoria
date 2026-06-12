import React from 'react';

const PdfTemplate: React.FC = () => {
  return (
    <div className="text-slate-800">
      <div className="text-center mb-8 border-b border-slate-200 pb-6">
        <h1 className="text-2xl font-black uppercase tracking-widest text-[#001a33]">Relatório de Parceiros</h1>
        <p className="text-sm font-medium text-slate-500 mt-2">Data de emissão: {new Date().toLocaleDateString('pt-BR')}</p>
      </div>

      <div className="mb-6">
        <h2 className="text-sm font-bold bg-slate-100 px-3 py-2 uppercase tracking-widest">Resumo dos Filtros</h2>
        <ul className="text-xs font-medium text-slate-600 mt-2 px-3 space-y-1">
          <li>• Aba / Tipo: Todos</li>
          <li>• Status: Todos</li>
          <li>• Curso: Todos os cursos</li>
          <li>• Turma: Todas as turmas</li>
        </ul>
      </div>

      <table className="w-full text-left text-sm mt-4 border-collapse">
        <thead>
          <tr className="border-b-2 border-slate-300">
            <th className="py-2 pr-2 font-bold uppercase tracking-wider text-xs">Nome</th>
            <th className="py-2 pr-2 font-bold uppercase tracking-wider text-xs">Tipo</th>
            <th className="py-2 pr-2 font-bold uppercase tracking-wider text-xs">Status</th>
            <th className="py-2 pr-2 font-bold uppercase tracking-wider text-xs">Documento</th>
            <th className="py-2 font-bold uppercase tracking-wider text-xs">Contato</th>
          </tr>
        </thead>
        <tbody className="font-medium text-slate-600">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
            <tr key={i} className="border-b border-slate-100">
              <td className="py-3 pr-2">Exemplo Parceiro {i}</td>
              <td className="py-3 pr-2">{i % 2 === 0 ? 'Aluno' : i % 3 === 0 ? 'Professor' : 'PJ'}</td>
              <td className="py-3 pr-2">
                <span className={i % 5 === 0 ? "text-slate-500 font-bold" : "text-emerald-600 font-bold"}>
                  {i % 5 === 0 ? 'Inativo' : 'Ativo'}
                </span>
              </td>
              <td className="py-3 pr-2">{i % 3 === 0 ? '00.000.000/0001-00' : '000.000.000-00'}</td>
              <td className="py-3">contato{i}@parceiro.com</td>
            </tr>
          ))}
        </tbody>
      </table>
      
      <div className="mt-16 text-center text-xs text-slate-400 font-medium">
        Fim do Relatório
      </div>
    </div>
  );
};

export default PdfTemplate;
