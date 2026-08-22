import React from 'react';

interface ResponsavelProfilePanelProps {
  nome: string;
  email: string;
}

const ResponsavelProfilePanel: React.FC<ResponsavelProfilePanelProps> = ({ nome, email }) => (
  <section className="max-w-2xl rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-purple-600">Perfil do portal</p>
    <h1 className="mt-1 text-2xl font-black text-[#001a33]">{nome}</h1>
    <dl className="mt-6 grid gap-3 sm:grid-cols-2">
      <div className="rounded-2xl bg-slate-50 p-4">
        <dt className="text-[9px] font-black uppercase tracking-wider text-slate-400">E-mail</dt>
        <dd className="mt-1 break-all text-sm font-bold text-slate-700">{email}</dd>
      </div>
      <div className="rounded-2xl bg-slate-50 p-4">
        <dt className="text-[9px] font-black uppercase tracking-wider text-slate-400">Acesso</dt>
        <dd className="mt-1 text-sm font-bold text-slate-700">Responsável legal</dd>
      </div>
    </dl>
  </section>
);

export default ResponsavelProfilePanel;
