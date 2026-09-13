# Cabeçalho dos instrumentos avaliativos do diário

Estado: revisão e build 4.8.60 aprovados; publicação autorizada pelo usuário e em execução.

## Problema e aceite

A 4.8.59 separou as notas, mas inventou P1/P2 e deixou o PDF sem o agrupamento do modelo. A tabela deve conter uma linha superior INSTRUMENTOS AVALIATIVOS e uma segunda linha com as siglas pertinentes. Frequência agrupa Falta e %. Demais cabeçalhos ocupam as duas linhas.

- Fonte XML: Anatomia T42 tem P/P; Relações Humanas T41 tem P. Não acrescentar números às siglas.
- Preservar duas células P, notas, zero, vazio, médias e recuperação; nenhuma alteração de banco ou cálculo.
- O diário regular respeita os instrumentos selecionados; documental respeita os cabeçalhos utilizados na origem.
- Mesma estrutura no PDF preenchido/em branco; preservar compositor, configuração e marca institucional.
- Revisão com três frentes independentes: fonte, UI e PDF.

## Validação

- Conferência direta dos dois DOCX e das imagens do usuário confirmou o cabeçalho agrupado e as siglas literais.
- Inventário institucional já disponível: diario_TECNICO v2, capa e contracapa configuradas, marca dos dois polos com escala100/opacidade1/rotaçãofalse. Adapters e recursos preservados.
- Reunião com três agentes concluída: fonte XML, seleção/UI e compositor PDF. Os espaços vazios do formulário Word não impõem colunas fixas; prevalece a seleção ou as categorias documentais usadas.
- 34 testes aprovados: 8 PDF documental, 6 helper, 3 snapshot, 14 histórico e 3 SSR da seleção. A suíte de histórico executou com `--no-check` por incompatibilidade de resolução de tipos React no Deno; não representa aprovação de tipagem global.
- PDFs sintéticos de P/P, P e P+PP gerados no compositor nativo; página de resultados renderizada e inspecionada, com extração textual e recursos restritos a logo/QR isolados. Sem P1/P2, sobreposição ou alteração das médias fornecidas.
- Teto de linhas aprovado; arquivos do manifesto dentro de 500 linhas.
- Usuário autorizou explicitamente revisar, conferir e publicar em 13/09/2026. Build de produção aprovado; revisão independente sem bloqueador para os modelos P/P, P e P+PP. Dez contratos da fronteira PDF aprovados adicionalmente.
- Sessão Safari voltou a responder; fluxo autenticado T42 acessível na 4.8.59. Conferência do cabeçalho publicado será feita após o deploy.
- Achado preexistente P3: categorias intercaladas P/TG/P são agrupadas como P/P/TG, preservando notas associadas; não ocorre nas fontes deste lote. Correção de ordenação intercalada fica fora desta publicação.

## Manifesto explícito

Total: 13 arquivos.

- `modules/gestor/gestao/tecnicos/detalhes/components/diarios/DiarioResultadoTab.tsx`
- `modules/gestor/gestao/tecnicos/detalhes/components/diarios/historico/diario-documentary.presentation.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/diarios/historico/diario-documentary-columns.test.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/diarios/historico/diario-historico.test.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/diarios/diario-pdf-pages.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/diarios/diario-pdf-result-table.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/diarios/diario-pdf-documentary.test.ts`
- `modules/gestor/gestao/tecnicos/detalhes/components/diarios/diario-resultado-instruments.test.mjs`
- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/registros/alteracoes/2026-09-13-diario-cabecalho-instrumentos.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
