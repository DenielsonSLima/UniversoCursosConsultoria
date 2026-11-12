# NFS-e: retorno, parceiros e lista

## Escopo técnico
- Validação da prova XML retornada pelo cancelamento; sem inferir sucesso de resposta incompleta.
- Seleção de polos para parceiros PJ por gestor autorizado, preservando polo principal e autorização existente.
- Lista de notas emitidas com três colunas e ações compactas.
- Nenhuma migração de banco ou processamento central em segundo plano nesta entrega.

## Validação
- Testes sintéticos de contratos e interface; tipagem e lint focados.
- Build final e CI exigidos antes da publicação.
- Smoke visual Safari autenticado pendente; não substituído por testes sintéticos.
- Nenhuma emissão, cancelamento ou exclusão fiscal real durante a validação.

## Manifesto explícito
Total: 19 arquivos
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/registros/alteracoes/2026-11-12-nfse-retorno-parceiros-lista.md`
- `internal/versioning/CHANGELOG.md`
- `internal/versioning/changelog/2026-11-05-versao-4-8-247.md`
- `internal/versioning/system-version.json`
- `modules/gestor/emissor-nfse/emitidas/NfseIssuedList.interaction.test.mjs`
- `modules/gestor/emissor-nfse/emitidas/NfseIssuedRows.tsx`
- `modules/gestor/emissor-nfse/emitidas/nfse-issued-downloads.css`
- `modules/gestor/parceiros/ParceirosPage.tsx`
- `modules/gestor/parceiros/components/formularioparceiros/pj/ParceiroPJForm.tsx`
- `modules/gestor/parceiros/components/viewparceiros/pj/PJPolos.test.mjs`
- `modules/gestor/parceiros/components/viewparceiros/pj/PJPolos.tsx`
- `modules/gestor/parceiros/components/viewparceiros/pj/ParceiroPJDetalhes.tsx`
- `modules/gestor/parceiros/utils/pj-polo-scope.test.ts`
- `modules/gestor/parceiros/utils/pj-polo-scope.ts`
- `supabase/functions/_shared/nfse-national/production-cancellation-post-proof.test.ts`
- `supabase/functions/_shared/nfse-national/production-cancellation.ts`
- `supabase/functions/_shared/nfse-national/production-event-detail.test.ts`
