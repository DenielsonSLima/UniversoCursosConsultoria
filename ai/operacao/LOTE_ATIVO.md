# Lote ativo

Estado: `EM VALIDAÇÃO PARA PUBLICAÇÃO`

## Lote: 2026-08-31-filtro-turmas-ativas-recebiveis

- Pedido: substituir em `Financeiro > Contas a Receber` a opção de agrupar por
  um filtro que liste as turmas em andamento da modalidade aberta e publicar no
  GitHub/produção.
- Autorização: implementação, GitHub e produção aprovados explicitamente pelo
  usuário em 31/08/2026.
- Risco: crítico — financeiro, Supabase/RPC, dados pessoais e publicação.
- Manifesto explícito:
  `ai/operacao/registros/alteracoes/2026-08-31-filtro-turmas-ativas-recebiveis.md`.

### Escopo aprovado

1. Manter a lista organizada por aluno e remover da interface o seletor de
   agrupamento.
2. Exibir somente turmas com status `EM_ANDAMENTO` da modalidade e do polo
   atuais como opções de filtro.
3. Aplicar a turma selecionada no servidor para página, grupos, indicadores e
   exportação/PDF, preservando polo, modalidade e autorização existentes.
4. Preservar as demais telas financeiras e publicar um único lote atômico.

### Diagnóstico confirmado

- O seletor antigo alternava agrupamento por aluno, turma ou sem agrupamento,
  embora a modalidade já seja definida pela aba da tela.
- Produção possui 65 turmas em andamento; o filtro deve usar somente esse
  conjunto por modalidade/polo, mas a visão sem filtro continua mostrando o
  histórico financeiro permitido.
- As RPCs de página, grupos e resumo não recebiam turma, portanto um filtro
  somente visual deixaria totais e PDF incoerentes.

### Implementação e validação realizada

- A tela fixa o agrupamento interno por aluno e mostra o seletor `Todas as
  turmas`, populado por turma ativa da aba aberta.
- O filtro selecionado acompanha paginação, expansão do aluno, KPIs e extrato.
- A migration aplicada em produção como `20260831031926` criou as três RPCs
  v3 protegidas e recarregou o schema PostgREST.
- Uma turma ativa real confirmou 353 títulos tanto na contagem bruta quanto na
  página, nos grupos e no resumo remoto.
- ESLint focal, TypeScript e o contrato Deno da migration foram aprovados.

### Aceite para publicação

- Não há a opção visual de agrupar; há apenas filtro por turmas ativas da
  modalidade atual.
- Uma turma escolhida retorna o mesmo conjunto na lista, cartões e extrato.
- O filtro não expõe dados entre polos nem muda valores ou títulos.
- Arquivos do manifesto permanecem no teto de 500 linhas, salvo migrations
  aplicadas registradas como exceções imutáveis.
