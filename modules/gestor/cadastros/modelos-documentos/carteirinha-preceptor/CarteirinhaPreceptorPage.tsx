import { BadgeCheck } from 'lucide-react';
import { CarteirinhaPreceptorTemplateEditor } from './components/CarteirinhaPreceptorTemplateEditor';

const CarteirinhaPreceptorPage = () => (
  <div className="animate-fadeIn">
    <div className="mb-7 flex flex-col gap-4 rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm md:flex-row md:items-end md:justify-between">
      <div>
        <div className="mb-2 flex items-center gap-2 text-cyan-700">
          <BadgeCheck size={18} />
          <span className="text-[10px] font-black uppercase tracking-[0.2em]">Modelos de documentos</span>
        </div>
        <h2 className="text-2xl font-black uppercase tracking-tight text-[#001a33]">Carteirinha de preceptor</h2>
        <p className="mt-1 max-w-2xl text-sm font-medium text-slate-500">Credencial institucional própria para professores, separada da carteirinha estudantil.</p>
      </div>
      <span className="self-start rounded-full border border-cyan-100 bg-cyan-50 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-cyan-800 md:self-auto">Professor autorizado</span>
    </div>
    <CarteirinhaPreceptorTemplateEditor />
  </div>
);

export default CarteirinhaPreceptorPage;
