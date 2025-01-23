import {
  Button,
  CalendarCell,
  CalendarGrid,
  DateValue,
  Heading,
  RangeCalendar as AriaRangeCalendar,
  RangeCalendarProps as AriaRangeCalendarProps,
  Text,
} from "react-aria-components";

export interface RangeCalendarProps<T extends DateValue>
  extends AriaRangeCalendarProps<T> {
  errorMessage?: string;
}

export function RangeCalendar<T extends DateValue>({
  errorMessage,
  ...props
}: RangeCalendarProps<T>) {
  return (
    <span className="react-aria">
      <AriaRangeCalendar {...props}>
        <header>
          <Button slot="previous">◀</Button>
          <Heading />
          <Button slot="next">▶</Button>
        </header>
        <CalendarGrid>{(date) => <CalendarCell date={date} />}</CalendarGrid>
        {errorMessage && <Text slot="errorMessage">{errorMessage}</Text>}
      </AriaRangeCalendar>
    </span>
  );
}
