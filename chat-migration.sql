-- Run after migration.sql in the Supabase SQL Editor.

CREATE TABLE IF NOT EXISTS public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  recipient_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content TEXT NOT NULL CHECK (content ~ '[^[:space:]]' AND char_length(content) <= 2000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (sender_id <> recipient_id)
);

CREATE INDEX IF NOT EXISTS messages_sender_recipient_created_idx
  ON public.messages (sender_id, recipient_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS messages_recipient_sender_created_idx
  ON public.messages (recipient_id, sender_id, created_at DESC, id DESC);

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "messages_select_friends" ON public.messages;
CREATE POLICY "messages_select_friends" ON public.messages
  FOR SELECT TO authenticated
  USING (
    auth.uid() IN (sender_id, recipient_id)
    AND EXISTS (
      SELECT 1
      FROM public.friendships AS f
      WHERE f.user_id_1 = LEAST(sender_id, recipient_id)
        AND f.user_id_2 = GREATEST(sender_id, recipient_id)
    )
  );

DROP POLICY IF EXISTS "messages_insert_from_friend" ON public.messages;
CREATE POLICY "messages_insert_from_friend" ON public.messages
  FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND recipient_id <> auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.friendships AS f
      WHERE f.user_id_1 = LEAST(sender_id, recipient_id)
        AND f.user_id_2 = GREATEST(sender_id, recipient_id)
    )
  );

REVOKE ALL ON public.messages FROM anon;
REVOKE ALL ON public.messages FROM PUBLIC;
GRANT SELECT, INSERT ON public.messages TO authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'messages'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.messages';
  END IF;
END
$$;
