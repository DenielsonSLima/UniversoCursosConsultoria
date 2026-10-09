/** Configured declaration geometry, with synthetic institution, student and assets. */
export const declarationModel = {
  "v": 2,
  "textContent": "<p>Declaramos para os devidos fins que o(a) aluno(a) <b>{{ALUNO_NOME}}</b>, portador(a) do CPF nº <b>{{ALUNO_CPF}}</b>, <b>{{ALUNO_DOCUMENTO_TIPO}}</b> nº <b>{{ALUNO_RG}}</b>, nascido(a) em <b>{{ALUNO_NASCIMENTO}}</b>, registrado(a) sob a matrícula nº <b>{{ALUNO_MATRICULA}}</b>, encontra-se regularmente matriculado(a) no curso de <b>{{CURSO_NOME}}</b>, na turma <b>{{TURMA_NOME}}</b>, nesta instituição de ensino.</p><br><p>O referido curso é realizado na modalidade presencial no polo de <b>{{POLO_NOME}}</b>.</p><br><p>Atestamos que o aluno apresenta frequência regular e está em dia com suas obrigações acadêmicas.</p>",
  "validityDays": 30,
  "absoluteFields": [
    {
      "x": 81,
      "y": 788,
      "id": "data_field",
      "type": "text",
      "style": {
        "textAlign": "right",
        "fontWeight": "bold"
      },
      "value": "{{CIDADE_POLO}}, {{DATA_ATUAL}}"
    },
    {
      "x": 613,
      "y": 759,
      "id": "sol06jxhf",
      "type": "qrcode",
      "style": {
        "zIndex": 50
      },
      "value": "QR_VALIDADOR",
      "width": 105
    },
    {
      "x": 275,
      "y": 862,
      "id": "c1o173c2h",
      "type": "image",
      "style": {
        "zIndex": 50,
        "mixBlendMode": "multiply"
      },
      "value": "SYNTHETIC_SIGNATURE",
      "width": 250
    },
    {
      "x": 188,
      "y": 901,
      "id": "sig_line",
      "type": "text",
      "style": {
        "fontSize": "14px",
        "textAlign": "center"
      },
      "value": "___________________________________________",
      "width": 394
    },
    {
      "x": 200,
      "y": 921,
      "id": "sig_title",
      "type": "text",
      "style": {
        "fontSize": "14px",
        "textAlign": "center",
        "fontWeight": "bold",
        "textTransform": "uppercase"
      },
      "value": "Secretaria Acadêmica",
      "width": 394
    },
    {
      "x": 53,
      "y": 1029,
      "id": "footer_url",
      "type": "text",
      "style": {
        "color": "#000000",
        "fontSize": "9px",
        "textAlign": "center",
        "fontWeight": "bold",
        "textTransform": "uppercase"
      },
      "value": "Para verificar a autenticidade deste documento acesse: <span style=\"color: #ef4444\">www.universocc.com.br/validador</span>",
      "width": 694
    },
    {
      "x": 56,
      "y": 1013,
      "id": "footer_validity",
      "type": "text",
      "style": {
        "color": "#000000",
        "fontSize": "9px",
        "textAlign": "center",
        "fontWeight": "bold",
        "textTransform": "uppercase"
      },
      "value": "Validade deste documento: <span style=\"color: #ef4444\">{{VALIDADE_DIAS}} dias a partir da data de emissão</span>.",
      "width": 694
    },
    {
      "x": 59,
      "y": 1043,
      "id": "footer_generation",
      "type": "text",
      "style": {
        "color": "#94a3b8",
        "fontSize": "8px",
        "textAlign": "center",
        "textTransform": "uppercase"
      },
      "value": "DOCUMENTO GERADO EM: {{DATA_GERACAO}}",
      "width": 694
    }
  ]
};
