# Colunas de notas do diário

Estado: correção preparada para a versão 4.8.59; validação e publicação em andamento.

## Problema e resultado

A 4.8.57 concatenou os instrumentos documentais em uma célula do PDF e adicionou um segundo grupo de notas na tela. A correção mantém uma avaliação por coluna e mostra apenas os instrumentos usados ou selecionados, preservando o padrão do diário.

- Categorias repetidas recebem identificação por ocorrência (P1/P2).
- P+PP permanece uma categoria própria conforme o documento.
- Notas, médias, recuperação, faltas e frequência vêm do servidor, sem recálculo.
- Zero, vazio e casas decimais da origem são preservados.
- Template, marca d’água, assinatura e fechamento mantêm o contrato existente.
- Sem alteração de banco ou reimportação de registros.

## Validação

- Regressão reproduzida nas imagens do usuário e no diário de Relações Humanas T41 em produção.
- Auditoria das 14 fontes confirmou P, TI, TG, CQ, P+PP e P repetido; cabeçalhos sem categoria contêm somente vazios/traços.
- Conferência independente das 14 fontes e de 815 células aprovada, sem mudança de valor ou associação.
- Seis testes do helper, 14 testes de renderização React e 17 testes do PDF aprovados; cobrem colunas únicas/repetidas/combinadas, seleção, cabeçalho, zero, ausência, duas casas decimais e versão em branco.
- Três páginas de resultados com 18 alunos renderizadas e inspecionadas: uma prova, duas provas e instrumento combinado; sem cortes e com texto selecionável.
- Os testes de colunas, UI e PDF passam a executar no CI de toda publicação.
- Smoke do fluxo interativo e conferência em produção pendentes até a publicação.

## Manifesto explícito

Total: 12 arquivos.

- `modules/gestor/gestao/tecnicos/detalhes/components/diarios/DiarioResultadoTab.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/diarios/historico/diario-documentary.presentation.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/diarios/historico/diario-documentary-columns.test.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/diarios/historico/diario-historico.test.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/diarios/diario-pdf-pages.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/diarios/diario-pdf-documentary.test.ts`
- `.github/workflows/quality-gates.yml`
- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/registros/alteracoes/2026-09-13-diario-colunas-notas.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
