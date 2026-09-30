# Revisão interna dos ciclos T42/T46

Estado: VALIDADO INTERNAMENTE — SEM EMISSÃO

## Escopo e aceite

- Pedido: revisar as correções já feitas, validar internamente e atualizar o GitHub, sem emitir nada.
- Base auditada: produção 4.8.140, commit `f391897da706ee9a1a07b7e0b7e7d66b327fdaee`, PR #231.
- Três frentes independentes: auditoria de dados T42/T46, revisão Proesc e revisão dos contratos T46.
- Este lote altera teste e registros de validação; não altera runtime, regra financeira, banco ou Edge Function.
- Nenhuma geração, emissão, baixa, cancelamento, reemissão, importação ou refresh Proesc foi solicitado pelas ferramentas nesta revisão.

## Manifesto explícito

- `supabase/tests/t42_manual_cycle2.readonly.sql`
- `ai/operacao/registros/alteracoes/2026-09-30-revisao-interna-ciclos-t42-t46.md`
- `ai/operacao/registros/alteracoes/2026-09-30-hotfix-ciclos-t42-t46-offline-cascade.md`
- `ai/operacao/LOTE_ATIVO.md`
- `ai/operacao/registros/COMMITS_E_DEPLOYS.md`
- `ai/operacao/qualidade/limite-linhas-manifestos.json`
- `internal/versioning/system-version.json`
- `internal/versioning/CHANGELOG.md`

Total: 8 arquivos.

## Evidências internas

- T46: 24/24 testes focados do wizard, matrícula local e recuperação de estado passaram; os blobs auditados coincidem com o commit publicado.
- RPC real T46: matrícula LOCAL em 05/09/2026, M1 em 05/10/2026, M2 em 05/11/2026 e M12 em 05/09/2027; 1 item local e 12 bancários na prévia.
- OMITIR retorna 12 bancários e nenhuma matrícula. BOLETO retroativo é rejeitado. C2 mantém rematrícula na origem e M1 no mês seguinte; modo local explícito em C2 é rejeitado.
- Revisão da matrícula LOCAL com cascata é revalidada pela RPC e recebe novo fingerprint. Mensalidade retroativa ou fora de ordem é rejeitada. Nenhuma prévia cria recebível.
- Configuração financeira: RPC real T46 em READ ONLY retornou revisão/fingerprint idênticos no topo e em identidade, com preview=true. Isso confirma aplicada a correção do contrato que mantinha o editor em “Aguardando cálculo”; nenhuma regra foi salva.
- Backend permanece autoridade dos valores e do cronograma; frontend apenas propõe revisão e bloqueia avanço enquanto a prévia canônica está pendente.
- T42: contrato READ ONLY percorreu todas as 35 matrículas. As 15 elegíveis retornaram C2 com 13 itens Banese, sem consulta online ao Proesc; C1, C3, históricos protegidos e bloqueados foram rejeitados.
- Distribuição observada T42: 15 elegíveis, 5 já geradas, 4 protegidas por histórico, 9 ativas sem C1 confirmado e 2 trancadas. Contagens são observações, não regras de elegibilidade.
- Prova C1 durável/offline passou no contrato SQL transacional; UNKNOWN e cobertura de contrato completo permanecem sob a guarda anterior.
- Testes SQL usaram READ ONLY ou objetos temporários com ROLLBACK; nenhuma função de geração/recebimento/cancelamento foi chamada.
- Contagens finais iguais às iniciais: T42 com 35 matrículas, 6 runs e 424 recebíveis; T46 com 6 matrículas, 2 runs e 25 recebíveis.
- Contrato READ ONLY antigo estava preso à fotografia de 27 elegíveis/6 protegidas. Foi atualizado para validar todos os estados presentes, as guardas, a composição exata (rematrícula nº0 e mensalidades nº1..12 únicas), o destino Banese, a sequência mensal e a matriz anon/authenticated × helpers internos, sem exigir essa contagem histórica.

## Pendências reais

- A atualização da conferência Proesc não está resolvida por este lote. A tentativa recente tem 20/36 páginas e não concluiu; a lease expirada não configura lock persistente. O abort restaura o snapshot anterior verificado em estado COMPLETE: seus hashes coincidem e sua coleta original foi validada completa, mas agora está fora do TTL. As páginas parciais da tentativa atual não invalidam retroativamente esse snapshot nem explicam, por si só, os UNKNOWN antigos.
- Batch/runtime podem encerrar uma rodada com UNKNOWN e registrar sucesso. O intervalo observado de retomada excede o TTL das páginas; essa limitação não foi mascarada ampliando a validade das provas.
- Nos nove bloqueios: seis têm prova individual ausente/incompleta; um tem cobrança extra sem semântica suficiente; um tem conflito temporal; um tem 12 mensalidades e dois resíduos vinculados que exigem análise específica. Mesmo este último exige coleta atual completa e reavaliação canônica para afastar C2 externo.
- Erros `ProescV1ReadError` não são tratados como `ProescError` pelo handler e viram HTTP 500 genérico. O caminho foi identificado; não houve patch/deploy da Edge Function neste lote. O 409 mais recente analisado foi uma validação de escopo, não lease presa.
- Não existe comprovação suficiente para liberar automaticamente as nove matrículas ativas bloqueadas. As classificações anteriores têm janela originalmente completa; faltam provas individuais/semântica/compatibilidade temporal, além de uma atualização fresca. Nenhuma evidência foi inventada ou reclassificada.
- Smoke visual autenticado permanece pendente: Safari sem sessão útil/Turnstile. O usuário pediu validação interna nesta etapa; testes internos não são apresentados como smoke visual.
- O gate local de linhas encontrou 12 fontes/manifestações preexistentes ausentes no workspace desatualizado. Todos os oito arquivos deste lote têm até 500 linhas; CI deve validar a árvore remota completa.
- A revisão não chamou o Banese e não verificou emissão real, por restrição explícita do pedido.
- Testes adicionais da configuração financeira: 4/4 de formatação/identidade aprovados e 12/13 do contrato amplo aprovados. A falha restante exige `gerarCobrancasFuturas: true` em TurmaConfiguracoes, enquanto o contrato atual usa `?? false`; é fora do hotfix de identidade e não foi alterada.

## Publicação

- Atualização atômica por MCP GitHub, partindo da árvore remota publicada; alterações locais paralelas ficam fora do manifesto.
- 4.8.141 registra teste/regressão e auditoria; não representa uma nova correção do coletor Proesc.
- Migrations aplicadas do hotfix anterior são imutáveis e não integram este lote.
