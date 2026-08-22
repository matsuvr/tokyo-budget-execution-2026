export type SourceStatus =
  | "downloaded"
  | "pending-upstream-503"
  | "reference-only";

export interface SourceEntry {
  id: string;
  title: string;
  category:
    | "budget"
    | "settlement"
    | "public-expenditure"
    | "subsidy"
    | "catalog"
    | "document"
    | "reference";
  fiscalYears: number[];
  sourceUrl: string;
  localPath?: string;
  status: SourceStatus;
  bytes?: number;
  sha256?: string;
  retrievedAt?: string;
  notes?: string;
}

export interface DataManifest {
  generatedAt: string;
  packageName: string;
  packageVersion: string;
  timezone: "Asia/Tokyo";
  requestedFiscalYears: [2025, 2026];
  sources: SourceEntry[];
}

export interface PublicExpenditureRecord {
  fiscalYear: 2025 | 2026;
  sourceMonth: string;
  sourceFile: string;
  sourceRow: number;
  paidAt: string | null;
  bureau: string;
  department: string;
  section: string;
  account: string;
  chapter: string;
  item: string;
  object: string;
  expenseSection: string;
  expenseSubsection: string | null;
  description: string;
  amountYen: number;
  isClosingPeriod: boolean;
}

export interface PayrollRecord {
  fiscalYear: 2025 | 2026;
  sourceFile: string;
  paidMonth: string;
  category: string;
  amountYen: number;
}

export interface ClosingEstimateRecord {
  metric: "revenue" | "expenditure" | "formalBalance" | "carryoverResources" | "realBalance";
  label: string;
  fiscalYear2025HundredMillionYen: number;
  fiscalYear2024HundredMillionYen: number;
  changeHundredMillionYen: number | null;
  changePercent: number | null;
}

export interface ClosingEstimate {
  fiscalYear: 2025;
  status: "preliminary";
  publicationDate: string;
  unit: "億円";
  source: {
    title: string;
    url: string;
    localPath: string;
    page: number;
  };
  records: ClosingEstimateRecord[];
  cautions: string[];
}

export interface SubsidyRecord {
  fiscalYear: 2025 | 2026;
  bureauNo: string;
  bureau: string;
  policyAreaNo: string;
  policyArea: string;
  programName: string;
  subsidyName: string;
  summary: string;
  recipientNo: string;
  recipient: string;
  budgetThousandYen: number | null;
  department: string;
  contact: string;
  url: string;
  sourceFile: string;
  sourceRow: number;
}

export interface R2ObjectBody {
  body: ReadableStream;
  httpEtag?: string;
  size?: number;
  httpMetadata?: {
    contentType?: string;
    contentLanguage?: string;
    contentDisposition?: string;
    contentEncoding?: string;
    cacheControl?: string;
    cacheExpiry?: Date;
  };
}

export interface R2BucketLike {
  get(key: string): Promise<R2ObjectBody | null>;
}

export interface Env {
  DATA: R2BucketLike;
}
