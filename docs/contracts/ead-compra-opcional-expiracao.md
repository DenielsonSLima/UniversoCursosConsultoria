# Compra opcional EAD: expiração, nova tentativa e pagamento tardio

## Escopo e estado

A classificação financeira está publicada na versão 4.8.167. Este lote acrescenta
expiração bancária segura, recompra pelo site e recuperação de pagamento tardio.
Implementação, migrations, publicação e ativação são etapas distintas; o registro
`2026-10-04-ead-expiracao-recompra-publicacao.md` contém a evidência de cada uma.

Compra inicial opcional nunca constitui inadimplência apenas pelo vencimento.
A natureza da tentativa permanece durável mesmo depois de outra tentativa pagar.
Recebimentos efetivamente confirmados compõem a receita uma única vez por título.
Cobranças manuais, técnicas e obrigações reais preservam os contratos existentes.

## Etapas autorizadas

1. Reservar tentativas independentes e recuperar o pagamento no título original.
2. Implementar consulta, cancelamento confirmado e vigilância bancária posterior.
3. Publicar o fluxo e ativar apenas o ambiente e as praças com calendário conferido.

O usuário autorizou aplicar e atualizar o projeto. Também determinou a execução
interna, sem navegador. Validação visual não executada deve constar expressamente;
checagens de tipos, build e contratos não são descritas como smoke visual.

## Identidade e recompra

- Uma matrícula acadêmica por aluno/turma; tentativa corrente reservada por lock.
- Cada nova compra possui tentativa, recebível, inscrição e identidade bancária
  próprios. Títulos e inscrições anteriores continuam associados à mesma história.
- Reserva `CREATING` possui token exclusivo. Repetir a requisição não concede
  novamente o direito de emitir. POST ambíguo exige recuperar a emissão anterior.
- Nova tentativa só é permitida depois do encerramento bancário confirmado da
  anterior. Pagamento em conciliação, emissão em andamento ou revisão bloqueiam.
- Checkout e projeção de pagamento usam recebível/tentativa exatos, sem escolher
  arbitrariamente uma inscrição pela matrícula.
- Compra expirada, confirmação pendente e compra paga são estados separados.
- Expiração não apaga pessoa, matrícula, progresso, certificado ou outro curso.

## Margem e cancelamento

Três dias bancários completos após o vencimento útil efetivo são uma margem
comercial conservadora. Não constituem SLA de compensação nem prova de não pagamento.
O calendário nacional é verificado para 2026; feriados locais e polo exigem
configuração expressa. Calendário ausente ou ano não conferido bloqueiam novo PUT.

`DataLimitePagamento` é a data de baixa automática informada pelo Banese, distinta
da baixa a pedido. O worker valida e registra esse campo; não modifica silenciosamente
o prazo da emissão. Data inválida, alteração do snapshot ou identidade divergente
exigem revisão. A margem comercial não aguarda automaticamente esse prazo final.

Antes de cancelar, consultar o título original e `PagamentosEfetivados`, inclusive
quando a situação ainda for código 2/PENDING. Confirmar convênio, Nosso Número,
pagador, beneficiário, valor, vencimento, linha/código e termos financeiros.

Pagamento, processamento, consulta inválida ou indisponibilidade bloqueiam a baixa.
Persistir intenção e lease antes do PUT. Só concluir localmente após GET com
código 5/CANCELED e nenhum pagamento efetivado. Decurso natural comprovado pelo
banco usa apenas GET e preserva o estado EXPIRED recebido.

Timeout após PUT, resposta ambígua ou recusa por pagamento em processamento usam
somente GET nas retomadas. Nunca repetir o PUT sem resolução explícita da ambiguidade.
Desativar a configuração interrompe novas baixas; consultas de operações iniciadas
e recuperação de pagamento continuam disponíveis.

## Pagamento tardio e duplicidade

O worker continua consultando títulos encerrados pela identidade original.
Não existe prazo arbitrário de 14 dias que transforme ausência de consulta em
prova de ausência de pagamento. Observação é espaçada e não paralisa a conciliação
normal de títulos correntes.

O cron alterna a prioridade de ação e observação a cada minuto e permite que uma
faixa vazia ceda seu lugar. Cada execução processa no máximo um título; uma fila
contínua de falhas de ação não impede a consulta de títulos já cancelados.

Pagamento integral validado é baixado idempotentemente no recebível original.
A baixa preserva data e evidência do cancelamento anterior, bem como IDs bancários.
Curso EAD pago é liberado automaticamente uma única vez.

Se outra tentativa estiver pendente, bloquear emissão e pagamento concorrentes
localmente e solicitar sua baixa pelo mesmo contrato bancário. Esse cancelamento
por redundância pode dispensar a margem de vencimento somente depois da confirmação
canônica da compra paga. Não concluir a tentativa redundante antes da confirmação
bancária; pagamento em processamento e ambiguidade continuam protegidos.

Se as duas tentativas pagarem, conservar os dois recebimentos reais e um acesso.
Criar revisão financeira visível ao gestor autorizado por polo. Valor divergente,
múltiplos pagamentos ou evidência incompatível também entram em revisão, com
montante, data, contagem e referência sanitizados; sem inventar baixa ou canal.

A consulta sem polo explícito lista somente os polos autorizados ao gestor com
acesso ao financeiro e à aba de recebíveis. Um polo explícito continua sujeito à
validação de escopo; a consulta não concede acesso global a gestores locais.

## Devolução comprovada

Não existe saldo genérico de crédito por aluno neste modelo. A resolução disponível
vincula uma devolução já paga no lançamento canônico de despesas. Exige beneficiário
correspondente ao aluno, polo autorizado, data/valor suficientes e referência única.
Autorização antecede replay; payload imutável e request ID asseguram idempotência.

Registrar responsável, evidência e vínculo financeiro é obrigatório. Um texto
“resolvido” ou liberação manual de acesso não substituem a devolução. O sistema
não transfere dinheiro nem emite estorno bancário automaticamente.

## Validação obrigatória

Ensaiar compra, replay concorrente, emissão ambígua, margem com feriado, pagamento
antes do PUT, processamento, timeout, GET de confirmação, recompra, pagamento
antigo após recompra, dois pagamentos e resolução financeira autorizada.
Conferir ACL/RLS, locks, identidade imutável, receita e exclusão de inadimplência.
Aplicar migrations versionadas pelo MCP, publicar os handlers correspondentes e
confirmar o contrato real antes de ativar a configuração.

Não usar aluno, pagamento ou cancelamento real como fixture de teste.
