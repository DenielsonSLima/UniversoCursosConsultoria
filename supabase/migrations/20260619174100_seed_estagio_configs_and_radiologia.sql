-- Migração: Seed das configurações de checklist de estágio (Enfermagem) e desmembramento de horas (Radiologia)
-- Autor: Antigravity

-- 1. CONFIGURAÇÃO DE CARGAS HORÁRIAS (T/P/E) DO TÉCNICO EM RADIOLOGIA
UPDATE public.disciplinas d
SET 
  carga_horaria_teoria = COALESCE(
    (SELECT SUM(carga_horaria) 
     FROM public.aulas 
     WHERE disciplina_id = d.id 
       AND (titulo ILIKE '%teórica%' OR titulo ILIKE '%teoria%')
    ), 0
  ),
  carga_horaria_pratica = COALESCE(
    (SELECT SUM(carga_horaria) 
     FROM public.aulas 
     WHERE disciplina_id = d.id 
       AND (titulo ILIKE '%prática%' OR titulo ILIKE '%prática%' OR titulo ILIKE '%pratica%')
    ), 0
  ),
  carga_horaria_estagio = COALESCE(
    (SELECT SUM(carga_horaria) 
     FROM public.aulas 
     WHERE disciplina_id = d.id 
       AND (titulo ILIKE '%estágio%' OR titulo ILIKE '%estagio%')
    ), 0
  )
WHERE modulo_id IN (
  SELECT id FROM public.modulos WHERE curso_id = 'c0000000-0000-0000-0000-000000000002'
);

-- 2. POPULAR CONFIG_CHECKLIST_ESTAGIO DO TÉCNICO EM ENFERMAGEM
INSERT INTO public.config_checklist_estagio (curso_id, instrumentos_avaliativos, checklist_ucs)
VALUES (
  'c0000000-0000-0000-0000-000000000001',
  '[
    {
      "grupo": "Comportamento",
      "valorMax": "2,0",
      "itens": [
        "Assiduidade e Pontualidade",
        "Aparência Pessoal",
        "Iniciativa",
        "Interesse",
        "Responsabilidade",
        "Sociabilidade",
        "Espírito de Equipe",
        "Equilíbrio Emocional",
        "Ética Profissional",
        "Aceitação ao Ensino"
      ]
    },
    {
      "grupo": "Desempenho nos Registros",
      "valorMax": "2,0",
      "itens": [
        "Registro de Prescrições",
        "Registro de Enfermagem",
        "Conhecimento Científico"
      ]
    },
    {
      "grupo": "Desempenho das Técnicas",
      "valorMax": "6,0",
      "itens": [
        "Destreza Manual",
        "Eficiência",
        "Manuseio de Material Estéril",
        "Economia de Material",
        "Organização e Limpeza",
        "Associação Teoria e Prática",
        "Técnicas",
        "Cuidados de Enfermagem",
        "Administração de Medicamentos",
        "Passagem de Plantão"
      ]
    }
  ]'::jsonb,
  '[
    {
      "uc": "Fundamentos da Enfermagem",
      "atividades": [
        "Admissão",
        "Alimentação do acamado",
        "Alimentação por S.N.G ou S.N.E",
        "Alta hospitalar",
        "Anotação de Enfermagem",
        "Arrumação do leito",
        "Banho no leito",
        "Cateterismo vesical",
        "Coleta de material para exame",
        "Controle de gotejamento",
        "Cuidado com o corpo pós morte",
        "Curativos",
        "Encaminhamento",
        "Hidratação da pele",
        "Lavagem gástrica",
        "Lavagem intestinal",
        "Medicação E.V",
        "Medicação I.M",
        "Medicação S.C",
        "Medicação tópica",
        "Medicação V.O",
        "Mudança de decúbito",
        "Nebulização – NBZ",
        "Ordem no Posto de Enfermagem",
        "Oxigenoterapia",
        "Passagem de plantão",
        "Punção venosa",
        "Realização de glicemia capilar",
        "Retirada de pontos",
        "S.N.G ou S.N.E",
        "Transferência do cliente",
        "Venóclise",
        "Sinais vitais",
        "Outros"
      ]
    },
    {
      "uc": "Enfermagem Médica",
      "atividades": [
        "Admissão",
        "Acompanhamento ao cliente em observação",
        "Anotação de Enfermagem",
        "Arrumação do leito",
        "Balanço hídrico",
        "Banho no leito",
        "Cateterismo vesical",
        "Coleta de material para exame",
        "Controle de gotejamento",
        "Curativo",
        "Encaminhamento para exames",
        "Glicosúria",
        "Manter cliente aquecido",
        "Medicação E.V",
        "Medicação I.M",
        "Medicação S.C",
        "Medicação tópica",
        "Ordem no Posto de Enfermagem",
        "Oxigenoterapia",
        "Punção venosa",
        "Recebimento do cliente",
        "Retirada de pontos",
        "Sinais vitais",
        "S.N.G ou S.N.E",
        "Transferência do cliente",
        "Outros"
      ]
    },
    {
      "uc": "Enfermagem em Saúde Coletiva",
      "atividades": [
        "Administração de medicamentos",
        "Anotação de Enfermagem",
        "Atividade de Educação em Saúde",
        "Curativo",
        "Encaminhamentos",
        "Hiperdia",
        "Imunização",
        "Mensuração",
        "Nebulização - NBZ",
        "Pré consulta",
        "Pré-natal",
        "Organizar e preencher pasta família",
        "Realização de glicemia capilar",
        "Retirada de pontos",
        "Sinais vitais",
        "Teste de pezinho",
        "Coleta de Protege",
        "Testes Rápidos",
        "Visita domiciliar",
        "Outros"
      ]
    },
    {
      "uc": "Enfermagem em Saúde Mental",
      "atividades": [
        "Admissão",
        "Acompanhamento ao cliente em observação",
        "Administração de medicamento para tratamento de pediculose",
        "Anotação de Enfermagem",
        "Assistência ao cliente no: Q.O",
        "Cuidados higiênicos: cortar unhas",
        "Desenvolve atividades na T.O",
        "Encaminhamento",
        "Medicação V.O",
        "Motiva ao cliente na T.O",
        "Observa comportamento",
        "Ordem no Posto de Enfermagem",
        "Recebimento do cliente",
        "Sinais vitais",
        "Terapia ocupacional",
        "Outros"
      ]
    },
    {
      "uc": "Enfermagem em Urgência e Emergência",
      "atividades": [
        "Admissão",
        "Acompanhamento ao cliente em observação",
        "Anotação de Enfermagem",
        "Aspiração de secreções",
        "Cateterismo vesical",
        "Contenção",
        "Curativo",
        "Encaminhamento",
        "Glicemia capilar",
        "Lavagem gástrica",
        "Lavagem intestinal",
        "Medicação E.V",
        "Medicação I.M",
        "Medicação S.C",
        "Medicação V.O",
        "Medicação tópica",
        "Nebulização – NBZ",
        "Ordem no Posto de Enfermagem",
        "Oxigenoterapia",
        "Recebimento do cliente",
        "Sinais vitais",
        "Transporte de acidentados",
        "Transferência do cliente",
        "Venóclise",
        "Outros"
      ]
    },
    {
      "uc": "Enfermagem Cirúrgica e em Centro Cirúrgico",
      "atividades": [
        "Admissão",
        "Abrir materiais estéreis dentro de técnicas assépticas",
        "Acompanhamento ao cliente na URPA",
        "Anotação de Enfermagem",
        "Aspiração de secreções",
        "Balanço hídrico",
        "Banho no leito",
        "Cateterismo vesical",
        "Cateterismo gástrico (SNG/SNE)",
        "Contenção",
        "Controle de gotejamento",
        "Cuidado pré operatório",
        "Cuidado pós operatório",
        "Curativo",
        "Descontaminação de artigos e equipamentos",
        "Encaminhamento para o Centro Cirúrgico",
        "Encaminhamento para exames",
        "Glicemia capilar",
        "Glicosúria",
        "Lavagem gástrica",
        "Lavagem intestinal",
        "Manter cliente aquecido",
        "Manuseio da bomba de infusão",
        "Medicação E.V",
        "Medicação I.M",
        "Medicação S.C",
        "Medicação V.O",
        "Medicação tópica",
        "Nebulização – NBZ",
        "Ordem no Posto de Enfermagem",
        "Oxigenoterapia",
        "Paramentação da equipe cirúrgica",
        "Preparo de material no CME",
        "Posicionamento para o ato cirúrgico",
        "Punção venosa",
        "Recebimento do cliente",
        "Transferência do cliente da maca para a mesa cirúrgica",
        "Transferência do cliente",
        "Venóclise",
        "Verificação de SSVV",
        "Outros"
      ]
    },
    {
      "uc": "Enfermagem em Saúde da Mulher, Obstetrícia e Neonatologia",
      "atividades": [
        "Admissão no pré parto",
        "Acompanhamento a parturiente",
        "Abrir materiais estéreis dentro de técnicas assépticas",
        "Acompanhamento ao cliente na URPA",
        "Acompanhamento na evolução do trabalho de parto",
        "Administração da Vitamina K",
        "Aferição do Perímetro Abdominal",
        "Aferição do Perímetro Cefálico",
        "Aferição do Perímetro Torácico",
        "Anotação de Enfermagem",
        "Aspiração de secreções",
        "Assistência a amamentação",
        "Assistência parturiente de alto risco",
        "Assistência no parto normal",
        "Assistência no parto cesáreo",
        "Assistência o RN prematuro",
        "Atividade educativa",
        "Banho do RN",
        "Cateterismo vesical",
        "Controle de gotejamento",
        "Cuidados imediatos ao RN",
        "Cuidado pré operatório",
        "Cuidado pós operatório",
        "Curativo na incisão cirúrgica",
        "Encaminhamento para o Centro Cirúrgico",
        "Glicemia capilar",
        "Glicosúria",
        "Manter cliente aquecido",
        "Medicação E.V",
        "Medicação I.M",
        "Medicação S.C",
        "Medicação V.O",
        "Medicação tópica",
        "Observação de episiorrafia",
        "Observação do Globo de Pinnard",
        "Observação dos lóquios",
        "Ordem no Posto de Enfermagem",
        "Oxigenoterapia",
        "Paramentação da equipe cirúrgica",
        "Punção venosa",
        "Realização do Teste de Credê",
        "Realização de Teste Rápido",
        "Sinais vitais",
        "Transferência do cliente",
        "Venóclise",
        "Outros"
      ]
    },
    {
      "uc": "Administração em Enfermagem",
      "atividades": [
        "Admissão do Cliente/Paciente",
        "Alta Hospitalar",
        "Controle diário do carro de emergência (PCR)",
        "Escala de Atribuições",
        "Escala Mensal",
        "Leitura do Ordens e Ocorrências",
        "Leitura dos Prontuários",
        "Leitura do Relatório Geral",
        "Observação do Organograma do Hospital",
        "Passagem de Plantão",
        "Registro de Enfermagem",
        "Solicitação de Materiais",
        "Solicitação de Medicamentos",
        "Transferência do Cliente/Paciente",
        "Uso de EPI’s pela equipe",
        "Outros"
      ]
    },
    {
      "uc": "Enfermagem em Saúde da Criança e do Adolescente",
      "atividades": [
        "Assistência à criança em estado de Choque",
        "Assistência à criança com TCE",
        "Assistência à criança politraumatizada",
        "Assistência à criança com fraturas",
        "Assistência à criança em estado grave",
        "Assistência a crianças especiais",
        "Assistência à criança com IRA",
        "Administração de compressas",
        "Administração de medicação tópica",
        "Administração de medicação por VO",
        "Administração de medicação por via inalatória",
        "Banho no leito",
        "Cuidados na Oxigenoterapia",
        "Curativos",
        "Manobra de RCP",
        "Manuseio da bomba de infusão",
        "Recebimento do Cliente",
        "Registro de Enfermagem no prontuário",
        "Rotinas de Transferência do Cliente/Paciente",
        "Verificação dos SSVV",
        "Venóclise",
        "Outros"
      ]
    }
  ]'::jsonb
)
ON CONFLICT (curso_id) 
DO UPDATE SET 
  instrumentos_avaliativos = EXCLUDED.instrumentos_avaliativos,
  checklist_ucs = EXCLUDED.checklist_ucs;
