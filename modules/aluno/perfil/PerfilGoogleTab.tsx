import React from 'react';
import { ShieldCheck } from 'lucide-react';
import GoogleIdentityCard from '../../shared/auth/GoogleIdentityCard';

const PerfilGoogleTab: React.FC = () => (
  <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_0.8fr]">
    <div className="rounded-[2.5rem] border border-slate-100 bg-white p-6 shadow-sm md:p-8">
      <div className="mb-6 flex items-center gap-2 border-b border-slate-100 pb-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
          <ShieldCheck size={16} />
        </div>
        <h3 className="text-base font-bold uppercase tracking-tight text-[#001a33]">Segurança da conta</h3>
      </div>
      <GoogleIdentityCard tone="blue" />
    </div>

    <div className="rounded-[2.5rem] border border-blue-100 bg-blue-50 p-6">
      <h4 className="text-sm font-black uppercase tracking-tight text-[#001a33]">Como funciona</h4>
      <p className="mt-3 text-xs font-semibold leading-relaxed text-blue-900">
        Depois de vincular o Google, você pode entrar com e-mail e senha ou usando sua conta Google. Se quiser voltar ao acesso por senha, use a opção de desvincular Google.
      </p>
    </div>
  </div>
);

export default PerfilGoogleTab;
