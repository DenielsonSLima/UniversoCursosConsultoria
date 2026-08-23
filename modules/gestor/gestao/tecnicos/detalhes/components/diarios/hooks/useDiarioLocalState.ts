import { useEffect, useMemo, useState } from 'react';
import type { AttendanceMap, AttendanceStatus, GradesMap } from '../diario-classe.types';
import {
  buildAttendanceMap,
  buildGradesMap,
  buildPraticasMap,
} from '../diario-classe.utils';

interface UseDiarioLocalStateInput {
  students: Parameters<typeof buildAttendanceMap>[0];
  aulas: Parameters<typeof buildAttendanceMap>[1];
  dbAttendance: Parameters<typeof buildAttendanceMap>[2];
  dbGrades: Parameters<typeof buildGradesMap>[2];
  dbPraticas: Parameters<typeof buildPraticasMap>[1];
  dbObservacoes: string;
}

export const useDiarioLocalState = ({
  students,
  aulas,
  dbAttendance,
  dbGrades,
  dbPraticas,
  dbObservacoes,
}: UseDiarioLocalStateInput) => {
  const attendanceMap = useMemo(
    () => buildAttendanceMap(students, aulas, dbAttendance),
    [students, aulas, dbAttendance],
  );
  const gradesMap = useMemo(
    () => buildGradesMap(students, aulas, dbGrades),
    [students, aulas, dbGrades],
  );
  const praticasMap = useMemo(
    () => buildPraticasMap(aulas, dbPraticas),
    [aulas, dbPraticas],
  );
  const [localAttendance, setLocalAttendance] = useState<AttendanceMap>({});
  const [localGrades, setLocalGrades] = useState<GradesMap>({});
  const [localPraticas, setLocalPraticas] = useState<Record<string, string>>({});
  const [localTitulos, setLocalTitulos] = useState<Record<string, string>>({});
  const [localObservacoes, setLocalObservacoes] = useState('');

  useEffect(() => setLocalAttendance({}), [dbAttendance]);
  useEffect(() => {
    if (Object.keys(gradesMap).length > 0) setLocalGrades({ ...gradesMap });
  }, [gradesMap]);
  useEffect(() => setLocalPraticas(praticasMap), [praticasMap]);
  useEffect(() => {
    setLocalTitulos(Object.fromEntries(aulas.map((aula) => [aula.id, aula.titulo])));
  }, [aulas]);
  useEffect(() => setLocalObservacoes(dbObservacoes), [dbObservacoes]);

  const effectiveAttendanceMap = useMemo(() => {
    if (Object.keys(localAttendance).length === 0) return attendanceMap;
    const merged: AttendanceMap = { ...attendanceMap };
    Object.entries(localAttendance).forEach(([studentId, classMap]) => {
      merged[studentId] = {
        ...(merged[studentId] || {}),
        ...(classMap as Record<string, AttendanceStatus>),
      };
    });
    return merged;
  }, [attendanceMap, localAttendance]);

  return {
    attendanceMap,
    effectiveAttendanceMap,
    gradesMap,
    praticasMap,
    setLocalAttendance,
    localGrades,
    setLocalGrades,
    localPraticas,
    setLocalPraticas,
    localTitulos,
    setLocalTitulos,
    localObservacoes,
    setLocalObservacoes,
  };
};
