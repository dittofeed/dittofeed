import { CalendarDate } from "@internationalized/date";

export function toCalendarDate(date: Date): CalendarDate {
  return new CalendarDate(
    date.getFullYear(),
    date.getMonth() + 1, // CalendarDate uses 1-based months
    date.getDate(),
  );
}
