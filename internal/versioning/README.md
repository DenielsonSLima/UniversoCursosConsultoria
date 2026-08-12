# Controle interno de versão

Esta pasta é a fonte oficial para identificar e registrar cada versão do sistema.

## Arquivos

- `system-version.json`: versão atual consumida diretamente pelos portais.
- `CHANGELOG.md`: histórico cronológico das alterações publicadas.

## Regra para toda alteração

Antes de publicar qualquer mudança no produto:

1. Atualize `system-version.json`, incrementando a versão e a revisão.
2. Mantenha `display` coerente com a fase: `BETA` em pré-lançamento e `ESTÁVEL` para uma versão sem sufixo de pré-lançamento.
3. Atualize `releasedAt` e descreva resumidamente a entrega em `summary`.
4. Crie no topo de `CHANGELOG.md` uma entrada com a mesma versão e data.
5. Preserve todas as entradas históricas anteriores sem alterações.
6. Execute `npm run check:version`.

O build valida a consistência desses arquivos. Pull requests que alterarem o produto sem avançar a versão e atualizar os dois registros reprovarão a automação `Validar versão e histórico` do GitHub. Para impedir o merge de uma verificação reprovada, esse check também deve permanecer obrigatório nas regras da branch `main`.

## Progressão sugerida

- Correção: `0.1.0-beta.1` → `0.1.0-beta.2`
- Funcionalidade compatível: `0.1.0-beta.2` → `0.2.0-beta.1`
- Saída da beta: `4.2.0-beta.2` → `4.2.0` (ou o próximo número sem sufixo quando houver mudança incompatível)
