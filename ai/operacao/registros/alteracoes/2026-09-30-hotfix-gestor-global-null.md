# Hotfix de carregamento do Gestor global

Estado: VALIDADO PARA PUBLICAÇÃO — PRODUÇÃO AUTORIZADA

## Objetivo e aceite

Restaurar imediatamente o Portal do Gestor em produção para perfis globais, eliminando a tela branca causada ao montar a chave da busca global quando `allowedPoloIds` é `null`. O valor nulo deve continuar significando acesso global; perfis restritos devem manter uma lista ordenada sem mutar o estado original.

## Manifesto explícito

- `modules/gestor/gestor.page.tsx`
- `modules/gestor/global-search/gestor-global-search.model.ts`
- `modules/gestor/global-search/gestor-global-search.model.test.ts`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/registros/alteracoes/2026-09-30-hotfix-gestor-global-null.md`
- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`

Total: 8 arquivos.

## Causa e correção

- A versão 4.8.132 tentou executar spread em `gestorScope.allowedPoloIds` ao compor a chave da busca.
- A guarda canônica representa gestores globais com `allowedPoloIds: null`; por isso o spread lançava `TypeError` durante a renderização e derrubava toda a tela.
- A composição da chave foi isolada em uma função testável que trata apenas listas reais como iteráveis e preserva `null` para o acesso global.
- Listas restritas são copiadas e ordenadas, sem alteração do perfil em memória.

## Validação

- Falha reproduzida no Safari autenticado em produção com `TypeError: Spread syntax requires ...iterable not be null or undefined`.
- Três agentes revisaram em paralelo a causa de runtime, os demais spreads do fluxo inicial e a cobertura de regressão; não foi identificado outro bloqueador equivalente.
- Oito testes focados da busca global aprovados.
- TypeScript sem emissão, ESLint focado e build de produção aprovados.
- Publicação em produção foi autorizada explicitamente pelo usuário; smoke autenticado final será executado após o deploy do hotfix.
