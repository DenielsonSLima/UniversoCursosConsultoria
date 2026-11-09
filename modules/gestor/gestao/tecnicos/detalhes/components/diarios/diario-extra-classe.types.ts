export interface DiarioExtraClasseActivity {
  id: string;
  titulo: string;
  cargaHoraria: number;
  /** Data acadêmica efetiva devolvida pelo backend, sem conversão no cliente. */
  dataSource: string;
}

/** Crédito acadêmico separado da chamada presencial e congelado na assinatura. */
export interface DiarioExtraClassCredit {
  schemaVersion: 1;
  activities: DiarioExtraClasseActivity[];
  eligibleActivityIdsByStudent: Record<string, string[]>;
}
