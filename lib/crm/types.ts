export type Trade = "roofing" | "painting" | "both";
export type ServiceType = "roofing" | "painting" | "both";
export type LeadStatus =
  | "new"
  | "contacted"
  | "qualified"
  | "estimate_sent"
  | "won"
  | "lost";
export type LeadPriority = "low" | "normal" | "high" | "urgent";
export type CustomerType = "homeowner" | "commercial" | "hoa" | "property_manager";
export type CustomerStatus = "active" | "inactive" | "prospect";

export type CompanyRecord = {
  id: string;
  name: string;
  trade: Trade;
  phone: string | null;
  email: string | null;
  created_at: string;
  updated_at: string;
};

export type CustomerRecord = {
  id: string;
  company_id: string;
  display_name: string;
  contact_name: string;
  phone: string | null;
  email: string | null;
  property_address: string;
  city: string | null;
  state: string;
  postal_code: string | null;
  customer_type: CustomerType;
  status: CustomerStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type LeadRecord = {
  id: string;
  company_id: string;
  customer_id: string | null;
  contact_name: string;
  phone: string | null;
  email: string | null;
  property_address: string;
  city: string | null;
  state: string;
  postal_code: string | null;
  service_type: ServiceType;
  source: string;
  status: LeadStatus;
  priority: LeadPriority;
  estimated_value: number;
  next_follow_up: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type LeadInput = {
  company_id: string;
  contact_name: string;
  phone?: string | null;
  email?: string | null;
  property_address: string;
  city?: string | null;
  state?: string;
  postal_code?: string | null;
  service_type: ServiceType;
  source?: string;
  status?: LeadStatus;
  priority?: LeadPriority;
  estimated_value?: number;
  next_follow_up?: string | null;
  notes?: string | null;
};

export type CustomerInput = {
  company_id: string;
  display_name: string;
  contact_name: string;
  phone?: string | null;
  email?: string | null;
  property_address: string;
  city?: string | null;
  state?: string;
  postal_code?: string | null;
  customer_type?: CustomerType;
  status?: CustomerStatus;
  notes?: string | null;
};

export type CompanyInsert = {
  id?: string;
  name: string;
  trade: Trade;
  phone?: string | null;
  email?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type CustomerInsert = CustomerInput & {
  id?: string;
  created_at?: string;
  updated_at?: string;
};

export type LeadInsert = LeadInput & {
  id?: string;
  customer_id?: string | null;
  created_by?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type CrmSnapshot = {
  companies: CompanyRecord[];
  leads: LeadRecord[];
  customers: CustomerRecord[];
};

export type DashboardMetrics = {
  openLeads: number;
  newLeads: number;
  qualifiedLeads: number;
  customers: number;
  urgentFollowUps: number;
  pipelineValue: number;
  wonValue: number;
};

export type Database = {
  public: {
    Tables: {
      companies: {
        Row: CompanyRecord;
        Insert: CompanyInsert;
        Update: Partial<Database["public"]["Tables"]["companies"]["Insert"]>;
        Relationships: [];
      };
      customers: {
        Row: CustomerRecord;
        Insert: CustomerInsert;
        Update: Partial<Database["public"]["Tables"]["customers"]["Insert"]>;
        Relationships: [];
      };
      leads: {
        Row: LeadRecord;
        Insert: LeadInsert;
        Update: Partial<Database["public"]["Tables"]["leads"]["Insert"]>;
        Relationships: [];
      };
      profiles: {
        Row: {
          id: string;
          full_name: string | null;
          role: "owner" | "admin" | "sales" | "production" | "team_member";
          default_company_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          full_name?: string | null;
          role?: "owner" | "admin" | "sales" | "production" | "team_member";
          default_company_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["profiles"]["Insert"]>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
