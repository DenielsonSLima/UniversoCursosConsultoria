export const activities = [
  {
    "id": "ead-excel-basico-avancado-20261027-v2-atividade-1",
    "lessonId": "ead-excel-basico-avancado-20261027-v2-aula-1",
    "skill": "Identificar células e intervalos e calcular valores a partir de dados organizados.",
    "prompt": "B2 contém 4 e C2 contém 5. Qual fórmula calcula o total por multiplicação dessas entradas?",
    "options": [
      "=B2+C2",
      "=B2*C2",
      "=SOMA(B2:C2)",
      "=B2-C2"
    ],
    "sourceIds": [
      "xl-formulas",
      "xl-ref"
    ]
  },
  {
    "id": "ead-excel-basico-avancado-20261027-v2-atividade-2",
    "lessonId": "ead-excel-basico-avancado-20261027-v2-aula-2",
    "skill": "Aplicar referências, testes e funções de tratamento a situações explicitamente definidas.",
    "prompt": "A taxa comum está em G1 e deve permanecer fixa ao copiar o cálculo para outras linhas. Qual referência fixa coluna e linha?",
    "options": [
      "G1",
      "G$1",
      "$G$1",
      "$G1"
    ],
    "sourceIds": [
      "xl-ref",
      "xl-se",
      "xl-contar",
      "xl-texto",
      "xl-somase",
      "xl-ano"
    ]
  },
  {
    "id": "ead-excel-basico-avancado-20261027-v2-atividade-3",
    "lessonId": "ead-excel-basico-avancado-20261027-v2-aula-3",
    "skill": "Manter registros íntegros e estabelecer entradas válidas para a base de análise.",
    "prompt": "Uma regra permite quantidades inteiras de zero a cem, inclusive. Qual conjunto contém somente entradas válidas?",
    "options": [
      "0, 25 e 100.",
      "0, 25 e 101.",
      "2,5, 25 e 100.",
      "−1, 0 e 100."
    ],
    "sourceIds": [
      "xl-validar",
      "xl-formulas",
      "xl-pivot"
    ]
  },
  {
    "id": "ead-excel-basico-avancado-20261027-v2-atividade-4",
    "lessonId": "ead-excel-basico-avancado-20261027-v2-aula-4",
    "skill": "Selecionar dados, recorte e representação compatíveis com a comparação pretendida.",
    "prompt": "Três meses têm 90, 120 e 105 unidades. Qual média aritmética corresponde ao período?",
    "options": [
      "315.",
      "120.",
      "90.",
      "105."
    ],
    "sourceIds": [
      "xl-grafico",
      "xl-formulas",
      "xl-pivot"
    ]
  },
  {
    "id": "ead-excel-basico-avancado-20261027-v2-atividade-5",
    "lessonId": "ead-excel-basico-avancado-20261027-v2-aula-5",
    "skill": "Usar correspondência exata e configurar um resumo por categoria com atualização conferida.",
    "prompt": "Um resumo de Papel com valores 20 e 5 mostra o número 2. O que deve ser conferido se o objetivo era somar valores?",
    "options": [
      "Somente a cor do cabeçalho.",
      "A operação do campo de valores e se a coluna contém números, pois pode estar contando registros.",
      "O nome da pasta do arquivo, pois define a soma.",
      "A necessidade de apagar um dos registros de Papel."
    ],
    "sourceIds": [
      "xl-procx",
      "xl-procv",
      "xl-pivot"
    ]
  },
  {
    "id": "ead-excel-basico-avancado-20261027-v2-atividade-6",
    "lessonId": "ead-excel-basico-avancado-20261027-v2-aula-6",
    "skill": "Conferir a cadeia entre entradas, cálculos e relatórios com casos e resultados esperados.",
    "prompt": "Uma operação nova em D5 ficou fora de =SOMA(D2:D4). Qual diagnóstico é sustentado?",
    "options": [
      "A função SOMA não pode somar quatro valores.",
      "O gráfico sempre atualiza o total sozinho.",
      "O preço precisa ser substituído por texto.",
      "O intervalo do cálculo não inclui a nova linha e precisa ser conferido junto às demais saídas."
    ],
    "sourceIds": [
      "xl-formulas",
      "xl-ref",
      "xl-validar",
      "xl-grafico",
      "xl-procx",
      "xl-pivot"
    ]
  }
];

export const exam = [
  {
    "id": "ead-excel-basico-avancado-20261027-v2-questao-1",
    "lessonId": "ead-excel-basico-avancado-20261027-v2-aula-1",
    "skill": "Identificar células e intervalos e calcular valores a partir de dados organizados.",
    "prompt": "Os totais em D2:D4 são 20, 6 e 14. Qual resultado de =SOMA(D2:D4)?",
    "options": [
      "40.",
      "3.",
      "26.",
      "20."
    ],
    "sourceIds": [
      "xl-formulas",
      "xl-ref"
    ]
  },
  {
    "id": "ead-excel-basico-avancado-20261027-v2-questao-2",
    "lessonId": "ead-excel-basico-avancado-20261027-v2-aula-1",
    "skill": "Identificar células e intervalos e calcular valores a partir de dados organizados.",
    "prompt": "Ao copiar =B2*C2 de D2 para D3, usando referências relativas, qual fórmula é esperada?",
    "options": [
      "=B2*C2",
      "=B2*C3",
      "=B3*C3",
      "=C2*D2"
    ],
    "sourceIds": [
      "xl-formulas",
      "xl-ref"
    ]
  },
  {
    "id": "ead-excel-basico-avancado-20261027-v2-questao-3",
    "lessonId": "ead-excel-basico-avancado-20261027-v2-aula-2",
    "skill": "Aplicar referências, testes e funções de tratamento a situações explicitamente definidas.",
    "prompt": "Com D2 igual a 100, qual resultado de =SE(D2>=100;\"Meta\";\"Rever\")?",
    "options": [
      "Rever.",
      "Meta.",
      "Zero, porque cem é o limite.",
      "Erro obrigatório em todo valor igual a cem."
    ],
    "sourceIds": [
      "xl-ref",
      "xl-se",
      "xl-contar",
      "xl-texto",
      "xl-somase",
      "xl-ano"
    ]
  },
  {
    "id": "ead-excel-basico-avancado-20261027-v2-questao-4",
    "lessonId": "ead-excel-basico-avancado-20261027-v2-aula-2",
    "skill": "Aplicar referências, testes e funções de tratamento a situações explicitamente definidas.",
    "prompt": "A2:A5 contém Papel, Caneta, Papel e Pasta. D2:D5 contém 20, 6, 5 e 14. Qual soma do grupo Papel?",
    "options": [
      "2.",
      "45.",
      "20.",
      "25."
    ],
    "sourceIds": [
      "xl-ref",
      "xl-se",
      "xl-contar",
      "xl-texto",
      "xl-somase",
      "xl-ano"
    ]
  },
  {
    "id": "ead-excel-basico-avancado-20261027-v2-questao-5",
    "lessonId": "ead-excel-basico-avancado-20261027-v2-aula-3",
    "skill": "Manter registros íntegros e estabelecer entradas válidas para a base de análise.",
    "prompt": "Qual afirmação distingue filtrar de excluir registros?",
    "options": [
      "Filtrar oculta temporariamente os que não atendem ao critério; removê-lo permite voltar a ver a base.",
      "Filtrar apaga definitivamente todas as linhas não visíveis.",
      "Filtrar troca os dados de cada coluna independentemente.",
      "Filtrar converte automaticamente qualquer SOMA em soma somente de linhas visíveis."
    ],
    "sourceIds": [
      "xl-validar",
      "xl-formulas",
      "xl-pivot"
    ]
  },
  {
    "id": "ead-excel-basico-avancado-20261027-v2-questao-6",
    "lessonId": "ead-excel-basico-avancado-20261027-v2-aula-3",
    "skill": "Manter registros íntegros e estabelecer entradas válidas para a base de análise.",
    "prompt": "Você ordenou só os nomes e deixou as quantidades na posição original. Qual risco aparece?",
    "options": [
      "Todos os valores tornam-se percentuais.",
      "O número de planilhas é multiplicado.",
      "As quantidades podem passar a ser associadas a nomes de outros registros.",
      "A validação elimina qualquer erro sem conferência."
    ],
    "sourceIds": [
      "xl-validar",
      "xl-formulas",
      "xl-pivot"
    ]
  },
  {
    "id": "ead-excel-basico-avancado-20261027-v2-questao-7",
    "lessonId": "ead-excel-basico-avancado-20261027-v2-aula-4",
    "skill": "Selecionar dados, recorte e representação compatíveis com a comparação pretendida.",
    "prompt": "Você quer observar a evolução de uma medida nos meses ordenados. Qual representação é compatível com esse objetivo?",
    "options": [
      "Um gráfico de setores com códigos de clientes misturados.",
      "Um gráfico de linhas com meses em ordem e unidade identificada.",
      "Uma lista sem período nem unidade.",
      "Uma figura decorativa sem relação com a base."
    ],
    "sourceIds": [
      "xl-grafico",
      "xl-formulas",
      "xl-pivot"
    ]
  },
  {
    "id": "ead-excel-basico-avancado-20261027-v2-questao-8",
    "lessonId": "ead-excel-basico-avancado-20261027-v2-aula-4",
    "skill": "Selecionar dados, recorte e representação compatíveis com a comparação pretendida.",
    "prompt": "Uma nova linha foi incluída e o gráfico não mudou. Qual conferência é necessária antes de afirmar que o painel está atualizado?",
    "options": [
      "Somente a data em que o arquivo foi aberto.",
      "A quantidade de cores da legenda.",
      "A posição do arquivo na lista de recentes.",
      "O intervalo ou tabela de origem efetivamente usado pelo gráfico."
    ],
    "sourceIds": [
      "xl-grafico",
      "xl-formulas",
      "xl-pivot"
    ]
  },
  {
    "id": "ead-excel-basico-avancado-20261027-v2-questao-9",
    "lessonId": "ead-excel-basico-avancado-20261027-v2-aula-5",
    "skill": "Usar correspondência exata e configurar um resumo por categoria com atualização conferida.",
    "prompt": "Qual configuração de PROCV corresponde a uma busca exata de código na primeira coluna de A2:C4, retornando a terceira coluna?",
    "options": [
      "=PROCV(F2;$A$2:$C$4;3;FALSO)",
      "=PROCV(F2;$A$2:$C$4;1;VERDADEIRO)",
      "=PROCV(F2;$A$2:$C$4;0;VERDADEIRO)",
      "=SOMA(A2:C4)"
    ],
    "sourceIds": [
      "xl-procx",
      "xl-procv",
      "xl-pivot"
    ]
  },
  {
    "id": "ead-excel-basico-avancado-20261027-v2-questao-10",
    "lessonId": "ead-excel-basico-avancado-20261027-v2-aula-5",
    "skill": "Usar correspondência exata e configurar um resumo por categoria com atualização conferida.",
    "prompt": "O arquivo precisa funcionar no Excel 2016. Qual decisão sobre PROCX respeita a compatibilidade ensinada?",
    "options": [
      "Usar PROCX sem conferir, pois existe em toda versão.",
      "Trocar o nome do arquivo para ativar PROCX.",
      "Escolher uma alternativa compatível, como PROCV exato quando a estrutura do cadastro permitir.",
      "Omitir o critério de correspondência para tornar qualquer função compatível."
    ],
    "sourceIds": [
      "xl-procx",
      "xl-procv",
      "xl-pivot"
    ]
  },
  {
    "id": "ead-excel-basico-avancado-20261027-v2-questao-11",
    "lessonId": "ead-excel-basico-avancado-20261027-v2-aula-6",
    "skill": "Conferir a cadeia entre entradas, cálculos e relatórios com casos e resultados esperados.",
    "prompt": "Três totais são 16, 9 e 5. Um desconto fictício de 10% é aplicado sobre a soma. Qual resultado esperado para conferir a planilha?",
    "options": [
      "30.",
      "27.",
      "3.",
      "33."
    ],
    "sourceIds": [
      "xl-formulas",
      "xl-ref",
      "xl-validar",
      "xl-grafico",
      "xl-procx",
      "xl-pivot"
    ]
  },
  {
    "id": "ead-excel-basico-avancado-20261027-v2-questao-12",
    "lessonId": "ead-excel-basico-avancado-20261027-v2-aula-6",
    "skill": "Conferir a cadeia entre entradas, cálculos e relatórios com casos e resultados esperados.",
    "prompt": "Qual teste verifica uma falha de pesquisa prevista sem disfarçá-la como preço válido?",
    "options": [
      "Usar apenas chaves conhecidas e ignorar ausências.",
      "Substituir todos os erros por zero sem explicar o significado.",
      "Apagar a coluna de código antes da pesquisa.",
      "Usar uma chave ausente e conferir a mensagem de pendência e o efeito no relatório."
    ],
    "sourceIds": [
      "xl-formulas",
      "xl-ref",
      "xl-validar",
      "xl-grafico",
      "xl-procx",
      "xl-pivot"
    ]
  }
];
