# NFS-e: nome do município do tomador

Objetivo: resolver o nome pelo código IBGE quando não há rótulo correspondente no XML, sem alterar a autorização fiscal.
Status: validado localmente, catálogo remoto conferido por leitura. Publicação autorizada pelo usuário em 12/11/2026.

## Manifesto explícito
- `modules/gestor/emissor-nfse/visualizador/danfse.pdf.test.mjs`
- `modules/gestor/emissor-nfse/visualizador/danfse.presentation.ts`
- `modules/gestor/emissor-nfse/visualizador/danfse.types.ts`
- `modules/gestor/emissor-nfse/visualizador/services/danfse-municipalities.service-core.ts`
- `modules/gestor/emissor-nfse/visualizador/services/danfse-municipalities.service.ts`
- `modules/gestor/emissor-nfse/visualizador/services/danfse-municipalities.test.mjs`
- `modules/gestor/emissor-nfse/visualizador/services/nfse-issued-pdf.service.ts`
- `ai/operacao/registros/alteracoes/2026-11-12-nfse-municipio-tomador.md`

- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`
- `internal/versioning/changelog/2026-10-20-a-21-versoes-4-8-228-a-229.md`

Total: 11 arquivos.

## Aceite e validação

- Nomes do XML têm prioridade; nota com município já identificado não consulta catálogo.
- Código exato, UF compatível, aborto e erro de consulta tratados; desconhecido não vira outro município.
- XML, número, estado fiscal e código IBGE preservados. Prévia, download e ZIP usam a mesma preparação.
- Testes focados, TypeScript e teto de linhas aprovados. PDF fictício renderizado, texto e recursos vetoriais inspecionados.
- Catálogo remoto ativo e SELECT/RLS conferidos para os códigos envolvidos, sem gravação.
- Smoke autenticado Safari pendente: Mac offline na consulta de ambientes. Não substituir por acesso em outro navegador.
- Nenhuma migration, emissão, cancelamento ou alteração de documento fiscal.
