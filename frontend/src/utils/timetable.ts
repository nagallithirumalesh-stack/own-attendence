export interface Period {
  period: number;
  timeStr: string;
  startMinutes: number; // minutes from midnight
  endMinutes: number;
}

export const PERIODS: Period[] = [
  { period: 0, timeStr: '08:40 AM – 09:30 AM', startMinutes: 520, endMinutes: 570 },
  { period: 1, timeStr: '09:30 AM – 10:20 AM', startMinutes: 570, endMinutes: 620 },
  { period: 2, timeStr: '10:20 AM – 11:10 AM', startMinutes: 620, endMinutes: 670 },
  { period: 3, timeStr: '11:10 AM – 12:00 PM', startMinutes: 670, endMinutes: 720 },
  // Lunch is at 12:00 PM - 12:50 PM (720 - 770 minutes)
  { period: 4, timeStr: '12:50 PM – 01:50 PM', startMinutes: 770, endMinutes: 830 },
  { period: 5, timeStr: '01:50 PM – 02:40 PM', startMinutes: 830, endMinutes: 880 },
  { period: 6, timeStr: '02:40 PM – 03:30 PM', startMinutes: 880, endMinutes: 930 },
];

export interface SubjectDetail {
  code: string;
  name: string;
  shortName: string;
  type: 'Theory' | 'Lab' | 'Lab/Activity';
}

export const SUBJECTS: SubjectDetail[] = [
  { code: '23APC3003', name: 'Data Warehousing and Data Mining', shortName: 'DWDM', type: 'Theory' },
  { code: '23APC3005', name: 'Introduction to Machine Learning', shortName: 'IML', type: 'Theory' },
  { code: '23APC3007', name: 'Multi Agent Systems', shortName: 'MAS', type: 'Theory' },
  { code: '23APE3004', name: 'Exploratory Data Analysis with Python', shortName: 'EDAP', type: 'Theory' },
  { code: '23AES0504', name: 'Introduction to Quantum Technologies and Applications', shortName: 'QTA', type: 'Theory' },
  { code: '23AOE9915', name: 'English for Competitive Examinations (MOOCs)', shortName: 'BEC', type: 'Theory' },
  { code: '23APC3004', name: 'Data Warehousing and Data Mining Lab', shortName: 'DWDM LAB', type: 'Lab' },
  { code: '23APC3006', name: 'Machine Learning Lab', shortName: 'ML LAB', type: 'Lab' },
  { code: '23ASE9901', name: 'Soft Skills', shortName: 'SS LAB', type: 'Lab/Activity' },
  { code: '23AES0404', name: 'Tinkering Lab', shortName: 'TL LAB', type: 'Lab' },
];

// Helper to map timetable subject display name to standard base subject name and code
export function getSubjectMeta(displayName: string): { baseSubject: string; code: string; type: string } {
  const cleanName = displayName.replace(' (CLC)', '').trim();
  const subject = SUBJECTS.find((s) => s.shortName === cleanName);
  return {
    baseSubject: cleanName,
    code: subject ? subject.code : 'UNKNOWN',
    type: subject ? subject.type : 'Theory',
  };
}

export const TIMETABLE: Record<string, string[]> = {
  Monday: ['BEC', 'IML', 'IML', 'MAS', 'EDAP', 'QTA', 'QTA'],
  Tuesday: ['MAS', 'DWDM LAB', 'DWDM LAB', 'DWDM LAB', 'EDAP', 'QTA', 'QTA'],
  Wednesday: ['DWDM', 'IML', 'DWDM', 'MAS (CLC)', 'SS LAB', 'SS LAB', 'SS LAB'],
  Thursday: ['IML', 'DWDM', 'IML (CLC)', 'MAS', 'TL LAB', 'TL LAB', 'TL LAB'],
  Friday: ['QTA', 'EDAP', 'DWDM', 'QTA (CLC)', 'MAS', 'EDAP (CLC)', 'MAS'],
  Saturday: ['EDAP', 'ML LAB', 'ML LAB', 'ML LAB', 'MAS', 'EDAP (CLC)', 'MAS'],
  Sunday: [],
};

// Convert "09:30 AM" or similar system time representation to minutes from midnight
export function getMinutesFromTime(time: Date): number {
  return time.getHours() * 60 + time.getMinutes();
}

export interface CurrentPeriodStatus {
  state: 'BEFORE' | 'DURING' | 'LUNCH' | 'AFTER' | 'WEEKEND' | 'HOLIDAY';
  current?: {
    period: number;
    subject: string;
    timeStr: string;
    code: string;
    baseSubject: string;
  };
  next?: {
    period: number;
    subject: string;
    timeStr: string;
    code: string;
    baseSubject: string;
  };
  message?: string;
}

export function getCurrentPeriodInfo(
  now: Date,
  dayOfWeek: string,
  isCustomHoliday: boolean
): CurrentPeriodStatus {
  if (dayOfWeek === 'Sunday') {
    return { state: 'WEEKEND', message: 'Today is Sunday — Holiday' };
  }
  if (isCustomHoliday) {
    return { state: 'HOLIDAY', message: 'Today is a Holiday' };
  }

  const currentMinutes = getMinutesFromTime(now);
  const todaysSchedule = TIMETABLE[dayOfWeek];

  if (!todaysSchedule || todaysSchedule.length === 0) {
    return { state: 'WEEKEND', message: 'No classes scheduled today' };
  }

  // Check if before classes start
  if (currentMinutes < PERIODS[0].startMinutes) {
    const firstSubject = todaysSchedule[0];
    const meta = getSubjectMeta(firstSubject);
    return {
      state: 'BEFORE',
      message: 'Today\'s classes start at 08:40 AM',
      next: {
        period: 0,
        subject: firstSubject,
        timeStr: PERIODS[0].timeStr,
        code: meta.code,
        baseSubject: meta.baseSubject,
      },
    };
  }

  // Check if after classes end
  if (currentMinutes >= PERIODS[PERIODS.length - 1].endMinutes) {
    return { state: 'AFTER', message: "Today's classes completed." };
  }

  // Check if during lunch (12:00 PM - 12:50 PM, i.e., 720 to 770 minutes)
  if (currentMinutes >= 720 && currentMinutes < 770) {
    // Find next class (Period 4)
    const nextSubject = todaysSchedule[4];
    const meta = getSubjectMeta(nextSubject);
    return {
      state: 'LUNCH',
      message: 'Lunch Break (12:00 PM – 12:50 PM)',
      next: {
        period: 4,
        subject: nextSubject,
        timeStr: PERIODS[4].timeStr,
        code: meta.code,
        baseSubject: meta.baseSubject,
      },
    };
  }

  // Check which active period it is
  let currentPeriodIdx = -1;
  for (let i = 0; i < PERIODS.length; i++) {
    const p = PERIODS[i];
    if (currentMinutes >= p.startMinutes && currentMinutes < p.endMinutes) {
      currentPeriodIdx = i;
      break;
    }
  }

  if (currentPeriodIdx !== -1) {
    const curSubject = todaysSchedule[currentPeriodIdx];
    const curMeta = getSubjectMeta(curSubject);
    
    // Find next period
    let nextPeriodIdx = currentPeriodIdx + 1;
    let nextPeriodObj = null;

    if (nextPeriodIdx < PERIODS.length) {
      const nextSubject = todaysSchedule[nextPeriodIdx];
      const nextMeta = getSubjectMeta(nextSubject);
      nextPeriodObj = {
        period: nextPeriodIdx,
        subject: nextSubject,
        timeStr: PERIODS[nextPeriodIdx].timeStr,
        code: nextMeta.code,
        baseSubject: nextMeta.baseSubject,
      };
    }

    return {
      state: 'DURING',
      current: {
        period: currentPeriodIdx,
        subject: curSubject,
        timeStr: PERIODS[currentPeriodIdx].timeStr,
        code: curMeta.code,
        baseSubject: curMeta.baseSubject,
      },
      next: nextPeriodObj || undefined,
    };
  }

  // If in between periods (e.g. 10-minute break between periods)
  // Let's find what is coming next
  for (let i = 0; i < PERIODS.length - 1; i++) {
    const p1 = PERIODS[i];
    const p2 = PERIODS[i + 1];
    if (currentMinutes >= p1.endMinutes && currentMinutes < p2.startMinutes) {
      const nextSubject = todaysSchedule[i + 1];
      const nextMeta = getSubjectMeta(nextSubject);
      return {
        state: 'BEFORE',
        message: 'Class Break',
        next: {
          period: i + 1,
          subject: nextSubject,
          timeStr: p2.timeStr,
          code: nextMeta.code,
          baseSubject: nextMeta.baseSubject,
        },
      };
    }
  }

  return { state: 'AFTER', message: "Today's classes completed." };
}
