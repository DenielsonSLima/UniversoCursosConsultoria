# Carteirinhas em ordem alfabética — 4.8.255

Pedido explícito: ordenar todas as carteirinhas ao emitir e atualizar GitHub/produção.
Lote restrito à ordem da emissão estudantil; o lote anterior de Configurações permanece
registrado em seu próprio manifesto. Nenhum arquivo paralelo de NFS-e integra esta entrega.

## Causa e aceite

A RPC ordenava por data de matrícula. A checagem somente leitura da Matriz encontrou
208 matrículas e 103 inversões alfabéticas antes da correção. A seleção personalizada
mantinha a ordem dos cliques. Aceite: ordem pelo nome, ignorando caixa e acentos,
preservada em lote completo, turma e personalizado, nos layouts dobra e espelhado.

## Implementação e risco

A RPC pública mantém a guarda de Secretaria/polo e o payload interno; reordena somente
`enrollments`, com desempate estável pela posição original. A matrícula primária de cada
aluno permanece a mesma. O frontend filtra o workspace canônico também na seleção
personalizada e usa a mesma lista na emissão e na composição das folhas.

Modelo, assets, validade, códigos, elegibilidade e compositor PDF permanecem preservados.
Prévia, download e impressão continuam usando o mesmo Blob no pipeline existente.
A migration `20261107182023` foi aplicada via MCP no projeto autorizado
`kfekgwyqozhicpfuunpo`, com o nome `order_student_cards_alphabetically`.

## Validação

- Contrato SQL falhou antes da migration e passou depois: ordem exata, payload completo,
  matrícula primária e bloqueio de chamada sem autorização, em todos os polos técnicos.
- Dois testes de workspace aprovados: preservação durante refetch e seis combinações
  de modo/layout, seleção reversa de 13 alunos, várias folhas e matrícula duplicada.
- Safari autenticado confirmou o caminho Secretaria > Carteirinha Estudantil > Em lote
  e os 208 alunos. O fechamento remoto deve conferir a nova versão, a prévia e o deploy.
- A validação final de build é feita na Preview Vercel do commit explícito, evitando
  incorporar arquivos de outras tarefas presentes no workspace compartilhado.
- O check global local de linhas encontrou 37 pendências de fontes ausentes do workspace,
  fora deste manifesto. O contrato PDF global local apontou uma pendência anterior no
  exportador do Caixa. O recorte de carteirinhas passou; os nove arquivos desta entrega
  são conferidos diretamente com o teto de 500 linhas e a CI executa os gates no remoto.
- Versão, changelog e registro incremental são preparados a partir do commit remoto
  `73ea12b`, sem sobrescrever a versão reservada por outra tarefa no workspace local.
- Preview Vercel inicial READY. O job `student-card-browser` parou antes dos testes
  porque `ubuntu-latest` passou a Ubuntu 26.04, não suportado pelo Playwright 1.58.2.
  O runner desse contrato foi fixado em Ubuntu 24.04 para recuperar a validação existente.

## Manifesto explícito

Total: 9 arquivos

- `modules/gestor/secretaria/carteirinhas/SecretariaCarteirinhasPage.tsx`
- `modules/gestor/secretaria/carteirinhas/secretaria-carteirinhas-workspace.test.mjs`
- `supabase/migrations/20261107182023_order_student_cards_alphabetically.sql`
- `supabase/tests/student_cards_alphabetical_order.sql`
- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/registros/alteracoes/2026-11-07-carteirinhas-ordem-alfabetica.md`
- `.github/workflows/student-card-pdf.yml`
