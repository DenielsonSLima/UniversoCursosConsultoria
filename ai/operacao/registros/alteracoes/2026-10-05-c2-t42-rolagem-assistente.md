# Ciclo 2 T42 e rolagem do assistente — 05/10/2026

Mudança crítica financeira com ajuste visual no mesmo fluxo, solicitada pelo responsável. Correção individual aplicada no banco via MCP Supabase em 05/10/2026; nenhuma cobrança emitida. Interface preparada para publicação a partir da base remota 4.8.172.

## Objetivo e aceite

- Confirmar individualmente o C1 importado de uma matrícula T42 cujo primeiro vencimento começou dois meses após o início registrado, mantendo a regra geral de um mês para os demais alunos.
- Após a aplicação, exigir um fato C1 único e auditado, ausência de C2 conhecido e estado canônico elegível apenas para gerar C2. Preservar os 12 recebíveis, pagamentos e datas.
- Ao avançar ou voltar no assistente de geração, posicionar o conteúdo rolável no topo da nova etapa.

## Prova e limites

- Snapshot Proesc completo observado em 01/10/2026, com 12 mensalidades consecutivas, vínculos e hash conferidos. O classificador geral retorna revisão somente porque o primeiro vencimento é em novembro e a data acadêmica local é setembro.
- O worker FULL V2 completou nova consulta da mesma unidade e vínculo em 05/10/2026 às 10:28 UTC: 36/36 meses completos na janela 2025–2027 e 12 faturas da matrícula, sem C2 encontrado. Run `ffe5e706-84b1-4db8-bd9b-8645519543a3`. Telas Proesc fornecidas pelo responsável às 20:47 do mesmo dia mostram 12 registros e o comprovante da parcela 12/12.
- A correção usa matrícula, turma, escopo, identidade, manifesto, cache, revisão e auditoria esperados; aborta se houver C2, conflito ou run local conhecido. Registra a data original da observação e a origem da decisão.
- O fato C1 preserva como fonte a coleta de 01/10; o FULL V2 e as telas de 05/10 corroboram a ausência posterior de C2. O operador ainda deve conferir o sistema anterior antes da emissão.
- A confirmação visual do sistema anterior no assistente é apenas local à interface atual e não integra o payload do backend. Este lote não executa emissão.

## Validação

- Ensaio da operação SQL via MCP Supabase em transação revertida: um fato C1, um evento auditado, estado elegível para C2 e 12 recebíveis preservados dentro da transação; após rollback, evidência, fatos, eventos e runs retornaram ao estado anterior.
- Operação DML versionada executada via MCP `execute_sql`, sem entrada de migration DDL. SHA-256 da fonte: `47e697318f05b392099039c6de8c41964aac8256af33fc815b7c267f3f5d097a`.
- Pós-operação: evidência C1/CONFIRMED revisão 20, fato C1 único, nenhum fato C2 ou run, RPC `ELEGIVEL` para próximo ciclo 2, 12/12 recebíveis PAGO. Teste SQL de contrato aprovado no estado aplicado.
- Teste SQL de contrato exercido dentro do ensaio, incluindo classificação geral ainda restrita e proteção de cronograma com C2.
- Teste focado do assistente: 9/9; ESLint do componente aprovado.
- `npm run check:file-lines` auditou os cinco arquivos deste manifesto, todos abaixo de 500 linhas; o gate global falhou por 22 referências ausentes de manifestos e arquivos de outros lotes.
- Smoke visual local no Safari pendente: a origem local solicitou autenticação. O smoke autenticado será feito na versão publicada.

## Manifesto explícito

Total: 7 arquivos.

- `supabase/operations/2026-10-05-confirm-t42-individual-c1.sql`
- `supabase/tests/t42_individual_two_month_c1.readonly.sql`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/FinanceiroCicloManualDialog.tsx`
- `ai/operacao/registros/alteracoes/2026-10-05-c2-t42-rolagem-assistente.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`
