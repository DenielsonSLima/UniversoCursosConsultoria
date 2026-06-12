import React from 'react';
import { Phone, MapPin, Send } from 'lucide-react';

const ContactSection: React.FC = () => {
  return (
    <div className="py-24 relative overflow-hidden">
      {/* Background com Imagem e Degradê Azul */}
      <div className="absolute inset-0 z-0">
        <img 
          src="https://images.unsplash.com/photo-1523240795612-9a054b0db644?auto=format&fit=crop&q=80&w=1920" 
          alt="Contato Background" 
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-br from-[#4169E1]/90 via-[#002b55]/95 to-[#001a33]"></div>
      </div>

      <div className="container mx-auto px-6 relative z-10">
        <div className="text-center mb-16">
          <h2 className="text-4xl md:text-5xl font-black text-white mb-4 uppercase tracking-tighter">
            Fale <span className="text-blue-400">Conosco</span>
          </h2>
          <div className="w-24 h-1.5 bg-blue-500 mx-auto rounded-full"></div>
        </div>

        <div className="bg-white/5 backdrop-blur-xl rounded-[40px] overflow-hidden border border-white/10 shadow-2xl flex flex-col md:flex-row">
          <div className="md:w-1/3 bg-gradient-to-b from-blue-600/40 to-[#001a33]/80 p-12 text-white border-r border-white/5">
            <h3 className="text-2xl font-bold mb-8 uppercase tracking-tight">Canais de Atendimento</h3>
            <div className="space-y-8">
              <a 
                href="https://wa.me/557996028316" 
                target="_blank" 
                rel="noopener noreferrer" 
                className="flex items-start space-x-4 group cursor-pointer"
              >
                <div className="p-3 bg-blue-500/20 rounded-xl group-hover:bg-blue-500/40 transition-colors">
                  <Phone className="text-blue-300" />
                </div>
                <div>
                  <p className="font-bold text-sm uppercase text-blue-200">Telefone / WhatsApp</p>
                  <p className="text-white text-base">(79) 99602-8316</p>
                </div>
              </a>
              <div className="flex items-start space-x-4 group">
                <div className="p-3 bg-blue-500/20 rounded-xl group-hover:bg-blue-500/40 transition-colors">
                  <MapPin className="text-blue-300" />
                </div>
                <div>
                  <p className="font-bold text-sm uppercase text-blue-200">Sede Principal</p>
                  <p className="text-white text-base">Sertão Sergipano - SE</p>
                </div>
              </div>
            </div>
          </div>
          
          <div className="md:w-2/3 p-12 bg-white/10">
            <form className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-xs font-bold text-blue-200 uppercase mb-2 tracking-widest">Nome Completo</label>
                  <input 
                    type="text" 
                    className="w-full px-4 py-4 rounded-2xl bg-white/5 border border-white/10 text-white placeholder-white/30 focus:ring-2 focus:ring-blue-500 focus:bg-white/10 outline-none transition-all" 
                    placeholder="Seu nome" 
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-blue-200 uppercase mb-2 tracking-widest">E-mail</label>
                  <input 
                    type="email" 
                    className="w-full px-4 py-4 rounded-2xl bg-white/5 border border-white/10 text-white placeholder-white/30 focus:ring-2 focus:ring-blue-500 focus:bg-white/10 outline-none transition-all" 
                    placeholder="seu@email.com" 
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-blue-200 uppercase mb-2 tracking-widest">Assunto do Contato</label>
                <select className="w-full px-4 py-4 rounded-2xl bg-white/5 border border-white/10 text-white focus:ring-2 focus:ring-blue-500 focus:bg-white/10 outline-none transition-all appearance-none cursor-pointer">
                  <option className="bg-[#001a33]">Consultoria Institucional</option>
                  <option className="bg-[#001a33]">Interesse em Cursos</option>
                  <option className="bg-[#001a33]">Parcerias</option>
                  <option className="bg-[#001a33]">Trabalhe Conosco</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-blue-200 uppercase mb-2 tracking-widest">Sua Mensagem</label>
                <textarea 
                  rows={4} 
                  className="w-full px-4 py-4 rounded-2xl bg-white/5 border border-white/10 text-white placeholder-white/30 focus:ring-2 focus:ring-blue-500 focus:bg-white/10 outline-none transition-all" 
                  placeholder="Como podemos ajudar a transformar sua instituição?"
                ></textarea>
              </div>
              <button className="w-full bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white font-black py-5 rounded-2xl transition-all shadow-xl shadow-blue-900/40 uppercase tracking-[0.2em] flex items-center justify-center gap-3 group">
                <span>Enviar Solicitação</span>
                <Send size={18} className="group-hover:translate-x-1 transition-transform" />
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ContactSection;