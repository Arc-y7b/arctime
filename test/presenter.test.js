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
  const chatsContainer = document.getElementById('chatsWrapper');
  const suggestionsContainer = document.getElementById('suggestionsWrapper');
  const settingsContainer = document.getElementById('settingsWrapper');

  assert.strictEqual(friendsContainer.style.display, 'flex');
  presenter.switchTab('chats');
  assert.strictEqual(chatsContainer.style.display, 'flex');
  assert.strictEqual(friendsContainer.style.display, 'none');
  assert.strictEqual(document.getElementById('mobileTabChats').classList.contains('active'), true);
  presenter.switchTab('friends');
  assert.strictEqual(chatsContainer.style.display, 'none');
  assert.strictEqual(calendarContainer.style.display, 'none');
  assert.strictEqual(suggestionsContainer.style.display, 'none');
  assert.strictEqual(settingsContainer.style.display, 'none');
  
  // Verify tab buttons class list
  const tabFriendsBtn = document.getElementById('mobileTabFriends');
  const tabCalendarBtn = document.getElementById('mobileTabCalendar');
  assert.strictEqual(tabFriendsBtn.classList.contains('active'), true);
  assert.strictEqual(tabCalendarBtn.classList.contains('active'), false);
});

test('MobilePresenter relocates settings inner content when switching tabs', () => {
  const presenter = new MobilePresenter();
  
  const settingsInner = document.getElementById('settingsDrawerInner');
  const settingsWrapper = document.getElementById('settingsWrapper');
  const settingsDrawer = document.getElementById('settingsDrawer');
  
  // Initially, set parent mock relationships
  settingsDrawer.appendChild(settingsInner);
  assert.strictEqual(settingsInner.parentNode, settingsDrawer);
  
  // Switch to settings tab
  presenter.switchTab('settings');
  assert.strictEqual(settingsInner.parentNode, settingsWrapper);
  
  // Switch back to calendar
  presenter.switchTab('calendar');
  assert.strictEqual(settingsInner.parentNode, settingsDrawer);
});

test('MobilePresenter restores only the active view on desktop', () => {
  const presenter = new MobilePresenter();
  presenter.switchTab('chats');

  window.innerWidth = 1200;
  presenter.handleResize();

  assert.strictEqual(document.getElementById('chatsWrapper').style.display, 'flex');
  assert.strictEqual(document.getElementById('calendarWrapper').style.display, 'none');
  assert.strictEqual(document.getElementById('friendsWrapper').style.display, 'none');
});
