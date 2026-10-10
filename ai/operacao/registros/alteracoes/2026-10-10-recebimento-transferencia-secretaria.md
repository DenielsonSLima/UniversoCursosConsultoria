# Recebimento externo pela Secretaria

Data: 10/10/2026. Estado: publicação da versão 4.8.198 autorizada explicitamente pelo usuário; backend aplicado e validado. Este registro acompanha o pacote atômico; checks e smoke remoto são registrados no PR da publicação.

## Problema e aceite

Secretaria → Transferência encaminhava apenas para emissão da guia de saída e exigia uma matrícula anterior. O recebimento de aluno de outra escola deve partir do cadastro, permitir selecionar a turma técnica de destino, registrar origem/data e aproveitamentos por disciplina, revisar condições financeiras individuais e confirmar a entrada.

Condições carregam o padrão canônico da turma: quantidade, valores, desconto, juros, multa, matrícula e rematrícula. Cobranças e encargos são opcionais; personalização não altera a turma. O recebimento registra o plano e não emite títulos. A guia de saída permanece disponível como operação distinta. A matrícula real do aluno usado na reprodução permanece ausente até o responsável confirmar seu próprio teste.

## Manifesto explícito

- `modules/gestor/secretaria/SecretariaPage.tsx`
- `modules/gestor/secretaria/transferencia/SecretariaTransferenciaPage.tsx`
- `modules/gestor/secretaria/transferencia/TransferenciaTurmaPicker.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/academic/ReceiveExternalTransferController.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/academic/ReceiveExternalTransferModal.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/academic/useReceiveExternalTransfer.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/academic/ExternalTransferFinancialFields.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/academic/ExternalTransferAcademicFields.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/academic/ExternalTransferModalShell.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/academic/ExternalTransferReview.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/academic/external-transfer.contract.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/academic/external-transfer-draft.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/academic/external-transfer.test.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/matricula-tecnica-ciclo-manual.parser.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/matricula-tecnica-ciclo-manual-preview.parser.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/matricula-tecnica-ciclo-manual.types.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/matricula-tecnica-ciclo-manual-destination.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/matricula-tecnica-ciclo-manual.service.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/manual-cycle-transfer-state.test.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/matricula-tecnica-ciclo-manual-preview.parser.test.ts`
- `supabase/functions/technical-manual-cycle-issuance/contract.ts`
- `supabase/functions/technical-manual-cycle-issuance/orchestrator.ts`
- `supabase/functions/technical-manual-cycle-issuance/contract.test.ts`
- `supabase/functions/technical-manual-cycle-issuance/transfer-installments.test.ts`
- `supabase/migrations/20261010160000_external_transfer_individual_terms.sql`
- `supabase/migrations/20261010160010_external_transfer_preview_terms.sql`
- `supabase/migrations/20261010160020_external_transfer_optional_charge_projection.sql`
- `supabase/tests/external_transfer_individual_terms.rollback.sql`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/registros/alteracoes/2026-10-10-recebimento-transferencia-secretaria.md`
- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`
- `internal/versioning/changelog/2026-09-27-versoes-4-8-115-a-4-8-116.md`

Total: 34 arquivos.

## Resultado e contrato

- Secretaria abre recebimento externo a partir do cadastro, com busca por unidade e seletor próprio da turma técnica em andamento. Guia de saída mantém o contrato anterior.
- Formulário tem origem/disciplinas, financeiro e conferência. Preserva nota zero, frequência opcional, equivalência aprovada e condições editáveis preenchidas pela turma.
- Preview v2 retorna condições completas, totais nominais calculados no servidor e `maxCiclos` da turma. Dispensa de taxa não reduz ciclos; turma de ciclo único rejeita C2. Percentuais canônicos preservam até seis casas decimais.
- Recebimento grava matrícula, créditos e snapshot individual, sem emitir títulos. Replay exige autorização e payload imutável; mudança de regras exige nova conferência.
- Sem cobranças, geração fica bloqueada por `SEM_COBRANCAS_PLANEJADAS`. Taxa isolada exige prova do plano externo; matrícula LOCAL isolada preserva um item local, zero boletos e zero chamadas ao banco.
- Regras globais da turma e proveniência Proesc permanecem preservadas.

## Validação

- Reprodução autenticada no Safari: aluno cadastrado sem matrícula fica em “Nenhuma matrícula compatível”, com continuar bloqueado na emissão.
- Contratos RPC e migrations exercitados pelo MCP Supabase em transação com rollback. Baseline anterior passou antes e depois; seis cenários novos cobrem mensalidades parciais C1/C2, taxas isoladas C1/C2, ausência de cobranças e matrícula LOCAL isolada. Autorização, replay divergente, CAS, defaults, flags, totais, ACL e guardas passaram; nenhum gateway foi chamado.
- Smoke final no Safari com componentes, hook, client e parsers reais, catálogo/RPC sintéticos e conexões externas bloqueadas: busca de cadastro sem matrícula, seleção da turma pelo teclado, origem, média zero/frequência, edição de quantidade/valor, dispensa de taxas/encargos, conferência, confirmação e atualização após fechar. Payload visual conferido; uma matrícula simulada e zero chamadas proibidas. Servidor de teste encerrado e sessão real preservada.
- Checagem final somente leitura confirma cadastro real preservado e zero matrículas; nenhuma entrada real foi efetivada.
- Testes focados: 32 testes Node dos parsers/estados financeiros e 30 testes Deno do formulário/client, contrato/orquestrador e confirmação integrada passaram. O teste RPC com rollback passou nos seis cenários acima.
- Lint dos 24 arquivos TypeScript/TSX do manifesto e `tsc --noEmit` passaram. `npm run build` final passou, com avisos de tamanho de chunks e importação dinâmica/estática já existente no histórico de emissões.
- `npm run check:file-lines` passou; todos os 34 arquivos do lote estão dentro do teto aplicável. RAG reindexado no fechamento das fontes operacionais; harness, bundles e logs temporários não integram o manifesto.

## Limitação e preparação da publicação

Smoke autenticado do código novo em produção depende da publicação; a reprodução do defeito foi autenticada e o patch foi exercitado integralmente no Safari com dados sintéticos. As três migrations foram aplicadas pelo MCP na ordem indicada e o teste com rollback passou novamente sobre o contrato instalado. Testes com rollback não alteraram o ledger nem deixaram matrículas/títulos sintéticos.

Publicar somente este manifesto. O backend completo já está instalado antes do frontend v2. Coordenar o deploy do frontend v2 após o backend completo; o frontend recusa preview incompleto. Não executar recebimento real em nome do usuário durante a publicação. Versão 4.8.198/revisão 207 e changelog preparados; as duas entradas históricas mais antigas foram preservadas em arquivo próprio para respeitar o teto de 500 linhas.

## Operação remota

Autorização explícita recebida em 10/10/2026. Projeto Supabase confirmado: `kfekgwyqozhicpfuunpo`. Mapeamento das fontes imutáveis para o ledger remoto:

| Fonte local | Migration remota |
| --- | --- |
| `20261010160000_external_transfer_individual_terms.sql` | `20261010133503_external_transfer_individual_terms` |
| `20261010160010_external_transfer_preview_terms.sql` | `20261010133509_external_transfer_preview_terms` |
| `20261010160020_external_transfer_optional_charge_projection.sql` | `20261010133511_external_transfer_optional_charge_projection` |

`technical-manual-cycle-issuance` atualizada da versão 10 para 11, ACTIVE e `verify_jwt=true`. As 73 fontes do bundle foram relidas e conferidas; somente `contract.ts` e `orchestrator.ts` foram alterados, com dependências remotas preservadas. Teste RPC de seis cenários passou após instalação com rollback. Revisão adicional das três frentes não encontrou trabalho paralelo nos diffs; captura do foco no modal foi ordenada antes de focá-lo, para restaurar o botão de origem ao cancelar.

Publicação usa pai remoto `c03052fff0f0db83cd6dcaa0724c70b930435b08`, manifesto fechado de 34 arquivos e um commit atômico. Conector Vercel devolveu 403 para o projeto vinculado; acompanhamento ocorre pela integração GitHub/Vercel e Safari, sem CLI remota. A validação autenticada percorre o novo formulário até a conferência e cancela; o recebimento real cabe ao usuário. Nenhuma matrícula, nota ou cobrança real foi criada nos testes.
