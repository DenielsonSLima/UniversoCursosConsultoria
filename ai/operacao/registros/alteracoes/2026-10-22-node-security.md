# Verificação de segurança Node — 2026-10-22

## Objetivo e aceite
Exigir Node estável 24.22.1 ou posterior da linha 24 no build e confirmar separadamente a versão da função existente em produção. Não tratar major 24.x ou deployment READY como prova do patch.

## Manifesto explícito
- `api/social-preview.js`
- `package.json`
- `scripts/check-node-security.mjs`
- `scripts/check-node-security.test.mjs`
- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/registros/alteracoes/2026-10-22-node-security.md`
Total: 9 arquivos.

## Escopo e risco
Somente build e observação privada da função social-preview. O log contém somente process.version, uma vez por instância. Sem endpoint novo, segredo, dados pessoais, alteração de resposta, banco ou credencial. Build abaixo do piso aborta antes de gerar/publicar site.

## Validação
Quatro testes focados aprovados: versões aceitas/rejeitadas, CLI real, gate antes do build, respostas sociais preservadas e log único sem vazamento HTTP. Cloud local Node 24.19.0: gate bloqueou como esperado. Build completo e runtime da Vercel pendentes de validação Preview/produção; não declarar remediação comprovada antes disso.

## Evidência
https://nodejs.org/en/blog/vulnerability/october-2026-security-releases
https://vercel.com/docs/functions/runtimes/node-js/node-js-versions
