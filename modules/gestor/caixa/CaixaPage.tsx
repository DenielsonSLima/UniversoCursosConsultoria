// File: modules/gestor/caixa/CaixaPage.tsx

import React, { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { 
  DollarSign, TrendingUp, TrendingDown, Landmark, AlertTriangle, 
  Layers, Calendar, ArrowUpRight, Activity, Info
} from 'lucide-react';
import { caixaService, PRINCIPAL_POLO_ID } from './caixa.service';
import { financeiroService } from '../financeiro/financeiro.service';

interface CaixaPageProps {
  poloId?: string | null;
  isGlobal?: boolean;
}

const CaixaPage: React.FC<CaixaPageProps> = ({ poloId, isGlobal = false }) => {
  const [selectedPolo, setSelectedPolo] = useState<string>(
    isGlobal ? (poloId || 'todos') : (poloId || '')
  );

  // Fetch Polos list
  const { data: polos = [] } = useQuery({
    queryKey: ['caixa-polos-list'],
    queryFn: financeiroService.getPolos
  });

  useEffect(() => {
    setSelectedPolo(isGlobal ? (poloId || 'todos') : (poloId || ''));
  }, [isGlobal, poloId]);

  const visiblePolos = useMemo(() => {
    if (isGlobal) return polos;
    return polos.filter((polo: any) => polo.id === poloId);
  }, [isGlobal, poloId, polos]);

  // Fetch dashboard data reactively based on selectedPolo
  const { data: dashboard, isLoading, error } = useQuery({
    queryKey: ['caixa-dashboard-data', selectedPolo],
    queryFn: () => caixaService.getCaixaDashboardData(selectedPolo)
  });

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  };

  const getReceitaCatLabel = (cat: string) => {
    switch (cat) {
      case 'MENSALIDADE': return 'Mensalidades Escolares';
      case 'OUTROS_CREDITOS': return 'Outros Créditos';
      case 'ADIANTAMENTO_TOMADO': return 'Adiantamentos Tomados';
      default: return cat;
    }
  };

  const getDespesaCatLabel = (cat: string) => {
    switch (cat) {
      case 'DESPESA_VARIAVEL': return 'Despesas Variáveis';
      case 'DESPESA_ADMINISTRATIVA': return 'Despesas Administrativas';
      case 'OUTRAS_DESPESAS': return 'Outras Despesas';
      case 'ADIANTAMENTO_CEDIDO': return 'Adiantamentos Cedidos';
      default: return cat;
    }
  };

  if (isLoading) {
    return (
      <div className="py-24 text-center space-y-4 animate-fadeIn">
        <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
        <p className="text-slate-500 text-xs font-black uppercase tracking-widest">Carregando painel de caixa...</p>
      </div>
    );
  }

  if (error || !dashboard) {
    return (
      <div className="p-8 text-center bg-rose-50 border border-rose-250 rounded-[2rem] text-rose-800 space-y-2 animate-fadeIn">
        <AlertTriangle className="mx-auto text-rose-500" size={32} />
        <h4 className="font-black uppercase text-sm">Erro ao carregar dados do caixa</h4>
        <p className="text-xs">Não foi possível recuperar os saldos e filtros do polo selecionado. Tente atualizar a página.</p>
      </div>
    );
  }

  // Find max value in last 3 months to scale the chart bars
  const maxMonthValue = Math.max(
    ...dashboard.fluxo3Meses.map(f => Math.max(f.creditos, f.debitos)),
    1000 // avoid division by zero
  );

  return (
    <div className="max-w-7xl mx-auto animate-fadeIn pb-12 space-y-8">
      
      {/* HEADER PRINCIPAL */}
      <div className="bg-[#001a33] text-white rounded-[2.5rem] p-8 md:p-10 relative overflow-hidden shadow-2xl">
         <div className="absolute top-0 right-0 w-[450px] h-[450px] bg-blue-500/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3"></div>
         <div className="absolute bottom-0 left-0 w-[250px] h-[250px] bg-emerald-600/10 rounded-full blur-2xl translate-y-1/2 -translate-x-1/4"></div>

         <div className="relative z-10 flex flex-col md:flex-row md:items-end justify-between gap-8">
            <div>
              <div className="flex items-center gap-2 mb-4">
                 <span className="bg-blue-500/20 text-blue-300 font-bold px-3 py-1 rounded-full text-[10px] tracking-widest uppercase border border-blue-500/30 flex items-center gap-2">
                   <Activity size={12} className="text-blue-400" /> Frente de Caixa e Saldos
                 </span>
              </div>
              <h2 className="text-4xl font-black text-white uppercase tracking-tight mb-2">Painel de Caixa</h2>
              <p className="text-slate-300 font-medium max-w-xl text-sm leading-relaxed">
                Acompanhe o saldo consolidado das contas de todos os polos, receitas a receber, despesas a pagar e fluxo comparativo mensal.
              </p>
            </div>
         </div>
      </div>

      {/* TABS DE SELEÇÃO DE POLO */}
      <div className="space-y-3">
        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block ml-1">Filtro por Polo / Unidade</span>
        <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-4">
          {/* Aba Geral */}
          {isGlobal && (
            <button
              onClick={() => setSelectedPolo('todos')}
              className={`px-5 py-3 rounded-2xl text-xs font-black uppercase tracking-wider transition-all border ${
                selectedPolo === 'todos'
                  ? 'bg-[#001a33] text-white border-[#001a33] shadow-md'
                  : 'bg-white text-slate-500 hover:bg-slate-50 border-slate-100'
              }`}
            >
              Resultado Geral (Todos os Polos)
            </button>
          )}
          
          {/* Abas de Polos Específicos */}
          {visiblePolos.map((polo: any) => (
            <button
              key={polo.id}
              onClick={() => setSelectedPolo(polo.id)}
              disabled={!isGlobal}
              className={`px-5 py-3 rounded-2xl text-xs font-black uppercase tracking-wider transition-all border ${
                selectedPolo === polo.id
                  ? 'bg-blue-600 text-white border-blue-600 shadow-md'
                  : 'bg-white text-slate-500 hover:bg-slate-50 border-slate-100'
              }`}
            >
              {polo.nome}
              {polo.id === PRINCIPAL_POLO_ID && (
                <span className="ml-2 bg-white/20 text-[8px] px-1.5 py-0.5 rounded font-black uppercase">Polo Principal</span>
              )}
              {!isGlobal && (
                <span className="ml-2 bg-white/20 text-[8px] px-1.5 py-0.5 rounded font-black uppercase">Escopo fixo</span>
              )}
            </button>
          ))}
        </div>

        {/* Informativo EAD agrupado no Principal */}
        {(selectedPolo === 'todos' || selectedPolo === PRINCIPAL_POLO_ID) && (
          <div className="bg-blue-50/50 border border-blue-200/50 text-blue-700 p-4 rounded-2xl text-xs flex items-start gap-3">
            <Info size={16} className="text-blue-500 shrink-0 mt-0.5" />
            <div>
              <p className="font-black uppercase tracking-wider text-[9px] mb-0.5">Informação de Lançamento EAD</p>
              <p className="font-medium text-slate-650">Os recebimentos referentes a cursos EAD (que não possuem polo físico associado) estão consolidados junto ao **Polo Principal** ({polos.find((p: any) => p.id === PRINCIPAL_POLO_ID)?.nome || 'UNIVERSO CURSOS E CONSULTORIA'}).</p>
            </div>
          </div>
        )}
      </div>

      {/* KPI CARDS GRID */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        
        {/* 1. Saldo Consolidado */}
        <div className="bg-slate-900 border border-slate-800 p-6 rounded-[2rem] shadow-xl flex flex-col justify-between group relative overflow-hidden">
           <div className="absolute -bottom-8 -right-8 w-24 h-24 rounded-full bg-blue-500/10 blur-xl group-hover:scale-150 transition-all duration-500"></div>
           <div className="flex justify-between items-start relative z-10">
             <span className="text-slate-400 text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5">
               <DollarSign size={12} className="text-blue-400" /> Saldo Consolidado
             </span>
             <span className="text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded text-[8px] font-black uppercase">Contas Ativas</span>
           </div>
           <div className="mt-6 relative z-10">
             <h3 className="text-3xl font-black text-white tracking-tight">{formatCurrency(dashboard.saldoTotalContas)}</h3>
             <p className="text-[9px] text-slate-400 font-bold mt-1.5 uppercase">Soma dos saldos das contas selecionadas</p>
           </div>
        </div>

        {/* 2. Total a Receber */}
        <div className="bg-white border border-slate-100 p-6 rounded-[2rem] shadow-sm flex flex-col justify-between hover:shadow-lg transition-all duration-300 group">
           <div className="flex justify-between items-start">
             <span className="text-slate-400 text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5">
               <TrendingUp size={12} className="text-emerald-500" /> Total a Receber
             </span>
             <span className="text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded text-[8px] font-black uppercase">Aberto</span>
           </div>
           <div className="mt-6">
             <h3 className="text-3xl font-black text-emerald-600 tracking-tight">{formatCurrency(dashboard.totalReceber)}</h3>
             <p className="text-[9px] text-slate-400 font-bold mt-1.5 uppercase">Receitas pendentes e vencidas</p>
           </div>
        </div>

        {/* 3. Total a Pagar */}
        <div className="bg-white border border-slate-100 p-6 rounded-[2rem] shadow-sm flex flex-col justify-between hover:shadow-lg transition-all duration-300 group">
           <div className="flex justify-between items-start">
             <span className="text-slate-400 text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5">
               <TrendingDown size={12} className="text-rose-500" /> Total a Pagar
             </span>
             <span className="text-rose-600 bg-rose-50 px-2 py-0.5 rounded text-[8px] font-black uppercase">Aberto</span>
           </div>
           <div className="mt-6">
             <h3 className="text-3xl font-black text-rose-600 tracking-tight">{formatCurrency(dashboard.totalPagar)}</h3>
             <p className="text-[9px] text-slate-400 font-bold mt-1.5 uppercase">Despesas pendentes e vencidas</p>
           </div>
        </div>

        {/* 4. Mensalidades em Atraso */}
        <div className="bg-white border border-slate-100 p-6 rounded-[2rem] shadow-sm flex flex-col justify-between hover:shadow-lg transition-all duration-300 group">
           <div className="flex justify-between items-start">
             <span className="text-slate-400 text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5">
               <AlertTriangle size={12} className="text-amber-500" /> Mensalidades em Atraso
             </span>
             <span className="text-amber-600 bg-amber-50 px-2 py-0.5 rounded text-[8px] font-black uppercase">Inadimplência</span>
           </div>
           <div className="mt-6">
             <h3 className="text-3xl font-black text-amber-500 tracking-tight">{formatCurrency(dashboard.mensalidadesEmAtraso.valorTotal)}</h3>
             <p className="text-[9px] text-slate-400 font-bold mt-1.5 uppercase">
               {dashboard.mensalidadesEmAtraso.quantidade} boleto(s) em atraso
             </p>
           </div>
        </div>

      </div>

      {/* SEÇÃO PRINCIPAL DE GRÁFICOS E SALDOS */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* LADO ESQUERDO: GRÁFICO E CATEGORIAS (2 COLS) */}
        <div className="lg:col-span-2 space-y-8">
          
          {/* Grafico dos ultimos 3 meses */}
          <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm flex flex-col space-y-6">
            <div>
              <h3 className="text-lg font-black text-[#001a33] uppercase tracking-tight">Comparativo dos Últimos 3 Meses</h3>
              <p className="text-slate-500 text-xs font-bold uppercase mt-1">Créditos recebidos vs. Débitos pagos em cada período.</p>
            </div>

            {/* Simulação do Gráfico de Barras com CSS */}
            <div className="h-64 flex items-end justify-around gap-8 border-b border-slate-100 pb-4 pt-8 px-4 relative">
              {dashboard.fluxo3Meses.map((f, idx) => {
                const credPct = (f.creditos / maxMonthValue) * 100;
                const debPct = (f.debitos / maxMonthValue) * 100;
                return (
                  <div key={idx} className="flex flex-col items-center flex-1 space-y-2 max-w-[150px]">
                    <div className="w-full flex items-end justify-center gap-3 h-48 relative">
                      {/* Barra Receita (Verde) */}
                      <div 
                        style={{ height: `${credPct}%` }}
                        className="w-8 bg-emerald-500 hover:bg-emerald-600 rounded-t-lg transition-all duration-300 relative group flex items-end justify-center cursor-pointer shadow-md shadow-emerald-500/20"
                      >
                        <div className="absolute -top-8 bg-slate-900 text-white text-[9px] font-black px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap shadow-xl pointer-events-none z-50">
                          Receitas: {formatCurrency(f.creditos)}
                        </div>
                      </div>
                      
                      {/* Barra Despesa (Vermelho) */}
                      <div 
                        style={{ height: `${debPct}%` }}
                        className="w-8 bg-rose-500 hover:bg-rose-600 rounded-t-lg transition-all duration-300 relative group flex items-end justify-center cursor-pointer shadow-md shadow-rose-500/20"
                      >
                        <div className="absolute -top-8 bg-slate-900 text-white text-[9px] font-black px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap shadow-xl pointer-events-none z-50">
                          Despesas: {formatCurrency(f.debitos)}
                        </div>
                      </div>
                    </div>
                    <span className="text-xs font-black text-[#001a33] uppercase mt-2 tracking-wider">{f.mesNome}</span>
                  </div>
                );
              })}
              {dashboard.fluxo3Meses.length === 0 && (
                <div className="w-full h-full flex items-center justify-center text-slate-400 text-xs font-bold uppercase">Nenhum fluxo consolidado registrado.</div>
              )}
            </div>

            {/* Legenda */}
            <div className="flex gap-6 justify-center text-xs font-bold uppercase tracking-wider text-slate-500 pt-2">
              <div className="flex items-center gap-2">
                <span className="w-3.5 h-3.5 bg-emerald-500 rounded-md"></span>
                <span>Receitas (Créditos)</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3.5 h-3.5 bg-rose-500 rounded-md"></span>
                <span>Despesas (Débitos)</span>
              </div>
            </div>
          </div>

          {/* Receitas e Despesas Segmentadas por Categoria */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            
            {/* Receitas por Categoria */}
            <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm space-y-4">
              <h4 className="text-xs font-black text-[#001a33] uppercase tracking-widest flex items-center gap-1.5 pb-2 border-b border-slate-100">
                <TrendingUp size={14} className="text-emerald-500" /> Receitas Separadas por Tipo
              </h4>
              
              <div className="space-y-4">
                {dashboard.receberPorTipo.map((item, idx) => {
                  const pct = dashboard.totalReceber > 0 ? (item.valor / dashboard.totalReceber) * 100 : 0;
                  return (
                    <div key={idx} className="space-y-1.5">
                      <div className="flex justify-between text-xs font-bold text-slate-700">
                        <span>{getReceitaCatLabel(item.categoria)}</span>
                        <span className="font-black text-[#001a33]">{formatCurrency(item.valor)}</span>
                      </div>
                      <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                        <div 
                          style={{ width: `${pct}%` }} 
                          className="bg-emerald-500 h-full rounded-full transition-all duration-500"
                        ></div>
                      </div>
                      <div className="flex justify-between text-[9px] text-slate-400 font-bold uppercase">
                        <span>Porcentagem do total</span>
                        <span>{pct.toFixed(1)}%</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Despesas por Categoria */}
            <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm space-y-4">
              <h4 className="text-xs font-black text-[#001a33] uppercase tracking-widest flex items-center gap-1.5 pb-2 border-b border-slate-100">
                <TrendingDown size={14} className="text-rose-500" /> Despesas Separadas por Tipo
              </h4>

              <div className="space-y-4">
                {dashboard.pagarPorTipo.map((item, idx) => {
                  const pct = dashboard.totalPagar > 0 ? (item.valor / dashboard.totalPagar) * 100 : 0;
                  return (
                    <div key={idx} className="space-y-1.5">
                      <div className="flex justify-between text-xs font-bold text-slate-700">
                        <span>{getDespesaCatLabel(item.categoria)}</span>
                        <span className="font-black text-[#001a33]">{formatCurrency(item.valor)}</span>
                      </div>
                      <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                        <div 
                          style={{ width: `${pct}%` }} 
                          className="bg-rose-500 h-full rounded-full transition-all duration-500"
                        ></div>
                      </div>
                      <div className="flex justify-between text-[9px] text-slate-400 font-bold uppercase">
                        <span>Porcentagem do total</span>
                        <span>{pct.toFixed(1)}%</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

          </div>

        </div>

        {/* LADO DIREITO: SALDO INDIVIDUAL DAS CONTAS BANCÁRIAS (1 COL) */}
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-[2.5rem] border border-slate-100 shadow-sm space-y-6">
            <div>
              <h3 className="text-lg font-black text-[#001a33] uppercase tracking-tight">Saldos Individuais</h3>
              <p className="text-slate-500 text-xs font-bold uppercase mt-1">Saldo em tempo real de cada conta ativa.</p>
            </div>

            <div className="space-y-4">
              {dashboard.saldosIndividuais.length > 0 ? (
                dashboard.saldosIndividuais.map((account) => (
                  <div 
                    key={account.id} 
                    className="p-5 bg-slate-50 border border-slate-150 rounded-[2rem] hover:bg-white hover:shadow-xl hover:shadow-blue-900/5 hover:-translate-y-1 transition-all duration-300 flex flex-col justify-between gap-4"
                  >
                    <div className="flex items-center gap-3">
                      <div className="p-3 bg-blue-50 text-blue-600 rounded-2xl">
                        <Landmark size={20} />
                      </div>
                      <div>
                        <p className="text-sm font-black text-[#001a33] uppercase">{account.banco}</p>
                        <p className="text-[9px] text-slate-400 font-bold uppercase mt-0.5">
                          Ag: {account.agencia} • C/C: {account.conta}
                        </p>
                      </div>
                    </div>
                    
                    <div className="flex items-end justify-between border-t border-slate-200/50 pt-3">
                      <div>
                        <span className="text-[9px] text-slate-400 font-black uppercase tracking-wider block">Polo Vinculado</span>
                        <span className="text-[10px] text-slate-600 font-bold uppercase">{account.poloNome}</span>
                      </div>
                      <span className={`text-base font-black ${account.saldoAtual < 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                        {formatCurrency(account.saldoAtual)}
                      </span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="p-8 text-center text-slate-400 text-xs font-bold uppercase border border-dashed border-slate-200 rounded-[2rem]">
                  Nenhuma conta bancária configurada para esta unidade.
                </div>
              )}
            </div>

          </div>
        </div>

      </div>

    </div>
  );
};

export default CaixaPage;
