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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      comments: {
        Row: {
          author_id: string
          body: string
          created_at: string
          id: string
          owner_id: string
          parent_id: string | null
          target_id: string
          target_type: Database["public"]["Enums"]["comment_target_type"]
          updated_at: string
        }
        Insert: {
          author_id: string
          body: string
          created_at?: string
          id?: string
          owner_id: string
          parent_id?: string | null
          target_id: string
          target_type: Database["public"]["Enums"]["comment_target_type"]
          updated_at?: string
        }
        Update: {
          author_id?: string
          body?: string
          created_at?: string
          id?: string
          owner_id?: string
          parent_id?: string | null
          target_id?: string
          target_type?: Database["public"]["Enums"]["comment_target_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "comments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "comments"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_logs: {
        Row: {
          closing_mood: Database["public"]["Enums"]["evening_mood"] | null
          created_at: string
          daily_intention: string | null
          gratitude: string | null
          gratitude_private: boolean
          id: string
          improvement: string | null
          log_date: string
          morning_energy: number | null
          morning_mood: Database["public"]["Enums"]["morning_mood"] | null
          owner_id: string
          productivity_rating: number | null
          reflection: string | null
          reflection_private: boolean
          sprint_id: string | null
          updated_at: string
          win: string | null
        }
        Insert: {
          closing_mood?: Database["public"]["Enums"]["evening_mood"] | null
          created_at?: string
          daily_intention?: string | null
          gratitude?: string | null
          gratitude_private?: boolean
          id?: string
          improvement?: string | null
          log_date: string
          morning_energy?: number | null
          morning_mood?: Database["public"]["Enums"]["morning_mood"] | null
          owner_id: string
          productivity_rating?: number | null
          reflection?: string | null
          reflection_private?: boolean
          sprint_id?: string | null
          updated_at?: string
          win?: string | null
        }
        Update: {
          closing_mood?: Database["public"]["Enums"]["evening_mood"] | null
          created_at?: string
          daily_intention?: string | null
          gratitude?: string | null
          gratitude_private?: boolean
          id?: string
          improvement?: string | null
          log_date?: string
          morning_energy?: number | null
          morning_mood?: Database["public"]["Enums"]["morning_mood"] | null
          owner_id?: string
          productivity_rating?: number | null
          reflection?: string | null
          reflection_private?: boolean
          sprint_id?: string | null
          updated_at?: string
          win?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "daily_logs_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_logs_sprint_id_fkey"
            columns: ["sprint_id"]
            isOneToOne: false
            referencedRelation: "sprints"
            referencedColumns: ["id"]
          },
        ]
      }
      invites: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          created_at: string
          expires_at: string
          id: string
          invite_type: Database["public"]["Enums"]["invite_type"]
          invitee_email: string
          inviter_id: string
          status: Database["public"]["Enums"]["invite_status"]
          token: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          expires_at: string
          id?: string
          invite_type: Database["public"]["Enums"]["invite_type"]
          invitee_email: string
          inviter_id: string
          status?: Database["public"]["Enums"]["invite_status"]
          token: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          invite_type?: Database["public"]["Enums"]["invite_type"]
          invitee_email?: string
          inviter_id?: string
          status?: Database["public"]["Enums"]["invite_status"]
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "invites_accepted_by_fkey"
            columns: ["accepted_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invites_inviter_id_fkey"
            columns: ["inviter_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_preferences: {
        Row: {
          evening_reminder: boolean
          morning_reminder: boolean
          reminder_time_evening: string
          reminder_time_morning: string
          reviewer_comments: boolean
          timezone: string
          updated_at: string
          user_id: string
          weekly_summary: boolean
        }
        Insert: {
          evening_reminder?: boolean
          morning_reminder?: boolean
          reminder_time_evening?: string
          reminder_time_morning?: string
          reviewer_comments?: boolean
          timezone?: string
          updated_at?: string
          user_id: string
          weekly_summary?: boolean
        }
        Update: {
          evening_reminder?: boolean
          morning_reminder?: boolean
          reminder_time_evening?: string
          reminder_time_morning?: string
          reviewer_comments?: boolean
          timezone?: string
          updated_at?: string
          user_id?: string
          weekly_summary?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "notification_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      priorities: {
        Row: {
          created_at: string
          daily_log_id: string
          description: string
          id: string
          position: number
          status: Database["public"]["Enums"]["priority_status"]
          target_hours: number
        }
        Insert: {
          created_at?: string
          daily_log_id: string
          description: string
          id?: string
          position: number
          status?: Database["public"]["Enums"]["priority_status"]
          target_hours?: number
        }
        Update: {
          created_at?: string
          daily_log_id?: string
          description?: string
          id?: string
          position?: number
          status?: Database["public"]["Enums"]["priority_status"]
          target_hours?: number
        }
        Relationships: [
          {
            foreignKeyName: "priorities_daily_log_id_fkey"
            columns: ["daily_log_id"]
            isOneToOne: false
            referencedRelation: "daily_logs"
            referencedColumns: ["id"]
          },
        ]
      }
      recurring_templates: {
        Row: {
          category: Database["public"]["Enums"]["task_category"]
          created_at: string
          id: string
          is_active: boolean
          name: string
          owner_id: string
          target_hours: number
          updated_at: string
        }
        Insert: {
          category: Database["public"]["Enums"]["task_category"]
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          owner_id: string
          target_hours?: number
          updated_at?: string
        }
        Update: {
          category?: Database["public"]["Enums"]["task_category"]
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          owner_id?: string
          target_hours?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "recurring_templates_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      reviewer_relationships: {
        Row: {
          created_at: string
          id: string
          owner_id: string
          reviewer_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          owner_id: string
          reviewer_id: string
        }
        Update: {
          created_at?: string
          id?: string
          owner_id?: string
          reviewer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reviewer_relationships_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviewer_relationships_reviewer_id_fkey"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      sprints: {
        Row: {
          created_at: string
          id: string
          notes: string | null
          owner_id: string
          reflection_improve: string | null
          reflection_lesson: string | null
          reflection_went_well: string | null
          updated_at: string
          week_start_date: string
        }
        Insert: {
          created_at?: string
          id?: string
          notes?: string | null
          owner_id: string
          reflection_improve?: string | null
          reflection_lesson?: string | null
          reflection_went_well?: string | null
          updated_at?: string
          week_start_date: string
        }
        Update: {
          created_at?: string
          id?: string
          notes?: string | null
          owner_id?: string
          reflection_improve?: string | null
          reflection_lesson?: string | null
          reflection_went_well?: string | null
          updated_at?: string
          week_start_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "sprints_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          category: Database["public"]["Enums"]["task_category"]
          created_at: string
          id: string
          is_recurring: boolean
          name: string
          owner_id: string
          position: number
          sprint_id: string
          target_hours: number
          template_id: string | null
          updated_at: string
        }
        Insert: {
          category: Database["public"]["Enums"]["task_category"]
          created_at?: string
          id?: string
          is_recurring?: boolean
          name: string
          owner_id: string
          position?: number
          sprint_id: string
          target_hours?: number
          template_id?: string | null
          updated_at?: string
        }
        Update: {
          category?: Database["public"]["Enums"]["task_category"]
          created_at?: string
          id?: string
          is_recurring?: boolean
          name?: string
          owner_id?: string
          position?: number
          sprint_id?: string
          target_hours?: number
          template_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_sprint_id_fkey"
            columns: ["sprint_id"]
            isOneToOne: false
            referencedRelation: "sprints"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "recurring_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      note_pages: {
        Row: {
          id: string
          owner_id: string
          parent_id: string | null
          title: string
          icon: string | null
          kind: string
          body: string
          enhanced_body: string | null
          transcript: string | null
          meeting_date: string | null
          attendees: string | null
          position: number
          is_archived: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          owner_id: string
          parent_id?: string | null
          title?: string
          icon?: string | null
          kind?: string
          body?: string
          enhanced_body?: string | null
          transcript?: string | null
          meeting_date?: string | null
          attendees?: string | null
          position?: number
          is_archived?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          owner_id?: string
          parent_id?: string | null
          title?: string
          icon?: string | null
          kind?: string
          body?: string
          enhanced_body?: string | null
          transcript?: string | null
          meeting_date?: string | null
          attendees?: string | null
          position?: number
          is_archived?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "note_pages_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "note_pages_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "note_pages"
            referencedColumns: ["id"]
          },
        ]
      }
      todo_sections: {
        Row: {
          id: string
          owner_id: string
          parent_id: string | null
          name: string
          position: number
          is_collapsed: boolean
          source_page_id: string | null
          archived_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          owner_id: string
          parent_id?: string | null
          name: string
          position?: number
          is_collapsed?: boolean
          source_page_id?: string | null
          archived_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          owner_id?: string
          parent_id?: string | null
          name?: string
          position?: number
          is_collapsed?: boolean
          source_page_id?: string | null
          archived_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "todo_sections_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "todo_sections_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "todo_sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "todo_sections_source_page_id_fkey"
            columns: ["source_page_id"]
            isOneToOne: false
            referencedRelation: "note_pages"
            referencedColumns: ["id"]
          },
        ]
      }
      todo_tasks: {
        Row: {
          id: string
          owner_id: string
          section_id: string
          title: string
          description: string | null
          is_completed: boolean
          completed_at: string | null
          position: number
          source_page_id: string | null
          due_date: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          owner_id: string
          section_id: string
          title: string
          description?: string | null
          is_completed?: boolean
          completed_at?: string | null
          position?: number
          source_page_id?: string | null
          due_date?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          owner_id?: string
          section_id?: string
          title?: string
          description?: string | null
          is_completed?: boolean
          completed_at?: string | null
          position?: number
          source_page_id?: string | null
          due_date?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "todo_tasks_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "todo_tasks_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "todo_sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "todo_tasks_source_page_id_fkey"
            columns: ["source_page_id"]
            isOneToOne: false
            referencedRelation: "note_pages"
            referencedColumns: ["id"]
          },
        ]
      }
      xp_events: {
        Row: {
          id: string
          owner_id: string
          amount: number
          reason: string
          dedupe_key: string
          created_at: string
        }
        Insert: {
          id?: string
          owner_id: string
          amount: number
          reason: string
          dedupe_key: string
          created_at?: string
        }
        Update: {
          id?: string
          owner_id?: string
          amount?: number
          reason?: string
          dedupe_key?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "xp_events_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      xp_wagers: {
        Row: {
          id: string
          owner_id: string
          week_start: string
          stake: number
          status: string
          created_at: string
          resolved_at: string | null
        }
        Insert: {
          id?: string
          owner_id: string
          week_start: string
          stake: number
          status?: string
          created_at?: string
          resolved_at?: string | null
        }
        Update: {
          id?: string
          owner_id?: string
          week_start?: string
          stake?: number
          status?: string
          created_at?: string
          resolved_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "xp_wagers_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_achievements: {
        Row: {
          id: string
          owner_id: string
          achievement_id: string
          unlocked_at: string
        }
        Insert: {
          id?: string
          owner_id: string
          achievement_id: string
          unlocked_at?: string
        }
        Update: {
          id?: string
          owner_id?: string
          achievement_id?: string
          unlocked_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_achievements_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      time_entries: {
        Row: {
          created_at: string
          daily_log_id: string
          duration_hours: number
          energy_during: number | null
          id: string
          is_private: boolean
          notes: string | null
          owner_id: string
          start_time: string | null
          task_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          daily_log_id: string
          duration_hours: number
          energy_during?: number | null
          id?: string
          is_private?: boolean
          notes?: string | null
          owner_id: string
          start_time?: string | null
          task_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          daily_log_id?: string
          duration_hours?: number
          energy_during?: number | null
          id?: string
          is_private?: boolean
          notes?: string | null
          owner_id?: string
          start_time?: string | null
          task_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "time_entries_daily_log_id_fkey"
            columns: ["daily_log_id"]
            isOneToOne: false
            referencedRelation: "daily_logs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_entries_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_entries_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string
          full_name: string | null
          id: string
          updated_at: string
          ai_persona: "drill_sergeant" | "nurturer" | "nietzsche" | "rational"
          week_start_day: number
          todo_auto_archive: boolean
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email: string
          full_name?: string | null
          id: string
          updated_at?: string
          ai_persona?: "drill_sergeant" | "nurturer" | "nietzsche" | "rational"
          week_start_day?: number
          todo_auto_archive?: boolean
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string
          full_name?: string | null
          id?: string
          updated_at?: string
          ai_persona?: "drill_sergeant" | "nurturer" | "nietzsche" | "rational"
          week_start_day?: number
          todo_auto_archive?: boolean
        }
        Relationships: []
      }
      ai_conversations: {
        Row: {
          id: string
          user_id: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      ai_messages: {
        Row: {
          id: string
          conversation_id: string
          role: string
          content: string
          is_summary: boolean
          created_at: string
        }
        Insert: {
          id?: string
          conversation_id: string
          role: string
          content: string
          is_summary?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          conversation_id?: string
          role?: string
          content?: string
          is_summary?: boolean
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "ai_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_view_owner: { Args: { target_owner: string }; Returns: boolean }
      is_reviewer_of: { Args: { target_owner: string }; Returns: boolean }
      total_xp: { Args: Record<string, never>; Returns: number }
      gamification_stats: { Args: Record<string, never>; Returns: Json }
    }
    Enums: {
      comment_target_type: "daily_log" | "sprint"
      evening_mood:
        | "accomplished"
        | "okay"
        | "exhausted"
        | "frustrated"
        | "proud"
      invite_status: "pending" | "accepted" | "revoked" | "expired"
      invite_type: "reviewer" | "owner"
      morning_mood: "energised" | "neutral" | "tired" | "stressed" | "pumped"
      priority_status: "pending" | "done" | "partial" | "missed"
      task_category:
        | "strong_signal"
        | "weak_signal"
        | "strong_noise"
        | "weak_noise"
        | "personal"
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
      comment_target_type: ["daily_log", "sprint"],
      evening_mood: [
        "accomplished",
        "okay",
        "exhausted",
        "frustrated",
        "proud",
      ],
      invite_status: ["pending", "accepted", "revoked", "expired"],
      invite_type: ["reviewer", "owner"],
      morning_mood: ["energised", "neutral", "tired", "stressed", "pumped"],
      priority_status: ["pending", "done", "partial", "missed"],
      task_category: [
        "strong_signal",
        "weak_signal",
        "strong_noise",
        "weak_noise",
        "personal",
      ],
    },
  },
} as const
