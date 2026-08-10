# Alteração — Financeiro Técnico e autorização de condição individual

- Lote: `2026-08-10-financeiro-tecnico-autorizacao-individual`
- Estado no fechamento: `PRONTO_PARA_PUBLICACAO`
- Projeto Supabase: `kfekgwyqozhicpfuunpo`

## Resultado

- A criação de turma técnica passou a ter cinco etapas. A data final é sugerida 24 meses após o início, permanece editável e o primeiro vencimento é obrigatório.
- Valores são formatados em real brasileiro durante a digitação; `MENS/CICLO` fica alinhado aos demais campos.
- A composição exibe o curso completo: matrícula, primeiro ciclo, rematrícula e segundo e último ciclo, com total nominal anterior a desconto, multa e juros.
- A matrícula do aluno passou a ter quatro etapas: plano da turma, condição individual, simulação/vencimento e geração/confirmação.
- Bolsa, convênio, incentivo ou negociação individual somente libera campos de valor/desconto após código de autorização; juros, multa, vencimento, ciclos e texto do boleto permanecem canônicos da turma.
- A simulação mostra pagamento até o vencimento e atraso de 30 dias com desconto, juros mensal/diário em reais, multa única e valor final devolvidos pelo backend.

## Segurança e cobrança

- O código fica fora de `turmas`, armazenado apenas como hash bcrypt em schema privado; não pode ser recuperado, somente verificado ou redefinido com auditoria.
- A autorização combina RBAC financeiro, turma, gestor e aluno, exige motivo, limita tentativas por turma/gestor e é invalidada quando o código muda.
- Override e remoção de condição individual exigem código no backend; chamadas diretas não podem alterar quantidade de parcelas, ciclos, dia, juros, multa, flags ou texto do boleto.
- Pré-vínculo não gera cobrança. A geração imediata cria somente a matrícula; mensalidades, rematrícula e segundo ciclo seguem a sequência canônica e títulos emitidos permanecem imutáveis.
- A rematrícula não pode ser confundida com isenção: quando configurada, ela separa os dois ciclos; o curso encerra obrigatoriamente depois do segundo ciclo.
- O deploy usa expansão compatível antes do frontend e revoga os RPCs antigos somente após confirmação da aplicação nova em produção.

## Validações

- Formulário de turma: 10/10.
- Financeiro, matrícula e contratos SQL: 47/47.
- TypeScript global e build Vite de 3.445 módulos aprovados para `4.2.0-beta.1`.
- Safari autenticado validou o fluxo principal antes da migration final, sem matricular aluno nem gerar cobrança.
- Revisões de UX, financeiro/RBAC e segurança concluídas sem achado Critical/Important pendente.

## Riscos conhecidos

- Nenhuma cobrança existente foi reprecificada e nenhum PDF financeiro foi alterado.
- A revogação dos RPCs legados é deliberadamente pós-deploy para não interromper a versão anterior durante a publicação.
