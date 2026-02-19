
-- Add document fields to profiles table
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS document_type text CHECK (document_type IN ('cpf', 'cnpj')),
  ADD COLUMN IF NOT EXISTS document_number text;

-- Update handle_new_user to also capture document fields from metadata
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (user_id, email, full_name, document_type, document_number)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    NEW.raw_user_meta_data->>'document_type',
    NEW.raw_user_meta_data->>'document_number'
  );
  RETURN NEW;
END;
$function$;
