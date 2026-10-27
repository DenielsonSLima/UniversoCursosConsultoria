# Substituição da rematrícula aprovada pelo serviço

Estado: backend publicado e substituição concluída em produção em 27/10/2026 às 19:38 (America/Maceio). Código em publicação GitHub pelo manifesto abaixo.

O usuário autorizou explicitamente a publicação e, se o GET continuar sem Pix,
a baixa e uma reemissão correta da única rematrícula já diagnosticada. Valor e
vencimento permanecem R$100 e 30/10/2026; doze mensalidades, run e autorização
histórica permanecem preservados. Não há autorização em lote para outros títulos.

## Execução e proteção

- Retomada GET: migration aplicada via MCP e Edge de emissão v16 ativa.
- Nova consulta continuou sem Pix. PUT seguido de GET confirmou situação 5 e
  ausência de pagamentos. Um novo título foi criado com retorno Pix oficial.
- Registro privado por capacidade, snapshot financeiro, lease e prova fresca de
  situação 5. Nenhuma identidade é apagada antes da confirmação de baixa.
- Um novo Nosso Número é reservado exclusivamente após a baixa, com preflight
  oficial. Repetições após o início da nova tentativa são GET-only; não há segunda
  substituição automática se o novo título não retornar Pix.
- O primeiro retorno oficial da nova criação é arquivado antes da persistência
  canônica. GET posterior vazio pode usar esse mesmo Pix validado, após confirmar
  identidade, termos, ausência de pagamento e estado aberto.
- Guards existentes recebem somente a exceção cercada desta operação, com hashes
  de definição esperados. EAD não é usado para substituir cobrança técnica.
- Fontes de duas migrations já aplicadas e dos helpers de serviço implantados
  foram recuperadas por MCP para recompor a dependência versionada, sem reaplicar
  migrations nem modificar seu conteúdo.

## Validação

- Worker: seis testes simulados, incluindo Pix antes da baixa, confirmação antes
  de novo POST, retenção do POST, perda de resposta e pagamento concorrente.
- PostgreSQL isolado executa as quatro migrations e as definições reais dos guards;
  demais bypasses legados estão fechados. Exerce claim, intent, confirm, reserva,
  API intent, preservação, resultado imutável e retry GET-only.
- Tipagem do bundle completo vigente com a nova rota: passa.
- Sem rede bancária nos testes. Smoke real e conferência final ficam registrados
  após a execução autorizada; nenhuma saída simulada comprova emissão.
- Não houve alteração de compositor PDF. Verificar o documento nativo da taxa,
  QR oficial decodificável, linha, valor e vencimento após emissão.

## Manifesto explícito

Total: 29 arquivos.

- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/registros/alteracoes/2026-10-27-retomada-rematricula-servico.md`
- `ai/operacao/registros/alteracoes/2026-10-27-substituicao-rematricula-servico.md`
- `supabase/functions/technical-manual-cycle-issuance/dependencies.ts`
- `supabase/functions/technical-manual-cycle-issuance/receivable-issuance.ts`
- `supabase/functions/technical-manual-cycle-issuance/service-fee-resume.ts`
- `supabase/functions/technical-manual-cycle-issuance/service-fee-resume.test.ts`
- `supabase/migrations/20261027222313_resume_service_fee_exact_get.sql`
- `supabase/tests/service_fee_resume.isolated.test.ts`
- `supabase/functions/technical-manual-cycle-recovery-worker/index.ts`
- `supabase/functions/technical-rejected-fee-correction/service-issuance.ts`
- `supabase/functions/technical-rejected-fee-correction/service-recovery.ts`
- `supabase/migrations/20261027184900_rejected_fee_service_capability.sql`
- `supabase/migrations/20261027184910_rejected_fee_service_dispatch.sql`
- `supabase/migrations/20261027223737_service_fee_replacement_registry.sql`
- `supabase/migrations/20261027223740_service_fee_replacement_transition.sql`
- `supabase/migrations/20261027223742_service_fee_replacement_result.sql`
- `supabase/migrations/20261027225916_service_fee_replacement_null_lease.sql`
- `supabase/functions/technical-service-fee-replacement/worker.ts`
- `supabase/functions/technical-service-fee-replacement/worker.test.ts`
- `supabase/tests/service_fee_replacement.isolated.test.ts`
- `supabase/tests/fixtures/service-fee-replacement-claim.sql`
- `supabase/tests/fixtures/service-fee-replacement-fence.sql`
- `supabase/tests/fixtures/service-fee-replacement-guards.sql`
- `supabase/tests/fixtures/service-fee-replacement-schema.sql`
- `supabase/tests/fixtures/service-fee-replacement-scope.sql`
- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`
- `supabase/tests/financial-correction-worker-auth.test.ts`

## Resultado operacional

- Worker de recuperação v19 HTTP200; Edge de emissão v16 ativa.
- Ciclo: 13/13 títulos completos, 13 pares Pix e 13 transações; hash das doze
  mensalidades idêntico ao arquivo anterior.
- Taxa: R$100, vencimento 30/10/2026, PENDENTE, API_REGISTERED, uma transação.
  Linha com 47 dígitos e barras com 44; Pix/imagem iguais no recebível/transação.
- Novo Nosso Número distinto do antigo. Baixa arquivada com situação 5 e zero
  pagamentos. Retorno original da nova criação preservado em área privada.
- Migrations versionadas com os IDs reais do ledger: 20261027222313,
  20261027223737, 20261027223740 e 20261027223742.
- SQL isolado: dez cenários aprovados; worker: seis testes aprovados.
- LOTE_ATIVO.md pertence à entrega EAD paralela e foi preservado; o manifesto
  financeiro permanece neste registro, sem consolidar os domínios.

## Documento e limites do smoke

- PDF gerado pelo compositor nativo recuperado da Edge vigente, com snapshot
  real do recebível e marcas institucionais; nenhuma mudança de layout.
- Página renderizada e revisada; valor e vencimento presentes nas duas vias,
  códigos de barras/linha completos e somente imagens isoladas. Dois QR Codes
  extraídos do PDF foram decodificados por jsQR e iguais ao EMV oficial gravado.
- Payload e dados pessoais ficaram somente em artefatos privados regeneráveis
  de QA, sem versionamento, logs ou documentação operacional.
- Safari reconheceu o portal e a linha 12/13 antes da substituição; depois, CUA
  retornou cgWindowNotFound/noWindowsAvailable. Smoke interativo final pendente
  por indisponibilidade da janela. Auditoria real do banco confirma 13/13.
- Validação final: seis testes de worker e dois ensaios SQL, com 26 cenários,
  aprovados; tipagem do bundle completo aprovada.
- Check global de linhas local apontou 36 ausências de outros lotes; os 29
  arquivos deste manifesto respeitam o teto de 500 linhas. Sem ampliação da
  auditoria ou reparo de entregas paralelas.

## Identificação de versão

- Candidato financeiro 4.8.241/revisão 250; 4.8.240 permanece reservado à
  entrega EAD paralela. Os dois arquivos de versão dessa entrega foram montados
  sobre main em staging privado, sem sobrescrever as edições locais da outra
  frente. A publicação não inclui o conteúdo EAD em elaboração.

- Boundary HTTP do worker: sete testes autenticados/negativos aprovados,
  incluindo isolamento das rotas de serviço e substituição. Harness atualiza
  somente bindings das dependências removidas pelo AST; autenticação real
  permanece exercida pelo handler original. Lint preserva causas nos erros
  dos testes sintéticos.

## Lease ausente

- Migration adicional `20261027225916` aplicada por MCP após ensaio isolado: cinco
  guards passam a rejeitar lease NULL, além de expirado. Migrations anteriores
  continuam imutáveis. Casos sem claim, após release e na reserva foram exercidos.
- A operação concluída permanece preservada; nenhuma nova ação bancária foi feita.
