/**
 * mobile.js - Mobile adaptation models and value objects
 * Domain-Driven Design (DDD) Bounded Context for Mobile Portals
 */

export class ViewportBoundary {
  constructor(width, height) {
    this.width = width;
    this.height = height;
  }

  isMobile() {
    return this.width < 768;
  }

  orientation() {
    return this.width < this.height ? 'portrait' : 'landscape';
  }
}

export class MobileCalendarState {
  constructor() {
    this.activeTab = 'calendar';
    this.activeDayIndex = 1; // Default to Tuesday, June 9 (Monday index is 0)
    this.isBottomSheetOpen = false;
    this.validTabs = ['calendar', 'friends', 'suggestions', 'settings'];
  }

  switchTab(tabName) {
    if (!this.validTabs.includes(tabName)) {
      throw new Error(`Invalid tab: ${tabName}`);
    }
    this.activeTab = tabName;
    return this;
  }

  changeActiveDay(offset) {
    let newIndex = this.activeDayIndex + offset;
    if (newIndex < 0) newIndex = 0;
    if (newIndex > 6) newIndex = 6;
    this.activeDayIndex = newIndex;
    return this;
  }
}

export class SwipeGestureDetector {
  constructor() {
    this.startX = 0;
    this.startY = 0;
  }

  start(x, y) {
    this.startX = x;
    this.startY = y;
  }

  end(x, y) {
    const deltaX = x - this.startX;
    const deltaY = y - this.startY;

    // Reject swipes that are mostly vertical or too short
    if (Math.abs(deltaY) > Math.abs(deltaX) * 0.8) {
      return null;
    }
    if (Math.abs(deltaX) < 30) {
      return null;
    }

    // Swipe right (deltaX > 0) goes to previous day, swipe left (deltaX < 0) goes to next day
    return deltaX > 0 ? 'prev' : 'next';
  }
}

export function isPastDay(dayIndex, todayIndex) {
  return dayIndex < todayIndex;
}

export class MobilePresenter {
  constructor() {
    this.state = new MobileCalendarState();
    this.tabMap = {
      calendar: { containerId: 'calendarWrapper', buttonId: 'mobileTabCalendar' },
      friends: { containerId: 'friendsWrapper', buttonId: 'mobileTabFriends' },
      suggestions: { containerId: 'suggestionsWrapper', buttonId: 'mobileTabSuggestions' },
      settings: { containerId: 'settingsWrapper', buttonId: 'mobileTabSettings' }
    };
  }

  handleResize() {
    const boundary = new ViewportBoundary(window.innerWidth, window.innerHeight);
    const isMobileMode = boundary.isMobile();
    
    // Toggle class on body
    document.body.classList.toggle('is-mobile', isMobileMode);
    
    // If mobile, ensure we display layout components appropriately
    if (isMobileMode) {
      this.switchTab(this.state.activeTab);
    } else {
      // Restore desktop layout displays
      Object.values(this.tabMap).forEach(({ containerId }) => {
        const el = document.getElementById(containerId);
        if (el) el.style.display = '';
      });
    }
  }

  switchTab(tabName) {
    this.state.switchTab(tabName);
    
    // Update container visibilities
    Object.entries(this.tabMap).forEach(([name, { containerId, buttonId }]) => {
      const container = document.getElementById(containerId);
      const button = document.getElementById(buttonId);
      
      if (name === tabName) {
        if (container) container.style.display = 'block';
        if (button) button.classList.add('active');
      } else {
        if (container) container.style.display = 'none';
        if (button) button.classList.remove('active');
      }
    });
  }
}
