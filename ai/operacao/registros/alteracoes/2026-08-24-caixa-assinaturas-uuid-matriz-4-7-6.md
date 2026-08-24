# Caixa de Assinaturas da Matriz — 2026-08-24

Estado: `PUBLICADO_PRODUCAO_4_7_6`

## Diagnóstico

A Caixa de Assinaturas exibiu erro mesmo com a sessão do Gestor válida. Nos logs do instante da captura, as demais consultas chegaram ao Supabase e responderam 200, mas não houve request para `assinatura_eletronica_listar_caixa_contexto`. A causa estava no cliente: o validador compartilhado exigia os nibbles de versão e variante RFC 4122, enquanto o PostgreSQL e os contratos canônicos aceitam a forma lexical UUID completa. O identificador legado do polo Matriz era rejeitado antes da rede.

## Correção

- O validador compartilhado das RPCs de assinatura passou a aceitar qualquer UUID lexical válido para o tipo `uuid` do PostgreSQL.
- A validação continua fechada para tamanhos incorretos, separadores inválidos e caracteres não hexadecimais.
- O gerador de chaves seguras continua impondo UUID RFC próprio; somente identificadores canônicos oriundos do banco foram alinhados ao contrato PostgreSQL.
- Nenhuma autorização, regra de escopo, query key, função remota, migration ou dado foi alterado.

## Validação

- `17/17` testes Node focados aprovados.
- Teste de regressão com o UUID legado da Matriz e teste negativo com caractere não hexadecimal.
- Smoke remoto somente leitura com o mesmo contexto autorizado e o polo Matriz: resposta canônica com `items` e `nextCursor`.
- Contrato remoto confirmado: função `SECURITY DEFINER`, `search_path` vazio, grant para `authenticated` e ausência de grant para `anon`.
- Node focado `17/17`, teto de 500 linhas, versão, TypeScript, lint, build e testes operacionais aprovados.
- Revisão independente sem finding `Critical` ou `Important`.

## Publicação e fechamento

- PR `#87` integrada por squash na `main`, commit `78417700fcb10239f4c3d51aa008c83279702088`, com exatamente os nove arquivos do manifesto.
- Preview Vercel `ELzsXC4U5h4sNTxNGGFF6VBHgUEp` e Production `7jcCtR6xbsuzAN5HHiJcFPrvMW6t` concluídas com sucesso.
- `https://universocc.com.br` respondeu HTTP 200; o bundle público contém a versão 4.7.6 e o resumo `Caixa de assinaturas liberada para o UUID legado da Matriz`.
- Smoke autenticado em Produção, na sessão real da Matriz: a Caixa abriu sem o alerta de falha e exibiu `Nenhuma assinatura pendente disponível`.

## Manifesto explícito

Total: 9 arquivos

- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/limite-linhas.json`
- `ai/operacao/rag/index.json`
- `ai/operacao/registros/ALTERACOES.md`
- `ai/operacao/registros/alteracoes/2026-08-24-caixa-assinaturas-uuid-matriz-4-7-6.md`
- `internal/versioning/CHANGELOG.md`
- `internal/versioning/system-version.json`
- `modules/shared/assinatura-eletronica/assinatura-eletronica.service.shared.ts`
- `modules/shared/assinatura-eletronica/assinatura-eletronica.uuid-validation.test.ts`

## Limites

- Publicação concluída no GitHub e em Produção, limitada ao manifesto acima.
- Nenhuma alteração remota Supabase é necessária ou autorizada por implicação.
- Alterações paralelas do workspace, artefatos temporários e arquivos gerados fora do índice RAG não integram o lote.
