import React, { useState, useEffect } from 'react';
import { Save, Percent, AlertCircle, RefreshCw, Calculator } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { configuracoesService, RegrasCobranca } from '../configuracoes.service';
import { supabase } from '../../../../lib/supabase';
import ToastNotification, { useToast } from '../../components/ToastNotification';

const RegrasCobrancaConfig: React.FC = () => {
  const queryClient = useQueryClient();
  const { toasts, removeToast, toast } = useToast();

  // 1. Carregar as regras de cobrança do Supabase
  const { data: regras, isLoading, isError, error } = useQuery<RegrasCobranca>({
    queryKey: ['regras_cobranca'],
    queryFn: configuracoesService.getRegrasCobranca,
  });

  // Estados locais dos inputs do formulário
  const [multa, setMulta] = useState('2.00');
  const [juros, setJuros] = useState('1.00');
  const [desconto, setDesconto] = useState('0.00');
  const [diasDesconto, setDiasDesconto] = useState('0');

  // Sincronizar estados locais quando os dados carregarem
  useEffect(() => {
    if (regras) {
      setMulta(regras.multa.toFixed(2));
      setJuros(regras.juros.toFixed(2));
      setDesconto(regras.desconto.toFixed(2));
      setDiasDesconto(regras.dias_desconto.toString());
    }
  }, [regras]);

  // 2. Realtime Subscription para invalidar queries de outros usuários quando alteradas
  useEffect(() => {
    const channel = supabase
      .channel('regras_cobranca_realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'regras_cobranca' },
        (payload) => {
          console.log('Alteração detectada no banco via Realtime, invalidando cache:', payload);
          queryClient.invalidateQueries({ queryKey: ['regras_cobranca'] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  // 3. Mutation para salvar as regras
  const saveMutation = useMutation({
    mutationFn: (newRegras: RegrasCobranca) => configuracoesService.saveRegrasCobranca(newRegras),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['regras_cobranca'] });
      toast.success('Regras salvas', 'Regras de cobrança salvas com sucesso!');
    },
    onError: (err: any) => {
      toast.error('Erro ao salvar', `Erro ao salvar regras: ${err.message}`);
    }
  });

  const handleSave = () => {
    saveMutation.mutate({
      id: regras?.id,
      multa: parseFloat(multa) || 0,
      juros: parseFloat(juros) || 0,
      desconto: parseFloat(desconto) || 0,
      dias_desconto: parseInt(diasDesconto) || 0,
    });
  };

  // 4. Estados do simulador de cálculos (no Banco de Dados via RPC)
  const [simValorBase, setSimValorBase] = useState('100.00');
  const [simDataVencimento, setSimDataVencimento] = useState(new Date().toISOString().split('T')[0]);
  const [simDataPagamento, setSimDataPagamento] = useState(new Date().toISOString().split('T')[0]);

  // Query do simulador para calcular via RPC (roda automaticamente quando os valores mudam)
  const { data: calculo, isLoading: calculando, error: erroCalculo } = useQuery({
    queryKey: ['calculo_cobranca', simValorBase, simDataVencimento, simDataPagamento, regras?.updated_at],
    queryFn: () => configuracoesService.calcularValoresCobranca(
      parseFloat(simValorBase) || 0,
      simDataVencimento,
      simDataPagamento
    ),
    enabled: !!simValorBase && !!simDataVencimento && !!simDataPagamento,
  });

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <RefreshCw className="animate-spin text-blue-500 mb-4" size={32} />
        <p className="text-slate-500 font-medium">Carregando parâmetros do banco...</p>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="bg-red-50 p-6 rounded-2xl border border-red-100 text-center">
        <p className="text-red-600 font-bold">Erro ao carregar as configurações:</p>
        <p className="text-red-500 text-sm mt-1">{(error as Error)?.message || 'Erro desconhecido'}</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl space-y-12">
      <ToastNotification toasts={toasts} onRemove={removeToast} />
      {/* Formulário Principal */}
      <div className="bg-white rounded-3xl space-y-6">
        <div>
          <h3 className="text-2xl font-black text-[#001a33] uppercase tracking-tight">Regras de Cobrança (Supabase)</h3>
          <p className="text-sm font-medium text-slate-500 mt-1">Parametrize o envio automático padrão (Juros, Multas e Descontos).</p>
        </div>

        <div className="bg-slate-50 p-4 border border-slate-200 rounded-2xl flex items-start gap-3">
          <div className="text-blue-500 mt-0.5">
            <AlertCircle size={20} />
          </div>
          <p className="text-sm font-medium text-slate-600">
            Estas regras serão salvas no banco de dados e aplicadas a todas as cobranças em tempo real. Qualquer mudança atualizará a tela de outros usuários conectados via Supabase Realtime.
          </p>
        </div>

        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">
                Multa por atraso (%)
              </label>
              <div className="relative">
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={multa}
                  onChange={(e) => setMulta(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 font-bold text-slate-700"
                  placeholder="2.00"
                />
                <div className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400">
                  <Percent size={18} />
                </div>
              </div>
              <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Aplicada uma única vez após o vencimento.</p>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">
                Juros ao mês (%)
              </label>
              <div className="relative">
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={juros}
                  onChange={(e) => setJuros(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 font-bold text-slate-700"
                  placeholder="1.00"
                />
                <div className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400">
                  <Percent size={18} />
                </div>
              </div>
              <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Cobrados pro-rata die (por dia de atraso).</p>
            </div>
          </div>

          <hr className="border-slate-100" />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">
                Desconto pontualidade (%)
              </label>
              <div className="relative">
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={desconto}
                  onChange={(e) => setDesconto(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 font-bold text-slate-700"
                  placeholder="0.00"
                />
                <div className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400">
                  <Percent size={18} />
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">
                Dias antes do venc. para desconto
              </label>
              <input
                type="number"
                min="0"
                value={diasDesconto}
                onChange={(e) => setDiasDesconto(e.target.value)}
                className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 font-bold text-slate-700"
                placeholder="0"
              />
            </div>
          </div>

          <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <button
              onClick={handleSave}
              disabled={saveMutation.isPending}
              className="flex items-center gap-2 px-8 py-4 bg-[#001a33] text-white rounded-xl font-bold uppercase tracking-widest text-xs hover:bg-blue-900 transition-colors shadow-lg shadow-blue-900/20 disabled:opacity-50"
            >
              <Save size={16} />
              {saveMutation.isPending ? 'Salvando...' : 'Salvar Regras'}
            </button>
            
            {regras?.updated_at && (
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                Última alteração: {new Date(regras.updated_at).toLocaleString('pt-BR')}
              </span>
            )}
          </div>
        </div>
      </div>

      <hr className="border-slate-200" />

      {/* Simulador de Cálculos (Banco de Dados / RPC) */}
      <div className="bg-slate-50 border border-slate-200 rounded-[2rem] p-8 space-y-6">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-blue-100 text-blue-600 rounded-2xl">
            <Calculator size={24} />
          </div>
          <div>
            <h4 className="text-lg font-black text-[#001a33] uppercase tracking-tight">Simulador de Cobrança (Cálculo via Banco)</h4>
            <p className="text-xs font-medium text-slate-500">Cálculos matemáticos realizados de forma assíncrona por funções no PostgreSQL.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Valor da Cobrança (R$)</label>
            <input
              type="number"
              step="0.01"
              value={simValorBase}
              onChange={(e) => setSimValorBase(e.target.value)}
              className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 outline-none focus:border-blue-500 font-bold text-slate-700"
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Vencimento</label>
            <input
              type="date"
              value={simDataVencimento}
              onChange={(e) => setSimDataVencimento(e.target.value)}
              className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 outline-none focus:border-blue-500 font-bold text-slate-700"
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Data do Pagamento</label>
            <input
              type="date"
              value={simDataPagamento}
              onChange={(e) => setSimDataPagamento(e.target.value)}
              className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 outline-none focus:border-blue-500 font-bold text-slate-700"
            />
          </div>
        </div>

        {/* Output do cálculo no banco */}
        <div className="bg-white p-6 border border-slate-200 rounded-2xl">
          {calculando ? (
            <div className="flex justify-center items-center py-6">
              <RefreshCw className="animate-spin text-blue-500 mr-2" size={18} />
              <span className="text-sm text-slate-500 font-medium">Chamando RPC no banco de dados...</span>
            </div>
          ) : erroCalculo ? (
            <div className="text-red-500 text-sm text-center font-medium">
              Erro ao rodar simulação: {(erroCalculo as Error).message}
            </div>
          ) : calculo ? (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 text-center">
              <div className="p-3 bg-red-50/50 rounded-xl border border-red-100/30">
                <span className="block text-[10px] uppercase font-bold text-red-500 tracking-wider">Multa ({calculo.multa_aplicada.toFixed(2)}%)</span>
                <span className="text-lg font-black text-red-600">R$ {calculo.valor_multa.toFixed(2)}</span>
              </div>
              <div className="p-3 bg-rose-50/50 rounded-xl border border-rose-100/30">
                <span className="block text-[10px] uppercase font-bold text-rose-500 tracking-wider">Juros ({calculo.juros_aplicado.toFixed(2)}%/mês)</span>
                <span className="text-lg font-black text-rose-600">R$ {calculo.valor_juros.toFixed(2)}</span>
              </div>
              <div className="p-3 bg-emerald-50/50 rounded-xl border border-emerald-100/30">
                <span className="block text-[10px] uppercase font-bold text-emerald-500 tracking-wider">Desconto ({calculo.desconto_aplicado.toFixed(2)}%)</span>
                <span className="text-lg font-black text-emerald-600">R$ {calculo.valor_desconto.toFixed(2)}</span>
              </div>
              <div className="p-3 bg-blue-50 rounded-xl border border-blue-100 flex flex-col justify-center items-center">
                <span className="block text-[10px] uppercase font-bold text-blue-600 tracking-wider">Valor Líquido Final</span>
                <span className="text-xl font-black text-blue-900">R$ {calculo.valor_final.toFixed(2)}</span>
              </div>
            </div>
          ) : (
            <div className="text-center text-xs text-slate-400 font-medium py-4">
              Preencha os valores para obter o cálculo do PostgreSQL.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default RegrasCobrancaConfig;
