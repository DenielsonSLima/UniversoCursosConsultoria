# Apresentação fiel dos cursos autoinstrucionais

## Objetivo e aceite
Renderizar apresentação específica por `ead_config.pagina.formato=autoinstrucional`, sem anunciar vídeos, tutoria ou reconhecimento geral do certificado. Preservar a apresentação dos demais cursos e as regras de checkout. Não alterar matrículas nem cobranças.

## Manifesto explícito
- `modules/public/ead/EadDetailPage.tsx`
- `modules/public/ead/EadLearningFacts.tsx`
- `modules/public/ead/eadPaymentCards.ts`
- `modules/public/ead/eadPresentation.ts`
- `modules/public/ead/eadPresentation.test.ts`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/registros/alteracoes/2026-11-17-ead-apresentacao-autoinstrucional.md`
- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`
Total: 10 arquivos.

## Reprodução e correção
Página pública de História exibiu promessas fixas incompatíveis com os materiais e estudo mínimo0min. Os dois novos cursos foram ocultados. Extração de fatos pedagógicos e helper de opções de pagamento, sem mudar contratos financeiros. Nova configuração somente opt-in; legado preservado.

## Validação
45 testes focados (3 novos,37 avaliação/progresso/compra,5 opções de checkout), SSR dos dois modos, TypeScript, lint e build aprovados. Checagem de linhas aprovada. Rotas públicas filtram ativo e publicar_site=true. Gabaritos dos novos cursos isolados no backend.

## Limites e autorização
Safari indisponível porque computadores conectados estão offline. O proprietário pediu explicitamente publicar em produção e informou que conferirá em outro computador após conclusão. Não afirmar smoke Safari, compra real ou emissão real de certificado. Cursos continuam ocultos até revisão acadêmica independente; deploy deste template não publica seus dados.

## Base e predecessor
Base main b98db8c3cf8f19dc6da3654aca1dde583237f8ed, versão4.8.357. Predecessor preservado:2026-11-16-cupons-percentual-manual-matriz. Sem alterações em Auth,RLS,financeiro ou outros cursos.
