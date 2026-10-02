# Proesc: V2 como fonte operacional e preservação do histórico V1

Data: 01/10/2026. Estado: backend V2 implantado e ativado, auditado às 22h21 de Brasília. Interface preparada localmente, ainda sem publicação/smoke autenticado. Evidências no [registro da migração](../../ai/operacao/registros/alteracoes/2026-10-01-proesc-v2-operacional.md).

## Decisão

Migrar as consultas e sincronizações Proesc para a API escolar V2, conferir turmas/alunos já existentes e encerrar chamadas V1. Preservar evidências, vínculos e registros financeiros produzidos anteriormente. Não manter fallback automático V1.

A recomendação preliminar do estudo de conservar consultas V1 como apoio foi superada pela decisão explícita do usuário. O apoio contábil permitido agora é o histórico armazenado; indisponibilidade ou ambiguidade V2 gera revisão, não reativação da API antiga.

A [skill única universo-proesc-api](../../ai/operacao/integracoes/proesc/SKILL.md) e seu [contrato operacional](../../ai/operacao/integracoes/proesc/references/v2-operacional.md) orientam novas tarefas. Guias anteriores estão em `references/historicos/` com redirecionadores para não quebrar referências existentes.

## Evidência que sustenta a escolha

Consulta de setembro/2026, unidade 3145: V2 entregou 308 parcelas únicas em 16 páginas HTTP 200, usando mês `09`. V1 não retornou nova coleção mensal integral nas tentativas desse estudo: timeout de 30s, HTTP 429 e timeout de 60s. A comparação contábil foi feita com provas V1 armazenadas, não com duas respostas simultâneas.

A V2 esclareceu 37 de 38 cobranças do aviso do Caixa: 35 vencidas e duas pagas. A restante não apareceu e já tinha evidência V1 de cancelamento. Ao revisar a base previamente conferida, quatro outras parcelas estavam pagas na V2 e ainda abertas localmente. Isso requer conciliação e corte histórico, não só troca de URL.

Leia os [agregados e limites](../../ai/operacao/integracoes/proesc/references/v2-evidencia-setembro-2026.md). O retorno distingue parcial/superior, mas não comprova saldo residual; classificar esses rótulos exige preservar componentes contábeis e provas anteriores.

## Contratos que permanecem

- Proesc é fonte de consulta do legado; Banese continua gateway de cobranças locais.
- Identidade da obrigação, matrícula, turma, unidade e principal/vencimento deve ser provada. Manter IDs e vínculos auditáveis existentes evita duplicação.
- Mês V2 tem dois dígitos. Completar paginação e validar envelope/total antes de declarar ausência.
- Pagamento em outubro de título vencido em setembro não altera retroativamente sua condição em 30/09.
- Ausência, parcial e superior não autorizam cancelamento, baixa ou reabertura automática sem contrato financeiro validado.
- A decisão não autoriza criar débitos ou enviar frequência no Proesc. Cálculos e mutações locais obedecem RPCs, autorização, idempotência e conciliação.
- Preservar histórico V1 não significa manter suas credenciais em novos fluxos. Remoção de credencial não pode apagar histórico de pagamentos.

## Evidência necessária para afirmar conclusão

O [mapa de migração](../../ai/operacao/integracoes/proesc/references/v2-mapa-migracao.md) identifica chamadas anteriores e critérios de aceite. Encerramento requer constatar que handler, workers, revisão de ciclos, teste/configuração e agendamentos usam V2 ou rejeitam rotas antigas antes de acessar a rede, além de validar o fluxo real das turmas existentes.

## Implantação constatada

Sete migrations aplicadas e Edge v28 ativa. FULL completo coletou 12.814 parcelas
em 47 meses e 1.971 pessoas; 402 matrículas financeiras de 400 alunos foram
identificadas nas dez turmas locais. Foram projetadas 38 quitações comprovadas,
confirmadas 2.532 abertas e preservados 3.820 pagamentos anteriores. Banese e
estado acadêmico permaneceram intactos.

Runtimes V1 desabilitados, rotas antigas HTTP410 e runtime V2 ativado após
auditoria. Não existe fallback de rede V1. Os casos não resolvidos conservam
provas e conferência: duas parciais encontradas e 25 obrigações locais ausentes.

No Caixa de setembro/polo conferido, 38 pendências caíram para uma de R$ 279,90;
base R$ 46.933,90, vencido no corte R$ 23.420,70, margem 49,90%. O indicador
ainda é parcial. A interface anterior continua compatível, mas a retirada visual
do cartão V1 e a identificação da telemetria histórica aguardam publicação dos
patches locais. Não confundir backend migrado com frontend publicado.
