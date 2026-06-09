// Mock DOM setup for testing browser interaction in Node.js

class MockElement {
  constructor(tagName = 'div', id = '') {
    this.tagName = tagName;
    this.id = id;
    this.classList = {
      classes: new Set(),
      add(...clses) { clses.forEach(c => this.classes.add(c)); },
      remove(...clses) { clses.forEach(c => this.classes.delete(c)); },
      contains(cls) { return this.classes.has(cls); },
      toggle(cls, force) {
        if (force !== undefined) {
          if (force) this.classes.add(cls);
          else this.classes.delete(cls);
        } else {
          if (this.classes.has(cls)) this.classes.delete(cls);
          else this.classes.add(cls);
        }
      }
    };
    this.style = {
      display: '',
      transform: '',
      opacity: ''
    };
    this.listeners = {};
    this.innerHTML = '';
    this.textContent = '';
  }

  addEventListener(event, callback) {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(callback);
  }

  removeEventListener(event, callback) {
    if (this.listeners[event]) {
      this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
    }
  }

  dispatchEvent(event, data) {
    if (this.listeners[event]) {
      this.listeners[event].forEach(cb => cb(data));
    }
  }

  click() {
    this.dispatchEvent('click', { target: this });
  }
}

export function setupMockDom() {
  const elements = {};
  
  globalThis.document = {
    body: new MockElement('body'),
    getElementById(id) {
      if (!elements[id]) {
        elements[id] = new MockElement('div', id);
      }
      return elements[id];
    },
    querySelectorAll(selector) {
      // Return list of elements matching selectors for test purposes
      if (selector.includes('.mobile-tab-btn')) {
        return [
          this.getElementById('mobileTabCalendar'),
          this.getElementById('mobileTabFriends'),
          this.getElementById('mobileTabSuggestions'),
          this.getElementById('mobileTabSettings')
        ];
      }
      return [];
    }
  };

  globalThis.window = {
    innerWidth: 1024,
    innerHeight: 768,
    listeners: {},
    addEventListener(event, callback) {
      if (!this.listeners[event]) this.listeners[event] = [];
      this.listeners[event].push(callback);
    },
    dispatchEvent(event, data) {
      if (this.listeners[event]) {
        this.listeners[event].forEach(cb => cb(data));
      }
    }
  };
}
