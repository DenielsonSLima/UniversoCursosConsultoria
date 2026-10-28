export const activities = [
  {
    "id": "ead-auxiliar-administrativo-20261027-v2-atividade-1",
    "lessonId": "ead-auxiliar-administrativo-20261027-v2-aula-1",
    "skill": "Registrar solicitações, prioridades e dependências sem confundir encaminhamento com conclusão.",
    "prompt": "Um pedido foi encaminhado a outro setor, mas o resultado ainda não foi entregue. Qual estado descreve a situação com precisão?",
    "options": [
      "Concluído, porque foi enviado.",
      "Em acompanhamento, aguardando o retorno da etapa seguinte.",
      "Excluído da fila, pois mudou de responsável.",
      "Pago, independentemente da natureza do pedido."
    ],
    "sourceIds": [
      "adm-documentos",
      "adm-atendimento"
    ]
  },
  {
    "id": "ead-auxiliar-administrativo-20261027-v2-atividade-2",
    "lessonId": "ead-auxiliar-administrativo-20261027-v2-aula-2",
    "skill": "Conferir identificação, tramitação, versão e acesso de um documento.",
    "prompt": "Uma mensagem menciona relatório e planilha, mas só o relatório chegou. Qual registro é adequado?",
    "options": [
      "Recebimento integral de todos os anexos, para evitar atraso.",
      "Substituição silenciosa da planilha por uma cópia antiga.",
      "Registro somente do nome do remetente, sem mencionar a falta.",
      "Recebimento do relatório e pendência da planilha para complementação."
    ],
    "sourceIds": [
      "adm-documentos",
      "adm-classificar",
      "adm-seguranca"
    ]
  },
  {
    "id": "ead-auxiliar-administrativo-20261027-v2-atividade-3",
    "lessonId": "ead-auxiliar-administrativo-20261027-v2-aula-3",
    "skill": "Produzir um encaminhamento claro e confirmar agenda, destinatário e retorno.",
    "prompt": "Uma reunião foi proposta como próxima terça depois do almoço. O que deve ser confirmado antes de registrar o compromisso?",
    "options": [
      "Data completa, horário, participantes e forma ou local, com retorno de disponibilidade.",
      "Somente a cor do evento na agenda.",
      "Apenas o nome de uma pessoa que talvez participe.",
      "A existência de qualquer sala, sem conferir horário."
    ],
    "sourceIds": [
      "adm-atendimento",
      "adm-documentos",
      "adm-seguranca"
    ]
  },
  {
    "id": "ead-auxiliar-administrativo-20261027-v2-atividade-4",
    "lessonId": "ead-auxiliar-administrativo-20261027-v2-aula-4",
    "skill": "Distinguir previsão de realização e calcular um saldo de caixa com documentos.",
    "prompt": "O caixa iniciou com R$ 400, recebeu R$ 150 e pagou R$ 90. Há R$ 80 previstos que ainda não entraram. Qual saldo realizado resulta desses dados?",
    "options": [
      "R$ 540.",
      "R$ 310.",
      "R$ 460.",
      "R$ 630."
    ],
    "sourceIds": [
      "adm-caixa",
      "adm-documentos"
    ]
  },
  {
    "id": "ead-auxiliar-administrativo-20261027-v2-atividade-5",
    "lessonId": "ead-auxiliar-administrativo-20261027-v2-aula-5",
    "skill": "Conferir unidades, recebimentos e indicadores simples preservando evidências.",
    "prompt": "Há dez unidades iniciais, entrada de duas caixas com cinco unidades e consumo de sete unidades. Qual saldo esperado?",
    "options": [
      "Cinco unidades.",
      "Treze unidades.",
      "Quinze unidades.",
      "Vinte e sete unidades."
    ],
    "sourceIds": [
      "adm-caixa",
      "adm-documentos"
    ]
  }
];

export const exam = [
  {
    "id": "ead-auxiliar-administrativo-20261027-v2-questao-1",
    "lessonId": "ead-auxiliar-administrativo-20261027-v2-aula-1",
    "skill": "Registrar solicitações, prioridades e dependências sem confundir encaminhamento com conclusão.",
    "prompt": "Qual registro permite que outra pessoa continue uma demanda bloqueada?",
    "options": [
      "Falta resolver.",
      "Conferir o assunto depois.",
      "Quem pediu sabe o que é.",
      "Identificação do pedido, informação faltante, responsável e próxima ação."
    ],
    "sourceIds": [
      "adm-documentos",
      "adm-atendimento"
    ]
  },
  {
    "id": "ead-auxiliar-administrativo-20261027-v2-questao-2",
    "lessonId": "ead-auxiliar-administrativo-20261027-v2-aula-1",
    "skill": "Registrar solicitações, prioridades e dependências sem confundir encaminhamento com conclusão.",
    "prompt": "Dois prazos confirmados exigem o mesmo recurso no mesmo horário. Qual encaminhamento respeita o processo?",
    "options": [
      "Apresentar o conflito e as dependências a quem pode definir a prioridade.",
      "Prometer os dois resultados sem verificar a capacidade.",
      "Apagar a demanda de quem solicitou por último sem comunicar.",
      "Marcar ambas como concluídas para liberar a agenda."
    ],
    "sourceIds": [
      "adm-documentos",
      "adm-atendimento"
    ]
  },
  {
    "id": "ead-auxiliar-administrativo-20261027-v2-questao-3",
    "lessonId": "ead-auxiliar-administrativo-20261027-v2-aula-2",
    "skill": "Conferir identificação, tramitação, versão e acesso de um documento.",
    "prompt": "Por que digitalizar um documento não autoriza automaticamente eliminar o original?",
    "options": [
      "Porque qualquer documento deve ser guardado para sempre.",
      "Porque o nome do scanner define o prazo de guarda.",
      "Porque a destinação depende dos instrumentos e procedimentos aplicáveis ao tipo e ao contexto.",
      "Porque documentos digitais nunca podem ser arquivados."
    ],
    "sourceIds": [
      "adm-documentos",
      "adm-classificar",
      "adm-seguranca"
    ]
  },
  {
    "id": "ead-auxiliar-administrativo-20261027-v2-questao-4",
    "lessonId": "ead-auxiliar-administrativo-20261027-v2-aula-2",
    "skill": "Conferir identificação, tramitação, versão e acesso de um documento.",
    "prompt": "Duas versões têm nomes parecidos e apenas uma foi aprovada. Qual controle ajuda a identificar a referência válida?",
    "options": [
      "Guardar as duas sem registrar relação ou estado.",
      "Relacionar identificação, versão, aprovação e processo a que pertencem.",
      "Considerar sempre a de maior tamanho como aprovada.",
      "Escolher apenas pela ordem alfabética do nome."
    ],
    "sourceIds": [
      "adm-documentos",
      "adm-classificar",
      "adm-seguranca"
    ]
  },
  {
    "id": "ead-auxiliar-administrativo-20261027-v2-questao-5",
    "lessonId": "ead-auxiliar-administrativo-20261027-v2-aula-3",
    "skill": "Produzir um encaminhamento claro e confirmar agenda, destinatário e retorno.",
    "prompt": "Um atendimento depende de decisão de outro setor. Qual retorno é mais preciso?",
    "options": [
      "Está resolvido, mesmo sem resposta.",
      "A culpa é de outro setor, sem informar encaminhamento.",
      "Não será registrado porque o pedido ainda está pendente.",
      "Informar o encaminhamento confirmado e como será acompanhado o retorno."
    ],
    "sourceIds": [
      "adm-atendimento",
      "adm-documentos",
      "adm-seguranca"
    ]
  },
  {
    "id": "ead-auxiliar-administrativo-20261027-v2-questao-6",
    "lessonId": "ead-auxiliar-administrativo-20261027-v2-aula-3",
    "skill": "Produzir um encaminhamento claro e confirmar agenda, destinatário e retorno.",
    "prompt": "Antes de enviar uma planilha de atendimento por e-mail, qual conferência é pertinente?",
    "options": [
      "Destinatário, versão, necessidade dos dados e anexo correspondente ao pedido.",
      "Somente se o arquivo tem um nome curto.",
      "Se todas as pessoas da organização podem receber qualquer dado.",
      "A quantidade de cores usada no título."
    ],
    "sourceIds": [
      "adm-atendimento",
      "adm-documentos",
      "adm-seguranca"
    ]
  },
  {
    "id": "ead-auxiliar-administrativo-20261027-v2-questao-7",
    "lessonId": "ead-auxiliar-administrativo-20261027-v2-aula-4",
    "skill": "Distinguir previsão de realização e calcular um saldo de caixa com documentos.",
    "prompt": "Uma conta vence amanhã e ainda não foi paga. Como deve aparecer nos controles de hoje?",
    "options": [
      "Como saída realizada apenas porque tem vencimento definido.",
      "Como recebimento confirmado, para compensar o caixa.",
      "Como compromisso e previsão, distinguida das saídas já realizadas.",
      "Como lucro, sem relação com documentos."
    ],
    "sourceIds": [
      "adm-caixa",
      "adm-documentos"
    ]
  },
  {
    "id": "ead-auxiliar-administrativo-20261027-v2-questao-8",
    "lessonId": "ead-auxiliar-administrativo-20261027-v2-aula-4",
    "skill": "Distinguir previsão de realização e calcular um saldo de caixa com documentos.",
    "prompt": "Dois registros têm o mesmo fornecedor e a mesma nota, sendo um a cópia enviada por e-mail. Qual conferência evita duplicidade?",
    "options": [
      "Pagar os dois porque estão em arquivos diferentes.",
      "Comparar a identidade do documento e seu histórico de tratamento antes de preparar outra operação.",
      "Alterar o número da cópia para torná-la diferente.",
      "Somar os dois sem consultar o responsável."
    ],
    "sourceIds": [
      "adm-caixa",
      "adm-documentos"
    ]
  },
  {
    "id": "ead-auxiliar-administrativo-20261027-v2-questao-9",
    "lessonId": "ead-auxiliar-administrativo-20261027-v2-aula-5",
    "skill": "Conferir unidades, recebimentos e indicadores simples preservando evidências.",
    "prompt": "A contagem física diverge em uma unidade do saldo registrado. O que a diferença permite afirmar inicialmente?",
    "options": [
      "Que um colega retirou a unidade sem autorização.",
      "Que o sistema está sempre errado.",
      "Que basta inventar um ajuste para fechar o saldo.",
      "Que há uma divergência a recontar e conferir com documentos e locais."
    ],
    "sourceIds": [
      "adm-caixa",
      "adm-documentos"
    ]
  },
  {
    "id": "ead-auxiliar-administrativo-20261027-v2-questao-10",
    "lessonId": "ead-auxiliar-administrativo-20261027-v2-aula-5",
    "skill": "Conferir unidades, recebimentos e indicadores simples preservando evidências.",
    "prompt": "De vinte solicitações do período, dezesseis foram concluídas pelo mesmo critério. Qual leitura é adequada?",
    "options": [
      "A conclusão foi de 80%, mas esse índice sozinho não explica a qualidade ou as causas das pendências.",
      "A conclusão foi de 20% e todas as entregas foram inadequadas.",
      "O índice prova que as quatro pendências são culpa do mesmo funcionário.",
      "O índice demonstra que toda demanda futura será concluída."
    ],
    "sourceIds": [
      "adm-caixa",
      "adm-documentos"
    ]
  }
];
