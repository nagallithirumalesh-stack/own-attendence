import React, { createContext, useState, useEffect, useContext } from 'react';
import { useAuth, API_BASE } from './AuthContext';

export interface AttendanceRecord {
  id: number;
  user_id: number;
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
  const { token } = useAuth();
  const [logs, setLogs] = useState<AttendanceRecord[]>([]);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [stats, setStats] = useState<AttendanceContextType['stats']>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [actionLoading, setActionLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = async () => {
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE}/attendance/stats`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }
    } catch (err) {
      console.error('Error fetching stats:', err);
    }
  };

  const fetchLogs = async (filters?: { date?: string; subject?: string; status?: string }) => {
    if (!token) return;
    try {
      let url = `${API_BASE}/attendance`;
      const queryParams: string[] = [];
      if (filters?.date) queryParams.push(`date=${filters.date}`);
      if (filters?.subject) queryParams.push(`subject=${filters.subject}`);
      if (filters?.status) queryParams.push(`status=${filters.status}`);

      if (queryParams.length > 0) {
        url += `?${queryParams.join('&')}`;
      }

      const res = await fetch(url, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setLogs(data);
      }
    } catch (err) {
      console.error('Error fetching logs:', err);
    }
  };

  const fetchHolidays = async () => {
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE}/holidays`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setHolidays(data);
      }
    } catch (err) {
      console.error('Error fetching holidays:', err);
    }
  };

  // Load initial data on login
  useEffect(() => {
    if (token) {
      setLoading(true);
      Promise.all([fetchStats(), fetchLogs(), fetchHolidays()])
        .finally(() => setLoading(false));
    } else {
      setLogs([]);
      setHolidays([]);
      setStats(null);
    }
  }, [token]);

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
    if (!token) return false;
    setActionLoading(true);
    setError(null);

    try {
      const res = await fetch(`${API_BASE}/attendance/mark`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(params)
      });

      if (res.ok) {
        // Refresh logs and stats instantly
        await Promise.all([fetchStats(), fetchLogs()]);
        setActionLoading(false);
        return true;
      } else {
        const data = await res.json();
        setError(data.error || 'Failed to mark attendance.');
        setActionLoading(false);
        return false;
      }
    } catch (err) {
      setError('Network error. Failed to save attendance.');
      setActionLoading(false);
      return false;
    }
  };

  const markHoliday = async (date: string, reason: string): Promise<boolean> => {
    if (!token) return false;
    setActionLoading(true);
    setError(null);

    try {
      const res = await fetch(`${API_BASE}/holidays`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ date, reason })
      });

      if (res.ok) {
        await Promise.all([fetchHolidays(), fetchStats(), fetchLogs()]);
        setActionLoading(false);
        return true;
      } else {
        const data = await res.json();
        setError(data.error || 'Failed to mark holiday.');
        setActionLoading(false);
        return false;
      }
    } catch (err) {
      setError('Network error. Failed to declare holiday.');
      setActionLoading(false);
      return false;
    }
  };

  const removeHoliday = async (date: string): Promise<boolean> => {
    if (!token) return false;
    setActionLoading(true);
    setError(null);

    try {
      const res = await fetch(`${API_BASE}/holidays/${date}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (res.ok) {
        await Promise.all([fetchHolidays(), fetchStats(), fetchLogs()]);
        setActionLoading(false);
        return true;
      } else {
        const data = await res.json();
        setError(data.error || 'Failed to remove holiday.');
        setActionLoading(false);
        return false;
      }
    } catch (err) {
      setError('Network error. Failed to remove holiday.');
      setActionLoading(false);
      return false;
    }
  };

  // Resets the DB records for this specific student user
  const resetDatabase = async (): Promise<boolean> => {
    if (!token) return false;
    setActionLoading(true);
    setError(null);
    try {
      // Deletes all attendance logs and holidays for this user
      // We implement a simplified way: remove all custom holidays and attendance records
      // We can do this by deleting each holiday and attendance log, or we could add a backend route.
      // Since we want to keep it simple, let's delete holidays and delete attendance records.
      // We will add a clear-data logic:
      // Let's call a DELETE request to /api/attendance/reset
      // Oh! We didn't define a route in index.js for reset.
      // But we can implement a custom reset by calling backend, or let's add the route in index.js,
      // or we can delete holidays and logs via code.
      // Wait, let's check: can we add a route in index.js to reset or clear user data?
      // Yes! In index.js, let's add `app.post('/api/attendance/reset', ...)` which deletes all records for req.userId.
      // Let's modify index.js or just write the call here, and edit index.js to support it!
      // This is very clean. Let's write the API call and update index.js later.
      const res = await fetch(`${API_BASE}/attendance/reset`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (res.ok) {
        await Promise.all([fetchHolidays(), fetchStats(), fetchLogs()]);
        setActionLoading(false);
        return true;
      }
      setActionLoading(false);
      return false;
    } catch (err) {
      setError('Network error. Failed to reset database.');
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
