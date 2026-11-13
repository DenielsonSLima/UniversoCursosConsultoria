# EAD — confiança de24 horas e confirmação manual automática

## Problema e comportamento final

O usuário confirmou que todos os internos com Gestão EAD, respeitando polos e sem exigir Financeiro, podem conceder confiança uma única vez por24 horas. Esse prazo permite aulas, prova final e certificado. A cobrança continua obrigatória; confiança não é baixa financeira. Sem confirmação canônica no prazo, o acesso bloqueia e o código é revogado. Pagamento posterior libera acesso e novo código; o revogado permanece inválido.

A entrega4.8.332 instalou os contratos, com ativação final fechada. A auditoria encontrou uma falha real complementar: a baixa manual quitava o recebível e consolidava o certificado, mas a projeção acadêmica exigia status bancárioPAID/BANESE e deixava a matrículaPENDENTE. Agora o mesmo recebimento canônico da própria matrícula ativa a matrícula na transação financeira, mantendo cancelamento bancário como histórico verdadeiro. Não depende da sessão Edge ou de consulta manual.

## Implementação e guardas

- Migration225925 nova: valida vínculos de aluno, turma, curso EAD, polo, recebível, inscrição e tentativa atual, evidência integral efetiva e não estornada; rejeita recebível alheio, parcial, cancelado, em revisão ou com prova bancária nula.
- Reutiliza os seis callbacks financeiros diferidos; projeta o pagamento manual antes de reconciliar certificado. Sem certificado emitido, o acesso também se torna definitivo.
- Finalizadores repetem somente aRPC local que recebeu40P01, até três tentativas com o mesmo payload/lease; a operação bancária fica fora do retry. Outros erros e transportes ambíguos não são repetidos.
- A ativação225950, ainda não aplicada na base4.8.333, passa a exigir também os dois helpers manuais e o callback atualizado. Migrations já aplicadas permanecem intactas.
- Realtime/TanStack existentes invalidam catálogo, acesso e entrega; prazo e validação pública são avaliados no servidor. Cron de revogação persiste expirações a cada minuto; acesso não depende de esperar o cron.
- A emissão usa o compositor/modelo existente, código exato, identidade e snapshots preservados; certificado pago legado fora do novo ledger não é alterado.

## Implantação e validação

- Base GitHub4.8.333/3882478317aaed8c4a277ab17ff41631bf3d50ae, preservando o portal compacto paralelo. Candidato4.8.334/revisão343.
-49 testes funcionais SQL/curso aprovados emPGlite0.5.10, incluindo regressão antes/depois, pagamentos pontuais/tardios, parcial/estorno e isolamento de matrículas.30 testesDeno dos finalizadores aprovados, incluindo processador real com uma chamada bancária.
- CI exige quatro cenários de concorrência com sessões reais PostgreSQL17; arquivos sequenciais apenas na montagem de roles, mantendo sessões concorrentes dentro dos cenários. A expiração e o pagamento disputam a mesma matrícula; o novo caso verifica40P01 real e retomada sem duplicação.
- TestesDOM da etapa anterior exercitaram componentes/hooks reais com transporte sintético. Confirmação adicional viaRealtime mantém acesso e entrega definitivos após25 horas, sem estender o prazo original. Nenhum navegador controlado nem liberação, prova, certificado ou pagamento real como teste.
- Drift remoto identificado emfinancial-receivable-paymentv2: FAILED_SAFE/review segura já estavam em produção. Store preserva essas guardas; implantação aplica overlay apenas dos arquivos deste lote aos bundles remotos atuais, comJWTtrue e dependências preservadas. Não substitui handler/processador remotos por versões antigas do checkout.
- Ordem de fechamento: CI/preview, migration225925, overlay das duas funçõesEdge, merge/produção, ativação225950 e conferência de cron/legados. O registro documenta o candidato; a evidência final fica naPR e nos retornos de implantação.
- Histórico4.8.266 movido integralmente para arquivo próprio para manter o changelog abaixo de500 linhas. ÍndiceRAG local regenerado uma vez sobre as fontes operacionais finais.

## Manifesto explícito

Total: 21 arquivos.

- `supabase/migrations/20261112225925_ead_trust_manual_payment_projection.sql`
- `supabase/tests/ead_trust_certificate.fixture.mjs`
- `supabase/tests/ead_trust_manual_payment.fixture.mjs`
- `supabase/tests/ead_trust_manual_payment.isolated.test.mjs`
- `supabase/functions/_shared/sql-deadlock-retry.ts`
- `supabase/functions/financial-receivable-payment/store.ts`
- `supabase/functions/asaas/api/manual-settlement.repository.ts`
- `supabase/functions/financial-receivable-payment/completion-deadlock.test.ts`
- `supabase/functions/financial-receivable-payment/processor.test.ts`
- `supabase/tests/ead_trust_manual_certificate_lifecycle.isolated.test.mjs`
- `supabase/tests/ead_trust_manual.concurrent.test.mjs`
- `supabase/tests/fixtures/ead-trust-postgres-adapter.mjs`
- `supabase/migrations/20261112225950_enable_ead_trust_certificate_lifecycle.sql`
- `.github/workflows/ead-trust-access.yml`
- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`
- `internal/versioning/changelog/2026-11-08-versao-4-8-266.md`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/registros/alteracoes/2026-11-13-ead-confianca-confirmacao-manual.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/rag/index.json`
