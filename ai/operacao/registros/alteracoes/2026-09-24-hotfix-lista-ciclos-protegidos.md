# Hotfix da lista de ciclos protegidos — 24/09/2026

## Incidente e aceite

- Regressão da 4.8.78 reportada em produção: um estado individual rejeitado impedia toda a lista financeira da turma.
- Pedido atual continua a autorização de correção e publicação do financeiro, preservando cobranças existentes.
- Diagnóstico somente leitura: 454 matrículas técnicas em 11 turmas; 44 estados históricos sem ciclo comprovado derrubavam as listas de 8 turmas. Desses, 26 sem política e 6 com metadados de conferência Proesc.
- Parser anterior reproduziu exatamente 44 falhas; corrigido aceitou os 454 retornos reais, sem alterar elegibilidade.
- Aceite: listas carregadas, históricos protegidos sem botões de emissão, fontes Proesc/Banese preservadas e aluno novo ainda com prévia revisável.

## Manifesto explícito

- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/matricula-tecnica-ciclo-manual.parser.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/matricula-tecnica-ciclo-manual-preview.contract.test.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/FinanceiroCicloManualStatus.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/financeiro/manual-technical-cycle-ui.contract.test.ts`
- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/registros/alteracoes/2026-09-24-hotfix-lista-ciclos-protegidos.md`

Total: 9 arquivos.

## Correção e validação

- Parser reconhece somente o bloqueio HISTORICO_FINANCEIRO_EXISTENTE com estado protegido, geração falsa e próximo ciclo/data nulos; política/base podem estar ausentes e ciclo anterior comprovado permanece íntegro.
- Campos obrigatórios, contadores, origem e metadados inválidos continuam rejeitados. Nenhuma mudança em RPC, migrations, Edge, boleto ou pagamentos.
- Status apresenta histórico existente, sem inventar segundo ciclo ou afirmar emissão de títulos.
- Testes de lista mista, ausência de política, conferência Proesc, ciclo anterior parcial e negativas de emissão/metadados inválidos.
- Estados reais usados somente em artefato temporário sem identificação pessoal; não integram o manifesto.
- Revisão independente do parser e dos caminhos de ações; geração/retomada protegidas permanecem ocultas.
- Build aprovado; 46 testes da etapa de ciclos aprovados. Smoke ReactDOM sem ciclo e com ciclo anterior parcial confirmou texto e ausência de botões; erro real da T-43 reproduzido na sessão Safari. CI, Preview e conferência autenticada após publicação serão registrados no PR.

## Publicação

- Versão 4.8.79/revisão 88; base remota 68b1c062, exclusivamente MCP GitHub.
- Changelog e registro remoto partem de main; alterações paralelas do Caixa e fechamento local anterior não integram este hotfix.
