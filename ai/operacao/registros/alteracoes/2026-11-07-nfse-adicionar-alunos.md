# NFS-e — adicionar alunos

## Pedido e aceite

- Botão Adicionar alunos abre modal institucional compacto.
- Mês atual por padrão, busca por aluno, tipo Técnico por padrão e filtro de turma.
- Pagamentos confirmados pela data de recebimento, inclusive atrasados; sem confundir vencimento com recebimento.
- Turmas expansíveis, seleção múltipla por aluno/turma e total da seleção calculado no banco.
- Seleção devolvida à preparação; nenhum documento fiscal emitido por este fluxo.
- Escopo de polo e acesso exclusivo já existente preservados.

## Diagnóstico

Versão 4.8.262 reproduzida no Safari: preparação inline, filtros desativados e consulta indisponível. Leitores fiscais globais estão desativados e suas RPCs ainda não existem. Nova consulta isolada reutiliza a fonte canônica do Caixa sem ativar operações fiscais.

## Manifesto explícito

- `modules/gestor/emissor-nfse/preparar/NfseStudentGroups.tsx`
- `modules/gestor/emissor-nfse/preparar/NfseStudentsModal.tsx`
- `modules/gestor/emissor-nfse/preparar/PrepararNfseTab.tsx`
- `modules/gestor/emissor-nfse/preparar/hooks/useNfseReceiptStudents.ts`
- `modules/gestor/emissor-nfse/preparar/nfse-students.css`
- `modules/gestor/emissor-nfse/preparar/nfse-students.types.ts`
- `modules/gestor/emissor-nfse/preparar/queries/nfse-students.keys.ts`
- `modules/gestor/emissor-nfse/preparar/realtime/useNfseReceiptRealtime.ts`
- `modules/gestor/emissor-nfse/preparar/services/nfse-students.contract.test.ts`
- `modules/gestor/emissor-nfse/preparar/services/nfse-students.contract.ts`
- `modules/gestor/emissor-nfse/preparar/services/nfse-students.service.ts`
- `modules/gestor/emissor-nfse/preparar/types/nfse-students.types.ts`
- `modules/gestor/emissor-nfse/preparar/useNfseStudentsDialog.ts`
- `supabase/migrations/20261108005455_nfse_receipt_students_read.sql`
- `supabase/tests/nfse_receipt_students.isolated.test.mjs`
- `supabase/tests/nfse_receipt_students.readonly-audit.sql`
- `.github/workflows/nfse-regressions.yml`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/registros/alteracoes/2026-11-07-nfse-adicionar-alunos.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/rag/index.json`

- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`

Total: 23 arquivos. Candidato 4.8.264 sobre a base 4.8.262. A versão 4.8.263 do PR paralelo 358 permanece fora deste manifesto; seus arquivos locais não são sobrescritos.

## Validação

- TypeScript e lint focados aprovados; 57 testes do módulo e 9 testes em PostgreSQL/WASM isolado aprovados.
- Todos os arquivos manuais deste manifesto têm até 500 linhas. O comando global `check:file-lines` aponta 39 ausências históricas deste checkout, fora do lote; não foram corrigidas nem incluídas na entrega.
- Safari desktop e 390 × 700 px: botão, modal, Técnico e mês atual, expansão, seleção individual/turma/página, pesquisa mantendo seleção, totais canônicos, envio à preparação e limpeza ao mudar mês conferidos.
- Menu próprio abre acima do modal; Escape fecha o menu sem fechar o modal. Retorno à lista e foco no botão Adicionar alunos conferidos.
- Leitura real da fonte canônica, sem PII: 24 recebimentos positivos, 23 alunos, total 6177.72 na matriz em novembro/2026. Inclui aluno com mais de um recebimento. Não substitui validação pós-aplicação da RPC.
- Autorização por piloto/contexto/polo é exercida antes da fonte. Totais usam todas as páginas e não são recalculados no frontend. Falha ou seleção indisponível oculta o total e bloqueia confirmação.

## Situação remota

Usuário autorizou explicitamente a RPC em produção após bloqueio inicial da revisão automática. Migration aplicada pelo MCP Supabase em 20261108005455, fonte renomeada para corresponder ao ledger, sem alteração do conteúdo aplicado. RPC real retorna 5 turmas/23 alunos e total 6177.72 em novembro; seleção preserva total mesmo com filtro Livre e busca sem resultado. ACL: anon negado, authenticated autorizado sob guarda interna; chamada sem contexto autorizado nega 42501. Nenhum pagamento alterado ou nota emitida. Publicação da interface aguarda CI/Preview e smoke autenticado.
