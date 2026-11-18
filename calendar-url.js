function mondayOfWeek(date) {
  const monday = new Date(date);
  monday.setHours(0, 0, 0, 0);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  return monday;
}

export function readCalendarState(search, currentDate = new Date()) {
  const params = new URLSearchParams(search);
  const dateParam = params.get('date');
  let date = new Date(currentDate);

  if (dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
    const [year, month, day] = dateParam.split('-').map(Number);
    const parsedDate = new Date(0);
    parsedDate.setFullYear(year, month - 1, day);
    parsedDate.setHours(0, 0, 0, 0);

    if (
      parsedDate.getFullYear() === year &&
      parsedDate.getMonth() === month - 1 &&
      parsedDate.getDate() === day
    ) {
      date = parsedDate;
    }
  }

  return {
    currentWeekStart: mondayOfWeek(date),
    activeView: params.get('view') === 'month' ? 'month' : 'week'
  };
}

export function createCalendarUrl(href, currentWeekStart, activeView) {
  const url = new URL(href);
  const year = currentWeekStart.getFullYear().toString().padStart(4, '0');
  const month = (currentWeekStart.getMonth() + 1).toString().padStart(2, '0');
  const day = currentWeekStart.getDate().toString().padStart(2, '0');

  url.searchParams.set('date', `${year}-${month}-${day}`);
  url.searchParams.set('view', activeView);
  return url;
}
