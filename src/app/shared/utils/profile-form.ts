export function apiDateToForm(value: string | null | undefined): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value ?? '');
  if (!match || !isValidCalendarDate(Number(match[1]), Number(match[2]), Number(match[3]))) {
    return '';
  }

  return `${match[3]}/${match[2]}/${match[1]}`;
}

export function formDateToApi(value: string): string | null {
  if (!value.trim()) {
    return null;
  }

  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
  if (!match) {
    return null;
  }

  const [, day, month, year] = match;
  if (!isValidCalendarDate(Number(year), Number(month), Number(day))) {
    return null;
  }

  return `${year}-${month}-${day}`;
}

export function isValidFormDate(value: string): boolean {
  return !value.trim() || formDateToApi(value) !== null;
}

function isValidCalendarDate(year: number, month: number, day: number): boolean {
  if (year < 1 || month < 1 || month > 12 || day < 1) {
    return false;
  }

  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysPerMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= daysPerMonth[month - 1];
}
