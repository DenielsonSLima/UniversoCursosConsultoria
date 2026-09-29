# Matrícula técnica sem acesso financeiro

Estado: VALIDADO — PUBLICAÇÃO EM PRODUÇÃO AUTORIZADA

## Objetivo e aceite

Perfil com aba Alunos e sem Financeiro usa seleção e confirmação acadêmica. O fluxo envia intenção `PENDENTE`, sem datas, condição individual ou agendamento; não exibe valores nem cria cobrança. O assistente financeiro permanece para perfis autorizados.

## Manifesto explícito

- `modules/gestor/gestao/tecnicos/detalhes/components/TurmaAlunos.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/alunos/ConfirmarVinculoAcademicoModal.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/alunos/technical-enrollment-no-finance-access.contract.test.mjs`
- `.github/workflows/quality-gates.yml`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/registros/alteracoes/2026-09-29-matricula-tecnica-sem-financeiro.md`
- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`

Total: 9 arquivos.

## Contratos preservados

- Com Financeiro, permanece o assistente completo; sem Financeiro, o diálogo acadêmico é bloqueado durante carga/erro e permite repetir a consulta.
- RPC, autorização, idempotência e `cobrancaGerada=false` permanecem; não há mudança de banco, RLS ou regra financeira.
- Limitação preexistente: a resposta interna do pré-vínculo contém a projeção financeira completa. A nova interface não a exibe; reduzir o payload exige contrato backend separado.

## Validação

- Cinco contratos novos, nove testes Node combinados e dois contratos financeiros afetados aprovados.
- TypeScript, ESLint focado, diff, versão `4.8.129`/revisão 138, build e limite remoto de linhas aprovados.
- Revisão independente sem bloqueador ou exposição visual de valores.
- Smoke autenticado no Safari pendente porque a superfície CUA não está disponível nesta sessão.

## Publicação

Produção autorizada pelo usuário em 29/09/2026. Publicação via GitHub MCP, em commit atômico e PR com checks aprovados antes do merge.
