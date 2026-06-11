-- ============================================================
-- SQL Script: Create Profile Trigger on User Signup
-- Description: Automatically creates a profile record in public.profiles
--              when a new user registers in auth.users.
--              Bypasses RLS using SECURITY DEFINER.
-- ============================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, username, display_name, avatar_url)
  VALUES (
    new.id,
    coalesce(new.raw_user_meta_data->>'username', 'user_' || substr(new.id::text, 1, 8)),
    coalesce(new.raw_user_meta_data->>'display_name', 'New User'),
    'data:image/png;base64,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'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger execution
CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
