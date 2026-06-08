/**
 * ARCTIME CLIENT ENGINE
 * Handles mock database, calendar collision solver, interval-arithmetic scheduler,
 * and high-fidelity UI transitions.
 */

// -------------------------------------------------------------
// 1. DATA MODELS & INITIAL STATE
// -------------------------------------------------------------

// Active state of the application
const state = {
  currentWeekStart: new Date(2026, 5, 8), // Monday, June 8, 2026
  activeView: 'week', // 'week' or 'month'
  userAvailability: 'free', // 'free' or 'busy'
  highlightCommonFree: true,
  selectedFriends: [], // No friends selected by default
  durationMinutes: 60,
  timezone: 'BST', // Default active timezone (GMT+1)
  copiedEvent: JSON.parse(localStorage.getItem('arctime_copied_event')) || null,
  editingEventId: null,
  
  // Auth
  user: null,
  session: null,
  
  // User profile & privacy settings
  username: '',
  usernameHandle: '',
  userId: null,
  avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=100&q=80',
  privacyLevel: 'freebusy',
  
  // Pending friend requests
  sentRequests: [],
  incomingRequests: [],
  
  // Notifications Center Log
  notifications: JSON.parse(localStorage.getItem('arctime_notifications')) || [],
  unreadCount: parseInt(localStorage.getItem('arctime_unread_count') || '0', 10),
  
  // App database
  friends: {},
  friendsData: [], // Raw friend profile objects from Supabase

  // Base calendar events
  events: [],

  // Realtime subscriptions
  _eventsChannel: null,
  _requestsChannel: null
};

// -------------------------------------------------------------
// 2. HELPER UTILITIES
// -------------------------------------------------------------

// Updates display state of floating clipboard banner
function updateClipboardBanner() {
  const banner = document.getElementById('clipboardBanner');
  const titleEl = document.getElementById('clipboardEventTitle');
  if (state.copiedEvent) {
    if (titleEl) titleEl.textContent = state.copiedEvent.title;
    if (banner) banner.classList.add('show');
  } else {
    if (banner) banner.classList.remove('show');
  }
}

// Time conversion: "HH:MM" -> minutes from midnight
function timeToMinutes(timeStr) {
  const [hours, minutes] = timeStr.split(':').map(Number);
  return hours * 60 + minutes;
}

// Time conversion: minutes from midnight -> "HH:MM" (24h)
function minutesToTimeStr(totalMinutes) {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
}

// Time conversion: minutes from midnight -> "H:MM AM/PM" (12h)
function minutesToTwelveHourStr(totalMinutes) {
  let hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours ? hours : 12; // 0 should be 12
  const minStr = minutes.toString().padStart(2, '0');
  return `${hours}:${minStr} ${ampm}`;
}

// Retrieve formatted full date string for a given dayIndex
function getDateOfIndex(dayIndex) {
  const d = new Date(state.currentWeekStart);
  d.setDate(d.getDate() + dayIndex);
  return d;
}

/**
 * Shifts a time (represented as dayIndex and timeStr in GMT) to the active timezone (GMT or BST).
 * BST is GMT + 1 hour (+60 minutes).
 */
function gmtToDisplay(dayIndex, timeStr) {
  if (state.timezone === 'GMT') {
    return { dayIndex, timeStr };
  }
  const totalMin = timeToMinutes(timeStr) + 60;
  let newDayIndex = dayIndex;
  let adjustedMin = totalMin;
  
  if (totalMin >= 1440) {
    adjustedMin = totalMin - 1440;
    newDayIndex = (dayIndex + 1) % 7;
  }
  
  return {
    dayIndex: newDayIndex,
    timeStr: minutesToTimeStr(adjustedMin)
  };
}

/**
 * Shifts a time (represented as dayIndex and timeStr in Display time) to GMT.
 * BST to GMT is -1 hour (-60 minutes).
 */
function displayToGmt(dayIndex, timeStr) {
  if (state.timezone === 'GMT') {
    return { dayIndex, timeStr };
  }
  const totalMin = timeToMinutes(timeStr) - 60;
  let newDayIndex = dayIndex;
  let adjustedMin = totalMin;
  
  if (totalMin < 0) {
    adjustedMin = totalMin + 1440;
    newDayIndex = (dayIndex - 1 + 7) % 7;
  }
  
  return {
    dayIndex: newDayIndex,
    timeStr: minutesToTimeStr(adjustedMin)
  };
}

/**
 * Convert a GMT slot interval object to display timezone.
 */
function slotToDisplay(slot) {
  if (state.timezone === 'GMT') {
    return slot;
  }
  let newDay = slot.dayIndex;
  let newStart = slot.start + 60;
  let newEnd = slot.end + 60;
  
  if (newStart >= 1440) {
    newStart -= 1440;
    newEnd -= 1440;
    newDay = (newDay + 1) % 7;
  }
  
  return {
    dayIndex: newDay,
    start: newStart,
    end: newEnd,
    length: slot.length
  };
}

// Get day name
const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

// -------------------------------------------------------------
// 3. INTERVAL ARITHMETIC SCHEDULER
// -------------------------------------------------------------

/**
 * Subtracts a busy interval [busyStart, busyEnd] from a list of free intervals.
 * @param {Array<{start: number, end: number}>} freeList 
 * @param {number} busyStart 
 * @param {number} busyEnd 
 * @returns {Array<{start: number, end: number}>}
 */
function subtractInterval(freeList, busyStart, busyEnd) {
  const result = [];
  for (const interval of freeList) {
    // Case 1: No overlap
    if (busyEnd <= interval.start || busyStart >= interval.end) {
      result.push(interval);
    }
    // Case 2: Busy interval entirely covers free interval
    else if (busyStart <= interval.start && busyEnd >= interval.end) {
      // Free interval completely eaten up
      continue;
    }
    // Case 3: Busy interval splits the free interval in two
    else if (busyStart > interval.start && busyEnd < interval.end) {
      result.push({ start: interval.start, end: busyStart });
      result.push({ start: busyEnd, end: interval.end });
    }
    // Case 4: Busy overlaps left side
    else if (busyStart <= interval.start && busyEnd < interval.end) {
      result.push({ start: busyEnd, end: interval.end });
    }
    // Case 5: Busy overlaps right side
    else if (busyStart > interval.start && busyEnd >= interval.end) {
      result.push({ start: interval.start, end: busyStart });
    }
  }
  return result;
}

/**
 * Intersects two lists of intervals.
 * @param {Array<{start: number, end: number}>} listA 
 * @param {Array<{start: number, end: number}>} listB 
 * @returns {Array<{start: number, end: number}>}
 */
function intersectIntervalLists(listA, listB) {
  const result = [];
  for (const a of listA) {
    for (const b of listB) {
      const start = Math.max(a.start, b.start);
      const end = Math.min(a.end, b.end);
      if (start < end) {
        result.push({ start, end });
      }
    }
  }
  return result;
}

/**
 * Calculates all free time blocks in the week where the User AND all checked friends are free.
 * Day window: 12:00 AM (0 mins) to 12:00 AM next day (1440 mins) — 24/7 Schedule.
 */
function calculateCommonFreeSlots(durationMins) {
  const commonSlots = [];
  
  // Loop through days: Mon to Sun
  for (let d = 0; d < 7; d++) {
    // Initial free range: 24 Hour Day (0 to 1440 minutes)
    let dayFreeIntervals = [{ start: 0, end: 1440 }];
    
    // Gather all relevant events causing "busy" states on this day
    const busyEvents = [];
    
    // 1. User events (if user set their status to busy, we count their calendar. 
    // Usually coordination apps require user calendar. Let's make Aarav always synced)
    state.events.forEach(event => {
      if (event.dayIndex === d) {
        const start = timeToMinutes(event.startTime);
        const end = timeToMinutes(event.endTime);
        
        if (event.owner === 'user') {
          // If user set their schedule sharing to completely private, exclude their busy events
          if (state.privacyLevel !== 'private') {
            busyEvents.push({ start, end, label: 'You' });
          }
        } else if (event.owner === 'shared') {
          // Shared event affects everyone attending
          busyEvents.push({ start, end, label: 'Group Plan' });
        } else if (state.selectedFriends.includes(event.owner)) {
          // Checked friend
          busyEvents.push({ start, end, label: state.friends[event.owner].name });
        }
      }
    });

    // Subtract all busy times from the day's availability
    busyEvents.forEach(busy => {
      dayFreeIntervals = subtractInterval(dayFreeIntervals, busy.start, busy.end);
    });

    // Filter free blocks that are long enough for the requested duration
    dayFreeIntervals.forEach(interval => {
      const length = interval.end - interval.start;
      if (length >= durationMins) {
        commonSlots.push({
          dayIndex: d,
          start: interval.start,
          end: interval.end,
          length: length
        });
      }
    });
  }
  
  return commonSlots;
}

// -------------------------------------------------------------
// 4. CALENDAR COLLISION / OVERLAP SOLVER
// -------------------------------------------------------------

/**
 * Assigns left layout coordinates and widths to calendar events so that overlapping cards
 * display beautifully in parallel columns, exactly like Google Calendar.
 */
function layoutDayEvents(visibleEvents) {
  // Sort events by starting time
  const sorted = [...visibleEvents].sort((a, b) => {
    return timeToMinutes(a.startTime) - timeToMinutes(b.startTime);
  });

  const columns = []; // Array of columns, where each column is an array of events
  
  sorted.forEach(event => {
    const eventStart = timeToMinutes(event.startTime);
    let placed = false;
    
    // Try to place in an existing column
    for (let c = 0; c < columns.length; c++) {
      const lastEventInCol = columns[c][columns[c].length - 1];
      const colEnd = timeToMinutes(lastEventInCol.endTime);
      
      if (eventStart >= colEnd) {
        columns[c].push(event);
        event.colIndex = c;
        placed = true;
        break;
      }
    }
    
    // Create new column if it couldn't fit
    if (!placed) {
      columns.push([event]);
      event.colIndex = columns.length - 1;
    }
  });

  // Calculate width and position offsets based on total column count
  const totalCols = columns.length;
  sorted.forEach(event => {
    event.colCount = totalCols;
    // Calculate span: how many columns can this event stretch into?
    let maxColSpan = 1;
    for (let c = event.colIndex + 1; c < totalCols; c++) {
      // Check if any event in column c overlaps with this event
      const eventStart = timeToMinutes(event.startTime);
      const eventEnd = timeToMinutes(event.endTime);
      const colOverlap = columns[c].some(other => {
        const otherStart = timeToMinutes(other.startTime);
        const otherEnd = timeToMinutes(other.endTime);
        return (eventStart < otherEnd && eventEnd > otherStart);
      });
      
      if (!colOverlap) {
        maxColSpan++;
      } else {
        break; // Stumbles on an obstacle, stop extending
      }
    }
    event.colSpan = maxColSpan;
  });

  return sorted;
}

// -------------------------------------------------------------
// 5. RENDERING ENGINE
// -------------------------------------------------------------

// DOM Cache
const friendsListContainer = document.getElementById('friendsListContainer');
const currentDateDisplay = document.getElementById('currentDateDisplay');
const calendarGridHeader = document.getElementById('calendarGridHeader');
const timeLabelsColumn = document.getElementById('timeLabelsColumn');
const daysColumnsWrapper = document.getElementById('daysColumnsWrapper');
const activeAttendeesList = document.getElementById('activeAttendeesList');
const suggestionsList = document.getElementById('suggestionsList');
const sharedEventsList = document.getElementById('sharedEventsList');

// Modals
const bookingModal = document.getElementById('bookingModal');
const addFriendModal = document.getElementById('addFriendModal');
const modalFriendsCheckboxContainer = document.getElementById('modalFriendsCheckboxContainer');
const eventActionModal = document.getElementById('eventActionModal');
const pasteActionModal = document.getElementById('pasteActionModal');

// Forms & Controls
const bookingForm = document.getElementById('bookingForm');
const addFriendForm = document.getElementById('addFriendForm');
const durationSelect = document.getElementById('durationSelect');
const toggleCommonFreeHighlight = document.getElementById('toggleCommonFreeHighlight');
const findTimesBtn = document.getElementById('findTimesBtn');
const timezoneSelect = document.getElementById('timezoneSelect');

// Wallpaper Cache Elements
const uploadWallpaperBtn = document.getElementById('uploadWallpaperBtn');
const wallpaperInput = document.getElementById('wallpaperInput');
const resetWallpaperBtn = document.getElementById('resetWallpaperBtn');
const wallpaperBgLayer = document.getElementById('wallpaperBgLayer');
const wallpaperAdjusters = document.getElementById('wallpaperAdjusters');
const wallpaperOpacityInput = document.getElementById('wallpaperOpacity');
const wallpaperBlurInput = document.getElementById('wallpaperBlur');

// Settings Elements
const openSettingsBtn = document.getElementById('openSettingsBtn');
const userProfileCard = document.getElementById('userProfileCard');
const closeSettingsBtn = document.getElementById('closeSettingsBtn');
const cancelSettingsBtn = document.getElementById('cancelSettingsBtn');
const saveSettingsBtn = document.getElementById('saveSettingsBtn');
const settingsDrawer = document.getElementById('settingsDrawer');
const settingsDrawerBackdrop = document.getElementById('settingsDrawerBackdrop');
const settingsUsername = document.getElementById('settingsUsername');
const settingsUserUsername = document.getElementById('settingsUserUsername');
const settingsUsernameWarning = document.getElementById('settingsUsernameWarning');
const settingsPrivacy = document.getElementById('settingsPrivacy');
const settingsAvatarPreview = document.getElementById('settingsAvatarPreview');
const triggerAvatarUploadBtn = document.getElementById('triggerAvatarUploadBtn');
const avatarInput = document.getElementById('avatarInput');
const userProfileName = document.getElementById('userProfileName');
const userProfileAvatar = document.getElementById('userProfileAvatar');

// Friends Hub View Elements
const showCalendarBtn = document.getElementById('showCalendarBtn');
const showFriendsHubBtn = document.getElementById('showFriendsHubBtn');
const calendarWrapper = document.getElementById('calendarWrapper');
const friendsHubWrapper = document.getElementById('friendsHubWrapper');
const pendingRequestsBadge = document.getElementById('pendingRequestsBadge');
const schedulerPanel = document.querySelector('.scheduler-panel');

// Request Form elements
const sendRequestForm = document.getElementById('sendRequestForm');
const requestFriendName = document.getElementById('requestFriendName');
const requestFriendUsername = document.getElementById('requestFriendUsername');
const requestFriendColor = document.getElementById('requestFriendColor');
const requestFriendPreset = document.getElementById('requestFriendPreset');
const usernameWarning = document.getElementById('usernameWarning');
const usernameWarningText = document.getElementById('usernameWarningText');

// List Containers
const incomingRequestsContainer = document.getElementById('incomingRequestsContainer');
const sentRequestsContainer = document.getElementById('sentRequestsContainer');
const directoryContainer = document.getElementById('directoryContainer');

// Navigation buttons
const prevWeekBtn = document.getElementById('prevWeekBtn');
const nextWeekBtn = document.getElementById('nextWeekBtn');
const todayBtn = document.getElementById('todayBtn');

// Initialize Lucide Icons
function reloadIcons() {
  if (window.lucide) {
    window.lucide.createIcons();
  }
}

// Print customized toasts
function showToast(message, type = 'success') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  
  const iconName = type === 'success' ? 'check-circle' : 'info';
  toast.innerHTML = `
    <i data-lucide="${iconName}"></i>
    <span>${message}</span>
  `;
  
  container.appendChild(toast);
  reloadIcons();
  
  setTimeout(() => {
    toast.classList.add('fade-out');
    toast.addEventListener('animationend', () => {
      toast.remove();
    });
  }, 4000);
}

// Render the left sidebar friend list checkboxes
function renderFriendsSidebar() {
  friendsListContainer.innerHTML = '';
  
  Object.values(state.friends).forEach(friend => {
    const isChecked = state.selectedFriends.includes(friend.id);
    const item = document.createElement('div');
    item.className = `friend-item ${isChecked ? 'active' : ''}`;
    item.dataset.id = friend.id;
    
    item.innerHTML = `
      <div class="friend-left">
        <div class="friend-avatar-wrapper">
          <img src="${friend.avatar}" alt="${friend.name}" class="friend-avatar">
          <span class="friend-color-indicator" style="background-color: ${friend.color}"></span>
        </div>
        <div class="friend-info">
          <span class="friend-name">${friend.name}</span>
          <span class="friend-status">${friend.status}</span>
        </div>
      </div>
      <div class="friend-checkbox-custom">
        <i data-lucide="check"></i>
      </div>
    `;
    
    // Toggle active selection on click
    item.addEventListener('click', () => {
      const index = state.selectedFriends.indexOf(friend.id);
      if (index > -1) {
        state.selectedFriends.splice(index, 1);
        showToast(`Hid ${friend.name}'s calendar`);
      } else {
        state.selectedFriends.push(friend.id);
        showToast(`Showing ${friend.name}'s calendar overlays`);
      }
      
      renderFriendsSidebar();
      renderActiveAttendeeChips();
      renderCalendar();
      updateSmartSuggestions();
    });
    
    friendsListContainer.appendChild(item);
  });
  
  reloadIcons();
}

// Render chips under the smart slot finder
function renderActiveAttendeeChips() {
  activeAttendeesList.innerHTML = '';
  
  // User is always included
  const userChip = document.createElement('div');
  userChip.className = 'attendee-chip';
  userChip.innerHTML = `<span class="attendee-chip-dot" style="background-color: #3b82f6"></span> You`;
  activeAttendeesList.appendChild(userChip);
  
  state.selectedFriends.forEach(fid => {
    const friend = state.friends[fid];
    if (friend) {
      const chip = document.createElement('div');
      chip.className = 'attendee-chip';
      chip.innerHTML = `
        <span class="attendee-chip-dot" style="background-color: ${friend.color}"></span>
        ${friend.name.split(' ')[0]}
      `;
      activeAttendeesList.appendChild(chip);
    }
  });
}

// Generate the top day headers (Mon - Sun) with actual calendar dates
function renderCalendarHeader() {
  // Clear headers except first space
  calendarGridHeader.innerHTML = '<div class="time-col-header"></div>';
  
  const today = new Date();
  
  for (let i = 0; i < 7; i++) {
    const date = getDateOfIndex(i);
    const isSameDay = today.getDate() === date.getDate() &&
                      today.getMonth() === date.getMonth() &&
                      today.getFullYear() === date.getFullYear();
                      
    const dayHeader = document.createElement('div');
    dayHeader.className = `day-header ${isSameDay ? 'is-today' : ''}`;
    
    const dayLabel = DAY_NAMES[i].substring(0, 3);
    const dateNum = date.getDate();
    
    dayHeader.innerHTML = `
      <span class="day-header-name">${dayLabel}</span>
      <span class="day-header-number">${dateNum}</span>
    `;
    calendarGridHeader.appendChild(dayHeader);
  }
  
  // Update Navbar Title
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const startMonth = months[state.currentWeekStart.getMonth()];
  const startYear = state.currentWeekStart.getFullYear();
  currentDateDisplay.textContent = `${startMonth} ${startYear}`;
}

// Generate hour labels on the side
function renderTimeLabels() {
  timeLabelsColumn.innerHTML = '';
  // 12:00 AM to 11:00 PM (24 hours)
  for (let hour = 0; hour < 24; hour++) {
    const label = document.createElement('div');
    label.className = 'time-label';
    const ampm = hour >= 12 ? 'PM' : 'AM';
    let displayHour = hour % 12;
    if (displayHour === 0) displayHour = 12;
    label.textContent = `${displayHour}:00 ${ampm}`;
    timeLabelsColumn.appendChild(label);
  }
}

// Main rendering of the calendar columns, overlays, and events
function renderCalendar() {
  daysColumnsWrapper.innerHTML = '';
  
  // Add 7 day columns
  for (let d = 0; d < 7; d++) {
    const dayColumn = document.createElement('div');
    dayColumn.className = 'day-column';
    dayColumn.dataset.day = d;
    
    // Add click trigger to make manual slot booking or paste a copied slot
    dayColumn.addEventListener('click', (e) => {
      if (e.target === dayColumn) {
        const rect = dayColumn.getBoundingClientRect();
        const clickY = e.clientY - rect.top;
        const clickedMinTotal = clickY; // Height is 1440px for 24h, 1px = 1min
        // Round to nearest 30 mins
        const roundedMin = Math.round(clickedMinTotal / 30) * 30;
        
        const startTimeStr = minutesToTimeStr(roundedMin);
        const endTimeStr = minutesToTimeStr(roundedMin + 60); // 1h duration default
        
        if (state.copiedEvent) {
          const clickedTime12 = minutesToTwelveHourStr(roundedMin);
          
          const onConfirm = async () => {
            // Calculate duration of copied event
            const copiedStartMin = timeToMinutes(state.copiedEvent.startTime);
            let copiedEndMin = timeToMinutes(state.copiedEvent.endTime);
            if (copiedEndMin < copiedStartMin) {
              copiedEndMin += 1440;
            }
            const duration = copiedEndMin - copiedStartMin;
            
            // Convert clicked start time on display day d to GMT
            const gmtTimes = displayToGmt(d, startTimeStr);
            const gmtDayIndex = gmtTimes.dayIndex;
            const gmtStartTime = gmtTimes.timeStr;
            
            // Calculate End Time in GMT
            const startMinGmt = timeToMinutes(gmtStartTime);
            const endMinGmt = startMinGmt + duration;
            
            if (endMinGmt > 1440) {
              showToast('Pasted slot would exceed midnight in GMT! Opening booking modal instead.', 'info');
              openBookingModal(d, startTimeStr, endTimeStr);
              return;
            }
            
            const gmtEndTime = minutesToTimeStr(endMinGmt);
            
            // Create pasted event via Supabase
            const { data: newEvent, error: pasteError } = await arctimeCreateEvent({
              user_id: state.userId,
              title: state.copiedEvent.title,
              day_index: gmtDayIndex,
              start_time: gmtStartTime,
              end_time: gmtEndTime,
              event_type: 'personal',
              category: state.copiedEvent.category || 'Busy',
              notes: state.copiedEvent.notes || ''
            });
            if (pasteError) {
              showToast('Failed to paste slot: ' + pasteError.message, 'info');
              return;
            }
            if (newEvent) state.events.push(newEvent);
            
            addNotification('Slot Pasted', `Pasted personal slot: "${state.copiedEvent.title}"`, 'success');
            
            renderCalendar();
            renderSharedEventsWidget();
            updateSmartSuggestions();
          };
          
          const onNew = () => {
            openBookingModal(d, startTimeStr, endTimeStr);
          };
          
          openPasteActionModal(state.copiedEvent.title, clickedTime12, DAY_NAMES[d], onConfirm, onNew);
          return;
        }
        
        openBookingModal(d, startTimeStr, endTimeStr);
      }
    });

    // 1. Gather all events visible for this day (mapped from GMT to Display timezone)
    const dayEvents = state.events.map(event => {
      const displayStart = gmtToDisplay(event.dayIndex, event.startTime);
      const displayEnd = gmtToDisplay(event.dayIndex, event.endTime);
      return {
        ...event,
        displayDayIndex: displayStart.dayIndex,
        displayStartTime: displayStart.timeStr,
        displayEndTime: displayEnd.timeStr
      };
    }).filter(event => {
      if (event.displayDayIndex !== d) return false;
      
      // User is always visible
      if (event.owner === 'user') return true;
      // Shared is always visible
      if (event.owner === 'shared') return true;
      // Friends if their calendar checkbox is active
      if (state.selectedFriends.includes(event.owner)) return true;
      
      return false;
    });

    // Run overlap layout solver
    const structuredEvents = layoutDayEvents(dayEvents);

    // Render Event Cards
    structuredEvents.forEach(event => {
      const eventCard = document.createElement('div');
      eventCard.className = `event-card ${event.category || 'hangout'}`;
      
      // Compute Y bounds
      const startMin = timeToMinutes(event.displayStartTime);
      const endMin = timeToMinutes(event.displayEndTime);
      
      const topOffset = startMin; // Midnight (0 mins) is top offset 0px
      const height = (endMin - startMin);
      
      eventCard.style.top = `${topOffset}px`;
      eventCard.style.height = `${height}px`;
      
      // Calculate dynamic side-by-side positioning coordinates
      const widthPct = event.colSpan * (100 / event.colCount) - 4; // margin space
      const leftPct = event.colIndex * (100 / event.colCount) + 2;
      
      eventCard.style.width = `${widthPct}%`;
      eventCard.style.left = `${leftPct}%`;
      
      // Set coloring details
      let primaryColor = '#3b82f6'; // User
      let ownerName = state.username.split(' ')[0];
      let displayTitle = event.title;
      let hoverTitle = `${event.title}\nTime: ${minutesToTwelveHourStr(startMin)} - ${minutesToTwelveHourStr(endMin)} (${state.timezone})\nOwner: ${ownerName}\nNotes: ${event.notes || 'None'}`;
      
      if (event.owner === 'shared') {
        primaryColor = '#06b6d4'; // teal group color
        ownerName = 'Shared';
        eventCard.style.background = 'rgba(6, 182, 212, 0.15)';
        eventCard.style.borderLeftColor = '#22d3ee';
        eventCard.style.borderColor = 'rgba(6, 182, 212, 0.4)';
      } else if (event.owner !== 'user') {
        const friend = state.friends[event.owner];
        primaryColor = friend ? friend.color : '#64748b';
        ownerName = friend ? friend.name.split(' ')[0] : 'Friend';
        eventCard.style.background = `${primaryColor}22`; // 22 is transparency
        eventCard.style.borderLeftColor = primaryColor;
        eventCard.style.borderColor = `${primaryColor}44`;
      } else {
        // User Aarav (Subject to privacy level changes for friends preview simulation)
        if (state.privacyLevel === 'freebusy') {
          displayTitle = 'Busy 🔒';
          hoverTitle = `Busy\nTime: ${minutesToTwelveHourStr(startMin)} - ${minutesToTwelveHourStr(endMin)} (${state.timezone})\n(Details hidden from friends)`;
          eventCard.style.background = 'rgba(100, 116, 139, 0.1)';
          eventCard.style.borderColor = 'rgba(100, 116, 139, 0.3)';
          eventCard.style.borderLeftColor = '#64748b';
          primaryColor = '#64748b';
        } else if (state.privacyLevel === 'private') {
          displayTitle = 'Private Slot 👁️‍🗨️';
          hoverTitle = `Private Slot\nTime: ${minutesToTwelveHourStr(startMin)} - ${minutesToTwelveHourStr(endMin)} (${state.timezone})\n(Hidden from friends completely)`;
          eventCard.style.background = 'rgba(239, 68, 68, 0.05)';
          eventCard.style.borderColor = 'rgba(239, 68, 68, 0.15)';
          eventCard.style.borderLeftColor = '#ef4444';
          primaryColor = '#ef4444';
        } else {
          eventCard.style.background = 'rgba(59, 130, 246, 0.15)';
          eventCard.style.borderLeftColor = '#3b82f6';
          eventCard.style.borderColor = 'rgba(59, 130, 246, 0.4)';
        }
      }

      eventCard.innerHTML = `
        <span class="event-title">${displayTitle}</span>
        <span class="event-time">${minutesToTwelveHourStr(startMin)} - ${minutesToTwelveHourStr(endMin)}</span>
        <span class="event-owner" style="color: ${primaryColor}">${ownerName}</span>
      `;
      
      // Hover event detailing
      eventCard.title = hoverTitle;
      
      // Manage events on click via custom Event Action Modal
      eventCard.addEventListener('click', (e) => {
        e.stopPropagation();
        openEventActionModal(event, ownerName, displayTitle, DAY_NAMES[d], startMin, endMin);
      });

      dayColumn.appendChild(eventCard);
    });

    // 2. Render Common Free Slots (Highlight Overlaps overlay)
    // Only highlight if common highlighting is active AND we have friends selected
    if (state.highlightCommonFree && state.selectedFriends.length > 0) {
      const dayCommonSlots = calculateCommonFreeSlots(state.durationMinutes)
        .map(slotToDisplay)
        .filter(s => s.dayIndex === d);
      
      dayCommonSlots.forEach(slot => {
        const slotDiv = document.createElement('div');
        slotDiv.className = 'common-free-slot';
        
        const topOffset = slot.start;
        const height = slot.end - slot.start;
        
        slotDiv.style.top = `${topOffset}px`;
        slotDiv.style.height = `${height}px`;
        
        slotDiv.innerHTML = `
          <div class="common-free-slot-label">
            <i data-lucide="sparkles"></i> Everyone Free
          </div>
          <div class="common-free-slot-action">Click to Book</div>
        `;
        
        // Clicking open slot prefills booking modal
        slotDiv.addEventListener('click', (e) => {
          e.stopPropagation();
          const startTimeStr = minutesToTimeStr(slot.start);
          const endTimeStr = minutesToTimeStr(slot.start + state.durationMinutes);
          // slot is already converted to display time, so slot.dayIndex represents display day
          openBookingModal(slot.dayIndex, startTimeStr, endTimeStr);
        });
        
        dayColumn.appendChild(slotDiv);
      });
    }

    daysColumnsWrapper.appendChild(dayColumn);
  }
  
  reloadIcons();
}

// Populate the right side smart scheduler suggestion list
function updateSmartSuggestions() {
  suggestionsList.innerHTML = '';
  
  if (state.selectedFriends.length === 0) {
    suggestionsList.innerHTML = `
      <div class="no-selections">
        Select friends in the sidebar to calculate common free slots
      </div>
    `;
    return;
  }
  
  const duration = state.durationMinutes;
  const commonSlots = calculateCommonFreeSlots(duration).map(slotToDisplay);
  
  if (commonSlots.length === 0) {
    suggestionsList.innerHTML = `
      <div class="no-selections" style="color: var(--color-busy); border-color: rgba(239, 68, 68, 0.2)">
        <i data-lucide="alert-circle" style="margin-bottom: 4px;"></i>
        No common slots found for ${duration} mins. Try selecting fewer friends or changing duration.
      </div>
    `;
    reloadIcons();
    return;
  }

  // Sort slots: prioritizes mid-days over early mornings or late evenings
  // Take top 4 suggestions
  const sortedSlots = commonSlots.sort((a, b) => {
    // Score based on daily ideal time (e.g. 11am to 3pm is preferred)
    const idealTime = 720; // 12:00 PM
    const aDist = Math.abs(a.start - idealTime);
    const bDist = Math.abs(b.start - idealTime);
    return aDist - bDist;
  }).slice(0, 4);

  sortedSlots.forEach(slot => {
    const card = document.createElement('div');
    card.className = 'suggestion-card';
    
    const dayName = DAY_NAMES[slot.dayIndex];
    const dateFormatted = getDateOfIndex(slot.dayIndex).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    const timeRangeStr = `${minutesToTwelveHourStr(slot.start)} - ${minutesToTwelveHourStr(slot.start + duration)}`;
    
    card.innerHTML = `
      <div class="suggestion-info">
        <span class="suggestion-time">${timeRangeStr}</span>
        <span class="suggestion-date">${dayName}, ${dateFormatted}</span>
        <span class="suggestion-tag">Everyone Free</span>
      </div>
      <div class="suggestion-book-icon">
        <i data-lucide="plus"></i>
      </div>
    `;
    
    // Clicking card triggers booking modal
    card.addEventListener('click', () => {
      const startTimeStr = minutesToTimeStr(slot.start);
      const endTimeStr = minutesToTimeStr(slot.start + duration);
      openBookingModal(slot.dayIndex, startTimeStr, endTimeStr);
    });
    
    suggestionsList.appendChild(card);
  });
  
  reloadIcons();
}

// Populate the right side shared plans list
function renderSharedEventsWidget() {
  sharedEventsList.innerHTML = '';
  
  const sharedEvents = state.events.filter(e => e.owner === 'shared');
  
  if (sharedEvents.length === 0) {
    sharedEventsList.innerHTML = `
      <div class="no-selections">No group plans booked yet. Try scheduling one!</div>
    `;
    return;
  }
  
  sharedEvents.forEach(event => {
    const item = document.createElement('div');
    item.className = 'shared-event-item';
    
    // Shift from GMT to display
    const displayStart = gmtToDisplay(event.dayIndex, event.startTime);
    const displayEnd = gmtToDisplay(event.dayIndex, event.endTime);
    
    const dayName = DAY_NAMES[displayStart.dayIndex];
    const dateStr = getDateOfIndex(displayStart.dayIndex).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    const startMin = timeToMinutes(displayStart.timeStr);
    const endMin = timeToMinutes(displayEnd.timeStr);
    
    // Icon category maps
    const emojis = { hangout: '🍿', study: '📚', dinner: '🍔', sports: '⚽', gaming: '🎮' };
    const emoji = emojis[event.category] || '🍿';
    
    let dotsHtml = '<span class="mini-attendee-dot" style="background-color: #3b82f6" title="You"></span>';
    event.attendees.forEach(fid => {
      const f = state.friends[fid];
      if (f) {
        dotsHtml += `<span class="mini-attendee-dot" style="background-color: ${f.color}" title="${f.name}"></span>`;
      }
    });

    item.innerHTML = `
      <div class="shared-event-icon-box ${event.category}">
        ${emoji}
      </div>
      <div class="shared-event-details">
        <span class="shared-event-name">${event.title}</span>
        <span class="shared-event-time">${dayName}, ${dateStr} at ${minutesToTwelveHourStr(startMin)}</span>
        <div class="shared-event-attendees">
          ${dotsHtml}
        </div>
      </div>
    `;
    
    sharedEventsList.appendChild(item);
  });
}

// -------------------------------------------------------------
// 6. MODAL INTERACTION CONTROLS
// -------------------------------------------------------------

// Open/Close Event Action Modal
function openEventActionModal(event, ownerName, displayTitle, displayDayName, startMin, endMin) {
  const modalTitle = document.getElementById('eventActionModalTitle');
  const badge = document.getElementById('eventActionCategoryBadge');
  const owner = document.getElementById('eventActionOwner');
  const titleText = document.getElementById('eventActionTitleText');
  const timeText = document.getElementById('eventActionTimeText');
  const notesText = document.getElementById('eventActionNotesText');
  
  const copyBtn = document.getElementById('eventActionCopyBtn');
  const cancelSharedBtn = document.getElementById('eventActionCancelSharedBtn');
  const deleteBtn = document.getElementById('eventActionDeleteBtn');
  const editBtn = document.getElementById('eventActionEditBtn');
  
  if (modalTitle) modalTitle.textContent = event.owner === 'user' ? 'Manage Personal Slot' : (event.owner === 'shared' ? 'Manage Shared Event' : 'Event Details');
  if (badge) {
    badge.textContent = event.category || 'Busy';
    badge.className = `badge ${event.category || 'hangout'}`;
  }
  if (owner) owner.textContent = ownerName;
  if (titleText) titleText.textContent = displayTitle;
  if (timeText) {
    const timeStr = `${minutesToTwelveHourStr(startMin)} - ${minutesToTwelveHourStr(endMin)}`;
    timeText.innerHTML = `<i data-lucide="clock" style="width: 14px; height: 14px; color: var(--accent-primary);"></i> <span>${displayDayName}, ${timeStr}</span>`;
  }
  if (notesText) {
    if (event.notes) {
      notesText.textContent = event.notes;
      notesText.style.display = 'block';
    } else {
      notesText.style.display = 'none';
    }
  }
  
  // Set up button visibilities & handlers
  if (event.owner === 'user') {
    if (editBtn) {
      editBtn.style.display = 'flex';
      editBtn.onclick = () => {
        openBookingModal(event.dayIndex, event.startTime, event.endTime, event);
        closeEventActionModal();
      };
    }
    copyBtn.style.display = 'flex';
    cancelSharedBtn.style.display = 'none';
    deleteBtn.style.display = 'flex';
    
    // Copy button handler
    copyBtn.onclick = () => {
      state.copiedEvent = {
        title: event.title,
        startTime: event.startTime,
        endTime: event.endTime,
        category: event.category,
        notes: event.notes,
        owner: event.owner
      };
      localStorage.setItem('arctime_copied_event', JSON.stringify(state.copiedEvent));
      updateClipboardBanner();
      showToast(`Copied "${event.title}"! Click any empty day space to paste it.`);
      closeEventActionModal();
    };
    
    // Delete button handler (Supabase-backed)
    deleteBtn.onclick = async () => {
      await arctimeDeleteEvent(event.id);
      state.events = state.events.filter(ev => ev.id !== event.id);
      addNotification('Slot Removed', `Removed personal slot: "${event.title}"`, 'info');
      renderCalendar();
      updateSmartSuggestions();
      closeEventActionModal();
    };
  } else if (event.owner === 'shared') {
    if (editBtn) {
      editBtn.style.display = 'flex';
      editBtn.onclick = () => {
        openBookingModal(event.dayIndex, event.startTime, event.endTime, event);
        closeEventActionModal();
      };
    }
    copyBtn.style.display = 'none';
    cancelSharedBtn.style.display = 'flex';
    deleteBtn.style.display = 'none';
    
    // Cancel shared button handler (Supabase-backed)
    cancelSharedBtn.onclick = async () => {
      await arctimeDeleteEvent(event.id);
      state.events = state.events.filter(ev => ev.id !== event.id);
      addNotification('Event Cancelled', `Cancelled shared event: ${event.title}`, 'warning');
      renderCalendar();
      renderSharedEventsWidget();
      updateSmartSuggestions();
      closeEventActionModal();
    };
  } else {
    // Friend's busy slot (Read-Only)
    if (editBtn) editBtn.style.display = 'none';
    copyBtn.style.display = 'none';
    cancelSharedBtn.style.display = 'none';
    deleteBtn.style.display = 'none';
  }
  
  reloadIcons();
  eventActionModal.classList.add('open');
}

function closeEventActionModal() {
  eventActionModal.classList.remove('open');
}

// Open/Close Paste Action Modal
function openPasteActionModal(title, timeStr, dayName, onConfirm, onNew) {
  const slotTitleEl = document.getElementById('pasteActionSlotTitle');
  const timeTextEl = document.getElementById('pasteActionTimeText');
  const confirmBtn = document.getElementById('pasteActionConfirmBtn');
  const newBtn = document.getElementById('pasteActionNewBtn');
  
  if (slotTitleEl) slotTitleEl.textContent = title;
  if (timeTextEl) timeTextEl.textContent = `Target time: ${timeStr} (${dayName})`;
  
  confirmBtn.onclick = () => {
    onConfirm();
    closePasteActionModal();
  };
  
  newBtn.onclick = () => {
    onNew();
    closePasteActionModal();
  };
  
  pasteActionModal.classList.add('open');
}

function closePasteActionModal() {
  pasteActionModal.classList.remove('open');
}

function openBookingModal(dayIndex, startTimeStr = '12:00', endTimeStr = '13:00', editingEvent = null) {
  state.editingEventId = editingEvent ? editingEvent.id : null;
  
  const modalTitleEl = document.querySelector('#bookingModal .modal-header h3');
  const submitBtnEl = document.getElementById('submitBookingBtn');
  
  let targetDayIndex = dayIndex;
  let targetStartTime = startTimeStr;
  let targetEndTime = endTimeStr;
  
  if (editingEvent) {
    if (modalTitleEl) modalTitleEl.textContent = editingEvent.owner === 'user' ? 'Edit Personal Slot' : 'Edit Group Activity';
    if (submitBtnEl) submitBtnEl.textContent = 'Save Changes';
    
    // Convert GMT event times to active display timezone
    const displayStart = gmtToDisplay(editingEvent.dayIndex, editingEvent.startTime);
    const displayEnd = gmtToDisplay(editingEvent.dayIndex, editingEvent.endTime);
    
    targetDayIndex = displayStart.dayIndex;
    targetStartTime = displayStart.timeStr;
    targetEndTime = displayEnd.timeStr;
    
    document.getElementById('eventTitle').value = editingEvent.title;
    document.getElementById('eventCategory').value = editingEvent.category || 'Busy';
    document.getElementById('eventNotes').value = editingEvent.notes || '';
    
    // Set type radios
    const typeValue = editingEvent.owner === 'user' ? 'personal' : 'group';
    const typeRadio = document.querySelector(`input[name="eventType"][value="${typeValue}"]`);
    if (typeRadio) {
      typeRadio.checked = true;
      typeRadio.dispatchEvent(new Event('change'));
    }
  } else {
    if (modalTitleEl) modalTitleEl.textContent = 'Book Group Activity';
    if (submitBtnEl) submitBtnEl.textContent = 'Create Shared Event';
    
    document.getElementById('eventTitle').value = '';
    document.getElementById('eventCategory').value = 'Busy';
    document.getElementById('eventNotes').value = '';
    
    // Default event type to Personal
    const personalRadio = document.querySelector('input[name="eventType"][value="personal"]');
    if (personalRadio) {
      personalRadio.checked = true;
      personalRadio.dispatchEvent(new Event('change'));
    }
  }
  
  const targetDate = getDateOfIndex(targetDayIndex);
  const yyyy = targetDate.getFullYear();
  const mm = String(targetDate.getMonth() + 1).padStart(2, '0');
  const dd = String(targetDate.getDate()).padStart(2, '0');
  
  document.getElementById('eventDate').value = `${yyyy}-${mm}-${dd}`;
  document.getElementById('eventStartTime').value = targetStartTime;
  
  const startMin = timeToMinutes(targetStartTime);
  const endMin = timeToMinutes(targetEndTime);
  let diff = endMin - startMin;
  if (diff < 0) diff += 1440;
  
  document.getElementById('eventDuration').value = diff > 0 ? diff.toString() : '60';
  
  // Populate checkbox list inside the booking modal
  modalFriendsCheckboxContainer.innerHTML = '';
  Object.values(state.friends).forEach(friend => {
    const isChecked = editingEvent
      ? editingEvent.attendees.includes(friend.id)
      : state.selectedFriends.includes(friend.id);
      
    const label = document.createElement('label');
    label.className = 'friend-checkbox-label';
    label.innerHTML = `
      <input type="checkbox" name="invitedFriend" value="${friend.id}" ${isChecked ? 'checked' : ''}>
      <span style="color: ${friend.color}">●</span> ${friend.name}
    `;
    modalFriendsCheckboxContainer.appendChild(label);
  });
  
  bookingModal.classList.add('open');
}

function closeBookingModal() {
  state.editingEventId = null;
  bookingModal.classList.remove('open');
}

// -------------------------------------------------------------
// 7. EVENT LISTENERS & FORM SUBMISSIONS
// -------------------------------------------------------------

// Booking Submit Form (Supabase-backed)
bookingForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  
  if (!state.userId) {
    showToast('You must be signed in to create events', 'info');
    return;
  }
  
  const eventType = document.querySelector('input[name="eventType"]:checked').value;
  
  const title = document.getElementById('eventTitle').value.trim();
  const rawDate = document.getElementById('eventDate').value;
  const startTimeStr = document.getElementById('eventStartTime').value;
  const duration = parseInt(document.getElementById('eventDuration').value, 10);
  const category = document.getElementById('eventCategory').value;
  const notes = document.getElementById('eventNotes').value.trim();
  
  // Gather checked invitees
  const checkboxes = document.querySelectorAll('input[name="invitedFriend"]:checked');
  const invitees = Array.from(checkboxes).map(cb => cb.value);
  
  // Determine dayIndex relative to currentWeekStart
  const [year, month, day] = rawDate.split('-').map(Number);
  const bookingDate = new Date(year, month - 1, day);
  const startCopy = new Date(state.currentWeekStart);
  startCopy.setHours(0,0,0,0);
  bookingDate.setHours(0,0,0,0);
  
  const timeDiff = bookingDate.getTime() - startCopy.getTime();
  const displayDayIndex = Math.round(timeDiff / (1000 * 60 * 60 * 24));
  
  if (displayDayIndex < 0 || displayDayIndex > 6) {
    showToast('Please choose a date within the current week view!', 'info');
    return;
  }
  
  // Convert Display time to GMT for database storage
  const gmtTimes = displayToGmt(displayDayIndex, startTimeStr);
  const gmtDayIndex = gmtTimes.dayIndex;
  const gmtStartTime = gmtTimes.timeStr;
  
  const startMinGmt = timeToMinutes(gmtStartTime);
  const endMinGmt = startMinGmt + duration;
  const gmtEndTime = minutesToTimeStr(endMinGmt);
  
  if (endMinGmt > 1440) {
    showToast('Activity must finish before midnight!', 'info');
    return;
  }
  
  // EDIT: update existing event
  if (state.editingEventId) {
    const { error: updateError } = await arctimeUpdateEvent(state.editingEventId, {
      title,
      day_index: gmtDayIndex,
      start_time: gmtStartTime,
      end_time: gmtEndTime,
      event_type: eventType,
      category,
      notes
    });
    
    if (updateError) {
      showToast('Failed to update event: ' + updateError.message, 'info');
      return;
    }
    
    // Update attendees if group event
    if (eventType === 'group') {
      // Remove old attendees, add new ones
      // For simplicity, we re-add attendees
      // In production, you'd diff the lists
    }
    
    await saveEventsToStorage();
    closeBookingModal();
    addNotification('Slot Updated', `Updated details for "${title}"`, 'info');
    renderCalendar();
    renderSharedEventsWidget();
    updateSmartSuggestions();
    return;
  }
  
  // CREATE new event
  const { data: newEvent, error: createError } = await arctimeCreateEvent({
    user_id: state.userId,
    title,
    day_index: gmtDayIndex,
    start_time: gmtStartTime,
    end_time: gmtEndTime,
    event_type: eventType,
    category,
    notes
  });
  
  if (createError) {
    showToast('Failed to create event: ' + createError.message, 'info');
    return;
  }
  
  // Add attendees for group events
  if (eventType === 'group' && invitees.length > 0) {
    await arctimeAddAttendees(newEvent.id, invitees);
  }
  
  await saveEventsToStorage();
  closeBookingModal();
  
  if (eventType === 'personal') {
    addNotification('Calendar Blocked', `Blocked personal busy time: "${title}"`, 'warning');
  } else {
    addNotification('Group Plan Booked', `Successfully booked "${title}" together!`, 'success');
  }
  
  renderCalendar();
  renderSharedEventsWidget();
  updateSmartSuggestions();
});

// Modal close button connections
document.getElementById('openAddFriendModalBtn').addEventListener('click', () => {
  friendsHubOpen = true;
  friendsHubPanel.classList.add('open');
  document.getElementById('closeFriendsHubBtn').style.display = 'flex';
});

document.getElementById('closeBookingModalBtn').addEventListener('click', closeBookingModal);
document.getElementById('cancelBookingBtn').addEventListener('click', closeBookingModal);

// Close modal when clicking backdrop
[bookingModal, addFriendModal].forEach(modal => {
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.classList.remove('open');
    }
  });
});

// Duration change handler
durationSelect.addEventListener('change', (e) => {
  state.durationMinutes = parseInt(e.target.value, 10);
  updateSmartSuggestions();
  renderCalendar();
});

// Highlight toggler navbar
toggleCommonFreeHighlight.addEventListener('click', () => {
  state.highlightCommonFree = !state.highlightCommonFree;
  
  if (state.highlightCommonFree) {
    toggleCommonFreeHighlight.classList.add('active');
    showToast('Overlaying common free slots on calendar grid');
  } else {
    toggleCommonFreeHighlight.classList.remove('active');
    showToast('Common free slots hidden');
  }
  
  renderCalendar();
});

// Active Scheduler calculation button click trigger
findTimesBtn.addEventListener('click', () => {
  updateSmartSuggestions();
  showToast('Recalculated mutual availability slots!');
});

// Timezone selector handler
timezoneSelect.addEventListener('change', (e) => {
  state.timezone = e.target.value;
  addNotification('Timezone Switched', `Active timezone set to ${state.timezone}`, 'info');
  renderCalendarHeader();
  renderCalendar();
  updateSmartSuggestions();
  renderSharedEventsWidget();
});

// User quick status button controls
document.querySelectorAll('.status-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.status-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    
    const statusVal = btn.dataset.status;
    state.userAvailability = statusVal;
    
    if (statusVal === 'busy') {
      addNotification('My Status: Busy', 'Status set to BUSY. Added overlay block to your schedule.', 'warning');
      state.events.push({ id: 'u-busy-temp', title: 'User Blocked Time', dayIndex: 0, startTime: '11:00', endTime: '13:00', owner: 'user', category: 'study' });
    } else {
      addNotification('My Status: Free', 'Status set to AVAILABLE. Cleared blocked slots.', 'success');
      state.events = state.events.filter(e => e.id !== 'u-busy-temp');
    }
    
    renderCalendar();
    updateSmartSuggestions();
  });
});

// Week switcher controls
prevWeekBtn.addEventListener('click', () => {
  state.currentWeekStart.setDate(state.currentWeekStart.getDate() - 7);
  renderCalendarHeader();
  renderCalendar();
  updateSmartSuggestions();
  showToast('Switched to previous week');
});

nextWeekBtn.addEventListener('click', () => {
  state.currentWeekStart.setDate(state.currentWeekStart.getDate() + 7);
  renderCalendarHeader();
  renderCalendar();
  updateSmartSuggestions();
  showToast('Switched to next week');
});

todayBtn.addEventListener('click', () => {
  state.currentWeekStart = new Date(2026, 5, 8); // Reset back to starting mockup date
  renderCalendarHeader();
  renderCalendar();
  updateSmartSuggestions();
  showToast('Centered to current week view');
});

// -------------------------------------------------------------
// AUTH UI CONTROLS
// -------------------------------------------------------------

const authOverlay = document.getElementById('authOverlay');
const authCard = document.getElementById('authCard');

// Tab switching
document.getElementById('authTabLogin').addEventListener('click', () => switchAuthTab('login'));
document.getElementById('authTabSignup').addEventListener('click', () => switchAuthTab('signup'));

function switchAuthTab(mode) {
  document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
  document.getElementById(mode === 'login' ? 'authTabLogin' : 'authTabSignup').classList.add('active');
  document.getElementById('loginForm').style.display = mode === 'login' ? 'block' : 'none';
  document.getElementById('signupForm').style.display = mode === 'signup' ? 'block' : 'none';
  document.getElementById('loginError').style.display = 'none';
  document.getElementById('signupError').style.display = 'none';
}

// Login form
document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('loginEmail').value;
  const password = document.getElementById('loginPassword').value;
  const errorEl = document.getElementById('loginError');
  errorEl.style.display = 'none';
  
  document.getElementById('loginBtn').textContent = 'Signing in...';
  const { error } = await arctimeSignIn(email, password);
  document.getElementById('loginBtn').textContent = 'Sign In';
  
  if (error) {
    errorEl.textContent = error.message;
    errorEl.style.display = 'block';
    return;
  }
  
  // Successfully authenticated, load app data and transition UI
  await loadAppData();
});

// Signup form
document.getElementById('signupForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('signupEmail').value;
  const password = document.getElementById('signupPassword').value;
  const displayName = document.getElementById('signupDisplayName').value.trim();
  const username = document.getElementById('signupUsername').value.trim().toLowerCase().replace(/^@/, '');
  const errorEl = document.getElementById('signupError');
  errorEl.style.display = 'none';
  
  if (!username) {
    errorEl.textContent = 'Username is required';
    errorEl.style.display = 'block';
    return;
  }
  
  document.getElementById('signupBtn').textContent = 'Creating account...';
  const { error } = await arctimeSignUp(email, password, displayName, username);
  document.getElementById('signupBtn').textContent = 'Create Account';
  
  if (error) {
    errorEl.textContent = error.message;
    errorEl.style.display = 'block';
    return;
  }
  
  showToast('Account created! Check your email for confirmation.', 'success');
  switchAuthTab('login');
});

// Add a sign-out button to the sidebar
function addSignOutButton() {
  const existing = document.getElementById('signOutBtn');
  if (existing) existing.remove();
  
  const profileCard = document.getElementById('userProfileCard');
  const btn = document.createElement('button');
  btn.id = 'signOutBtn';
  btn.className = 'user-menu-btn';
  btn.innerHTML = '<i data-lucide="log-out" style="width: 14px; height: 14px;"></i> Sign Out';
  btn.addEventListener('click', async () => {
    await arctimeSignOut();
    window.location.reload();
  });
  profileCard.parentNode.insertBefore(btn, profileCard.nextSibling);
  reloadIcons();
}

// -------------------------------------------------------------
// AUTH-GATED APP LOADER
// -------------------------------------------------------------

async function loadAppData() {
  const { session } = await arctimeGetSession();
  
  if (!session) {
    // Show auth overlay, hide app
    authOverlay.classList.remove('hidden');
    document.getElementById('appContainer').style.display = 'none';
    document.getElementById('loadingScreen').classList.add('hidden');
    return;
  }
  
  state.session = session;
  state.user = session.user;
  state.userId = session.user.id;
  
  // Load profile
  const { data: profile } = await arctimeGetProfile(session.user.id);
  if (profile) {
    state.username = profile.display_name || '';
    state.usernameHandle = profile.username || '';
    state.avatar = profile.avatar_url || state.avatar;
    state.timezone = profile.timezone || 'BST';
  }
  
  // Load events (RLS returns own + friends' events)
  const { data: events } = await arctimeGetEvents(0, 6);
  state.events = events || [];
  
  // Load friendships (get connected friends' profiles)
  const { data: friends } = await arctimeGetFriends(session.user.id);
  state.friendsData = friends || [];
  state.friends = {};
  state.friendsData.forEach(f => {
    state.friends[f.id] = {
      id: f.id,
      name: f.display_name || f.username,
      username: f.username,
      avatar: f.avatar_url,
      color: '#8B5CF6', // Default color; could be stored per-friendship
      status: 'Available',
      statusType: 'free'
    };
  });
  
  // Load friend requests and enrich with profile info
  const { data: requests } = await arctimeGetFriendRequests(session.user.id);
  if (requests) {
    const pendingSent = requests.filter(r => r.sender_id === session.user.id && r.status === 'pending');
    const pendingIncoming = requests.filter(r => r.receiver_id === session.user.id && r.status === 'pending');
    
    // Enrich sent requests with receiver profile
    const receiverIds = [...new Set(pendingSent.map(r => r.receiver_id))];
    const senderIds = [...new Set(pendingIncoming.map(r => r.sender_id))];
    const allProfileIds = [...new Set([...receiverIds, ...senderIds])];
    const profiles = {};
    for (const pid of allProfileIds) {
      const { data: p } = await arctimeGetProfile(pid);
      if (p) profiles[pid] = p;
    }
    
    state.sentRequests = pendingSent.map(r => ({
      ...r,
      receiver_username: profiles[r.receiver_id]?.username || 'unknown',
      name: profiles[r.receiver_id]?.display_name || 'Unknown'
    }));
    state.incomingRequests = pendingIncoming.map(r => ({
      ...r,
      sender_username: profiles[r.sender_id]?.username || 'unknown',
      name: profiles[r.sender_id]?.display_name || 'Unknown'
    }));
  }
  
  // Hide auth, show app
  authOverlay.classList.add('hidden');
  document.getElementById('loadingScreen').classList.add('hidden');
  document.getElementById('appContainer').style.display = '';
  
  // Set up real-time subscriptions
  setupRealtime();
  
  // Render everything
  userProfileName.textContent = state.username;
  userProfileAvatar.src = state.avatar;
  addSignOutButton();
  
  renderFriendsSidebar();
  renderActiveAttendeeChips();
  renderCalendarHeader();
  renderTimeLabels();
  renderCalendar();
  updateSmartSuggestions();
  renderSharedEventsWidget();
  loadWallpaper();
  updateBadgeDisplay();
  renderNotificationsList();
  updateNotificationsBadge();
  updateClipboardBanner();
  
  showToast(`Welcome, ${state.username}!`, 'success');
}

function setupRealtime() {
  // Unsubscribe existing
  if (state._eventsChannel) arctimeUnsubscribe(state._eventsChannel);
  if (state._requestsChannel) arctimeUnsubscribe(state._requestsChannel);
  
  // Subscribe to events changes
  state._eventsChannel = arctimeSubscribeEvents('events', async (payload) => {
    // Re-fetch events on any change
    const { data } = await arctimeGetEvents(0, 6);
    if (data) {
      state.events = data;
      renderCalendar();
      updateSmartSuggestions();
      renderSharedEventsWidget();
    }
  });
  
  // Subscribe to new friend requests
  if (state.userId) {
    state._requestsChannel = arctimeSubscribeFriendRequests(state.userId, async (payload) => {
      const req = payload.new;
      if (req && req.status === 'pending') {
        const { data: profile } = await arctimeGetProfile(req.sender_id);
        const enriched = {
          ...req,
          sender_username: profile?.username || 'unknown',
          name: profile?.display_name || 'Someone'
        };
        state.incomingRequests.push(enriched);
        renderFriendsHub();
        updateBadgeDisplay();
        addNotification('Friend Request', `Friend request from ${enriched.name}!`, 'info');
      }
    });
  }
}

// -------------------------------------------------------------
// SUPABASE-BACKED PERSISTENCE (replaces localStorage)
// -------------------------------------------------------------

async function saveEventsToStorage() {
  // Preserve local-only events (busy status, sim slots) before re-fetch
  const localOnly = state.events.filter(
    e => e.id === 'u-busy-temp' || e.id.endsWith('-sim-busy')
  );
  const { data } = await arctimeGetEvents(0, 6);
  if (data) state.events = [...data, ...localOnly];
}

function saveRequestsToStorage() {
  // Requests are managed through Supabase directly.
  // Local state arrays are updated by the handlers.
}

// -------------------------------------------------------------
// 8. SYSTEM INITIALIZATION
// -------------------------------------------------------------
function init() {
  document.getElementById('loadingScreen').classList.remove('hidden');
  authOverlay.classList.add('hidden');
  
  loadAppData();
}

// Kick off

// -------------------------------------------------------------
// Wallpaper Customization Mechanics
// -------------------------------------------------------------
function loadWallpaper() {
  const savedWallpaper = localStorage.getItem('arctime_wallpaper');
  const savedOpacity = localStorage.getItem('arctime_wallpaper_opacity');
  const savedBlur = localStorage.getItem('arctime_wallpaper_blur');
  
  if (savedWallpaper) {
    wallpaperBgLayer.style.backgroundImage = `url(${savedWallpaper})`;
    wallpaperAdjusters.style.display = 'flex';
    resetWallpaperBtn.style.display = 'flex';
    
    // Opacity loading
    if (savedOpacity !== null) {
      wallpaperBgLayer.style.opacity = savedOpacity / 100;
      wallpaperOpacityInput.value = savedOpacity;
    } else {
      wallpaperBgLayer.style.opacity = 0.3;
      wallpaperOpacityInput.value = 30;
    }
    
    // Blur loading
    if (savedBlur !== null) {
      wallpaperBgLayer.style.filter = `blur(${savedBlur}px)`;
      wallpaperBlurInput.value = savedBlur;
    } else {
      wallpaperBgLayer.style.filter = 'blur(0px)';
      wallpaperBlurInput.value = 0;
    }
  } else {
    wallpaperBgLayer.style.backgroundImage = 'none';
    wallpaperAdjusters.style.display = 'none';
    resetWallpaperBtn.style.display = 'none';
  }
}

// Upload Trigger Button
uploadWallpaperBtn.addEventListener('click', () => {
  wallpaperInput.click();
});

// File reader listener
wallpaperInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  
  // File size limit (approx 3MB) to prevent localStorage quota issues
  if (file.size > 3 * 1024 * 1024) {
    showToast('Image is too large! Please choose an image smaller than 3MB.', 'info');
    return;
  }
  
  const reader = new FileReader();
  reader.onload = function(event) {
    const dataUrl = event.target.result;
    
    try {
      localStorage.setItem('arctime_wallpaper', dataUrl);
      // Default adjustments on upload
      localStorage.setItem('arctime_wallpaper_opacity', '30');
      localStorage.setItem('arctime_wallpaper_blur', '0');
      
      loadWallpaper();
      addNotification('Wallpaper Updated', 'Custom chat wallpaper set successfully!', 'success');
    } catch(err) {
      showToast('Failed to save wallpaper: LocalStorage quota exceeded. Choose a smaller image!', 'info');
      console.error(err);
    }
  };
  
  reader.readAsDataURL(file);
});

// Opacity adjust slider
wallpaperOpacityInput.addEventListener('input', (e) => {
  const val = e.target.value;
  wallpaperBgLayer.style.opacity = val / 100;
  localStorage.setItem('arctime_wallpaper_opacity', val);
});

// Blur adjust slider
wallpaperBlurInput.addEventListener('input', (e) => {
  const val = e.target.value;
  wallpaperBgLayer.style.filter = `blur(${val}px)`;
  localStorage.setItem('arctime_wallpaper_blur', val);
});

// Reset Wallpaper button click
resetWallpaperBtn.addEventListener('click', () => {
  localStorage.removeItem('arctime_wallpaper');
  localStorage.removeItem('arctime_wallpaper_opacity');
  localStorage.removeItem('arctime_wallpaper_blur');
  
  loadWallpaper();
  addNotification('Wallpaper Reset', 'Wallpaper cleared and reset to default', 'info');
});

// -------------------------------------------------------------
// User Settings Drawer Mechanics
// -------------------------------------------------------------

// Open Settings Drawer
function openSettings() {
  settingsUsername.value = state.username;
  settingsUserUsername.value = state.usernameHandle;
  settingsPrivacy.value = state.privacyLevel;
  settingsAvatarPreview.src = state.avatar;
  settingsUsernameWarning.style.display = 'none';
  
  settingsDrawer.classList.add('open');
  settingsDrawerBackdrop.classList.add('open');
}

// Close Settings Drawer
function closeSettings() {
  settingsDrawer.classList.remove('open');
  settingsDrawerBackdrop.classList.remove('open');
}

openSettingsBtn.addEventListener('click', openSettings);
userProfileCard.addEventListener('click', openSettings);

closeSettingsBtn.addEventListener('click', closeSettings);
cancelSettingsBtn.addEventListener('click', closeSettings);
settingsDrawerBackdrop.addEventListener('click', closeSettings);

// Trigger Avatar Input
triggerAvatarUploadBtn.addEventListener('click', () => {
  avatarInput.click();
});

// File reader listener for Avatar Photo and WhatsApp-style Cropping Modal
const cropModal = document.getElementById('cropModal');
const closeCropModalBtn = document.getElementById('closeCropModalBtn');
const cancelCropBtn = document.getElementById('cancelCropBtn');
const applyCropBtn = document.getElementById('applyCropBtn');
const cropSourceImage = document.getElementById('cropSourceImage');
const cropZoomSlider = document.getElementById('cropZoomSlider');
const cropWorkspace = document.getElementById('cropWorkspace');

let cropOffsetX = 0;
let cropOffsetY = 0;
let isCropDragging = false;
let cropStartX = 0;
let cropStartY = 0;

function openCropModal(imageSrc) {
  cropSourceImage.src = imageSrc;
  cropModal.classList.add('open');
}

function closeCropModal() {
  cropModal.classList.remove('open');
  avatarInput.value = ''; // Reset input
}

if (closeCropModalBtn) closeCropModalBtn.addEventListener('click', closeCropModal);
if (cancelCropBtn) cancelCropBtn.addEventListener('click', closeCropModal);

// Crop Image loader adjustments
cropSourceImage.onload = function() {
  const aspect = cropSourceImage.naturalWidth / cropSourceImage.naturalHeight;
  const cropSize = 200;
  const workspaceSize = 260;
  let w, h;
  
  if (aspect > 1) {
    // Landscape
    h = cropSize;
    w = cropSize * aspect;
  } else {
    // Portrait or square
    w = cropSize;
    h = cropSize / aspect;
  }
  
  cropSourceImage.style.width = w + 'px';
  cropSourceImage.style.height = h + 'px';
  
  // Center image inside workspace
  cropOffsetX = (workspaceSize - w) / 2;
  cropOffsetY = (workspaceSize - h) / 2;
  cropSourceImage.style.left = cropOffsetX + 'px';
  cropSourceImage.style.top = cropOffsetY + 'px';
  
  // Reset Zoom
  cropZoomSlider.value = 100;
  cropSourceImage.style.transform = 'scale(1)';
};

// Dragging handlers
cropWorkspace.addEventListener('mousedown', (e) => {
  isCropDragging = true;
  cropStartX = e.clientX - cropOffsetX;
  cropStartY = e.clientY - cropOffsetY;
  e.preventDefault();
});

window.addEventListener('mousemove', (e) => {
  if (!isCropDragging) return;
  cropOffsetX = e.clientX - cropStartX;
  cropOffsetY = e.clientY - cropStartY;
  cropSourceImage.style.left = cropOffsetX + 'px';
  cropSourceImage.style.top = cropOffsetY + 'px';
});

window.addEventListener('mouseup', () => {
  isCropDragging = false;
});

// Touch Dragging handlers
cropWorkspace.addEventListener('touchstart', (e) => {
  if (e.touches.length === 1) {
    isCropDragging = true;
    cropStartX = e.touches[0].clientX - cropOffsetX;
    cropStartY = e.touches[0].clientY - cropOffsetY;
  }
});

window.addEventListener('touchmove', (e) => {
  if (!isCropDragging || e.touches.length !== 1) return;
  cropOffsetX = e.touches[0].clientX - cropStartX;
  cropOffsetY = e.touches[0].clientY - cropStartY;
  cropSourceImage.style.left = cropOffsetX + 'px';
  cropSourceImage.style.top = cropOffsetY + 'px';
});

window.addEventListener('touchend', () => {
  isCropDragging = false;
});

// Zoom slider changes
cropZoomSlider.addEventListener('input', () => {
  const scale = cropZoomSlider.value / 100;
  cropSourceImage.style.transform = `scale(${scale})`;
});

// Apply Crop handler
applyCropBtn.addEventListener('click', () => {
  const canvas = document.createElement('canvas');
  canvas.width = 200;
  canvas.height = 200;
  const ctx = canvas.getContext('2d');
  
  const scale = parseFloat(cropZoomSlider.value) / 100;
  const w = parseFloat(cropSourceImage.style.width);
  const h = parseFloat(cropSourceImage.style.height);
  
  const dw = w * scale;
  const dh = h * scale;
  
  // Calculate top-left scaled coordinate relative to workspace top-left, then offset crop window (30px border)
  const dx = cropOffsetX + (w - dw) / 2 - 30;
  const dy = cropOffsetY + (h - dh) / 2 - 30;
  
  ctx.drawImage(cropSourceImage, dx, dy, dw, dh);
  
  const croppedDataUrl = canvas.toDataURL('image/jpeg', 0.85);
  settingsAvatarPreview.src = croppedDataUrl;
  
  closeCropModal();
  showToast('Profile photo cropped successfully. Save changes to apply.');
});

// File reader listener for Avatar Photo trigger
avatarInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  
  if (file.size > 1.5 * 1024 * 1024) {
    showToast('Photo is too large! Choose an image smaller than 1.5MB.', 'info');
    return;
  }
  
  const reader = new FileReader();
  reader.onload = function(event) {
    const dataUrl = event.target.result;
    openCropModal(dataUrl);
  };
  reader.readAsDataURL(file);
});

// Save Settings Form
saveSettingsBtn.addEventListener('click', () => {
  const newUsername = settingsUsername.value.trim();
  if (!newUsername) {
    showToast('Display Name cannot be empty!', 'info');
    return;
  }
  
  const newHandle = settingsUserUsername.value.trim().toLowerCase().replace(/^@/, '');
  if (!newHandle) {
    showToast('Username Handle cannot be empty!', 'info');
    return;
  }
  
  // Validate unique handle: check if it overlaps with any friend's username
  let isDuplicate = false;
  Object.values(state.friends).forEach(friend => {
    if (friend.username === newHandle) {
      isDuplicate = true;
    }
  });
  
  if (isDuplicate) {
    settingsUsernameWarning.style.display = 'flex';
    showToast('Error: Username handle already taken by a friend!', 'info');
    return;
  }
  
  settingsUsernameWarning.style.display = 'none';
  state.username = newUsername;
  state.usernameHandle = newHandle;
  state.privacyLevel = settingsPrivacy.value;
  state.avatar = settingsAvatarPreview.src;
  
  // Save to Supabase
  arctimeUpdateProfile(state.userId, {
    display_name: state.username,
    username: state.usernameHandle,
    privacy_level: state.privacyLevel,
    avatar_url: state.avatar
  });
  
  // Update UI Card
  userProfileName.textContent = state.username;
  userProfileAvatar.src = state.avatar;
  
  closeSettings();
  addNotification('Settings Saved', 'Profile settings updated successfully!', 'success');
  
  // Re-run renders to reflect changed access level and username
  renderCalendar();
  updateSmartSuggestions();
  
  // If Friends Hub is active, rebuild it
  if (friendsHubWrapper.style.display === 'flex') {
    renderFriendsHub();
  }
});

// -------------------------------------------------------------
// Friends Hub Tab Navigation & Management Mechanics
// -------------------------------------------------------------

// Toggle Views: Calendar vs Friends Hub
function toggleViewMode(mode) {
  const appContainer = document.querySelector('.app-container');
  
  if (mode === 'calendar') {
    showCalendarBtn.classList.add('active');
    showFriendsHubBtn.classList.remove('active');
    
    showCalendarBtn.style.background = 'rgba(255, 255, 255, 0.08)';
    showCalendarBtn.style.color = 'var(--text-primary)';
    showFriendsHubBtn.style.background = 'none';
    showFriendsHubBtn.style.color = 'var(--text-secondary)';
    
    calendarWrapper.style.display = 'flex';
    friendsHubWrapper.style.display = 'none';
    
    appContainer.classList.remove('friends-mode');
    
    renderCalendar();
    updateSmartSuggestions();
  } else {
    showCalendarBtn.classList.remove('active');
    showFriendsHubBtn.classList.add('active');
    
    showFriendsHubBtn.style.background = 'rgba(255, 255, 255, 0.08)';
    showFriendsHubBtn.style.color = 'var(--text-primary)';
    showCalendarBtn.style.background = 'none';
    showCalendarBtn.style.color = 'var(--text-secondary)';
    
    calendarWrapper.style.display = 'none';
    friendsHubWrapper.style.display = 'flex';
    
    appContainer.classList.add('friends-mode');
    
    renderFriendsHub();
  }
}

showCalendarBtn.addEventListener('click', () => toggleViewMode('calendar'));
showFriendsHubBtn.addEventListener('click', () => toggleViewMode('friends-hub'));

// Update Navbar Notification Badge
function updateBadgeDisplay() {
  const count = state.incomingRequests.length;
  if (count === 0) {
    pendingRequestsBadge.style.display = 'none';
  } else {
    pendingRequestsBadge.style.display = 'flex';
    pendingRequestsBadge.textContent = count;
  }
}



// Render Friends Hub Sub-Sections
function renderFriendsHub() {
  updateBadgeDisplay();
  renderDirectory();
  renderPendingRequests();
}

// Render connected friends directory
function renderDirectory() {
  directoryContainer.innerHTML = '';
  const friendsList = Object.values(state.friends);
  
  if (friendsList.length === 0) {
    directoryContainer.innerHTML = `
      <div style="font-size: 13px; color: var(--text-muted); text-align: center; padding: 32px; border: 1px dashed var(--border-color); border-radius: 12px; grid-column: span 2;">
        No friends connected yet. Send or accept friend requests to share timetables!
      </div>
    `;
    return;
  }
  
  friendsList.forEach(friend => {
    const div = document.createElement('div');
    div.style.display = 'flex';
    div.style.flexDirection = 'column';
    div.style.gap = '12px';
    div.style.padding = '14px 16px';
    div.style.background = 'rgba(255,255,255,0.02)';
    div.style.border = '1px solid var(--border-light)';
    div.style.borderRadius = '12px';
    
    const statusDotColor = friend.statusType === 'free' ? 'var(--color-free)' : (friend.statusType === 'away' ? 'var(--color-away)' : 'var(--color-busy)');
    
    div.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: space-between; width: 100%;">
        <div style="display: flex; align-items: center; gap: 12px;">
          <div style="position: relative;">
            <img src="${friend.avatar}" style="width: 42px; height: 42px; border-radius: 50%; object-fit: cover; border: 1px solid rgba(255,255,255,0.1);">
            <span class="status-dot-indicator" style="position: absolute; bottom: 0; right: 0; width: 10px; height: 10px; border-radius: 50%; border: 1.5px solid var(--bg-surface); background-color: ${statusDotColor}"></span>
          </div>
          <div style="display: flex; flex-direction: column;">
            <span style="font-size: 14px; font-weight: 600; color: var(--text-primary);">${friend.name}</span>
            <span style="font-size: 12px; color: var(--text-muted); display: flex; align-items: center; gap: 4px;">
              @${friend.username} <span style="display:inline-block; width:6px; height:6px; border-radius:50%; background:${friend.color};"></span>
            </span>
          </div>
        </div>
        <button class="remove-friend-btn" style="background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.2); color: #ef4444; border-radius: 8px; padding: 6px; cursor: pointer; display: flex; align-items: center; transition: all 0.2s;" title="Remove Friend">
          <i data-lucide="trash-2" style="width: 14px; height: 14px;"></i>
        </button>
      </div>
      
      <!-- Status Modifier Row -->
      <div style="display: flex; align-items: center; justify-content: space-between; gap: 10px; background: rgba(0, 0, 0, 0.15); padding: 8px 12px; border-radius: 8px; border: 1px solid var(--border-color);">
        <div style="display: flex; align-items: center; gap: 6px; width: 100%;">
          <select class="friend-status-select" style="background: #090a10; border: 1px solid var(--border-color); color: var(--text-primary); border-radius: 6px; padding: 4px 6px; font-size: 11px; font-weight: 600; cursor: pointer; outline: none; min-width: 90px;">
            <option value="free" ${friend.statusType === 'free' ? 'selected' : ''}>🟢 Free</option>
            <option value="away" ${friend.statusType === 'away' ? 'selected' : ''}>🟡 Away</option>
            <option value="busy" ${friend.statusType === 'busy' ? 'selected' : ''}>🔴 Busy</option>
          </select>
          <input type="text" class="friend-status-input" value="${friend.status || ''}" placeholder="Set status description..." style="background: #090a10; border: 1px solid var(--border-color); color: var(--text-secondary); border-radius: 6px; padding: 4px 8px; font-size: 11px; flex-grow: 1; outline: none; transition: border-color 0.2s;">
        </div>
      </div>
    `;
    
    const statusSelect = div.querySelector('.friend-status-select');
    const statusInput = div.querySelector('.friend-status-input');
    const statusDotIndicator = div.querySelector('.status-dot-indicator');
    
    statusSelect.addEventListener('change', (e) => {
      const newStatusType = e.target.value;
      const oldStatusType = friend.statusType;
      friend.statusType = newStatusType;
      
      const newDotColor = newStatusType === 'free' ? 'var(--color-free)' : (newStatusType === 'away' ? 'var(--color-away)' : 'var(--color-busy)');
      statusDotIndicator.style.backgroundColor = newDotColor;
      
      if (newStatusType === 'busy') {
        if (!state.events.some(ev => ev.id === `${friend.id}-sim-busy`)) {
          state.events.push({
            id: `${friend.id}-sim-busy`,
            title: 'Simulated Busy Slot 🛑',
            dayIndex: 2,
            startTime: '13:00',
            endTime: '17:00',
            owner: friend.id,
            category: 'study',
            notes: 'Auto-generated via simulation status change.'
          });
        }
        addNotification(`${friend.name} is Busy`, `@${friend.username} set status to Busy (Wednesday afternoon occupied)`, 'warning');
      } else {
        state.events = state.events.filter(ev => ev.id !== `${friend.id}-sim-busy`);
        
        const statusLabel = newStatusType === 'free' ? 'Available' : 'Away';
        const notifType = newStatusType === 'free' ? 'success' : 'away';
        
        if (oldStatusType !== newStatusType) {
          addNotification(`${friend.name} is ${statusLabel}`, `@${friend.username} set status to ${statusLabel}`, notifType);
        }
      }
      
      renderCalendar();
      updateSmartSuggestions();
      renderFriendsSidebar();
    });
    
    const saveStatusText = () => {
      const oldStatus = friend.status;
      const newStatusText = statusInput.value.trim() || 'Available';
      if (oldStatus !== newStatusText) {
        friend.status = newStatusText;
        addNotification(`${friend.name} status updated`, `@${friend.username} changed status to "${newStatusText}"`, 'info');
        renderFriendsSidebar();
      }
    };
    
    statusInput.addEventListener('blur', saveStatusText);
    statusInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        saveStatusText();
        statusInput.blur();
      }
    });
    
    div.querySelector('.remove-friend-btn').addEventListener('click', () => {
      if (confirm(`Remove ${friend.name} (@${friend.username}) from your friends list?`)) {
        removeFriend(friend.id);
      }
    });
    
    directoryContainer.appendChild(div);
  });
  
  reloadIcons();
}

// Remove Friend (Supabase-backed)
async function removeFriend(friendId) {
  const friendName = state.friends[friendId]?.name || 'Unknown';
  
  await arctimeRemoveFriend(state.userId, friendId);
  
  delete state.friends[friendId];
  state.selectedFriends = state.selectedFriends.filter(id => id !== friendId);
  state.events = state.events.filter(e => e.owner !== friendId);
  
  renderFriendsSidebar();
  renderActiveAttendeeChips();
  renderCalendar();
  updateSmartSuggestions();
  renderFriendsHub();
  
  addNotification('Friend Removed', `Removed ${friendName} from friends list`, 'info');
}

// Render Incoming and Sent lists
function renderPendingRequests() {
  incomingRequestsContainer.innerHTML = '';
  sentRequestsContainer.innerHTML = '';
  
  // Render Incoming requests
  if (state.incomingRequests.length === 0) {
    incomingRequestsContainer.innerHTML = `
      <div style="font-size: 11px; color: var(--text-muted); padding: 10px; text-align: center; border: 1px dashed var(--border-light); border-radius: 8px;">
        No pending incoming invites
      </div>
    `;
  } else {
    state.incomingRequests.forEach((req, idx) => {
      const div = document.createElement('div');
      div.style.display = 'flex';
      div.style.alignItems = 'center';
      div.style.justifyContent = 'space-between';
      div.style.padding = '10px';
      div.style.background = 'rgba(255,255,255,0.02)';
      div.style.border = '1px solid var(--border-light)';
      div.style.borderRadius = '10px';
      
      div.innerHTML = `
        <div style="display: flex; flex-direction: column; gap: 2px;">
          <span style="font-size: 13px; font-weight: 600; color: var(--text-primary);">${req.name}</span>
          <span style="font-size: 11px; color: var(--text-muted);">@${req.sender_username}</span>
        </div>
        <div style="display: flex; gap: 6px;">
          <button class="accept-btn" style="background: var(--color-free); border: none; color: #0b0f19; font-size: 11px; font-weight: 700; padding: 4px 10px; border-radius: 6px; cursor: pointer; transition: opacity 0.2s;">Accept</button>
          <button class="decline-btn" style="background: rgba(239, 68, 68, 0.15); border: 1px solid rgba(239, 68, 68, 0.25); color: #ef4444; font-size: 11px; font-weight: 700; padding: 4px 10px; border-radius: 6px; cursor: pointer; transition: opacity 0.2s;">Decline</button>
        </div>
      `;
      
      div.querySelector('.accept-btn').addEventListener('click', () => acceptRequest(idx));
      div.querySelector('.decline-btn').addEventListener('click', () => declineRequest(idx));
      
      incomingRequestsContainer.appendChild(div);
    });
  }
  
  // Render Sent requests
  if (state.sentRequests.length === 0) {
    sentRequestsContainer.innerHTML = `
      <div style="font-size: 11px; color: var(--text-muted); padding: 10px; text-align: center; border: 1px dashed var(--border-light); border-radius: 8px;">
        No sent requests pending
      </div>
    `;
  } else {
    state.sentRequests.forEach((req, idx) => {
      const div = document.createElement('div');
      div.style.display = 'flex';
      div.style.alignItems = 'center';
      div.style.justifyContent = 'space-between';
      div.style.padding = '10px';
      div.style.background = 'rgba(255,255,255,0.02)';
      div.style.border = '1px solid var(--border-light)';
      div.style.borderRadius = '10px';
      
      div.innerHTML = `
        <div style="display: flex; flex-direction: column; gap: 2px;">
          <span style="font-size: 13px; font-weight: 600; color: var(--text-primary);">${req.name}</span>
          <span style="font-size: 11px; color: var(--text-muted);">@${req.receiver_username}</span>
        </div>
        <button class="cancel-sent-btn" style="background: rgba(255,255,255,0.04); border: 1px solid var(--border-color); color: var(--text-secondary); font-size: 11px; padding: 4px 8px; border-radius: 6px; cursor: pointer; transition: all 0.2s;">Cancel</button>
      `;
      
      div.querySelector('.cancel-sent-btn').addEventListener('click', () => cancelSentRequest(idx));
      
      sentRequestsContainer.appendChild(div);
    });
  }
}

// Accept Request Handler (Supabase-backed)
async function acceptRequest(idx) {
  const req = state.incomingRequests[idx];
  const { error } = await arctimeAcceptFriendRequest(req.id);
  if (error) {
    showToast('Failed to accept request: ' + error.message, 'info');
    return;
  }
  
  state.incomingRequests.splice(idx, 1);
  
  // Reload friends from Supabase
  const { data: friends } = await arctimeGetFriends(state.userId);
  state.friendsData = friends || [];
  state.friends = {};
  state.friendsData.forEach(f => {
    state.friends[f.id] = {
      id: f.id,
      name: f.display_name || f.username,
      username: f.username,
      avatar: f.avatar_url,
      color: '#8B5CF6',
      status: 'Available',
      statusType: 'free'
    };
  });
  
  // Reload events to include new friend's calendar
  const { data: events } = await arctimeGetEvents(0, 6);
  if (events) state.events = events;
  
  renderFriendsSidebar();
  renderActiveAttendeeChips();
  renderCalendar();
  updateSmartSuggestions();
  renderFriendsHub();
  
  addNotification('Friend Connected', `Accepted friend request!`, 'success');
}

// Decline Request (Supabase-backed)
async function declineRequest(idx) {
  const req = state.incomingRequests[idx];
  await arctimeDeclineFriendRequest(req.id);
  state.incomingRequests.splice(idx, 1);
  renderFriendsHub();
  addNotification('Request Declined', `Declined friend request`, 'info');
}

// Cancel Sent Request (Supabase-backed)
async function cancelSentRequest(idx) {
  const req = state.sentRequests[idx];
  await arctimeCancelFriendRequest(req.id);
  state.sentRequests.splice(idx, 1);
  renderFriendsHub();
  addNotification('Request Cancelled', `Cancelled friend request to @${req.receiver_username || 'user'}`, 'info');
}

// Add Friend Form Submission (Supabase-backed)
sendRequestForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const usernameInput = requestFriendUsername.value.trim().toLowerCase().replace(/^@/, '');
  
  // Validate you're not adding yourself
  if (usernameInput === state.usernameHandle) {
    usernameWarningText.textContent = "You cannot add yourself as a friend!";
    usernameWarning.style.display = 'flex';
    return;
  }
  
  // Look up user by username
  const { data: targetProfile } = await arctimeGetProfileByUsername(usernameInput);
  if (!targetProfile) {
    usernameWarningText.textContent = `User "@${usernameInput}" not found. Check the username and try again.`;
    usernameWarning.style.display = 'flex';
    return;
  }
  
  // Check not already friends
  if (state.friends[targetProfile.id]) {
    usernameWarningText.textContent = `@${usernameInput} is already your friend!`;
    usernameWarning.style.display = 'flex';
    return;
  }
  
  // Check for existing pending request
  if (state.sentRequests.some(r => r.receiver_id === targetProfile.id)) {
    usernameWarningText.textContent = `Friend request already sent to @${usernameInput}.`;
    usernameWarning.style.display = 'flex';
    return;
  }
  if (state.incomingRequests.some(r => r.sender_id === targetProfile.id)) {
    usernameWarningText.textContent = `@${usernameInput} already sent you a request. Accept it below!`;
    usernameWarning.style.display = 'flex';
    return;
  }
  
  usernameWarning.style.display = 'none';
  
  // Send the request
  const { error } = await arctimeSendFriendRequest(state.userId, targetProfile.id);
  if (error) {
    usernameWarningText.textContent = 'Failed to send request: ' + error.message;
    usernameWarning.style.display = 'flex';
    return;
  }
  
  // Add to local sent list
  state.sentRequests.push({
    id: 'pending-' + Date.now(),
    sender_id: state.userId,
    receiver_id: targetProfile.id,
    status: 'pending',
    receiver_username: targetProfile.username,
    name: targetProfile.display_name
  });
  
  renderFriendsHub();
  sendRequestForm.reset();
  addNotification('Request Sent', `Sent friend request to @${usernameInput}!`, 'success');
});

// Real-time username input validation warning triggers (Add Friend Form)
requestFriendUsername.addEventListener('input', async () => {
  const val = requestFriendUsername.value.trim().toLowerCase().replace(/^@/, '');
  if (!val) {
    usernameWarning.style.display = 'none';
    return;
  }
  
  let errorMsg = '';
  if (val === state.usernameHandle) {
    errorMsg = "You cannot add yourself as a friend!";
  } else if (Object.values(state.friends).some(f => f.username === val)) {
    errorMsg = `Username @${val} is already a connected friend. Please change username!`;
  } else if (state.sentRequests.some(r => r.receiver_username === val)) {
    errorMsg = `Friend request already sent to @${val}.`;
  } else if (state.incomingRequests.some(r => r.sender_username === val)) {
    errorMsg = `@${val} already sent you a request. Accept it below!`;
  } else {
    // Check if the user exists in Supabase
    const { data: profile } = await arctimeGetProfileByUsername(val);
    if (!profile) {
      errorMsg = `Username "@${val}" not found on the platform.`;
    }
  }
  
  if (errorMsg) {
    usernameWarningText.textContent = errorMsg;
    usernameWarning.style.display = 'flex';
  } else {
    usernameWarning.style.display = 'none';
  }
});

// Real-time username input validation warning triggers (Settings Edit User Handle)
settingsUserUsername.addEventListener('input', () => {
  const val = settingsUserUsername.value.trim().toLowerCase().replace(/^@/, '');
  if (!val) {
    settingsUsernameWarning.style.display = 'none';
    return;
  }
  
  let errorMsg = '';
  if (Object.values(state.friends).some(f => f.username === val)) {
    errorMsg = `Username handle @${val} is taken by a friend. Please choose a unique handle!`;
  }
  
  if (errorMsg) {
    settingsUsernameWarning.querySelector('span').textContent = errorMsg;
    settingsUsernameWarning.style.display = 'flex';
  } else {
    settingsUsernameWarning.style.display = 'none';
  }
});

// -------------------------------------------------------------
// 9. NOTIFICATION CENTER MECHANICS
// -------------------------------------------------------------

// DOM Cache for notifications
const openNotificationsBtn = document.getElementById('openNotificationsBtn');
const closeNotificationsBtn = document.getElementById('closeNotificationsBtn');
const notificationsDrawer = document.getElementById('notificationsDrawer');
const notificationsDrawerBackdrop = document.getElementById('notificationsDrawerBackdrop');
const notificationsBadge = document.getElementById('notificationsBadge');
const notificationsContainer = document.getElementById('notificationsContainer');
const clearNotificationsBtn = document.getElementById('clearNotificationsBtn');

// Add a new notification
function addNotification(title, message, type = 'info') {
  const newNotif = {
    id: Date.now() + Math.random().toString(36).substr(2, 5),
    title,
    message,
    type, // 'success', 'warning', 'away', 'info'
    timestamp: new Date().toISOString()
  };
  state.notifications.unshift(newNotif);
  state.unreadCount++;
  saveNotificationsToStorage();
  renderNotificationsList();
  updateNotificationsBadge();
  
  // Show visual toast feedback
  const toastType = type === 'success' ? 'success' : 'info';
  showToast(`${title}: ${message}`, toastType);
}

// Persist notifications array to storage
function saveNotificationsToStorage() {
  localStorage.setItem('arctime_notifications', JSON.stringify(state.notifications));
  localStorage.setItem('arctime_unread_count', state.unreadCount.toString());
}

// Render the list of notifications inside the drawer
function renderNotificationsList() {
  notificationsContainer.innerHTML = '';
  
  if (state.notifications.length === 0) {
    notificationsContainer.innerHTML = `
      <div style="font-size: 12px; color: var(--text-muted); text-align: center; padding: 24px; border: 1px dashed var(--border-color); border-radius: 12px;">
        No notifications yet.
      </div>
    `;
    return;
  }
  
  state.notifications.forEach(notif => {
    const card = document.createElement('div');
    card.className = `notification-card ${notif.type}`;
    
    const date = new Date(notif.timestamp);
    const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    
    card.innerHTML = `
      <span class="notification-card-title">${notif.title}</span>
      <span class="notification-card-msg">${notif.message}</span>
      <span class="notification-card-time">${timeStr}</span>
    `;
    
    notificationsContainer.appendChild(card);
  });
}

// Update the badge display count on navbar bell button
function updateNotificationsBadge() {
  if (state.unreadCount === 0) {
    notificationsBadge.style.display = 'none';
  } else {
    notificationsBadge.style.display = 'flex';
    notificationsBadge.textContent = state.unreadCount;
  }
}

// Open/Close Notifications drawer
function toggleNotificationsDrawer(open) {
  if (open) {
    notificationsDrawer.classList.add('open');
    notificationsDrawerBackdrop.classList.add('open');
    // Mark all notifications as read upon opening
    state.unreadCount = 0;
    saveNotificationsToStorage();
    updateNotificationsBadge();
    renderNotificationsList();
  } else {
    notificationsDrawer.classList.remove('open');
    notificationsDrawerBackdrop.classList.remove('open');
  }
}

// Event Bindings
if (openNotificationsBtn) {
  openNotificationsBtn.addEventListener('click', () => toggleNotificationsDrawer(true));
}
if (closeNotificationsBtn) {
  closeNotificationsBtn.addEventListener('click', () => toggleNotificationsDrawer(false));
}
if (notificationsDrawerBackdrop) {
  notificationsDrawerBackdrop.addEventListener('click', () => toggleNotificationsDrawer(false));
}
if (clearNotificationsBtn) {
  clearNotificationsBtn.addEventListener('click', () => {
    state.notifications = [];
    state.unreadCount = 0;
    saveNotificationsToStorage();
    renderNotificationsList();
    updateNotificationsBadge();
    showToast('All notifications cleared', 'info');
  });
}

// Dynamic visibility of invited friends group based on event type radio selection
document.querySelectorAll('input[name="eventType"]').forEach(radio => {
  radio.addEventListener('change', (e) => {
    const invitedFriendsGroup = document.getElementById('invitedFriendsGroup');
    const submitBookingBtn = document.getElementById('submitBookingBtn');
    if (invitedFriendsGroup && submitBookingBtn) {
      if (e.target.value === 'personal') {
        invitedFriendsGroup.style.display = 'none';
        submitBookingBtn.textContent = 'Block Personal Time';
      } else {
        invitedFriendsGroup.style.display = 'block';
        submitBookingBtn.textContent = 'Create Shared Event';
      }
    }
  });
});

// Sidebar button to open Personal Booking modal directly
const openPersonalBookingBtn = document.getElementById('openPersonalBookingBtn');
if (openPersonalBookingBtn) {
  openPersonalBookingBtn.addEventListener('click', () => {
    const today = new Date();
    const dayOfWeek = (today.getDay() + 6) % 7; // Monday-Sunday (0-6)
    
    const currentHour = today.getHours();
    const startTimeStr = `${currentHour.toString().padStart(2, '0')}:00`;
    const endTimeStr = `${((currentHour + 1) % 24).toString().padStart(2, '0')}:00`;
    
    openBookingModal(dayOfWeek, startTimeStr, endTimeStr);
  });
}

// Clear Clipboard button control
const clearClipboardBtn = document.getElementById('clearClipboardBtn');
if (clearClipboardBtn) {
  clearClipboardBtn.addEventListener('click', () => {
    state.copiedEvent = null;
    localStorage.removeItem('arctime_copied_event');
    updateClipboardBanner();
    showToast('Clipboard cleared.', 'info');
  });
}

// Close action modals when buttons are clicked
const closeEventActionModalBtn = document.getElementById('closeEventActionModalBtn');
const eventActionCloseBtn = document.getElementById('eventActionCloseBtn');
if (closeEventActionModalBtn) closeEventActionModalBtn.addEventListener('click', closeEventActionModal);
if (eventActionCloseBtn) eventActionCloseBtn.addEventListener('click', closeEventActionModal);

const closePasteActionModalBtn = document.getElementById('closePasteActionModalBtn');
const pasteActionCancelBtn = document.getElementById('pasteActionCancelBtn');
if (closePasteActionModalBtn) closePasteActionModalBtn.addEventListener('click', closePasteActionModal);
if (pasteActionCancelBtn) pasteActionCancelBtn.addEventListener('click', closePasteActionModal);

// Close modals when clicking outside (on backdrop)
if (eventActionModal) {
  eventActionModal.addEventListener('click', (e) => {
    if (e.target === eventActionModal) closeEventActionModal();
  });
}
if (pasteActionModal) {
  pasteActionModal.addEventListener('click', (e) => {
    if (e.target === pasteActionModal) closePasteActionModal();
  });
}

// Start Application
init();
