# Calendário da expiração EAD em 2026

## Configuração da Matriz

A margem usa o calendário nacional bancário de 2026 e as exclusões locais
da Matriz de Japoatã/SE. O escopo inicial de novos cancelamentos é o polo
`44444444-4444-4444-4444-444444444444`; os demais polos dependem de verificação
própria. Ausência de calendário ou de polo verificado bloqueia novas baixas.

As quatro compras opcionais identificadas na reprodução pertencem à Matriz.
A praça do polo é o escopo operacional conferido, não uma inferência sobre
a localização do aluno ou o lugar em que ele pagou. Consultas bancárias
estritas continuam obrigatórias independentemente do calendário.

## Fontes e exclusões

- [FEBRABAN — calendário bancário](https://feriadosbancarios.febraban.org.br/):
  01/01, 16/02, 17/02, 03/04, 21/04, 01/05, 04/06, 07/09, 12/10,
  02/11, 15/11, 20/11 e 25/12 de 2026, além de sábados e domingos.
- [Prefeitura de Japoatã — feriados municipais, publicação de 27/10/2026](https://japoata.se.gov.br/site/prefeitura/feriados):
  24/06, 29/06, 28/10, 21/11 (Nossa Senhora do Desterro) e 23/11 (emancipação política).
- [MPSE — calendário de feriados de 2026](https://sistemas.mpse.mp.br/4.5/Escalasplantao/Feriados/Feriadosrel.aspx):
  confirma o feriado da padroeira de Japoatã em 21/11/2026.
- [TJSE — calendário de 2026](https://www.tjse.jus.br/portal/arquivos/documentos/publicacoes/calendarios/calendario-tjse-2026.pdf?v=13032025):
  confirma 21/11 e 23/11 para Japoatã. A configuração inclui 08/07 pela
  emancipação política de Sergipe e conserva a exclusão de 18/02, Quarta-feira
  de Cinzas, da configuração inicial.

A lista adicional da configuração contém:
`2026-02-18,2026-06-24,2026-06-29,2026-07-08,2026-10-28,2026-11-21,2026-11-23`.
Nenhuma lista vazia presume ausência de feriados.

O calendário inicial excluía 25/11 com base na publicação municipal anterior.
A correção de novembro segue a publicação municipal atual e preserva os
registros de tentativas de baixa já iniciadas.

## Exemplo e limites

Vencimento em sábado, 03/10/2026: primeiro dia útil efetivo 05/10.
A margem completa cobre 06, 07 e 08/10; primeira tentativa possível em 09/10.
Para o vencimento de 19/11/2026, a margem cobre 24, 25 e 26/11, e a primeira
tentativa possível é em 27/11.
Esse exemplo não autoriza a baixa: pagamento, processamento, falha de consulta,
identidade ou termos divergentes sempre prevalecem sobre o prazo.

O calendário não autoriza novos PUTs em 2027. Atualização anual exige conferir
as fontes e publicar os contratos correspondentes. Verificação de intenção já
persistida e recuperação de pagamentos permanecem disponíveis por GET.

A configuração não altera a data de baixa automática do banco nem os termos
dos boletos já emitidos. O registro de publicação informa a ativação efetiva;
este documento, sozinho, não prova que a automação esteja ligada.
