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

## Hooks Auth

```toml
# This hook runs before a new user is created and allows developers to reject the request based on the incoming user object.
# [auth.hook.before_user_created]
# enabled = true
# uri = "pg-functions://postgres/auth/before-user-created-hook"

# This hook runs before a token is issued and allows you to add additional claims based on the authentication method used.
# [auth.hook.custom_access_token]
# enabled = true
# uri = "pg-functions://<database>/<schema>/<hook_name>"
```
