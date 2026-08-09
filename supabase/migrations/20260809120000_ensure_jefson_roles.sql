-- Ensure the user exists and has the correct role
DO $$
DECLARE
    target_user_id UUID;
BEGIN
    -- Get user ID for jefson.ti@gmail.com from auth.users
    -- We can only do this if we have permission to read auth.users, 
    -- but usually in migrations we use it carefully.
    -- However, better to target by id if we knew it.
    -- Since we don't, we'll try to use a trigger or a function that can access it.
    
    -- For now, let's assume we can find the user in public.profiles if it exists
    SELECT id INTO target_user_id FROM public.profiles WHERE email = 'jefson.ti@gmail.com' LIMIT 1;
    
    IF target_user_id IS NOT NULL THEN
        -- Insert or update user_roles
        -- Check if 'super_admin' exists in the enum
        IF EXISTS (SELECT 1 FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid WHERE t.typname = 'app_role' AND e.enumlabel = 'super_admin') THEN
            INSERT INTO public.user_roles (user_id, role)
            VALUES (target_user_id, 'super_admin')
            ON CONFLICT (user_id, role) DO UPDATE SET role = 'super_admin';
        ELSE
            -- Fallback to 'admin' if 'super_admin' doesn't exist
            INSERT INTO public.user_roles (user_id, role)
            VALUES (target_user_id, 'admin')
            ON CONFLICT (user_id, role) DO UPDATE SET role = 'admin';
        END IF;
    END IF;
END $$;

-- Also ensure RLS is not blocking common admin tasks
-- (This is just a safety measure for the developer environment)
