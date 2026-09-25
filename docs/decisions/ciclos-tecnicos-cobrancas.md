# Contrato dos ciclos financeiros técnicos — 24/09/2026

Elegibilidade é individual, calculada no banco a partir de recebíveis, ciclos, evidências importadas/vinculadas Banese/Proesc e cobertura de períodos. Abrir o modal não consulta todas as cobranças nas APIs; consultas e conciliações externas pertencem aos fluxos específicos. Aluno novo sem cobrança pode iniciar C1 em turma em andamento ou após transferência; matrícula recente ou status ativo não bastam. Histórico importado, períodos cobertos e regras legadas permanecem protegidos. Cadastro, matrícula acadêmica, documentos e situação financeira são distintos; emitir não deve ativá-los silenciosamente.

No C1, a escolha da matrícula é explícita; mensalidades permanecem 12. “Sem boleto” nunca significa “paga”. Compatibilidade: `emitirMatricula=false` sem modo explícito significa `OMITIR`; `REGISTRO_SEM_BOLETO` exige modo explícito; o booleano é opcional e, se informado, deve ser false.

| modoMatricula | Recebíveis | Bancários | LOCAL | Matrícula |
|---|---:|---:|---:|---|
| BOLETO | 13 | 13 | 0 | Obrigação com boleto |
| REGISTRO_SEM_BOLETO | 13 | 12 | 1 | Obrigação local pendente |
| OMITIR | 12 | 12 | 0 | Não criar obrigação |

LOCAL é destino imutável da matrícula C1, item zero, comprovado pelo snapshot/run: `destinoCobranca=LOCAL`, `emissaoBanese=NAO_APLICAVEL` e `localSemBoletoComprovado=true`. Nunca entra no emissor nem conta como boleto emitido. `quantidadeItens=quantidadeBancaria+quantidadeLocal`; progresso e carnê usam a quantidade bancária. `cicloManual.matriculaLocal` permite recebimento mesmo após C2. Pagamento/estorno não convertem LOCAL em bancário.

O backend calcula a prévia e os termos por item; a interface permite revisar valor, desconto, multa, juros e vencimento. Toda edição exige nova prévia canônica; item incluído com valor zero bloqueia confirmação. Omitir/reincluir matrícula preserva as datas das mensalidades. Exibir data inicial e primeira mensalidade calculadas pela RPC. Rascunho e fingerprints pertencem à matrícula, ciclo e origem/data escolhidas; troca ociosa reinicia a revisão, emissão em curso preserva o snapshot. Erro, recálculo pendente ou revisão não confirmada bloqueiam emissão.

C2 contém rematrícula e 12 mensalidades, com primeiro vencimento individual confirmado. Na nova modalidade individual, C1 constituído e com sua parte bancária emitida permite C2, independentemente de quitação. LOCAL pendente, pago ou estornado exige a prova canônica correspondente; estorno auditado não exige quitação para C2. Critérios importados/legados conservam suas exigências; não aplicar a regra nova retroativamente. Competência de entrada e datas de transferência vêm da análise canônica, sem duplicar períodos.

“Abrir recebimento após gerar” apenas abre a baixa manual. Usuário confirma data, conta, forma e valor; não há baixa automática. A autorização cruza poder baixar e consultar contas, com validação no servidor/polo. Conta ativa deve pertencer fisicamente ao polo ou ser global, além de disponível para uso nele; compartilhamento sozinho não autoriza baixa. Erro na consulta bloqueia confirmação mesmo com cache e deve permanecer visível. Baixa auditada não gera parcelas nem ativa matrícula por efeito colateral.

Duplo clique, emissão parcial e resposta ambígua exigem retomar a mesma operação, preservando parâmetros e a chave da operação: `requestId` do ciclo ou `idempotencyKey` da baixa. Falha após commit pode significar baixa registrada: reconciliar recebível/ledger e repetir com a mesma chave; a projeção posterior pode ser concluída sem outra movimentação. Nunca presumir ausência de pagamento. Não repetir POST bancário sem resolução canônica. PAGO só conta como emissão bancária concluída com prova histórica completa; baixa LOCAL não fornece essa prova.

Estorno LOCAL usa RPC autenticada e CAS com `p_expected_settlement_id`, congelado ao abrir a ação. Exige baixa comprovada, permissão financeira e polo autorizado; atomiza ledger/evento e retorno a PENDENTE, preserva auditoria e não recria boleto. Replay exige mesma baixa, ator e motivo; divergência ou baixa posterior exige atualizar a tela. Guardas impedem contorno por UPDATE. Provas e arquivos: [registro da revisão](../../ai/operacao/registros/alteracoes/2026-09-24-revisao-baixa-matricula-local.md); regressões em `supabase/tests/local_enrollment_reversal.rollback.sql`, `local_enrollment_cycle_state.transaction.sql` e no CI “Testar geração manual dos ciclos técnicos”.
