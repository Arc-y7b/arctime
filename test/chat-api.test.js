import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

async function loadSupabaseHelpers() {
  const requests = [];
  const responses = [];
  const client = {
    from(table) {
      const request = { table, orders: [] };
      requests.push(request);
      const builder = {
        select(columns) {
          request.columns = columns;
          return this;
        },
        or(filter) {
          request.filter = filter;
          return this;
        },
        order(column, options) {
          request.orders.push({ column, ...options });
          return this;
        },
        range(from, to) {
          request.range = [from, to];
          return this;
        },
        limit(count) {
          request.limit = count;
          return this;
        },
        insert(values) {
          request.insert = values;
          return this;
        },
        single() {
          return Promise.resolve(responses.shift());
        },
        then(resolve, reject) {
          return Promise.resolve(responses.shift()).then(resolve, reject);
        }
      };
      return builder;
    }
  };
  const window = { supabase: { createClient: () => client } };
  const source = await readFile(new URL('../supabase.js', import.meta.url), 'utf8');
  const context = { window };
  runInNewContext(source, context);
  return { context, requests, responses };
}

test('message history is queried for both friends and returned chronologically', async () => {
  const { context, requests, responses } = await loadSupabaseHelpers();
  responses.push({
    data: [{ id: 'newest' }, { id: 'older' }],
    error: null
  });

  const result = await context.arctimeGetMessagesBetween('user-id', 'friend-id', 50, 50);

  assert.equal(result.error, null);
  assert.deepEqual(result.data.map((message) => message.id), ['older', 'newest']);
  assert.equal(requests[0].table, 'messages');
  assert.equal(
    requests[0].filter,
    'and(sender_id.eq.user-id,recipient_id.eq.friend-id),and(sender_id.eq.friend-id,recipient_id.eq.user-id)'
  );
  assert.deepEqual(requests[0].range, [50, 99]);
});

test('sending a message inserts the authenticated sender and friend recipient', async () => {
  const { context, requests, responses } = await loadSupabaseHelpers();
  const savedMessage = { id: 'message-id', content: 'Hello!' };
  responses.push({ data: savedMessage, error: null });

  const result = await context.arctimeSendMessage('user-id', 'friend-id', 'Hello!');

  assert.equal(result.data, savedMessage);
  assert.equal(result.error, null);
  assert.equal(requests[0].table, 'messages');
  assert.equal(requests[0].insert.sender_id, 'user-id');
  assert.equal(requests[0].insert.recipient_id, 'friend-id');
  assert.equal(requests[0].insert.content, 'Hello!');
});

test('main migration is safe to rerun', async () => {
  const migration = await readFile(new URL('../migration.sql', import.meta.url), 'utf8');

  assert.match(migration, /DROP POLICY IF EXISTS "profiles_read_all" ON public\.profiles;/);
  assert.match(migration, /CREATE POLICY "profiles_read_all" ON public\.profiles/);
  assert.match(migration, /pg_publication_tables[\s\S]*tablename = realtime_table/);
  assert.match(migration, /DROP TRIGGER IF EXISTS on_auth_user_created ON auth\.users;/);
});
