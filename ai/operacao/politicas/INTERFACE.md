# Interface e notificações

Carregue esta política somente para componentes visuais, interação, responsividade ou notificações.

- Em manutenção visual, preserve o design system e o padrão já aprovado; não aplique redesign criativo sem pedido explícito.
- Não use alert, confirm, Notification.requestPermission ou notificações nativas para feedback comum.
- Reutilize ToastNotification e useToast existentes no módulo correspondente.
- Ajustes de texto, espaçamento, alinhamento, cor ou estado local seguem o modo rápido quando não tocam domínio crítico.
- Valide a viewport e a ação realmente afetadas. Build ou dezenas de testes não substituem o clique/smoke visual.
- Se o navegador autenticado estiver indisponível, marque o smoke como pendente em vez de ampliar a implementação.
