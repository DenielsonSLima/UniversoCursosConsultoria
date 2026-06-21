import React, { useMemo, useState } from 'react';
import { ChevronRight, CircleDollarSign, Loader2, Search, WalletCards } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { getSecretariaContext, secretariaDocumentosService } from '../shared/secretaria-documentos.service';
import { secretariaDocumentosKeys } from '../shared/secretaria-documentos.keys';

const SecretariaConsultaFinanceiraPage: React.FC = () => {
  const activeUserId = sessionStorage.getItem('logged_user_id');
  const activePoloId = sessionStorage.getItem('current_polo_id') || sessionStorage.getItem('active_polo_id');
  const context = useMemo(() => getSecretariaContext(), [activeUserId, activePoloId]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedAluno, setSelectedAluno] = useState<any | null>(null);
  const normalizedTerm = searchTerm.trim();

  const { data: alunos = [], isFetching } = useQuery({
    queryKey: [
      ...secretariaDocumentosKeys.context(context),
      'consulta-financeira',
      'alunos',
      normalizedTerm,
    ],
    queryFn: () => secretariaDocumentosService.searchAlunos(context.poloId, normalizedTerm),
    enabled: normalizedTerm.length >= 2,
    staleTime: 30_000,
  });

  return (
    <div className="animate-fadeIn">
      <div className="mb-7">
        <div className="flex items-center gap-2 text-cyan-700 mb-2">
          <CircleDollarSign size={18} />
          <span className="text-[10px] font-black uppercase tracking-[0.22em]">Consulta administrativa</span>
        </div>
        <h3 className="text-2xl font-black text-[#001a33] uppercase tracking-tight">Financeiro do Aluno</h3>
        <p className="text-sm text-slate-500 font-medium mt-1">
          Localize o aluno para acessar futuramente contratos, parcelas e movimentações.
        </p>
      </div>

      <div className="max-w-4xl mx-auto bg-white rounded-[2rem] border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-6 md:p-9">
          <div className="relative">
            <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={searchTerm}
              onChange={(event) => {
                setSearchTerm(event.target.value);
                setSelectedAluno(null);
              }}
              placeholder="Buscar por nome ou CPF..."
              className="w-full pl-12 pr-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:border-cyan-500 text-sm font-medium"
            />
          </div>

          {normalizedTerm.length >= 2 && !selectedAluno && (
            <div className="mt-4 space-y-2 max-h-64 overflow-y-auto">
              {isFetching ? (
                <div className="py-10 flex justify-center"><Loader2 className="animate-spin text-cyan-600" /></div>
              ) : alunos.length ? (
                alunos.map((aluno) => (
                  <button
                    key={aluno.id}
                    onClick={() => setSelectedAluno(aluno)}
                    className="w-full p-4 rounded-2xl bg-slate-50 border border-slate-200 hover:border-cyan-300 text-left flex items-center justify-between transition-colors"
                  >
                    <div>
                      <p className="font-black text-sm text-[#001a33]">{aluno.nome}</p>
                      <p className="text-xs text-slate-500 mt-1">CPF: {aluno.cpf || 'Não informado'}</p>
                    </div>
                    <ChevronRight size={17} className="text-slate-350" />
                  </button>
                ))
              ) : (
                <p className="py-10 text-center text-sm text-slate-400">Nenhum aluno encontrado nesta unidade.</p>
              )}
            </div>
          )}

          {selectedAluno && (
            <div className="mt-6 rounded-3xl border border-cyan-100 bg-cyan-50/70 p-6">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-2xl bg-white text-cyan-700 border border-cyan-100 flex items-center justify-center">
                  <WalletCards size={22} />
                </div>
                <div>
                  <p className="font-black text-[#001a33]">{selectedAluno.nome}</p>
                  <p className="text-xs text-slate-500 mt-1">{selectedAluno.cpf || 'CPF não informado'}</p>
                  <span className="inline-block mt-4 px-3 py-1.5 rounded-full bg-white border border-cyan-100 text-cyan-700 text-[10px] font-black uppercase tracking-widest">
                    Consulta detalhada em desenvolvimento
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SecretariaConsultaFinanceiraPage;
