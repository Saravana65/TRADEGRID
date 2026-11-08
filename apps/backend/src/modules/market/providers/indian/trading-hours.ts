/**
 * Indian Stock Market (NSE / BSE) Trading Hours & Session Manager
 *
 * Implements authoritative session detection according to Indian Standard Time (IST, UTC+05:30).
 * Handles regular trading, pre-open, post-close, weekends, and official exchange holidays.
 */

export type IndianMarketSession =
  | 'PRE_OPEN'
  | 'PRE_OPEN_MATCHING'
  | 'PRE_OPEN_BUFFER'
  | 'REGULAR'
  | 'POST_CLOSE'
  | 'CLOSED';

export interface ISTTimeInfo {
  year: number;
  month: number; // 1-12
  date: number; // 1-31
  hours: number; // 0-23
  minutes: number; // 0-59
  seconds: number; // 0-59
  dayOfWeek: number; // 0 (Sun) - 6 (Sat)
  formattedIST: string;
}

// Major NSE/BSE Exchange Holidays (Formatted as 'YYYY-MM-DD' or 'MM-DD' for recurring)
export const RECURRING_EXCHANGE_HOLIDAYS = [
  '01-26', // Republic Day
  '04-14', // Dr. Ambedkar Jayanti
  '05-01', // Maharashtra Day
  '08-15', // Independence Day
  '10-02', // Mahatma Gandhi Jayanti
  '12-25', // Christmas
];

// Specific known sample holiday dates for testing and production calendar
export const KNOWN_EXCHANGE_HOLIDAYS_SET = new Set<string>([
  '2026-01-26', // Republic Day
  '2026-03-25', // Holi
  '2026-04-03', // Good Friday
  '2026-04-14', // Ambedkar Jayanti
  '2026-05-01', // Maharashtra Day
  '2026-08-15', // Independence Day
  '2026-10-02', // Gandhi Jayanti
  '2026-11-08', // Diwali Balipratipada
  '2026-12-25', // Christmas
]);

export class IndianTradingHoursService {
  /**
   * Converts any UTC or local Date into an Indian Standard Time (IST) structure.
   */
  static toIST(date: Date = new Date()): ISTTimeInfo {
    // IST is UTC + 5h 30m = 330 minutes
    const utcMillis = date.getTime() + date.getTimezoneOffset() * 60000;
    const istMillis = utcMillis + 330 * 60000;
    const istDate = new Date(istMillis);

    const year = istDate.getFullYear();
    const month = istDate.getMonth() + 1;
    const dayOfMonth = istDate.getDate();
    const hours = istDate.getHours();
    const minutes = istDate.getMinutes();
    const seconds = istDate.getSeconds();
    const dayOfWeek = istDate.getDay();

    const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
    const formattedIST = `${year}-${pad(month)}-${pad(dayOfMonth)} ${pad(hours)}:${pad(minutes)}:${pad(seconds)} IST`;

    return {
      year,
      month,
      date: dayOfMonth,
      hours,
      minutes,
      seconds,
      dayOfWeek,
      formattedIST,
    };
  }

  /**
   * Checks if a given calendar date is an official Indian exchange holiday.
   */
  static isHoliday(date: Date = new Date()): boolean {
    const ist = this.toIST(date);
    const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
    const fullDateKey = `${ist.year}-${pad(ist.month)}-${pad(ist.date)}`;
    const recurringKey = `${pad(ist.month)}-${pad(ist.date)}`;

    if (RECURRING_EXCHANGE_HOLIDAYS.includes(recurringKey)) {
      return true;
    }
    return KNOWN_EXCHANGE_HOLIDAYS_SET.has(fullDateKey);
  }

  /**
   * Checks if the date is a valid trading day (Monday through Friday, excluding holidays).
   */
  static isTradingDay(date: Date = new Date()): boolean {
    const ist = this.toIST(date);
    // Sunday = 0, Saturday = 6
    if (ist.dayOfWeek === 0 || ist.dayOfWeek === 6) {
      return false;
    }
    return !this.isHoliday(date);
  }

  /**
   * Identifies the precise active market session according to Indian Standard Time.
   */
  static getSession(date: Date = new Date()): IndianMarketSession {
    if (!this.isTradingDay(date)) {
      return 'CLOSED';
    }

    const ist = this.toIST(date);
    const minuteOfDay = ist.hours * 60 + ist.minutes;

    // 09:00 - 09:08 IST -> PRE_OPEN (540 to 548)
    if (minuteOfDay >= 540 && minuteOfDay < 548) {
      return 'PRE_OPEN';
    }

    // 09:08 - 09:12 IST -> PRE_OPEN_MATCHING (548 to 552)
    if (minuteOfDay >= 548 && minuteOfDay < 552) {
      return 'PRE_OPEN_MATCHING';
    }

    // 09:12 - 09:15 IST -> PRE_OPEN_BUFFER (552 to 555)
    if (minuteOfDay >= 552 && minuteOfDay < 555) {
      return 'PRE_OPEN_BUFFER';
    }

    // 09:15 - 15:30 IST -> REGULAR (555 to 930)
    if (minuteOfDay >= 555 && minuteOfDay < 930) {
      return 'REGULAR';
    }

    // 15:40 - 16:00 IST -> POST_CLOSE (940 to 960)
    if (minuteOfDay >= 940 && minuteOfDay < 960) {
      return 'POST_CLOSE';
    }

    return 'CLOSED';
  }

  /**
   * Determines whether continuous regular trading is currently active.
   */
  static isMarketOpen(date: Date = new Date()): boolean {
    return this.getSession(date) === 'REGULAR';
  }

  /**
   * Calculates the next upcoming market open time in UTC Date.
   */
  static getNextMarketOpen(date: Date = new Date()): Date {
    let checkDate = new Date(date.getTime());
    let ist = this.toIST(checkDate);

    // If currently during or before regular session today, check if before 09:15
    const minuteOfDay = ist.hours * 60 + ist.minutes;
    if (this.isTradingDay(checkDate) && minuteOfDay < 555) {
      // Market opens today at 09:15 IST
      const targetUtcMillis =
        Date.UTC(ist.year, ist.month - 1, ist.date, 3, 45, 0); // 09:15 IST = 03:45 UTC
      return new Date(targetUtcMillis);
    }

    // Advance day by day until next valid trading day
    while (true) {
      checkDate = new Date(checkDate.getTime() + 24 * 60 * 60 * 1000);
      if (this.isTradingDay(checkDate)) {
        ist = this.toIST(checkDate);
        const targetUtcMillis =
          Date.UTC(ist.year, ist.month - 1, ist.date, 3, 45, 0); // 09:15 IST = 03:45 UTC
        return new Date(targetUtcMillis);
      }
    }
  }
}
