update public.whatsapp_flow_settings
set
  welcome_message = replace(welcome_message, chr(92) || 'n', chr(10)),
  invalid_cpf_message = replace(invalid_cpf_message, chr(92) || 'n', chr(10)),
  mismatch_message = replace(mismatch_message, chr(92) || 'n', chr(10)),
  menu_message = replace(menu_message, chr(92) || 'n', chr(10)),
  receivable_choice_message = replace(receivable_choice_message, chr(92) || 'n', chr(10)),
  no_receivables_message = replace(no_receivables_message, chr(92) || 'n', chr(10)),
  fallback_message = replace(fallback_message, chr(92) || 'n', chr(10)),
  handoff_message = replace(handoff_message, chr(92) || 'n', chr(10)),
  link_intro_message = replace(link_intro_message, chr(92) || 'n', chr(10)),
  pix_intro_message = replace(pix_intro_message, chr(92) || 'n', chr(10)),
  updated_at = now()
where scope = 'default';
