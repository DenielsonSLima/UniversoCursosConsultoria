import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { HardDrive, Search, Save, RefreshCcw } from 'lucide-react';
import { bibliotecaService } from '../biblioteca.service';
import { bibliotecaQueryKeys } from '../biblioteca.queryKeys';
import { TeacherStorageQuota } from '../biblioteca.types';

const BYTES_PER_GB = 1024 * 1024 * 1024;

const formatBytes = (bytes: number) => {
  const normalized = Math.max(0, Number(bytes) || 0);
  if (normalized >= BYTES_PER_GB) {
    return `${(normalized / BYTES_PER_GB).toFixed(2)} GB`;
  }
  if (normalized >= 1024 * 1024) {
    return `${(normalized / (1024 * 1024)).toFixed(2)} MB`;
  }
  return `${Math.round(normalized / 1024)} KB`;
};

const toFixedTwo = (value: number) => {
  return Number.isFinite(value) ? value.toFixed(2) : '0.00';
};

const getQuotaPercent = (usedBytes: number, quotaBytes: number) => {
  if (quotaBytes <= 0) return 0;
  return Math.min(100, Math.max(0, (usedBytes / quotaBytes) * 100));
};

const TeacherStorageConfig: React.FC = () => {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [quotaInputs, setQuotaInputs] = useState<Record<string, string>>({});

  const { data: teachers = [], isLoading } = useQuery({
    queryKey: bibliotecaQueryKeys.teacherStorageConfigs,
    queryFn: () => bibliotecaService.getTeacherStorageConfigs(),
  });

  const saveMutation = useMutation({
    mutationFn: ({ teacherId, storageQuotaGb }: { teacherId: string; storageQuotaGb: number }) =>
      bibliotecaService.updateTeacherStorageQuota(teacherId, storageQuotaGb),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: bibliotecaQueryKeys.teacherStorageConfigs });
      queryClient.invalidateQueries({ queryKey: bibliotecaQueryKeys.teacherRepositories });
    },
  });

  const filteredTeachers = teachers.filter((teacher) =>
    teacher.teacherName.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleQuotaInputChange = (teacherId: string, value: string) => {
    setQuotaInputs((prev) => ({
      ...prev,
      [teacherId]: value,
    }));
  };

  const handleSave = async (teacher: TeacherStorageQuota) => {
    const nextValue = quotaInputs[teacher.teacherId]?.trim();
    const parsedValue = Number(nextValue || teacher.storageQuotaGb);

    if (!Number.isFinite(parsedValue) || parsedValue <= 0) {
      alert('Informe uma quota válida maior que 0.');
      return;
    }

    try {
      await saveMutation.mutateAsync({
        teacherId: teacher.teacherId,
        storageQuotaGb: parsedValue,
      });
      alert('Quota atualizada com sucesso.');
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Não foi possível salvar a quota.');
    }
  };

  const getInputValue = (teacher: TeacherStorageQuota) => {
    if (quotaInputs[teacher.teacherId] !== undefined) return quotaInputs[teacher.teacherId];
    return toFixedTwo(teacher.storageQuotaGb);
  };

  const canSave = !saveMutation.isPending;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-black text-[#001a33] uppercase tracking-tight flex items-center gap-2">
            <HardDrive size={18} className="text-emerald-600" />
            Configuração de Quota por Professor
          </h3>
          <p className="text-xs text-slate-500 font-bold uppercase mt-1">
            Defina limite em GB para armazenamento de documentos por professor no módulo de biblioteca.
          </p>
        </div>
        <div className="flex gap-2 items-center">
          <button
            type="button"
            onClick={() =>
              queryClient.invalidateQueries({ queryKey: bibliotecaQueryKeys.teacherStorageConfigs })
            }
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-[10px] font-black uppercase tracking-wider text-slate-600 hover:bg-white"
          >
            <RefreshCcw size={12} />
            Recarregar
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2 px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs max-w-md">
        <Search size={14} className="text-slate-400" />
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Buscar professor"
          className="w-full bg-transparent border-none outline-none text-slate-700 font-medium"
        />
      </div>

      {isLoading ? (
        <div className="py-14 text-center text-slate-400 text-xs font-bold uppercase animate-pulse">
          Carregando configuração de quotas...
        </div>
      ) : filteredTeachers.length === 0 ? (
        <div className="py-12 text-center text-slate-400 text-xs font-bold uppercase border border-dashed border-slate-200 rounded-[2rem]">
          Nenhum professor encontrado.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-100">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 text-slate-400 font-black uppercase tracking-wider text-[9px] border-b border-slate-100">
                <th className="p-4">Professor</th>
                <th className="p-4 text-right">Quota (GB)</th>
                <th className="p-4">Uso Atual</th>
                <th className="p-4 text-right">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredTeachers.map((teacher) => {
                const quotaBytes = teacher.storageQuotaGb * BYTES_PER_GB;
                const usedBytes = teacher.storageUsedBytes || 0;
                const quotaPercent = getQuotaPercent(usedBytes, quotaBytes);
                const percentColor =
                  quotaPercent >= 90
                    ? 'bg-rose-500'
                    : quotaPercent >= 75
                    ? 'bg-amber-500'
                    : 'bg-emerald-500';

                return (
                  <tr key={teacher.teacherId} className="hover:bg-slate-50/60">
                    <td className="p-4">
                      <p className="font-bold text-[#001a33]">{teacher.teacherName}</p>
                      <p className="text-[9px] text-slate-400 font-bold uppercase mt-1">{teacher.specialty}</p>
                    </td>
                    <td className="p-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <input
                          type="number"
                          min="0.1"
                          step="0.1"
                          value={getInputValue(teacher)}
                          onChange={(e) => handleQuotaInputChange(teacher.teacherId, e.target.value)}
                          className="w-24 text-right px-3 py-2 border border-slate-200 rounded-lg outline-none focus:border-blue-500 text-slate-700"
                        />
                        <span className="text-slate-500 font-black uppercase">GB</span>
                      </div>
                    </td>
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        <div className="w-full max-w-[220px] h-2 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full ${percentColor} transition-all`}
                            style={{ width: `${quotaPercent}%` }}
                          />
                        </div>
                        <span className="text-[10px] text-slate-500 font-bold uppercase shrink-0">
                          {formatBytes(usedBytes)} / {toFixedTwo(teacher.storageQuotaGb)} GB
                        </span>
                      </div>
                    </td>
                    <td className="p-4 text-right">
                      <button
                        type="button"
                        onClick={() => handleSave(teacher)}
                        disabled={!canSave}
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-[10px] font-black uppercase tracking-wider border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <Save size={12} />
                        Salvar
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default TeacherStorageConfig;
