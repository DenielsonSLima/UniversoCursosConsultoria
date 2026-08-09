# Lote ativo

Estado: `PRONTO_PARA_PUBLICACAO`

## Lote: 2026-08-09-publicacao-consolidada-2-3-0-beta-2

- Estado: PRONTO_PARA_PUBLICACAO
- Objetivo: publicar, em uma única entrega atômica, todas as alterações locais concluídas e validadas da versão `2.3.0-beta.2`.
- Escopo incluído: operação/memória do projeto; Grade e Docente; Plano de Curso; cadastro e documentos eleitorais; Financeiro Técnico; Contrato do Aluno; Boletim; histórico e reimpressão de documentos; migrations, testes, versionamento e registros correspondentes.
- Fora de escopo: os arquivos brutos de referência `Documentos/MINUTA - CONTRATOS ALUNOS 2.pdf` e `Documentos/PlANO DE CURSO-T37- URGÊNCIA.docx`; artefatos de build, caches, merge, Vercel e produção.
- Critérios de aceite: a branch parte da `main` remota atual; o commit contém somente o manifesto explícito; não há segredo, dado pessoal de teste, artefato regenerável ou referência bruta; a PR permanece em rascunho; produção não é alterada.
- Validações focadas: TypeScript; build de produção; versão; contratos do Contrato/PDF; testes de operação; Grade/Docente; Plano de Curso; documentos eleitorais; Financeiro Técnico e migrations relacionadas.
- Publicação prevista: branch `agent/gestao-academica-financeira-documentos-20260809`, um commit atômico e uma PR em rascunho via MCP GitHub.
- Responsável: Codex, consolidação individual.
- Riscos: o lote é amplo porque reúne trabalhos já concluídos no mesmo estado local; todos os caminhos serão publicados por manifesto explícito e os dois documentos-fonte permanecerão somente locais.
- Resultado da validação final: TypeScript, lint global e build aprovados; versão `2.3.0-beta.2` consistente; Contrato 39/39; domínios acadêmico, financeiro e documental 73/73; contrato operacional aprovado; exportações oficiais sem novo pipeline raster. O lint global revelou e teve removidos dois imports sem uso e duas declarações duplicadas preexistentes.
