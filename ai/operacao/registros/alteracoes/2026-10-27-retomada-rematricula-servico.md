# Retomada da rematrícula aprovada pelo serviço

Estado: retomada publicada na Edge v16; substituição posterior autorizada e concluída, conforme registro 2026-10-27-substituicao-rematricula-servico.md.
Domínio: financeiro técnico. Um agente; sem mudança de valores, datas, título
bancário, autorização histórica, situação acadêmica ou dos demais recebíveis.

## Diagnóstico e operação real

- Safari autenticado confirmou C2 com 12/13 títulos concluídos.
- A taxa já tinha capacidade específica de serviço consentida e tentativa
  iniciada. A autorização humana arquivada permanece com a request original.
- Retomar seguia pela autorização humana comum: a tentativa de trocar a request
  era bloqueada por `REJECTED_FEE_CANONICAL_CONSENT_REQUIRED`.
- A recuperação já implantada foi acionada uma vez via MCP, exclusivamente
  GET da identidade reservada. Resposta confirmou identidade, termos, título
  aberto e ausência de pagamentos; o retorno não apresentou candidato Pix.
- Diagnóstico sanitizado: `SNAPSHOT_000010_PIX_000000`. Sem Pix oficial,
  persistência e conclusão continuam bloqueadas. Não houve novo POST.
- Conferência posterior: 13 recebíveis, 12 completos, 12 pares Pix, 12 transações;
  hash das outras 12 cobranças igual ao arquivo original. A taxa ficou preservada
  em `API_AMBIGUOUS`, sem transação fabricada.

## Correção preparada

A retomada autenticada da rematrícula C2 consulta a RPC específica antes da
autorização ordinária. Quando existe capacidade de serviço já utilizada,
agenda a recuperação GET existente e interrompe o caminho ordinário. A mensagem
orienta aguardar e consultar o acompanhamento; não afirma conclusão bancária.
Sem capacidade de serviço, segue pelo emissor original. C1 e mensalidades não
executam a nova RPC.

A RPC deriva a operação no servidor, exige gestor com permissão financeira e
polo, mesma matrícula/request/capacidade, claim anterior e estado íntegro.
Reaplica o CAS do serviço; respeita lease, backoff de 1/5/60 minutos e janela
máxima de sete dias. Registra o ator da solicitação sem reatribuir consentimento.
Não aceita dados bancários ou financeiros fornecidos pelo cliente.

## Validação e aceite

- 26 testes Deno do orquestrador, política de recuperação e nova retomada: passam.
- PostgreSQL isolado PGlite executa a migration real; somente dependências
  existentes e fila de rede são simuladas. Cenários: autenticação, RBAC, polo,
  request, drift, claim, conclusão, expiração, lease, backoff, grants e preservação.
- Resultado SQL: um teste integrado com 16 cenários aprovado; sem rede bancária.
- `deno check` da dependência alterada: passa.
- Arquivos deste manifesto abaixo de 500 linhas; sem build global.
- `npm run check:file-lines` foi executado e falhou em 32 ausências anteriores
  de manifestos/arquivos de outros lotes na cópia local. Não foram corrigidas
  neste escopo. A conferência restrita dos oito arquivos deste lote passa.
- Publicar requer migration antes da Edge `technical-manual-cycle-issuance`,
  usando o bundle vigente remoto como base. O export `loadServiceFeeIssuanceScope`
  do worker implantado foi preservado. As dependências foram recuperadas do
  bundle vigente, sem substituir a implantação por uma árvore local antiga.
- Depois da publicação: smoke no Safari deve trocar o erro de consentimento por
  consulta preservada; confirmar zero POST novo e integridade das 12 mensalidades.
- Aceite financeiro final continua sendo 13/13 com identidade/transação/Pix
  oficiais, ou pendência bancária explícita. Testes não comprovam disponibilidade
  do QR no Banese nem substituem esse aceite.

## Manifesto explícito

Total: 7 arquivos.

- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/registros/alteracoes/2026-10-27-retomada-rematricula-servico.md`
- `supabase/functions/technical-manual-cycle-issuance/dependencies.ts`
- `supabase/functions/technical-manual-cycle-issuance/service-fee-resume.ts`
- `supabase/functions/technical-manual-cycle-issuance/service-fee-resume.test.ts`
- `supabase/migrations/20261027222313_resume_service_fee_exact_get.sql`
- `supabase/tests/service_fee_resume.isolated.test.ts`
