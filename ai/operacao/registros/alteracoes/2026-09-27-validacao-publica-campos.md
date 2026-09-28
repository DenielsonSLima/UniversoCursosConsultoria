# Correção da consulta pública por documento

Estado: migration aplicada em produção; publicação 4.8.126 autorizada e em andamento.
Lote independente do Caixa em andamento; LOTE_ATIVO preservado para evitar sobrescrever trabalho paralelo.

## Problema e aceite

A configuração de campos estava salva, mas a migration de assinatura 20260820002006 substituiu a RPC por uma versão sem perfil público versionado. O frontend restringia corretamente esse retorno legado a instituição e emissão.

Aceite: retornar apenas a interseção dos campos autorizados na emissão e na configuração atual, mantendo snapshot mascarado, disponibilidade pública, validade e fluxos de preceptor/diário. Mostrar a quantidade de emissões habilitada também quando igual a um.

## Manifesto explícito

- `supabase/migrations/20260928014743_restore_document_validation_public_profiles.sql`
- `supabase/tests/document_validation_effective_rpc.contract.test.ts`
- `modules/public/validator/carteirinha/CarteirinhaValidationResult.tsx`
- `modules/public/validator/shared/AcademicDocumentValidationCard.tsx`
- `modules/public/validator/validator-public-profile.rendering.test.tsx`
- `scripts/test-document-validation.mjs`
- `ai/operacao/registros/alteracoes/2026-09-27-validacao-publica-campos.md`

- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`

Total: 9 arquivos.

## Validação

- Três frentes: configuração, backend e renderização; revisão independente da migration.
- Safari autenticado confirmou os campos selecionados; consulta pública reproduziu somente instituição/data antes da correção.
- Função temporária equivalente à migration final, via MCP e ROLLBACK, validou Pasta com 13 campos e 26 carteirinhas com 12 campos; perfil versionado, interseção, ausência de identificador interno e código inválido conferidos sem persistir alteração.
- `npm run test:document-validation`: 162 testes aprovados (140 Deno, 10 histórico, 12 renderização).
- Novo teste verifica a última definição efetiva da RPC e detecta a regressão histórica.
- Safari local confirmou renderização com dados fictícios para Pasta, Ficha e carteirinha, campos habilitados/ocultos e máscaras; smoke ponta a ponta após aplicação permanece pendente.
- Manifesto local: todos os arquivos abaixo de 500 linhas. `npm run check:file-lines` global falha por 12 caminhos/manifesto ausentes de outros lotes; nenhuma correção fora do escopo.
- Build completo de produção aprovado após autorização de publicação.

## Entrega e limites

Migration aplicada via MCP no projeto Universo, ledger 20260928014743. Pós-aplicação confirmou Pasta com 13 campos inclusive como anon, 26 carteirinhas com 12 campos, ausência de identificador interno e código inválido nulo. Nenhuma reemissão executada. A Pasta reproduzida não exige reemissão para recuperar seus campos. Campos novos que não faziam parte do snapshot original continuam exigindo reemissão, conforme contrato existente.

O bloqueio atual de consulta foi restaurado nos ramos acadêmico/preceptor e acrescentado ao fallback do Diário assinado. A prova individual de assinatura permanece em sua RPC própria.

Migrations históricas aplicadas foram preservadas sem edição. Registro sem dados pessoais; artefatos temporários de QA ficam fora do manifesto. Nenhuma fonte do corpus RAG foi alterada.

Autorização: usuário solicitou explicitamente “publique autorizado para tudo”. Versão 4.8.126 evita reutilizar o número 4.8.125 de outro lote revertido. Base remota conferida: 906b8d1145dc3c1135f0432d95f5f3421c2cb3fd.
