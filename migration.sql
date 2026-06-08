-- ============================================================
-- ArcTime Database Schema — Run this in Supabase SQL Editor
-- ============================================================

-- 1. PROFILES
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT UNIQUE,
  display_name TEXT,
  avatar_url TEXT DEFAULT 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=100&q=80',
  timezone TEXT DEFAULT 'BST',
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles_read_all" ON public.profiles
  FOR SELECT USING (true);
CREATE POLICY "profiles_insert_own" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles_update_own" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

-- 2. EVENTS
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

ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

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

-- 3. FRIEND REQUESTS
CREATE TABLE IF NOT EXISTS public.friend_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  receiver_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(sender_id, receiver_id)
);

ALTER TABLE public.friend_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "friend_requests_insert" ON public.friend_requests
  FOR INSERT WITH CHECK (sender_id = auth.uid());
CREATE POLICY "friend_requests_select" ON public.friend_requests
  FOR SELECT USING (sender_id = auth.uid() OR receiver_id = auth.uid());
CREATE POLICY "friend_requests_update_receiver" ON public.friend_requests
  FOR UPDATE USING (receiver_id = auth.uid());
CREATE POLICY "friend_requests_delete_sender" ON public.friend_requests
  FOR DELETE USING (sender_id = auth.uid());

-- 4. FRIENDSHIPS
CREATE TABLE IF NOT EXISTS public.friendships (
  user_id_1 UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  user_id_2 UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (user_id_1, user_id_2),
  CHECK (user_id_1 < user_id_2)
);

ALTER TABLE public.friendships ENABLE ROW LEVEL SECURITY;

CREATE POLICY "friendships_select" ON public.friendships
  FOR SELECT USING (auth.uid() IN (user_id_1, user_id_2));
CREATE POLICY "friendships_insert" ON public.friendships
  FOR INSERT WITH CHECK (auth.uid() IN (user_id_1, user_id_2));

-- 5. EVENT ATTENDEES
CREATE TABLE IF NOT EXISTS public.event_attendees (
  event_id UUID REFERENCES public.events(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  PRIMARY KEY (event_id, user_id)
);

ALTER TABLE public.event_attendees ENABLE ROW LEVEL SECURITY;

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

-- Enable realtime for events table (so changes sync live)
ALTER PUBLICATION supabase_realtime ADD TABLE public.events;
ALTER PUBLICATION supabase_realtime ADD TABLE public.friend_requests;
ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;
