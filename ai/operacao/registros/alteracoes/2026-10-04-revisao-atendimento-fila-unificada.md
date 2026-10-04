# Revisão interna — fila unificada de atendimento

## Estado

Revisão e atualização de produção autorizadas pelo responsável em 04/10/2026. Três agentes revisaram frentes independentes, sem navegador. Correções preparadas para 4.8.166 sobre main `2a6ca4f366687b5261af2760d70baa7a27c9a56c`; incorporação condicionada à CI e Preview finais. Sem alteração de Meta, banco, Auth ou RLS.

## Objetivo e aceite

- Revisar somente a entrega da fila única Portal, App e WhatsApp, preservando canais, origens e contratos de envio.
- Impedir que cargas/anexos atrasados de uma conversa apareçam em outra após troca ou desmontagem.
- Não permitir que lote/exclusão antigos limpem uma seleção global nova ou de outra linha.
- Recuperar busca por telefone e manter o filtro de categoria utilizável após falha, remoção ou perda de acesso interno.
- Validar internamente e atualizar GitHub/Vercel sem navegador, conforme solicitação expressa.

## Diagnóstico e correções

1. Corrida no histórico interno: efeito real reproduziu carga, INSERT e conclusão de envio de A aparecendo sob seleção B. Guarda de chat/montagem e cleanup invalidam carga/anexos, inclusive entre layout e cleanup passivo; setter externo valida o chat capturado. Troca limpa o histórico anterior e seleção vazia encerra loading.
2. Conclusão de lote/exclusão: ação antiga modificava a seleção externa nova. Snapshot do Set, montagem e geração da linha isolam conclusões obsoletas.
3. Busca por telefone: normalização havia descartado o telefone pesquisado pela lista anterior. Campo preservado e busca integral, parcial e formatada restaurada sem relaxar status/categoria.
4. Categoria irrecuperável: falha auxiliar/removal/perda de acesso deixava filtro ativo sem seletor. Controle permanece enquanto houver filtro; opção indisponível é identificada e Todas continua acessível.
5. Reabertura do seletor: escolha/Escape fechava mantendo foco; clique seguinte não reabria. Clique explícito passa a reabrir sem alterar o valor até a escolha.

Nenhum P0/P1 novo confirmado. Revisão cruzada final aprovada em todas as frentes, inclusive isolamento de histórico entre layout e cleanup. Nenhum envio, exclusão de histórico ou alteração de dados executados como teste.

## Manifesto explícito

- `modules/gestor/comunicacao/useGestorComunicacaoRealtime.ts`
- `modules/gestor/comunicacao/useGestorComunicacaoRealtime.test.mjs`
- `modules/gestor/comunicacao/components/whatsapp/WhatsAppInbox.tsx`
- `modules/gestor/comunicacao/components/whatsapp/WhatsAppInbox.async.test.mjs`
- `modules/gestor/comunicacao/unified-support-inbox.model.ts`
- `modules/gestor/comunicacao/unified-support-inbox.model.test.ts`
- `modules/gestor/comunicacao/UnifiedSupportInbox.tsx`
- `modules/gestor/comunicacao/UnifiedCategoryFilter.tsx`
- `modules/gestor/comunicacao/unified-support-category.component.test.ts`
- `ai/operacao/registros/alteracoes/2026-10-04-atendimento-fila-unificada.md`
- `ai/operacao/registros/alteracoes/2026-10-04-revisao-atendimento-fila-unificada.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`
- `.github/workflows/quality-gates.yml`

Total: 15 arquivos.

## Validação e limites

- Regressões executam efeito/handlers/componentes reais com timing determinístico e I/O simulado. Não usam DOM, navegador, sessão autenticada ou dados reais.
- Negativo de categorias contra fonte publicada 4.8.165: 0/2 testes passaram; fontes corrigidas: 2/2. WhatsApp assíncrono antes: 2/8; após: 8/8. Corrida interna antes cruzava A/B; após preserva somente B.
- 29/29 testes focados, TypeScript e lint do manifesto aprovados. Build local aprovado durante preparação. CI da base remota completa exigida antes da incorporação.
- Todos os arquivos manuais deste manifesto abaixo de 500 linhas; preservadas as entradas anteriores de versão e workflow da base remota.
- Auditor local de linhas mantém 14 referências legadas ausentes fora deste lote, já conhecidas; não foram alteradas. O manifesto atual será conferido individualmente e pela CI remota.
- Smoke visual/autenticado não executado por proibição expressa de usar navegador; testes internos não substituem essa verificação.
- Versão/changelog/workflow remotos preparados sobre a base publicada; versões e alterações paralelas locais preservadas. LOTE_ATIVO não substituído e corpus RAG padrão não alterado.
