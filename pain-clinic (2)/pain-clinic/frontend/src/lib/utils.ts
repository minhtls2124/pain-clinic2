import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));

export const CLINIC_TZ = 'Asia/Ho_Chi_Minh';

const fmt = (opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('vi-VN', { timeZone: CLINIC_TZ, ...opts });
const timeFmt = fmt({ hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const shortDateFmt = fmt({ day: '2-digit', month: '2-digit' });
const fullDateFmt = fmt({ weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' });
const ymdFmt = new Intl.DateTimeFormat('en-CA', { timeZone: CLINIC_TZ, year: 'numeric', month: '2-digit', day: '2-digit' });

export const formatTime = (d: Date | string) => timeFmt.format(new Date(d));
export const formatShortDate = (d: Date | string) => shortDateFmt.format(new Date(d)).replace(/[-.]/g, '/'); // dd/MM
export const formatFullDate = (d: Date | string) => fullDateFmt.format(new Date(d));
/** YYYY-MM-DD theo giờ phòng khám */
export const toClinicYmd = (d: Date | string) => ymdFmt.format(new Date(d));
const hourFmt = new Intl.DateTimeFormat('en-GB', { timeZone: CLINIC_TZ, hour: '2-digit', hourCycle: 'h23' });
/** Giờ (0–23) theo giờ phòng khám. Dùng en-GB vì vi-VN trả về dạng "23 giờ". */
export const clinicHour = (d: Date | string) => Number(hourFmt.format(new Date(d)));

export const formatVnd = (n: number) =>
  new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(n);
