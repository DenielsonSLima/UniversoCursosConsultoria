# Proesc — composição incompleta e novo acesso financeiro

Data: 03/10/2026. Mudança crítica financeira, sem alteração dos valores recebidos.

## Pedido e evidências

- O responsável pediu tratamento automático dos avisos de composição, forneceu cinco comprovantes completos e resposta do suporte, e autorizou instalar/testar novo token V2.
- Suporte: baixa manual aparece PAGA, sem meio de pagamento; canceladas são omitidas; renegociadas aparecem NEGOCIADA. A V2 não discrimina tarifas/líquido nem componentes aplicados. Ausência isolada continua insuficiente para cancelar localmente.
- Comprovantes individuais discriminam descontos e meios de pagamento. Identidades/vínculos conferidos; documentos pessoais e valores reais não são copiados para documentação/RAG.
- A explicação do suporte sobre parcial por diferença de centavos exige revisão separada das provas históricas; nada foi reaberto ou quitado nesta operação.
- Reprodução real confirmou composição incompleta inclusive sem diferença líquida. Falta de componentes não significa saldo devedor.

## Implementação local

- Nova RPC `get_caixa_composicao_mensal_v2_secure` chama primeiro a V1 autorizada, preserva totais e `completo`, e acrescenta contagens por movimento: sem detalhamento/residual zero versus valor ou diferença a conferir.
- Residual desconhecido permanece em conferência. Diferenças positivas/negativas de movimentos diferentes não se anulam nas contagens. Soma dos novos contadores deve coincidir com o contador V1.
- V1 imutável para compatibilidade; RPC nova somente leitura, search_path vazio e grants mínimos.
- Interface aceita os contratos V1/V2, usa cache V2 e separa os avisos. Falta de componente continua NULL/travessão. Removida a repetição de disclaimer.
- Fallback exclusivamente no erro PGRST202 identificando a nova RPC ausente; autorização, transporte e contrato inválido não provocam fallback. A RPC antiga conserva todas as guardas. Isso não reativa Proesc V1.
- PDF nativo/HTML passam a dizer “com composição a conferir”, sem alterar cálculos, layout ou paginação.
- Não ampliada a política de cálculo de desconto: configurações não comprovam aplicação, descontos por dia específico precisam ser preservados antes de novas inferências, e revisão/vigência da regra deve continuar fixada.

## Credencial e teste remoto autorizados

- Novo token testado por GET V2 dirigido antes da troca: matrícula/financeiro HTTP 200, uma matrícula, página 1/1; parcelas HTTP 200, parcela e pessoa esperadas, PAGA, vencimento/pagamento/valor coerentes.
- Uma consulta preliminar com filtro não suportado retornou coleção ampla; não foi usada como prova de identidade ou completude. A prova válida usa pessoa, ano e mês com dois dígitos.
- Rotação administrativa MCP em transação com executor real e responsável global/Configurações validados, sem simular claims service_role ou alterar grants.
- CAS da revisão, locks de conexão/runtime, ausência de lease ativo, Vault atualizado e WAF preservado. Auditoria privada registra revisão anterior/nova e testes, nunca o segredo.
- Há inventário antigo em andamento; guardas existentes encerram a revisão antiga e o cron retoma. Não houve força de aplicação de respostas antigas nem escrita no Proesc.
- Pós-gravação: ambos os endpoints reconferidos diretamente com a credencial do Vault, HTTP 200, uma linha, página 1/1, sem timeout. Revisão anterior encerrada automaticamente como FAILED por mudança de credencial, sem lease pendente.
- Cron iniciou novo FULL às 03:28 UTC com a revisão atual, 48 tarefas; início confirmado, inventário ainda em andamento. Cinco respostas temporárias de diagnóstico foram removidas da fila HTTP privada após validação.
- Credencial fornecida no chat: recomendada substituição posterior pelo campo seguro. Não registrada em código, fixtures, documentação ou RAG.

## Validação e limites

- Testes isolados PGlite: PASS, incluindo V1 real, paridade, NULLs, sinais opostos, corte/polo, autorização antes dos cores e privilégios.
- Testes focados frontend: 26 passaram e um teste opcional de fixture foi omitido na reexecução final; execução anterior com fixture e demais testes: 33 passaram.
- PDF nativo de teste gerado, texto extraído e página renderizada, recursos institucionais isolados conferidos; sem clipping reportado na revisão visual.
- Revisão independente confirmou predicados, NULLs, paridade e cache. Achado de texto envolvendo residual desconhecido foi corrigido para “valor ou diferença a conferir”.
- Migration 20261003040108 aplicada por MCP em 03/10/2026. Leitura posterior confirmou SECURITY DEFINER com search_path vazio, EXECUTE somente para authenticated, hashes da V1 e do resolvedor financeiro intactos. Fingerprint integral dos recebimentos do recorte permaneceu idêntico antes/depois.
- Chamada remota sem sessão legítima foi recusada por 42501 na guarda de escopo, antes da leitura dos cores. Não foram simuladas claims de usuário nem permissões de service_role.
- Nenhum recebimento, método de pagamento, tarifa ou abertura alterados.
- Comprovantes individuais ainda não inseridos como novas evidências privadas; não declarar os seis avisos resolvidos em produção. Tarifa não disponível na V2 não será inventada.
- Publicação do ajuste expressamente autorizada pelo usuário. Pendentes: CI do commit final, Preview e publicação, além de smoke real Safari e validação positiva da RPC remota com sessão legítima. A troca de token não constitui publicação do ajuste.
- Tentativa de smoke Safari retornou `cgWindowNotFound`; não houve sessão/janela disponível, e não foi utilizado outro navegador.
- Gate de linhas local reportou 25 ausências fora do lote, incluindo arquivos do trabalho paralelo; nenhuma foi alterada para ampliar o escopo. Manifesto atual conferido separadamente, abaixo de 500 linhas por arquivo. Gate do snapshot remoto completo permanece obrigatório.
- Reexecução de publicação: 150 testes Caixa aprovados, dois opcionais omitidos; PGlite revisto independentemente com PASS. Build local interrompido por ProposalDetail.tsx ausente em trabalho paralelo fora do lote; build do snapshot remoto completo é exigido na CI antes do merge.
- Base remota 4.8.151 preservada. O trabalho local paralelo reservou 4.8.152; este lote usa 4.8.153/revisão 162. Workflow, changelog, versão e índice publicados são montados sobre a base remota, sem incluir propostas de renegociação ou apagar alterações locais paralelas.

## Manifesto explícito

Total: 19 arquivos.

- `supabase/migrations/20261003040108_caixa_composition_classification_v2.sql`
- `supabase/tests/caixa_composition_classification_v2.isolated.test.mjs`
- `modules/gestor/caixa/caixa-composicao.types.ts`
- `modules/gestor/caixa/caixa-composicao.validation.ts`
- `modules/gestor/caixa/caixa-composicao.service.ts`
- `modules/gestor/caixa/caixa-composicao.queries.ts`
- `modules/gestor/caixa/caixa-composicao.presentation.ts`
- `modules/gestor/caixa/caixa-composicao.test.ts`
- `modules/gestor/caixa/components/CaixaCompositionCards.tsx`
- `modules/gestor/caixa/components/CaixaCompositionCards.test.tsx`
- `modules/gestor/caixa/report/CaixaReportTables.tsx`
- `modules/gestor/caixa/report/caixa-report.vector-pdf.tables.ts`
- `modules/gestor/caixa/report/caixa-report.composicao-parcial.test.tsx`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/registros/alteracoes/2026-10-03-proesc-composicao-automatica.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `.github/workflows/quality-gates.yml`
- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`
