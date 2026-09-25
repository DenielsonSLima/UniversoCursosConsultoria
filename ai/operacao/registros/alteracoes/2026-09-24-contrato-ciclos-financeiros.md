# Contrato durável dos ciclos financeiros técnicos

Estado: documentação validada; lote operacional separado, autorizado pelo pedido de registrar a revisão. Publicação 4.8.83.

## Resultado

- Decisão permanente com elegibilidade individual, fontes Banese/Proesc, três modos de matrícula, datas revisadas, prova LOCAL, recebimento explícito, estorno CAS e C2.
- Memória e política apontam para a decisão. A política distingue BolePix homologado de Pix avulso bloqueado, sem liberar outra operação.
- Corrige a afirmação histórica de que qualquer erro da baixa manteria a matrícula pendente: erro pós-commit exige reconciliação da mesma operação.
- Registra o fechamento real da PR174/produção 4.8.82 e as provas dos três agentes. Nenhuma alteração de código financeiro, migration ou Edge neste lote.

## Manifesto explícito

- `docs/decisions/ciclos-tecnicos-cobrancas.md`
- `ai/operacao/MEMORIA_CANONICA.md`
- `ai/operacao/politicas/FINANCEIRO.md`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/registros/alteracoes/2026-09-24-contrato-ciclos-financeiros.md`
- `ai/operacao/registros/alteracoes/2026-09-24-matricula-local-sem-boleto.md`
- `ai/operacao/registros/alteracoes/2026-09-24-revisao-baixa-matricula-local.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`

Total: 10 arquivos.

## Critérios e validação

Contrato revisado independentemente; termos comparados com RPCs, finalizer, guards e testes versionados. Links locais, teto de 500 linhas, versão e contrato operacional/RAG aprovados. Índice refeito uma vez no fechamento: 12 fontes/78 trechos; bootstrap de 18.316 bytes. Busca somente leitura recuperou a memória e a regra de estorno CAS. RAG é regenerável e fica fora do manifesto. O avanço da versão atende ao gate existente porque o cadastro dos manifestos é JSON.

As provas executáveis da correção estão no registro da revisão: 113 testes focados, quatro rollbacks SQL, smoke real do hook/modal com serviços simulados, CI completo e preservação de 11 turmas/454 estados. Não presumir que esses resultados substituem o teste específico de uma alteração futura.

## Limites

A revisão cobre o fluxo afetado e as integrações confrontadas. Abrir o modal usa histórico canônico; não executa busca integral nas APIs externas. Nenhuma cobrança real foi criada, paga ou estornada na QA. A memória registra contratos e evidências, sem garantir ausência absoluta de defeitos.
