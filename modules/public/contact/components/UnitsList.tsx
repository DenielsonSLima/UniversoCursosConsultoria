import React from 'react';
import { MapPin, Phone, Clock, MessageCircle } from 'lucide-react';

const unitsData = [
  {
    name: "Unidade Japoatã (Matriz)",
    address: [
      "Rua V, nº 56 - Loteamento São José",
      "CEP 49950-000",
      "Japoatã - SE"
    ],
    phone: [
      "(79) 99602-8316",
      "(79) 99861-7614"
    ],
    whatsapp: "5579996028316",
    hours: [
      { day: "Segunda a Sexta", time: "08:00 às 17:00" },
      { day: "Sábado", time: "08:00 às 17:00" }
    ],
    image: "/unnamed-2.jpg",
    mapsUrl: "https://www.google.com/maps/search/?api=1&query=Rua+V%2C+56%2C+Loteamento+S%C3%A3o+Jos%C3%A9%2C+Japoat%C3%A3+-+SE%2C+49950-000"
  },
  {
    name: "Unidade Aquidabã",
    address: [
      "Rua Eduardo Chaves, nº 109, Centro (Vizinho ao Fórum)",
      "CEP 49945-000",
      "Aquidabã - SE"
    ],
    phone: [
      "(79) 99602-8316",
      "(79) 99861-7614"
    ],
    whatsapp: "5579996028316",
    hours: [
      { day: "Segunda a Sexta", time: "08:00 às 17:00" },
      { day: "Sábado", time: "08:00 às 17:00" }
    ],
    image: null,
    mapsUrl: "https://www.google.com/maps/search/?api=1&query=Rua+Eduardo+Chaves%2C+109%2C+Centro%2C+Aquidab%C3%A3+-+SE%2C+49945-000"
  },
  {
    name: "Unidade Porto da Folha",
    address: [
      "Rua Major João Gonçalves, nº 1783, Centro (Vizinho à Delegacia)",
      "CEP 49800-000",
      "Porto da Folha - SE"
    ],
    phone: [
      "(79) 99602-8316",
      "(79) 99861-7614"
    ],
    whatsapp: "5579996028316",
    hours: [
      { day: "Segunda a Sexta", time: "08:00 às 17:00" },
      { day: "Sábado", time: "08:00 às 17:00" }
    ],
    image: null,
    mapsUrl: "https://www.google.com/maps/search/?api=1&query=Rua+Major+Jo%C3%A3o+Gon%C3%A7alves%2C+1783%2C+Centro%2C+Porto+da+Folha+-+SE%2C+49800-000"
  }
];

const UnitsList: React.FC = () => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
      {unitsData.map((unit, index) => (
        <div 
          key={index} 
          className="bg-white rounded-[32px] overflow-hidden border border-slate-100 shadow-2xl hover:shadow-blue-900/10 transition-all group"
        >
          {unit.image ? (
            <div className="h-48 overflow-hidden relative">
              <img 
                src={unit.image} 
                alt={unit.name} 
                className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent"></div>
              <div className="absolute bottom-4 left-6">
                <h3 className="text-white font-black text-xl uppercase tracking-tighter">
                  {unit.name}
                </h3>
              </div>
            </div>
          ) : (
            <a 
              href={unit.mapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="h-48 block overflow-hidden relative group/map cursor-pointer"
            >
              <iframe 
                src={`https://maps.google.com/maps?q=${encodeURIComponent(unit.address.join(', '))}&t=&z=15&ie=UTF8&iwloc=&output=embed`}
                width="100%" 
                height="100%" 
                className="border-0 pointer-events-none scale-105 group-hover/map:scale-110 transition-transform duration-700"
                loading="lazy"
                title={`Mapa ${unit.name}`}
              ></iframe>
              <div className="absolute inset-0 bg-black/20 group-hover/map:bg-black/10 transition-colors pointer-events-none"></div>
              <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-transparent to-transparent pointer-events-none"></div>
              <div className="absolute bottom-4 left-6 pointer-events-none">
                <h3 className="text-white font-black text-xl uppercase tracking-tighter">
                  {unit.name}
                </h3>
                <p className="text-blue-400 text-[10px] font-bold uppercase tracking-wider mt-0.5">Clique para ver no Google Maps</p>
              </div>
            </a>
          )}
          
          <div className="p-8 space-y-6">
            {/* Endereço */}
            <a 
              href={unit.mapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex gap-4 hover:bg-slate-50 p-2 -mx-2 rounded-2xl transition-colors group/address cursor-pointer block text-left"
            >
              <div className="p-2 bg-blue-50 text-blue-600 rounded-xl h-fit group-hover/address:bg-blue-600 group-hover/address:text-white transition-colors">
                <MapPin size={18} />
              </div>
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1 flex items-center gap-1">
                  Localização
                  <span className="text-blue-500 font-bold group-hover/address:text-blue-600 group-hover/address:underline text-[9px] uppercase tracking-normal normal-case ml-1">(Ver no Mapa)</span>
                </p>
                <div className="space-y-0.5">
                  {unit.address.map((line, idx) => (
                    <p key={idx} className="text-slate-700 font-medium leading-snug group-hover/address:text-blue-900 transition-colors">{line}</p>
                  ))}
                </div>
              </div>
            </a>

            {/* Contato */}
            <div className="flex gap-4">
              <div className="p-2 bg-blue-50 text-blue-600 rounded-xl h-fit">
                <Phone size={18} />
              </div>
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Telefone</p>
                {unit.phone.map((p, idx) => (
                  <p key={idx} className="text-slate-700 font-bold">{p}</p>
                ))}
              </div>
            </div>

            {/* Horários */}
            <div className="flex gap-4">
              <div className="p-2 bg-blue-50 text-blue-600 rounded-xl h-fit">
                <Clock size={18} />
              </div>
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Funcionamento</p>
                {unit.hours.map((h, i) => (
                  <p key={i} className="text-slate-700 text-sm">
                    <span className="font-semibold text-blue-900">{h.day}:</span> {h.time}
                  </p>
                ))}
              </div>
            </div>

            {/* Ação */}
            <a 
              href={`https://wa.me/${unit.whatsapp}`}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full mt-4 flex items-center justify-center gap-2 bg-[#FFFFFF] border-2 border-blue-600 text-blue-600 hover:bg-blue-600 hover:text-white py-4 rounded-2xl font-black uppercase tracking-widest text-xs transition-all"
            >
              <MessageCircle size={16} />
              Falar com esta unidade
            </a>
          </div>
        </div>
      ))}
    </div>
  );
};

export default UnitsList;