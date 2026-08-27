export type CarnesAlunosMode = 'individual' | 'batch' | 'custom';

export type BaneseDocumentType = 'carnet' | 'boletos';

export interface BaneseDocumentGroup {
  id: string;
  representativeReceivableId: string;
  receivableIds: string[];
  studentName: string;
  maskedCpf: string;
  enrollmentId: string;
  enrollmentCode: string;
  courseId: string;
  courseName: string;
  classId: string;
  className: string;
  installmentCount: number;
  totalAmount: number;
  firstDueDate: string;
  lastDueDate: string;
  documentType: BaneseDocumentType;
}

export interface BaneseDocumentGroupsRequest {
  poloId: string;
  search?: string;
  courseId?: string;
  classId?: string;
  page?: number;
  pageSize?: number;
}

export interface BaneseDocumentGroupsResponse {
  groups: BaneseDocumentGroup[];
  total: number;
  page: number;
  pageSize: number;
  filters: {
    courses: Array<{ id: string; name: string }>;
    classes: Array<{ id: string; name: string; courseId: string }>;
  };
}

export interface BaneseDocumentRequest {
  groupId: string;
  receivableId: string;
  functionName: 'banese-carnet-document' | 'banese-boleto-document';
}

export interface BaneseDocumentRequestCounts {
  carnetRequests: number;
  boletoRequests: number;
  totalRequests: number;
  estimatedPages: number;
}

export interface BaneseDocumentProgress {
  current: number;
  total: number;
}

export interface PreparedBaneseDocument {
  blob: Blob;
  fileName: string;
  groups: BaneseDocumentGroup[];
  requestCount: number;
}
