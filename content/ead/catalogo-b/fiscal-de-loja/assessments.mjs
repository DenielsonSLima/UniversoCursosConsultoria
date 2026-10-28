export const activities = [
  {
    "id": "ead-fiscal-de-loja-20261027-v2-atividade-1",
    "lessonId": "ead-fiscal-de-loja-20261027-v2-aula-1",
    "skill": "Distinguir perda, ruptura e divergência e conferir um saldo de estoque.",
    "prompt": "O saldo esperado de um produto é 42 unidades e a contagem inicial encontrou 40. Qual é o primeiro encaminhamento adequado?",
    "options": [
      "Registrar a diferença e conferir contagem, locais e movimentações do período.",
      "Concluir que duas unidades foram furtadas.",
      "Apagar duas vendas para o sistema mostrar 40.",
      "Alterar o saldo sem registro de verificação."
    ],
    "sourceIds": [
      "fiscal-perdas",
      "fiscal-respeito",
      "fiscal-dados"
    ]
  },
  {
    "id": "ead-fiscal-de-loja-20261027-v2-atividade-2",
    "lessonId": "ead-fiscal-de-loja-20261027-v2-aula-2",
    "skill": "Conferir uma entrega e separar produtos com divergências ou avarias.",
    "prompt": "Um documento informa 30 unidades; chegaram 28, sendo três com embalagem rompida. Qual registro mantém os fatos separados?",
    "options": [
      "30 recebidas e cinco desaparecidas.",
      "25 recebidas, porque avariadas não chegaram.",
      "28 previstas e 30 recebidas.",
      "30 previstas, 28 recebidas e três avariadas entre as recebidas."
    ],
    "sourceIds": [
      "fiscal-perdas",
      "fiscal-respeito",
      "fiscal-dados"
    ]
  },
  {
    "id": "ead-fiscal-de-loja-20261027-v2-atividade-3",
    "lessonId": "ead-fiscal-de-loja-20261027-v2-aula-3",
    "skill": "Separar observação de acusação e encaminhar situações sem constrangimento.",
    "prompt": "Um alarme soa quando uma pessoa passa pela saída. O que esse fato, isoladamente, permite afirmar?",
    "options": [
      "Que o furto está comprovado.",
      "Que a compra necessariamente não foi paga.",
      "Que houve um disparo que precisa ser verificado, sem concluir automaticamente sua causa.",
      "Que características pessoais autorizam acusação pública."
    ],
    "sourceIds": [
      "fiscal-perdas",
      "fiscal-respeito",
      "fiscal-dados"
    ]
  },
  {
    "id": "ead-fiscal-de-loja-20261027-v2-atividade-4",
    "lessonId": "ead-fiscal-de-loja-20261027-v2-aula-4",
    "skill": "Construir um registro objetivo e proteger as informações da ocorrência.",
    "prompt": "Ao perceber que uma câmera não exibe imagem, o fiscal desconhece desde quando há falha. Como registrar o horário?",
    "options": [
      "Inventar que a falha começou à abertura da loja.",
      "Informar quando percebeu a falha e marcar o início efetivo como não confirmado.",
      "Apagar o horário para ninguém verificar.",
      "Afirmar que a câmera sempre funcionou."
    ],
    "sourceIds": [
      "fiscal-perdas",
      "fiscal-respeito",
      "fiscal-dados"
    ]
  },
  {
    "id": "ead-fiscal-de-loja-20261027-v2-atividade-5",
    "lessonId": "ead-fiscal-de-loja-20261027-v2-aula-5",
    "skill": "Calcular uma taxa de perda com base definida e avaliar uma ação preventiva.",
    "prompt": "Foram recebidas 600 unidades e houve 12 avarias confirmadas no recebimento. Usando o recebido como base, qual é a taxa de avaria?",
    "options": [
      "2%",
      "0,2%",
      "12%",
      "50%"
    ],
    "sourceIds": [
      "fiscal-perdas",
      "fiscal-respeito",
      "fiscal-dados"
    ]
  }
];

export const exam = [
  {
    "id": "ead-fiscal-de-loja-20261027-v2-q-1",
    "lessonId": "ead-fiscal-de-loja-20261027-v2-aula-1",
    "skill": "Distinguir perda, ruptura e divergência e conferir um saldo de estoque.",
    "prompt": "Um item tinha saldo inicial 50, recebeu 12 unidades e teve 19 saídas registradas. Sem outras movimentações, qual é o saldo esperado?",
    "options": [
      "31 unidades",
      "43 unidades",
      "57 unidades",
      "81 unidades"
    ],
    "sourceIds": [
      "fiscal-perdas",
      "fiscal-respeito",
      "fiscal-dados"
    ]
  },
  {
    "id": "ead-fiscal-de-loja-20261027-v2-q-2",
    "lessonId": "ead-fiscal-de-loja-20261027-v2-aula-1",
    "skill": "Distinguir perda, ruptura e divergência e conferir um saldo de estoque.",
    "prompt": "A prateleira está vazia, mas seis unidades do produto foram localizadas corretamente no depósito. Como descrever o problema observado?",
    "options": [
      "Furto comprovado de seis unidades.",
      "Quebra de seis unidades, mesmo estando intactas.",
      "Falta de reposição na área de venda, sem comprovar perda física dessas seis unidades.",
      "Ausência total do produto em todos os locais da loja."
    ],
    "sourceIds": [
      "fiscal-perdas",
      "fiscal-respeito",
      "fiscal-dados"
    ]
  },
  {
    "id": "ead-fiscal-de-loja-20261027-v2-q-3",
    "lessonId": "ead-fiscal-de-loja-20261027-v2-aula-2",
    "skill": "Conferir uma entrega e separar produtos com divergências ou avarias.",
    "prompt": "Dois lotes estão liberados: A chegou primeiro e vence em dezembro; B chegou depois e vence em novembro. Qual deve ser priorizado pelo critério de validade?",
    "options": [
      "O lote B, porque seu vencimento é mais próximo.",
      "O lote A apenas porque chegou primeiro.",
      "Qualquer lote, pois validade não interfere.",
      "O lote B somente se tiver mais unidades."
    ],
    "sourceIds": [
      "fiscal-perdas",
      "fiscal-respeito",
      "fiscal-dados"
    ]
  },
  {
    "id": "ead-fiscal-de-loja-20261027-v2-q-4",
    "lessonId": "ead-fiscal-de-loja-20261027-v2-aula-2",
    "skill": "Conferir uma entrega e separar produtos com divergências ou avarias.",
    "prompt": "Uma caixa está avariada e ainda não se sabe se seu conteúdo pode ser comercializado. O que fazer antes de misturá-la aos produtos liberados?",
    "options": [
      "Retirar a identificação para facilitar a venda.",
      "Identificá-la e mantê-la separada para avaliação pelo responsável.",
      "Misturá-la ao estoque e conferir depois da venda.",
      "Registrar que foi furtada."
    ],
    "sourceIds": [
      "fiscal-perdas",
      "fiscal-respeito",
      "fiscal-dados"
    ]
  },
  {
    "id": "ead-fiscal-de-loja-20261027-v2-q-5",
    "lessonId": "ead-fiscal-de-loja-20261027-v2-aula-3",
    "skill": "Separar observação de acusação e encaminhar situações sem constrangimento.",
    "prompt": "Qual anotação é mais objetiva para iniciar uma conferência?",
    "options": [
      "Um cliente de aparência estranha roubou.",
      "A pessoa ficou nervosa, logo cometeu furto.",
      "Toda pessoa com bolsa grande deve ser acusada.",
      "Às 16h05, o alarme da saída 2 soou; a causa ainda será verificada."
    ],
    "sourceIds": [
      "fiscal-perdas",
      "fiscal-respeito",
      "fiscal-dados"
    ]
  },
  {
    "id": "ead-fiscal-de-loja-20261027-v2-q-6",
    "lessonId": "ead-fiscal-de-loja-20261027-v2-aula-3",
    "skill": "Separar observação de acusação e encaminhar situações sem constrangimento.",
    "prompt": "Uma conferência mostra que um produto estava pago e sua etiqueta não foi desativada. Qual conclusão corresponde à evidência?",
    "options": [
      "Houve uma falha de desativação da etiqueta, e o registro deve refletir isso.",
      "A pessoa deve continuar classificada como autora de furto.",
      "A confirmação do pagamento deve ser omitida.",
      "O alarme sempre vale mais que os documentos da compra."
    ],
    "sourceIds": [
      "fiscal-perdas",
      "fiscal-respeito",
      "fiscal-dados"
    ]
  },
  {
    "id": "ead-fiscal-de-loja-20261027-v2-q-7",
    "lessonId": "ead-fiscal-de-loja-20261027-v2-aula-4",
    "skill": "Construir um registro objetivo e proteger as informações da ocorrência.",
    "prompt": "Um vídeo de ocorrência precisa ser conferido pela equipe autorizada. Qual conduta preserva sua finalidade e o controle de acesso?",
    "options": [
      "Publicá-lo em uma rede social da equipe.",
      "Enviar a qualquer colega que tenha curiosidade.",
      "Utilizar o canal institucional e permitir acesso somente a quem participa da apuração.",
      "Cortar trechos para esconder fatos contraditórios."
    ],
    "sourceIds": [
      "fiscal-perdas",
      "fiscal-respeito",
      "fiscal-dados"
    ]
  },
  {
    "id": "ead-fiscal-de-loja-20261027-v2-q-8",
    "lessonId": "ead-fiscal-de-loja-20261027-v2-aula-4",
    "skill": "Construir um registro objetivo e proteger as informações da ocorrência.",
    "prompt": "Qual relatório permite localizar melhor uma condição encontrada na ronda?",
    "options": [
      "A loja estava estranha e alguém deve resolver.",
      "Os funcionários são desorganizados.",
      "Tudo estava ruim, sem local ou horário.",
      "Às 10h10, havia três caixas no corredor 4; reposição foi avisada para providenciar a retirada."
    ],
    "sourceIds": [
      "fiscal-perdas",
      "fiscal-respeito",
      "fiscal-dados"
    ]
  },
  {
    "id": "ead-fiscal-de-loja-20261027-v2-q-9",
    "lessonId": "ead-fiscal-de-loja-20261027-v2-aula-5",
    "skill": "Calcular uma taxa de perda com base definida e avaliar uma ação preventiva.",
    "prompt": "No período A houve oito perdas em 400 unidades; no B, nove em 900, com a mesma definição de perda. Como comparar as taxas?",
    "options": [
      "A taxa subiu porque nove é maior que oito.",
      "A taxa caiu de 2% para 1%, embora o número de unidades perdidas tenha aumentado.",
      "As taxas são iguais porque houve perdas nos dois períodos.",
      "O período B não teve perda."
    ],
    "sourceIds": [
      "fiscal-perdas",
      "fiscal-respeito",
      "fiscal-dados"
    ]
  },
  {
    "id": "ead-fiscal-de-loja-20261027-v2-q-10",
    "lessonId": "ead-fiscal-de-loja-20261027-v2-aula-5",
    "skill": "Calcular uma taxa de perda com base definida e avaliar uma ação preventiva.",
    "prompt": "A causa confirmada de avarias foi empilhamento acima da orientação da embalagem. Qual ação enfrenta diretamente essa causa?",
    "options": [
      "Aumentar a exposição de imagens de clientes.",
      "Mudar o indicador para esconder as avarias.",
      "Ajustar o empilhamento e verificar seu cumprimento e o efeito nas avarias.",
      "Atribuir as perdas a furto sem investigação."
    ],
    "sourceIds": [
      "fiscal-perdas",
      "fiscal-respeito",
      "fiscal-dados"
    ]
  }
];
