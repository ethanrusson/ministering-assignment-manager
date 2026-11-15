// Hand-written until `supabase gen types typescript` is wired up.
// Mirrors supabase/migrations/0001_init.sql through 0005_map_groundwork.sql.
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

export type LocationSource = 'lcr' | 'manual';
export type LocationReviewKind = 'no_location' | 'outside_ward' | 'moved' | 'shared_location';
export type LocationReviewStatus = 'open' | 'resolved' | 'dismissed';
export type StreetKind = 'main' | 'residential' | 'lane';
export type StreetSource = 'osm' | 'manual';

export type Database = {
  __InternalSupabase: { PostgrestVersion: '12' };
  public: {
    Tables: {
      wards: {
        Row: { id: string; user_id: string; name: string; boundary: Json | null; created_at: string };
        Insert: {
          id?: string;
          user_id: string;
          name?: string;
          boundary?: Json | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          name?: string;
          boundary?: Json | null;
          created_at?: string;
        };
        Relationships: EmptyRel;
      };
      ward_members: {
        Row: { ward_id: string; user_id: string; role: string; created_at: string };
        Insert: { ward_id: string; user_id: string; role?: string; created_at?: string };
        Update: { ward_id?: string; user_id?: string; role?: string; created_at?: string };
        Relationships: EmptyRel;
      };
      ward_invites: {
        Row: {
          id: string;
          ward_id: string;
          email: string;
          token: string;
          created_by: string;
          created_at: string;
          expires_at: string;
          accepted_at: string | null;
        };
        Insert: {
          id?: string;
          ward_id: string;
          email: string;
          token?: string;
          created_by: string;
          created_at?: string;
          expires_at?: string;
          accepted_at?: string | null;
        };
        Update: {
          id?: string;
          ward_id?: string;
          email?: string;
          token?: string;
          created_by?: string;
          created_at?: string;
          expires_at?: string;
          accepted_at?: string | null;
        };
        Relationships: EmptyRel;
      };
      elders: {
        Row: {
          id: string;
          ward_id: string;
          name: string;
          age: number | null;
          hidden: boolean;
          lcr_uuid: string | null;
          not_generally_assigned: boolean;
          home_household_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          ward_id: string;
          name: string;
          age?: number | null;
          hidden?: boolean;
          lcr_uuid?: string | null;
          not_generally_assigned?: boolean;
          home_household_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          ward_id?: string;
          name?: string;
          age?: number | null;
          hidden?: boolean;
          lcr_uuid?: string | null;
          not_generally_assigned?: boolean;
          home_household_id?: string | null;
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
          lcr_uuid: string | null;
          lat: number | null;
          lng: number | null;
          location_source: LocationSource | null;
          location_updated_at: string | null;
          district_id: string | null;
          location_group_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          ward_id: string;
          name: string;
          hidden?: boolean;
          lcr_uuid?: string | null;
          lat?: number | null;
          lng?: number | null;
          location_source?: LocationSource | null;
          location_updated_at?: string | null;
          district_id?: string | null;
          location_group_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          ward_id?: string;
          name?: string;
          hidden?: boolean;
          lcr_uuid?: string | null;
          lat?: number | null;
          lng?: number | null;
          location_source?: LocationSource | null;
          location_updated_at?: string | null;
          district_id?: string | null;
          location_group_id?: string | null;
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
      location_groups: {
        Row: {
          id: string;
          ward_id: string;
          name: string;
          lat: number;
          lng: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          ward_id: string;
          name: string;
          lat: number;
          lng: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          ward_id?: string;
          name?: string;
          lat?: number;
          lng?: number;
          created_at?: string;
        };
        Relationships: EmptyRel;
      };
      location_reviews: {
        Row: {
          id: string;
          ward_id: string;
          household_id: string;
          kind: LocationReviewKind;
          data: Json;
          status: LocationReviewStatus;
          resolution: string | null;
          created_at: string;
          resolved_at: string | null;
          resolved_by: string | null;
        };
        Insert: {
          id?: string;
          ward_id: string;
          household_id: string;
          kind: LocationReviewKind;
          data?: Json;
          status?: LocationReviewStatus;
          resolution?: string | null;
          created_at?: string;
          resolved_at?: string | null;
          resolved_by?: string | null;
        };
        Update: {
          id?: string;
          ward_id?: string;
          household_id?: string;
          kind?: LocationReviewKind;
          data?: Json;
          status?: LocationReviewStatus;
          resolution?: string | null;
          created_at?: string;
          resolved_at?: string | null;
          resolved_by?: string | null;
        };
        Relationships: EmptyRel;
      };
      streets: {
        Row: {
          id: string;
          ward_id: string;
          name: string;
          kind: StreetKind;
          geometry: Json;
          smooth: boolean;
          source: StreetSource;
          osm_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          ward_id: string;
          name?: string;
          kind?: StreetKind;
          geometry: Json;
          smooth?: boolean;
          source?: StreetSource;
          osm_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          ward_id?: string;
          name?: string;
          kind?: StreetKind;
          geometry?: Json;
          smooth?: boolean;
          source?: StreetSource;
          osm_id?: string | null;
          created_at?: string;
        };
        Relationships: EmptyRel;
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      accept_invite: {
        Args: { p_token: string };
        Returns: string; // ward_id uuid
      };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};
