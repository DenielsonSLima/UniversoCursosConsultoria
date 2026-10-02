import React from 'react';
import {
  AlertTriangle,
  Archive,
  CalendarDays,
  CircleDollarSign,
  Info,
  Landmark,
  Layers3,
  Minus,
  PackagePlus,
  Plus,
  ReceiptText,
  Scale,
} from 'lucide-react';
import type {
  CaixaPatrimonioResumo,
  CaixaPosicaoLiquidaResumo,
  CaixaPosicaoTotalResumo,
} from '../caixa.types';
import { formatCaixaCanonicalCurrency, formatCaixaDate } from '../caixa.formatters';
import { caixaFechamentoImplantacaoPresentation } from '../caixa-fechamento-implantacao.presentation';

interface CaixaStructuralOverviewProps {
  posicaoTotal?: CaixaPosicaoTotalResumo;
  posicaoLiquida?: CaixaPosicaoLiquidaResumo;
  patrimonio?: CaixaPatrimonioResumo;
  isPosicaoTotalLoading: boolean;
  hasPosicaoTotalError: boolean;
  isPosicaoLiquidaLoading: boolean;
  hasPosicaoLiquidaError: boolean;
  isPatrimonioLoading: boolean;
  hasPatrimonioError: boolean;
}

const quantityFormatter = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });

/**
 * Une as três leituras patrimoniais sem recompor nenhum valor no cliente.
 * A equação é apenas explicativa: cada número, inclusive o resultado, vem
 * pronto das RPCs canônicas.
 */
export const CaixaStructuralOverview: React.FC<CaixaStructuralOverviewProps> = ({
  posicaoTotal,
  posicaoLiquida,
  patrimonio,
  isPosicaoTotalLoading,
  hasPosicaoTotalError,
  isPosicaoLiquidaLoading,
  hasPosicaoLiquidaError,
  isPatrimonioLoading,
  hasPatrimonioError,
}) => {
  const totalAvailable = posicaoTotal?.disponivel === true;
  const totalData = totalAvailable ? posicaoTotal.dados : undefined;
  const fechamento = caixaFechamentoImplantacaoPresentation(totalData?.fechamentoImplantacao);
  const totalNegative = totalData?.valorTotalLiquido.startsWith('-') ?? false;
  const liquidNegative = posicaoLiquida?.valorLiquido.startsWith('-') ?? false;

  return (
    <section aria-labelledby="caixa-structural-title" className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm">
      <header className="relative overflow-hidden bg-[#061a2f] px-5 py-6 text-white sm:px-7 sm:py-7">
        <div className="pointer-events-none absolute -right-16 -top-24 h-56 w-56 rounded-full border-[36px] border-blue-500/10" />
        <div className="pointer-events-none absolute bottom-0 right-1/4 h-px w-48 bg-gradient-to-r from-transparent via-cyan-300/50 to-transparent" />
        <div className="relative flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-cyan-300">Mapa estrutural</p>
            <h3 id="caixa-structural-title" className="mt-2 text-xl font-extrabold tracking-tight sm:text-2xl">
              Como a posição registrada é formada
            </h3>
            <p className="mt-1 max-w-2xl text-xs leading-5 text-slate-300">
              Caixa, bens e dívidas no mesmo corte — com resultado consolidado exclusivamente pelo servidor.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 text-[10px] font-semibold text-slate-300">
            {posicaoTotal ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1.5">
                <CalendarDays size={12} className="text-cyan-300" aria-hidden="true" />
                Corte {formatCaixaDate(posicaoTotal.dataCorte)}
              </span>
            ) : null}
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-300/20 bg-emerald-300/10 px-3 py-1.5 text-emerald-200">
              <Scale size={12} aria-hidden="true" /> Calculado no backend
            </span>
          </div>
        </div>

        <div className="relative mt-6">
          {isPosicaoTotalLoading ? (
            <LoadingStrip label="Carregando a posição registrada do corte" dark />
          ) : hasPosicaoTotalError || !posicaoTotal || !totalData ? (
            <UnavailableStrip
              title="Posição total indisponível"
              copy={posicaoTotal?.disponivel === false
                ? posicaoTotal.motivo === 'HISTORICO_INSUFICIENTE'
                  ? 'O histórico disponível não permite apurar o caixa neste fechamento. Nenhum valor foi estimado.'
                  : 'Este perfil precisa dos escopos de Caixa, patrimônio e financeiro para apurar a posição total.'
                : 'Não foi possível combinar caixa, patrimônio e empréstimos neste corte. Nenhum total foi estimado.'}
              dark
            />
          ) : (
            <div className="grid items-stretch gap-2 md:grid-cols-[1fr_auto_1fr_auto_1fr_auto_1.2fr] md:gap-3">
              <EquationMetric
                label={fechamento ? 'Caixa no encerramento operacional' : 'Caixa registrado'}
                value={formatCaixaCanonicalCurrency(totalData.saldoCaixaRegistrado)}
                helper={fechamento ? 'Inclui o ajuste de implantação Proesc' : 'Saldo contábil no corte'}
                icon={<CircleDollarSign size={15} aria-hidden="true" />}
                tone="blue"
              />
              <EquationSymbol icon={<Plus size={17} />} label="mais" />
              <EquationMetric
                label="Patrimônio a custo"
                value={formatCaixaCanonicalCurrency(totalData.valorPatrimonialCusto)}
                helper="Bens ativos registrados"
                icon={<Archive size={15} aria-hidden="true" />}
                tone="cyan"
              />
              <EquationSymbol icon={<Minus size={17} />} label="menos" />
              <EquationMetric
                label="Empréstimos a pagar"
                value={formatCaixaCanonicalCurrency(totalData.saldoEmprestimosAPagar)}
                helper="Principal e encargos devidos"
                icon={<Landmark size={15} aria-hidden="true" />}
                tone="rose"
              />
              <EquationSymbol icon={<span className="text-lg font-black">=</span>} label="igual" />
              <div className="flex min-h-[116px] flex-col justify-center rounded-2xl border border-white/10 bg-white px-4 py-4 text-[#061a2f] shadow-xl shadow-black/20">
                <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">
                  <Scale size={14} className={totalNegative ? 'text-rose-600' : 'text-emerald-600'} aria-hidden="true" />
                  Posição total
                </div>
                <p className={`mt-2 truncate text-2xl font-black tracking-tight ${totalNegative ? 'text-rose-700' : 'text-emerald-700'}`} title={formatCaixaCanonicalCurrency(totalData.valorTotalLiquido)}>
                  {formatCaixaCanonicalCurrency(totalData.valorTotalLiquido)}
                </p>
                <p className="mt-1 text-[10px] leading-4 text-slate-500">Resultado canônico da posição registrada</p>
              </div>
            </div>
          )}
        </div>
      </header>

      {fechamento ? (
        <aside className="border-b border-blue-100 bg-blue-50 px-5 py-4 text-xs leading-5 text-blue-950 sm:px-7" aria-label={fechamento.title}>
          <h4 className="font-extrabold">{fechamento.title}</h4>
          {fechamento.lines.map((line) => <p key={line}>{line}</p>)}
        </aside>
      ) : null}

      <div className="grid gap-0 xl:grid-cols-[0.92fr_1.08fr]">
        <article className="border-b border-slate-200 p-5 sm:p-7 xl:border-b-0 xl:border-r">
          <div className="flex items-start gap-3">
            <span className="rounded-xl bg-emerald-50 p-2.5 text-emerald-700"><Scale size={18} aria-hidden="true" /></span>
            <div>
              <h4 className="text-base font-extrabold text-slate-900">Leitura patrimonial líquida</h4>
              <p className="mt-0.5 text-xs leading-5 text-slate-500">Bens menos empréstimos, sem alterar caixa ou resultado operacional.</p>
            </div>
          </div>

          {isPosicaoLiquidaLoading ? (
            <div className="mt-5"><LoadingStrip label="Carregando leitura líquida" /></div>
          ) : hasPosicaoLiquidaError || !posicaoLiquida ? (
            <div className="mt-5"><UnavailableStrip title="Leitura líquida indisponível" copy="Os demais dados permanecem disponíveis e nenhum valor foi estimado." /></div>
          ) : (
            <>
              <div className="mt-5 grid gap-2 sm:grid-cols-3 xl:grid-cols-1 2xl:grid-cols-3">
                <CompactMetric label="Patrimônio a custo" value={formatCaixaCanonicalCurrency(posicaoLiquida.valorPatrimonialCusto)} tone="blue" />
                <CompactMetric label="Empréstimos a pagar" value={formatCaixaCanonicalCurrency(posicaoLiquida.saldoEmprestimosAPagar)} tone="rose" />
                <CompactMetric label="Valor líquido" value={formatCaixaCanonicalCurrency(posicaoLiquida.valorLiquido)} tone={liquidNegative ? 'rose' : 'green'} emphasized />
              </div>
              <Note>{posicaoLiquida.observacao}</Note>
            </>
          )}
        </article>

        <article className="p-5 sm:p-7">
          <div className="flex items-start gap-3">
            <span className="rounded-xl bg-cyan-50 p-2.5 text-cyan-700"><Archive size={18} aria-hidden="true" /></span>
            <div>
              <h4 className="text-base font-extrabold text-slate-900">Inventário em movimento</h4>
              <p className="mt-0.5 text-xs leading-5 text-slate-500">Posição, entradas e perdas reconhecidas na competência.</p>
            </div>
          </div>

          {isPatrimonioLoading ? (
            <div className="mt-5"><LoadingStrip label="Carregando inventário patrimonial" /></div>
          ) : hasPatrimonioError || !patrimonio ? (
            <div className="mt-5"><UnavailableStrip title="Inventário indisponível" copy="Não foi possível carregar a posição patrimonial desta competência." /></div>
          ) : (
            <>
              <div className="mt-5 grid grid-cols-2 gap-2">
                <InventoryMetric
                  icon={<Archive size={14} />}
                  label="Ativo a custo"
                  value={formatCaixaCanonicalCurrency(patrimonio.posicaoFechamento.valorAtivoCusto)}
                  helper={`${quantityFormatter.format(patrimonio.posicaoFechamento.registrosAtivos)} registro(s) ativo(s)`}
                  tone="blue"
                />
                <InventoryMetric
                  icon={<Layers3 size={14} />}
                  label="Unidades ativas"
                  value={quantityFormatter.format(patrimonio.posicaoFechamento.unidadesAtivas)}
                  helper="Disponíveis no fechamento"
                  tone="slate"
                />
                <InventoryMetric
                  icon={<PackagePlus size={14} />}
                  label="Aquisições"
                  value={formatCaixaCanonicalCurrency(patrimonio.aquisicoesCompetencia.valorCusto)}
                  helper={`${quantityFormatter.format(patrimonio.aquisicoesCompetencia.registros)} registro(s) · ${quantityFormatter.format(patrimonio.aquisicoesCompetencia.unidades)} unidade(s)`}
                  tone="cyan"
                />
                <InventoryMetric
                  icon={<AlertTriangle size={14} />}
                  label="Perdas"
                  value={formatCaixaCanonicalCurrency(patrimonio.perdasCompetencia.valorCusto)}
                  helper={`${quantityFormatter.format(patrimonio.perdasCompetencia.movimentos)} baixa(s) · ${quantityFormatter.format(patrimonio.perdasCompetencia.unidades)} unidade(s)`}
                  tone="rose"
                />
              </div>
              <Note>{patrimonio.observacao}</Note>
            </>
          )}
        </article>
      </div>

      {totalData?.observacao ? (
        <div className="flex items-start gap-2 border-t border-slate-100 bg-slate-50 px-5 py-3 text-[10px] leading-4 text-slate-500 sm:px-7">
          <Info size={13} className="mt-0.5 shrink-0 text-blue-600" aria-hidden="true" />
          <span>{totalData.observacao}</span>
        </div>
      ) : null}
    </section>
  );
};

const EquationMetric: React.FC<{
  label: string;
  value: string;
  helper: string;
  icon: React.ReactNode;
  tone: 'blue' | 'cyan' | 'rose';
}> = ({ label, value, helper, icon, tone }) => {
  const toneClass = tone === 'rose' ? 'text-rose-300' : tone === 'cyan' ? 'text-cyan-300' : 'text-blue-300';
  return (
    <div className="flex min-h-[116px] min-w-0 flex-col justify-center rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-4 backdrop-blur-sm">
      <div className={`flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.12em] ${toneClass}`}>{icon}{label}</div>
      <p className="mt-2 truncate text-lg font-extrabold tracking-tight text-white" title={value}>{value}</p>
      <p className="mt-1 text-[10px] leading-4 text-slate-400">{helper}</p>
    </div>
  );
};

const EquationSymbol: React.FC<{ icon: React.ReactNode; label: string }> = ({ icon, label }) => (
  <div className="flex items-center justify-center py-0.5 text-slate-400 md:py-0" aria-label={label}>{icon}</div>
);

const CompactMetric: React.FC<{ label: string; value: string; tone: 'blue' | 'rose' | 'green'; emphasized?: boolean }> = ({ label, value, tone, emphasized = false }) => {
  const toneClass = tone === 'rose' ? 'text-rose-700' : tone === 'green' ? 'text-emerald-700' : 'text-blue-950';
  return (
    <div className={`min-w-0 rounded-xl px-3 py-3 ${emphasized ? 'border border-emerald-100 bg-emerald-50/70' : 'bg-slate-50'}`}>
      <p className="text-[10px] font-semibold text-slate-500">{label}</p>
      <p className={`mt-1 truncate text-base font-extrabold ${toneClass}`} title={value}>{value}</p>
    </div>
  );
};

const InventoryMetric: React.FC<{ icon: React.ReactNode; label: string; value: string; helper: string; tone: 'blue' | 'cyan' | 'rose' | 'slate' }> = ({ icon, label, value, helper, tone }) => {
  const toneClass = tone === 'rose' ? 'text-rose-700' : tone === 'cyan' ? 'text-cyan-700' : tone === 'blue' ? 'text-blue-800' : 'text-slate-800';
  return (
    <div className="min-w-0 rounded-xl border border-slate-100 bg-slate-50/80 p-3">
      <div className={`flex items-center gap-1.5 text-[10px] font-bold ${toneClass}`}>{icon}{label}</div>
      <p className={`mt-1.5 truncate text-base font-extrabold ${toneClass}`} title={value}>{value}</p>
      <p className="mt-1 text-[9px] leading-4 text-slate-400">{helper}</p>
    </div>
  );
};

const LoadingStrip: React.FC<{ label: string; dark?: boolean }> = ({ label, dark = false }) => (
  <div role="status" aria-busy="true" className={`rounded-2xl border p-5 ${dark ? 'border-white/10 bg-white/[0.06]' : 'border-slate-100 bg-slate-50'}`}>
    <div className={`h-3 w-2/3 animate-pulse rounded motion-reduce:animate-none ${dark ? 'bg-white/10' : 'bg-slate-200'}`} />
    <p className={`mt-3 text-xs ${dark ? 'text-slate-300' : 'text-slate-500'}`}>{label}</p>
  </div>
);

const UnavailableStrip: React.FC<{ title: string; copy: string; dark?: boolean }> = ({ title, copy, dark = false }) => (
  <div role="status" className={`flex items-start gap-3 rounded-2xl border p-4 ${dark ? 'border-amber-300/20 bg-amber-300/10 text-amber-100' : 'border-amber-200 bg-amber-50 text-amber-900'}`}>
    <AlertTriangle size={17} className="mt-0.5 shrink-0" aria-hidden="true" />
    <div><p className="text-xs font-bold">{title}</p><p className="mt-1 text-[10px] leading-4 opacity-80">{copy}</p></div>
  </div>
);

const Note: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="mt-3 flex items-start gap-2 rounded-xl bg-slate-50 px-3 py-2.5 text-[10px] leading-4 text-slate-500">
    <ReceiptText size={12} className="mt-0.5 shrink-0 text-slate-400" aria-hidden="true" />
    <span>{children}</span>
  </div>
);
