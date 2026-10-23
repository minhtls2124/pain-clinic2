import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  canTransition,
  generateSlots,
  isWithinShifts,
  mergeIntervals,
  nearestSlots,
  overlaps,
  type Interval,
} from './scheduling.js';

const at = (hhmm: string, day = '2026-11-02') => new Date(`${day}T${hhmm}:00+07:00`);
const iv = (a: string, b: string): Interval => ({ start: at(a), end: at(b) });
const hhmm = (d: Date) =>
  new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Ho_Chi_Minh' }).format(d);

describe('overlaps — khoảng nửa mở [start, end)', () => {
  it('chồng nhau một phần → trùng', () => assert.equal(overlaps(iv('09:00', '09:45'), iv('09:30', '10:00')), true));
  it('nối tiếp nhau (09:45 kết thúc, 09:45 bắt đầu) → KHÔNG trùng', () =>
    assert.equal(overlaps(iv('09:00', '09:45'), iv('09:45', '10:00')), false));
  it('bao trọn → trùng', () => assert.equal(overlaps(iv('08:00', '12:00'), iv('09:00', '09:15')), true));
});

describe('mergeIntervals / isWithinShifts', () => {
  it('gộp hai ca liền nhau thành một', () => {
    const merged = mergeIntervals([iv('13:30', '17:00'), iv('07:30', '11:30'), iv('11:30', '13:30')]);
    assert.equal(merged.length, 1);
    assert.equal(hhmm(merged[0]!.start), '07:30');
    assert.equal(hhmm(merged[0]!.end), '17:00');
  });
  it('lịch vắt qua hai ca liền kề vẫn hợp lệ', () =>
    assert.equal(isWithinShifts(iv('11:15', '11:45'), [iv('07:30', '11:30'), iv('11:30', '17:00')]), true));
  it('lịch vắt qua giờ nghỉ trưa (ca không liền) → không hợp lệ', () =>
    assert.equal(isWithinShifts(iv('11:15', '11:45'), [iv('07:30', '11:30'), iv('13:30', '17:00')]), false));
});

describe('generateSlots', () => {
  const base = {
    shifts: [iv('08:00', '10:00')],
    durationMin: 30,
    bufferAfterMin: 0,
    stepMin: 15,
    notBefore: at('00:00'),
  };

  it('ca trống → slot mỗi 15 phút, slot cuối kết thúc đúng giờ hết ca', () => {
    const slots = generateSlots({ ...base, busy: [] });
    assert.deepEqual(
      slots.map((s) => hhmm(s.startAt)),
      ['08:00', '08:15', '08:30', '08:45', '09:00', '09:15', '09:30'],
    );
  });

  it('bỏ các slot đè lên lịch đã có', () => {
    const slots = generateSlots({ ...base, busy: [iv('08:30', '09:00')] });
    assert.deepEqual(slots.map((s) => hhmm(s.startAt)), ['08:00', '09:00', '09:15', '09:30']);
  });

  it('tính cả thời gian đệm sau thủ thuật', () => {
    // Thủ thuật 30' + 15' đệm: slot 08:15 sẽ chiếm tới 09:00 → đè lịch 08:50
    const slots = generateSlots({ ...base, bufferAfterMin: 15, busy: [iv('08:50', '09:10')] });
    assert.ok(!slots.some((s) => hhmm(s.startAt) === '08:15'));
    assert.ok(slots.some((s) => hhmm(s.startAt) === '09:15'));
  });

  it('phòng thủ thuật: còn ít nhất một phòng trống là được', () => {
    const roomA = [iv('08:00', '09:00')];
    const roomB = [iv('08:30', '09:30')];
    const slots = generateSlots({ ...base, busy: [], anyOfFree: [roomA, roomB] });
    // 08:00–08:30: A bận, B trống → OK; 08:30–09:00: cả hai bận → loại; 09:00: A trống → OK
    assert.deepEqual(slots.map((s) => hhmm(s.startAt)), ['08:00', '09:00', '09:15', '09:30']);
  });

  it('tôn trọng lead time (notBefore)', () => {
    const slots = generateSlots({ ...base, busy: [], notBefore: at('09:01') });
    assert.deepEqual(slots.map((s) => hhmm(s.startAt)), ['09:15', '09:30']);
  });
});

describe('nearestSlots', () => {
  it('trả về các slot gần giờ mong muốn nhất, sắp theo thời gian', () => {
    const slots = generateSlots({
      shifts: [iv('08:00', '12:00')],
      busy: [iv('09:00', '10:00')],
      durationMin: 30,
      bufferAfterMin: 0,
      stepMin: 30,
      notBefore: at('00:00'),
    });
    assert.deepEqual(nearestSlots(slots, at('09:20')).map((s) => hhmm(s.startAt)), ['08:30', '10:00', '10:30']);
  });
});

describe('máy trạng thái lịch hẹn', () => {
  it('CONFIRMED → CHECKED_IN hợp lệ', () => assert.equal(canTransition('CONFIRMED', 'CHECKED_IN'), true));
  it('COMPLETED là trạng thái cuối', () => assert.equal(canTransition('COMPLETED', 'CANCELLED'), false));
  it('không thể check-in lịch đã huỷ', () => assert.equal(canTransition('CANCELLED', 'CHECKED_IN'), false));
});
