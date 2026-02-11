-- ============================================================
-- Full Schema Dump - Public Schema
-- Generated: 2026-02-10
-- ============================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- ============================================================
-- TABLES
-- ============================================================

CREATE TABLE public.academic_years (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  is_current boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  school_id uuid NOT NULL,
  is_archived boolean NOT NULL DEFAULT false,
  archived_at timestamp with time zone,
  archived_by uuid,
  PRIMARY KEY (id)
);

CREATE TABLE public.schools (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  code text NOT NULL UNIQUE,
  logo_url text,
  theme text DEFAULT 'default'::text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  PRIMARY KEY (id)
);

ALTER TABLE public.academic_years ADD FOREIGN KEY (school_id) REFERENCES public.schools(id);

CREATE TABLE public.admissions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  student_name text NOT NULL,
  lrn text,
  level text NOT NULL,
  school text,
  school_id uuid NOT NULL,
  academic_year_id uuid NOT NULL,
  birth_date date,
  gender text,
  mother_maiden_name text,
  mother_contact text,
  father_name text,
  father_contact text,
  phil_address text,
  uae_address text,
  previous_school text,
  parent_email text,
  status text NOT NULL DEFAULT 'pending'::text,
  reviewed_by uuid,
  reviewed_at timestamp with time zone,
  rejection_reason text,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY (id),
  FOREIGN KEY (school_id) REFERENCES public.schools(id),
  FOREIGN KEY (academic_year_id) REFERENCES public.academic_years(id)
);

CREATE TABLE public.admission_audit_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  admission_id uuid NOT NULL,
  action text NOT NULL,
  performed_by uuid,
  details jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY (id),
  FOREIGN KEY (admission_id) REFERENCES public.admissions(id)
);

CREATE TABLE public.students (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  lrn text NOT NULL UNIQUE,
  first_name text NOT NULL,
  middle_name text,
  last_name text NOT NULL,
  suffix text,
  birth_date date,
  gender text,
  grade_level text,
  section text,
  school_id uuid NOT NULL,
  academic_year_id uuid NOT NULL,
  is_active boolean DEFAULT true,
  enrollment_status text DEFAULT 'enrolled'::text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  PRIMARY KEY (id),
  FOREIGN KEY (school_id) REFERENCES public.schools(id),
  FOREIGN KEY (academic_year_id) REFERENCES public.academic_years(id)
);

CREATE TABLE public.announcements (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  school_id uuid,
  academic_year_id uuid,
  title text NOT NULL,
  content text NOT NULL,
  target_audience text[] DEFAULT ARRAY['all'::text],
  target_grade_levels text[],
  priority text DEFAULT 'normal'::text,
  is_pinned boolean DEFAULT false,
  published_at timestamp with time zone DEFAULT now(),
  expires_at timestamp with time zone,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  PRIMARY KEY (id),
  FOREIGN KEY (school_id) REFERENCES public.schools(id),
  FOREIGN KEY (academic_year_id) REFERENCES public.academic_years(id)
);

CREATE TABLE public.archived_student_status (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL,
  academic_year_id uuid NOT NULL,
  school_id uuid NOT NULL,
  was_active boolean NOT NULL DEFAULT true,
  grade_level text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY (id),
  UNIQUE (student_id, academic_year_id),
  FOREIGN KEY (student_id) REFERENCES public.students(id),
  FOREIGN KEY (academic_year_id) REFERENCES public.academic_years(id),
  FOREIGN KEY (school_id) REFERENCES public.schools(id)
);

CREATE TABLE public.student_assessments (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL,
  academic_year_id uuid NOT NULL,
  school_id uuid NOT NULL,
  total_fees numeric DEFAULT 0,
  total_paid numeric DEFAULT 0,
  balance numeric DEFAULT 0,
  status text DEFAULT 'pending'::text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  PRIMARY KEY (id),
  FOREIGN KEY (student_id) REFERENCES public.students(id),
  FOREIGN KEY (academic_year_id) REFERENCES public.academic_years(id),
  FOREIGN KEY (school_id) REFERENCES public.schools(id)
);

CREATE TABLE public.fee_catalog (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  name text NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  category text,
  grade_level text,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  PRIMARY KEY (id),
  FOREIGN KEY (school_id) REFERENCES public.schools(id)
);

CREATE TABLE public.assessment_items (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  assessment_id uuid NOT NULL,
  fee_catalog_id uuid,
  name text NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  is_mandatory boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY (id),
  FOREIGN KEY (assessment_id) REFERENCES public.student_assessments(id),
  FOREIGN KEY (fee_catalog_id) REFERENCES public.fee_catalog(id)
);

CREATE TABLE public.student_assignments (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  subject_id uuid,
  grade_level text,
  school_id uuid NOT NULL,
  academic_year_id uuid NOT NULL,
  due_date timestamp with time zone,
  total_points numeric DEFAULT 100,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  PRIMARY KEY (id),
  FOREIGN KEY (school_id) REFERENCES public.schools(id),
  FOREIGN KEY (academic_year_id) REFERENCES public.academic_years(id)
);

CREATE TABLE public.assignment_submissions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  assignment_id uuid NOT NULL,
  student_id uuid NOT NULL,
  submitted_at timestamp with time zone,
  score numeric,
  feedback text,
  status text DEFAULT 'pending'::text,
  attachments jsonb,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  PRIMARY KEY (id),
  UNIQUE (assignment_id, student_id),
  FOREIGN KEY (assignment_id) REFERENCES public.student_assignments(id),
  FOREIGN KEY (student_id) REFERENCES public.students(id)
);

CREATE TABLE public.audit_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid,
  lrn text,
  action text NOT NULL,
  status text NOT NULL,
  ip_address text,
  country_code text,
  city text,
  user_agent text,
  error_message text,
  school text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY (id)
);

CREATE TABLE public.auth_activity_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid,
  user_email text,
  user_name text,
  action text NOT NULL,
  ip_address text,
  user_agent text,
  status text DEFAULT 'success'::text,
  error_message text,
  created_at timestamp with time zone DEFAULT now(),
  PRIMARY KEY (id)
);

CREATE TABLE public.balance_carry_forwards (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL,
  school_id uuid NOT NULL,
  from_academic_year_id uuid NOT NULL,
  to_academic_year_id uuid NOT NULL,
  from_assessment_id uuid NOT NULL,
  to_assessment_id uuid,
  carried_amount numeric NOT NULL DEFAULT 0,
  carried_at timestamp with time zone NOT NULL DEFAULT now(),
  carried_by uuid,
  notes text,
  PRIMARY KEY (id),
  UNIQUE (student_id, from_academic_year_id, to_academic_year_id),
  FOREIGN KEY (student_id) REFERENCES public.students(id),
  FOREIGN KEY (school_id) REFERENCES public.schools(id),
  FOREIGN KEY (from_academic_year_id) REFERENCES public.academic_years(id),
  FOREIGN KEY (to_academic_year_id) REFERENCES public.academic_years(id),
  FOREIGN KEY (from_assessment_id) REFERENCES public.student_assessments(id),
  FOREIGN KEY (to_assessment_id) REFERENCES public.student_assessments(id)
);

CREATE TABLE public.books (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  title text NOT NULL,
  grade_level integer NOT NULL,
  subject text,
  cover_url text,
  pdf_url text,
  page_count integer DEFAULT 0,
  status text NOT NULL DEFAULT 'processing'::text,
  school text,
  uploaded_by uuid,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  index_status text DEFAULT 'pending'::text,
  PRIMARY KEY (id)
);

CREATE TABLE public.book_pages (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  book_id uuid NOT NULL,
  page_number integer NOT NULL,
  image_url text NOT NULL,
  thumbnail_url text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  detected_page_number text,
  page_type text DEFAULT 'unknown'::text,
  detection_confidence numeric,
  detection_completed boolean DEFAULT false,
  PRIMARY KEY (id),
  UNIQUE (book_id, page_number),
  FOREIGN KEY (book_id) REFERENCES public.books(id)
);

CREATE TABLE public.book_annotations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  book_id uuid NOT NULL,
  page_number integer NOT NULL,
  user_id uuid NOT NULL,
  type text NOT NULL,
  data jsonb NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY (id),
  FOREIGN KEY (book_id) REFERENCES public.books(id)
);

CREATE TABLE public.book_page_index (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  book_id uuid NOT NULL,
  page_id uuid NOT NULL,
  page_number integer NOT NULL,
  extracted_text text,
  topics text[] DEFAULT '{}'::text[],
  keywords text[] DEFAULT '{}'::text[],
  chapter_title text,
  summary text,
  indexed_at timestamp with time zone,
  index_status text NOT NULL DEFAULT 'pending'::text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  search_vector tsvector,
  PRIMARY KEY (id),
  UNIQUE (book_id, page_id),
  FOREIGN KEY (book_id) REFERENCES public.books(id),
  FOREIGN KEY (page_id) REFERENCES public.book_pages(id)
);

CREATE TABLE public.canva_connections (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  access_token text NOT NULL,
  refresh_token text NOT NULL,
  token_expires_at timestamp with time zone NOT NULL,
  canva_user_id text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  PRIMARY KEY (id)
);

CREATE TABLE public.canva_oauth_states (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  state_key text NOT NULL,
  user_id uuid NOT NULL,
  code_verifier text NOT NULL,
  redirect_uri text NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  expires_at timestamp with time zone DEFAULT (now() + '00:10:00'::interval),
  PRIMARY KEY (id)
);

CREATE TABLE public.subjects (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  code text NOT NULL,
  school_id uuid NOT NULL,
  grade_level text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  PRIMARY KEY (id),
  FOREIGN KEY (school_id) REFERENCES public.schools(id)
);

CREATE TABLE public.teachers (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  school_id uuid NOT NULL,
  employee_id text,
  specialization text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  PRIMARY KEY (id),
  FOREIGN KEY (school_id) REFERENCES public.schools(id)
);

CREATE TABLE public.class_schedules (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  academic_year_id uuid NOT NULL,
  subject_id uuid NOT NULL,
  grade_level text NOT NULL,
  section text,
  day_of_week integer NOT NULL,
  start_time time without time zone NOT NULL,
  end_time time without time zone NOT NULL,
  room text,
  teacher_id uuid,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  PRIMARY KEY (id),
  FOREIGN KEY (school_id) REFERENCES public.schools(id),
  FOREIGN KEY (academic_year_id) REFERENCES public.academic_years(id),
  FOREIGN KEY (subject_id) REFERENCES public.subjects(id),
  FOREIGN KEY (teacher_id) REFERENCES public.teachers(id)
);

CREATE TABLE public.clearance_rules (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  rule_name text NOT NULL,
  rule_type text NOT NULL,
  threshold numeric DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY (id),
  FOREIGN KEY (school_id) REFERENCES public.schools(id)
);

CREATE TABLE public.conversations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  type text NOT NULL DEFAULT 'private'::text,
  name text,
  created_by uuid NOT NULL,
  school_id uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY (id),
  FOREIGN KEY (school_id) REFERENCES public.schools(id)
);

CREATE TABLE public.conversation_participants (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL,
  user_id uuid NOT NULL,
  role text NOT NULL DEFAULT 'member'::text,
  last_read_at timestamp with time zone DEFAULT now(),
  joined_at timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY (id),
  FOREIGN KEY (conversation_id) REFERENCES public.conversations(id)
);

CREATE TABLE public.data_exports (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  school_id uuid,
  academic_year_id uuid,
  export_type text NOT NULL,
  table_name text NOT NULL,
  record_count integer,
  file_name text,
  file_size_bytes bigint,
  exported_at timestamp with time zone DEFAULT now(),
  PRIMARY KEY (id),
  FOREIGN KEY (school_id) REFERENCES public.schools(id),
  FOREIGN KEY (academic_year_id) REFERENCES public.academic_years(id)
);

CREATE TABLE public.data_validation_issues (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL,
  school_id uuid NOT NULL,
  issue_type text NOT NULL,
  description text NOT NULL,
  severity text NOT NULL DEFAULT 'warning'::text,
  field_name text,
  is_resolved boolean NOT NULL DEFAULT false,
  resolved_by uuid,
  resolved_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY (id),
  FOREIGN KEY (student_id) REFERENCES public.students(id),
  FOREIGN KEY (school_id) REFERENCES public.schools(id)
);

CREATE TABLE public.discounts (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  type text NOT NULL,
  value numeric NOT NULL,
  school_id uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  PRIMARY KEY (id),
  FOREIGN KEY (school_id) REFERENCES public.schools(id)
);
