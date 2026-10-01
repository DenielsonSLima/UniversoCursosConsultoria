# Passagem de ciclos, proveniência e trancamento técnico

Contrato detalhado sob demanda, confirmado em 30/09/2026. Implantação acompanhada no registro
`2026-10-01-ciclos-confiaveis-e-trancamento.md`; este contrato não declara deploy.

## Unidade da decisão

A cobertura é por matrícula e ciclo. A turma fornece parâmetros comerciais,
não prova que todos os alunos têm a mesma origem. Aluno novo em turma importada
pode seguir C1 nativo, desde que a elegibilidade canônica assim confirme.

| Origem e cobertura confirmada | Operação |
| --- | --- |
| Proesc C1 e C2 | Histórico consultável; nenhuma nova geração desses ciclos |
| Proesc C1; C2 comprovadamente ainda não gerado | C2 Universo/Banese sem exigir quitação local do C1 |
| Banese importado | Administrar o título existente, preservando a identidade e a origem |
| Universo/Banese nativo | Regras locais; C2 após formação/emissão bancária de C1, sem exigir quitação |
| Evidência ausente, incompleta ou contraditória | Revisão individual; não converter quantidade/valor em prova |

Fatos confirmados de cobertura e decisões de passagem não expiram com token,
cache ou falha de rede. Uma observação UNKNOWN não apaga prova positiva anterior.
Evidência positiva de outro ciclo ou identidade incompatível exige proteção ou
revisão explícita, preservando o fato anterior e a trilha de auditoria.

Não inferir C1 por exatamente 12 parcelas, pagamento de 12 parcelas, número da
turma ou ausência de resposta Proesc. Os classificadores de ingestão precisam de
completude e identidade; a decisão de continuidade já comprovada não reexecuta
uma conferência remota a cada abertura do modal.

## Propriedade e operações

Proesc é origem de observações e histórico. Consulta/importação autorizada da
origem pode atualizar sua projeção; baixa manual, emissão e cancelamento locais
desse histórico são proibidos também no backend. Nenhuma tela oferece um recibo
local como prova de pagamento Proesc.

Banese importado e nativo compartilham o núcleo operacional, mas não a origem.
A importação não fabrica autorização de POST nem run LOCAL_CREATED. GET,
conciliação, cancelamento ou baixa exigem identidade canônica, estado pagável,
permissão e escopo. Novo POST não é recuperação de título existente.

Capabilities da RPC representam disponibilidade de negócio, não permissão do
usuário. UI não amplia permissões; servidor reaplica RBAC, polo, CAS e prova
bancária. Origem conflitante bloqueia operações e apresenta revisão.

## Confirmação manual

Prévia, rascunho e payload de emissão são estruturas diferentes. Ao confirmar,
materializar os itens da prévia canônica atual e enviar esse snapshot com seus
fingerprints e a chave idempotente. Não enviar apenas a intenção usada na
consulta da prévia, que pode ter lista de itens vazia.

Edição, troca de matrícula/ciclo ou prévia pendente bloqueiam confirmação até
revisão canônica. Não sincronizar rascunho e revisão por effect que altere a
query key e mantenha o formulário em recálculo. Retry preserva a mesma operação.

REGISTRO_SEM_BOLETO cria matrícula LOCAL pendente, aceita vencimento retroativo
dentro do contrato e nunca registra pagamento automaticamente. Ajustar sua data
recalcula mensalidades pelo backend; a Mensalidade 1 também pode ser ajustada
independentemente. A periodicidade é mês-calendário, preservando o dia-base ou
o último dia disponível; não acumular dias fixos e deslocar vencimentos mensais.

## Trancamento e contas a receber

Trancamento autorizado solicita cancelamento Banese apenas de títulos não pagos,
sem pagamento parcial, com vencimento estritamente posterior à data financeira
efetiva do movimento. Data anterior ou igual e títulos pagos são preservados.
Matrícula importada com status TRANCADO mas sem movimento/corte comprovado fica
em revisão: não inventar uma data nem executar cancelamento em massa.

O job mantém motivo, movimento, corte e identidade, valida pagamentos antes do
PUT e confirma depois por GET. Pendente/retry/revisão não equivalem a CANCELADO.
Somente confirmação bancária de cancelamento sem pagamento permite mudar o
recebível/transação e retirar o valor do saldo pendente. O histórico permanece
consultável no filtro Cancelados; não apagar recebíveis ou apagar valores pagos.

Reativação não reabre um Nosso Número cancelado. Nova cobrança exige fluxo
separado autorizado. Operação bancária em curso ou ambígua bloqueia reativação
até resolução. Concorrência com pagamento sempre prevalece sobre cancelamento.

## Aceite e manutenção

Testar a confirmação sem editar em BOLETO, REGISTRO_SEM_BOLETO e OMITIR;
edição/recálculo, clique duplo, falha/retry e snapshot antigo. Exercer handler e
parser reais com emissão simulada; prévia aprovada não prova emissão aprovada.

Regressões de banco: passagem confirmada após UNKNOWN/token/cache; C2 protegido;
aluno novo em turma antiga; Proesc somente consulta; identidade Banese importada;
trancamento com corte, pago/parcial, fila/ambiguidade, saldo e reativação.
Exercer também claim, start e complete em rollback: a conclusão atualiza a
transação bancária antes do recebível. Revalidar a mesma condição de estado
anterior nas duas gravações pode impedir a conclusão de um cancelamento válido.

Validar SQL em transação revertida sem chamadas bancárias e comparar projeções
antes/depois por matrícula. Nunca utilizar emissão real como teste automático.
Documentar pendências de evidência individual e de smoke autenticado, sem
confundir código local, PR, migration aplicada e produção publicada.
