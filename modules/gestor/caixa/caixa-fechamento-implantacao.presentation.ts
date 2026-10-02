import type { CaixaFechamentoImplantacao } from './caixa.types';
import { formatCaixaCanonicalCurrency, formatCaixaDate } from './caixa.formatters';

/** Shared UI/PDF text. Every amount is canonical; no balance is recomputed. */
export const caixaFechamentoImplantacaoPresentation = (value?: CaixaFechamentoImplantacao) => (
  value ? {
    title: 'Fechamento operacional da implantação Proesc',
    lines: [
      `Histórico reexpresso: ${formatCaixaCanonicalCurrency(value.saldoHistoricoControleProesc)} · Ajuste de encerramento: ${formatCaixaCanonicalCurrency(value.ajusteEncerramentoOperacional)}`,
      `Encerramento em ${formatCaixaDate(value.dataEncerramento)}: ${formatCaixaCanonicalCurrency(value.saldoEncerramentoProesc)} · Abertura em ${formatCaixaDate(value.dataAbertura)}: ${formatCaixaCanonicalCurrency(value.saldoAberturaProesc)}`,
      'Somente Controle Proesc abrangido pela implantação; não é receita nem despesa. Histórico e pagamentos preservados.',
    ],
  } : null
);
