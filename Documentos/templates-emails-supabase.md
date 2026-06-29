# Templates de e-mail do Supabase

Use estes modelos em **Authentication > Emails > Templates** no Supabase.

Logo usada no cabecalho:

```text
https://universocc.com.br/LogoUniverso.png
```

Observacao: os templates do Supabase usam variaveis Go Template. Mantenha exatamente variaveis como `{{ .ConfirmationURL }}` e `{{ .Token }}`.

## Confirm sign up

Assunto:

```text
Confirme seu e-mail | Universo Cursos e Consultoria
```

HTML:

```html
<div style="margin:0;padding:32px 12px;background:#f3f6fb;font-family:Arial,Helvetica,sans-serif;color:#1f2937;">
  <div style="max-width:650px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:14px;overflow:hidden;">
    <div style="background:#0d47a1;padding:28px 28px 24px;text-align:center;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto 18px;background:#ffffff;border-radius:10px;">
        <tr>
          <td style="padding:10px 18px;text-align:center;">
            <img src="https://universocc.com.br/LogoUniverso.png?v=20260629" alt="Universo Cursos e Consultoria" width="250" style="display:block;width:250px;max-width:100%;height:auto;border:0;outline:none;text-decoration:none;color:#0d47a1;font-size:18px;font-weight:bold;">
          </td>
        </tr>
      </table>
      <h1 style="margin:0;color:#ffffff;font-size:24px;line-height:1.3;font-weight:bold;">Confirme seu e-mail</h1>
    </div>
    <div style="padding:36px 34px;">
      <p style="margin:0 0 18px;font-size:16px;line-height:1.7;color:#374151;">Ola,</p>
      <p style="margin:0 0 18px;font-size:16px;line-height:1.7;color:#374151;">Recebemos uma solicitacao para criar ou ativar sua conta na plataforma da <strong>Universo Cursos e Consultoria</strong>.</p>
      <p style="margin:0 0 26px;font-size:16px;line-height:1.7;color:#374151;">Para concluir seu cadastro, confirme seu endereco de e-mail clicando no botao abaixo.</p>
      <div style="text-align:center;margin:34px 0;">
        <a href="{{ .ConfirmationURL }}" style="display:inline-block;background:#1565c0;color:#ffffff;text-decoration:none;padding:15px 30px;border-radius:8px;font-size:16px;font-weight:bold;">Confirmar meu e-mail</a>
      </div>
      <p style="margin:0 0 8px;font-size:14px;line-height:1.6;color:#6b7280;">Caso o botao nao funcione, copie e cole este link no navegador:</p>
      <p style="margin:0 0 28px;font-size:13px;line-height:1.6;word-break:break-word;"><a href="{{ .ConfirmationURL }}" style="color:#1565c0;">{{ .ConfirmationURL }}</a></p>
      <div style="background:#f8fafc;border-left:4px solid #1565c0;padding:18px;border-radius:7px;">
        <strong style="display:block;color:#0d47a1;font-size:15px;margin-bottom:8px;">Aviso de seguranca</strong>
        <p style="margin:0;color:#4b5563;font-size:14px;line-height:1.7;">Nunca compartilhe este link de confirmacao ou sua senha com terceiros. A Universo Cursos e Consultoria nunca solicitara sua senha por e-mail, telefone ou WhatsApp.</p>
      </div>
    </div>
    <div style="background:#f9fafb;padding:26px 30px;text-align:center;border-top:1px solid #e5e7eb;">
      <strong style="font-size:16px;color:#111827;">Universo Cursos e Consultoria</strong>
      <p style="margin:14px 0;color:#6b7280;font-size:13px;line-height:1.7;">Este e um e-mail automatico enviado pelo sistema da <strong>Universo Cursos e Consultoria</strong>. Por favor, <strong>nao responda esta mensagem</strong>, pois este endereco e utilizado exclusivamente para autenticacao e notificacoes da plataforma.</p>
      <p style="margin:14px 0;color:#6b7280;font-size:13px;line-height:1.7;">Caso voce nao tenha solicitado esta acao, ignore este e-mail. Nenhuma alteracao sera realizada em sua conta.</p>
      <p style="margin:18px 0 0;color:#6b7280;font-size:13px;"><a href="https://universocc.com.br" style="color:#1565c0;text-decoration:none;">https://universocc.com.br</a></p>
      <p style="margin:18px 0 0;font-size:12px;color:#9ca3af;line-height:1.6;">CNPJ: 13.278.137/0001-54<br>&copy; 2026 Universo Cursos e Consultoria. Todos os direitos reservados.</p>
    </div>
  </div>
</div>
```

## Invite user

Assunto:

```text
Seu convite para a Universo Cursos e Consultoria
```

HTML:

```html
<div style="margin:0;padding:32px 12px;background:#f3f6fb;font-family:Arial,Helvetica,sans-serif;color:#1f2937;">
  <div style="max-width:650px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:14px;overflow:hidden;">
    <div style="background:#0d47a1;padding:28px 28px 24px;text-align:center;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto 18px;background:#ffffff;border-radius:10px;">
        <tr>
          <td style="padding:10px 18px;text-align:center;">
            <img src="https://universocc.com.br/LogoUniverso.png?v=20260629" alt="Universo Cursos e Consultoria" width="250" style="display:block;width:250px;max-width:100%;height:auto;border:0;outline:none;text-decoration:none;color:#0d47a1;font-size:18px;font-weight:bold;">
          </td>
        </tr>
      </table>
      <h1 style="margin:0;color:#ffffff;font-size:24px;line-height:1.3;font-weight:bold;">Voce recebeu um convite</h1>
    </div>
    <div style="padding:36px 34px;">
      <p style="margin:0 0 18px;font-size:16px;line-height:1.7;color:#374151;">Ola,</p>
      <p style="margin:0 0 18px;font-size:16px;line-height:1.7;color:#374151;">Voce foi convidado para criar uma conta na plataforma da <strong>Universo Cursos e Consultoria</strong>.</p>
      <p style="margin:0 0 26px;font-size:16px;line-height:1.7;color:#374151;">Para aceitar o convite e definir seu acesso, clique no botao abaixo.</p>
      <div style="text-align:center;margin:34px 0;">
        <a href="{{ .ConfirmationURL }}" style="display:inline-block;background:#1565c0;color:#ffffff;text-decoration:none;padding:15px 30px;border-radius:8px;font-size:16px;font-weight:bold;">Aceitar convite</a>
      </div>
      <p style="margin:0 0 8px;font-size:14px;line-height:1.6;color:#6b7280;">Caso o botao nao funcione, copie e cole este link no navegador:</p>
      <p style="margin:0 0 28px;font-size:13px;line-height:1.6;word-break:break-word;"><a href="{{ .ConfirmationURL }}" style="color:#1565c0;">{{ .ConfirmationURL }}</a></p>
      <div style="background:#f8fafc;border-left:4px solid #1565c0;padding:18px;border-radius:7px;">
        <strong style="display:block;color:#0d47a1;font-size:15px;margin-bottom:8px;">Aviso de seguranca</strong>
        <p style="margin:0;color:#4b5563;font-size:14px;line-height:1.7;">Nunca compartilhe este link ou sua senha com terceiros. Se voce nao esperava este convite, ignore este e-mail.</p>
      </div>
    </div>
    <div style="background:#f9fafb;padding:26px 30px;text-align:center;border-top:1px solid #e5e7eb;">
      <strong style="font-size:16px;color:#111827;">Universo Cursos e Consultoria</strong>
      <p style="margin:14px 0;color:#6b7280;font-size:13px;line-height:1.7;">Este e um e-mail automatico enviado pelo sistema da <strong>Universo Cursos e Consultoria</strong>. Por favor, <strong>nao responda esta mensagem</strong>, pois este endereco e utilizado exclusivamente para autenticacao e notificacoes da plataforma.</p>
      <p style="margin:18px 0 0;color:#6b7280;font-size:13px;"><a href="https://universocc.com.br" style="color:#1565c0;text-decoration:none;">https://universocc.com.br</a></p>
      <p style="margin:18px 0 0;font-size:12px;color:#9ca3af;line-height:1.6;">CNPJ: 13.278.137/0001-54<br>&copy; 2026 Universo Cursos e Consultoria. Todos os direitos reservados.</p>
    </div>
  </div>
</div>
```

## Magic link or OTP

Assunto:

```text
Seu link de acesso | Universo Cursos e Consultoria
```

HTML:

```html
<div style="margin:0;padding:32px 12px;background:#f3f6fb;font-family:Arial,Helvetica,sans-serif;color:#1f2937;">
  <div style="max-width:650px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:14px;overflow:hidden;">
    <div style="background:#0d47a1;padding:28px 28px 24px;text-align:center;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto 18px;background:#ffffff;border-radius:10px;">
        <tr>
          <td style="padding:10px 18px;text-align:center;">
            <img src="https://universocc.com.br/LogoUniverso.png?v=20260629" alt="Universo Cursos e Consultoria" width="250" style="display:block;width:250px;max-width:100%;height:auto;border:0;outline:none;text-decoration:none;color:#0d47a1;font-size:18px;font-weight:bold;">
          </td>
        </tr>
      </table>
      <h1 style="margin:0;color:#ffffff;font-size:24px;line-height:1.3;font-weight:bold;">Acesse sua conta</h1>
    </div>
    <div style="padding:36px 34px;">
      <p style="margin:0 0 18px;font-size:16px;line-height:1.7;color:#374151;">Ola,</p>
      <p style="margin:0 0 18px;font-size:16px;line-height:1.7;color:#374151;">Recebemos uma solicitacao de acesso para sua conta na plataforma da <strong>Universo Cursos e Consultoria</strong>.</p>
      <p style="margin:0 0 26px;font-size:16px;line-height:1.7;color:#374151;">Clique no botao abaixo para entrar com seguranca. Este link e temporario e pode ser usado apenas uma vez.</p>
      <div style="text-align:center;margin:34px 0;">
        <a href="{{ .ConfirmationURL }}" style="display:inline-block;background:#1565c0;color:#ffffff;text-decoration:none;padding:15px 30px;border-radius:8px;font-size:16px;font-weight:bold;">Entrar na plataforma</a>
      </div>
      <p style="margin:0 0 12px;font-size:14px;line-height:1.6;color:#6b7280;">Voce tambem pode usar este codigo de verificacao, quando solicitado:</p>
      <p style="margin:0 0 24px;text-align:center;font-size:28px;letter-spacing:4px;color:#0d47a1;font-weight:bold;">{{ .Token }}</p>
      <p style="margin:0 0 8px;font-size:14px;line-height:1.6;color:#6b7280;">Caso o botao nao funcione, copie e cole este link no navegador:</p>
      <p style="margin:0 0 28px;font-size:13px;line-height:1.6;word-break:break-word;"><a href="{{ .ConfirmationURL }}" style="color:#1565c0;">{{ .ConfirmationURL }}</a></p>
      <div style="background:#f8fafc;border-left:4px solid #1565c0;padding:18px;border-radius:7px;">
        <strong style="display:block;color:#0d47a1;font-size:15px;margin-bottom:8px;">Aviso de seguranca</strong>
        <p style="margin:0;color:#4b5563;font-size:14px;line-height:1.7;">Se voce nao solicitou este acesso, ignore este e-mail. Nunca compartilhe este codigo ou link com terceiros.</p>
      </div>
    </div>
    <div style="background:#f9fafb;padding:26px 30px;text-align:center;border-top:1px solid #e5e7eb;">
      <strong style="font-size:16px;color:#111827;">Universo Cursos e Consultoria</strong>
      <p style="margin:14px 0;color:#6b7280;font-size:13px;line-height:1.7;">Este e um e-mail automatico enviado pelo sistema da <strong>Universo Cursos e Consultoria</strong>. Por favor, <strong>nao responda esta mensagem</strong>, pois este endereco e utilizado exclusivamente para autenticacao e notificacoes da plataforma.</p>
      <p style="margin:18px 0 0;color:#6b7280;font-size:13px;"><a href="https://universocc.com.br" style="color:#1565c0;text-decoration:none;">https://universocc.com.br</a></p>
      <p style="margin:18px 0 0;font-size:12px;color:#9ca3af;line-height:1.6;">CNPJ: 13.278.137/0001-54<br>&copy; 2026 Universo Cursos e Consultoria. Todos os direitos reservados.</p>
    </div>
  </div>
</div>
```

## Change email address

Assunto:

```text
Confirme seu novo e-mail | Universo Cursos e Consultoria
```

HTML:

```html
<div style="margin:0;padding:32px 12px;background:#f3f6fb;font-family:Arial,Helvetica,sans-serif;color:#1f2937;">
  <div style="max-width:650px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:14px;overflow:hidden;">
    <div style="background:#0d47a1;padding:28px 28px 24px;text-align:center;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto 18px;background:#ffffff;border-radius:10px;">
        <tr>
          <td style="padding:10px 18px;text-align:center;">
            <img src="https://universocc.com.br/LogoUniverso.png?v=20260629" alt="Universo Cursos e Consultoria" width="250" style="display:block;width:250px;max-width:100%;height:auto;border:0;outline:none;text-decoration:none;color:#0d47a1;font-size:18px;font-weight:bold;">
          </td>
        </tr>
      </table>
      <h1 style="margin:0;color:#ffffff;font-size:24px;line-height:1.3;font-weight:bold;">Confirme o novo e-mail</h1>
    </div>
    <div style="padding:36px 34px;">
      <p style="margin:0 0 18px;font-size:16px;line-height:1.7;color:#374151;">Ola,</p>
      <p style="margin:0 0 18px;font-size:16px;line-height:1.7;color:#374151;">Recebemos uma solicitacao para alterar o e-mail da sua conta na <strong>Universo Cursos e Consultoria</strong>.</p>
      <p style="margin:0 0 26px;font-size:16px;line-height:1.7;color:#374151;">Para confirmar essa alteracao, clique no botao abaixo.</p>
      <div style="text-align:center;margin:34px 0;">
        <a href="{{ .ConfirmationURL }}" style="display:inline-block;background:#1565c0;color:#ffffff;text-decoration:none;padding:15px 30px;border-radius:8px;font-size:16px;font-weight:bold;">Confirmar novo e-mail</a>
      </div>
      <p style="margin:0 0 8px;font-size:14px;line-height:1.6;color:#6b7280;">Caso o botao nao funcione, copie e cole este link no navegador:</p>
      <p style="margin:0 0 28px;font-size:13px;line-height:1.6;word-break:break-word;"><a href="{{ .ConfirmationURL }}" style="color:#1565c0;">{{ .ConfirmationURL }}</a></p>
      <div style="background:#f8fafc;border-left:4px solid #1565c0;padding:18px;border-radius:7px;">
        <strong style="display:block;color:#0d47a1;font-size:15px;margin-bottom:8px;">Aviso de seguranca</strong>
        <p style="margin:0;color:#4b5563;font-size:14px;line-height:1.7;">Se voce nao solicitou esta alteracao, ignore este e-mail e revise a seguranca da sua conta.</p>
      </div>
    </div>
    <div style="background:#f9fafb;padding:26px 30px;text-align:center;border-top:1px solid #e5e7eb;">
      <strong style="font-size:16px;color:#111827;">Universo Cursos e Consultoria</strong>
      <p style="margin:14px 0;color:#6b7280;font-size:13px;line-height:1.7;">Este e um e-mail automatico enviado pelo sistema da <strong>Universo Cursos e Consultoria</strong>. Por favor, <strong>nao responda esta mensagem</strong>, pois este endereco e utilizado exclusivamente para autenticacao e notificacoes da plataforma.</p>
      <p style="margin:18px 0 0;color:#6b7280;font-size:13px;"><a href="https://universocc.com.br" style="color:#1565c0;text-decoration:none;">https://universocc.com.br</a></p>
      <p style="margin:18px 0 0;font-size:12px;color:#9ca3af;line-height:1.6;">CNPJ: 13.278.137/0001-54<br>&copy; 2026 Universo Cursos e Consultoria. Todos os direitos reservados.</p>
    </div>
  </div>
</div>
```

## Reset password

Assunto:

```text
Redefina sua senha | Universo Cursos e Consultoria
```

HTML:

```html
<div style="margin:0;padding:32px 12px;background:#f3f6fb;font-family:Arial,Helvetica,sans-serif;color:#1f2937;">
  <div style="max-width:650px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:14px;overflow:hidden;">
    <div style="background:#0d47a1;padding:28px 28px 24px;text-align:center;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto 18px;background:#ffffff;border-radius:10px;">
        <tr>
          <td style="padding:10px 18px;text-align:center;">
            <img src="https://universocc.com.br/LogoUniverso.png?v=20260629" alt="Universo Cursos e Consultoria" width="250" style="display:block;width:250px;max-width:100%;height:auto;border:0;outline:none;text-decoration:none;color:#0d47a1;font-size:18px;font-weight:bold;">
          </td>
        </tr>
      </table>
      <h1 style="margin:0;color:#ffffff;font-size:24px;line-height:1.3;font-weight:bold;">Redefina sua senha</h1>
    </div>
    <div style="padding:36px 34px;">
      <p style="margin:0 0 18px;font-size:16px;line-height:1.7;color:#374151;">Ola,</p>
      <p style="margin:0 0 18px;font-size:16px;line-height:1.7;color:#374151;">Recebemos uma solicitacao para redefinir a senha da sua conta na <strong>Universo Cursos e Consultoria</strong>.</p>
      <p style="margin:0 0 26px;font-size:16px;line-height:1.7;color:#374151;">Clique no botao abaixo para criar uma nova senha com seguranca.</p>
      <div style="text-align:center;margin:34px 0;">
        <a href="{{ .ConfirmationURL }}" style="display:inline-block;background:#1565c0;color:#ffffff;text-decoration:none;padding:15px 30px;border-radius:8px;font-size:16px;font-weight:bold;">Redefinir senha</a>
      </div>
      <p style="margin:0 0 8px;font-size:14px;line-height:1.6;color:#6b7280;">Caso o botao nao funcione, copie e cole este link no navegador:</p>
      <p style="margin:0 0 28px;font-size:13px;line-height:1.6;word-break:break-word;"><a href="{{ .ConfirmationURL }}" style="color:#1565c0;">{{ .ConfirmationURL }}</a></p>
      <div style="background:#f8fafc;border-left:4px solid #1565c0;padding:18px;border-radius:7px;">
        <strong style="display:block;color:#0d47a1;font-size:15px;margin-bottom:8px;">Aviso de seguranca</strong>
        <p style="margin:0;color:#4b5563;font-size:14px;line-height:1.7;">Se voce nao solicitou a redefinicao de senha, ignore este e-mail. Sua senha atual permanecera inalterada.</p>
      </div>
    </div>
    <div style="background:#f9fafb;padding:26px 30px;text-align:center;border-top:1px solid #e5e7eb;">
      <strong style="font-size:16px;color:#111827;">Universo Cursos e Consultoria</strong>
      <p style="margin:14px 0;color:#6b7280;font-size:13px;line-height:1.7;">Este e um e-mail automatico enviado pelo sistema da <strong>Universo Cursos e Consultoria</strong>. Por favor, <strong>nao responda esta mensagem</strong>, pois este endereco e utilizado exclusivamente para autenticacao e notificacoes da plataforma.</p>
      <p style="margin:18px 0 0;color:#6b7280;font-size:13px;"><a href="https://universocc.com.br" style="color:#1565c0;text-decoration:none;">https://universocc.com.br</a></p>
      <p style="margin:18px 0 0;font-size:12px;color:#9ca3af;line-height:1.6;">CNPJ: 13.278.137/0001-54<br>&copy; 2026 Universo Cursos e Consultoria. Todos os direitos reservados.</p>
    </div>
  </div>
</div>
```

## Reauthentication

Assunto:

```text
{{ .Token }} e seu codigo de verificacao
```

HTML:

```html
<div style="margin:0;padding:32px 12px;background:#f3f6fb;font-family:Arial,Helvetica,sans-serif;color:#1f2937;">
  <div style="max-width:650px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:14px;overflow:hidden;">
    <div style="background:#0d47a1;padding:28px 28px 24px;text-align:center;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto 18px;background:#ffffff;border-radius:10px;">
        <tr>
          <td style="padding:10px 18px;text-align:center;">
            <img src="https://universocc.com.br/LogoUniverso.png?v=20260629" alt="Universo Cursos e Consultoria" width="250" style="display:block;width:250px;max-width:100%;height:auto;border:0;outline:none;text-decoration:none;color:#0d47a1;font-size:18px;font-weight:bold;">
          </td>
        </tr>
      </table>
      <h1 style="margin:0;color:#ffffff;font-size:24px;line-height:1.3;font-weight:bold;">Codigo de verificacao</h1>
    </div>
    <div style="padding:36px 34px;">
      <p style="margin:0 0 18px;font-size:16px;line-height:1.7;color:#374151;">Ola,</p>
      <p style="margin:0 0 18px;font-size:16px;line-height:1.7;color:#374151;">Para continuar uma operacao sensivel na sua conta, use o codigo abaixo.</p>
      <p style="margin:24px 0;text-align:center;font-size:32px;letter-spacing:5px;color:#0d47a1;font-weight:bold;">{{ .Token }}</p>
      <div style="background:#f8fafc;border-left:4px solid #1565c0;padding:18px;border-radius:7px;">
        <strong style="display:block;color:#0d47a1;font-size:15px;margin-bottom:8px;">Aviso de seguranca</strong>
        <p style="margin:0;color:#4b5563;font-size:14px;line-height:1.7;">Nunca compartilhe este codigo. A Universo Cursos e Consultoria nunca solicitara sua senha por e-mail, telefone ou WhatsApp.</p>
      </div>
    </div>
    <div style="background:#f9fafb;padding:26px 30px;text-align:center;border-top:1px solid #e5e7eb;">
      <strong style="font-size:16px;color:#111827;">Universo Cursos e Consultoria</strong>
      <p style="margin:14px 0;color:#6b7280;font-size:13px;line-height:1.7;">Este e um e-mail automatico enviado pelo sistema da <strong>Universo Cursos e Consultoria</strong>. Por favor, <strong>nao responda esta mensagem</strong>, pois este endereco e utilizado exclusivamente para autenticacao e notificacoes da plataforma.</p>
      <p style="margin:18px 0 0;color:#6b7280;font-size:13px;"><a href="https://universocc.com.br" style="color:#1565c0;text-decoration:none;">https://universocc.com.br</a></p>
      <p style="margin:18px 0 0;font-size:12px;color:#9ca3af;line-height:1.6;">CNPJ: 13.278.137/0001-54<br>&copy; 2026 Universo Cursos e Consultoria. Todos os direitos reservados.</p>
    </div>
  </div>
</div>
```

## Password changed

Assunto:

```text
Sua senha foi alterada | Universo Cursos e Consultoria
```

HTML:

```html
<div style="margin:0;padding:32px 12px;background:#f3f6fb;font-family:Arial,Helvetica,sans-serif;color:#1f2937;">
  <div style="max-width:650px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:14px;overflow:hidden;">
    <div style="background:#0d47a1;padding:28px 28px 24px;text-align:center;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto 18px;background:#ffffff;border-radius:10px;">
        <tr>
          <td style="padding:10px 18px;text-align:center;">
            <img src="https://universocc.com.br/LogoUniverso.png?v=20260629" alt="Universo Cursos e Consultoria" width="250" style="display:block;width:250px;max-width:100%;height:auto;border:0;outline:none;text-decoration:none;color:#0d47a1;font-size:18px;font-weight:bold;">
          </td>
        </tr>
      </table>
      <h1 style="margin:0;color:#ffffff;font-size:24px;line-height:1.3;font-weight:bold;">Senha alterada</h1>
    </div>
    <div style="padding:36px 34px;">
      <p style="margin:0 0 18px;font-size:16px;line-height:1.7;color:#374151;">Ola,</p>
      <p style="margin:0 0 18px;font-size:16px;line-height:1.7;color:#374151;">A senha da sua conta na <strong>Universo Cursos e Consultoria</strong> foi alterada recentemente.</p>
      <div style="background:#fef2f2;border-left:4px solid #dc2626;padding:18px;border-radius:7px;">
        <strong style="display:block;color:#991b1b;font-size:15px;margin-bottom:8px;">Nao reconhece esta alteracao?</strong>
        <p style="margin:0;color:#4b5563;font-size:14px;line-height:1.7;">Redefina sua senha imediatamente e entre em contato com o suporte da plataforma.</p>
      </div>
    </div>
    <div style="background:#f9fafb;padding:26px 30px;text-align:center;border-top:1px solid #e5e7eb;">
      <strong style="font-size:16px;color:#111827;">Universo Cursos e Consultoria</strong>
      <p style="margin:14px 0;color:#6b7280;font-size:13px;line-height:1.7;">Este e um e-mail automatico enviado pelo sistema da <strong>Universo Cursos e Consultoria</strong>. Por favor, <strong>nao responda esta mensagem</strong>.</p>
      <p style="margin:18px 0 0;color:#6b7280;font-size:13px;"><a href="https://universocc.com.br" style="color:#1565c0;text-decoration:none;">https://universocc.com.br</a></p>
      <p style="margin:18px 0 0;font-size:12px;color:#9ca3af;line-height:1.6;">CNPJ: 13.278.137/0001-54<br>&copy; 2026 Universo Cursos e Consultoria. Todos os direitos reservados.</p>
    </div>
  </div>
</div>
```

## Email address changed

Assunto:

```text
Seu e-mail foi alterado | Universo Cursos e Consultoria
```

HTML:

```html
<div style="margin:0;padding:32px 12px;background:#f3f6fb;font-family:Arial,Helvetica,sans-serif;color:#1f2937;">
  <div style="max-width:650px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:14px;overflow:hidden;">
    <div style="background:#0d47a1;padding:28px 28px 24px;text-align:center;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto 18px;background:#ffffff;border-radius:10px;">
        <tr>
          <td style="padding:10px 18px;text-align:center;">
            <img src="https://universocc.com.br/LogoUniverso.png?v=20260629" alt="Universo Cursos e Consultoria" width="250" style="display:block;width:250px;max-width:100%;height:auto;border:0;outline:none;text-decoration:none;color:#0d47a1;font-size:18px;font-weight:bold;">
          </td>
        </tr>
      </table>
      <h1 style="margin:0;color:#ffffff;font-size:24px;line-height:1.3;font-weight:bold;">E-mail alterado</h1>
    </div>
    <div style="padding:36px 34px;">
      <p style="margin:0 0 18px;font-size:16px;line-height:1.7;color:#374151;">Ola,</p>
      <p style="margin:0 0 18px;font-size:16px;line-height:1.7;color:#374151;">O e-mail da sua conta na <strong>Universo Cursos e Consultoria</strong> foi alterado recentemente.</p>
      <div style="background:#fef2f2;border-left:4px solid #dc2626;padding:18px;border-radius:7px;">
        <strong style="display:block;color:#991b1b;font-size:15px;margin-bottom:8px;">Nao reconhece esta alteracao?</strong>
        <p style="margin:0;color:#4b5563;font-size:14px;line-height:1.7;">Entre em contato com o suporte da plataforma o quanto antes para proteger sua conta.</p>
      </div>
    </div>
    <div style="background:#f9fafb;padding:26px 30px;text-align:center;border-top:1px solid #e5e7eb;">
      <strong style="font-size:16px;color:#111827;">Universo Cursos e Consultoria</strong>
      <p style="margin:14px 0;color:#6b7280;font-size:13px;line-height:1.7;">Este e um e-mail automatico enviado pelo sistema da <strong>Universo Cursos e Consultoria</strong>. Por favor, <strong>nao responda esta mensagem</strong>.</p>
      <p style="margin:18px 0 0;color:#6b7280;font-size:13px;"><a href="https://universocc.com.br" style="color:#1565c0;text-decoration:none;">https://universocc.com.br</a></p>
      <p style="margin:18px 0 0;font-size:12px;color:#9ca3af;line-height:1.6;">CNPJ: 13.278.137/0001-54<br>&copy; 2026 Universo Cursos e Consultoria. Todos os direitos reservados.</p>
    </div>
  </div>
</div>
```
