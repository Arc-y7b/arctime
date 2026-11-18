import test from 'node:test';
import assert from 'node:assert';
import { ViewportBoundary, MobileCalendarState, SwipeGestureDetector, isPastDay } from '../mobile.js';

test('ViewportBoundary detects mobile mode', () => {
  // Mobile portrait dimensions
  const mobileViewport = new ViewportBoundary(375, 812);
  assert.strictEqual(mobileViewport.isMobile(), true);
  assert.strictEqual(mobileViewport.orientation(), 'portrait');

  // Desktop dimensions
  const desktopViewport = new ViewportBoundary(1440, 900);
  assert.strictEqual(desktopViewport.isMobile(), false);
  assert.strictEqual(desktopViewport.orientation(), 'landscape');

  // Tablet / border dimensions
  const boundaryViewport = new ViewportBoundary(768, 1024);
  assert.strictEqual(boundaryViewport.isMobile(), false);
});

test('MobileCalendarState navigates tabs and days', () => {
  const state = new MobileCalendarState(new Date(2026, 10, 18));
  
  // Initial values
  assert.strictEqual(state.activeTab, 'calendar');
  assert.strictEqual(state.activeDayIndex, 2); // November 18, 2026 is Wednesday (Monday index is 0)
  assert.strictEqual(state.isBottomSheetOpen, false);

  // Switch tab
  state.switchTab('friends');
  assert.strictEqual(state.activeTab, 'friends');
  state.switchTab('chats');
  assert.strictEqual(state.activeTab, 'chats');

  // Invalid tab switch should be ignored or throw
  assert.throws(() => state.switchTab('invalid-tab'));

  // Day navigation - forward
  state.changeActiveDay(1); // Wednesday -> Thursday
  assert.strictEqual(state.activeDayIndex, 3);

  // Day navigation - backward
  state.changeActiveDay(-2); // Thursday -> Tuesday
  assert.strictEqual(state.activeDayIndex, 1);

  // Day navigation - boundary clamping (0 is Monday, 6 is Sunday)
  state.changeActiveDay(-5); // Tuesday -> clamped to Monday (0)
  assert.strictEqual(state.activeDayIndex, 0);

  state.changeActiveDay(10); // Monday -> clamped to Sunday (6)
  assert.strictEqual(state.activeDayIndex, 6);
});

test('SwipeGestureDetector calculates correct swipe offset', () => {
  const detector = new SwipeGestureDetector();
  
  // Simulated swipe left (next day)
  detector.start(150, 200); // touchstart X, Y
  const actionLeft = detector.end(50, 205); // touchend X, Y
  assert.strictEqual(actionLeft, 'next');

  // Simulated swipe right (prev day)
  detector.start(50, 200);
  const actionRight = detector.end(150, 195);
  assert.strictEqual(actionRight, 'prev');

  // Vertical scroll / small movements should be ignored
  detector.start(100, 100);
  const actionTrivial = detector.end(98, 105);
  assert.strictEqual(actionTrivial, null);
});

test('isPastDay blocks bookings on historical days', () => {
  const currentDayIndex = 2; // Wednesday, November 18
  
  // Monday is index 0, which is past
  assert.strictEqual(isPastDay(0, currentDayIndex), true);
  
  // Tuesday is index 1, which is past
  assert.strictEqual(isPastDay(1, currentDayIndex), true);

  // Wednesday is index 2, which is current (not past)
  assert.strictEqual(isPastDay(2, currentDayIndex), false);

  // Thursday is index 3, which is future (not past)
  assert.strictEqual(isPastDay(3, currentDayIndex), false);
});
