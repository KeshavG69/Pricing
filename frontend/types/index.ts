// User and Authentication types
export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  organization_id: string;
  role: 'admin' | 'user';
  status: 'active' | 'removed' | 'suspended';
  createdAt: string;
  // Terms and Conditions acceptance
  terms_accepted_version: string;
  terms_accepted_at: string;
  needs_terms_acceptance: boolean;
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
  terms_accepted: boolean;
}

export interface AuthResponse {
  access_token: string;
  token_type: string;
}

// Organization types
export interface Organization {
  id: string;
  name: string;
  slug: string;
  owner_id: string;
  website?: string | null;
  address?: string | null;
  createdAt: string;
  updatedAt: string;
  status: 'active' | 'suspended';
  settings: OrganizationSettings;
  subscription: Subscription;
}

export interface RatePreset {
  id: string;
  name: string;
  fringe: number;
  oh: number;
  ga: number;
  fee: number;
  smh: number;
  sub_fee: number;
  ga_passthrough: number;
  escalation_rate: number;
}

export interface OrganizationSettings {
  default_rates: {
    fringe: number;
    oh: number;
    ga: number;
    fee: number;
    smh: number;
    sub_fee: number;
    ga_passthrough: number;
    ga_adder: number;
  };
  default_escalation_rate: number;
  allow_user_rate_override: boolean;
  rate_presets?: RatePreset[];
}

export interface Subscription {
  plan: 'free' | 'pro' | 'enterprise';
  seats: number;
  expires_at: string | null;
}

export interface OrganizationStats {
  total_members: number;
  active_members: number;
  total_proposals: number;
  pending_invitations: number;
}

// Team member types
export interface TeamMember {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: 'admin' | 'user';
  status: 'active' | 'removed' | 'suspended';
  createdAt: string;
  joinedAt?: string;
}

// Invitation types
export interface Invitation {
  id: string;
  organization_id: string;
  organization_name: string;
  email: string;
  role: 'admin' | 'user';
  status: 'pending' | 'accepted' | 'expired' | 'revoked';
  invited_by: string;
  invited_by_name: string;
  createdAt: string;
  expiresAt: string;
  acceptedAt?: string;
  accepted_by?: string;
}

export interface InviteUserRequest {
  email: string;
  role: 'admin' | 'user';
  proposal_ids?: string[];
}

export interface AcceptInvitationRequest {
  token: string;
  firstName?: string;
  lastName?: string;
  password?: string;
}

export interface ValidateTokenResponse {
  organization_name: string;
  email: string;
  role: string;
  invited_by_name: string;
  expiresAt: string;
  user_exists: boolean;
}

// Document types
export interface DocumentInfo {
  filename: string;
  file_size: number;
  uploadDate: string;
  idrive_url: string;
  idrive_key: string;
  idrive_url_expires_at?: number; // Unix timestamp (seconds)
  extracted_content?: string;
}

// Proposal types
export interface ProposalMetadata {
  base_years?: number;
  option_years?: number;
  total_years?: number;
  total_jobs?: number;
  months_per_year?: Record<string, number>;
  fte_hours_threshold?: number;
}

// Wage source configuration for proposals
export interface WageSource {
  type: 'bls' | 'gsa';
  file_id?: string;  // GSA contract file_id (only when type is 'gsa')
}

export interface Proposal {
  id: string;
  user_id: string;
  organization_id: string;
  name: string;
  solicitation_number?: string;
  prime_contractor_name?: string;
  dcaa_contact?: string;
  status: 'processing' | 'completed' | 'error' | 'draft';
  business_status?: 'active' | 'no-bid' | 'submitted';  // NEW: business workflow status
  excel_downloaded?: boolean;
  visibility?: 'private' | 'shared';
  shared_with?: string[];
  createdAt: string;
  updatedAt: string;
  documents: DocumentInfo[];
  metadata?: ProposalMetadata;
  jobs?: JobPosition[];
  rates?: IndirectRates;
  escalation_rates?: EscalationRates;
  spreadsheet_data?: any;
  total_cost?: number;
  progress?: number;
  message?: string;
  wage_source?: WageSource;  // BLS or GSA wage source configuration
}

export interface ProposalCreate {
  name: string;
  solicitation_number?: string;
}

export interface ProposalUpdate {
  name?: string;
  solicitation_number?: string;
  prime_contractor_name?: string;
  status?: string;
  total_cost?: number;
  rates?: IndirectRates;
  escalation_rates?: EscalationRates;
  spreadsheet_data?: any;
}

export interface ProposalStatus {
  status: 'processing' | 'completed' | 'error';
  progress: number;
  message?: string;
}

export interface BusinessStatusAnalytics {
  count: number;
  total_value: number;
  avg_value: number;
  avg_age_days: number;
  contributors_count: number;
  proposals: Array<{
    id: string;
    name: string;
    solicitation_number?: string;
    total_cost?: number;
    business_status?: 'active' | 'no-bid' | 'submitted';  // For tab filtering
    created_at: string;
    updated_at: string;
    user_id: string;
  }>;
  has_more: boolean;  // Indicates if more results available via pagination
}

// Job and wage types
export interface JobPosition {
  labor_category: string;
  description?: string;
  experience?: number;
  location?: string;
  hours?: number;
  hours_per_year?: Record<string, number>;
  standard_fte_hours?: number;  // Standard full-time hours from contract
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
  // GSA fields
  wage_source?: 'bls' | 'gsa';
  gsa_lcat_id?: string;
  gsa_title?: string;
  gsa_rates_by_year?: Record<string, number>;
  gsa_current_year?: number;
  gsa_custom_rate?: number | null;
  // Discount fields (GSA only)
  gsa_discount_rate?: number; // User-applied discount (e.g., 0.10 for 10% off)
  suggested_discount_rate?: number; // Suggested discount based on BLS comparison
  discount_rationale?: string; // Explanation for suggested discount
  bls_comparison_fblr?: number; // BLS FBLR used for discount comparison
  bls_comparison_soc_code?: string; // BLS SOC code for reference
  bls_comparison_wage?: number; // BLS annual wage used
  bls_comparison_percentile?: string; // BLS percentile selected
  // Key position flag (cannot be auto-allocated to subcontractors)
  is_key_position?: boolean;
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
  description?: string; // Job description extracted from document
  experience?: number; // Years of experience
  location?: string; // Job location
  soc_code?: string;
  soc_title?: string;
  percentile: '10th' | '25th' | '50th' | '75th' | '90th';
  wage_10th?: number;
  wage_25th?: number;
  wage_50th?: number;
  wage_75th?: number;
  wage_90th?: number;
  selected_wage?: number; // The actual wage selected based on experience/percentile
  custom_salary?: number; // Manually entered salary (overrides percentile wages) - DEPRECATED, use selected_salaries
  // Multi-salary selection support
  selected_salaries?: number[]; // Array of selected salary amounts (averaged for calculations)
  salary_sources?: {
    percentiles: ('10th' | '25th' | '50th' | '75th' | '90th')[]; // Selected percentiles
    custom_amounts: number[]; // Custom salary amounts
  };
  hours_per_year: Record<string, number>; // {"1": 1880, "2": 1880, ...}
  standard_fte_hours?: number; // Full-time equivalent hours (e.g., 1880, 1920, 2080)
  // GSA fields
  wage_source?: 'bls' | 'gsa';
  gsa_lcat_id?: string;
  gsa_title?: string;
  gsa_rates_by_year?: Record<string, number>;
  gsa_current_year?: number;
  gsa_custom_rate?: number | null;
  // Discount fields (GSA only)
  gsa_discount_rate?: number; // User-applied discount (e.g., 0.10 for 10% off)
  suggested_discount_rate?: number; // Suggested discount based on BLS comparison
  discount_rationale?: string; // Explanation for suggested discount
  bls_comparison_fblr?: number; // BLS FBLR used for discount comparison
  bls_comparison_soc_code?: string; // BLS SOC code for reference
  bls_comparison_wage?: number; // BLS annual wage used
  bls_comparison_percentile?: string; // BLS percentile selected
  // Key position flag (cannot be auto-allocated to subcontractors)
  is_key_position?: boolean;
  // Calculated fields (from backend)
  fblr?: number;
  yearly_amounts?: Array<{
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

export interface TravelItem {
  id: string;
  description?: string;
  amount_per_year: Record<string, number>;  // Base amounts per year
  escalate: boolean;  // Whether to escalate year-over-year
  // G&A Rate is applied to Travel (same as labor), NOT S&MH
}

export interface ODCItem {
  id: string;
  category: string;  // Materials, Equipment, Software, Supplies (NOT Travel)
  description?: string;
  amount_per_year: Record<string, number>;  // Base amounts per year
  escalate: boolean;  // Whether to escalate year-over-year
  // S&MH (Subcontract & Material Handling) is applied to ODCs, NOT G&A
}

// Extension periods (beyond regular contract years)
export interface Extension {
  year: number;  // Year number (e.g., 6 if extension is after 5 regular years)
  label: string;  // Display label (e.g., "6 Month Extension", "12 Month Extension")
  duration_months: number;  // Duration in months (e.g., 6, 12)
  description?: string;  // Optional description
}

// Advanced Analysis Mode types
export interface YearBreakdown {
  hours: number;
  wage: number;
  dlRate: number;
  dlAmount: number;
  fringe: number;
  fringeAmount: number;
  oh: number;
  ohAmount: number;
  ga: number;
  gaAmount: number;
  fee: number;
  feeAmount: number;
  fblr: number;
  totalAmount: number;
}

export interface AdvancedPosition {
  id: string;
  labor_category: string;
  description?: string; // Job description extracted from document
  experience?: number;
  location?: string;
  soc_code?: string;
  soc_title?: string;
  percentile: '10th' | '25th' | '50th' | '75th' | '90th';
  wage_10th?: number;
  wage_25th?: number;
  wage_50th?: number;
  wage_75th?: number;
  wage_90th?: number;
  custom_salary?: number; // Manually entered salary (overrides percentile wages) - DEPRECATED, use selected_salaries
  // Multi-salary selection support
  selected_salaries?: number[]; // Array of selected salary amounts (averaged for calculations)
  salary_sources?: {
    percentiles: ('10th' | '25th' | '50th' | '75th' | '90th')[]; // Selected percentiles
    custom_amounts: number[]; // Custom salary amounts
  };
  // GSA fields
  wage_source?: 'bls' | 'gsa';
  gsa_lcat_id?: string;
  gsa_title?: string;
  gsa_rates_by_year?: Record<string, number>;
  gsa_current_year?: number;
  gsa_custom_rate?: number | null;
  // Discount fields (GSA only)
  gsa_discount_rate?: number;
  suggested_discount_rate?: number;
  discount_rationale?: string;
  bls_comparison_fblr?: number;
  bls_comparison_soc_code?: string;
  bls_comparison_wage?: number;
  bls_comparison_percentile?: string;
  // Key position flag (cannot be auto-allocated to subcontractors)
  is_key_position?: boolean;

  // Per-year breakdown
  breakdown: {
    [year: string]: YearBreakdown; // "1", "2", "3", etc.
  };

  total_hours: number;
  total_amount: number;
  standard_fte_hours?: number; // Full-time equivalent hours (e.g., 1880, 1920, 2080)
}

export interface Aggregates {
  totalDL: number;
  totalFringe: number;
  totalOH: number;
  totalGA: number;
  totalFee: number;
  totalFBLR: number;
  byYear: {
    [year: string]: {
      dl: number;
      fringe: number;
      oh: number;
      ga: number;
      fee: number;
      fblr: number;
      totalAmount: number;
    };
  };
}

export type GridRowType = 'position' | 'breakdown' | 'subtotal';
export type BreakdownType = 'dl' | 'fringe' | 'oh' | 'ga' | 'fee';

export interface GridRow {
  type: GridRowType;
  positionId: string;
  breakdownType?: BreakdownType;
  data: any; // Actual row data
  isExpanded?: boolean;
}

// Context Menu types
export interface ContextMenuItem {
  label: string;
  icon?: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
}

export interface ContextMenuProps {
  x: number;
  y: number;
  onClose: () => void;
  items: ContextMenuItem[];
}

// Subcontractor Conversion types
export interface ConversionData {
  positionId: string;
  subcontractorId?: string; // Existing subcontractor
  newSubcontractorName?: string; // Create new
  hoursAllocation: Record<string, number>; // Per year
  rate: number; // Hourly rate for subcontractor
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

export interface ProjectConfig {
  solicitation_number: string;
  prime_contractor_name: string;
  subcontractor_names: string[];
  dcaa_contact: string;
  total_years: number;
  base_years: number;
  escalation_rates: EscalationRates;
  indirect_rates: {
    fringe: number;
    oh: number;
    ga: number;
  };
  passthrough_rates: {
    smh: number;
    ga: number;
  };
  fee_rates: {
    prime_labor: number;
    sub_labor: number;
  };
  ga_adder_rate: number;
  subcontractors: Subcontractor[];
  travel: TravelItem[];
  odcs: ODCItem[];
  include_rate_table?: boolean;
}

export interface ExcelGenerationRequest {
  jobs: Array<{
    labor_category: string;
    soc_code?: string;
    hours_per_year: Record<string, number>;
    selected_wage: number;
    percentile: string;
    wage_10th?: number;
    wage_25th?: number;
    wage_50th?: number;
    wage_75th?: number;
    wage_90th?: number;
    standard_fte_hours?: number;
  }>;
  project_config: ProjectConfig;
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

// SOC (Standard Occupational Classification) types
export interface SOCSuggestion {
  soc_code: string;
  soc_title: string;
  similarity_score?: number;
  is_best_match?: boolean;
}

export interface SOCSearchAIRequest {
  labor_category: string;
  description?: string;
  experience?: number;
  location?: string;
  top_k?: number;
}

export interface SOCSearchRequest {
  query: string;
  limit?: number;
}

export interface SOCAllResponse {
  status: string;
  total: number;
  skip: number;
  limit: number;
  has_more: boolean;
  occupations: SOCSuggestion[];
}

export interface WageRefreshResponse {
  status: string;
  wage_data: {
    soc_code: string;
    soc_title: string;
    wage_10th?: number;
    wage_25th?: number;
    wage_50th?: number;
    wage_75th?: number;
    wage_90th?: number;
    selected_wage?: number;
    percentile?: string;
  };
}

// ============================================================
// GSA / Company Rates Types
// ============================================================

export interface GSAContract {
  id: string;
  file_id: string;
  name: string;
  status: 'processing' | 'active' | 'needs_date' | 'error';
  contract_number?: string;
  contract_start_date?: string;
  contract_end_date?: string;
  company_name?: string;
  labor_categories_count: number;
  labor_categories?: GSALaborCategory[];
  created_at: string;
  updated_at?: string;
  uploaded_by: string;
}

export interface GSALaborCategory {
  lcat_id: string;
  title: string;
  sin?: string;
  education?: string;
  experience?: string;
  description?: string;
  rates_by_year: Record<string, number>;
}
