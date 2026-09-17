# Referência da consulta Proesc na conciliação — 2026-09-16

## Objetivo e autorização

Quando o horário da baixa não estiver disponível, apresentar a referência temporal da consulta à API Proesc com identificação própria. O usuário solicitou reunião, revisão, implantação em produção e revisão posterior, mantendo validação interna sem navegador. A aplicação do backend foi seguida de revisão independente; a publicação completa é acompanhada no PR do lote.

## Contrato e implementação

- A projeção canônica acrescenta `proesc_evidence.apiConsultedAt` exclusivamente quando a observação mais recente possui origem API comprovada.
- Evidências de portal, não resolvidas ou sem origem API não fornecem essa referência. O campo genérico `observedAt` não é fallback no frontend.
- A referência corresponde ao horário registrado da observação/lote de consulta; não afirma o instante exato de encerramento HTTP, do pagamento ou da baixa.
- Consulta comprovada pode coexistir com composição financeira em revisão. O estado financeiro e sua proveniência permanecem intactos.
- A interface utiliza campo independente e validado, somente para Proesc: `Consulta à API`, com legenda explicando que a referência não é o horário da baixa.
- Quando há horário real da baixa, ele tem prioridade. Nenhuma referência de consulta é gravada em `baixaRegistradaEm` ou usada como data econômica.
- Timestamp ausente, inválido ou sem fuso explícito mantém a apresentação de ausência. Cada nova resposta canônica atualiza a referência exibida.

## Critérios de aceite

- Referência de API comprovada aparece em desktop e celular, convertida ao fuso de apresentação do sistema.
- Observação genérica, origem sem prova, campo inválido ou ausente não podem gerar horário fabricado.
- Data de pagamento usada no Caixa, horário real de baixa, composição, forma e conta mantêm os valores canônicos.
- Consulta não transforma pagamento ou composição em confirmado. Campos desconhecidos permanecem desconhecidos.
- Filtros, paginação, contagens, autorização e operações bancárias não são alterados.

## Manifesto explícito

- `modules/gestor/financeiro/conciliacao-bancaria/conciliacao-bancaria.fetch.ts`
- `modules/gestor/financeiro/conciliacao-bancaria/conciliacao-recebimentos.model.ts`
- `modules/gestor/financeiro/conciliacao-bancaria/conciliacao-recebimentos.model.test.ts`
- `modules/gestor/financeiro/conciliacao-bancaria/components/ConciliacaoRecebimentoRows.tsx`
- `modules/gestor/financeiro/conciliacao-bancaria/components/ConciliacaoRecebimentoRows.test.tsx`
- `supabase/migrations/20260917033000_expose_proesc_api_consultation_time.sql`
- `supabase/tests/proesc_api_consultation_time.transaction.sql`
- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/registros/alteracoes/2026-09-16-conciliacao-horario-consulta.md`

Total: 12 arquivos. CI já executa os testes de mapper e renderização; não exige alteração. Memória, registros anteriores e artefatos temporários ficam fora do manifesto.

## Validação e entrega

- Vinte e três testes de mapper/renderização aprovados, cobrindo fuso, campo ausente/inválido, prioridade da baixa real, atualização em nova resposta e preservação da revisão financeira.
- Lint focado dos cinco arquivos frontend aprovado; revisão independente da interface sem achados. Navegador não utilizado.
- Onze cenários SQL aprovados em transação com rollback: integração com resolver real, origens API e não API, revisão financeira, ausência de horário e preservação integral dos demais campos.
- TypeScript, build, lint e teto do manifesto aprovados. Reindexação única no fechamento.
- Backend aplicado via MCP e revisado após a aplicação: RPC autenticada retorna a consulta em campo separado, preservando os demais dados. Listagem paginada validada sob o limite existente.
- Hashes da listagem, resolver e relatório mensal preservados; helper mantém privilégios e search_path restritos.
- Versão 4.8.68 / revisão 77 sobre a entrega anterior 4.8.67. Estado: BACKEND VALIDADO — EM PUBLICAÇÃO. Resultado de CI, Preview, deploy e conferência do domínio registrado no PR do lote.
- GitHub e Supabase são operados exclusivamente pelos respectivos MCPs, com manifesto explícito. O registro não inclui dados pessoais, identidades de produção ou telemetria privada.
