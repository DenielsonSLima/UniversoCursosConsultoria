# Confirmação canônica do ciclo manual

Estado: PUBLICADO EM PRODUÇÃO — SMOKE DO WIZARD AINDA PENDENTE

## Causa e aceite

- A prévia inicial preenchia o rascunho visual, mas a revisão confirmada ainda continha `itens: []` quando o usuário não editava os itens. A Edge Function recusava a revisão antes de preparar o ciclo ou chamar o Banese.
- A confirmação agora materializa a revisão a partir da mesma prévia canônica mostrada no resumo; não altera a revisão que identifica a consulta nem cria efeito de recálculo em loop.
- Preservar os modos `BOLETO`, `REGISTRO_SEM_BOLETO` e `OMITIR`, fingerprints, permissões, trava de clique e idempotência do backend.
- Matrícula local retroativa continua fora do emissor. O registro não presume recebimento.
- Nenhuma cobrança, baixa, cancelamento ou alteração de schema faz parte deste hotfix.

## Manifesto explícito

- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/FinanceiroCicloManualDialog.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/hooks/useCicloManualRevision.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/manual-technical-cycle-confirmation.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/manual-technical-cycle-confirmation-revision.test.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/manual-technical-cycle-issuance-progress.contract.test.ts`
- `supabase/functions/technical-manual-cycle-issuance/frontend-confirmation.integration.test.ts`
- `.github/workflows/quality-gates.yml`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/registros/alteracoes/2026-10-01-confirmacao-canonica-ciclo-manual.md`
- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`

Total: 12 arquivos.

## Validação

- 58 testes focados aprovados: handler real, parser real da Edge, orquestrador real com dependências bancárias falsas, termos, datas, três modos, 12 mensalidades, duplicidade e falhas.
- TypeScript global aprovado no workspace; validação limpa de integração repetida no CI antes do merge.
- CI completo e Preview Vercel aprovados no head `36c9a129716fdd97d4b0920d5285c050ec97dbc2`.
- RPCs reais, somente leitura: nos três modos a revisão preenchida manteve itens e fingerprints idênticos à prévia inicial; o alvo permaneceu com zero recebíveis.
- A trava síncrona é liberada por `finally`, inclusive se o callback lançar antes de devolver uma Promise.
- O smoke autenticado usa somente a prévia e revisão; o clique final é validado exclusivamente com banco simulado.
- Nenhum teste chama o Banese real. O erro anterior é reproduzível no parser com revisão vazia e continua sendo rejeitado com segurança.

## Publicação

- Versão publicada: 4.8.142, [PR #233](https://github.com/DenielsonSLima/UniversoCursosConsultoria/pull/233), merge `6102eec1c42bf4ebb064f6282b5b37e8606a6c05`.
- Produção Vercel `6Cb465odkRjXQeHaP65bDmzjJwDX` com sucesso; Safari autenticado confirmou 4.8.142 no domínio oficial. A navegação do wizard foi interrompida por `noWindowsAvailable`; não foi declarada validada nem houve clique de emissão.
- A 4.8.141 permanece em PR de revisão anterior sem correção de runtime; este hotfix não depende dele.
- O manifesto foi composto sobre `main` remoto, preservando alterações locais paralelas e sem publicar o estado amplo do workspace.
- Continuidade importada, cancelamento por trancamento e documentação operacional serão publicados separadamente após validação própria.
