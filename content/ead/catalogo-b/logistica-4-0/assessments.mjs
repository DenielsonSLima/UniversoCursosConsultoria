export const activities = [
  {
    "id": "ead-logistica-4-0-20261027-v2-atividade-1",
    "lessonId": "ead-logistica-4-0-20261027-v2-aula-1",
    "skill": "Conferir movimentações e distinguir divergência de uma causa já comprovada.",
    "prompt": "Um depósito tinha 70 unidades, recebeu 15 e expediu 28, sem outras movimentações. Qual é o saldo esperado?",
    "options": [
      "57 unidades",
      "27 unidades",
      "83 unidades",
      "113 unidades"
    ],
    "sourceIds": [
      "fiscal-perdas",
      "logistica-gs1",
      "logistica-captura",
      "logistica-anpd"
    ]
  },
  {
    "id": "ead-logistica-4-0-20261027-v2-atividade-2",
    "lessonId": "ead-logistica-4-0-20261027-v2-aula-2",
    "skill": "Conferir quantidade, condição e localização antes de liberar uma mercadoria.",
    "prompt": "Uma entrega prevê 40 unidades; chegaram 38, sendo uma avariada. Qual é o registro consistente?",
    "options": [
      "37 recebidas, porque a avariada não chegou.",
      "40 recebidas sem pendência.",
      "Três unidades furtadas, sem conferir.",
      "40 previstas, 38 recebidas e uma avariada entre as recebidas."
    ],
    "sourceIds": [
      "fiscal-perdas",
      "logistica-gs1",
      "logistica-captura",
      "logistica-anpd"
    ]
  },
  {
    "id": "ead-logistica-4-0-20261027-v2-atividade-3",
    "lessonId": "ead-logistica-4-0-20261027-v2-aula-3",
    "skill": "Distinguir identidade de produto, lote, item e evento de movimentação.",
    "prompt": "Um sistema envia o número 4 como caixas e outro o interpreta como unidades. Cada caixa tem dez unidades. Qual problema precisa ser tratado?",
    "options": [
      "A troca automática do código de todos os produtos.",
      "A suposição de que quatro é sempre a mesma quantidade física.",
      "O significado da unidade de medida na integração, pois quatro caixas são quarenta unidades.",
      "O aumento da velocidade da transmissão sem conferir dados."
    ],
    "sourceIds": [
      "fiscal-perdas",
      "logistica-gs1",
      "logistica-captura",
      "logistica-anpd"
    ]
  },
  {
    "id": "ead-logistica-4-0-20261027-v2-atividade-4",
    "lessonId": "ead-logistica-4-0-20261027-v2-aula-4",
    "skill": "Calcular indicadores logísticos definidos e interpretar quantidade e proporção.",
    "prompt": "Em um exercício, 45 de cinquenta entregas ficaram dentro do prazo definido. Qual é a taxa?",
    "options": [
      "45%",
      "90%",
      "10%",
      "95%"
    ],
    "sourceIds": [
      "fiscal-perdas",
      "logistica-gs1",
      "logistica-captura",
      "logistica-anpd"
    ]
  },
  {
    "id": "ead-logistica-4-0-20261027-v2-atividade-5",
    "lessonId": "ead-logistica-4-0-20261027-v2-aula-5",
    "skill": "Propor uma melhoria digital ligada a uma causa e a uma forma de validação.",
    "prompt": "Uma automação recebe o mesmo evento de expedição duas vezes. O que o projeto deve evitar?",
    "options": [
      "Contar a repetição da informação como duas saídas físicas sem verificar a identidade do evento.",
      "Preservar o identificador do evento.",
      "Conferir unidade e quantidade.",
      "Tratar exceções de forma rastreável."
    ],
    "sourceIds": [
      "fiscal-perdas",
      "logistica-gs1",
      "logistica-captura",
      "logistica-anpd"
    ]
  }
];

export const exam = [
  {
    "id": "ead-logistica-4-0-20261027-v2-q-1",
    "lessonId": "ead-logistica-4-0-20261027-v2-aula-1",
    "skill": "Conferir movimentações e distinguir divergência de uma causa já comprovada.",
    "prompt": "O sistema aponta 36 unidades e a primeira contagem encontra 34. Qual conclusão é sustentada inicialmente?",
    "options": [
      "Há prova automática de furto.",
      "Há uma divergência de menos duas unidades a conferir, sem causa comprovada.",
      "O sistema deve ser alterado sem verificação.",
      "Todas as saídas foram registradas incorretamente."
    ],
    "sourceIds": [
      "fiscal-perdas",
      "logistica-gs1",
      "logistica-captura",
      "logistica-anpd"
    ]
  },
  {
    "id": "ead-logistica-4-0-20261027-v2-q-2",
    "lessonId": "ead-logistica-4-0-20261027-v2-aula-1",
    "skill": "Conferir movimentações e distinguir divergência de uma causa já comprovada.",
    "prompt": "Uma unidade consta do saldo e está em outro endereço identificado do depósito. O que isso demonstra ao encontrá-la?",
    "options": [
      "Que toda mercadoria fora da prateleira desapareceu.",
      "Que se deve registrar uma entrada adicional sem documento.",
      "Que a localização precisa entrar na conferência; não se trata necessariamente de perda física.",
      "Que o inventário não precisa considerar endereços."
    ],
    "sourceIds": [
      "fiscal-perdas",
      "logistica-gs1",
      "logistica-captura",
      "logistica-anpd"
    ]
  },
  {
    "id": "ead-logistica-4-0-20261027-v2-q-3",
    "lessonId": "ead-logistica-4-0-20261027-v2-aula-2",
    "skill": "Conferir quantidade, condição e localização antes de liberar uma mercadoria.",
    "prompt": "Uma mercadoria está no depósito, mas seu endereço não foi atualizado e a separação não a encontra. Que falha aparece?",
    "options": [
      "Falha de localização ou registro que pode produzir falsa ruptura.",
      "Prova de que a mercadoria não existe.",
      "Confirmação automática de avaria.",
      "Obrigação de criar outra entrada para o mesmo item."
    ],
    "sourceIds": [
      "fiscal-perdas",
      "logistica-gs1",
      "logistica-captura",
      "logistica-anpd"
    ]
  },
  {
    "id": "ead-logistica-4-0-20261027-v2-q-4",
    "lessonId": "ead-logistica-4-0-20261027-v2-aula-2",
    "skill": "Conferir quantidade, condição e localização antes de liberar uma mercadoria.",
    "prompt": "Lote X vence antes de Y, ambos liberados e adequados. Qual prioridade corresponde ao critério primeiro a vencer, primeiro a sair?",
    "options": [
      "Priorizar sempre o maior lote.",
      "Priorizar X, pelo vencimento mais próximo.",
      "Ignorar validade se há código de barras.",
      "Escolher somente pela data em que o funcionário chegou."
    ],
    "sourceIds": [
      "fiscal-perdas",
      "logistica-gs1",
      "logistica-captura",
      "logistica-anpd"
    ]
  },
  {
    "id": "ead-logistica-4-0-20261027-v2-q-5",
    "lessonId": "ead-logistica-4-0-20261027-v2-aula-3",
    "skill": "Distinguir identidade de produto, lote, item e evento de movimentação.",
    "prompt": "Uma etiqueta identifica o produto, mas não há registro de sua transferência de endereço. O que falta para responder onde ele foi movimentado?",
    "options": [
      "Somente uma cor mais forte na etiqueta.",
      "Uma promessa de que sensores nunca falham.",
      "A remoção dos registros anteriores.",
      "O evento de movimentação associado à identidade e aos locais."
    ],
    "sourceIds": [
      "fiscal-perdas",
      "logistica-gs1",
      "logistica-captura",
      "logistica-anpd"
    ]
  },
  {
    "id": "ead-logistica-4-0-20261027-v2-q-6",
    "lessonId": "ead-logistica-4-0-20261027-v2-aula-3",
    "skill": "Distinguir identidade de produto, lote, item e evento de movimentação.",
    "prompt": "Qual afirmação descreve adequadamente uma tecnologia de captura?",
    "options": [
      "Ela facilita a obtenção de identificadores, mas precisa de cadastro, processo e dados coerentes.",
      "Ela torna qualquer cadastro automaticamente verdadeiro.",
      "Ela dispensa toda definição de unidade de medida.",
      "Ela garante leitura perfeita em qualquer ambiente."
    ],
    "sourceIds": [
      "fiscal-perdas",
      "logistica-gs1",
      "logistica-captura",
      "logistica-anpd"
    ]
  },
  {
    "id": "ead-logistica-4-0-20261027-v2-q-7",
    "lessonId": "ead-logistica-4-0-20261027-v2-aula-4",
    "skill": "Calcular indicadores logísticos definidos e interpretar quantidade e proporção.",
    "prompt": "A teve sessenta entregas pontuais em oitenta; B teve setenta em cem. Qual comparação está correta?",
    "options": [
      "B teve taxa maior apenas porque setenta supera sessenta.",
      "As taxas são iguais.",
      "A teve 75% e B 70%; B teve mais entregas pontuais em quantidade.",
      "A não teve atrasos."
    ],
    "sourceIds": [
      "fiscal-perdas",
      "logistica-gs1",
      "logistica-captura",
      "logistica-anpd"
    ]
  },
  {
    "id": "ead-logistica-4-0-20261027-v2-q-8",
    "lessonId": "ead-logistica-4-0-20261027-v2-aula-4",
    "skill": "Calcular indicadores logísticos definidos e interpretar quantidade e proporção.",
    "prompt": "Os custos considerados foram R$ 1.500 para cinquenta pedidos. Qual é o custo considerado por pedido?",
    "options": [
      "R$ 50",
      "R$ 1.450",
      "R$ 75.000",
      "R$ 30"
    ],
    "sourceIds": [
      "fiscal-perdas",
      "logistica-gs1",
      "logistica-captura",
      "logistica-anpd"
    ]
  },
  {
    "id": "ead-logistica-4-0-20261027-v2-q-9",
    "lessonId": "ead-logistica-4-0-20261027-v2-aula-5",
    "skill": "Propor uma melhoria digital ligada a uma causa e a uma forma de validação.",
    "prompt": "O endereço do produto está errado no cadastro. Qual ação é mais pertinente antes de automatizar sua leitura?",
    "options": [
      "Comprar leitores e presumir que todo dado ficará verdadeiro.",
      "Conferir e corrigir o cadastro e definir como a localização será mantida.",
      "Retirar o endereço de todos os registros.",
      "Ignorar a causa para medir somente velocidade."
    ],
    "sourceIds": [
      "fiscal-perdas",
      "logistica-gs1",
      "logistica-captura",
      "logistica-anpd"
    ]
  },
  {
    "id": "ead-logistica-4-0-20261027-v2-q-10",
    "lessonId": "ead-logistica-4-0-20261027-v2-aula-5",
    "skill": "Propor uma melhoria digital ligada a uma causa e a uma forma de validação.",
    "prompt": "Um tempo caiu de sessenta para 45 minutos. Qual é a redução relativa ao valor inicial?",
    "options": [
      "15%",
      "33,3%",
      "25%",
      "75%"
    ],
    "sourceIds": [
      "fiscal-perdas",
      "logistica-gs1",
      "logistica-captura",
      "logistica-anpd"
    ]
  }
];
