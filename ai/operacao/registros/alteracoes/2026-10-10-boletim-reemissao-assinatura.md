# Boletim: reemissão com modelo atualizado e assinatura fiel

A segunda via do boletim sem snapshot documental podia reutilizar o PDF antigo ao manter o mesmo código, mesmo após alterar o modelo. O compositor também ignorava a mesclagem da assinatura, deixando o fundo branco cobrir a linha e o cargo.

## Aceite e escopo

Carregar o modelo atual para boletins sem snapshot, preservar snapshots existentes e regenerar o PDF quando qualquer recurso da prévia mudar. Uma falha de leitura do modelo do boletim deve aparecer ao operador; o modelo padrão só é usado quando a ausência estiver confirmada. A segunda via continua usando o registro e contador existentes; abrir uma prévia não registra reemissão.

O PDF nativo respeita ordem visual, opacidade e mesclagem normal/multiply do editor. Texto, tabelas, QR, marca d'água e assinatura permanecem recursos separados. Nenhum modelo ou imagem institucional foi editado. Sem mudança de banco, RPC ou Edge Function.

## Validação

48 testes focados passaram: 25 de contrato/composição PDF, 19 de leitura do modelo, snapshots, cache da prévia, segunda via e regressões EAD, e 4 de geometria/tipografia da Pasta/Ficha. A chave completa é exclusiva do boletim; demais documentos preservam o Blob exibido ao registrar a segunda via. TypeScript e ESLint focado passaram. Revisão independente dos três agentes não encontrou bloqueios. Publicação exige build completo, manifesto, CI e Preview Vercel aprovados.

Reprodução visual com assinatura sintética opaca nas posições do modelo: antes o fundo cobria a linha e o cargo; depois a linha ficou contínua e “Diretora Geral” legível. Conferidos texto extraído, imagem isolada embutida e página completa renderizada com Poppler. Artefatos regeneráveis estão em tmp/boletim-signature-fidelity e não pertencem ao manifesto. O modelo real foi inspecionado somente para leitura. Nenhum boletim de aluno foi reemitido para teste. Smoke autenticado no navegador fica com o usuário, conforme orientação da conversa.

A CI identificou e permitiu corrigir a invalidação indevida da prévia de declarações por metadados da segunda via. O contrato de geometria da Pasta/Ficha identifica foto e QR por seus recursos, preservando coordenadas e tolerância mesmo quando a ordem visual configurada altera a sequência de desenho.

## Risco e entrega

O compositor compartilhado passa a aplicar somente os estilos configurados, com estado gráfico isolado por campo. Modos não suportados geram erro em vez de alterar silenciosamente o documento. A consulta estrita é opt-in apenas para boletim; demais serviços mantêm seu comportamento. Publicação 4.8.207, separada da correção de sessão 4.8.206, sob autorização de produção vigente.

## Manifesto explícito

Total: 18 arquivos.

- `modules/gestor/secretaria/historico-emissoes/historico-emissoes.service.ts`
- `modules/gestor/secretaria/historico-emissoes/SecretariaHistoricoEmissoesPage.tsx`
- `modules/gestor/secretaria/historico-emissoes/history-vector-preview.ts`
- `modules/gestor/secretaria/historico-emissoes/history-vector-preview.test.ts`
- `modules/gestor/secretaria/historico-emissoes/boletim-history-template.test.mjs`
- `modules/gestor/cadastros/modelos-documentos/shared/document-template.service.ts`
- `modules/gestor/cadastros/modelos-documentos/boletim/boletim.service.ts`
- `modules/gestor/cadastros/modelos-documentos/boletim/boletim-template-read.test.mjs`
- `modules/gestor/secretaria/historico-emissoes/emission-document.pdf.ts`
- `modules/gestor/secretaria/historico-emissoes/emission-pdf-field-layers.ts`
- `modules/gestor/secretaria/historico-emissoes/emission-pdf-field-layers.test.ts`
- `modules/gestor/secretaria/historico-emissoes/emission-registration-typography.pdf.test.ts`
- `.github/workflows/quality-gates.yml`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/registros/alteracoes/2026-10-10-boletim-reemissao-assinatura.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`
