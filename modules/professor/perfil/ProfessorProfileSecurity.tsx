import React from 'react';

interface Props {
  email?: string;
  password: string;
  confirmation: string;
  busy: boolean;
  message: { tone: 'success' | 'error'; text: string } | null;
  onPassword: (value: string) => void;
  onConfirmation: (value: string) => void;
  onSubmit: (event: React.FormEvent) => void;
}
const ProfessorProfileSecurity: React.FC<Props> = ({ email, password, confirmation, busy, message, onPassword, onConfirmation, onSubmit }) => (
  <section className="grid gap-4 pt-5 lg:grid-cols-2">
    <div className="professor-card">
      <h3>E-mail de acesso</h3>
      <p className="mt-2 break-words">{email || 'Não informado'}</p>
      <p className="mt-3 professor-help">Este é o e-mail usado para entrar no portal institucional. Alterações de e-mail devem ser solicitadas à gestão.</p>
    </div>
    <form className="professor-card" onSubmit={onSubmit}>
      <div className="professor-heading"><div><h3>Alterar senha</h3><p>A nova senha valerá no próximo login.</p></div></div>
      <fieldset disabled={busy} className="grid gap-4 sm:grid-cols-2">
        <div className="professor-field">
          <label htmlFor="professor-new-password">Nova senha</label>
          <input
            id="professor-new-password" type="password" autoComplete="new-password"
            value={password} onChange={(event) => onPassword(event.target.value)}
            className="professor-input" placeholder="Mínimo 8 caracteres"
          />
        </div>
        <div className="professor-field">
          <label htmlFor="professor-confirm-password">Confirmar senha</label>
          <input
            id="professor-confirm-password" type="password" autoComplete="new-password"
            value={confirmation} onChange={(event) => onConfirmation(event.target.value)}
            className="professor-input" placeholder="Repita a senha"
          />
        </div>
      </fieldset>
      <p className="mt-3 professor-help">Use no mínimo 8 caracteres, com letra maiúscula, minúscula e número.</p>
      {message && (
        <p
          role={message.tone === 'error' ? 'alert' : 'status'}
          className={`mt-4 rounded-lg border p-3 ${message.tone === 'error'
            ? 'border-red-200 bg-red-50 text-red-800' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`}
        >{message.text}</p>
      )}
      <div className="mt-4 flex justify-end">
        <button type="submit" disabled={busy} className="professor-button professor-button--primary">
          {busy ? 'Alterando…' : 'Alterar senha'}
        </button>
      </div>
    </form>
  </section>
);
export default ProfessorProfileSecurity;
