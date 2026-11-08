# NFS-e — mês de referência em português

## Objetivo e aceite

Campo do modal Adicionar alunos exibe Novembro de 2026, com nome do mês em pt-BR. Painel próprio permite escolher mês e ano, preservando o valor YYYY-MM da consulta. Confirmar o mesmo mês mantém a seleção; mudar de período usa o fluxo existente. Escopo restrito ao campo solicitado.

## Manifesto explícito

- `modules/gestor/emissor-nfse/preparar/NfseStudentsModal.tsx`
- `modules/gestor/emissor-nfse/preparar/NfseMonthPicker.tsx`
- `modules/gestor/emissor-nfse/preparar/nfse-month-picker.css`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/registros/alteracoes/2026-11-08-nfse-mes-pt-br.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `ai/operacao/rag/index.json`
- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`

Total: 9 arquivos.

## Validação e risco

- TypeScript e ESLint do caminho afetado aprovados.
- Safari local: nome completo, abertura por clique/Enter, navegação de ano, seleção por Tab/Enter, Escape fecha só o seletor e foco retorna ao campo.
- Confirmar Novembro/2026 preserva dois alunos e R$ 400,50 sintéticos; trocar para Outubro/2026 limpa a seleção e atualiza a consulta existente.
- Conferência visual desktop/390 px com componentes reais e dados sintéticos isolados da rede.
- Revisão independente do componente, foco e contrato concluída; correção de mês idêntico incorporada.
- Risco limitado à apresentação e intenção de período. Nenhuma alteração de banco, cálculo financeiro, autorização ou emissão fiscal.
- Publicação por MCP GitHub/Vercel, versão 4.8.265, baseada na 4.8.264. Metadados locais do lote paralelo 4.8.263 são preservados; candidato usa os metadados da base remota.
- Evidência final de CI, Preview, produção e smoke autenticado fica em `tmp/nfse-month-production-receipt.json` após a entrega.
