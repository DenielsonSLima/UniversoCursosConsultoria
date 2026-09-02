import React from "react";
import type { CicloFinanceiroTecnicoManualPreviewItem } from "./matricula-tecnica-ciclo-manual.types";

interface FinanceiroCicloManualChargeRowsProps {
  item: CicloFinanceiroTecnicoManualPreviewItem;
  variant: "composition" | "review";
}

const formatMoney = (value: string) =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number(value));

const formatDate = (value: string) =>
  new Date(`${value}T00:00:00`)
    .toLocaleDateString("pt-BR");

const formatPercent = (value: string) =>
  `${
    new Intl.NumberFormat("pt-BR", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 6,
    }).format(Number(value))
  }%`;

const itemTypeLabel = (item: CicloFinanceiroTecnicoManualPreviewItem) => {
  if (item.tipo === "MATRICULA") return "Matrícula";
  if (item.tipo === "REMATRICULA") return "Rematrícula";
  return `Mensalidade ${item.numero}`;
};

const FinanceiroCicloManualChargeRows: React.FC<
  FinanceiroCicloManualChargeRowsProps
> = ({ item, variant }) => {
  const details = item.detalhesBoleto;
  const titleId = `manual-cycle-charge-${item.chave}`;

  return (
    <article
      aria-labelledby={titleId}
      data-testid={`manual-cycle-charge-${variant}`}
      className="px-4 py-4"
    >
      <div
        data-charge-line="principal"
        className="grid gap-3 text-xs sm:grid-cols-[minmax(0,1fr)_8rem_9rem] sm:items-center"
      >
        <div>
          <p id={titleId} className="font-black text-[#001a33]">
            {item.descricao}
          </p>
          <p className="mt-1 text-[9px] font-black uppercase text-slate-400">
            {itemTypeLabel(item)}
          </p>
        </div>
        <div>
          <p className="text-[9px] font-black uppercase text-slate-400">
            Vencimento
          </p>
          <p className="mt-0.5 font-bold text-slate-700">
            {formatDate(item.vencimento)}
          </p>
        </div>
        <div className="sm:text-right">
          <p className="text-[9px] font-black uppercase text-slate-400">
            Valor nominal
          </p>
          <p className="mt-0.5 font-black text-[#001a33]">
            {formatMoney(details.valorNominal)}
          </p>
        </div>
      </div>

      <dl
        data-charge-line="condicoes-boleto"
        className="mt-3 grid gap-px overflow-hidden rounded-xl border border-slate-200 bg-slate-200 text-[10px] sm:grid-cols-2 xl:grid-cols-4"
      >
        <div className="bg-emerald-50 p-3">
          <dt className="font-black uppercase text-emerald-700">
            {details.desconto
              ? `Desconto até ${formatDate(details.desconto.validoAte)}`
              : "Desconto até o vencimento"}
          </dt>
          <dd className="mt-1 font-black text-emerald-950">
            {details.desconto
              ? `${formatMoney(details.desconto.valor)} | Pague em dia ${
                formatMoney(details.valorEmDia)
              }`
              : `Sem desconto | Pague em dia ${
                formatMoney(details.valorEmDia)
              }`}
          </dd>
        </div>
        <div className="bg-rose-50 p-3">
          <dt className="font-black uppercase text-rose-700">
            {details.multa
              ? `Multa a partir de ${formatDate(details.multa.iniciaEm)}`
              : "Multa após o vencimento"}
          </dt>
          <dd className="mt-1 font-black text-rose-950">
            {details.multa
              ? `${formatPercent(details.multa.percentual)} = ${
                formatMoney(details.multa.valor)
              }`
              : "Sem multa"}
          </dd>
        </div>
        <div className="bg-amber-50 p-3">
          <dt className="font-black uppercase text-amber-700">
            {details.juros
              ? `Juros a partir de ${formatDate(details.juros.iniciaEm)}`
              : "Juros após o vencimento"}
          </dt>
          <dd className="mt-1 font-black text-amber-950">
            {details.juros
              ? `${formatMoney(details.juros.valorDia)} ao dia · ${
                formatPercent(details.juros.percentualMes)
              } ao mês`
              : "Sem juros"}
          </dd>
        </div>
        <div className="bg-slate-50 p-3">
          <dt className="font-black uppercase text-slate-500">
            Mensagem do boleto
          </dt>
          <dd className="mt-1 break-words whitespace-normal font-bold leading-relaxed text-slate-700">
            {details.mensagensBoleto.length > 0
              ? details.mensagensBoleto.map((mensagem, index) => (
                <span
                  key={`${item.chave}-mensagem-boleto-${index}`}
                  className="block break-words whitespace-pre-wrap [overflow-wrap:anywhere]"
                >
                  {mensagem}
                </span>
              ))
              : <span>Sem mensagem adicional.</span>}
          </dd>
        </div>
      </dl>
    </article>
  );
};

export default FinanceiroCicloManualChargeRows;
