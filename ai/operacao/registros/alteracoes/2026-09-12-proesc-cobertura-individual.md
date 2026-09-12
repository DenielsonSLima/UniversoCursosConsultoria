# Cobertura individual de ciclo já emitido no Proesc

Data: 12/09/2026. Mudança crítica financeira. Estado: APLICADA NO BANCO; PUBLICAÇÃO DA INTERFACE EM PREPARAÇÃO.

## Pedido e aceite

- Conferir alunos individualmente; não tratar toda a T42 como contrato idêntico.
- Completar uma exceção comprovada: 24 mensalidades e uma rematrícula no Proesc.
- Vincular as 25 identidades externas, incluir somente cinco faltantes e impedir
  novo segundo ciclo local/Banese nessa matrícula.
- Preservar integralmente os vinte registros existentes e os demais alunos.
- Essa entrega não ativa baixa automática nem importa outras turmas.

## Evidência e implementação

- Imagens fornecidas confirmam mensalidades 1–12 e 13–24, além de rematrícula separada.
- Fonte V1 revalidada em 25 GETs por chave, unidade, turma e pessoa autorizadas.
- Inclusões: ordinais 20–24, janeiro–maio/2027, principal total R$ 1.399,50,
  sem pagamento e já emitidas externamente. Não emitir novos boletos.
- RPC exclusivamente interna, autorização antes de replay, locks da geração,
  vínculos privados de evidência e claim exato limitado à transação.
- Os vinte recebíveis existentes ficam intactos; cobertura de contrato é distinta
  de uma geração local. A interface identifica origem Proesc e remove retomada.
- Legado sem gateway não oferece envio de novo boleto ao banco.
- Dados individuais e payload de execução ficam somente em pasta temporária privada.

## Validação

- Reprodução real anterior: matrícula elegível para gerar segundo ciclo.
- Ensaio SQL integral com rollback: cinco inclusões, 25 vínculos, replay sem
  duplicatas, vinte registros e outros alunos preservados.
- Negativos reais: prévia, geração, emissão, retomada, recuperação, autorização,
  INSERT direto, alteração de principal, claim bancário e DELETE rejeitados.
- Revisão independente sem bloqueadores. Testes frontend/contrato focados aprovados.
- Build de produção e teto de linhas aprovados. Aplicação definitiva confirmada: 25 cobranças, dez pagamentos preservados e 15 pendentes.
- Hashes dos 78 títulos Banese e dos 340 registros legados preservados.
- Evento de importação concluída registrado no histórico da turma.
- Smoke visual e publicação da interface pendentes.

## Manifesto explícito

- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/FinanceiroCicloManualStatus.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/FinanceiroAlunoCarneAction.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/matricula-tecnica-ciclo-manual.types.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/matricula-tecnica-ciclo-manual.parser.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/manual-technical-cycle-proesc.test.ts`
- `modules/gestor/financeiro/receber/components/modalidade-receber/ReceivableItemPresentation.tsx`
- `modules/gestor/financeiro/receber/components/modalidade-receber/receivable-external-history-actions.test.ts`
- `supabase/migrations/20260912180000_create_technical_external_cycle_coverage.sql`
- `supabase/migrations/20260912180010_import_proesc_contract_with_cycle_coverage.sql`
- `supabase/tests/proesc_external_cycle_coverage.contract.test.mjs`
- `supabase/tests/proesc_external_cycle_coverage.readonly.sql`
- `supabase/tests/proesc_external_cycle_import_snapshot.readonly.sql`
- `supabase/tests/proesc_external_cycle_protection.transaction.sql`
- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`
- `ai/operacao/registros/alteracoes/2026-09-12-proesc-cobertura-individual.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/LOTE_ATIVO.md`

Total: 18 arquivos.

## Continuidade

- Conferência integral da T42, composição de recebimentos e consulta automática
  permanecem em andamento; não confundir este bloqueio individual com automação concluída.
- Mapeamento acadêmico solicitado posteriormente registrado separadamente em
  `ai/operacao/integracoes/proesc/references/turmas-polos-inicio-informado.md`.
- Nove novas turmas somente depois de concluir a T42; T42 e Radiologia não recriar.
- Preservar alterações paralelas do PR 134.
