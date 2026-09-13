# Conferência Proesc no Caixa por polo

Estado: banco e coletor aplicados; frontend 4.8.58 em fechamento, sem alteração financeira manual.

## Problema e resultado

- O coletor confundia a competência da consulta contábil com a data econômica do pagamento. Uma resposta única fora da competência era enviada à revisão.
- A RPC perdia os códigos específicos do coletor e preservava somente seus motivos genéricos. Os novos códigos ficam privados, sanitizados e separados da decisão financeira.
- Receitas futuras incluíam estados técnicos de importação sem comprovação de obrigação aberta. O agregado passa a exigir a mesma evidência canônica e informar sua cobertura.
- Pagamentos repetidos entre períodos, conflitos de identidade, datas inválidas e ausência de prova continuam em conferência. Nenhum saldo, situação ou pagamento é presumido.
- Consultas individuais oficiais somente de leitura comprovaram a semântica da competência. O recurso alternativo de extrato respondeu com redirecionamento bloqueado.
- Usuário autorizou aplicar/publicar e proibiu navegador. Diagnóstico, revisão por três agentes e verificações seguem internos. Nenhuma mensagem a terceiros integra este lote.

## Aceite e validação

- Pagamento único preserva data e valor da origem, inclusive fora da competência; conjuntos de várias respostas não são somados.
- Cobranças locais permanecem nos compromissos e Proesc depende de OPEN verificado.
- Diagnóstico interno exige segredo específico validado no servidor e retorna somente agregados; não grava cobranças nem expõe credenciais ou identidades.
- Histórico de snapshots e decisões financeiras permanece imutável.
- Testes focados, contrato RPC real, conferência por polo e publicação atômica do manifesto.
- Resultados financeiros privados e amostras não integram este registro nem a publicação.
- A revisão automática interrompeu frentes adicionais de diagnóstico. Elas foram canceladas; a continuação usa revisão local e contratos existentes.

- Migrations canônicas `20260913132019` e `20260913132033` aplicadas com asserções contratuais na mesma transação. Coletor `proesc-api` versão 9 ativo.
- RPC mensal e posição total conferidas nos quatro polos; todos os contratos responderam.
- Verificação visual autenticada não executada, conforme proibição expressa de navegador.

- Validação final: 49 testes Edge, 11 testes Caixa, TypeScript focal sem diagnósticos e build completo aprovados.
- Execução automática natural do coletor após o deploy concluiu sem falhas; os pagamentos ainda não revisitados pelo ciclo não são declarados regularizados.
- Teto de linhas conferido sobre o pacote de publicação, com o lote acadêmico herdado da base remota. Changelog antigo arquivado sem perda de histórico.

## Manifesto explícito

Total: 21 arquivos.

- `supabase/functions/proesc-api/diagnostic-readonly.ts`
- `supabase/functions/proesc-api/diagnostic-readonly.test.ts`
- `supabase/functions/proesc-api/handler.ts`
- `supabase/functions/proesc-api/handler.test.ts`
- `supabase/functions/proesc-api/sync-observation.ts`
- `supabase/functions/proesc-api/sync-observation.test.ts`
- `supabase/migrations/20260913132019_proesc_collector_review_reasons.sql`
- `supabase/tests/proesc_collector_review_reasons.readonly.sql`
- `supabase/migrations/20260913132033_caixa_open_receivables_evidence.sql`
- `supabase/tests/caixa_open_receivables_evidence.readonly.sql`
- `modules/gestor/caixa/caixa.types.ts`
- `modules/gestor/caixa/caixa.contracts.ts`
- `modules/gestor/caixa/caixa.mappers.ts`
- `modules/gestor/caixa/caixa-data-scope.test.ts`
- `modules/gestor/caixa/components/CaixaCompromissosCards.tsx`
- `modules/gestor/caixa/components/CaixaCompromissosCards.test.tsx`
- `ai/operacao/registros/alteracoes/2026-09-13-proesc-conferencia-polos.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`
- `internal/versioning/changelog/2026-09-01-versoes-4-8-20-a-4-8-22.md`

O lote acadêmico paralelo e seus arquivos operacionais permanecem preservados.
