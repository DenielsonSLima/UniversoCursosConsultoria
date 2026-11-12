export const nfseDescriptionVariables = [
  { token: '{{periodo}}', label: 'Período do serviço', help: 'Datas inicial e final escolhidas ao preparar cada serviço; não altera a competência fiscal.' },
  { token: '{{curso}}', label: 'Curso da turma', help: 'Nome real do curso da turma selecionada nos recebimentos.' },
  { token: '{{matricula}}', label: 'Matrícula', help: 'Número da matrícula vinculada a cada recebimento, no padrão acadêmico da unidade.' },
  { token: '{{parcelas}}', label: 'Mensalidades/parcelas', help: 'Números estruturados das parcelas e seus meses efetivos de pagamento.' },
  { token: '{{meses_pagamento}}', label: 'Meses de pagamento', help: 'Meses reais dos pagamentos selecionados, sem usar a competência fiscal.' },
  { token: '{{mes_referencia}}', label: 'Mês dos recebimentos', help: 'Variável anterior; nas preparações acadêmicas usa os meses efetivos dos pagamentos.' },
] as const;

export const nfseAcademicDescriptionTemplate = 'REFERENTE AOS SERVIÇOS EDUCACIONAIS DO CURSO {{curso}}; MATRÍCULA(S): {{matricula}}; MENSALIDADE(S)/PARCELA(S): {{parcelas}}; PAGAMENTO(S) EFETUADO(S) EM {{meses_pagamento}}.';

export function insertNfseDescriptionVariable(value: string, token: string, start = value.length, end = start) {
  if (!nfseDescriptionVariables.some(variable => variable.token === token)) return null;
  const next = value.slice(0, start) + token + value.slice(end);
  return [...next].length <= 2000 ? next : null;
}
