# Taxa técnica rejeitada — 27/10/2026

Estado: EM VALIDAÇÃO. Candidato conjunto 4.8.239/revisão 248, isolado do hotfix de acompanhamento. Não contém dados reais de alunos, tokens, respostas bancárias ou credenciais.

## Escopo e limites

Preparação estrita de uma rematrícula de R$100 rejeitada pelo código82 e descrição oficial de vencimento anterior à emissão. A data autorizada é30/10/2026; encargos iniciam31/10. A implantação não modifica recebíveis. A operação de manutenção só aceita fonte, run, autorização e doze mensalidades comprovadas sem divergência; comparação de estado impede alteração concorrente.

- Arquivo privado com RLS/grants mínimos preserva o recebível, autorização, token, erro e run originais; não reescreve reviewed_items nem request ledger.
- Worker protegido usa credencial existente internamente e realiza somente GET da identidade reservada exata. Somente404 com erro oficial único de boleto não encontrado gera prova server-side; 200, erro transitório, resposta desconhecida ou identidade diferente param sem efeito financeiro.
- Lease, TTL e CAS são consumidos atomicamente. Preparação altera só vencimento e termos dependentes, arquivando a tentativa antiga antes da transição permitida.
- Novo request fica vinculado ao item e à operação; autorização atual só muda durante consentimento do gestor real na rota existente. A manutenção não fabrica auth.uid nem atribui ação a pessoa apenas por token.
- Nova tentativa faz preflight estrito; resposta perdida é retomada por GET MATCH, sem segundo POST nem avanço do Nosso Número. Vencimento ultrapassado permite consulta da identidade existente, nunca novo POST com data passada.
- Título existente, pago, estrangeiro ou incerto não é cancelado por esta rota. Qualquer cancelamento requer plano separado apoiado em estado atual e autorização específica.

## Validação

Ensaio PostgreSQL sintético usa geração real, COMMIT,12 persistências bancárias simuladas, rejeição da taxa, aprovação, prova oficial simulada, preparo com COMMIT, consentimento de outro gestor e persistência apenas da taxa. Composição13/13, run, ledger e doze mensalidades permanecem íntegros. Prova legada aceita pagamento legítimo posterior sem reescrever histórico.

Negativos cobrem token antigo, ausência genérica, lease/prova expirada, fonte alterada, autorização conflitante, pagamento, proteção importada, polo e ator ausente. Adapter testa resposta perdida seguida de GET exato, sem duplicação. Relógio civil de negócio da fixture é fixo; TTL e lease mantêm relógio real.

Auditoria canônica registra manutenção como Sistema quando auth.uid está ausente. Testes não realizam rede bancária. CI completo e revisão independente são gates de implantação; nenhum teste simulado substitui o GET real necessário para preparar uma cobrança.

## Implantação e plano operacional

1. Conferir main, hashes de funções, source/run CAS, ausência de operação em voo e baseline das13 linhas.
2. Aplicar quatro migrations em ordem, sem DML financeiro de implantação, e verificar defs/grants. Só então implantar os bundles Edge dependentes dos novos RPCs.
3. Registrar aprovação específica com IDs/hashes obtidos por leitura privada. Despachar somente inspeção GET usando segredo já configurado no backend, sem ler/expor o segredo.
4. Se prova exata e fresca confirmar ausência, preparar somente a taxa e conferir data30/10, encargos31/10, arquivo e hashes das12 mensalidades. Se não confirmar, parar sem cancelamento/reemissão.
5. O gestor usa Retomar para consentir a tentativa permitida; carnê completo depende de13/13 comprovados, nunca de12/13 mascarados.

Rollback: não apagar arquivo, reescrever ledger, restaurar token antigo com termos novos ou executar reset genérico. Se algum gate falhar, preservar estado/evidências e interromper. Bundles antigos não podem ser restaurados enquanto houver correção ativa sem verificar compatibilidade das guardas.

## Manifesto explícito

- `.github/workflows/technical-cycle-recovery.yml`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/registros/alteracoes/2026-10-27-taxa-tecnica-rejeitada.md`
- `internal/versioning/CHANGELOG.md`
- `internal/versioning/system-version.json`
- `scripts/test-rejected-technical-fee.mjs`
- `supabase/functions/banese/core/adapter/boleto.ts`
- `supabase/functions/technical-manual-cycle-issuance/claim-recovery-integration.test.ts`
- `supabase/functions/technical-manual-cycle-issuance/receivable-issuance.ts`
- `supabase/functions/technical-manual-cycle-recovery-worker/index.ts`
- `supabase/functions/technical-rejected-fee-correction/adapter.test.ts`
- `supabase/functions/technical-rejected-fee-correction/ambiguous-recovery.test.ts`
- `supabase/functions/technical-rejected-fee-correction/bank-policy.ts`
- `supabase/functions/technical-rejected-fee-correction/contract.test.ts`
- `supabase/functions/technical-rejected-fee-correction/contract.ts`
- `supabase/functions/technical-rejected-fee-correction/issuance-request.ts`
- `supabase/functions/technical-rejected-fee-correction/worker-action.ts`
- `supabase/migrations/20261027175544_rejected_technical_fee_correction_proofs.sql`
- `supabase/migrations/20261027175552_rejected_fee_absence_inspection.sql`
- `supabase/migrations/20261027175600_rejected_fee_preparation_overlay.sql`
- `supabase/migrations/20261027175607_rejected_fee_manager_consent.sql`
- `supabase/tests/fixtures/rejected-fee-canonical-audit.sql`
- `supabase/tests/rejected-fee-correction.isolated.test.mjs`
- `supabase/tests/rejected-fee-setup.mjs`

- `supabase/tests/financial-correction-worker-auth.test.ts`

Total: 26 arquivos.
