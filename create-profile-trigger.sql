-- ============================================================
-- SQL Script: Create Profile Trigger on User Signup
-- Description: Automatically creates a profile record in public.profiles
--              when a new user registers in auth.users.
--              Bypasses RLS using SECURITY DEFINER.
-- ============================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  -- Automatically confirm email addresses on signup
  UPDATE auth.users
  SET email_confirmed_at = COALESCE(email_confirmed_at, now()),
      confirmed_at = COALESCE(confirmed_at, now())
  WHERE id = new.id;

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
