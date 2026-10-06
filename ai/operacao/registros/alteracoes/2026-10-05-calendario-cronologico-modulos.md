# Calendário cronológico com múltiplos módulos — 05/10/2026

Mudança crítica de contrato de exportação e PDF nativo, solicitada pelo responsável após análise com três agentes. Após implementar e revisar o PDF, o responsável aprovou a compactação e reiterou a atualização do GitHub. Integração deste lote na main e aplicação da consulta necessária autorizadas.

## Objetivo e aceite

- Preservar a emissão atual de módulo completo.
- Acrescentar calendário cronológico da turma técnica com todos os módulos disponíveis ou subconjunto selecionado.
- Oferecer toda a grade programada ou intervalo inclusivo De/Até, independente do mês da agenda.
- Preparar no servidor linhas únicas por encontro/disciplina/data, identificadas por IDs e ordenadas por data, horário e desempate estável.
- Identificar módulo em cada aula quando o modelo exibir módulos; preservar os quatro cabeçalhos configurados, marca institucional e Blob único para prévia, download e impressão.
- Conservar aulas distintas, inclusive quando data e horário coincidem; apresentar explicitamente grade vazia ou parâmetros incompatíveis.

## Etapas

1. Backend: RPC cronológica separada, payload canônico e teste SQL de contrato.
2. Interface: modo de emissão, seleção de módulos e período, validação e feedback.
3. PDF: compositor vetorial modularizado, resumo do alcance e módulo por aula, QA renderizada.
4. Integração: validação proporcional, manifesto explícito, revisão e Preview.

## Reprodução e estado

- Arquivos centrais de `modules/gestor/calendario/exportacao-aulas` conferidos por hash Git blob contra main remoto; snapshot local anterior ao patch preservado em tmp.
- Consulta MCP somente leitura confirmou T46 com 15 encontros, 30 sessões, módulos I/II/III intercalados entre 29/08 e 19/12/2026. Há duas disciplinas distintas em 19/12 no mesmo horário; o calendário deve conservar ambas.
- Modelo aplicável: `calendario_aulas`, GERAL, ATIVO revisão 2, A4 retrato, quatro cabeçalhos, módulo e marca habilitados. Marca Matriz: JPEG isolado, opacidade 1, escala 100, sem rotação.
- A RPC atual tem três assinaturas legadas; a nova usa nome próprio para preservar compatibilidade e evitar ambiguidade.
- Lote ativo local de Proesc e demais alterações paralelas preservados.

## Validação

- Baseline do PDF: 13 testes focados aprovados; duas páginas renderizadas, texto e tabela vetoriais, recursos isolados de logo e marca.
- Implementação concluída em três frentes. Os 27 testes focados de PDF, seleção e mapper passaram; ESLint e tipagem focada aprovados.
- Ensaio MCP do corpo exato da migration em `DO`/`ROLLBACK`, sem DDL ou ledger: grade completa 15 encontros; módulos I+II 13; outubro 4; dia 19/12 2; intervalo vazio `SEM_GRADE`. Arrays vazios/nulos, módulo externo, período incompleto/invertido e acesso anônimo rejeitados.
- QA final do payload real: 15 encontros em uma página A4, texto/tabela vetoriais, logo original e marca JPEG isolados. Página renderizada, texto extraído e recursos conferidos; nenhuma aula perdida ou texto cortado.
- Compactação solicitada: nomes completos dos módulos em linhas separadas com fonte 7,2 normal, intervalo de 4 mm até a tabela e células cronológicas com lineHeight 3,25/paddingY 1,4. Espaçamento do modo anterior preservado. Os 19 testes PDF e ESLint focado passaram novamente.
- Compositor usa o cabeçalho institucional compartilhado obrigatório. Nome em Helvetica e detalhes oficiais em três linhas por coluna; margens, caixa do logo, divisor, tabela e marca preservados.
- Smoke Safari local do painel real com fixture do ensaio: busca/teclado de curso e turma, cronológico completo, seleção I+II e período de outubro, liberação somente com parâmetros completos e visualizador de Blob nativo. Smoke autenticado da interface publicada será conferido após o deployment.
- Smoke adicional do modo anterior confirmou módulo I completo com sete aulas e somente o título global do módulo.
- `check:file-lines` local: os arquivos deste manifesto respeitam 500 linhas; a checagem global reportou 22 ausências preexistentes da cópia local. A validação da base remota completa fica a cargo do CI da branch preparada.
- Migration aplicada exclusivamente via MCP Supabase, versão efetiva 20261006015302. Fonte preservada byte a byte, com o prefixo do ledger; nenhuma alteração em dados da grade, modelos ou financeiro.
- Teste SQL versionado de 207 linhas executado inteiro contra a RPC instalada em BEGIN/DO/ROLLBACK, sem exceções. Revisão independente somente leitura confirmou corpo idêntico à fonte, search_path vazio, SECURITY DEFINER e permissões authenticated/service_role sem EXECUTE para anon.
- CI completo e Preview READY aprovados para a revisão compacta de1833eb. Alinhamento final do prefixo da migration e registro reexecutam os gates antes do merge; deployment automático e smoke publicado serão registrados no PR.
- Versão preparada 4.8.174/revisão 183, derivada da base remota 4.8.173. Metadados e registro remoto preservam as alterações paralelas; a cópia local antiga não é fonte para publicação.

## Manifesto explícito

Total: 21 arquivos.

- `modules/gestor/calendario/exportacao-aulas/calendarioAulasSelection.ts`
- `modules/gestor/calendario/exportacao-aulas/calendarioAulasSelection.test.ts`
- `modules/gestor/calendario/exportacao-aulas/components/CalendarioAulasExportPanel.tsx`
- `modules/gestor/calendario/exportacao-aulas/components/CalendarioAulasPicker.tsx`
- `modules/gestor/calendario/exportacao-aulas/components/CalendarioAulasTechnicalFilters.tsx`
- `modules/gestor/calendario/exportacao-aulas/services/calendarioAulasExportacao.service.ts`
- `modules/gestor/calendario/exportacao-aulas/services/calendarioAulasExportacao.mapper.ts`
- `modules/gestor/calendario/exportacao-aulas/services/calendarioAulasExportacao.mapper.test.ts`
- `modules/gestor/calendario/exportacao-aulas/services/calendarioAulasExportacao.legacy.ts`
- `modules/gestor/calendario/exportacao-aulas/calendarioAulasExportacao.pdf.ts`
- `modules/gestor/calendario/exportacao-aulas/calendarioAulasExportacao.pdf.layout.ts`
- `modules/gestor/calendario/exportacao-aulas/calendarioAulasExportacao.pdf.assets.ts`
- `modules/gestor/calendario/exportacao-aulas/calendarioAulasExportacao.test.ts`
- `modules/gestor/calendario/exportacao-aulas/calendarioAulasExportacao.cronologico.pdf.test.ts`
- `modules/gestor/calendario/exportacao-aulas/types.ts`
- `supabase/migrations/20261006015302_preparar_calendario_aulas_cronologico_secure.sql`
- `supabase/tests/calendario_aulas_cronologico.rollback.sql`
- `ai/operacao/registros/alteracoes/2026-10-05-calendario-cronologico-modulos.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`
