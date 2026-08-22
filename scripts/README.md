# Scripts do Repositório

Status: CANÔNICO como catálogo inicial. Última revisão: 2026-08-12.

Scripts existem para validação, build, geração e operação controlada. Eles não
autorizam escrita em produção por si só.

## Categorias

| Categoria | Exemplos | Uso |
| --- | --- | --- |
| Build e versão | check-version-record.mjs, generate-social-share-pages.mjs | Parte do build e da consistência de versão. |
| Qualidade de fluxo | test-banese-payment-ui.mjs, test-portal-auth-flow.mjs, test-gestor-access.mjs | Executar apenas quando o fluxo correspondente mudar. |
| Financeiro e documentos | test-caixa-report.mjs, test-financial-report-pdf.mjs, test-selectable-pdf-exports.mjs | Validar relatórios, PDFs e contratos sem expor dados reais. |
| Operação de agentes | agent-memory-rag.mjs, test-agent-operation.mjs | Mantêm a governança e o RAG local. |
| EAD e conteúdo | generate-ead-sitemap.mjs, update-acs-*.mjs, import-ead-courses.mjs | Operacionais; revisar entrada, escopo e autorização antes de usar. |
| Diagnósticos | scripts com prefixo test- ou arquivos em scratch/ | Não são automaticamente parte do produto. |

## Regras de uso

- Prefira comandos declarados em package.json.
- Leia o script antes de rodar qualquer operação que altere dados, conteúdo,
  usuários, curso ou integração.
- Scripts que usam REST direto, chaves, CPF fixo ou senha não devem ser
  transformados em rotina de produção. Eles precisam de revisão de segurança,
  LGPD e substituição por procedimento autorizado.
- Não guardar output, planilhas ou PDFs reais dentro de scripts/.

## Scripts protegidos

Não remover sem substituto validado:

- check-version-record.mjs;
- generate-social-share-pages.mjs;
- agent-memory-rag.mjs;
- agent-memory-rag.test.mjs;
- test-agent-operation.mjs;
- runners de teste ainda chamados por package.json ou CI.

## Material a classificar

scratch/check_query.mjs é um diagnóstico versionado fora da pasta de scripts.
Antes de remover, decidir se ele vira script documentado em uma pasta de
diagnóstico ou se será retirado em lote próprio.

