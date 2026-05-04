// Hand-written until `supabase gen types typescript` is wired up.
// Mirrors supabase/migrations/0001_init.sql.
// Conforms to @supabase/postgrest-js GenericDatabase: each table needs
// Row / Insert / Update / Relationships ([] is fine for v1).

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

type Rel = {
  foreignKeyName: string;
  columns: string[];
  isOneToOne?: boolean;
  referencedRelation: string;
  referencedColumns: string[];
};
type EmptyRel = Rel[];

export type Database = {
  __InternalSupabase: { PostgrestVersion: '12' };
  public: {
    Tables: {
      wards: {
        Row: { id: string; user_id: string; name: string; created_at: string };
        Insert: { id?: string; user_id: string; name?: string; created_at?: string };
        Update: { id?: string; user_id?: string; name?: string; created_at?: string };
        Relationships: EmptyRel;
      };
      elders: {
        Row: {
          id: string;
          ward_id: string;
          name: string;
          age: number | null;
          hidden: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          ward_id: string;
          name: string;
          age?: number | null;
          hidden?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          ward_id?: string;
          name?: string;
          age?: number | null;
          hidden?: boolean;
          created_at?: string;
        };
        Relationships: EmptyRel;
      };
      households: {
        Row: {
          id: string;
          ward_id: string;
          name: string;
          hidden: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          ward_id: string;
          name: string;
          hidden?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          ward_id?: string;
          name?: string;
          hidden?: boolean;
          created_at?: string;
        };
        Relationships: EmptyRel;
      };
      labels: {
        Row: { id: string; ward_id: string; name: string; color: string; created_at: string };
        Insert: {
          id?: string;
          ward_id: string;
          name: string;
          color: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          ward_id?: string;
          name?: string;
          color?: string;
          created_at?: string;
        };
        Relationships: EmptyRel;
      };
      household_labels: {
        Row: { household_id: string; label_id: string };
        Insert: { household_id: string; label_id: string };
        Update: { household_id?: string; label_id?: string };
        Relationships: EmptyRel;
      };
      districts: {
        Row: {
          id: string;
          ward_id: string;
          name: string;
          position_x: number;
          position_y: number;
          width: number;
          height: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          ward_id: string;
          name: string;
          position_x?: number;
          position_y?: number;
          width?: number;
          height?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          ward_id?: string;
          name?: string;
          position_x?: number;
          position_y?: number;
          width?: number;
          height?: number;
          created_at?: string;
        };
        Relationships: EmptyRel;
      };
      companionships: {
        Row: {
          id: string;
          ward_id: string;
          district_id: string | null;
          position_x: number;
          position_y: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          ward_id: string;
          district_id?: string | null;
          position_x?: number;
          position_y?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          ward_id?: string;
          district_id?: string | null;
          position_x?: number;
          position_y?: number;
          created_at?: string;
        };
        Relationships: EmptyRel;
      };
      companionship_elders: {
        Row: { companionship_id: string; elder_id: string };
        Insert: { companionship_id: string; elder_id: string };
        Update: { companionship_id?: string; elder_id?: string };
        Relationships: EmptyRel;
      };
      companionship_households: {
        Row: { companionship_id: string; household_id: string };
        Insert: { companionship_id: string; household_id: string };
        Update: { companionship_id?: string; household_id?: string };
        Relationships: EmptyRel;
      };
      snapshots: {
        Row: {
          id: string;
          ward_id: string;
          name: string;
          state: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          ward_id: string;
          name: string;
          state: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          ward_id?: string;
          name?: string;
          state?: Json;
          created_at?: string;
        };
        Relationships: EmptyRel;
      };
    };
    Views: { [_ in never]: never };
    Functions: { [_ in never]: never };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};
