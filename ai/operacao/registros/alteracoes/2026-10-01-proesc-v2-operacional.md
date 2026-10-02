# Migração operacional Proesc V2

Estado: BACKEND V2 ATIVADO E AUDITADO em 01/10/2026. Consulta ampla e migração
operacional autorizadas pelo usuário. Interface V2 preparada localmente;
publicação do frontend e smoke autenticado continuam pendentes, separadamente.

## Escopo e aceite

Consultar o Proesc das turmas/alunos existentes, ajustar vínculos e projeções
comprovadas, migrar leituras para V2 e encerrar chamadas V1. Atualizar skill,
documentação, memória e RAG. Três agentes: cliente/testes, SQL/ingestão e
documentação/revisão; coordenador integra e valida.

Inventário remoto: 6.417 obrigações, 402 matrículas, 400 pessoas, 10 turmas;
vencimentos 12/03/2024 a 25/01/2028, unidade 3145. A primeira página V2 people
informou total de 1.971 pessoas / 40 páginas de até 50; somente correspondências com escopo local permitem
ajustes. Preservar Banese e situações acadêmicas sem evidência explícita.

- Coleta íntegra/retomável com revisão de conexão, totais e unicidade de IDs.
- Identidade por ID externo, turma, CPF, vencimento e principal. Matrícula externa
  só vinculada após correspondência inequívoca.
- PAGA/VENCIDO/EM ABERTO explícitos; parcial/superior/ausência não produzem saldo,
  cancelamento ou reabertura inferidos. Preservar fatos anteriores e auditoria.
- Nenhuma chamada operacional V1 após ativação; histórico V1 preservado.
- Financeiro/Caixa conferidos no corte correto, sem alteração Banese.
- Skill/decisão/memória distinguem contratado, observado e implantado.
- Arquivos manuais até 500 linhas; migrations aplicadas imutáveis.

## Manifesto explícito

Total: 55 arquivos.

- `supabase/functions/proesc-api/contract.ts`
- `supabase/functions/proesc-api/contract.test.ts`
- `supabase/functions/proesc-api/diagnostic-invoices.test.ts`
- `supabase/functions/proesc-api/v2-invoices.ts`
- `supabase/functions/proesc-api/v2-invoices.test.ts`
- `supabase/functions/proesc-api/v2-people.ts`
- `supabase/functions/proesc-api/v2-sync-worker.ts`
- `supabase/functions/proesc-api/v2-sync-worker.test.ts`
- `supabase/functions/proesc-api/handler.ts`
- `supabase/functions/proesc-api/handler.test.ts`
- `supabase/functions/proesc-api/handler-sync-coordination.test.ts`
- `supabase/functions/proesc-api/connections.ts`
- `supabase/functions/proesc-api/operations.ts`
- `supabase/functions/proesc-api/versioned-connections.test.ts`
- `supabase/migrations/20261002010000_proesc_v2_ingestion_schema.sql`
- `supabase/migrations/20261002010100_proesc_v2_observation_validation.sql`
- `supabase/migrations/20261002010200_proesc_v2_financial_projection.sql`
- `supabase/migrations/20261002010300_proesc_v2_persistent_runtime.sql`
- `supabase/migrations/20261002010400_proesc_v2_worker_and_cycle_readers.sql`
- `supabase/migrations/20261002010500_proesc_v2_monitor_runtime.sql`
- `supabase/tests/proesc_v2_runtime.isolated.test.mjs`
- `supabase/migrations/20261002010600_proesc_v2_cycle_payload_compat.sql`
- `supabase/tests/proesc_v2_cycle_payload.isolated.test.mjs`
- `modules/gestor/configuracoes/proesc/ProescConfig.tsx`
- `modules/gestor/configuracoes/proesc/ProescConnectionCard.tsx`
- `modules/gestor/configuracoes/proesc/proesc.service.ts`
- `modules/gestor/configuracoes/proesc/proesc.service.test.mjs`
- `modules/gestor/configuracoes/proesc/ProescConfig.test.mjs`
- `modules/gestor/configuracoes/consulta-api-proesc/ProescConsoleOverview.tsx`
- `modules/gestor/configuracoes/consulta-api-proesc/ConsultaApiProescConfig.tsx`
- `modules/gestor/configuracoes/consulta-api-proesc/ProescOperationsFeed.tsx`
- `modules/gestor/configuracoes/consulta-api-proesc/consulta-api-proesc.types.ts`
- `modules/gestor/configuracoes/consulta-api-proesc/consulta-api-proesc.test.tsx`
- `ai/operacao/integracoes/proesc/SKILL.md`
- `ai/operacao/integracoes/proesc/INDEX.md`
- `ai/operacao/integracoes/proesc/agents/openai.yaml`
- `ai/operacao/integracoes/proesc/references/guia-v1-v2.md`
- `ai/operacao/integracoes/proesc/references/contratos.md`
- `ai/operacao/integracoes/proesc/references/diagnostico-2026-09-12.md`
- `ai/operacao/integracoes/proesc/references/conferencia-t42-2026-09-12.md`
- `ai/operacao/integracoes/proesc/references/conciliacao-t42.md`
- `ai/operacao/integracoes/proesc/references/historicos/guia-v1-v2.md`
- `ai/operacao/integracoes/proesc/references/historicos/contratos.md`
- `ai/operacao/integracoes/proesc/references/historicos/diagnostico-2026-09-12.md`
- `ai/operacao/integracoes/proesc/references/historicos/conferencia-t42-2026-09-12.md`
- `ai/operacao/integracoes/proesc/references/historicos/conciliacao-t42.md`
- `ai/operacao/integracoes/proesc/references/v2-operacional.md`
- `ai/operacao/integracoes/proesc/references/v2-fontes-2026-10-01.md`
- `ai/operacao/integracoes/proesc/references/v2-evidencia-setembro-2026.md`
- `ai/operacao/integracoes/proesc/references/v2-mapa-migracao.md`
- `docs/decisions/proesc-v2-operacional.md`
- `ai/operacao/registros/alteracoes/2026-10-01-proesc-v2-operacional.md`
- `ai/operacao/MEMORIA_CANONICA.md`
- `ai/operacao/rag/manifesto.json`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`

O `LOTE_ATIVO.md` foi atualizado por trabalho paralelo durante esta sessão para
`2026-10-01-caixa-painel-financeiro-imersivo`. Preservar essa frente e sua condição
de publicação; ela não integra o manifesto Proesc. Alterações preexistentes na
memória/lote também são preservadas. Nenhuma publicação conjunta será inferida.

## Evidência inicial

Setembro V2: 308 parcelas únicas/16 páginas; 124 PAGA, 170 VENCIDO, 9 PARCIAL e
5 SUPERIOR. 304 correspondências V1/local conferem identidade. No aviso Caixa,
37/38 pendências encontradas (35 vencidas, duas pagas); uma ausente tem indicação
histórica de cancelamento. Outras quatro locais abertas já estão pagas na V2.
O atualizado iguala o original nas 308; sete parciais fecham principal+juros+multa
com recebido V1. Não inferir saldo pelo rótulo ou subtração dos campos.

## Validação / implantação

- 180 testes Deno da integração aprovados, incluindo parsers históricos que
  permanecem sem caminho operacional de rede V1. O subconjunto novo contém 60 testes.
- Oito testes de configuração e 16 do monitor de interface aprovados.
- Contrato isolado PostgreSQL/PGlite aprovado: paginação, replay, autorização,
  projeção auditada existente, quitação parcial histórica, cancelamento antigo,
  opt-out, identidade ambígua, Banese, lease abandonado e revisão de credencial.
- Vite compilou a aplicação. `npm run build` foi interrompido pelo controle de
  versão preexistente: cabeçalho 4.8.147 pendente e entradas antigas duplicadas.
  A publicação paralela do Caixa não foi alterada para contornar isso.
- `npm run check:file-lines` apontou 14 referências/arquivos ausentes de outros
  lotes. Auditoria do manifesto Proesc: 55 arquivos, máximo de 312 linhas, zero
  violações. Não foi ampliado o escopo para reparar históricos alheios.
- Seis migrations aplicadas via MCP: `20261002004604`, `20261002004637`,
  `20261002004719`, `20261002004721`, `20261002004724`, `20261002004726`,
  correspondentes, na ordem, às migrations locais 010000 a 010500 do manifesto.
  A partir dessa aplicação são imutáveis.
- Migration adicional `20261002010032` (`010600` local) aplicada para compatibilidade
  do leitor de ciclos com o parser da interface vigente. Teste integrado com
  SQL real e parser real aprovado; leitura remota das 402 matrículas confirmou
  118 C1, 143 FULL e 141 UNKNOWN, todas com envelope compatível. Cinco minutos
  limitam a consulta de elegibilidade, nunca o fato histórico confirmado.
- Edge `proesc-api` v27 implantada; v28 elevou o limite a 20 etapas sequenciais
  com prazo global de 90s. Coleta de pessoas completa: 1.971 / 40 páginas;
  402/402 matrículas financeiras identificadas, zero ambiguidades e dez turmas.
  Outros 24 vínculos acadêmicos já existentes foram apenas reconhecidos.
- Smoke remoto: worker V2 autenticado HTTP200; rotina V1 aposentada HTTP410;
  tentativa sem segredo HTTP403. Nenhuma emissão bancária usada em teste.
- Avisos de segurança: nenhuma advertência nova Proesc; sete tabelas privadas
  com RLS/sem policies são isolamento intencional, com grants revogados.
- Revisão independente comparou contratos da Edge v28/banco com o frontend
  `main` 8228e2b (4.8.147), sem bloqueios de envelope V2 ou ciclos. Não foi
  confirmado o SHA efetivamente servido nem realizado smoke autenticado.
  A interface anterior ainda exibe o cartão V1 (ações retornam HTTP410) e
  mistura rótulos atuais com histórico V1 nas abas Execuções/Erros. Os patches
  locais corrigem apresentação; não foram publicados junto do lote Caixa.
  O teste de conexão cobre Pessoas, não substitui o inventário de parcelas.
- Respostas temporárias de pessoas/configuração (154116 e 154178) removidas após
  extrair agregados. Não são corpus RAG nem arquivos versionados.

## Inventário e conciliação completos

FULL encerrado em 01/10/2026 às 22h17min54s de Brasília, após 30min03s:
47 meses completos (março/2024 a janeiro/2028), 12.814 parcelas únicas e
1.971 pessoas/40 páginas. Nenhuma tarefa falhou, nenhuma observação ficou STAGED.

| Resultado das parcelas V2 | Quantidade |
| --- | ---: |
| Quitações projetadas com prova PAGA | 38 |
| Abertura confirmada | 2.532 |
| Pagamentos anteriores exatamente iguais preservados | 3.820 |
| Pagamentos parciais em conferência | 2 |
| Sem obrigação vinculada no Universo, sem criar cobrança | 6.422 |

As 38 quitações de todo o inventário têm nominal de R$ 10.636,20 e recebido
de R$ 9.743,70. Não são as mesmas 38 pendências do aviso original do Caixa.
As duas parciais têm nominal de R$ 559,80 e recebido informado de R$ 573,14;
não foi inferido saldo residual nem aplicada baixa sem comprovação de quitação.

Foram reencontradas 6.392 das 6.417 obrigações locais. As 25 ausentes continuam
preservadas: 13 com evidência histórica CANCELED/REVIEW (R$ 3.638,70) e 12
UNKNOWN/REVIEW (R$ 3.358,80). Ausência não produz cancelamento automático.
Essas pendências globais são distintas do recorte mensal do Caixa.

Estados de origem observados no inventário: 8.155 PAGA, 2.326 VENCIDO,
1.703 EM ABERTO, 616 PAGAMENTO PARCIAL e 14 PAGAMENTO SUPERIOR; nenhum
estado desconhecido. Os números incluem parcelas fora do escopo financeiro local.

Depois de extrair agregados, foram removidas 75 respostas temporárias exatas
de workers (todas HTTP200); nenhuma evidência financeira foi excluída.

## Caixa e proteção auditados

Auditoria independente, confirmada pelo coordenador, no polo do aviso e corte
em 30/09/2026:

| Indicador | Antes | Depois |
| --- | ---: | ---: |
| Base conferida | R$ 36.577,60 | R$ 46.933,90 |
| Cobranças elegíveis | 136 | 173 |
| Em conferência | 38 | 1 |
| Nominal em conferência | R$ 10.636,20 | R$ 279,90 |
| Vencido no corte | R$ 14.463,90 | R$ 23.420,70 |
| Margem sobre a base conferida | 39,54% | 49,90% |

O indicador continua incompleto por uma cobrança ausente na V2, com evidência
antiga CANCELED/REVIEW. As 37 resolvidas eram 35 vencidas e duas pagas;
outras quatro da base já conferida também foram quitadas. Pagamento em 01/10
não remove atraso no corte de 30/09. O aumento do vencido representa prova
antes indisponível, não criação de nova dívida.

Todas as 38 quitações globais tiveram evento individual PENDENTE → PAGO com
fonte PAGA; nenhum pagamento anterior foi reaberto ou alterado. Zero mudança
em campos não permitidos pela projeção. Comparação integral antes/depois
preservou exatamente 541 contas não vinculadas ao Proesc e 402 matrículas.
402/402 matrículas financeiras possuem vínculo V2 confirmado nas dez turmas.

## Ativação e pendências de entrega

Ativação aceita às 22h21min20s de Brasília após FULL completo e auditoria:
runtime V2 habilitado; runtimes financeiros e de revisão de ciclos V1
desabilitados. Monitor remoto informou versão V2, 12.814 consultadas,
38 aplicadas, duas em revisão e zero falhas. Agendamento V2 ativo a cada
dois minutos; processamento recente a cada 15 minutos e FULL a cada 24 horas,
com retomada por página/lote e sem fallback V1.

O cron antigo permanece instalado, mas seu enqueue retorna sem agendar quando
o runtime está desabilitado. Rotas antigas da Edge retornam HTTP410 antes de
qualquer consulta V1. Histórico e credenciais antigas não foram apagados.

Smoke natural do cron: execução `succeeded` às 22h22, seguida de novo run
RECENT iniciado às 22h22min01s, sem chamada manual. Primeiras 388 observações
coletadas e monitor V2 RUNNING sem lease expirado ou tarefa falha. A consulta
de enqueue V1 após desativação devolveu `scheduled: false`.

Esse RECENT terminou às 22h28min01s: setembro/outubro completos, 592 parcelas,
426 abertas confirmadas, 156 pagamentos preservados, duas parciais em revisão
e oito sem vínculo. Zero quitação duplicada, tarefa falha ou parcela pendente.

Pendente: publicação dos dez arquivos locais de configuração/monitor e smoke
autenticado da interface. Nenhum commit/PR/deploy frontend desta migração foi
realizado; a versão 4.8.147 pertence à entrega paralela do Caixa.

Skill validada pelo validador oficial; 55 arquivos do manifesto com máximo
de 312 linhas, sem links internos quebrados nas referências correntes.
RAG indexado uma vez no fechamento: 20 fontes/158 trechos, estado ATUAL.
Busca de validação retornou a memória V2 ativada e o contrato operacional atual.
Embeddings semânticos opcionais não configurados; busca lexical funcional.

## Correção posterior autorizada na mesma sessão

As imagens enviadas pelo usuário revelaram duas lacunas: backfill de 12
pagamentos históricos reabriu R$ 3.139,90 na posição do polo, pois a zeragem
anterior era um ajuste fixo; e cinco novos pagamentos V2 não alcançavam o ramo
de composição calculada. A abertura operacional de 01/10 e quatro descontos
calculáveis foram corrigidos em duas migrations novas, preservando o histórico
e a composição atrasada sem prova. [Registro específico, testes e limites](2026-10-01-proesc-v2-virada-composicao.md).
