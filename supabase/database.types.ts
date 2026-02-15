export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      achievements: {
        Row: {
          code: string
          created_at: string
          description: string | null
          icon: string | null
          id: string
          is_active: boolean
          points: number
          title: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean
          points?: number
          title: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean
          points?: number
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      chat_channels: {
        Row: {
          city_id: string
          created_at: string
          display_name: string
          id: string
          scope: Database["public"]["Enums"]["chat_channel_scope"]
          team_id: string | null
          updated_at: string
        }
        Insert: {
          city_id: string
          created_at?: string
          display_name: string
          id?: string
          scope: Database["public"]["Enums"]["chat_channel_scope"]
          team_id?: string | null
          updated_at?: string
        }
        Update: {
          city_id?: string
          created_at?: string
          display_name?: string
          id?: string
          scope?: Database["public"]["Enums"]["chat_channel_scope"]
          team_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_channels_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "cities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_channels_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "city_leaderboard"
            referencedColumns: ["city_id"]
          },
          {
            foreignKeyName: "chat_channels_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "city_map_stats"
            referencedColumns: ["city_id"]
          },
          {
            foreignKeyName: "chat_channels_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "team_leaderboard"
            referencedColumns: ["team_id"]
          },
          {
            foreignKeyName: "chat_channels_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "team_user_co2_leaderboard"
            referencedColumns: ["team_id"]
          },
          {
            foreignKeyName: "chat_channels_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_message_attachments: {
        Row: {
          created_at: string
          file_size_bytes: number
          height: number | null
          id: string
          kind: Database["public"]["Enums"]["chat_attachment_kind"]
          message_id: string
          mime_type: string
          storage_bucket: string
          storage_path: string
          uploaded_by: string
          width: number | null
        }
        Insert: {
          created_at?: string
          file_size_bytes: number
          height?: number | null
          id?: string
          kind: Database["public"]["Enums"]["chat_attachment_kind"]
          message_id: string
          mime_type: string
          storage_bucket?: string
          storage_path: string
          uploaded_by: string
          width?: number | null
        }
        Update: {
          created_at?: string
          file_size_bytes?: number
          height?: number | null
          id?: string
          kind?: Database["public"]["Enums"]["chat_attachment_kind"]
          message_id?: string
          mime_type?: string
          storage_bucket?: string
          storage_path?: string
          uploaded_by?: string
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "chat_message_attachments_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "chat_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_message_attachments_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_message_attachments_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "public_profiles_with_co2"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_message_attachments_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "user_co2_leaderboard"
            referencedColumns: ["user_id"]
          },
        ]
      }
      chat_message_reactions: {
        Row: {
          created_at: string
          emoji: string
          message_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          emoji: string
          message_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          emoji?: string
          message_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_message_reactions_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "chat_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_message_reactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_message_reactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles_with_co2"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_message_reactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_co2_leaderboard"
            referencedColumns: ["user_id"]
          },
        ]
      }
      chat_messages: {
        Row: {
          body: string | null
          channel_id: string
          created_at: string
          deleted_at: string | null
          edited_at: string | null
          id: string
          kind: Database["public"]["Enums"]["chat_message_kind"]
          metadata: Json
          reply_to_message_id: string | null
          sender_id: string
          thread_id: string | null
          updated_at: string
        }
        Insert: {
          body?: string | null
          channel_id: string
          created_at?: string
          deleted_at?: string | null
          edited_at?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["chat_message_kind"]
          metadata?: Json
          reply_to_message_id?: string | null
          sender_id: string
          thread_id?: string | null
          updated_at?: string
        }
        Update: {
          body?: string | null
          channel_id?: string
          created_at?: string
          deleted_at?: string | null
          edited_at?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["chat_message_kind"]
          metadata?: Json
          reply_to_message_id?: string | null
          sender_id?: string
          thread_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "chat_channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_messages_reply_to_message_id_fkey"
            columns: ["reply_to_message_id"]
            isOneToOne: false
            referencedRelation: "chat_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "public_profiles_with_co2"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "user_co2_leaderboard"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "chat_messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "chat_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_threads: {
        Row: {
          archived_at: string | null
          channel_id: string
          created_at: string
          created_by: string
          id: string
          title: string | null
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          channel_id: string
          created_at?: string
          created_by: string
          id?: string
          title?: string | null
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          channel_id?: string
          created_at?: string
          created_by?: string
          id?: string
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_threads_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "chat_channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_threads_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_threads_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "public_profiles_with_co2"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_threads_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_co2_leaderboard"
            referencedColumns: ["user_id"]
          },
        ]
      }
      cities: {
        Row: {
          bbox_ne_lat: number | null
          bbox_ne_lon: number | null
          bbox_sw_lat: number | null
          bbox_sw_lon: number | null
          boundary_geojson: Json | null
          center_lat: number | null
          center_lon: number | null
          country: string
          country_code: string
          created_at: string
          id: string
          name: string
          region: string | null
          state: string | null
          updated_at: string
        }
        Insert: {
          bbox_ne_lat?: number | null
          bbox_ne_lon?: number | null
          bbox_sw_lat?: number | null
          bbox_sw_lon?: number | null
          boundary_geojson?: Json | null
          center_lat?: number | null
          center_lon?: number | null
          country?: string
          country_code?: string
          created_at?: string
          id?: string
          name: string
          region?: string | null
          state?: string | null
          updated_at?: string
        }
        Update: {
          bbox_ne_lat?: number | null
          bbox_ne_lon?: number | null
          bbox_sw_lat?: number | null
          bbox_sw_lon?: number | null
          boundary_geojson?: Json | null
          center_lat?: number | null
          center_lon?: number | null
          country?: string
          country_code?: string
          created_at?: string
          id?: string
          name?: string
          region?: string | null
          state?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      daily_quests: {
        Row: {
          code: string
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          points: number
          target_count: number
          title: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          points?: number
          target_count?: number
          title: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          points?: number
          target_count?: number
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      daily_tips: {
        Row: {
          created_at: string
          id: number
          tip_date: string
          tip_text: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: number
          tip_date: string
          tip_text: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: number
          tip_date?: string
          tip_text?: string
          updated_at?: string
        }
        Relationships: []
      }
      event_attendees: {
        Row: {
          created_at: string
          event_id: string
          note: string | null
          signed_up_at: string
          status: Database["public"]["Enums"]["event_attendance_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          event_id: string
          note?: string | null
          signed_up_at?: string
          status?: Database["public"]["Enums"]["event_attendance_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          event_id?: string
          note?: string | null
          signed_up_at?: string
          status?: Database["public"]["Enums"]["event_attendance_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_attendees_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_attendees_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_attendees_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles_with_co2"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_attendees_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_co2_leaderboard"
            referencedColumns: ["user_id"]
          },
        ]
      }
      events: {
        Row: {
          activity_type: string
          cancelled_at: string | null
          city_id: string
          created_at: string
          created_by: string
          description: string | null
          ends_at: string
          id: string
          is_cancelled: boolean
          latitude: number | null
          location_address: string | null
          location_name: string
          location_notes: string | null
          longitude: number | null
          max_attendees: number | null
          metadata: Json
          sign_up_deadline: string | null
          starts_at: string
          title: string
          updated_at: string
        }
        Insert: {
          activity_type?: string
          cancelled_at?: string | null
          city_id: string
          created_at?: string
          created_by: string
          description?: string | null
          ends_at: string
          id?: string
          is_cancelled?: boolean
          latitude?: number | null
          location_address?: string | null
          location_name: string
          location_notes?: string | null
          longitude?: number | null
          max_attendees?: number | null
          metadata?: Json
          sign_up_deadline?: string | null
          starts_at: string
          title: string
          updated_at?: string
        }
        Update: {
          activity_type?: string
          cancelled_at?: string | null
          city_id?: string
          created_at?: string
          created_by?: string
          description?: string | null
          ends_at?: string
          id?: string
          is_cancelled?: boolean
          latitude?: number | null
          location_address?: string | null
          location_name?: string
          location_notes?: string | null
          longitude?: number | null
          max_attendees?: number | null
          metadata?: Json
          sign_up_deadline?: string | null
          starts_at?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "events_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "cities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "city_leaderboard"
            referencedColumns: ["city_id"]
          },
          {
            foreignKeyName: "events_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "city_map_stats"
            referencedColumns: ["city_id"]
          },
          {
            foreignKeyName: "events_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "public_profiles_with_co2"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_co2_leaderboard"
            referencedColumns: ["user_id"]
          },
        ]
      }
      plant_aliases: {
        Row: {
          alias_name: string
          created_at: string
          id: string
          plant_id: string
        }
        Insert: {
          alias_name: string
          created_at?: string
          id?: string
          plant_id: string
        }
        Update: {
          alias_name?: string
          created_at?: string
          id?: string
          plant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "plant_aliases_plant_id_fkey"
            columns: ["plant_id"]
            isOneToOne: false
            referencedRelation: "plants"
            referencedColumns: ["id"]
          },
        ]
      }
      plant_types: {
        Row: {
          code: string
          display_name: string
        }
        Insert: {
          code: string
          display_name: string
        }
        Update: {
          code?: string
          display_name?: string
        }
        Relationships: []
      }
      plants: {
        Row: {
          common_name: string
          created_at: string
          default_co2_kg_per_year: number
          id: string
          is_endangered: boolean
          is_invasive: boolean
          is_native: boolean
          is_tree: boolean
          scientific_name: string | null
          type: string
          updated_at: string
        }
        Insert: {
          common_name: string
          created_at?: string
          default_co2_kg_per_year?: number
          id?: string
          is_endangered?: boolean
          is_invasive?: boolean
          is_native?: boolean
          is_tree?: boolean
          scientific_name?: string | null
          type: string
          updated_at?: string
        }
        Update: {
          common_name?: string
          created_at?: string
          default_co2_kg_per_year?: number
          id?: string
          is_endangered?: boolean
          is_invasive?: boolean
          is_native?: boolean
          is_tree?: boolean
          scientific_name?: string | null
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "plants_type_fkey"
            columns: ["type"]
            isOneToOne: false
            referencedRelation: "plant_types"
            referencedColumns: ["code"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          city: string | null
          city_id: string | null
          country: string | null
          created_at: string
          display_name: string | null
          email: string
          full_name: string | null
          id: string
          state: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          city?: string | null
          city_id?: string | null
          country?: string | null
          created_at?: string
          display_name?: string | null
          email: string
          full_name?: string | null
          id: string
          state?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          city?: string | null
          city_id?: string | null
          country?: string | null
          created_at?: string
          display_name?: string | null
          email?: string
          full_name?: string | null
          id?: string
          state?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "cities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "city_leaderboard"
            referencedColumns: ["city_id"]
          },
          {
            foreignKeyName: "profiles_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "city_map_stats"
            referencedColumns: ["city_id"]
          },
        ]
      }
      public_profiles: {
        Row: {
          avatar_url: string | null
          city: string | null
          country: string | null
          created_at: string
          display_name: string | null
          id: string
          state: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          display_name?: string | null
          id: string
          state?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          state?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "public_profiles_id_fkey"
            columns: ["id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "public_profiles_id_fkey"
            columns: ["id"]
            isOneToOne: true
            referencedRelation: "public_profiles_with_co2"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "public_profiles_id_fkey"
            columns: ["id"]
            isOneToOne: true
            referencedRelation: "user_co2_leaderboard"
            referencedColumns: ["user_id"]
          },
        ]
      }
      team_memberships: {
        Row: {
          joined_at: string
          role: string
          team_id: string
          user_id: string
        }
        Insert: {
          joined_at?: string
          role?: string
          team_id: string
          user_id: string
        }
        Update: {
          joined_at?: string
          role?: string
          team_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_memberships_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "team_leaderboard"
            referencedColumns: ["team_id"]
          },
          {
            foreignKeyName: "team_memberships_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "team_user_co2_leaderboard"
            referencedColumns: ["team_id"]
          },
          {
            foreignKeyName: "team_memberships_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_memberships_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_memberships_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles_with_co2"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_memberships_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_co2_leaderboard"
            referencedColumns: ["user_id"]
          },
        ]
      }
      teams: {
        Row: {
          city_id: string
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          city_id: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          city_id?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "teams_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "cities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teams_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "city_leaderboard"
            referencedColumns: ["city_id"]
          },
          {
            foreignKeyName: "teams_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "city_map_stats"
            referencedColumns: ["city_id"]
          },
          {
            foreignKeyName: "teams_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teams_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "public_profiles_with_co2"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teams_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_co2_leaderboard"
            referencedColumns: ["user_id"]
          },
        ]
      }
      user_achievements: {
        Row: {
          achievement_id: string
          created_at: string
          earned_at: string
          id: string
          user_id: string
        }
        Insert: {
          achievement_id: string
          created_at?: string
          earned_at?: string
          id?: string
          user_id: string
        }
        Update: {
          achievement_id?: string
          created_at?: string
          earned_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_achievements_achievement_id_fkey"
            columns: ["achievement_id"]
            isOneToOne: false
            referencedRelation: "achievements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_achievements_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_achievements_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles_with_co2"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_achievements_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_co2_leaderboard"
            referencedColumns: ["user_id"]
          },
        ]
      }
      user_daily_quests: {
        Row: {
          claimed_at: string | null
          completed_at: string | null
          created_at: string
          id: string
          progress_count: number
          quest_date: string
          quest_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          claimed_at?: string | null
          completed_at?: string | null
          created_at?: string
          id?: string
          progress_count?: number
          quest_date?: string
          quest_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          claimed_at?: string | null
          completed_at?: string | null
          created_at?: string
          id?: string
          progress_count?: number
          quest_date?: string
          quest_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_daily_quests_quest_id_fkey"
            columns: ["quest_id"]
            isOneToOne: false
            referencedRelation: "daily_quests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_daily_quests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_daily_quests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles_with_co2"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_daily_quests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_co2_leaderboard"
            referencedColumns: ["user_id"]
          },
        ]
      }
      user_plants: {
        Row: {
          co2_kg_per_year_override: number | null
          created_at: string
          custom_name: string | null
          id: string
          last_watered_at: string | null
          notes: string | null
          photo_path: string | null
          plant_id: string | null
          planted_on: string
          quantity: number
          updated_at: string
          user_id: string
          water_days: number[] | null
          water_time: string | null
          watering_points: number
        }
        Insert: {
          co2_kg_per_year_override?: number | null
          created_at?: string
          custom_name?: string | null
          id?: string
          last_watered_at?: string | null
          notes?: string | null
          photo_path?: string | null
          plant_id?: string | null
          planted_on: string
          quantity?: number
          updated_at?: string
          user_id: string
          water_days?: number[] | null
          water_time?: string | null
          watering_points?: number
        }
        Update: {
          co2_kg_per_year_override?: number | null
          created_at?: string
          custom_name?: string | null
          id?: string
          last_watered_at?: string | null
          notes?: string | null
          photo_path?: string | null
          plant_id?: string | null
          planted_on?: string
          quantity?: number
          updated_at?: string
          user_id?: string
          water_days?: number[] | null
          water_time?: string | null
          watering_points?: number
        }
        Relationships: [
          {
            foreignKeyName: "user_plants_plant_id_fkey"
            columns: ["plant_id"]
            isOneToOne: false
            referencedRelation: "plants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_plants_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_plants_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles_with_co2"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_plants_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_co2_leaderboard"
            referencedColumns: ["user_id"]
          },
        ]
      }
    }
    Views: {
      city_leaderboard: {
        Row: {
          city_country: string | null
          city_id: string | null
          city_name: string | null
          city_state: string | null
          country_code: string | null
          member_count: number | null
          total_co2_removed_kg: number | null
          total_plants: number | null
        }
        Relationships: []
      }
      city_map_stats: {
        Row: {
          bbox_ne_lat: number | null
          bbox_ne_lon: number | null
          bbox_sw_lat: number | null
          bbox_sw_lon: number | null
          best_plant_type: string | null
          best_plant_type_count: number | null
          boundary_geojson: Json | null
          center_lat: number | null
          center_lon: number | null
          city_country: string | null
          city_id: string | null
          city_name: string | null
          city_state: string | null
          country_code: string | null
          member_count: number | null
          total_co2_removed_kg: number | null
          total_plants: number | null
          type_breakdown: Json | null
        }
        Relationships: []
      }
      public_profiles_with_co2: {
        Row: {
          avatar_url: string | null
          city: string | null
          country: string | null
          display_name: string | null
          id: string | null
          state: string | null
          team_count: number | null
          team_ids: string[] | null
          total_co2_removed_kg: number | null
          total_plants: number | null
        }
        Relationships: []
      }
      team_leaderboard: {
        Row: {
          city_country: string | null
          city_id: string | null
          city_name: string | null
          city_state: string | null
          country_code: string | null
          member_count: number | null
          team_id: string | null
          team_name: string | null
          total_co2_removed_kg: number | null
          total_plants: number | null
        }
        Relationships: [
          {
            foreignKeyName: "teams_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "cities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teams_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "city_leaderboard"
            referencedColumns: ["city_id"]
          },
          {
            foreignKeyName: "teams_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "city_map_stats"
            referencedColumns: ["city_id"]
          },
        ]
      }
      team_user_co2_leaderboard: {
        Row: {
          avatar_url: string | null
          city_country: string | null
          city_id: string | null
          city_name: string | null
          city_state: string | null
          country_code: string | null
          display_name: string | null
          joined_at: string | null
          membership_role: string | null
          rank_in_team: number | null
          team_id: string | null
          team_name: string | null
          total_co2_removed_kg: number | null
          total_plants: number | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "team_memberships_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_memberships_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles_with_co2"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_memberships_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_co2_leaderboard"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "teams_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "cities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teams_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "city_leaderboard"
            referencedColumns: ["city_id"]
          },
          {
            foreignKeyName: "teams_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "city_map_stats"
            referencedColumns: ["city_id"]
          },
        ]
      }
      user_co2_leaderboard: {
        Row: {
          avatar_url: string | null
          city_country: string | null
          city_id: string | null
          city_name: string | null
          city_state: string | null
          country_code: string | null
          display_name: string | null
          team_count: number | null
          team_ids: string[] | null
          total_co2_removed_kg: number | null
          total_plants: number | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "cities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "city_leaderboard"
            referencedColumns: ["city_id"]
          },
          {
            foreignKeyName: "profiles_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "city_map_stats"
            referencedColumns: ["city_id"]
          },
        ]
      }
    }
    Functions: {
      chat_channel_id_from_storage_path: {
        Args: { p_path: string }
        Returns: string
      }
      chat_create_thread: {
        Args: {
          p_body: string
          p_channel_id: string
          p_kind?: Database["public"]["Enums"]["chat_message_kind"]
          p_metadata?: Json
          p_title?: string
        }
        Returns: {
          root_message_id: string
          thread_id: string
        }[]
      }
      chat_send_message: {
        Args: {
          p_body?: string
          p_channel_id: string
          p_kind?: Database["public"]["Enums"]["chat_message_kind"]
          p_metadata?: Json
          p_reply_to_message_id?: string
          p_thread_id?: string
        }
        Returns: string
      }
      chat_user_can_access_channel: {
        Args: { p_channel_id: string; p_user_id?: string }
        Returns: boolean
      }
      chat_user_can_access_message: {
        Args: { p_message_id: string; p_user_id?: string }
        Returns: boolean
      }
      delete_my_account: { Args: never; Returns: undefined }
      event_user_can_access: {
        Args: { p_event_id: string; p_user_id?: string }
        Returns: boolean
      }
      event_user_in_same_city: {
        Args: { p_city_id: string; p_user_id?: string }
        Returns: boolean
      }
      search_plants: {
        Args: { max_results?: number; search_text: string }
        Returns: {
          common_name: string
          match_source: string
          matched_name: string
          plant_id: string
          scientific_name: string
        }[]
      }
    }
    Enums: {
      chat_attachment_kind: "image" | "gif" | "file"
      chat_channel_scope: "city" | "team"
      chat_message_kind: "text" | "image" | "gif" | "system"
      event_attendance_status: "going" | "waitlist" | "cancelled"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      chat_attachment_kind: ["image", "gif", "file"],
      chat_channel_scope: ["city", "team"],
      chat_message_kind: ["text", "image", "gif", "system"],
      event_attendance_status: ["going", "waitlist", "cancelled"],
    },
  },
} as const
