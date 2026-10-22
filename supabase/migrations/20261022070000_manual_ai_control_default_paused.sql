-- AI control is explicit and user-owned.
-- New conversations start with AI paused. The UI/user must opt in to activate it.
ALTER TABLE public.conversations
  ALTER COLUMN ai_paused SET DEFAULT true;
