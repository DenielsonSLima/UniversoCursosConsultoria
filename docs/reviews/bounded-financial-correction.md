# Correção financeira limitada — candidato 4.8.181

Código para revisão e testes. Não implantado; nenhum título real foi alterado.
Os arquivos SQL estão em `supabase/review-drafts/bounded-financial-correction`, fora da aplicação automática de migrations.

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

Os sete novos grants propostos, a transformação dos drafts em migrations, o deploy e qualquer execução financeira exigem revisões e aprovações separadas. Helpers privados e tabelas não recebem acesso de usuários ou do serviço.
O registro do lote lista arquivos, evidências e pendências sem incluir alvos reais, dados de pagadores, segredos ou snapshots privados.
