# Lote ativo

Estado: `PUBLICACAO_GITHUB_E_PRODUCAO_AUTORIZADA`

## Lote: 2026-08-24-caixa-assinaturas-uuid-matriz-4-7-6

- Pedido: corrigir o erro da Caixa de Assinaturas exibido na Secretaria e publicar no GitHub e em Produção.
- Causa confirmada: a fronteira cliente das RPCs exigia nibbles de versão e variante RFC 4122, embora o PostgreSQL, o contrato de sessão e o polo Matriz usem uma forma lexical UUID legada válida. A exceção era lançada antes de qualquer request.
- Registro: `ai/operacao/registros/alteracoes/2026-08-24-caixa-assinaturas-uuid-matriz-4-7-6.md`.
- Manifesto explícito: `ai/operacao/registros/alteracoes/2026-08-24-caixa-assinaturas-uuid-matriz-4-7-6.md`.
- Versão: `4.7.6` estável.
- Publicação autorizada: branch/PR atômica, Preview Vercel, squash em `main`, Vercel Production e smoke pós-deploy. Nenhuma alteração Supabase é necessária.

### Critérios de aceite

1. A Caixa de Assinaturas da Matriz chega à RPC `assinatura_eletronica_listar_caixa_contexto` sem falhar na validação local. `ATENDIDO_LOCALMENTE`.
2. UUIDs na forma lexical aceita pelo PostgreSQL, incluindo o polo Matriz, são aceitos pela fronteira das RPCs. `ATENDIDO_LOCALMENTE`.
3. UUIDs malformados ou com caracteres não hexadecimais continuam bloqueados. `ATENDIDO_LOCALMENTE`.
4. Autorização, escopo, query keys, banco, RLS e funções remotas permanecem inalterados. `ATENDIDO`.
5. CI, Preview, merge, Produção e disponibilidade da versão 4.7.6 devem concluir antes do fechamento. `EM_ANDAMENTO`.
6. O smoke autenticado da Caixa deve deixar o estado de erro e apresentar a caixa vazia ou os itens autorizados. `PENDENTE_DEPLOY`.

### Evidências e validação

- Logs do instante da captura: sessão válida e demais requests 200, sem request para a RPC da caixa, confirmando falha anterior à rede.
- Smoke remoto somente leitura, com o mesmo contexto autorizado e o polo Matriz: contrato com `items` e `nextCursor`, sem erro e sem mutação.
- Node focado: `17/17` testes aprovados, incluindo o UUID legado da Matriz e a rejeição de UUID malformado.
- Backend remoto: função presente, `SECURITY DEFINER`, `search_path` vazio, execução restrita a `authenticated` e sem grant para `anon`.
- Teto de 500 linhas, versão, TypeScript, lint, build, CI, Preview e Produção serão registrados no fechamento.

### Limites e exclusões

1. Nenhuma migration, Edge Function, variável Vercel, dado acadêmico ou envelope integra este lote.
2. A publicação fica restrita ao manifesto explícito de nove arquivos.
3. Alterações paralelas do workspace não integram a branch nem o commit remoto.

Histórico: `ai/operacao/registros/ALTERACOES.md` e `ai/operacao/registros/alteracoes/`.
