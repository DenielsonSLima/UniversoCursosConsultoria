# Exemplos opcionais do template Supabase

Estes exemplos comentados foram separados de `config.toml` para manter a configuração ativa legível e abaixo de 500 linhas. Eles não habilitam recursos nem alteram o Auth do projeto.

## Passkey e WebAuthn

```toml
# Configure passkey sign-ins.
# [auth.passkey]
# enabled = false

# Configure WebAuthn relying party settings (required when passkey is enabled).
# [auth.webauthn]
# rp_display_name = "Supabase"
# rp_id = "localhost"
# rp_origins = ["http://127.0.0.1:3000"]
```

Referência do template: https://supabase.com/docs/guides/local-development/cli/config
