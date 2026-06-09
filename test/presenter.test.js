import test from 'node:test';
import assert from 'node:assert';
import { setupMockDom } from './mock-dom.js';

// Setup Mock DOM before importing the presenter
setupMockDom();

import { MobilePresenter } from '../mobile.js';

test('MobilePresenter handles resize and body mobile class toggling', () => {
  const presenter = new MobilePresenter();
  
  // Set screen width to mobile
  window.innerWidth = 375;
  presenter.handleResize();
  assert.strictEqual(document.body.classList.contains('is-mobile'), true);

  // Set screen width to desktop
  window.innerWidth = 1200;
  presenter.handleResize();
  assert.strictEqual(document.body.classList.contains('is-mobile'), false);
});

test('MobilePresenter switches views and adjusts DOM containers', () => {
  const presenter = new MobilePresenter();
  window.innerWidth = 375;
  presenter.handleResize();

  // Switch to friends hub tab
  presenter.switchTab('friends');
  
  // Verify state
  assert.strictEqual(presenter.state.activeTab, 'friends');

  // Verify DOM updates
  const calendarContainer = document.getElementById('calendarWrapper');
  const friendsContainer = document.getElementById('friendsWrapper');
  const suggestionsContainer = document.getElementById('suggestionsWrapper');
  const settingsContainer = document.getElementById('settingsWrapper');

  assert.strictEqual(friendsContainer.style.display, 'block');
  assert.strictEqual(calendarContainer.style.display, 'none');
  assert.strictEqual(suggestionsContainer.style.display, 'none');
  assert.strictEqual(settingsContainer.style.display, 'none');
  
  // Verify tab buttons class list
  const tabFriendsBtn = document.getElementById('mobileTabFriends');
  const tabCalendarBtn = document.getElementById('mobileTabCalendar');
  assert.strictEqual(tabFriendsBtn.classList.contains('active'), true);
  assert.strictEqual(tabCalendarBtn.classList.contains('active'), false);
});
