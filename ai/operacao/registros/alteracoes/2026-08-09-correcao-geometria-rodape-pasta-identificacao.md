# Correção da geometria do rodapé da Pasta de Identificação

## Objetivo

Restaurar a emissão da Pasta de Identificação quando o modelo ou snapshot legado contém `pasta_rodape` abaixo da área canônica A4, sem reescrever documentos históricos já emitidos.

## Causa

- O hotfix anterior removeu a falha `record "v_model" is not assigned yet` da RPC e permitiu que a emissão avançasse até o compositor PDF.
- O modelo ativo ainda possuía o rodapé em `y=1000`, sem altura explícita; a emissão reproduzida pelo usuário reutilizou um snapshot `v9` com `y=1013` e também sem altura.
- Com os dados institucionais completos, o texto precisava de pelo menos cinco linhas e excedia a área útil restante da página, acionando corretamente o bloqueio de overflow.

## Resultado

- O modelo padrão da Pasta passou para `v13`, com `pasta_rodape` em `y=930`, altura `100` e espaço para até oito linhas.
- O modelo persistido atual foi reparado por migration incremental e idempotente, restrita a `pasta_identificacao_aluno` e à assinatura legada reconhecida.
- Snapshots históricos não são alterados no banco. Ao abrir Pasta `v<=12`, o frontend normaliza uma cópia somente quando encontra a geometria e os tokens legados exatos.
- Geometrias personalizadas ou estruturas malformadas não são silenciosamente substituídas.
- Prévia, download e impressão continuam usando o mesmo Blob PDF vetorial.

## Validações

- `npm run test:contratos-aluno`: 41/41.
- Contratos focados de campos, RPC e migration da Pasta: 5/5.
- `npx tsc --noEmit`: aprovado.
- ESLint focado: aprovado.
- PDF A4 renderizado com Poppler: rodapé integralmente dentro da página, texto extraível e nenhuma rasterização A4.
- Supabase remoto: modelo atual `v13`, rodapé `y=930`, altura `100`; snapshot histórico mais recente preservado em `v9`, `y=1013`, sem altura.
- Navegador controlável indisponível; o clique autenticado final permanece como verificação manual após recarregar o localhost.

## Publicação

Migration aplicada por MCP Supabase como `20260809200839_fix_pasta_identificacao_footer_geometry`. Código, migration, testes e registros seguem em complemento atômico da PR draft #62, sem merge ou deploy de produção do frontend.
