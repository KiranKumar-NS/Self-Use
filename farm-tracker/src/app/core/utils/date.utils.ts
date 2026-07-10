export function getMonthString(date: Date): string {
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  return `${year}-${month}`;
}

export function getYear(date: Date): number {
  return date.getFullYear();
}

export function formatDate(date: Date): string {
  return date.toLocaleDateString('en-IN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function getMonthName(monthStr: string): string {
  // Only YYYY-MM parses safely; anything else would render "Invalid Date"
  // (this once produced a farm-backup-Invalid-Date.xlsx export)
  if (!/^\d{4}-\d{2}$/.test(monthStr)) return monthStr;
  const [year, month] = monthStr.split('-');
  const date = new Date(parseInt(year), parseInt(month) - 1);
  return date.toLocaleDateString('en-IN', { year: 'numeric', month: 'long' });
}

export function getLast6Months(): string[] {
  return getLast6MonthsFrom(getMonthString(new Date()));
}

export function getLast6MonthsFrom(baseMonth: string): string[] {
  const [year, month] = baseMonth.split('-').map(Number);
  const months: string[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(year, month - 1 - i, 1);
    months.push(getMonthString(d));
  }
  return months;
}

export function shiftMonth(monthStr: string, delta: number): string {
  const [year, month] = monthStr.split('-').map(Number);
  const d = new Date(year, month - 1 + delta, 1);
  return getMonthString(d);
}

export function getMonthRange(start: string, end: string): string[] {
  const [sy, sm] = start.split('-').map(Number);
  const [ey, em] = end.split('-').map(Number);
  const months: string[] = [];
  let y = sy, m = sm;
  while (y < ey || (y === ey && m <= em)) {
    months.push(`${y}-${m.toString().padStart(2, '0')}`);
    m++;
    if (m > 12) { m = 1; y++; }
  }
  return months;
}
