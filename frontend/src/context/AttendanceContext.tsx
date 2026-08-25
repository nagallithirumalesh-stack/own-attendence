import React, { createContext, useState, useEffect, useContext } from 'react';
import { useAuth } from './AuthContext';
import { db } from '../utils/firebase';
import { 
  collection, doc, getDocs, setDoc, deleteDoc, writeBatch, query, where 
} from 'firebase/firestore';

export interface AttendanceRecord {
  id: string;
  user_id: string;
  date: string;
  day: string;
  subject: string;
  subject_code: string;
  period_number: number;
  start_time: string;
  end_time: string;
  status: 'PRESENT' | 'ABSENT' | 'NOT_MARKED' | 'HOLIDAY';
  updated_at: string;
}

export interface Holiday {
  date: string;
  reason: string;
}

export interface OverallStats {
  present: number;
  absent: number;
  conducted: number;
  percentage: number;
}

export interface SubjectStats {
  present: number;
  absent: number;
  code: string;
}

export interface MonthlyStats {
  present: number;
  absent: number;
}

interface AttendanceContextType {
  logs: AttendanceRecord[];
  holidays: Holiday[];
  stats: {
    overall: OverallStats;
    subjects: Record<string, SubjectStats>;
    monthly: Record<string, MonthlyStats>;
  } | null;
  loading: boolean;
  actionLoading: boolean;
  error: string | null;
  fetchStats: () => Promise<void>;
  fetchLogs: (filters?: { date?: string; subject?: string; status?: string }) => Promise<void>;
  fetchHolidays: () => Promise<void>;
  markAttendance: (params: {
    date: string;
    day: string;
    subject: string;
    subject_code: string;
    period_number: number;
    start_time: string;
    end_time: string;
    status: 'PRESENT' | 'ABSENT' | 'NOT_MARKED';
  }) => Promise<boolean>;
  markHoliday: (date: string, reason: string) => Promise<boolean>;
  removeHoliday: (date: string) => Promise<boolean>;
  resetDatabase: () => Promise<boolean>;
  clearError: () => void;
}

const AttendanceContext = createContext<AttendanceContextType | undefined>(undefined);

export const AttendanceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [logs, setLogs] = useState<AttendanceRecord[]>([]);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [stats, setStats] = useState<AttendanceContextType['stats']>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [actionLoading, setActionLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Compute stats in memory from logs and holidays
  const computeStats = (currentLogs: AttendanceRecord[], currentHolidays: Holiday[]) => {
    const holidayDates = new Set(currentHolidays.map(h => h.date));
    
    let totalPresent = 0;
    let totalAbsent = 0;
    const subjectStats: Record<string, SubjectStats> = {};
    const monthlyStats: Record<string, MonthlyStats> = {};

    currentLogs.forEach(log => {
      // Exclude holiday records
      if (log.status === 'HOLIDAY' || holidayDates.has(log.date)) {
        return;
      }

      if (log.status === 'PRESENT') {
        totalPresent++;
        if (!subjectStats[log.subject]) {
          subjectStats[log.subject] = { present: 0, absent: 0, code: log.subject_code };
        }
        subjectStats[log.subject].present++;

        const monthKey = log.date.substring(0, 7); // YYYY-MM
        if (!monthlyStats[monthKey]) {
          monthlyStats[monthKey] = { present: 0, absent: 0 };
        }
        monthlyStats[monthKey].present++;
      } 
      
      else if (log.status === 'ABSENT') {
        totalAbsent++;
        if (!subjectStats[log.subject]) {
          subjectStats[log.subject] = { present: 0, absent: 0, code: log.subject_code };
        }
        subjectStats[log.subject].absent++;

        const monthKey = log.date.substring(0, 7);
        if (!monthlyStats[monthKey]) {
          monthlyStats[monthKey] = { present: 0, absent: 0 };
        }
        monthlyStats[monthKey].absent++;
      }
    });

    const totalConducted = totalPresent + totalAbsent;
    const overallPercentage = totalConducted > 0 
      ? Math.round((totalPresent / totalConducted) * 10000) / 100 
      : 0.00;

    setStats({
      overall: {
        present: totalPresent,
        absent: totalAbsent,
        conducted: totalConducted,
        percentage: overallPercentage
      },
      subjects: subjectStats,
      monthly: monthlyStats
    });
  };

  const fetchLogsInternal = async (): Promise<AttendanceRecord[]> => {
    if (!user) return [];
    const q = query(collection(db, 'attendance'), where('userId', '==', user.id));
    const querySnapshot = await getDocs(q);
    const fetchedLogs: AttendanceRecord[] = [];
    
    querySnapshot.forEach((docSnap) => {
      const data = docSnap.data();
      fetchedLogs.push({
        id: docSnap.id,
        user_id: user.id,
        date: data.date,
        day: data.day,
        subject: data.subject,
        subject_code: data.subjectCode,
        period_number: data.periodNumber,
        start_time: data.startTime,
        end_time: data.endTime,
        status: data.status,
        updated_at: data.timestamp ? data.timestamp.toDate().toISOString() : ''
      });
    });

    // Sort: Date Desc, Period Number Asc
    fetchedLogs.sort((a, b) => {
      if (a.date !== b.date) {
        return b.date.localeCompare(a.date);
      }
      return a.period_number - b.period_number;
    });

    return fetchedLogs;
  };

  const fetchHolidaysInternal = async (): Promise<Holiday[]> => {
    if (!user) return [];
    const q = query(collection(db, 'holidays'), where('userId', '==', user.id));
    const querySnapshot = await getDocs(q);
    const fetchedHolidays: Holiday[] = [];
    
    querySnapshot.forEach((docSnap) => {
      const data = docSnap.data();
      fetchedHolidays.push({
        date: data.date,
        reason: data.reason || 'Holiday'
      });
    });

    fetchedHolidays.sort((a, b) => b.date.localeCompare(a.date));
    return fetchedHolidays;
  };

  const fetchStats = async () => {
    computeStats(logs, holidays);
  };

  const fetchLogs = async () => {
    if (!user) return;
    try {
      const fetchedLogs = await fetchLogsInternal();
      setLogs(fetchedLogs);
      if (stats) {
        computeStats(fetchedLogs, holidays);
      }
    } catch (err) {
      console.error('Error fetching logs:', err);
    }
  };

  const fetchHolidays = async () => {
    if (!user) return;
    try {
      const fetchedHolidays = await fetchHolidaysInternal();
      setHolidays(fetchedHolidays);
      if (stats) {
        computeStats(logs, fetchedHolidays);
      }
    } catch (err) {
      console.error('Error fetching holidays:', err);
    }
  };

  // Sync state on user login
  useEffect(() => {
    if (user) {
      setLoading(true);
      Promise.all([fetchLogsInternal(), fetchHolidaysInternal()])
        .then(([fetchedLogs, fetchedHolidays]) => {
          setLogs(fetchedLogs);
          setHolidays(fetchedHolidays);
          computeStats(fetchedLogs, fetchedHolidays);
        })
        .catch(err => {
          console.error('Initial Firestore sync error:', err);
          setError('Failed to sync data with cloud database.');
        })
        .finally(() => setLoading(false));
    } else {
      setLogs([]);
      setHolidays([]);
      setStats(null);
    }
  }, [user]);

  const markAttendance = async (params: {
    date: string;
    day: string;
    subject: string;
    subject_code: string;
    period_number: number;
    start_time: string;
    end_time: string;
    status: 'PRESENT' | 'ABSENT' | 'NOT_MARKED';
  }): Promise<boolean> => {
    if (!user) return false;
    setActionLoading(true);
    setError(null);

    const docId = `${user.id}_${params.date}_${params.period_number}_${params.subject}`;
    const docRef = doc(db, 'attendance', docId);

    try {
      const isHolidayDate = holidays.some(h => h.date === params.date);
      const targetStatus = isHolidayDate ? 'HOLIDAY' : params.status;

      if (targetStatus === 'NOT_MARKED') {
        await deleteDoc(docRef);
      } else {
        await setDoc(docRef, {
          userId: user.id,
          date: params.date,
          day: params.day,
          subject: params.subject,
          subjectCode: params.subject_code,
          periodNumber: params.period_number,
          startTime: params.start_time,
          endTime: params.end_time,
          status: targetStatus,
          timestamp: new Date()
        });
      }

      // Refresh local logs and re-evaluate stats
      const updatedLogs = await fetchLogsInternal();
      setLogs(updatedLogs);
      computeStats(updatedLogs, holidays);
      
      setActionLoading(false);
      return true;
    } catch (err) {
      console.error('Error saving attendance in Firestore:', err);
      setError('Cloud sync failed. Attendance could not be saved.');
      setActionLoading(false);
      return false;
    }
  };

  const markHoliday = async (date: string, reason: string): Promise<boolean> => {
    if (!user) return false;
    setActionLoading(true);
    setError(null);

    const holidayDocRef = doc(db, 'holidays', `${user.id}_${date}`);

    try {
      // 1. Create/override holiday record
      await setDoc(holidayDocRef, {
        userId: user.id,
        date,
        reason: reason || 'Holiday'
      });

      // 2. Query and batch-update any existing attendance logs on this date to HOLIDAY status
      const q = query(collection(db, 'attendance'), where('userId', '==', user.id), where('date', '==', date));
      const querySnapshot = await getDocs(q);
      
      const batch = writeBatch(db);
      querySnapshot.forEach((docSnap) => {
        batch.update(docSnap.ref, { status: 'HOLIDAY' });
      });
      await batch.commit();

      // 3. Refresh lists and calculate stats
      const updatedHolidays = await fetchHolidaysInternal();
      const updatedLogs = await fetchLogsInternal();
      
      setHolidays(updatedHolidays);
      setLogs(updatedLogs);
      computeStats(updatedLogs, updatedHolidays);

      setActionLoading(false);
      return true;
    } catch (err) {
      console.error('Error declaring holiday in Firestore:', err);
      setError('Cloud sync failed. Holiday could not be saved.');
      setActionLoading(false);
      return false;
    }
  };

  const removeHoliday = async (date: string): Promise<boolean> => {
    if (!user) return false;
    setActionLoading(true);
    setError(null);

    const holidayDocRef = doc(db, 'holidays', `${user.id}_${date}`);

    try {
      // 1. Remove holiday record
      await deleteDoc(holidayDocRef);

      // 2. Remove all attendance logs on this date that are set to HOLIDAY (reverting them back to NOT_MARKED)
      const q = query(
        collection(db, 'attendance'), 
        where('userId', '==', user.id), 
        where('date', '==', date),
        where('status', '==', 'HOLIDAY')
      );
      const querySnapshot = await getDocs(q);

      const batch = writeBatch(db);
      querySnapshot.forEach((docSnap) => {
        batch.delete(docSnap.ref);
      });
      await batch.commit();

      // 3. Refresh local lists
      const updatedHolidays = await fetchHolidaysInternal();
      const updatedLogs = await fetchLogsInternal();
      
      setHolidays(updatedHolidays);
      setLogs(updatedLogs);
      computeStats(updatedLogs, updatedHolidays);

      setActionLoading(false);
      return true;
    } catch (err) {
      console.error('Error removing holiday in Firestore:', err);
      setError('Cloud sync failed. Holiday could not be removed.');
      setActionLoading(false);
      return false;
    }
  };

  const resetDatabase = async (): Promise<boolean> => {
    if (!user) return false;
    setActionLoading(true);
    setError(null);

    try {
      // 1. Query logs and holidays
      const logsQuery = query(collection(db, 'attendance'), where('userId', '==', user.id));
      const logsSnapshot = await getDocs(logsQuery);

      const holidaysQuery = query(collection(db, 'holidays'), where('userId', '==', user.id));
      const holidaysSnapshot = await getDocs(holidaysQuery);

      // 2. Batch-delete all records
      const batch = writeBatch(db);
      logsSnapshot.forEach((docSnap) => {
        batch.delete(docSnap.ref);
      });
      holidaysSnapshot.forEach((docSnap) => {
        batch.delete(docSnap.ref);
      });
      await batch.commit();

      // 3. Clear local states
      setLogs([]);
      setHolidays([]);
      setStats({
        overall: { present: 0, absent: 0, conducted: 0, percentage: 0 },
        subjects: {},
        monthly: {}
      });

      setActionLoading(false);
      return true;
    } catch (err) {
      console.error('Error resetting database in Firestore:', err);
      setError('Database reset failed. Try again.');
      setActionLoading(false);
      return false;
    }
  };

  const clearError = () => setError(null);

  return (
    <AttendanceContext.Provider value={{
      logs,
      holidays,
      stats,
      loading,
      actionLoading,
      error,
      fetchStats,
      fetchLogs,
      fetchHolidays,
      markAttendance,
      markHoliday,
      removeHoliday,
      resetDatabase,
      clearError
    }}>
      {children}
    </AttendanceContext.Provider>
  );
};

export const useAttendance = () => {
  const context = useContext(AttendanceContext);
  if (!context) {
    throw new Error('useAttendance must be used within an AttendanceProvider');
  }
  return context;
};
