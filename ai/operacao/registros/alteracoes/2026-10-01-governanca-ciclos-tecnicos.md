# Governança dos ciclos técnicos

Lote operacional separado da correção de produto, solicitado pelo usuário.
Estado: REVISADO — GO independente; fechamento operacional 4.8.145 da produção 4.8.144.

## Manifesto explícito

- `docs/contracts/ciclos-tecnicos-passagem-e-proveniencia.md`
- `docs/decisions/ciclos-tecnicos-cobrancas.md`
- `ai/operacao/politicas/FINANCEIRO.md`
- `ai/operacao/skills/universo-ciclos-tecnicos-financeiros/SKILL.md`
- `ai/operacao/registros/alteracoes/2026-10-01-governanca-ciclos-tecnicos.md`
- `ai/operacao/registros/alteracoes/2026-10-01-ciclos-confiaveis-e-trancamento.md`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`

Total: 10 arquivos. O registro de manifestos JSON exige avanço de versão no gate
vigente; 4.8.145 registra apenas governança e metadados, sem nova lógica financeira.

## Aceite

Origem/cobertura por matrícula+ciclo; separação de confirmação e observação;
Proesc somente consulta; Banese importado sem fabricação de origem nativa;
teste de confirmação final, não só prévia; trancamento com corte, cancelamento
confirmado, exclusão do saldo pendente e preservação de histórico.

A skill aponta para contratos versionados, não duplica schema/código nem
incorpora dados pessoais. Nenhuma regra instrui a emitir ou cancelar sem
autorização. Frontmatter e links validados; revisão independente GO. A decisão
resumida continua no RAG; o contrato detalhado é lido sob demanda pela política
e skill, preservando o teto de 80 trechos sem afrouxar o teste. Índice local
recalculado no fechamento, sem dados pessoais, segredos ou fixtures.

## Resultado

- Contrato e skill consolidam provas duráveis, limites de origem, confirmação final
  e trancamento confirmado; a política financeira aponta explicitamente para ambos.
- Produto publicado no PR 235, com CI completo, Preview e produção confirmados.
- Este lote não altera código de execução, migrations aplicadas ou dados financeiros.
