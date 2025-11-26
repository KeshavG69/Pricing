// User and Authentication types
export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  created_at: string;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface SignupData {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
}

export interface AuthResponse {
  access_token: string;
  token_type: string;
}

// Document types
export interface DocumentInfo {
  filename: string;
  file_size: number;
  upload_date: string;
  idrive_url: string;
  idrive_key: string;
  extracted_content?: string;
}

// Proposal types
export interface ProposalMetadata {
  base_years?: number;
  option_years?: number;
  total_years?: number;
  total_jobs?: number;
}

export interface Proposal {
  id: string;
  user_id: string;
  name: string;
  solicitation_number?: string;
  status: 'processing' | 'completed' | 'error' | 'draft';
  created_at: string;
  updated_at: string;
  documents: DocumentInfo[];
  metadata?: ProposalMetadata;
  jobs?: JobPosition[];
  rates?: IndirectRates;
  escalation_rates?: EscalationRates;
  spreadsheet_data?: any;
  total_cost?: number;
  progress?: number;
  message?: string;
}

export interface ProposalCreate {
  name: string;
  solicitation_number?: string;
}

export interface ProposalUpdate {
  name?: string;
  solicitation_number?: string;
  status?: string;
  rates?: IndirectRates;
  escalation_rates?: EscalationRates;
  spreadsheet_data?: any;
}

export interface ProposalStatus {
  status: 'processing' | 'completed' | 'error';
  progress: number;
  message?: string;
}

// Job and wage types
export interface JobPosition {
  labor_category: string;
  description?: string;
  experience?: number;
  location?: string;
  hours?: number;
  hours_per_year?: Record<string, number>;
  soc_code?: string;
  soc_title?: string;
  bls_occupation_description?: string;
  wage_10th?: number;
  wage_25th?: number;
  wage_50th?: number;
  wage_75th?: number;
  wage_90th?: number;
  selected_percentile?: '10th' | '25th' | '50th' | '75th' | '90th';
  base_years?: number;
  option_years?: number;
  total_years?: number;
}

// Rates types
export interface IndirectRates {
  fringe: number;
  oh: number;
  ga: number;
  fee: number;
  smh?: number;
  sub_fee?: number;
  ga_passthrough?: number;
  ga_adder?: number;
}

export interface EscalationRates {
  '1_to_2'?: number;
  '2_to_3'?: number;
  '3_to_4'?: number;
  '4_to_5'?: number;
  [key: string]: number | undefined;
}

// Spreadsheet-specific types
export interface SpreadsheetPosition {
  id: string; // Frontend-generated ID
  labor_category: string;
  soc_code?: string;
  soc_title?: string;
  percentile: '10th' | '25th' | '50th' | '75th' | '90th';
  wage_10th?: number;
  wage_25th?: number;
  wage_50th?: number;
  wage_75th?: number;
  wage_90th?: number;
  hours_per_year: Record<string, number>; // {"1": 1880, "2": 1880, ...}
  // Calculated fields (from backend)
  fblr?: number;
  yearly_amounts?: Array<{
    year: number;
    hours: number;
    amount: number;
    fblr: number;
  }>;
  total_amount?: number;
}

export interface SubcontractorPosition {
  labor_category: string;
  rate: number;
  hours_per_year: Record<string, number>;
}

export interface Subcontractor {
  id: string;
  name: string;
  positions: SubcontractorPosition[];
}

export interface ODCItem {
  id: string;
  category: string;
  description?: string;
  amount_per_year: Record<string, number>;
  escalate: boolean;
  apply_ga_adder: boolean;
}

// Recalculation API types
export interface RecalculateRequest {
  positions: Array<{
    id: string;
    percentile: string;
    wage_10th?: number;
    wage_25th?: number;
    wage_50th?: number;
    wage_75th?: number;
    wage_90th?: number;
    [key: string]: any; // For year1_hours, year2_hours, etc.
  }>;
  rates: IndirectRates;
  escalation_rates: EscalationRates;
  total_years: number;
}

export interface RecalculateResponse {
  status: 'success' | 'error';
  results: Array<{
    id: string;
    years: Array<{
      year: number;
      hours: number;
      amount: number;
      breakdown: {
        fblr: number;
        dlRate: number;
        fringe: number;
        oh: number;
        ga: number;
      };
    }>;
    total_hours: number;
    total_amount: number;
  }>;
}

export interface ExcelGenerationRequest {
  proposal_name: string;
  solicitation_number?: string;
  jobs: Array<{
    labor_category: string;
    soc_code?: string;
    percentile: string;
    hours_per_year: Record<string, number>;
    wage_10th?: number;
    wage_25th?: number;
    wage_50th?: number;
    wage_75th?: number;
    wage_90th?: number;
  }>;
  rates: IndirectRates;
  escalation_rates: EscalationRates;
  subcontractors?: Subcontractor[];
  odcs?: ODCItem[];
  total_years: number;
  base_years: number;
  option_years: number;
}

// API response types
export interface ApiError {
  detail: string;
}

export interface UploadResponse {
  proposal_id: string;
  status: string;
  message: string;
}
