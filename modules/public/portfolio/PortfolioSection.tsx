import React from 'react';
import { MapPin, CheckCircle2, Globe } from 'lucide-react';

const PortfolioSection: React.FC = () => {
  const cidadesSE = ["Barra dos Coqueiros", "Estância", "Canindé", "Pacatuba", "Japoatã", "Brejo Grande", "Neópolis", "Telha", "Santana do São Francisco", "São Francisco", "Feira Nova", "Cumbe"];
  const cidadesAL = ["Igreja Nova", "Porto Real do Colégio", "São Brás"];
  const cidadesBA = ["Coronel João Sá", "Pedro Alexandre"];

  const atuacoes = [
    "Conferências Municipais de Educação, Saúde e Assistência Social.",
    "Capacitação de servidores, professores e conselheiros tutelares.",
    "Assessoria em gestão e planejamento.",
    "Treinamentos e cursos temáticos para equipes públicas e privadas."
  ];

  return (
    <section id="trabalhos" className="py-24 bg-white">
      <div className="container mx-auto px-6">
        <div className="flex flex-col lg:flex-row gap-16 items-start">
          
          <div className="lg:w-1/2">
            <h2 className="text-4xl md:text-5xl font-black text-[#001a33] mb-6 uppercase tracking-tighter">
              Trabalhos <span className="text-blue-600">Realizados</span>
            </h2>
            <p className="text-slate-600 text-lg mb-10 leading-relaxed">
              A Universo já prestou serviços e consultorias a diversas Prefeituras e Secretarias Municipais com excelência técnica e compromisso ético.
            </p>

            <div className="space-y-8">
              {/* Sergipe */}
              <div>
                <div className="flex items-center gap-2 text-blue-700 font-black uppercase tracking-widest text-sm mb-4">
                  <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center"><MapPin size={18} /></div>
                  Sergipe
                </div>
                <div className="flex flex-wrap gap-2">
                  {cidadesSE.map(c => (
                    <span key={c} className="px-3 py-1 bg-slate-50 border border-slate-200 text-slate-600 rounded-full text-xs font-medium">{c}</span>
                  ))}
                </div>
              </div>

              {/* Alagoas & Bahia */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div>
                  <div className="flex items-center gap-2 text-blue-700 font-black uppercase tracking-widest text-sm mb-4">
                    <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center"><MapPin size={18} /></div>
                    Alagoas
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {cidadesAL.map(c => (
                      <span key={c} className="px-3 py-1 bg-slate-50 border border-slate-200 text-slate-600 rounded-full text-xs font-medium">{c}</span>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="flex items-center gap-2 text-blue-700 font-black uppercase tracking-widest text-sm mb-4">
                    <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center"><MapPin size={18} /></div>
                    Bahia
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {cidadesBA.map(c => (
                      <span key={c} className="px-3 py-1 bg-slate-50 border border-slate-200 text-slate-600 rounded-full text-xs font-medium">{c}</span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="lg:w-1/2 w-full">
            <div className="bg-[#001a33] rounded-[40px] p-10 text-white relative overflow-hidden shadow-2xl h-full">
              <div className="relative z-10">
                <h3 className="text-2xl font-bold uppercase mb-8 flex items-center gap-3">
                  <Globe className="text-blue-400" /> Atuação Destacada
                </h3>
                <div className="space-y-6">
                  {atuacoes.map((item, idx) => (
                    <div key={idx} className="flex gap-4 group">
                      <div className="mt-1"><CheckCircle2 className="text-blue-400" size={24} /></div>
                      <p className="text-blue-50 text-base leading-relaxed group-hover:text-white transition-colors">
                        {item}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
              <div className="absolute top-0 right-0 p-12 opacity-5">
                <Globe size={300} />
              </div>
            </div>
          </div>

        </div>
      </div>
    </section>
  );
};

export default PortfolioSection;