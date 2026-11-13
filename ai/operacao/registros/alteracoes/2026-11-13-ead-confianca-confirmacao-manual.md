# EAD — confiança de24 horas e confirmação manual automática

## Problema e comportamento final

O usuário confirmou que todos os internos com Gestão EAD, respeitando polos e sem exigir Financeiro, podem conceder confiança uma única vez por24 horas. Esse prazo permite aulas, prova final e certificado. A cobrança continua obrigatória; confiança não é baixa financeira. Sem confirmação canônica no prazo, o acesso bloqueia e o código é revogado. Pagamento posterior libera acesso e novo código; o revogado permanece inválido.

A entrega4.8.332 instalou os contratos, com ativação final fechada. A auditoria encontrou uma falha real complementar: a baixa manual quitava o recebível e consolidava o certificado, mas a projeção acadêmica exigia status bancárioPAID/BANESE e deixava a matrículaPENDENTE. Agora o mesmo recebimento canônico da própria matrícula ativa a matrícula na transação financeira, mantendo cancelamento bancário como histórico verdadeiro. Não depende da sessão Edge ou de consulta manual.

## Implementação e guardas

- Migration `ead_trust_manual_payment_projection` aplicada em produção, ledger remoto `20261113040451` (fonte225925 no manifesto original): valida vínculos de aluno, turma, curso EAD, polo, recebível, inscrição e tentativa atual, evidência integral efetiva e não estornada; rejeita recebível alheio, parcial, cancelado, em revisão ou com prova bancária nula.
- Reutiliza os seis callbacks financeiros diferidos; projeta o pagamento manual antes de reconciliar certificado. Sem certificado emitido, o acesso também se torna definitivo.
- Finalizadores repetem somente aRPC local que recebeu40P01, até três tentativas com o mesmo payload/lease; a operação bancária fica fora do retry. Outros erros e transportes ambíguos não são repetidos.
- A ativação `enable_ead_trust_certificate_lifecycle`, ledger remoto `20261113040848` (fonte225950 no manifesto original), foi concluída em 13/11/2026 às 01:08:48 (America/Maceio; 04:08:48 UTC), após a publicação 4.8.334. Exige também os dois helpers manuais e o callback atualizado. Migrations já aplicadas permanecem intactas.
- Realtime/TanStack existentes invalidam catálogo, acesso e entrega; prazo e validação pública são avaliados no servidor. Cron de revogação persiste expirações a cada minuto; acesso não depende de esperar o cron.
- A emissão usa o compositor/modelo existente, código exato, identidade e snapshots preservados; certificado pago legado fora do novo ledger não é alterado.

## Implantação e validação

- Publicada 4.8.334/revisão343 pela [PR425](https://github.com/DenielsonSLima/UniversoCursosConsultoria/pull/425), merge `b82b04a412050e2d3defe0ec450e7e83094e0e44` em `main`, sobre a base 4.8.333/3882478317aaed8c4a277ab17ff41631bf3d50ae. Portal compacto paralelo preservado.
-49 testes funcionais SQL/curso aprovados emPGlite0.5.10, incluindo regressão antes/depois, pagamentos pontuais/tardios, parcial/estorno e isolamento de matrículas.30 testesDeno dos finalizadores aprovados, incluindo processador real com uma chamada bancária.
- Os 14/14 workflows da árvore final `d50f37320bba0ac206839a14621b13795c53ac22` concluíram com sucesso, incluindo qualidade, versão e [Acesso EAD por confiança](https://github.com/DenielsonSLima/UniversoCursosConsultoria/actions/runs/43362872245). Foram aprovados os quatro cenários de concorrência com sessões reais PostgreSQL17; arquivos sequenciais apenas na montagem de roles, mantendo sessões concorrentes dentro dos cenários. A expiração e o pagamento disputam a mesma matrícula; o novo caso verifica40P01 real e retomada sem duplicação.
- TestesDOM da etapa anterior exercitaram componentes/hooks reais com transporte sintético. Confirmação adicional viaRealtime mantém acesso e entrega definitivos após25 horas, sem estender o prazo original. Nenhum navegador controlado nem liberação, prova, certificado ou pagamento real como teste.
- Drift remoto identificado emfinancial-receivable-paymentv2: FAILED_SAFE/review segura já estavam em produção. Implantadas `financial-receivable-payment` v3 e `asaas-api` v106, ambas ACTIVE e com JWTtrue. Os 33/112 arquivos foram conferidos com o overlay esperado, preservando as dependências remotas e as guardas FAILED_SAFE; handler/processador remotos não foram substituídos por versões antigas do checkout.
- Fechamento concluído na ordem CI/preview, migration225925, overlay das duas funções Edge, merge/produção e ativação225950. Conforme evidência de implantação na PR425, o cron executou com sucesso após a ativação, às 01:09 (04:09 UTC), e os 14 certificados EAD legados continuaram entregáveis; nenhum certificado por confiança ou matrícula real foi criado ou alterado como teste.
- Conferência remota somente leitura em 13/11 confirmou `full_course_enabled=true`, atualização em `2026-11-13T04:08:48.709343+00:00`, cron `ead-trust-certificate-expiry` ativo a cada minuto e os seis callbacks financeiros diferidos habilitados. Nenhuma nova ativação ou operação financeira foi executada nessa conferência.
- [Deploy de produção](https://vercel.com/denielson-limas-projects/universo-cursos-consultoria/695TRRShNiDgW7nJeB2f3CsESPZ4) `dpl_695TRRShNiDgW7nJeB2f3CsESPZ4` READY, sem erro de alias, pronto em 13/11/2026 às 01:07:51 (America/Maceio). Conferência por MCP Vercel em 13/11 confirmou o commit do merge, o domínio `www.universocc.com.br` com HTTP200 e o bundle principal com HTTP200/versão4.8.334. Essa verificação não substitui smoke autenticado; nenhum navegador controlado foi usado.
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
