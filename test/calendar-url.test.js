import test from 'node:test';
import assert from 'node:assert/strict';
import { createCalendarUrl, readCalendarState } from '../calendar-url.js';

test('calendar link defaults to the current week', () => {
  const { currentWeekStart, activeView } = readCalendarState('', new Date(2026, 10, 18));

  assert.deepEqual(currentWeekStart, new Date(2026, 10, 16));
  assert.equal(activeView, 'week');
});

test('calendar link restores its selected week and month view', () => {
  const { currentWeekStart, activeView } = readCalendarState(
    '?date=2026-06-11&view=month',
    new Date(2026, 10, 18)
  );

  assert.deepEqual(currentWeekStart, new Date(2026, 5, 8));
  assert.equal(activeView, 'month');
});

test('invalid calendar dates fall back to the current week', () => {
  const { currentWeekStart } = readCalendarState(
    '?date=2026-02-30&view=week',
    new Date(2026, 10, 18)
  );

  assert.deepEqual(currentWeekStart, new Date(2026, 10, 16));
});

test('calendar URL updates preserve unrelated query parameters and fragments', () => {
  const url = createCalendarUrl(
    'https://example.com/calendar?invite=abc#calendar',
    new Date(2026, 5, 8),
    'month'
  );

  assert.equal(url.searchParams.get('invite'), 'abc');
  assert.equal(url.searchParams.get('date'), '2026-06-08');
  assert.equal(url.searchParams.get('view'), 'month');
  assert.equal(url.hash, '#calendar');
});
