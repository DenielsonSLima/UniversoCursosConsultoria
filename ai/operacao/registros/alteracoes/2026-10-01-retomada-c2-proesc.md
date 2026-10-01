# Retomada do C2 local após histórico Proesc

Estado: BANCO APLICADO E VALIDADO — publicação GitHub/Preview/produção 4.8.146 em fechamento.
Escopo solicitado: corrigir o bloqueio 409/42501 na retomada da T42,
preservar a T46 e impedir duplicidade quando o C2 já existe.
Nenhuma emissão bancária real ou recriação de recebíveis autorizada para testes.

## Manifesto explícito

- `supabase/migrations/20261001091400_allow_external_proesc_c1_local_c2_issuance.sql`
- `supabase/migrations/20261001093400_dryrun_proesc_c2_issuance_20261001.sql`
- `supabase/tests/proesc_local_c2_issuance.rollback.sql`
- `supabase/tests/proesc_local_c2_issuance.contract.test.ts`
- `supabase/tests/imported_banese_c1_continuation.rollback.sql`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/FinanceiroConfigSummary.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/financeiro-config-readonly.test.ts`
- `.github/workflows/quality-gates.yml`
- `ai/operacao/registros/alteracoes/2026-10-01-retomada-c2-proesc.md`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`

Total: 13 arquivos.

## Reprodução e causa

- Produção 4.8.145: criação do C2 local concluída, 13 recebíveis sem título remoto.
- RPC real de autorização reproduziu SQLSTATE 42501 em transação revertida.
- A passagem durável admite criar C2 após C1 Proesc confirmado; após a criação,
  a guarda de geração corretamente deixa de permitir outro ciclo.
- As guardas de emissão interpretavam esse estado como histórico protegido.
  A exceção pós-criação cobria C1 Banese importado, mas não C1 EXTERNAL_PROESC.
- O endpoint preserva o progresso e retorna HTTP 409; o contexto de retomada existe.
- O aviso da configuração era agregado por turma, não prova individual de C2.

## Correção e aceite

- Nova exceção privada e restrita ao C2 LOCAL_CREATED, revisado e íntegro.
- C1 durável EXTERNAL_PROESC deve corresponder à identidade atual.
- C2 externo, conflito, cobertura, vínculo histórico, run extra, pessoa/polo ou
  snapshot incompatíveis não são liberados.
- Somente os três pontos pós-criação são ajustados: autorização, primeiro claim
  e guarda do POST. ACL, consentimento, fingerprint, status e revisão permanecem.
- Geração, proteção global, histórico C1 e helper Banese aplicado não mudam.
- A cerca comum também impede continuação Banese quando existe prova externa de C2.
- Try-lock da matrícula e lock do fato C2 ordenam a autorização contra importações;
  disputa em andamento nega temporariamente sem esperar por lock invertido.
- Helpers VOLATILE relêem o estado depois dos locks, conforme a
  [documentação PostgreSQL](https://www.postgresql.org/docs/current/xfunc-volatility.html).
- Aviso passa a explicar a conferência individual e a proteção de ciclos existentes.
- Testar a RPC real e transições até a guarda bancária em rollback, sem rede.
- Comparar T46 e recebíveis existentes antes/depois; nunca recriar os 13 registros.

## Validação

- Aviso: 4 testes de renderização passaram (esbuild + node:test).
- Emissão/retomada: 52 testes passaram; contratos SQL: 14 testes passaram.
- TypeScript e build completo locais passaram; metadados isolados 4.8.146 válidos.
- Primeiro ensaio temporário passou nas 13 autorizações, claims e guardas API
  dos recebíveis existentes, e no controle de autorização T46. Depois falhou no
  setup de controle sintético; schema/dados foram revertidos, sem entrada no ledger.
- Recebíveis existentes mantiveram o fingerprint completo após o rollback.
- Ensaio integral final passou: DDL temporário, 13 autorizações/claims/guardas API,
  controle de autorização nativa T46, fixture Proesc e fixture Banese com C2 externo.
- As negativas exercem fato C2, C1 histórico, item fora do run, polo/pessoa,
  escopo Proesc divergente, destino LOCAL, pago e tentativa de geração duplicada.
- ROLLBACK comprovado pela ausência do helper e pelos fingerprints preservados.
- O MCP registrou o ensaio `dryrun_proesc_c2_issuance_20261001` no ledger sob
  `20261001093400`, embora o schema tenha sido revertido. Fonte NOOP correspondente
  versionada; a migration real foi aplicada separadamente.
- T46 antes da mudança: 6 matrículas, 3 elegíveis C1 e 3 elegíveis C2.
- T42: 35 matrículas; casos C2 confirmado/conflito seguem sem permissão de geração.
- Smoke visual autenticado pendente: Safari retornou cgWindowNotFound.
- Gate local global de linhas encontrou 12 fontes antigas ausentes no checkout,
  fora do manifesto. A árvore limpa do CI será o aceite completo.
- Metadados de publicação preparados sobre main remoto 4.8.145 em staging isolado,
  preservando lote e alterações locais paralelas. Sem alteração de skills/AGENTS.

## Aplicação e revisão final

- Três agentes aprovaram sem P0/P1 residual após o ensaio completo.
- Migration real aplicada via MCP sob ID remoto `20261001093522`:
  `allow_external_proesc_c1_local_c2_issuance`, SHA-256
  `1a1c348df78b0f324ebc0e6162cb4e7134ff69f4dfc8a8eb17303a3a2b1f9fdd`.
- Pós-aplicação repetiu as autorizações/claims/guardas em rollback, com sucesso.
- Prova de retomada true, geração duplicada false; 13 recebíveis intactos e 0 emitidos.
- T46 manteve fingerprint integral; helper privado sem EXECUTE para anon/service_role,
  autorização pública somente authenticated e com as guardas de usuário/polo existentes.
- Advisor de segurança não acrescentou achados; avisos preexistentes preservados.
- Disputa entre sessões não foi simulada. A ordem/try-lock e os writers foram
  revisados e ancorados; disputa pode negar temporariamente e exigir retry seguro.
- Nenhuma chamada bancária, emissão, cancelamento ou baixa executada neste lote.
