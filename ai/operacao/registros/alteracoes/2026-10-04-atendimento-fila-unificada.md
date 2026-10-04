# Atendimento — fila unificada

## Estado

Publicação em produção autorizada pelo responsável em 04/10/2026. A pedido expresso do responsável, a entrega é feita internamente por MCP, sem navegador; smoke visual final não executado. Implementação local validada por TypeScript, lint focado, testes e build. GitHub/CI/Preview e resultado em produção serão acompanhados antes de declarar a entrega concluída.

## Objetivo e aceite

- Substituir as abas Portal/App e WhatsApp por uma lista única ordenada pela última atividade.
- Identificar cada origem com ícone e legenda; preservar a linha WhatsApp de cada conversa.
- Usar busca e status compartilhados; conservar filtro de categoria e ações WhatsApp em lote.
- Abrir o detalhe e responder pelo canal de origem, sem migrar ou fundir históricos.
- Manter as permissões existentes, serviços de envio e ações de atendimento.

## Escopo e risco

Somente apresentação e orquestração do atendimento. Sem migration, alteração de RLS, credenciais ou configuração Meta. Controllers legados grandes não foram editados. Lote operacional ativo e alterações paralelas preservados. Ações reais de envio, encerramento e exclusão não foram executadas como teste.

## Manifesto explícito

- `modules/gestor/comunicacao/UnifiedCommunicationPage.tsx`
- `modules/gestor/comunicacao/UnifiedSupportInbox.tsx`
- `modules/gestor/comunicacao/UnifiedCategoryFilter.tsx`
- `modules/gestor/comunicacao/UnifiedWhatsAppDetail.tsx`
- `modules/gestor/comunicacao/UnifiedWhatsAppStart.tsx`
- `modules/gestor/comunicacao/useUnifiedSupportInbox.ts`
- `modules/gestor/comunicacao/unified-support-inbox.model.ts`
- `modules/gestor/comunicacao/unified-support-inbox.model.test.ts`
- `modules/gestor/comunicacao/unified-support-selection.ts`
- `modules/gestor/comunicacao/unified-support-selection.test.ts`
- `modules/gestor/comunicacao/GestorComunicacaoParts.tsx`
- `modules/gestor/comunicacao/useGestorComunicacaoRealtime.ts`
- `modules/gestor/comunicacao/components/whatsapp/WhatsAppInbox.tsx`
- `modules/gestor/comunicacao/components/StartInternalConversationModal.tsx`
- `styles.css`
- `ai/operacao/registros/alteracoes/2026-10-04-atendimento-fila-unificada.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`
- `.github/workflows/quality-gates.yml`

Total: 20 arquivos.

## Validação

- Testes de ordenação, origem, status/busca, categorias e identidade entre linhas/canais.
- Oito testes do modelo, registro de início interno, sincronização e cancelamento da seleção.
- Revisão adicional sem P0/P1; três P2 corrigidos: restauração ao cancelar, linha selecionada mantida em novos envios e falhas de não lidas/categorias degradando apenas indicadores auxiliares.
- TypeScript e lint específico do manifesto: aprovados.
- Build de produção local: aprovado, com avisos existentes de chunk/import dinâmico.
- Teto de 500 linhas: arquivos do manifesto abaixo do limite. `npm run check:file-lines` executado; auditoria global bloqueada por 14 referências/arquivos legados ausentes, fora deste lote. Não foi alterada dívida de outros domínios.
- Smoke visual final: não executado por solicitação expressa de não usar navegador; limitação preservada.
- Base GitHub verificada: arquivos existentes do manifesto iguais à base local, sobre main `c526b7e62727d226949a7e4f36f160631c6d5764`.
- Produção autorizada, condicionada à CI/Preview e verificação interna da versão publicada.
