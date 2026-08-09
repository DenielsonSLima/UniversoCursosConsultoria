# Lote ativo

Estado: `PRONTO_PARA_PUBLICACAO`

## Lote: 2026-08-09-publicacao-consolidada-2-3-0-beta-2

- Estado: PRONTO_PARA_PUBLICACAO
- Objetivo: publicar, em uma única entrega atômica, todas as alterações locais concluídas e validadas da versão `2.3.0-beta.2`.
- Escopo incluído: operação/memória do projeto; Grade e Docente; Plano de Curso; cadastro e documentos eleitorais; Financeiro Técnico; Contrato do Aluno; Boletim; histórico e reimpressão de documentos; compatibilidade de geometria do rodapé da Pasta de Identificação; migrations, testes, versionamento e registros correspondentes.
- Fora de escopo: os arquivos brutos de referência `Documentos/MINUTA - CONTRATOS ALUNOS 2.pdf` e `Documentos/PlANO DE CURSO-T37- URGÊNCIA.docx`; artefatos de build, caches, merge, Vercel e produção.
- Critérios de aceite: a branch parte da `main` remota atual; cada commit atômico contém somente seu manifesto explícito; não há segredo, dado pessoal de teste, artefato regenerável ou referência bruta; a PR permanece em rascunho; produção web não é alterada.
- Validações focadas: TypeScript; build de produção; versão; contratos do Contrato/PDF; testes de operação; Grade/Docente; Plano de Curso; documentos eleitorais; Financeiro Técnico e migrations relacionadas.
- Publicação prevista: branch `agent/gestao-academica-financeira-documentos-20260809`, commit consolidado já aberto e um complemento atômico para o hotfix da Pasta na mesma PR em rascunho, ambos via MCP GitHub.
- Responsável: Codex, consolidação individual.
- Riscos: o lote é amplo porque reúne trabalhos já concluídos no mesmo estado local; todos os caminhos serão publicados por manifesto explícito e os dois documentos-fonte permanecerão somente locais.
- Resultado da validação final: TypeScript, lint global e build aprovados; versão `2.3.0-beta.2` consistente; Contrato/PDF 41/41; hotfix da Pasta 5/5; domínios acadêmico, financeiro e documental 73/73; contrato operacional aprovado; exportações oficiais sem novo pipeline raster. O modelo remoto da Pasta foi confirmado em `v13`, com `pasta_rodape` em `y=930` e altura `100`; snapshots históricos permanecem imutáveis e recebem somente normalização determinística em memória. O lint global revelou e teve removidos dois imports sem uso e duas declarações duplicadas preexistentes.

## Complemento: hotfix da geometria da Pasta de Identificação

- Causa: o hotfix anterior corrigiu a leitura do nome do modelo na RPC, mas a primeira emissão válida expôs um snapshot legado com `pasta_rodape` em `y=1013`, sem altura explícita, fora da área canônica A4.
- Correção: novas emissões usam o modelo `v13`, com rodapé em `y=930` e altura `100`; snapshots `v<=12` com a assinatura legada exata são normalizados somente em memória antes da composição, sem regravar histórico.
- Supabase: migration local `20260809200000_fix_pasta_identificacao_footer_geometry.sql` aplicada por MCP como `20260809200839_fix_pasta_identificacao_footer_geometry`; verificação remota confirmou o modelo atual e preservou o snapshot histórico `v9`, `y=1013`, sem altura.
- Manifesto incremental: `modules/gestor/cadastros/ficha-matricula/{document-layouts.ts,pasta-template-geometry.ts}`; `modules/gestor/secretaria/historico-emissoes/{historico-emissoes.service.ts,emission-document.pdf.contract.test.ts}`; `modules/gestor/secretaria/shared/student-registration-fields.contract.test.ts`; `supabase/migrations/20260809200000_fix_pasta_identificacao_footer_geometry.sql`; `supabase/tests/student_registration_pasta_footer_geometry.contract.test.ts`; este lote e os registros operacionais do hotfix.
- Validação: 41/41 contratos documentais, 5/5 contratos específicos, TypeScript e ESLint focado aprovados; PDF A4 vetorial renderizado com Poppler, texto extraível e rodapé sem recorte. O navegador controlável permaneceu indisponível, portanto o clique autenticado final fica pendente para o usuário após recarregar o localhost.
