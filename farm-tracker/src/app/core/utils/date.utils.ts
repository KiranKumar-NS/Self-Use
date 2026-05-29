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
