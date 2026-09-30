# Hotfix do reenvio no cadastro de aluno

Estado: VALIDADO E AUTORIZADO PARA PRODUÇÃO

## Objetivo e aceite

Impedir que clique duplo ou Enter repetido disparem o cadastro do mesmo aluno enquanto a primeira solicitação ainda conclui o provisionamento de acesso. A tela deve informar “Salvando...”, bloquear as ações concorrentes e liberar nova tentativa quando houver erro.

## Causa confirmada

- O primeiro clique já criava o aluno, mas o formulário permanecia interativo durante as etapas assíncronas posteriores.
- Um segundo clique executava novamente a pré-checagem, encontrava o CPF recém-criado e mostrava “Aluno já cadastrado”.
- Os logs do fluxo confirmaram um único INSERT; o problema era replay da interface, não duplicidade de linha.

## Correção

- A página usa `mutateAsync` e repassa `isPending` ao formulário.
- Uma guarda síncrona com `useRef` é ativada antes do `await`, cobrindo clique e Enter antes mesmo do rerender.
- O `finally` libera a guarda após sucesso ou erro, inclusive em rejeição imediata.
- Botão, cancelamento, retorno e navegação ficam desabilitados, com spinner, `aria-busy` e o texto “Salvando...”.
- O teste do hotfix passa a integrar o gate de primeiro acesso do aluno no CI.

## Integração concorrente

Durante a abertura do PR, o `main` avançou para a versão 4.8.137. Esse merge já continha o encadeamento `mutateAsync`/`isPending` em `ParceirosPage.tsx` e `ParceiroFormHost.tsx`, mas ainda não continha a guarda no formulário nem o teste. O hotfix foi reconstruído sobre essa base viva, sem reverter as mudanças de professor/Pix e sem repetir blobs já integrados.

## Manifesto explícito

- `.github/workflows/quality-gates.yml`
- `modules/gestor/parceiros/components/formularioparceiros/aluno/ParceiroAlunoForm.tsx`
- `modules/gestor/parceiros/parceiros-aluno-submit-guard.contract.test.ts`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/registros/alteracoes/2026-09-30-hotfix-cadastro-aluno-reenvio.md`
- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`

Total: 8 arquivos.

## Dependências conferidas na base

- `modules/gestor/parceiros/ParceirosPage.tsx`
- `modules/gestor/parceiros/components/ParceiroFormHost.tsx`

## Validação

- 15 contratos focados do módulo aprovados.
- TypeScript sem emissão, ESLint focado e build de produção aprovados.
- Revisão independente sem achados bloqueantes após substituir o retorno imediato por `mutateAsync` + `finally`.
- Smoke isolado no Safari, usando o componente real, confirmou dois disparos imediatos com exatamente um envio e botão desabilitado em “Salvando...”.
- Nenhuma alteração de banco, Supabase, Auth, RLS ou backend.

## Publicação

- Versão `4.8.138`, revisão `147`, construída sobre o `main` 4.8.137.
- Publicação por branch, Pull Request e Preview Vercel atômicos; produção foi autorizada explicitamente pelo usuário nesta conversa.

