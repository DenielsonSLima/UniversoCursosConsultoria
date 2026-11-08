# NFS-e — recebimentos, preparação e modelos de serviço

## Objetivo e aceite

Consultar os recebimentos históricos sem exceder o limite de tempo, preservando o filtro pela data efetiva do pagamento e os totais calculados no backend. Exibir nome do mês e ano em pt-BR também no cabeçalho do Emissor. Manter os alunos adicionados em Preparar emissão ao navegar pelas abas e permitir escolher o modelo cadastrado para o polo.

Cadastrar e editar modelos em modal compacto, com Código de Tributação Nacional, NBS, situação do ISSQN, indicador da operação, descrição e informações complementares. A classificação fiscal não recebe valor padrão. A seleção Imunidade exige o tipo correspondente. Campos e limites conferidos no [leiaute oficial DPS/NFS-e de 09/02/2026](https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/documentacao-atual/anexo_i-sefin_adn-dps_nfse-snnfse-v1-01-20260209.xlsx).

## Manifesto explícito

- `modules/gestor/emissor-nfse/EmissorNfsePage.tsx`
- `modules/gestor/emissor-nfse/preparar/PrepararNfseTab.tsx`
- `modules/gestor/emissor-nfse/preparar/NfseMonthPicker.tsx`
- `modules/gestor/emissor-nfse/preparar/hooks/NfsePreparationDraft.tsx`
- `modules/gestor/emissor-nfse/preparar/nfse-month.presentation.ts`
- `modules/gestor/emissor-nfse/modelos/ModelosNfseTab.tsx`
- `modules/gestor/emissor-nfse/modelos/NfseModelForm.tsx`
- `modules/gestor/emissor-nfse/modelos/NfseModelServiceFields.tsx`
- `modules/gestor/emissor-nfse/modelos/NfseModelComplementaryFields.tsx`
- `modules/gestor/emissor-nfse/modelos/NfseFiscalCodeField.tsx`
- `modules/gestor/emissor-nfse/modelos/catalogos/nfse-fiscal-catalogs.types.ts`
- `modules/gestor/emissor-nfse/modelos/catalogos/generate_catalogs.py`
- `modules/gestor/emissor-nfse/modelos/catalogos/generated/nfse-fiscal-catalogs.json`
- `modules/gestor/emissor-nfse/modelos/catalogos/nfse-fiscal-catalogs.test.ts`
- `modules/gestor/emissor-nfse/modelos/hooks/useNfseFiscalCatalogs.ts`
- `modules/gestor/emissor-nfse/modelos/queries/nfse-fiscal-catalogs.keys.ts`
- `modules/gestor/emissor-nfse/modelos/services/nfse-fiscal-catalogs.service.ts`
- `modules/gestor/emissor-nfse/modelos/nfse-model-form.css`
- `modules/gestor/emissor-nfse/modelos/hooks/useNfseModels.ts`
- `modules/gestor/emissor-nfse/modelos/queries/nfse-models.keys.ts`
- `modules/gestor/emissor-nfse/modelos/services/nfse-models.contract.ts`
- `modules/gestor/emissor-nfse/modelos/services/nfse-models.contract.test.ts`
- `modules/gestor/emissor-nfse/modelos/services/nfse-models.service-core.ts`
- `modules/gestor/emissor-nfse/modelos/services/nfse-models.service.ts`
- `modules/gestor/emissor-nfse/types/nfse.types.ts`
- `modules/gestor/emissor-nfse/services/nfse.mappers.ts`
- `modules/gestor/emissor-nfse/services/nfse.service-core.ts`
- `modules/gestor/emissor-nfse/hooks/useNfseQueries.ts`
- `modules/gestor/emissor-nfse/hooks/useNfseMutations.ts`
- `supabase/migrations/20261108225236_nfse_receipt_amount_projection.sql`
- `supabase/migrations/20261108225453_nfse_models_private_store.sql`
- `supabase/migrations/20261108225459_nfse_models_save_rpc.sql`
- `supabase/tests/nfse_receipt_students.isolated.test.mjs`
- `supabase/tests/nfse_models.isolated.test.mjs`
- `.github/workflows/nfse-regressions.yml`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/registros/alteracoes/2026-11-08-nfse-preparacao-modelos.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/rag/index.json`
- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`

Total: 41 arquivos.

## Contrato e escopo

- A consulta usa a projeção canônica do valor recebido e recorre ao resolver completo para os casos excepcionais. Conserva recebimentos parciais, estornos, exclusão de empréstimos e valores desconhecidos; não calcula totais no frontend.
- Modelos têm armazenamento privado e RPCs próprios. A autorização do piloto, contexto e polo ativo acontece antes de qualquer replay. Ambiente, payload imutável, auditoria e versão otimista protegem leitura e edição.
- A preparação local conserva mês, alunos e modelo entre abas do mesmo escopo. Trocar o escopo reinicia o rascunho.
- CTN, NBS e indicador da operação usam seletores pesquisáveis por código ou descrição, sem entrada livre. Catálogos completos de produção dos Anexos B/C oficiais, extraídos por script reproduzível com fonte, versão e SHA-256. O carregamento é assíncrono no modal, com cache público separado dos dados por polo. A correlação experimental RTC não restringe as listas nem preenche enquadramento automaticamente.
- As três migrations do manifesto já foram aplicadas pelo MCP Supabase com os identificadores registrados nos nomes dos arquivos. Não alteram pagamentos nem habilitam emissão fiscal.
- O acesso continua restrito ao piloto Denielson e aos polos autorizados.

## Validação

- Reprodução em produção: logs PostgreSQL 57014 no horário das capturas e consulta de outubro em cerca de 8,9 segundos.
- Após a correção, a mesma RPC de outubro retornou 121 alunos em 7 turmas em 170,89 ms. Comparação dos 166 recebimentos entre a projeção anterior e a nova: nenhuma divergência de valor.
- 22 testes SQL de recebimentos e 7 testes SQL de modelos aprovados em bancos isolados; 65 testes frontend aprovados, incluindo os catálogos oficiais.
- Catálogos: 338 CTN, 917 NBS descritos e 26 indicadores. Extração reproduzível e hash dos Anexos B/C conferidos; o NBS sentinela sem descrição foi excluído e registrado na proveniência.
- TypeScript e ESLint focados aprovados. Revisão independente de autorização antes do replay, escopo, concorrência por versão e correspondência dos campos concluída.
- Safari local: pesquisa por descrição, seleção por teclado/mouse dos três códigos e salvamento sintético aprovados.
- Safari local, com dados sintéticos: cadastrar modelo, adicionar dois alunos com total de R$ 400,50, escolher o modelo e navegar entre abas preservando a preparação.
- Conferência visual Safari desktop e 390 px aprovada: modal limitado à tela, rolagem interna e rodapé acessível. A RPC de modelos também foi validada no banco real com criação/replay/leitura em transação revertida, sem deixar registros de teste. Smoke autenticado do frontend publicado é conferido após o deploy.

## Publicação

Entrega autorizada nesta conversa, candidata 4.8.266 sobre a base publicada 4.8.265. CI, Preview e confirmação do frontend em produção são verificados antes do encerramento; recibo final em `tmp/nfse-preparacao-production-receipt.json`. Publicação remota somente pelo MCP GitHub; os metadados são compostos sobre a base remota para preservar o lote paralelo 4.8.263 existente no checkout.

O JSON de domínio é saída gerada compacta e versionada; as planilhas oficiais originais ficam em tmp e são verificadas por hash pelo extrator. Artefatos de teste, capturas, builds e harnesses em tmp não integram o manifesto. A atualização do índice RAG e a verificação final dos metadados remotos acontecem no fechamento.
