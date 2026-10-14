# Continuidade financeira de transferência — 14/10/2026

## Objetivo e aceite

Restaurar o carregamento financeiro quando uma transferência possui vencimento individual diferente da turma e permitir continuar a emissão pela matrícula salva na Secretaria.

- A projeção V3 usa a mesma data individual nos dois campos canônicos.
- Plano salvo, aproveitamentos, recebíveis e proveniência importada permanecem intactos.
- A continuidade valida unidade, turma, aluno e matrícula e apresenta somente esse vínculo.
- O painel reutiliza conferência, emissão BolePix, retomada e carnê existentes; nenhum boleto é emitido ao abrir a tela.
- Totais individuais vêm da linha canônica, sem usar o resumo global da turma.
- A opção de emitir depois preserva a transferência concluída.

## Implementação e risco

Nova migration substitui somente a projeção da data aninhada. Preserva função anterior para planos não V3, fingerprint, ACL interna, STABLE e search_path vazio. Guarda de definição impede substituir alteração concorrente.

A Secretaria conecta a conclusão ao painel individual e invalida o workspace da turma. O painel bloqueia identidade divergente e falha de leitura mesmo com cache. Emissão e confirmação bancária continuam no motor existente, por ciclo. A migração aplicada anterior permanece imutável.

## Validação

- Migration aplicada: 20261014143702_fix_transfer_schedule_effective_due_date.
- Verificação posterior em READ ONLY confirmou datas coerentes, elegibilidade individual e ausência de geração.
- Contagens e hashes de recebíveis, matrículas, configurações, aproveitamentos e planos permaneceram idênticos.
- Projeções das matrículas sem plano V3 permaneceram iguais ao fallback anterior.
- Teste PGlite versionado reproduz divergência antes da migration e verifica dados preservados, fallback, fingerprint, ACL e guarda concorrente.
- Testes de componentes exercem continuidade, identidade, permissões, erro com cache e totais individuais.
- CI, preview e publicação são rastreados pelos checks do commit desta entrega. O ambiente local e o navegador autenticado estavam indisponíveis; os testes de UI usam dados sintéticos.
- Produção autorizada expressamente pelo solicitante. Emissão bancária fica para confirmação no sistema.

## Manifesto explícito

- `supabase/migrations/20261014143702_fix_transfer_schedule_effective_due_date.sql`
- `internal/versioning/changelog/2026-09-30-versoes-4-8-138-a-4-8-144.md`
- `internal/versioning/CHANGELOG.md`
- `internal/versioning/system-version.json`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `modules/gestor/secretaria/transferencia/SecretariaTransferenciaFinanceiro.tsx`
- `modules/gestor/secretaria/transferencia/SecretariaTransferenciaPage.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/academic/ReceiveExternalTransferController.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/FinanceiroAlunosList.tsx`
- `modules/gestor/secretaria/transferencia/transferencia-financeiro-continuation.test.mjs`
- `supabase/tests/transfer_effective_rule_projection.isolated.test.mjs`
- `.github/workflows/transfer-financial-continuation.yml`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/registros/alteracoes/2026-10-14-transferencia-financeiro-individual.md`

Total: 14 arquivos.
