import React from 'react';
import { CheckCircle2, Loader2, LockKeyhole, ShieldCheck } from 'lucide-react';

type AccessCheckingScreenProps = {
  portal?: 'Aluno' | 'Gestor' | 'Professor';
};

const AccessCheckingScreen: React.FC<AccessCheckingScreenProps> = ({ portal = 'Gestor' }) => {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#f4f7fb] px-4 py-10 text-slate-900">
      <div className="absolute inset-0 bg-[linear-gradient(120deg,#f8fbff_0%,#edf4ff_44%,#f7fafc_100%)]" />
      <div className="absolute inset-0 opacity-[0.18] [background-image:linear-gradient(#1d4ed8_1px,transparent_1px),linear-gradient(90deg,#1d4ed8_1px,transparent_1px)] [background-size:56px_56px]" />
      <div className="absolute -left-24 top-0 h-full w-1/3 rotate-6 bg-[#001a33] opacity-[0.04]" />
      <div className="absolute -right-32 bottom-0 h-full w-1/3 rotate-6 bg-[#4169E1] opacity-[0.06]" />

      <section className="relative w-full max-w-[440px] overflow-hidden rounded-[28px] border border-white/80 bg-white/90 shadow-[0_28px_80px_rgba(15,23,42,0.14)] backdrop-blur-xl">
        <div className="h-1.5 bg-[linear-gradient(90deg,#001a33,#4169E1,#22c55e)]" />

        <div className="p-7 sm:p-8">
          <div className="mb-8 flex items-center justify-between gap-4">
            <div className="rounded-2xl border border-slate-100 bg-white px-4 py-3 shadow-sm">
              <img
                src="/LogoUniverso.png"
                alt="Universo Cursos e Consultoria"
                className="h-10 w-40 object-contain"
              />
            </div>
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-blue-700 ring-1 ring-blue-100">
              <ShieldCheck size={22} />
            </div>
          </div>

          <div className="mb-7">
            <p className="mb-3 inline-flex items-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-[10px] font-black uppercase tracking-[0.22em] text-blue-700">
              <LockKeyhole size={12} />
              Portal {portal}
            </p>
            <h1 className="text-2xl font-black tracking-tight text-[#001a33] sm:text-3xl">
              Validando seu acesso
            </h1>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              Estamos conferindo sua sessão e preparando o ambiente com segurança.
            </p>
          </div>

          <div className="rounded-2xl border border-slate-100 bg-slate-50/80 p-4">
            <div className="flex items-center gap-3">
              <div className="relative flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-blue-700 shadow-sm ring-1 ring-slate-100">
                <Loader2 size={23} className="animate-spin" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <span className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">
                    Verificação
                  </span>
                  <CheckCircle2 size={16} className="text-emerald-500" />
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-200">
                  <div className="h-full w-2/3 animate-pulse rounded-full bg-[linear-gradient(90deg,#4169E1,#22c55e)]" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
};

export default AccessCheckingScreen;
