import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { empresasService } from '../../../../configuracoes/empresas/empresas.service';
import { polosService } from '../../../../configuracoes/polos/polos.service';
import DocumentHeader from '../../../../components/DocumentHeader';

const PdfTemplate: React.FC = () => {
  const { data: company } = useQuery<any>({
    queryKey: ['empresa_principal'],
    queryFn: () => empresasService.getCompanyPrincipal(),
  });

  // current_polo_id é estado de sessão UI — sessionStorage é adequado
  const poloId = sessionStorage.getItem('current_polo_id');
  const { data: polo } = useQuery<any>({
    queryKey: ['polo_detalhes', poloId],
    queryFn: () => poloId ? polosService.getById(poloId) : Promise.resolve(null),
    enabled: !!poloId,
  });

  return (
    <div className="text-slate-800 relative min-h-[inherit] flex flex-col justify-between text-left">
      {/* Watermark (Marca d'água) */}
      {polo?.watermark_url && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0 overflow-hidden">
          <img 
            src={polo.watermark_url} 
            alt="Watermark" 
            style={{
              opacity: polo.watermark_opacity ?? 0.1,
              width: `${polo.watermark_scale ?? 50}%`,
              transform: polo.watermark_rotate !== false ? 'rotate(-45deg)' : 'none'
            }}
          />
        </div>
      )}

      <div className="relative z-10 flex-1">
        {/* Header com Logo e Info da Empresa e Polo */}
        <DocumentHeader 
          company={company} 
          polo={polo} 
          orientation="portrait" 
          rightContent={
            <div className="text-right">
              <h2 className="text-lg font-black text-slate-800 uppercase tracking-tight">Relatório de Parceiros</h2>
              <p className="text-[10px] font-bold text-slate-500 uppercase mt-2">Data de Emissão</p>
              <p className="text-sm font-bold text-[#001a33]">{new Date().toLocaleDateString('pt-BR')}</p>
            </div>
          }
        />

        <div className="mb-6 relative z-10">
          <h2 className="text-sm font-bold bg-slate-100 px-3 py-2 uppercase tracking-widest text-[#001a33]">Resumo dos Filtros</h2>
          <ul className="text-xs font-medium text-slate-600 mt-2 px-3 space-y-1">
            <li>• Aba / Tipo: Todos</li>
            <li>• Status: Todos</li>
            <li>• Curso: Todos os cursos</li>
            <li>• Turma: Todas as turmas</li>
          </ul>
        </div>

        <table className="w-full text-left text-sm mt-4 border-collapse relative z-10">
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
      </div>
      
      <div className="mt-16 text-center text-xs text-slate-400 font-medium relative z-10">
        Fim do Relatório
      </div>
    </div>
  );
};

export default PdfTemplate;
