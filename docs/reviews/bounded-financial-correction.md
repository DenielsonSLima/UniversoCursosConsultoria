# Correção financeira limitada — candidato 4.8.181

Estado verificado em 2026-10-07: 14 migrations de implementação e uma migration de sete grants aprovados estão instaladas.
As cópias canônicas em `supabase/migrations` preservam os payloads exatos do histórico remoto; os drafts originais continuam disponíveis para os testes isolados.
O worker de recuperação está ativo na versão 12 e o emissor na versão 10. A execução financeira dos 49 títulos permanece pendente; implantação não significa cancelamento, ajuste interno ou reemissão concluídos.

## Contrato

- Manter obrigações e runs originais do C1, com datas e termos projetados por prova auditável.
- Exigir cancelamento bancário terminal de todos os itens autorizados antes do ajuste interno atômico.
- Preservar transações anteriores e impedir reabertura do C2 cancelado.
- Distinguir dispensa LOCAL nunca paga de histórico LOCAL pago e preservado; não inferir pagamento, estorno ou devolução.
- Exigir revisão completa e novo consentimento do usuário atual antes da retomada manual.
- O worker de cancelamento retorna sem chamar o emissor; nenhuma comunicação ao aluno é enviada.

## Estado e limites

A base local contém testes SQL com dados exclusivamente sintéticos, componentes DOM com I/O simulado, caminho canônico de emissão com banco simulado e conferência do JSON real das RPCs pelos parsers de UI/Edge.
Isso não substitui build/tipagem completos, teste de concorrência com sessões PostgreSQL independentes, smoke Safari autenticado nem prova do comportamento real do banco.

Os sete grants aprovados foram instalados na migration `20261007231549_bounded_financial_correction_approved_runtime_grants`. Helpers privados e tabelas não recebem acesso de usuários ou do serviço.
Os comentários originais de revisão/proposta nos SQL aplicados foram preservados por imutabilidade; o histórico remoto confirma sua instalação.
A pendência de R$ 200,00 permanece separada e não resolvida, sem inferir baixa, estorno ou devolução. A reemissão continua manual e exige revisão e novo consentimento real.
O registro do lote lista arquivos, evidências e pendências sem incluir alvos reais, dados de pagadores, segredos ou snapshots privados.
