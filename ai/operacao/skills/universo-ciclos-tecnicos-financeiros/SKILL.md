---
name: universo-ciclos-tecnicos-financeiros
description: Corrigir e validar ciclos técnicos do Universo com histórico Proesc, títulos Banese importados ou nativos, matrícula local sem boleto e cancelamento após trancamento. Usar para elegibilidade, passagem de ciclo, confirmação manual ou regressões desses fluxos.
---

# Ciclos técnicos financeiros

Leia o [contrato de passagem e proveniência](../../../../docs/contracts/ciclos-tecnicos-passagem-e-proveniencia.md)
e o [contrato de composição e baixa](../../../../docs/decisions/ciclos-tecnicos-cobrancas.md)
antes de mudar elegibilidade, emissão, trancamento ou recebimento. AGENTS e a
[política financeira](../../politicas/FINANCEIRO.md) prevalecem sobre esta skill.

- Resolva matrícula+ciclo+origem. Não use turma, quantidade de parcelas, quitação
  ou status acadêmico isolados como prova de cobertura.
- Proesc confirmado é histórico consultável; futuras cobranças autorizadas são
  Universo/Banese. A geração não depende de repetir uma consulta online cuja
  passagem já foi comprovada. UNKNOWN/timeout não apaga confirmação anterior.
- Preservar proteção de C2 existente, identidade, polo e bloqueio acadêmico.
  Origem importada não é autorização irrestrita para gerar.
- Banese importado preserva proveniência; não fabricar run nativo, autorização
  de emissão ou novo Nosso Número para fazer o fluxo aceitar um título existente.
- Prévia aprovada não basta: teste o handler da confirmação com payload de itens
  canônicos, parser real, fingerprints e chave idempotente, sem edição e com edição.
  Não relaxar parser para aceitar revisão vazia.
- Matrícula LOCAL sem boleto pode ser retroativa; não é pagamento. Cálculo das
  parcelas permanece na RPC. Não transformar mês-calendário em soma fixa de dias.
- Trancamento só cancela futuros não pagos após o corte comprovado. Mostrar
  espera/revisão até confirmação Banese; então CANCELADO sai do saldo pendente,
  mantendo histórico. Reativação nunca revive título bancário cancelado.
- Testes não emitem nem cancelam no banco real. Mock bancário e rollback não
  autorizam ignorar smoke do fluxo; declare limites de validação e de publicação.
- Alterações na fila exigem percorrer claim, start e complete com rollback;
  testar só enqueue/prévia não cobre a conclusão. A transação bancária passa a
  CANCELED antes do recebível: a cerca final não pode exigir o status anterior.

Para contratos bancários, use a skill disponível `universo-banese-bolepix-contract`;
para leitura/ingestão Proesc, `universo-proesc-api`. Elas não substituem a decisão
de negócio acima. Atualizar governança em lote separado do hotfix de produto.
