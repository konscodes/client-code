-- Fix function search_path security issue
-- This prevents potential SQL injection via search_path manipulation
-- Reference: https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable

-- Fix search_path for ID generation functions
ALTER FUNCTION public.next_job_id() SET search_path = public;
ALTER FUNCTION public.next_client_id() SET search_path = public;
ALTER FUNCTION public.next_order_id() SET search_path = public;

