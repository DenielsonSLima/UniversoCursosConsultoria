# Lote ativo

Estado: `PUBLICADO_PRODUCAO_4_7_6`

## Lote: 2026-08-24-caixa-assinaturas-uuid-matriz-4-7-6

- Pedido: corrigir o erro da Caixa de Assinaturas exibido na Secretaria e publicar no GitHub e em Produção.
- Causa confirmada: a fronteira cliente das RPCs exigia nibbles de versão e variante RFC 4122, embora o PostgreSQL, o contrato de sessão e o polo Matriz usem uma forma lexical UUID legada válida. A exceção era lançada antes de qualquer request.
- Registro: `ai/operacao/registros/alteracoes/2026-08-24-caixa-assinaturas-uuid-matriz-4-7-6.md`.
- Manifesto explícito: `ai/operacao/registros/alteracoes/2026-08-24-caixa-assinaturas-uuid-matriz-4-7-6.md`.
- Versão: `4.7.6` estável.
- Publicação concluída: PR `#87` integrada por squash na `main`, commit `78417700fcb10239f4c3d51aa008c83279702088`; Vercel Production `7jcCtR6xbsuzAN5HHiJcFPrvMW6t` pronta e smoke autenticado aprovado. Nenhuma alteração Supabase foi necessária.

### Critérios de aceite

1. A Caixa de Assinaturas da Matriz chega à RPC `assinatura_eletronica_listar_caixa_contexto` sem falhar na validação local. `ATENDIDO`.
2. UUIDs na forma lexical aceita pelo PostgreSQL, incluindo o polo Matriz, são aceitos pela fronteira das RPCs. `ATENDIDO`.
3. UUIDs malformados ou com caracteres não hexadecimais continuam bloqueados. `ATENDIDO`.
4. Autorização, escopo, query keys, banco, RLS e funções remotas permanecem inalterados. `ATENDIDO`.
5. CI, Preview, merge, Produção e disponibilidade da versão 4.7.6 devem concluir antes do fechamento. `ATENDIDO`.
6. O smoke autenticado da Caixa deve deixar o estado de erro e apresentar a caixa vazia ou os itens autorizados. `ATENDIDO`.

### Evidências e validação

- Logs do instante da captura: sessão válida e demais requests 200, sem request para a RPC da caixa, confirmando falha anterior à rede.
- Smoke remoto somente leitura, com o mesmo contexto autorizado e o polo Matriz: contrato com `items` e `nextCursor`, sem erro e sem mutação.
- Node focado: `17/17` testes aprovados, incluindo o UUID legado da Matriz e a rejeição de UUID malformado.
- Backend remoto: função presente, `SECURITY DEFINER`, `search_path` vazio, execução restrita a `authenticated` e sem grant para `anon`.
- Node focado `17/17`, teto de 500 linhas, versão, TypeScript, lint, build e testes operacionais: aprovados; revisão independente sem finding `Critical` ou `Important`.
- GitHub: PR `#87` integrada por squash na `main`, commit `78417700fcb10239f4c3d51aa008c83279702088`; manifesto remoto conferido com exatamente nove arquivos.
- Vercel: Preview `ELzsXC4U5h4sNTxNGGFF6VBHgUEp` e Production `7jcCtR6xbsuzAN5HHiJcFPrvMW6t` concluídas com sucesso.
- Produção: `https://universocc.com.br` respondeu HTTP 200; o bundle público contém a versão 4.7.6 e o resumo estável correspondente.
- Smoke autenticado em Produção, na sessão real da Matriz: a Caixa deixou o estado de erro e exibiu `Nenhuma assinatura pendente disponível`.

### Fechamento remoto

1. A aplicação foi publicada pela PR `#87`, sem operação remota no Supabase.
2. Preview protegida e Vercel Production ficaram `Ready` antes do fechamento.
3. A sessão autenticada permaneceu ativa após a atualização e consultou a Caixa da Secretaria com sucesso.
4. Nenhuma variável, dado, migration, Edge Function ou envelope foi alterado.

### Limites e exclusões

1. Nenhuma migration, Edge Function, variável Vercel, dado acadêmico ou envelope integra este lote.
2. A publicação fica restrita ao manifesto explícito de nove arquivos.
3. Alterações paralelas do workspace não integram a branch nem o commit remoto.

Histórico: `ai/operacao/registros/ALTERACOES.md` e `ai/operacao/registros/alteracoes/`.
