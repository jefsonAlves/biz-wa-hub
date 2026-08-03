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
      agents_config: {
        Row: {
          blocked_keywords: string[] | null
          created_at: string
          department_id: string | null
          few_shot_examples: Json | null
          id: string
          is_active: boolean | null
          model: string | null
          name: string
          persona: string | null
          system_prompt: string | null
          temperature: number | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          blocked_keywords?: string[] | null
          created_at?: string
          department_id?: string | null
          few_shot_examples?: Json | null
          id?: string
          is_active?: boolean | null
          model?: string | null
          name: string
          persona?: string | null
          system_prompt?: string | null
          temperature?: number | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          blocked_keywords?: string[] | null
          created_at?: string
          department_id?: string | null
          few_shot_examples?: Json | null
          id?: string
          is_active?: boolean | null
          model?: string | null
          name?: string
          persona?: string | null
          system_prompt?: string | null
          temperature?: number | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agents_config_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agents_config_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_providers: {
        Row: {
          api_key_encrypted: string | null
          config: Json | null
          created_at: string
          id: string
          is_active: boolean | null
          model: string | null
          provider: string
          scope: string
          tenant_id: string | null
        }
        Insert: {
          api_key_encrypted?: string | null
          config?: Json | null
          created_at?: string
          id?: string
          is_active?: boolean | null
          model?: string | null
          provider?: string
          scope?: string
          tenant_id?: string | null
        }
        Update: {
          api_key_encrypted?: string | null
          config?: Json | null
          created_at?: string
          id?: string
          is_active?: boolean | null
          model?: string | null
          provider?: string
          scope?: string
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_providers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      business_hours: {
        Row: {
          config: Json
          created_at: string
          id: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          config?: Json
          created_at?: string
          id?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          config?: Json
          created_at?: string
          id?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_hours_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      connection_departments: {
        Row: {
          connection_id: string
          created_at: string
          department_id: string
          id: string
          tenant_id: string
        }
        Insert: {
          connection_id: string
          created_at?: string
          department_id: string
          id?: string
          tenant_id: string
        }
        Update: {
          connection_id?: string
          created_at?: string
          department_id?: string
          id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "connection_departments_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "connection_departments_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "connection_departments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      contacts: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string | null
          id: string
          last_message_preview: string | null
          metadata: Json | null
          name: string | null
          phone: string
          quarantined_at: string | null
          tags: string[] | null
          tenant_id: string
          updated_at: string
          wa_chat_id: string | null
          whatsapp_origin_verified: boolean
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          id?: string
          last_message_preview?: string | null
          metadata?: Json | null
          name?: string | null
          phone: string
          quarantined_at?: string | null
          tags?: string[] | null
          tenant_id: string
          updated_at?: string
          wa_chat_id?: string | null
          whatsapp_origin_verified?: boolean
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          id?: string
          last_message_preview?: string | null
          metadata?: Json | null
          name?: string | null
          phone?: string
          quarantined_at?: string | null
          tags?: string[] | null
          tenant_id?: string
          updated_at?: string
          wa_chat_id?: string | null
          whatsapp_origin_verified?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "contacts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          ai_mode: string | null
          ai_paused: boolean
          assigned_agent_id: string | null
          closed_at: string | null
          contact_id: string
          created_at: string
          deal_value: number | null
          department_id: string | null
          id: string
          is_pinned: boolean
          last_message_at: string | null
          pinned_at: string | null
          next_meeting: string | null
          sales_status: Database["public"]["Enums"]["sales_status"]
          status: Database["public"]["Enums"]["conversation_status"]
          tags: string[] | null
          tenant_id: string
          unread_count: number
          updated_at: string
          wa_chat_id: string | null
          whatsapp_connection_id: string | null
        }
        Insert: {
          ai_mode?: string | null
          ai_paused?: boolean
          assigned_agent_id?: string | null
          closed_at?: string | null
          contact_id: string
          created_at?: string
          deal_value?: number | null
          department_id?: string | null
          id?: string
          is_pinned?: boolean
          last_message_at?: string | null
          pinned_at?: string | null
          next_meeting?: string | null
          sales_status?: Database["public"]["Enums"]["sales_status"]
          status?: Database["public"]["Enums"]["conversation_status"]
          tags?: string[] | null
          tenant_id: string
          unread_count?: number
          updated_at?: string
          wa_chat_id?: string | null
          whatsapp_connection_id?: string | null
        }
        Update: {
          ai_mode?: string | null
          ai_paused?: boolean
          assigned_agent_id?: string | null
          closed_at?: string | null
          contact_id?: string
          created_at?: string
          deal_value?: number | null
          department_id?: string | null
          id?: string
          is_pinned?: boolean
          last_message_at?: string | null
          pinned_at?: string | null
          next_meeting?: string | null
          sales_status?: Database["public"]["Enums"]["sales_status"]
          status?: Database["public"]["Enums"]["conversation_status"]
          tags?: string[] | null
          tenant_id?: string
          unread_count?: number
          updated_at?: string
          wa_chat_id?: string | null
          whatsapp_connection_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conversations_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_whatsapp_connection_id_fkey"
            columns: ["whatsapp_connection_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_connections"
            referencedColumns: ["id"]
          },
        ]
      }
      departments: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "departments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      event_outbox: {
        Row: {
          aggregate_id: string | null
          aggregate_type: string | null
          attempts: number
          created_at: string
          event_type: string
          id: string
          last_error: string | null
          max_attempts: number
          next_retry_at: string
          payload: Json
          processed_at: string | null
          status: Database["public"]["Enums"]["outbox_status"]
          tenant_id: string
        }
        Insert: {
          aggregate_id?: string | null
          aggregate_type?: string | null
          attempts?: number
          created_at?: string
          event_type: string
          id?: string
          last_error?: string | null
          max_attempts?: number
          next_retry_at?: string
          payload?: Json
          processed_at?: string | null
          status?: Database["public"]["Enums"]["outbox_status"]
          tenant_id: string
        }
        Update: {
          aggregate_id?: string | null
          aggregate_type?: string | null
          attempts?: number
          created_at?: string
          event_type?: string
          id?: string
          last_error?: string | null
          max_attempts?: number
          next_retry_at?: string
          payload?: Json
          processed_at?: string | null
          status?: Database["public"]["Enums"]["outbox_status"]
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_outbox_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      inbound_events: {
        Row: {
          error_message: string | null
          event_type: string
          external_event_id: string
          id: string
          payload: Json
          payload_hash: string | null
          processed_at: string | null
          processing_status: Database["public"]["Enums"]["inbound_status"]
          received_at: string
          source: string
          tenant_id: string | null
        }
        Insert: {
          error_message?: string | null
          event_type: string
          external_event_id: string
          id?: string
          payload?: Json
          payload_hash?: string | null
          processed_at?: string | null
          processing_status?: Database["public"]["Enums"]["inbound_status"]
          received_at?: string
          source: string
          tenant_id?: string | null
        }
        Update: {
          error_message?: string | null
          event_type?: string
          external_event_id?: string
          id?: string
          payload?: Json
          payload_hash?: string | null
          processed_at?: string | null
          processing_status?: Database["public"]["Enums"]["inbound_status"]
          received_at?: string
          source?: string
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inbound_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      internal_notes: {
        Row: {
          conversation_id: string
          created_at: string
          id: string
          note_text: string
          tenant_id: string
          user_id: string
        }
        Insert: {
          conversation_id: string
          created_at?: string
          id?: string
          note_text: string
          tenant_id: string
          user_id: string
        }
        Update: {
          conversation_id?: string
          created_at?: string
          id?: string
          note_text?: string
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "internal_notes_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "internal_notes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_items: {
        Row: {
          content: string | null
          created_at: string
          file_url: string | null
          id: string
          indexed_at: string | null
          source_url: string | null
          status: Database["public"]["Enums"]["knowledge_status"]
          tenant_id: string
          title: string
          type: Database["public"]["Enums"]["knowledge_type"]
          updated_at: string
        }
        Insert: {
          content?: string | null
          created_at?: string
          file_url?: string | null
          id?: string
          indexed_at?: string | null
          source_url?: string | null
          status?: Database["public"]["Enums"]["knowledge_status"]
          tenant_id: string
          title: string
          type?: Database["public"]["Enums"]["knowledge_type"]
          updated_at?: string
        }
        Update: {
          content?: string | null
          created_at?: string
          file_url?: string | null
          id?: string
          indexed_at?: string | null
          source_url?: string | null
          status?: Database["public"]["Enums"]["knowledge_status"]
          tenant_id?: string
          title?: string
          type?: Database["public"]["Enums"]["knowledge_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          author_id: string | null
          content: string | null
          conversation_id: string
          created_at: string
          delivery_status: string | null
          direction: string | null
          id: string
          is_internal: boolean
          media_mime_type: string | null
          media_url: string | null
          message_type: Database["public"]["Enums"]["message_type"]
          metadata: Json | null
          role: Database["public"]["Enums"]["message_role"]
          wa_message_id: string | null
          zapi_message_id: string | null
        }
        Insert: {
          author_id?: string | null
          content?: string | null
          conversation_id: string
          created_at?: string
          delivery_status?: string | null
          direction?: string | null
          id?: string
          is_internal?: boolean
          media_mime_type?: string | null
          media_url?: string | null
          message_type?: Database["public"]["Enums"]["message_type"]
          metadata?: Json | null
          role?: Database["public"]["Enums"]["message_role"]
          wa_message_id?: string | null
          zapi_message_id?: string | null
        }
        Update: {
          author_id?: string | null
          content?: string | null
          conversation_id?: string
          created_at?: string
          delivery_status?: string | null
          direction?: string | null
          id?: string
          is_internal?: boolean
          media_mime_type?: string | null
          media_url?: string | null
          message_type?: Database["public"]["Enums"]["message_type"]
          metadata?: Json | null
          role?: Database["public"]["Enums"]["message_role"]
          wa_message_id?: string | null
          zapi_message_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      n8n_integrations: {
        Row: {
          base_url: string | null
          created_at: string
          credential_reference: string | null
          environment: string
          id: string
          last_error_at: string | null
          last_error_message: string | null
          last_success_at: string | null
          last_tested_at: string | null
          name: string
          status: string
          tenant_id: string
          updated_at: string
          webhook_path: string
          webhook_secret_reference: string | null
        }
        Insert: {
          base_url?: string | null
          created_at?: string
          credential_reference?: string | null
          environment?: string
          id?: string
          last_error_at?: string | null
          last_error_message?: string | null
          last_success_at?: string | null
          last_tested_at?: string | null
          name?: string
          status?: string
          tenant_id: string
          updated_at?: string
          webhook_path?: string
          webhook_secret_reference?: string | null
        }
        Update: {
          base_url?: string | null
          created_at?: string
          credential_reference?: string | null
          environment?: string
          id?: string
          last_error_at?: string | null
          last_error_message?: string | null
          last_success_at?: string | null
          last_tested_at?: string | null
          name?: string
          status?: string
          tenant_id?: string
          updated_at?: string
          webhook_path?: string
          webhook_secret_reference?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "n8n_integrations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_configs: {
        Row: {
          created_at: string
          features: Json | null
          id: string
          max_agents: number
          max_departments: number
          max_knowledge_items: number
          max_messages_per_month: number
          name: string
          tier: Database["public"]["Enums"]["plan_tier"]
        }
        Insert: {
          created_at?: string
          features?: Json | null
          id?: string
          max_agents?: number
          max_departments?: number
          max_knowledge_items?: number
          max_messages_per_month?: number
          name: string
          tier: Database["public"]["Enums"]["plan_tier"]
        }
        Update: {
          created_at?: string
          features?: Json | null
          id?: string
          max_agents?: number
          max_departments?: number
          max_knowledge_items?: number
          max_messages_per_month?: number
          name?: string
          tier?: Database["public"]["Enums"]["plan_tier"]
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          document_number: string | null
          document_type: string | null
          email: string | null
          full_name: string | null
          id: string
          is_available: boolean | null
          phone: string | null
          tenant_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          document_number?: string | null
          document_type?: string | null
          email?: string | null
          full_name?: string | null
          id?: string
          is_available?: boolean | null
          phone?: string | null
          tenant_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          document_number?: string | null
          document_type?: string | null
          email?: string | null
          full_name?: string | null
          id?: string
          is_available?: boolean | null
          phone?: string | null
          tenant_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      schedules: {
        Row: {
          conversation_id: string
          created_at: string
          created_by_user_id: string | null
          fail_reason: string | null
          id: string
          media: Json | null
          message_body: string | null
          run_at: string
          status: string
          tenant_id: string
          to_chat_id: string
        }
        Insert: {
          conversation_id: string
          created_at?: string
          created_by_user_id?: string | null
          fail_reason?: string | null
          id?: string
          media?: Json | null
          message_body?: string | null
          run_at: string
          status?: string
          tenant_id: string
          to_chat_id: string
        }
        Update: {
          conversation_id?: string
          created_at?: string
          created_by_user_id?: string | null
          fail_reason?: string | null
          id?: string
          media?: Json | null
          message_body?: string | null
          run_at?: string
          status?: string
          tenant_id?: string
          to_chat_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "schedules_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedules_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      system_logs: {
        Row: {
          action: string
          created_at: string
          details: Json | null
          id: string
          ip_address: string | null
          level: Database["public"]["Enums"]["log_level"]
          tenant_id: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          details?: Json | null
          id?: string
          ip_address?: string | null
          level?: Database["public"]["Enums"]["log_level"]
          tenant_id?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          details?: Json | null
          id?: string
          ip_address?: string | null
          level?: Database["public"]["Enums"]["log_level"]
          tenant_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "system_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          billing_cycle_start: string | null
          created_at: string
          id: string
          messages_this_month: number
          name: string
          plan: Database["public"]["Enums"]["plan_tier"]
          settings: Json | null
          slug: string | null
          status: string
          updated_at: string
        }
        Insert: {
          billing_cycle_start?: string | null
          created_at?: string
          id?: string
          messages_this_month?: number
          name: string
          plan?: Database["public"]["Enums"]["plan_tier"]
          settings?: Json | null
          slug?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          billing_cycle_start?: string | null
          created_at?: string
          id?: string
          messages_this_month?: number
          name?: string
          plan?: Database["public"]["Enums"]["plan_tier"]
          settings?: Json | null
          slug?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_connection_access: {
        Row: {
          can_manage: boolean
          can_reply: boolean
          can_view: boolean
          connection_id: string
          created_at: string
          id: string
          tenant_id: string
          user_id: string
        }
        Insert: {
          can_manage?: boolean
          can_reply?: boolean
          can_view?: boolean
          connection_id: string
          created_at?: string
          id?: string
          tenant_id: string
          user_id: string
        }
        Update: {
          can_manage?: boolean
          can_reply?: boolean
          can_view?: boolean
          connection_id?: string
          created_at?: string
          id?: string
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_connection_access_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_connection_access_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          tenant_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          tenant_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          tenant_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_delivery_attempts: {
        Row: {
          created_at: string
          duration_ms: number | null
          error_message: string | null
          event_id: string | null
          http_status: number | null
          id: string
          response_excerpt: string | null
          success: boolean
          target: string
          tenant_id: string | null
        }
        Insert: {
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          event_id?: string | null
          http_status?: number | null
          id?: string
          response_excerpt?: string | null
          success?: boolean
          target: string
          tenant_id?: string | null
        }
        Update: {
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          event_id?: string | null
          http_status?: number | null
          id?: string
          response_excerpt?: string | null
          success?: boolean
          target?: string
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "webhook_delivery_attempts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_connections: {
        Row: {
          api_url: string | null
          connection_error: string | null
          created_at: string
          credential_reference: string | null
          id: string
          last_connected_at: string | null
          last_disconnected_at: string | null
          last_health_check_at: string | null
          metadata: Json
          name: string
          phone_number: string | null
          provider_instance_id: string | null
          provider_session_id: string | null
          provider_type: Database["public"]["Enums"]["provider_type"]
          qr_status: string
          status: string
          sync_status: string | null
          tenant_id: string
          updated_at: string
          webhook_status: string
          webhook_url: string | null
          zapi_client_token: string | null
          zapi_instance_id: string | null
          zapi_token: string | null
        }
        Insert: {
          api_url?: string | null
          connection_error?: string | null
          created_at?: string
          credential_reference?: string | null
          id?: string
          last_connected_at?: string | null
          last_disconnected_at?: string | null
          last_health_check_at?: string | null
          metadata?: Json
          name?: string
          phone_number?: string | null
          provider_instance_id?: string | null
          provider_session_id?: string | null
          provider_type?: Database["public"]["Enums"]["provider_type"]
          qr_status?: string
          status?: string
          sync_status?: string | null
          tenant_id: string
          updated_at?: string
          webhook_status?: string
          webhook_url?: string | null
          zapi_client_token?: string | null
          zapi_instance_id?: string | null
          zapi_token?: string | null
        }
        Update: {
          api_url?: string | null
          connection_error?: string | null
          created_at?: string
          credential_reference?: string | null
          id?: string
          last_connected_at?: string | null
          last_disconnected_at?: string | null
          last_health_check_at?: string | null
          metadata?: Json
          name?: string
          phone_number?: string | null
          provider_instance_id?: string | null
          provider_session_id?: string | null
          provider_type?: Database["public"]["Enums"]["provider_type"]
          qr_status?: string
          status?: string
          sync_status?: string | null
          tenant_id?: string
          updated_at?: string
          webhook_status?: string
          webhook_url?: string | null
          zapi_client_token?: string | null
          zapi_instance_id?: string | null
          zapi_token?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_connections_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_access_connection: {
        Args: { _connection_id: string }
        Returns: boolean
      }
      get_user_tenant_id: { Args: never; Returns: string }
      get_whatsapp_connections_safe: {
        Args: never
        Returns: {
          connection_error: string
          created_at: string
          has_credentials: boolean
          id: string
          last_connected_at: string
          last_disconnected_at: string
          last_health_check_at: string
          name: string
          phone_number: string
          provider_type: Database["public"]["Enums"]["provider_type"]
          qr_status: string
          status: string
          webhook_status: string
        }[]
      }
      has_role: {
        Args: { _role: Database["public"]["Enums"]["app_role"] }
        Returns: boolean
      }
      has_role_in_tenant: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _tenant_id: string
        }
        Returns: boolean
      }
      is_tenant_member: { Args: { _tenant_id: string }; Returns: boolean }
    }
    Enums: {
      app_role: "super_admin" | "tenant_admin" | "agent" | "viewer"
      conversation_status: "open" | "waiting" | "closed" | "archived"
      inbound_status:
        | "received"
        | "processing"
        | "processed"
        | "failed"
        | "duplicate"
      knowledge_status: "processing" | "indexed" | "error"
      knowledge_type: "text" | "pdf" | "url"
      log_level: "info" | "warn" | "error" | "critical"
      message_role: "contact" | "agent" | "ai" | "system"
      message_type:
        | "text"
        | "audio"
        | "image"
        | "document"
        | "video"
        | "sticker"
        | "location"
      outbox_status: "pending" | "processing" | "sent" | "failed" | "dead"
      plan_tier: "trial" | "free" | "pro" | "enterprise"
      provider_type: "n8n_unofficial" | "whatsapp_cloud_api" | "custom"
      sales_status: "none" | "lead" | "negotiation" | "won" | "lost"
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
      app_role: ["super_admin", "tenant_admin", "agent", "viewer"],
      conversation_status: ["open", "waiting", "closed", "archived"],
      inbound_status: [
        "received",
        "processing",
        "processed",
        "failed",
        "duplicate",
      ],
      knowledge_status: ["processing", "indexed", "error"],
      knowledge_type: ["text", "pdf", "url"],
      log_level: ["info", "warn", "error", "critical"],
      message_role: ["contact", "agent", "ai", "system"],
      message_type: [
        "text",
        "audio",
        "image",
        "document",
        "video",
        "sticker",
        "location",
      ],
      outbox_status: ["pending", "processing", "sent", "failed", "dead"],
      plan_tier: ["trial", "free", "pro", "enterprise"],
      provider_type: ["n8n_unofficial", "whatsapp_cloud_api", "custom"],
      sales_status: ["none", "lead", "negotiation", "won", "lost"],
    },
  },
} as const

