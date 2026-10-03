import type { ContaBancaria, FinanceiroPolo } from '../../financeiro.types';

export const formatTransferCurrency = (value: number) =>
  value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function poloTransferenciaOption(polo: FinanceiroPolo) {
  const digits = String(polo.cnpj || '').replace(/\D/g, '');
  const document = digits.length === 14
    ? digits.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5')
    : polo.cnpj || 'CNPJ não informado';
  const location = [polo.cidade, polo.estado || polo.uf].filter(Boolean).join('/');
  return {
    id: polo.id,
    label: `${polo.is_matriz ? 'Matriz' : 'Polo'} - ${polo.nome}`,
    detail: `${document} · ${location || 'Cidade/UF não informada'}`,
  };
}

export function contaTransferenciaOption(account: ContaBancaria) {
  const saldo = typeof account.saldoGerencialPolo === 'number' && Number.isFinite(account.saldoGerencialPolo)
    ? `R$ ${formatTransferCurrency(account.saldoGerencialPolo)}` : 'indisponível';
  return {
    id: account.id!,
    label: [account.banco, account.conta].filter(Boolean).join(' - '),
    detail: `Saldo deste polo: ${saldo}${account.agencia ? ` · Ag. ${account.agencia}` : ''}`,
  };
}
