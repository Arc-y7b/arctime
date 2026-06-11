-- ============================================================
-- ArcTime Database Schema — Run this in Supabase SQL Editor
-- ============================================================
-- Create all tables first, then add policies to avoid
-- "relation does not exist" errors on forward references.
-- ============================================================

-- 1. CREATE ALL TABLES
-- ============================================================

CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT UNIQUE,
  display_name TEXT,
  avatar_url TEXT DEFAULT 'data:image/png;base64,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',
  timezone TEXT DEFAULT 'BST',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  day_index SMALLINT NOT NULL CHECK (day_index >= 0 AND day_index <= 6),
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  category TEXT DEFAULT 'hangout',
  notes TEXT DEFAULT '',
  event_type TEXT DEFAULT 'personal' CHECK (event_type IN ('personal', 'group')),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.friend_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  receiver_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(sender_id, receiver_id)
);

CREATE TABLE IF NOT EXISTS public.friendships (
  user_id_1 UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  user_id_2 UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (user_id_1, user_id_2),
  CHECK (user_id_1 < user_id_2)
);

CREATE TABLE IF NOT EXISTS public.event_attendees (
  event_id UUID REFERENCES public.events(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  PRIMARY KEY (event_id, user_id)
);

-- ============================================================
-- 2. ENABLE ROW LEVEL SECURITY ON ALL TABLES
-- ============================================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.friend_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.friendships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_attendees ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 3. CREATE ALL RLS POLICIES
-- ============================================================

-- 3a. PROFILES
CREATE POLICY "profiles_read_all" ON public.profiles
  FOR SELECT USING (true);
CREATE POLICY "profiles_insert_own" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles_update_own" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

-- 3b. EVENTS (references friendships — must come after friendships table creation)
CREATE POLICY "events_select_own_and_friends" ON public.events
  FOR SELECT USING (
    user_id = auth.uid()
    OR user_id IN (
      SELECT CASE WHEN user_id_1 = auth.uid() THEN user_id_2 ELSE user_id_1 END
      FROM public.friendships
      WHERE user_id_1 = auth.uid() OR user_id_2 = auth.uid()
    )
  );
CREATE POLICY "events_insert_own" ON public.events
  FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "events_update_own" ON public.events
  FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "events_delete_own" ON public.events
  FOR DELETE USING (user_id = auth.uid());

-- 3c. FRIEND REQUESTS
CREATE POLICY "friend_requests_insert" ON public.friend_requests
  FOR INSERT WITH CHECK (sender_id = auth.uid());
CREATE POLICY "friend_requests_select" ON public.friend_requests
  FOR SELECT USING (sender_id = auth.uid() OR receiver_id = auth.uid());
CREATE POLICY "friend_requests_update_receiver" ON public.friend_requests
  FOR UPDATE USING (receiver_id = auth.uid());
CREATE POLICY "friend_requests_delete" ON public.friend_requests
  FOR DELETE USING (sender_id = auth.uid() OR receiver_id = auth.uid());

-- 3d. FRIENDSHIPS
CREATE POLICY "friendships_select" ON public.friendships
  FOR SELECT USING (auth.uid() IN (user_id_1, user_id_2));
CREATE POLICY "friendships_insert" ON public.friendships
  FOR INSERT WITH CHECK (auth.uid() IN (user_id_1, user_id_2));
CREATE POLICY "friendships_delete" ON public.friendships
  FOR DELETE USING (auth.uid() = user_id_1 OR auth.uid() = user_id_2);

-- 3e. EVENT ATTENDEES (references friendships)
CREATE POLICY "event_attendees_select" ON public.event_attendees
  FOR SELECT USING (
    user_id = auth.uid()
    OR event_id IN (SELECT id FROM public.events WHERE user_id = auth.uid())
    OR user_id IN (
      SELECT CASE WHEN user_id_1 = auth.uid() THEN user_id_2 ELSE user_id_1 END
      FROM public.friendships
      WHERE user_id_1 = auth.uid() OR user_id_2 = auth.uid()
    )
  );
CREATE POLICY "event_attendees_insert" ON public.event_attendees
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
    OR auth.uid() IN (SELECT user_id FROM public.events WHERE id = event_id)
  );

-- ============================================================
-- 4. ENABLE REALTIME FOR LIVE SYNC
-- ============================================================

ALTER PUBLICATION supabase_realtime ADD TABLE public.events;
ALTER PUBLICATION supabase_realtime ADD TABLE public.friend_requests;
ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;

-- ============================================================
-- 5. AUTOMATIC PROFILE CREATION TRIGGER ON SIGNUP
-- ============================================================
-- This trigger automatically creates a row in public.profiles
-- when a new user signs up via auth.users. This runs under
-- SECURITY DEFINER (bypass RLS) so it works even if email
-- confirmation is enabled.
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

