/**
 * Supabase client initialisation and data helpers for ArcTime.
 * All browser-side queries use the anon key — RLS enforces permissions.
 */

const SUPABASE_URL = 'https://bszdmkydzzujvctgihqk.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_Wyo_dz2gBAhc6Xg46R8qvg_UPRLIS73';

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true
  }
});

// ============================================================
// AUTH
// ============================================================

async function arctimeSignUp(email, password, displayName, username) {
  const redirectUrl = window.location.origin + window.location.pathname;
  const { data, error } = await sb.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: redirectUrl,
      data: {
        display_name: displayName,
        username: username
      }
    }
  });
  if (error) return { error };

  return { data };
}

async function arctimeSignIn(email, password) {
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) return { error };
  return { data };
}

async function arctimeSignOut() {
  const { error } = await sb.auth.signOut();
  return { error };
}

async function arctimeGetSession() {
  const { data, error } = await sb.auth.getSession();
  if (error) return { session: null, error };
  return { session: data.session, error: null };
}

function arctimeOnAuth(callback) {
  return sb.auth.onAuthStateChange(callback);
}

// ============================================================
// PROFILES
// ============================================================

async function arctimeGetProfile(userId) {
  const { data, error } = await sb
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();
  return { data, error };
}

async function arctimeCreateProfile(profile) {
  const { data, error } = await sb
    .from('profiles')
    .insert(profile)
    .select()
    .single();
  return { data, error };
}

async function arctimeUpdateProfile(userId, updates) {
  const { data, error } = await sb
    .from('profiles')
    .upsert({ id: userId, ...updates })
    .select()
    .single();
  return { data, error };
}

async function arctimeSearchUsers(query) {
  const { data, error } = await sb
    .from('profiles')
    .select('id, username, display_name, avatar_url')
    .or(`username.ilike.%${query}%,display_name.ilike.%${query}%`)
    .limit(10);
  return { data, error };
}

async function arctimeGetProfileByUsername(username) {
  const { data, error } = await sb
    .from('profiles')
    .select('*')
    .eq('username', username)
    .maybeSingle();
  return { data, error };
}

// ============================================================
// EVENTS
// ============================================================

async function arctimeGetEvents(startDay, endDay) {
  let query = sb.from('events').select('*');
  if (startDay !== undefined) query = query.gte('day_index', startDay);
  if (endDay !== undefined) query = query.lte('day_index', endDay);
  const { data, error } = await query.order('day_index').order('start_time');
  return { data, error };
}

async function arctimeCreateEvent(event) {
  const { data, error } = await sb
    .from('events')
    .insert(event)
    .select()
    .single();
  return { data, error };
}

async function arctimeUpdateEvent(eventId, updates) {
  const { data, error } = await sb
    .from('events')
    .update(updates)
    .eq('id', eventId)
    .select()
    .single();
  return { data, error };
}

async function arctimeDeleteEvent(eventId) {
  const { data, error } = await sb
    .from('events')
    .delete()
    .eq('id', eventId)
    .select();
  if (error) return { error };
  if (!data || data.length === 0) {
    return {
      error: new Error(
        "Event row could not be deleted from Supabase. " +
        "This usually means the event does not exist, or the 'events_delete_own' policy is missing or blocking the delete. " +
        "Please run the SQL policies from migration.sql in your Supabase SQL Editor."
      )
    };
  }
  return { error: null };
}

// ============================================================
// EVENT ATTENDEES
// ============================================================

async function arctimeAddAttendees(eventId, userIds) {
  const rows = userIds.map(uid => ({ event_id: eventId, user_id: uid }));
  const { data, error } = await sb
    .from('event_attendees')
    .insert(rows)
    .select();
  return { data, error };
}

async function arctimeGetAttendees(eventId) {
  const { data, error } = await sb
    .from('event_attendees')
    .select('user_id')
    .eq('event_id', eventId);
  return { data: data ? data.map(r => r.user_id) : [], error };
}

// ============================================================
// FRIEND REQUESTS
// ============================================================

async function arctimeSendFriendRequest(senderId, receiverId) {
  const { data, error } = await sb
    .from('friend_requests')
    .insert({ sender_id: senderId, receiver_id: receiverId, status: 'pending' })
    .select()
    .single();
  return { data, error };
}

async function arctimeGetFriendRequests(userId) {
  const { data, error } = await sb
    .from('friend_requests')
    .select('*')
    .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`)
    .order('created_at', { ascending: false });
  return { data, error };
}

async function arctimeAcceptFriendRequest(requestId) {
  // Get the request first to know sender/receiver
  const { data: req, error: getError } = await sb
    .from('friend_requests')
    .select('*')
    .eq('id', requestId)
    .single();
  if (getError) return { error: getError };

  // Update status to accepted
  const { error: updateError } = await sb
    .from('friend_requests')
    .update({ status: 'accepted' })
    .eq('id', requestId);
  if (updateError) return { error: updateError };

  // Create friendship row (user_id_1 < user_id_2)
  const id1 = req.sender_id < req.receiver_id ? req.sender_id : req.receiver_id;
  const id2 = req.sender_id < req.receiver_id ? req.receiver_id : req.sender_id;
  const { error: friendError } = await sb
    .from('friendships')
    .insert({ user_id_1: id1, user_id_2: id2 });
  if (friendError) return { error: friendError };

  return { data: req };
}

async function arctimeDeclineFriendRequest(requestId) {
  const { data, error } = await sb
    .from('friend_requests')
    .delete()
    .eq('id', requestId)
    .select();
  if (error) return { error };
  if (!data || data.length === 0) {
    return {
      error: new Error(
        "Friend request could not be deleted/declined from Supabase. " +
        "This usually means the request does not exist, or the 'friend_requests_delete' policy is missing or blocking the delete. " +
        "Please run the SQL policies from migration.sql in your Supabase SQL Editor."
      )
    };
  }
  return { error: null };
}

async function arctimeCancelFriendRequest(requestId) {
  const { data, error } = await sb
    .from('friend_requests')
    .delete()
    .eq('id', requestId)
    .select();
  if (error) return { error };
  if (!data || data.length === 0) {
    return {
      error: new Error(
        "Friend request could not be deleted/cancelled from Supabase. " +
        "This usually means the request does not exist, or the 'friend_requests_delete' policy is missing or blocking the delete. " +
        "Please run the SQL policies from migration.sql in your Supabase SQL Editor."
      )
    };
  }
  return { error: null };
}

// ============================================================
// FRIENDSHIPS
// ============================================================

async function arctimeRemoveFriend(userId, friendId) {
  const id1 = userId < friendId ? userId : friendId;
  const id2 = userId < friendId ? friendId : userId;
  
  // 1. Delete friendship row and check if it actually deleted a row (RLS policy check)
  const { data, error: friendshipError } = await sb
    .from('friendships')
    .delete()
    .eq('user_id_1', id1)
    .eq('user_id_2', id2)
    .select();
  
  if (friendshipError) return { error: friendshipError };
  if (!data || data.length === 0) {
    return {
      error: new Error(
        "Friendship row could not be deleted from Supabase. " +
        "This usually means the 'friendships_delete' policy is missing or blocking the delete. " +
        "Please ensure you run all SQL policies in migration.sql in your Supabase SQL Editor."
      )
    };
  }

  // 2. Delete corresponding friend requests in both directions so they can add each other later
  const { error: reqError1 } = await sb
    .from('friend_requests')
    .delete()
    .eq('sender_id', userId)
    .eq('receiver_id', friendId);
  if (reqError1) return { error: reqError1 };

  const { error: reqError2 } = await sb
    .from('friend_requests')
    .delete()
    .eq('sender_id', friendId)
    .eq('receiver_id', userId);
  if (reqError2) return { error: reqError2 };

  return { error: null };
}

async function arctimeGetFriends(userId) {
  const { data, error } = await sb
    .from('friendships')
    .select(`
      user_id_1, user_id_2,
      profile1:profiles!friendships_user_id_1_fkey(id, username, display_name, avatar_url),
      profile2:profiles!friendships_user_id_2_fkey(id, username, display_name, avatar_url)
    `)
    .or(`user_id_1.eq.${userId},user_id_2.eq.${userId}`);
  if (error) return { data: null, error };

  // Flatten into a list of friend profiles
  const friends = data.map(row => {
    const friend = row.user_id_1 === userId ? row.profile2 : row.profile1;
    return friend;
  });
  return { data: friends, error: null };
}

// ============================================================
// REALTIME SUBSCRIPTIONS
// ============================================================

function arctimeSubscribeEvents(channelName, callback) {
  return sb
    .channel(channelName)
    .on('postgres_changes',
      { event: '*', schema: 'public', table: 'events' },
      (payload) => callback(payload)
    )
    .subscribe();
}

function arctimeSubscribeFriendRequests(userId, callback) {
  return sb
    .channel('friend-requests')
    .on('postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'friend_requests', filter: `receiver_id=eq.${userId}` },
      (payload) => callback(payload)
    )
    .subscribe();
}

function arctimeUnsubscribe(channel) {
  if (channel) sb.removeChannel(channel);
}
