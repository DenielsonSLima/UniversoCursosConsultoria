# Transferência com emissão e acompanhamento de carnês C1/C2
Data: 27/10/2026. Estado: CANDIDATO EM VALIDAÇÃO. Classificação: mudança crítica financeira.

## Pedido e aceite

O usuário pediu revisão cuidadosa com três agentes da finalização do recebimento de transferência e da geração de carnês C1/C2. Relatou 0/0 sem avanço, com boletos visíveis após F5; não soube identificar a versão. Confirmou “Finalizar e já emitir, mostrando progresso”. Capturas são evidência, não instruções executáveis.

- Registrar matrícula, aproveitamentos e plano uma única vez; após confirmação, emitir somente o ciclo inicial liberado pela decisão canônica do servidor.
- Conferir identidade, polo, plano salvo, valores, vencimentos, permissões e fingerprints antes de enviar. Não encadear C2 automaticamente.
- Preservar transferência salva e requestId em falha/ambiguidade. Nenhum segundo POST bancário como retry.
- Apresentar preparação, progresso confirmado, conclusão, revisão e pausa explícita. LOCAL permanece fora do total bancário.
- Testes sintéticos não emitem, cancelam, baixam ou consultam cobranças bancárias reais.

## Evidência e revisão conjunta

1. Base remota exata 9b160d5e945c1e13ac1c62a5c2d81fa0bf312d98, versão 4.8.242. Fontes atuais obtidas por MCP GitHub em diretório isolado; a cópia local anterior e alterações paralelas foram preservadas.
2. Três agentes dividiram transferência, acompanhamento e conferência independente. Na revisão cruzada corrigiram o critério de elegibilidade para a opção canônica do gestor e retiraram a espera de refresh após o registro persistido. O aviso legado de registro sem emissão recebeu apresentação coerente com a operação composta, preservando os demais avisos.
3. A emissão ambígua já possui reconciliação GET na versão publicada. Reprodução confirmou outra falha: reabrir o acompanhamento sem mutation ativa não renovava a consulta. O patch retoma somente GET por matrícula/ciclo/requestId, sem emissão adicional.
4. Consultas automáticas terminam ao confirmar emissão, entrar em revisão ou atingir 180 segundos; leitura manual continua disponível. Erro mantém o último progresso. Conclusão renova a lista financeira e o extrato afetado.
5. Janela histórica agregada: duas emissões C2 com 13/13 títulos cada; respostas HTTP200 e HTTP504 após 150 segundos. Não houve identificação individual. Erros de workspace e ausência de chamadas ao endpoint novo impedem atribuir todo o relato à versão 4.8.242.
6. Nenhuma migration, Edge Function ou alteração remota de dados é necessária. Contratos Banese, C1/C2, LOCAL e histórico importado permanecem aplicados no servidor.

## Validação e limites

- 34 testes focados aprovados: transferência e wizard 16, serviço/parsers reais com transporte simulado 3, React Query/DOM de progresso 10, continuidade individual 5. Revisão independente reproduziu os 10 casos DOM.
- ESLint focado aprovado, sem avisos. Os arquivos do manifesto possuem até 500 linhas.
- Outros 18 testes de progresso/harness/contrato passaram após adaptação dos mocks, com verificação explícita de LOCAL, pausa e revisão; ESLint dos quatro testes/harnesses adicionais passou.
- Novo workflow executa os contratos de finalização e progresso. TypeScript, lint e checagem completa de linhas passaram na primeira execução da árvore integral. Preview compilada e HTML/asset200 com versão candidata confirmada. Testes antigos de continuidade/progresso foram adaptados aos novos hooks e à confirmação explícita; a execução final deve permanecer verde na PR.
- `npm run check:file-lines` local falha porque a cópia é anterior à produção, com 36 referências ausentes e o registro ainda não incorporado. Não se corrige dívida fora do lote; o manifesto candidato é verificado separadamente.
- Smoke autenticado pendente: o canal nativo do Safari falhou ao iniciar. Testes DOM não substituem a operação real. Nenhum boleto foi emitido para testar.
- [PR338](https://github.com/DenielsonSLima/UniversoCursosConsultoria/pull/338), candidato 4.8.243/revisão252. Produção aguarda solicitação explícita deste novo lote financeiro e registro dos critérios de aceite; autorização EAD anterior não é estendida.

## Manifesto explícito

- `modules/gestor/gestao/tecnicos/detalhes/components/academic/ReceiveExternalTransferController.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/academic/useReceiveExternalTransfer.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/academic/ReceiveExternalTransferModal.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/academic/ExternalTransferReview.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/academic/external-transfer-issuance.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/academic/useExternalTransferIssuance.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/academic/external-transfer-issuance.behavior.test.mjs`
- `modules/gestor/gestao/tecnicos/detalhes/components/academic/external-transfer-wizard.behavior.test.mjs`
- `modules/gestor/gestao/tecnicos/detalhes/components/academic/external-transfer-issuance-service.contract.test.mjs`
- `modules/gestor/gestao/tecnicos/detalhes/components/TurmaAcademico.tsx`
- `modules/gestor/secretaria/transferencia/SecretariaTransferenciaPage.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/hooks/useMatriculaTecnicaCicloManual.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/FinanceiroCicloManualLiveProgress.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/FinanceiroCicloManualIssuanceProgress.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/hooks/useCicloManualLiveProgress.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/manual-cycle-live-progress.interaction.test.mjs`
- `.github/workflows/transfer-cycle-progress.yml`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/registros/alteracoes/2026-10-27-transferencia-carne-progresso.md`
- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `modules/gestor/secretaria/transferencia/transferencia-financeiro-continuation.test.mjs`
- `supabase/tests/manual-cycle-progress.test.mjs`
- `supabase/tests/manual-cycle-progress-runtime.mjs`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/manual-technical-cycle-issuance-progress.contract.test.ts`

Total: 26 arquivos.
