import React from 'react';
import { Smartphone, CheckCircle2, AlertCircle, Building2, CreditCard } from 'lucide-react';
import { WhatsAppConexao } from '../../../comunicacao/components/whatsapp/whatsapp.types';

interface WhatsAppConnectionCardsBarProps {
  conexoes: WhatsAppConexao[];
  activeConexaoId: string | null;
  onSelectConexao: (id: string) => void;
}

export const WhatsAppConnectionCardsBar: React.FC<WhatsAppConnectionCardsBarProps> = ({
  conexoes,
  activeConexaoId,
  onSelectConexao,
}) => {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-600 flex items-center gap-2">
          <Smartphone size={15} className="text-emerald-600" />
          Selecione a linha para configurar
        </h3>
        <span className="text-xs text-slate-400">Máx. 3 linhas</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {conexoes.map((c) => {
          const isSelected = c.id === activeConexaoId;
          const isAtivo = c.status === 'ativo' && (Boolean(c.phone_number_id) || c.connection_mode === 'coexistence');
          
          return (
            <button
              type="button"
              key={c.id}
              onClick={() => onSelectConexao(c.id)}
              className={`flex flex-col justify-between rounded-2xl border p-4 text-left transition-all relative overflow-hidden ${
                isSelected
                  ? 'border-emerald-500 bg-white shadow-md ring-2 ring-emerald-500/20 scale-[1.01]'
                  : 'border-slate-200 bg-slate-50/70 hover:border-slate-300 hover:bg-white'
              }`}
            >
              {/* Top Row: Icon & Institution */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div
                      className={`flex h-9 w-9 items-center justify-center rounded-xl font-bold text-white shadow-xs text-xs ${
                        c.instituicao === 'universo'
                          ? 'bg-emerald-600'
                          : c.instituicao === 'anhanguera'
                          ? 'bg-blue-600'
                          : 'bg-violet-600'
                      }`}
                    >
                      {c.nome.substring(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <div className="text-sm font-black text-slate-800 leading-tight">{c.nome}</div>
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                        {c.instituicao}
                      </span>
                    </div>
                  </div>

                  {c.is_matriz_financeira && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                      <CreditCard size={10} />
                      Matriz Fin.
                    </span>
                  )}
                </div>

                {/* Number & Mode */}
                <div className="mt-3 space-y-1">
                  <div className="text-xs font-mono font-bold text-slate-700">
                    {c.telefone || 'Sem número formatado'}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-slate-200/70 text-slate-700">
                      {c.connection_mode === 'coexistence' ? 'App Coexistência' : 'Cloud API Exclusiva'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Bottom Status Badge */}
              <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-2.5">
                {isAtivo ? (
                  <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-600">
                    <CheckCircle2 size={13} />
                    Ativo
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-400">
                    <AlertCircle size={13} />
                    Inativo
                  </span>
                )}

                {isSelected && (
                  <span className="text-[10px] font-black uppercase text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded">
                    Editando
                  </span>
                )}
              </div>
            </button>
          );
        })}
        {conexoes.length < 3 && (
          <button
            type="button"
            onClick={() => onSelectConexao('new')}
            className={`flex flex-col items-center justify-center rounded-2xl border-2 border-dashed p-4 text-center transition-all ${
              activeConexaoId === 'new'
                ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                : 'border-slate-300 bg-slate-50 text-slate-500 hover:border-slate-400 hover:bg-slate-100'
            }`}
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-sm mb-2">
              <span className="text-xl font-bold">+</span>
            </div>
            <span className="text-xs font-bold uppercase tracking-widest">
              Adicionar Número
            </span>
            <span className="text-[10px] mt-1 opacity-70">
              {3 - conexoes.length} slot(s) disponível(is)
            </span>
          </button>
        )}
      </div>
    </div>
  );
};

export default WhatsAppConnectionCardsBar;
