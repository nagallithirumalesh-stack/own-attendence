import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth, User } from './context/AuthContext';
import { AttendanceProvider, useAttendance, AttendanceRecord, Holiday, OverallStats, SubjectStats } from './context/AttendanceContext';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from './utils/firebase';
import { 
  PERIODS, 
  SUBJECTS, 
  TIMETABLE, 
  getSubjectMeta, 
  getCurrentPeriodInfo, 
  CurrentPeriodStatus,
  getMinutesFromTime
} from './utils/timetable';
import { 
  Home, 
  Calendar as CalendarIcon, 
  BookOpen, 
  User as UserIcon, 
  Clock, 
  History, 
  CheckCircle, 
  AlertTriangle, 
  LogOut, 
  Trash2, 
  Calculator, 
  Sun, 
  Moon, 
  FileText,
  Shield,
  Search
} from 'lucide-react';

// Helper to format Date to local YYYY-MM-DD
const getLocalDateString = (d: Date): string => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// Simple Alert Component
const Alert: React.FC<{ message: string; type: 'error' | 'success'; onClose: () => void }> = ({ message, type, onClose }) => {
  return (
    <div className={`fixed top-4 left-4 right-4 z-50 p-4 rounded-xl shadow-lg border backdrop-blur-md flex justify-between items-center transition-all ${
      type === 'error' 
        ? 'bg-rose-950/80 border-rose-800 text-rose-200' 
        : 'bg-emerald-950/80 border-emerald-800 text-emerald-200'
    }`}>
      <div className="flex items-center gap-2">
        {type === 'error' ? <AlertTriangle size={20} /> : <CheckCircle size={20} />}
        <p className="text-sm font-medium">{message}</p>
      </div>
      <button onClick={onClose} className="text-xs uppercase tracking-widest font-bold opacity-75 hover:opacity-100 px-2 py-1">
        Dismiss
      </button>
    </div>
  );
};

// Main App Container to manage auth gating
const AppContent: React.FC = () => {
  const { token, user, loading: authLoading, login, register, logout, updateProfile, error: authError, clearError: clearAuthError } = useAuth();
  const { 
    logs, holidays, stats, actionLoading, error: attendanceError, 
    markAttendance, markHoliday, removeHoliday, resetDatabase, clearError: clearAttendanceError 
  } = useAttendance();

  // Routing State
  const [activeTab, setActiveTab] = useState<'home' | 'timetable' | 'attendance' | 'calendar' | 'profile' | 'admin'>('home');
  const [showHistoryModal, setShowHistoryModal] = useState<boolean>(false);
  const [showReportModal, setShowReportModal] = useState<boolean>(false);

  // Auth Forms State
  const [isRegister, setIsRegister] = useState<boolean>(false);
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [name, setName] = useState<string>('');
  const [rollNumber, setRollNumber] = useState<string>('');

  // Local Time Tick
  const [currentTime, setCurrentTime] = useState<Date>(new Date());
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 15000); // update every 15s
    return () => clearInterval(timer);
  }, []);

  // Theme state
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');

  useEffect(() => {
    const storedTheme = localStorage.getItem('theme');
    if (storedTheme === 'light') {
      setTheme('light');
      document.documentElement.classList.remove('dark');
    } else {
      setTheme('dark');
      document.documentElement.classList.add('dark');
    }
  }, []);

  const toggleTheme = () => {
    if (theme === 'dark') {
      setTheme('light');
      localStorage.setItem('theme', 'light');
      document.documentElement.classList.remove('dark');
    } else {
      setTheme('dark');
      localStorage.setItem('theme', 'dark');
      document.documentElement.classList.add('dark');
    }
  };

  // Calendar Selection State
  const [selectedCalendarMonth, setSelectedCalendarMonth] = useState<number>(new Date().getMonth());
  const [selectedCalendarYear, setSelectedCalendarYear] = useState<number>(new Date().getFullYear());
  const [selectedDateDetail, setSelectedDateDetail] = useState<string | null>(null);

  // Custom Holiday State
  const [holidayReason, setHolidayReason] = useState<string>('');

  // Report Month/Year state
  const [reportMonth, setReportMonth] = useState<number>(new Date().getMonth());
  const [reportYear, setReportYear] = useState<number>(new Date().getFullYear());

  // Attendance History Filter State
  const [historyFilterSubject, setHistoryFilterSubject] = useState<string>('ALL');
  const [historyFilterStatus, setHistoryFilterStatus] = useState<string>('ALL');

  // Attendance Calculator Inputs
  const [reqPercentage, setReqPercentage] = useState<number>(75);

  // Profile Form state
  const [editName, setEditName] = useState<string>('');
  const [editRoll, setEditRoll] = useState<string>('');
  const [editRoom, setEditRoom] = useState<string>('');
  const [editSem, setEditSem] = useState<string>('');
  const [editYear, setEditYear] = useState<string>('');
  const [editThreshold, setEditThreshold] = useState<number>(75);
  const [editRole, setEditRole] = useState<'student' | 'admin'>('student');

  useEffect(() => {
    if (user) {
      setEditName(user.name);
      setEditRoll(user.roll_number);
      setEditRoom(user.room_number || 'B404');
      setEditSem(user.semester || '1');
      setEditYear(user.year || 'III');
      setEditThreshold(user.min_attendance_pct || 75);
      setEditRole(user.role || 'student');
    }
  }, [user]);

  // Timetable page active day tab (Monday-Saturday)
  const [activeTimetableDay, setActiveTimetableDay] = useState<string>(() => {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const curDay = days[new Date().getDay()];
    return curDay === 'Sunday' ? 'Monday' : curDay;
  });

  // Today Date details
  const todayStr = getLocalDateString(currentTime);
  const daysOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const todayDayName = daysOfWeek[currentTime.getDay()];
  const isTodayHoliday = holidays.some(h => h.date === todayStr);
  const periodInfo: CurrentPeriodStatus = getCurrentPeriodInfo(currentTime, todayDayName, isTodayHoliday);

  if (authLoading) {
    return (
      <div className="min-height-screen bg-slate-950 flex flex-col justify-center items-center p-6 text-slate-200">
        <div className="w-12 h-12 rounded-full border-4 border-t-indigo-500 border-slate-800 animate-spin mb-4"></div>
        <p className="font-semibold text-lg text-indigo-400">Loading profile...</p>
      </div>
    );
  }

  // Render Login/Register if not authenticated
  if (!token || !user) {
    const handleAuthSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      if (isRegister) {
        await register(email, password, name, rollNumber);
      } else {
        await login(email, password);
      }
    };

    return (
      <div className="min-h-screen bg-[#070b13] flex flex-col justify-center items-center p-4">
        {authError && <Alert message={authError} type="error" onClose={clearAuthError} />}
        
        <div className="w-full max-w-md bg-slate-900/60 backdrop-blur-xl border border-slate-800/80 rounded-3xl p-8 shadow-2xl">
          <div className="flex flex-col items-center mb-8">
            <div className="w-16 h-16 bg-gradient-to-tr from-indigo-600 to-indigo-400 rounded-2xl flex justify-center items-center shadow-lg shadow-indigo-500/20 mb-4 animate-pulse">
              <Clock size={36} className="text-white" />
            </div>
            <h1 className="text-2xl font-bold bg-gradient-to-r from-indigo-200 to-slate-200 bg-clip-text text-transparent">
              AIDS-3 Attendance
            </h1>
            <p className="text-sm text-slate-400 mt-1">Smart Attendance Management website</p>
          </div>

          <form onSubmit={handleAuthSubmit} className="space-y-5">
            {isRegister && (
              <>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Student Name</label>
                  <input
                    type="text" required
                    className="w-full bg-slate-950/80 border border-slate-800 focus:border-indigo-500 text-slate-100 rounded-xl px-4 py-3 text-sm focus:outline-none transition-colors"
                    placeholder="e.g. Rahul Kumar"
                    value={name} onChange={(e) => setName(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Roll Number</label>
                  <input
                    type="text" required
                    className="w-full bg-slate-950/80 border border-slate-800 focus:border-indigo-500 text-slate-100 rounded-xl px-4 py-3 text-sm focus:outline-none transition-colors"
                    placeholder="e.g. 23AIDS3045"
                    value={rollNumber} onChange={(e) => setRollNumber(e.target.value)}
                  />
                </div>
              </>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Email Address</label>
              <input
                type="email" required
                className="w-full bg-slate-950/80 border border-slate-800 focus:border-indigo-500 text-slate-100 rounded-xl px-4 py-3 text-sm focus:outline-none transition-colors"
                placeholder="email@college.edu"
                value={email} onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Password</label>
              <input
                type="password" required
                className="w-full bg-slate-950/80 border border-slate-800 focus:border-indigo-500 text-slate-100 rounded-xl px-4 py-3 text-sm focus:outline-none transition-colors"
                placeholder="••••••••"
                value={password} onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            <button
              type="submit"
              disabled={actionLoading}
              className="w-full bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white rounded-xl py-3 text-sm font-semibold transition-all shadow-lg shadow-indigo-600/20 active:scale-95 disabled:opacity-50"
            >
              {isRegister ? 'Create Account' : 'Sign In'}
            </button>
          </form>

          <div className="mt-6 text-center">
            <button
              onClick={() => {
                setIsRegister(!isRegister);
                clearAuthError();
              }}
              className="text-xs text-indigo-400 hover:underline"
            >
              {isRegister ? 'Already have an account? Sign In' : "Don't have an account? Sign Up"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ----------------------------------------------------
  // EVENT HANDLERS
  // ----------------------------------------------------

  const handleMark = async (periodNum: number, subjectName: string, status: 'PRESENT' | 'ABSENT') => {
    const meta = getSubjectMeta(subjectName);
    const periodObj = PERIODS.find(p => p.period === periodNum);
    if (!periodObj) return;

    await markAttendance({
      date: todayStr,
      day: todayDayName,
      subject: meta.baseSubject,
      subject_code: meta.code,
      period_number: periodNum,
      start_time: periodObj.timeStr.split(' – ')[0],
      end_time: periodObj.timeStr.split(' – ')[1],
      status
    });
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    const success = await updateProfile({
      name: editName,
      roll_number: editRoll,
      room_number: editRoom,
      semester: editSem,
      year: editYear,
      min_attendance_pct: Number(editThreshold),
      role: editRole
    });
    if (success) {
      alert('Profile updated successfully!');
    }
  };

  const handleDeclareHoliday = async (dateStr: string) => {
    if (!holidayReason.trim()) {
      alert('Please provide a reason for the holiday.');
      return;
    }
    const success = await markHoliday(dateStr, holidayReason);
    if (success) {
      setHolidayReason('');
      setSelectedDateDetail(null);
    }
  };

  const handleRemoveHoliday = async (dateStr: string) => {
    if (confirm(`Remove holiday status for ${dateStr}?`)) {
      const success = await removeHoliday(dateStr);
      if (success) {
        setSelectedDateDetail(null);
      }
    }
  };

  const handleManualMark = async (dateStr: string, periodNum: number, subjectName: string, status: 'PRESENT' | 'ABSENT' | 'NOT_MARKED') => {
    const d = new Date(dateStr);
    const dayName = daysOfWeek[d.getDay()];
    const meta = getSubjectMeta(subjectName);
    const periodObj = PERIODS.find(p => p.period === periodNum);
    if (!periodObj) return;

    if (status === 'NOT_MARKED') {
      // In our UI, changing to NOT_MARKED means calling reset/delete
      // But we can just post a record with NOT_MARKED to reset it.
      await markAttendance({
        date: dateStr,
        day: dayName,
        subject: meta.baseSubject,
        subject_code: meta.code,
        period_number: periodNum,
        start_time: periodObj.timeStr.split(' – ')[0],
        end_time: periodObj.timeStr.split(' – ')[1],
        status: 'NOT_MARKED'
      });
      return;
    }

    if (status === 'PRESENT' || status === 'ABSENT') {
      const existing = logs.find(l => l.date === dateStr && l.period_number === periodNum && l.subject === meta.baseSubject);
      if (existing && existing.status !== 'NOT_MARKED' && existing.status !== 'HOLIDAY') {
        if (!confirm(`Are you sure you want to change the attendance from ${existing.status} to ${status}?`)) {
          return;
        }
      }

      await markAttendance({
        date: dateStr,
        day: dayName,
        subject: meta.baseSubject,
        subject_code: meta.code,
        period_number: periodNum,
        start_time: periodObj.timeStr.split(' – ')[0],
        end_time: periodObj.timeStr.split(' – ')[1],
        status
      });
    }
  };

  // ----------------------------------------------------
  // CALCULATED VALUES
  // ----------------------------------------------------

  const overallPct = stats?.overall.percentage || 0.00;
  const currentConducted = stats?.overall.conducted || 0;
  const currentPresent = stats?.overall.present || 0;
  const currentAbsent = stats?.overall.absent || 0;
  const targetThreshold = user.min_attendance_pct || 75;

  // Classes needed or can miss calculation
  const calculateThresholdDiff = () => {
    if (overallPct < targetThreshold) {
      // Below threshold: calculate how many consecutive classes to attend to reach target
      // TargetPct / 100 = (Present + X) / (Conducted + X)
      // TargetPct * Conducted + TargetPct * X = 100 * Present + 100 * X
      // X * (100 - TargetPct) = TargetPct * Conducted - 100 * Present
      // X = Math.ceil((TargetPct * Conducted - 100 * Present) / (100 - TargetPct))
      if (targetThreshold >= 100) return 'Cannot reach 100% unless overall was already 100% or you start from clean slate.';
      const needed = Math.ceil((targetThreshold * currentConducted - 100 * currentPresent) / (100 - targetThreshold));
      return `Attend ${needed > 0 ? needed : 0} consecutive classes to reach ${targetThreshold}%.`;
    } else {
      // Safe: how many classes can miss and still stay above target
      // TargetPct / 100 = Present / (Conducted + Y)
      // TargetPct * Conducted + TargetPct * Y = 100 * Present
      // Y * TargetPct = 100 * Present - TargetPct * Conducted
      // Y = Math.floor((100 * Present - TargetPct * Conducted) / TargetPct)
      if (targetThreshold <= 0) return 'You can miss unlimited classes.';
      const missable = Math.floor((100 * currentPresent - targetThreshold * currentConducted) / targetThreshold);
      return `You can miss ${missable > 0 ? missable : 0} classes without falling below ${targetThreshold}%.`;
    }
  };

  const getCustomThresholdDiff = (curPres: number, curCond: number, target: number) => {
    const curPct = curCond > 0 ? (curPres / curCond) * 100 : 0;
    if (curPct < target) {
      if (target >= 100) return { type: 'danger', text: 'You need to attend infinite classes to reach 100%.' };
      const needed = Math.ceil((target * curCond - 100 * curPres) / (100 - target));
      return { type: 'warning', text: `You must attend ${needed > 0 ? needed : 0} consecutive classes to hit ${target}%.` };
    } else {
      if (target <= 0) return { type: 'safe', text: 'You can miss unlimited classes.' };
      const missable = Math.floor((100 * curPres - target * curCond) / target);
      return { type: 'safe', text: `You can safely miss ${missable > 0 ? missable : 0} classes without dropping below ${target}%.` };
    }
  };

  // Get list of pending (not marked) classes for TODAY that have already passed
  const getPendingClassesToday = () => {
    if (isTodayHoliday || todayDayName === 'Sunday') return [];
    
    const todaysSchedule = TIMETABLE[todayDayName];
    if (!todaysSchedule) return [];

    const currentMinutes = getMinutesFromTime(currentTime);

    const pending: { period: number; subject: string; timeStr: string }[] = [];

    todaysSchedule.forEach((sub, idx) => {
      const periodObj = PERIODS[idx];
      // Has this period ended?
      if (currentMinutes >= periodObj.endMinutes) {
        // Is it marked in DB?
        const meta = getSubjectMeta(sub);
        const record = logs.find(l => l.date === todayStr && l.period_number === idx && l.subject === meta.baseSubject);
        if (!record || record.status === 'NOT_MARKED') {
          pending.push({
            period: idx,
            subject: sub,
            timeStr: periodObj.timeStr
          });
        }
      }
    });

    return pending;
  };

  const pendingClasses = getPendingClassesToday();

  // Helper to check status of a specific period on a specific date
  const getPeriodStatus = (dateStr: string, periodIdx: number, subjectName: string) => {
    const d = new Date(dateStr);
    const dayName = daysOfWeek[d.getDay()];
    
    if (dayName === 'Sunday') return 'HOLIDAY';
    
    const isHolidayDate = holidays.some(h => h.date === dateStr);
    if (isHolidayDate) return 'HOLIDAY';

    const meta = getSubjectMeta(subjectName);
    const record = logs.find(l => l.date === dateStr && l.period_number === periodIdx && l.subject === meta.baseSubject);
    
    return record ? record.status : 'NOT_MARKED';
  };

  return (
    <div className={`min-h-screen text-slate-100 flex flex-col transition-colors pb-24 ${theme === 'dark' ? 'bg-[#0b0f19]' : 'bg-slate-50 text-slate-900'}`}>
      
      {/* Alert Overlays */}
      {authError && <Alert message={authError} type="error" onClose={clearAuthError} />}
      {attendanceError && <Alert message={attendanceError} type="error" onClose={clearAttendanceError} />}

      {/* ----------------------------------------------------
          TOP NAVIGATION BAR
      ---------------------------------------------------- */}
      <header className={`sticky top-0 z-40 border-b backdrop-blur-md transition-colors px-6 py-4 flex justify-between items-center ${
        theme === 'dark' ? 'bg-[#0f172a]/70 border-slate-800/80' : 'bg-white/80 border-slate-200'
      }`}>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-600 flex justify-center items-center text-white shadow-md shadow-indigo-500/10">
            <Clock size={20} />
          </div>
          <div>
            <h1 className="text-base font-bold tracking-tight">AIDS-3 Portal</h1>
            <p className="text-xs text-slate-400">Semester 1 | Year III</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button 
            onClick={toggleTheme}
            className={`p-2 rounded-xl border transition-colors ${
              theme === 'dark' ? 'bg-slate-800/50 border-slate-700 hover:bg-slate-800' : 'bg-slate-100 border-slate-200 hover:bg-slate-200'
            }`}
          >
            {theme === 'dark' ? <Sun size={18} className="text-amber-400" /> : <Moon size={18} className="text-indigo-600" />}
          </button>

          <button
            onClick={() => setShowHistoryModal(true)}
            className={`p-2 rounded-xl border transition-colors flex items-center gap-1 ${
              theme === 'dark' ? 'bg-slate-800/50 border-slate-700 hover:bg-slate-800 text-slate-300' : 'bg-slate-100 border-slate-200 hover:bg-slate-200 text-slate-700'
            }`}
            title="Attendance Logs History"
          >
            <History size={18} />
          </button>
        </div>
      </header>

      {/* ----------------------------------------------------
          MAIN VIEWS CONTAINER
      ---------------------------------------------------- */}
      <main className="flex-1 w-full max-w-lg mx-auto px-5 py-6 space-y-6">
        
        {/* ====================================================
            VIEW: HOME (DASHBOARD)
        ==================================================== */}
        {activeTab === 'home' && (
          <div className="space-y-6 animate-fadeIn">
            
            {/* 1. Header Greeting & Status info */}
            <div className="flex justify-between items-start">
              <div>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest">Welcome Back</p>
                <h2 className="text-2xl font-bold mt-0.5">{user.name} 👋</h2>
                <p className="text-xs text-slate-400 mt-1">Roll No: {user.roll_number} | Room: {user.room_number || 'B404'}</p>
              </div>
            </div>

            {/* 2. Overall Summary Cards */}
            <div className={`p-6 rounded-3xl border shadow-xl flex items-center justify-between transition-colors ${
              theme === 'dark' 
                ? 'bg-gradient-to-tr from-slate-900 to-slate-900/60 border-slate-800/80 shadow-slate-950/20' 
                : 'bg-white border-slate-200/80 shadow-slate-100'
            }`}>
              <div className="space-y-3">
                <div>
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Overall Attendance</p>
                  <p className="text-4xl font-extrabold tracking-tight mt-1 bg-gradient-to-r from-white to-slate-300 bg-clip-text text-transparent">
                    {overallPct.toFixed(2)}%
                  </p>
                </div>
                
                <div className="flex gap-4 text-xs font-semibold">
                  <div>
                    <span className="text-emerald-500">Present</span>
                    <p className="text-sm font-bold text-slate-200 mt-0.5">{currentPresent}</p>
                  </div>
                  <div className="border-l border-slate-800 pl-4">
                    <span className="text-rose-500">Absent</span>
                    <p className="text-sm font-bold text-slate-200 mt-0.5">{currentAbsent}</p>
                  </div>
                  <div className="border-l border-slate-800 pl-4">
                    <span className="text-slate-400">Conducted</span>
                    <p className="text-sm font-bold text-slate-200 mt-0.5">{currentConducted}</p>
                  </div>
                </div>
              </div>

              {/* Native SVG Donut Chart */}
              <div className="relative w-24 h-24">
                <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
                  <circle cx="18" cy="18" r="15.915" fill="none" stroke={theme === 'dark' ? '#1e293b' : '#e2e8f0'} strokeWidth="3" />
                  <circle cx="18" cy="18" r="15.915" fill="none" 
                    stroke={overallPct >= targetThreshold ? '#10b981' : '#f43f5e'} 
                    strokeWidth="3.2" 
                    strokeDasharray={`${overallPct} ${100 - overallPct}`}
                    strokeLinecap="round"
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col justify-center items-center text-center">
                  <span className={`text-[10px] uppercase font-bold tracking-wider ${overallPct >= targetThreshold ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {overallPct >= targetThreshold ? 'Safe' : 'Low'}
                  </span>
                </div>
              </div>
            </div>

            {/* Dynamic Alert Banner based on status */}
            <div className={`p-4 rounded-2xl border text-xs font-medium flex items-start gap-3 transition-colors ${
              overallPct >= targetThreshold
                ? 'bg-emerald-950/20 border-emerald-900/50 text-emerald-300'
                : 'bg-rose-950/20 border-rose-900/50 text-rose-300'
            }`}>
              <AlertTriangle className="shrink-0 mt-0.5" size={16} />
              <div>
                <p className="font-bold">{overallPct >= targetThreshold ? '✓ Safe Attendance Level' : '⚠️ Low Attendance level!'}</p>
                <p className="opacity-90 mt-0.5">{calculateThresholdDiff()}</p>
              </div>
            </div>

            {/* 3. CURRENT/NEXT PERIOD DETECTION WIDGET */}
            <div className={`p-5 rounded-2xl border transition-colors ${
              theme === 'dark' ? 'bg-slate-900/40 border-slate-800/80' : 'bg-white border-slate-200'
            }`}>
              <div className="flex items-center justify-between mb-4 border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <Clock size={16} className="text-indigo-400 animate-pulse" />
                  <span className="text-xs font-bold uppercase tracking-wider text-indigo-400">Class Tracker</span>
                </div>
                <span className="text-[10px] text-slate-400 font-semibold">{currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
              </div>

              {/* Status Display */}
              {periodInfo.state === 'WEEKEND' && (
                <div className="text-center py-2">
                  <p className="font-bold text-slate-300">Today is Sunday</p>
                  <p className="text-xs text-slate-500 mt-1">Weekend Holiday — No classes scheduled.</p>
                </div>
              )}

              {periodInfo.state === 'HOLIDAY' && (
                <div className="text-center py-2">
                  <p className="font-bold text-slate-400">Manually Declared Holiday</p>
                  <p className="text-xs text-slate-500 mt-1">The date has been marked as a college holiday.</p>
                </div>
              )}

              {periodInfo.state === 'AFTER' && (
                <div className="text-center py-2">
                  <p className="font-bold text-emerald-400">Today's classes completed.</p>
                  <p className="text-xs text-slate-500 mt-1">All scheduled periods for today have finished.</p>
                </div>
              )}

              {periodInfo.state === 'BEFORE' && periodInfo.next && (
                <div className="space-y-2">
                  <p className="text-xs text-slate-400 uppercase tracking-wider font-semibold">Today's classes start at 08:40 AM</p>
                  <div className="bg-slate-950/50 border border-slate-900 p-3 rounded-xl flex justify-between items-center">
                    <div>
                      <p className="font-bold text-slate-300">{periodInfo.next.subject}</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">Period {periodInfo.next.period} • {periodInfo.next.timeStr}</p>
                    </div>
                    <span className="text-xs font-semibold text-indigo-400">UP NEXT</span>
                  </div>
                </div>
              )}

              {periodInfo.state === 'LUNCH' && periodInfo.next && (
                <div className="space-y-3">
                  <div className="text-center py-1">
                    <p className="font-bold text-indigo-400">Lunch Break</p>
                    <p className="text-xs text-slate-500">12:00 PM – 12:50 PM</p>
                  </div>
                  <div className="bg-slate-950/50 border border-slate-900 p-3 rounded-xl flex justify-between items-center">
                    <div>
                      <p className="font-bold text-slate-300">{periodInfo.next.subject}</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">Period 4 • {periodInfo.next.timeStr}</p>
                    </div>
                    <span className="text-xs font-semibold text-indigo-400">UP NEXT</span>
                  </div>
                </div>
              )}

              {periodInfo.state === 'DURING' && periodInfo.current && (
                <div className="space-y-4">
                  <div className="space-y-1">
                    <span className="bg-indigo-950 border border-indigo-900 text-indigo-300 text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">
                      Active Now
                    </span>
                    <div className="flex justify-between items-center pt-2">
                      <div>
                        <h4 className="text-lg font-bold text-slate-200">{periodInfo.current.subject}</h4>
                        <p className="text-xs text-slate-400">Period {periodInfo.current.period} • {periodInfo.current.timeStr}</p>
                      </div>
                      <div className="flex gap-2">
                        {(() => {
                          const curStatus = getPeriodStatus(todayStr, periodInfo.current.period, periodInfo.current.subject);
                          if (curStatus === 'PRESENT') {
                            return <span className="bg-emerald-950 border border-emerald-800 text-emerald-300 font-bold px-3 py-1.5 rounded-xl text-xs flex items-center gap-1">✓ Present</span>;
                          } else if (curStatus === 'ABSENT') {
                            return <span className="bg-rose-950 border border-rose-800 text-rose-300 font-bold px-3 py-1.5 rounded-xl text-xs flex items-center gap-1">✕ Absent</span>;
                          } else {
                            return (
                              <>
                                <button 
                                  onClick={() => handleMark(periodInfo.current!.period, periodInfo.current!.subject, 'PRESENT')}
                                  className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-3 py-1.5 rounded-xl text-xs transition-colors shadow-lg shadow-emerald-700/10 active:scale-95"
                                >
                                  Present
                                </button>
                                <button 
                                  onClick={() => handleMark(periodInfo.current!.period, periodInfo.current!.subject, 'ABSENT')}
                                  className="bg-rose-600 hover:bg-rose-500 text-white font-bold px-3 py-1.5 rounded-xl text-xs transition-colors shadow-lg shadow-rose-700/10 active:scale-95"
                                >
                                  Absent
                                </button>
                              </>
                            );
                          }
                        })()}
                      </div>
                    </div>
                  </div>

                  {periodInfo.next && (
                    <div className="border-t border-slate-800 pt-3 flex justify-between items-center">
                      <div>
                        <span className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider block">Up Next</span>
                        <span className="text-sm font-bold text-slate-400">{periodInfo.next.subject}</span>
                      </div>
                      <span className="text-[10px] text-slate-400">{periodInfo.next.timeStr}</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Attendance Pending Warning (At end of day or if forget) */}
            {pendingClasses.length > 0 && (
              <div className="bg-amber-950/20 border border-amber-900/50 p-4 rounded-2xl flex items-start gap-3">
                <AlertTriangle className="text-amber-500 shrink-0 mt-0.5 animate-bounce" size={18} />
                <div className="space-y-2">
                  <p className="text-xs font-bold text-amber-300 uppercase tracking-wide">
                    ⚠️ You have {pendingClasses.length} attendance records pending
                  </p>
                  <p className="text-[11px] text-amber-400/90 leading-relaxed">
                    Classes for these periods have already ended, but you haven't marked your attendance yet. Check below to mark them.
                  </p>
                </div>
              </div>
            )}

            {/* 4. TODAY'S CLASSES DETAILED LIST */}
            <div className="space-y-3">
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400">Today's Schedule ({todayDayName})</h3>
              
              {isTodayHoliday || todayDayName === 'Sunday' ? (
                <div className={`p-8 text-center border rounded-2xl ${theme === 'dark' ? 'bg-slate-900/20 border-slate-800' : 'bg-white border-slate-200'}`}>
                  <p className="font-semibold text-slate-400">Holiday</p>
                  <p className="text-xs text-slate-500 mt-1">
                    {todayDayName === 'Sunday' ? 'Sundays are built-in non-working holidays.' : 'Today has been marked as a holiday.'}
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {TIMETABLE[todayDayName]?.map((sub, idx) => {
                    const periodObj = PERIODS[idx];
                    const curStatus = getPeriodStatus(todayStr, idx, sub);
                    
                    return (
                      <div key={idx} className={`p-4 rounded-xl border transition-colors flex items-center justify-between ${
                        theme === 'dark' ? 'bg-slate-900/30 border-slate-800/80 hover:border-slate-700' : 'bg-white border-slate-200 hover:border-slate-300'
                      }`}>
                        <div className="flex items-center gap-4">
                          <div className={`w-8 h-8 rounded-lg flex justify-center items-center text-xs font-bold border ${
                            theme === 'dark' ? 'bg-slate-950 border-slate-800 text-slate-400' : 'bg-slate-100 border-slate-200 text-slate-700'
                          }`}>
                            P{idx}
                          </div>
                          <div>
                            <h4 className="text-sm font-bold text-slate-200">{sub}</h4>
                            <p className="text-[10px] text-slate-400 mt-0.5">{periodObj.timeStr}</p>
                          </div>
                        </div>

                        {/* Attendance Buttons */}
                        <div className="flex gap-2">
                          {curStatus === 'PRESENT' && (
                            <button 
                              onClick={() => {
                                if (confirm(`Change attendance for ${sub} Period ${idx} to ABSENT?`)) {
                                  handleMark(idx, sub, 'ABSENT');
                                }
                              }}
                              className="bg-emerald-950/60 border border-emerald-900/60 text-emerald-400 font-extrabold px-3 py-1.5 rounded-xl text-xs shadow-inner flex items-center gap-1 active:scale-95"
                            >
                              ✓ PRESENT
                            </button>
                          )}
                          {curStatus === 'ABSENT' && (
                            <button 
                              onClick={() => {
                                if (confirm(`Change attendance for ${sub} Period ${idx} to PRESENT?`)) {
                                  handleMark(idx, sub, 'PRESENT');
                                }
                              }}
                              className="bg-rose-950/60 border border-rose-900/60 text-rose-400 font-extrabold px-3 py-1.5 rounded-xl text-xs shadow-inner flex items-center gap-1 active:scale-95"
                            >
                              ✕ ABSENT
                            </button>
                          )}
                          {curStatus === 'NOT_MARKED' && (
                            <>
                              <button
                                onClick={() => handleMark(idx, sub, 'PRESENT')}
                                className="bg-emerald-600/10 hover:bg-emerald-600 border border-emerald-900 hover:border-emerald-500 text-emerald-400 hover:text-white font-bold px-3 py-1.5 rounded-xl text-xs transition-all active:scale-95"
                              >
                                Present
                              </button>
                              <button
                                onClick={() => handleMark(idx, sub, 'ABSENT')}
                                className="bg-rose-600/10 hover:bg-rose-600 border border-rose-900 hover:border-rose-500 text-rose-400 hover:text-white font-bold px-3 py-1.5 rounded-xl text-xs transition-all active:scale-95"
                              >
                                Absent
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* 5. QUICK ACTIONS PANEL */}
            <div className="space-y-3">
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400">Quick Actions</h3>
              <div className="grid grid-cols-2 gap-4">
                <button
                  onClick={() => setActiveTab('timetable')}
                  className={`p-4 rounded-2xl border text-left flex flex-col justify-between h-28 hover:scale-[1.02] active:scale-95 transition-all shadow-md ${
                    theme === 'dark' ? 'bg-gradient-to-tr from-slate-900 to-slate-900/40 border-slate-800' : 'bg-white border-slate-200'
                  }`}
                >
                  <BookOpen className="text-indigo-400" size={24} />
                  <div>
                    <p className="text-sm font-bold">View Timetable</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">AIDS-3 Schedule</p>
                  </div>
                </button>

                <button
                  onClick={() => setShowReportModal(true)}
                  className={`p-4 rounded-2xl border text-left flex flex-col justify-between h-28 hover:scale-[1.02] active:scale-95 transition-all shadow-md ${
                    theme === 'dark' ? 'bg-gradient-to-tr from-slate-900 to-slate-900/40 border-slate-800' : 'bg-white border-slate-200'
                  }`}
                >
                  <FileText className="text-indigo-400" size={24} />
                  <div>
                    <p className="text-sm font-bold">Monthly Report</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">Attendance Charts</p>
                  </div>
                </button>

                <button
                  onClick={() => setActiveTab('attendance')}
                  className={`p-4 rounded-2xl border text-left flex flex-col justify-between h-28 hover:scale-[1.02] active:scale-95 transition-all shadow-md ${
                    theme === 'dark' ? 'bg-gradient-to-tr from-slate-900 to-slate-900/40 border-slate-800' : 'bg-white border-slate-200'
                  }`}
                >
                  <Calculator className="text-indigo-400" size={24} />
                  <div>
                    <p className="text-sm font-bold">Calculator</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">Predict Class Goals</p>
                  </div>
                </button>

                <button
                  onClick={() => setActiveTab('calendar')}
                  className={`p-4 rounded-2xl border text-left flex flex-col justify-between h-28 hover:scale-[1.02] active:scale-95 transition-all shadow-md ${
                    theme === 'dark' ? 'bg-gradient-to-tr from-slate-900 to-slate-900/40 border-slate-800' : 'bg-white border-slate-200'
                  }`}
                >
                  <CalendarIcon className="text-indigo-400" size={24} />
                  <div>
                    <p className="text-sm font-bold">Declare Holiday</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">Manage Days Off</p>
                  </div>
                </button>
              </div>
            </div>

          </div>
        )}

        {/* ====================================================
            VIEW: TIMETABLE
        ==================================================== */}
        {activeTab === 'timetable' && (
          <div className="space-y-6 animate-fadeIn">
            <div>
              <h2 className="text-xl font-bold">Class Timetable</h2>
              <p className="text-xs text-slate-400">Semester 1 | AIDS-3 (Room: {user.room_number || 'B404'})</p>
            </div>

            {/* Horizontal Day Tabs Selector */}
            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
              {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map((day) => (
                <button
                  key={day}
                  onClick={() => setActiveTimetableDay(day)}
                  className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                    activeTimetableDay === day
                      ? 'bg-indigo-600 text-white shadow-md'
                      : theme === 'dark' ? 'bg-slate-900/50 text-slate-400 border border-slate-800/80 hover:bg-slate-800' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {day}
                </button>
              ))}
            </div>

            {/* Timetable List for Selected Day */}
            <div className="space-y-3">
              {TIMETABLE[activeTimetableDay]?.map((sub, idx) => {
                const periodObj = PERIODS[idx];
                const meta = getSubjectMeta(sub);
                const subDetail = SUBJECTS.find(s => s.shortName === meta.baseSubject);
                
                return (
                  <div key={idx} className={`p-4 rounded-xl border transition-all flex gap-4 ${
                    theme === 'dark' ? 'bg-slate-900/30 border-slate-800/80' : 'bg-white border-slate-200'
                  }`}>
                    {/* Period Number Box */}
                    <div className={`w-12 shrink-0 rounded-xl flex flex-col justify-center items-center border ${
                      theme === 'dark' ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-150'
                    }`}>
                      <span className="text-[10px] text-slate-500 font-bold uppercase">Period</span>
                      <span className="text-base font-extrabold text-indigo-400">{idx}</span>
                    </div>

                    {/* Subject info */}
                    <div className="flex-1 space-y-1">
                      <div className="flex justify-between items-start">
                        <h4 className="text-sm font-bold text-slate-200">{sub}</h4>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          meta.type === 'Lab' 
                            ? 'bg-purple-950/80 border border-purple-800 text-purple-300' 
                            : meta.type === 'Lab/Activity'
                            ? 'bg-blue-950/80 border border-blue-800 text-blue-300'
                            : 'bg-emerald-950/80 border border-emerald-800 text-emerald-300'
                        }`}>
                          {meta.type}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 leading-tight">{subDetail?.name || 'Class Period'}</p>
                      
                      <div className="flex gap-4 text-[10px] text-slate-500 font-semibold pt-1">
                        <span className="flex items-center gap-1"><Clock size={10} /> {periodObj.timeStr}</span>
                        <span>Room: {user.room_number || 'B404'}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            
            <div className="p-4 rounded-2xl bg-indigo-950/10 border border-indigo-900/40 text-[11px] text-indigo-300/80">
              <p className="font-bold">✨ Timetable Rule Information</p>
              <p className="mt-1 leading-relaxed">
                This schedule strictly follows the Artificial Intelligence and Data Science AIDS-3 timetable (Semester 1, Year III) effective from 29-06-2026.
              </p>
            </div>
          </div>
        )}

        {/* ====================================================
            VIEW: ATTENDANCE (SUBJECT-WISE & CALCULATOR)
        ==================================================== */}
        {activeTab === 'attendance' && (
          <div className="space-y-6 animate-fadeIn">
            
            {/* Header */}
            <div>
              <h2 className="text-xl font-bold">Subject Attendance</h2>
              <p className="text-xs text-slate-400">Detailed breakdown and calculator settings.</p>
            </div>

            {/* Subject List Cards */}
            <div className="space-y-4">
              {SUBJECTS.map((sub) => {
                const subStat = stats?.subjects[sub.shortName] || { present: 0, absent: 0, code: sub.code };
                const condCount = subStat.present + subStat.absent;
                const subPct = condCount > 0 ? (subStat.present / condCount) * 100 : 0;
                
                const isBelow = condCount > 0 && subPct < targetThreshold;

                return (
                  <div key={sub.code} className={`p-5 rounded-2xl border transition-colors ${
                    theme === 'dark' ? 'bg-slate-900/30 border-slate-800/80' : 'bg-white border-slate-200'
                  }`}>
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <h4 className="text-sm font-bold text-slate-200">{sub.name}</h4>
                        <p className="text-[10px] text-slate-400 mt-0.5">{sub.shortName} • {sub.code}</p>
                      </div>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        isBelow 
                          ? 'bg-rose-950/80 border border-rose-800 text-rose-300' 
                          : condCount > 0
                          ? 'bg-emerald-950/80 border border-emerald-800 text-emerald-300'
                          : 'bg-slate-800 border border-slate-700 text-slate-400'
                      }`}>
                        {condCount > 0 ? `${subPct.toFixed(2)}%` : 'No Classes'}
                      </span>
                    </div>

                    {/* Progress Bar */}
                    <div className="w-full bg-slate-950 border border-slate-900 h-2.5 rounded-full my-3 overflow-hidden">
                      <div 
                        className={`h-full rounded-full transition-all duration-500 ${
                          isBelow ? 'bg-rose-500' : 'bg-emerald-500'
                        }`} 
                        style={{ width: `${Math.min(subPct, 100)}%` }}
                      ></div>
                    </div>

                    <div className="flex justify-between items-center text-[10px] font-semibold text-slate-400 mt-2">
                      <div className="flex gap-3">
                        <span>Present: <b className="text-slate-200">{subStat.present}</b></span>
                        <span>Absent: <b className="text-slate-200">{subStat.absent}</b></span>
                        <span>Conducted: <b className="text-slate-200">{condCount}</b></span>
                      </div>
                      
                      {condCount > 0 && (
                        <span className={isBelow ? 'text-rose-400 flex items-center gap-0.5' : 'text-emerald-400 flex items-center gap-0.5'}>
                          {isBelow ? (
                            <><AlertTriangle size={12} /> Low Attendance</>
                          ) : (
                            <><CheckCircle size={12} /> Safe Attendance</>
                          )}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* 2. INTERACTIVE ATTENDANCE CALCULATOR */}
            <div className={`p-5 rounded-2xl border transition-colors ${
              theme === 'dark' ? 'bg-slate-900/40 border-slate-800/80' : 'bg-white border-slate-200'
            }`}>
              <div className="flex items-center gap-2 border-b border-slate-800 pb-3 mb-4">
                <Calculator size={18} className="text-indigo-400" />
                <h4 className="text-sm font-bold uppercase tracking-wider text-indigo-400">Attendance Calculator</h4>
              </div>

              <div className="space-y-4">
                <p className="text-xs text-slate-400 leading-relaxed">
                  Evaluate how future class attendance will affect your percentage. Adjust inputs to see changes dynamically.
                </p>

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[10px] text-slate-400 uppercase tracking-wide font-bold mb-1.5">Present</label>
                    <input
                      type="number" min="0"
                      className="w-full bg-slate-950/80 border border-slate-800 focus:border-indigo-500 text-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none"
                      value={currentPresent} disabled
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-slate-400 uppercase tracking-wide font-bold mb-1.5">Conducted</label>
                    <input
                      type="number" min="0"
                      className="w-full bg-slate-950/80 border border-slate-800 focus:border-indigo-500 text-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none"
                      value={currentConducted} disabled
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-slate-400 uppercase tracking-wide font-bold mb-1.5">Required %</label>
                    <input
                      type="number" min="50" max="100"
                      className="w-full bg-slate-950/80 border border-slate-800 focus:border-indigo-500 text-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none"
                      value={reqPercentage} onChange={(e) => setReqPercentage(Number(e.target.value))}
                    />
                  </div>
                </div>

                <div className="p-3 bg-slate-950 border border-slate-900 rounded-xl">
                  {(() => {
                    const result = getCustomThresholdDiff(currentPresent, currentConducted, reqPercentage);
                    return (
                      <div className="flex items-start gap-2.5 text-xs leading-relaxed">
                        <AlertTriangle className={`shrink-0 mt-0.5 ${
                          result.type === 'safe' ? 'text-emerald-500' : 'text-amber-500'
                        }`} size={16} />
                        <span className={result.type === 'safe' ? 'text-emerald-400' : 'text-amber-400'}>
                          {result.text}
                        </span>
                      </div>
                    );
                  })()}
                </div>
              </div>
            </div>

          </div>
        )}

        {/* ====================================================
            VIEW: CALENDAR
        ==================================================== */}
        {activeTab === 'calendar' && (
          <div className="space-y-6 animate-fadeIn">
            
            {/* Header */}
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-xl font-bold">Attendance Calendar</h2>
                <p className="text-xs text-slate-400">Monthly schedule overview and holidays.</p>
              </div>
            </div>

            {/* Calendar Controls */}
            <div className="flex justify-between items-center gap-3">
              <select
                className={`bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none`}
                value={selectedCalendarMonth}
                onChange={(e) => {
                  setSelectedCalendarMonth(Number(e.target.value));
                  setSelectedDateDetail(null);
                }}
              >
                {['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'].map((m, idx) => (
                  <option key={idx} value={idx}>{m}</option>
                ))}
              </select>

              <select
                className={`bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none`}
                value={selectedCalendarYear}
                onChange={(e) => {
                  setSelectedCalendarYear(Number(e.target.value));
                  setSelectedDateDetail(null);
                }}
              >
                {[2025, 2026, 2027, 2028].map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>

            {/* Monthly Calendar Grid */}
            <div className={`p-4 rounded-3xl border transition-colors ${
              theme === 'dark' ? 'bg-slate-900/30 border-slate-800/80 shadow-lg' : 'bg-white border-slate-200 shadow-sm'
            }`}>
              {/* Day Labels */}
              <div className="grid grid-cols-7 gap-1 text-center font-bold text-[10px] text-slate-500 uppercase tracking-wider mb-2">
                <span>Mon</span>
                <span>Tue</span>
                <span>Wed</span>
                <span>Thu</span>
                <span>Fri</span>
                <span>Sat</span>
                <span className="text-rose-500">Sun</span>
              </div>

              {/* Day Cells */}
              <div className="grid grid-cols-7 gap-1">
                {(() => {
                  const firstDay = new Date(selectedCalendarYear, selectedCalendarMonth, 1).getDay();
                  const totalDays = new Date(selectedCalendarYear, selectedCalendarMonth + 1, 0).getDate();
                  const cells = [];
                  
                  // Empty spacers for starting day offset (adjust for Mon-Sun starting index: Sun=0, Mon=1)
                  // mon=1, tue=2, wed=3, thu=4, fri=5, sat=6, sun=0
                  const shift = firstDay === 0 ? 6 : firstDay - 1;
                  for (let i = 0; i < shift; i++) {
                    cells.push(<div key={`empty-${i}`} className="h-10"></div>);
                  }

                  // Days Cells
                  for (let d = 1; d <= totalDays; d++) {
                    const dateObj = new Date(selectedCalendarYear, selectedCalendarMonth, d);
                    const dateStr = getLocalDateString(dateObj);
                    const dayOfWeek = daysOfWeek[dateObj.getDay()];
                    
                    // Determine styling based on data
                    let cellBg = theme === 'dark' ? 'bg-slate-950/60 border border-slate-900/40 text-slate-400' : 'bg-slate-100 border border-slate-200 text-slate-700';

                    if (dayOfWeek === 'Sunday') {
                      cellBg = 'bg-rose-950/20 border border-rose-900/30 text-rose-500/80';
                    } else {
                      const isHolidayDate = holidays.some(h => h.date === dateStr);
                      if (isHolidayDate) {
                        cellBg = 'bg-slate-800 border border-slate-700 text-slate-400';
                      } else {
                        // Gather attendance records
                        const dayLogs = logs.filter(l => l.date === dateStr && l.status !== 'HOLIDAY');
                        const conducted = dayLogs.filter(l => l.status === 'PRESENT' || l.status === 'ABSENT').length;
                        const present = dayLogs.filter(l => l.status === 'PRESENT').length;
                        
                        if (conducted > 0) {
                          const pct = (present / conducted) * 100;
                          if (pct >= 75) {
                            cellBg = 'bg-emerald-950/30 border border-emerald-900/80 text-emerald-400';
                          } else {
                            cellBg = 'bg-rose-950/30 border border-rose-900/80 text-rose-400';
                          }
                        } else {
                          // Not marked yet, but scheduled?
                          const scheduled = TIMETABLE[dayOfWeek] || [];
                          if (scheduled.length > 0) {
                            cellBg = 'bg-amber-950/20 border border-amber-900/40 text-amber-500';
                          }
                        }
                      }
                    }

                    // highlight selected date
                    const isSelected = selectedDateDetail === dateStr;

                    cells.push(
                      <button
                        key={d}
                        onClick={() => setSelectedDateDetail(dateStr)}
                        className={`h-11 rounded-xl text-xs font-bold flex flex-col justify-center items-center transition-all ${cellBg} ${
                          isSelected ? 'ring-2 ring-indigo-500 ring-offset-2 ring-offset-slate-950 scale-105' : 'hover:scale-[1.03]'
                        }`}
                      >
                        {d}
                      </button>
                    );
                  }

                  return cells;
                })()}
              </div>
            </div>

            {/* Date Details Modal/Panel */}
            {selectedDateDetail && (
              <div className={`p-5 rounded-2xl border animate-fadeIn transition-colors ${
                theme === 'dark' ? 'bg-slate-900/40 border-slate-800' : 'bg-white border-slate-200'
              }`}>
                {/* Header */}
                <div className="flex justify-between items-start border-b border-slate-800 pb-3 mb-4">
                  <div>
                    <h4 className="text-sm font-bold text-slate-200">
                      {new Date(selectedDateDetail).toLocaleDateString('en-IN', {
                        day: 'numeric', month: 'long', year: 'numeric', weekday: 'long'
                      })}
                    </h4>
                    <p className="text-[10px] text-slate-400 mt-0.5">Schedule and attendance log</p>
                  </div>
                  
                  {/* Holiday Actions */}
                  {(() => {
                    const d = new Date(selectedDateDetail);
                    const dayName = daysOfWeek[d.getDay()];
                    
                    if (dayName === 'Sunday') {
                      return <span className="bg-rose-950 border border-rose-900 text-rose-400 text-[10px] px-2.5 py-1 rounded-full font-bold">Sunday Holiday</span>;
                    }
                    
                    const isHoliday = holidays.find(h => h.date === selectedDateDetail);
                    if (isHoliday) {
                      return (
                        <div className="flex items-center gap-2">
                          <span className="bg-slate-800 border border-slate-700 text-slate-400 text-[10px] px-2.5 py-1 rounded-full font-bold">
                            Holiday: {isHoliday.reason}
                          </span>
                          <button
                            onClick={() => handleRemoveHoliday(selectedDateDetail)}
                            className="text-rose-400 hover:text-rose-300 p-1 hover:bg-rose-950/20 rounded-lg"
                            title="Remove Holiday"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      );
                    }

                    // Otherwise, provide holiday marking form
                    return (
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          placeholder="Holiday reason..."
                          className="bg-slate-950 border border-slate-800 rounded-lg text-[10px] px-2 py-1 text-slate-300 focus:outline-none w-28"
                          value={holidayReason}
                          onChange={(e) => setHolidayReason(e.target.value)}
                        />
                        <button
                          onClick={() => handleDeclareHoliday(selectedDateDetail)}
                          className="bg-slate-800 hover:bg-slate-700 text-slate-200 text-[10px] font-bold px-2 py-1 rounded-lg border border-slate-700 transition-colors"
                        >
                          Mark Holiday
                        </button>
                      </div>
                    );
                  })()}
                </div>

                {/* Day Timetable & Attendance Status */}
                {(() => {
                  const d = new Date(selectedDateDetail);
                  const dayName = daysOfWeek[d.getDay()];
                  
                  if (dayName === 'Sunday') {
                    return <p className="text-xs text-slate-500 text-center py-4">Sundays have no scheduled classes.</p>;
                  }

                  const isHoliday = holidays.some(h => h.date === selectedDateDetail);
                  if (isHoliday) {
                    return <p className="text-xs text-slate-400 text-center py-4">This day was marked as a holiday. Classes are excluded from calculations.</p>;
                  }

                  const schedule = TIMETABLE[dayName] || [];
                  if (schedule.length === 0) {
                    return <p className="text-xs text-slate-500 text-center py-4">No classes scheduled on this day.</p>;
                  }

                  return (
                    <div className="space-y-3">
                      {schedule.map((sub, idx) => {
                        const periodObj = PERIODS[idx];
                        const curStatus = getPeriodStatus(selectedDateDetail, idx, sub);
                        
                        return (
                          <div key={idx} className="flex justify-between items-center p-3 bg-slate-950/40 rounded-xl border border-slate-900/50">
                            <div>
                              <p className="text-xs font-bold text-slate-200">{sub}</p>
                              <p className="text-[10px] text-slate-500 mt-0.5">Period {idx} • {periodObj.timeStr}</p>
                            </div>

                            <select
                              value={curStatus}
                              onChange={(e) => handleManualMark(selectedDateDetail, idx, sub, e.target.value as any)}
                              className={`text-[10px] font-bold rounded-lg px-2.5 py-1 focus:outline-none border transition-colors ${
                                curStatus === 'PRESENT'
                                  ? 'bg-emerald-950 border-emerald-900 text-emerald-400'
                                  : curStatus === 'ABSENT'
                                  ? 'bg-rose-950 border-rose-900 text-rose-400'
                                  : 'bg-slate-900 border-slate-800 text-slate-400'
                              }`}
                            >
                              <option value="NOT_MARKED">Pending</option>
                              <option value="PRESENT">Present</option>
                              <option value="ABSENT">Absent</option>
                            </select>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
            )}

          </div>
        )}

        {/* ====================================================
            VIEW: PROFILE (SETTINGS)
        ==================================================== */}
        {activeTab === 'profile' && (
          <div className="space-y-6 animate-fadeIn">
            
            {/* 1. Header */}
            <div>
              <h2 className="text-xl font-bold">Profile & Settings</h2>
              <p className="text-xs text-slate-400">Configure your student details and threshold target.</p>
            </div>

            {/* 2. Settings form */}
            <form onSubmit={handleSaveProfile} className={`p-6 rounded-3xl border space-y-4 transition-colors ${
              theme === 'dark' ? 'bg-slate-900/30 border-slate-800/80 shadow-lg' : 'bg-white border-slate-200'
            }`}>
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-[10px] text-slate-400 uppercase tracking-wide font-bold mb-1.5">Student Name</label>
                  <input
                    type="text" required
                    className="w-full bg-slate-950/80 border border-slate-800 focus:border-indigo-500 text-slate-100 rounded-xl px-4 py-2.5 text-xs focus:outline-none transition-colors"
                    value={editName} onChange={(e) => setEditName(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-slate-400 uppercase tracking-wide font-bold mb-1.5">Roll Number</label>
                  <input
                    type="text" required
                    className="w-full bg-slate-950/80 border border-slate-800 focus:border-indigo-500 text-slate-100 rounded-xl px-4 py-2.5 text-xs focus:outline-none transition-colors"
                    value={editRoll} onChange={(e) => setEditRoll(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-slate-400 uppercase tracking-wide font-bold mb-1.5">Room Number</label>
                  <input
                    type="text"
                    className="w-full bg-slate-950/80 border border-slate-800 focus:border-indigo-500 text-slate-100 rounded-xl px-4 py-2.5 text-xs focus:outline-none transition-colors"
                    value={editRoom} onChange={(e) => setEditRoom(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-slate-400 uppercase tracking-wide font-bold mb-1.5">Semester</label>
                  <input
                    type="text"
                    className="w-full bg-slate-950/80 border border-slate-800 focus:border-indigo-500 text-slate-100 rounded-xl px-4 py-2.5 text-xs focus:outline-none transition-colors"
                    value={editSem} onChange={(e) => setEditSem(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-slate-400 uppercase tracking-wide font-bold mb-1.5">Year</label>
                  <input
                    type="text"
                    className="w-full bg-slate-950/80 border border-slate-800 focus:border-indigo-500 text-slate-100 rounded-xl px-4 py-2.5 text-xs focus:outline-none transition-colors"
                    value={editYear} onChange={(e) => setEditYear(e.target.value)}
                  />
                </div>
              </div>

              {/* Target Threshold Range Slider */}
              <div className="pt-2 border-t border-slate-800">
                <div className="flex justify-between items-center mb-1.5">
                  <label className="block text-[10px] text-slate-400 uppercase tracking-wide font-bold">Min Attendance Threshold</label>
                  <span className="text-xs font-extrabold text-indigo-400">{editThreshold}%</span>
                </div>
                <input
                  type="range" min="50" max="95" step="1"
                  className="w-full h-1 bg-slate-850 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                  value={editThreshold} onChange={(e) => setEditThreshold(Number(e.target.value))}
                />
              </div>

              {/* Role Selector dropdown */}
              <div className="pt-2 border-t border-slate-800">
                <label className="block text-[10px] text-slate-400 uppercase tracking-wide font-bold mb-1.5">Account Role (Admin Mode Testing)</label>
                <select
                  value={editRole}
                  onChange={(e) => setEditRole(e.target.value as 'student' | 'admin')}
                  className="w-full bg-slate-950/80 border border-slate-800 focus:border-indigo-500 text-slate-100 rounded-xl px-4 py-2.5 text-xs focus:outline-none transition-colors"
                >
                  <option value="student">Student (AIDS-3 Class)</option>
                  <option value="admin">Admin (Teacher / Department HOD)</option>
                </select>
              </div>

              <button
                type="submit"
                disabled={actionLoading}
                className="w-full bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl py-2.5 text-xs font-bold transition-all shadow-md shadow-indigo-600/10 active:scale-95"
              >
                Save Profile Configuration
              </button>
            </form>

            {/* 3. Holidays List Manager */}
            <div className={`p-6 rounded-3xl border space-y-3 transition-colors ${
              theme === 'dark' ? 'bg-slate-900/30 border-slate-800/80 shadow-lg' : 'bg-white border-slate-200'
            }`}>
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400">Custom Holidays List</h3>
              
              {holidays.length === 0 ? (
                <p className="text-xs text-slate-500 leading-relaxed text-center py-4">No custom holidays marked yet. Click on the Calendar dates to mark holidays.</p>
              ) : (
                <div className="max-h-48 overflow-y-auto pr-1 space-y-2">
                  {holidays.map((h) => (
                    <div key={h.date} className="flex justify-between items-center p-3 bg-slate-950/40 border border-slate-900/60 rounded-xl">
                      <div>
                        <p className="text-xs font-bold text-slate-300">{new Date(h.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                        <p className="text-[10px] text-slate-400 mt-0.5">{h.reason}</p>
                      </div>
                      <button
                        onClick={() => handleRemoveHoliday(h.date)}
                        className="text-rose-400 hover:text-rose-300 p-1 bg-rose-950/10 border border-rose-900/40 rounded-lg transition-colors hover:bg-rose-950/30"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 4. Dangerous Actions / Logout */}
            <div className="grid grid-cols-2 gap-4">
              <button
                onClick={() => {
                  if (confirm('WARNING: Are you sure you want to RESET your database? This will permanently delete all attendance logs and holidays for your account. This action is irreversible.')) {
                    resetDatabase().then((s) => {
                      if (s) alert('Database reset successfully.');
                    });
                  }
                }}
                className="bg-rose-950/20 hover:bg-rose-950/40 text-rose-400 border border-rose-900/50 rounded-xl py-3 text-xs font-bold transition-colors"
              >
                Reset Database
              </button>

              <button
                onClick={logout}
                className="bg-slate-900/60 hover:bg-slate-800 text-slate-300 border border-slate-800 rounded-xl py-3 text-xs font-bold transition-all flex items-center justify-center gap-1.5"
              >
                <LogOut size={14} /> Sign Out
              </button>
            </div>

          </div>
        )}

        {/* ====================================================
            VIEW: ADMIN DASHBOARD
        ==================================================== */}
        {activeTab === 'admin' && user.role === 'admin' && (
          <AdminPanel theme={theme} />
        )}

      </main>

      {/* ----------------------------------------------------
          BOTTOM NAVIGATION BAR (MOBILE APP BAR)
      ---------------------------------------------------- */}
      <nav className={`fixed bottom-0 left-0 right-0 z-40 border-t backdrop-blur-lg px-4 py-2 flex justify-around items-center transition-colors ${
        theme === 'dark' ? 'bg-[#0f172a]/95 border-slate-800/80 shadow-slate-950/40' : 'bg-white/95 border-slate-200 shadow-slate-200'
      }`}>
        {(() => {
          const navItems = [
            { tab: 'home', label: 'Home', icon: Home },
            { tab: 'timetable', label: 'Schedule', icon: Clock },
            { tab: 'attendance', label: 'Subjects', icon: BookOpen },
            { tab: 'calendar', label: 'Calendar', icon: CalendarIcon },
          ];
          if (user && user.role === 'admin') {
            navItems.push({ tab: 'admin', label: 'Admin', icon: Shield });
          }
          navItems.push({ tab: 'profile', label: 'Profile', icon: UserIcon });

          return navItems.map(({ tab, label, icon: Icon }) => (
            <button
              key={tab}
              onClick={() => {
                setActiveTab(tab as any);
                setSelectedDateDetail(null);
              }}
              className={`flex flex-col items-center gap-1.5 py-1 px-3 rounded-xl transition-all duration-300 ${
                activeTab === tab 
                  ? 'text-indigo-400 scale-105' 
                  : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              <Icon size={20} className={activeTab === tab ? 'stroke-[2.5px]' : 'stroke-[1.8px]'} />
              <span className="text-[9px] font-bold uppercase tracking-wider">{label}</span>
            </button>
          ));
        })()}
      </nav>

      {/* ----------------------------------------------------
          MODAL: ATTENDANCE HISTORY LIST
      ---------------------------------------------------- */}
      {showHistoryModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex justify-center items-end sm:items-center p-4">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-t-3xl sm:rounded-3xl p-6 shadow-2xl flex flex-col max-h-[85vh] animate-slideUp">
            
            {/* Header */}
            <div className="flex justify-between items-start border-b border-slate-800 pb-3 mb-4">
              <div>
                <h3 className="text-base font-bold text-slate-200">Attendance History Logs</h3>
                <p className="text-[10px] text-slate-400 mt-0.5">Filter, search, and correct entries</p>
              </div>
              <button 
                onClick={() => setShowHistoryModal(false)}
                className="text-xs uppercase tracking-wider font-bold opacity-60 hover:opacity-100 text-slate-200"
              >
                Close
              </button>
            </div>

            {/* Filter controls */}
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div>
                <label className="block text-[9px] text-slate-400 font-bold uppercase mb-1">Filter Subject</label>
                <select
                  value={historyFilterSubject}
                  onChange={(e) => setHistoryFilterSubject(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg text-[10px] px-2 py-1.5 text-slate-300 focus:outline-none"
                >
                  <option value="ALL">All Subjects</option>
                  {SUBJECTS.map((s) => <option key={s.shortName} value={s.shortName}>{s.shortName}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[9px] text-slate-400 font-bold uppercase mb-1">Filter Status</label>
                <select
                  value={historyFilterStatus}
                  onChange={(e) => setHistoryFilterStatus(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg text-[10px] px-2 py-1.5 text-slate-300 focus:outline-none"
                >
                  <option value="ALL">All Statuses</option>
                  <option value="PRESENT">Present</option>
                  <option value="ABSENT">Absent</option>
                </select>
              </div>
            </div>

            {/* Logs feed */}
            <div className="flex-1 overflow-y-auto space-y-2 pr-1 min-h-[40vh]">
              {(() => {
                const filtered = logs.filter(l => {
                  if (l.status === 'HOLIDAY') return false; // hide holidays from filters
                  if (historyFilterSubject !== 'ALL' && l.subject !== historyFilterSubject) return false;
                  if (historyFilterStatus !== 'ALL' && l.status !== historyFilterStatus) return false;
                  return true;
                });

                if (filtered.length === 0) {
                  return <p className="text-xs text-slate-500 text-center py-8">No records match your filters.</p>;
                }

                return filtered.map((log) => (
                  <div key={log.id} className="p-3 bg-slate-950/40 border border-slate-950 rounded-xl flex justify-between items-center">
                    <div>
                      <p className="text-xs font-bold text-slate-300">{log.subject}</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">
                        {new Date(log.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} • Period {log.period_number} ({log.start_time})
                      </p>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${
                        log.status === 'PRESENT' 
                          ? 'bg-emerald-950 border border-emerald-900 text-emerald-400' 
                          : 'bg-rose-950 border border-rose-900 text-rose-400'
                      }`}>
                        {log.status}
                      </span>

                      <button
                        onClick={() => {
                          const nextStatus = log.status === 'PRESENT' ? 'ABSENT' : 'PRESENT';
                          handleManualMark(log.date, log.period_number, log.subject, nextStatus);
                        }}
                        className="text-[9px] text-indigo-400 hover:text-indigo-300 font-bold hover:underline"
                      >
                        Change
                      </button>
                    </div>
                  </div>
                ));
              })()}
            </div>
            
          </div>
        </div>
      )}

      {/* ----------------------------------------------------
          MODAL: MONTHLY REPORTS & SVG CHARTS
      ---------------------------------------------------- */}
      {showReportModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex justify-center items-end sm:items-center p-4">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-t-3xl sm:rounded-3xl p-6 shadow-2xl flex flex-col max-h-[85vh] animate-slideUp">
            
            {/* Header */}
            <div className="flex justify-between items-start border-b border-slate-800 pb-3 mb-4">
              <div>
                <h3 className="text-base font-bold text-slate-200">Monthly Attendance Report</h3>
                <p className="text-[10px] text-slate-400 mt-0.5">Select month/year to view trends and stats</p>
              </div>
              <button 
                onClick={() => setShowReportModal(false)}
                className="text-xs uppercase tracking-wider font-bold opacity-60 hover:opacity-100 text-slate-200"
              >
                Close
              </button>
            </div>

            {/* Selector */}
            <div className="grid grid-cols-2 gap-3 mb-4">
              <select
                className="bg-slate-950 border border-slate-850 rounded-lg text-[10px] px-2 py-1.5 text-slate-300 focus:outline-none"
                value={reportMonth}
                onChange={(e) => setReportMonth(Number(e.target.value))}
              >
                {['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'].map((m, idx) => (
                  <option key={idx} value={idx}>{m}</option>
                ))}
              </select>

              <select
                className="bg-slate-950 border border-slate-850 rounded-lg text-[10px] px-2 py-1.5 text-slate-300 focus:outline-none"
                value={reportYear}
                onChange={(e) => setReportYear(Number(e.target.value))}
              >
                {[2025, 2026, 2027, 2028].map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>

            {/* Report Content */}
            <div className="flex-1 overflow-y-auto space-y-6 pr-1 min-h-[40vh]">
              {(() => {
                const targetPrefix = `${reportYear}-${String(reportMonth + 1).padStart(2, '0')}`;
                
                // Get logs for selected month
                const monthLogs = logs.filter(l => l.date.startsWith(targetPrefix) && l.status !== 'HOLIDAY');
                
                // Calculate monthly calculations
                let monthPresent = 0;
                let monthAbsent = 0;
                const monthSubStats: Record<string, { present: number; absent: number; code: string }> = {};

                monthLogs.forEach(l => {
                  if (l.status === 'PRESENT') {
                    monthPresent++;
                    if (!monthSubStats[l.subject]) monthSubStats[l.subject] = { present: 0, absent: 0, code: l.subject_code };
                    monthSubStats[l.subject].present++;
                  } else if (l.status === 'ABSENT') {
                    monthAbsent++;
                    if (!monthSubStats[l.subject]) monthSubStats[l.subject] = { present: 0, absent: 0, code: l.subject_code };
                    monthSubStats[l.subject].absent++;
                  }
                });

                const monthConducted = monthPresent + monthAbsent;
                const monthPct = monthConducted > 0 ? (monthPresent / monthConducted) * 100 : 0.00;

                if (monthConducted === 0) {
                  return <p className="text-xs text-slate-500 text-center py-12">No attendance data found for this month.</p>;
                }

                return (
                  <div className="space-y-5">
                    
                    {/* Monthly Percentage Overview */}
                    <div className="p-4 bg-slate-950/40 rounded-2xl border border-slate-950 flex justify-between items-center">
                      <div>
                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Monthly Overall Attendance</p>
                        <p className="text-2xl font-extrabold text-indigo-400 mt-1">{monthPct.toFixed(2)}%</p>
                      </div>
                      <div className="text-right text-[10px] text-slate-400 font-semibold space-y-0.5">
                        <p>Present: <b className="text-slate-200">{monthPresent}</b></p>
                        <p>Absent: <b className="text-slate-200">{monthAbsent}</b></p>
                        <p>Total Conducted: <b className="text-slate-200">{monthConducted}</b></p>
                      </div>
                    </div>

                    {/* Table View */}
                    <div className="overflow-x-auto border border-slate-900 rounded-xl">
                      <table className="w-full text-[10px] text-left text-slate-300">
                        <thead className="bg-slate-950/60 uppercase text-slate-500 font-bold border-b border-slate-900">
                          <tr>
                            <th className="px-3 py-2">Subject</th>
                            <th className="px-3 py-2 text-right">Pres</th>
                            <th className="px-3 py-2 text-right">Abs</th>
                            <th className="px-3 py-2 text-right">Total</th>
                            <th className="px-3 py-2 text-right">Percentage</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-900">
                          {Object.keys(monthSubStats).map((subKey) => {
                            const sub = monthSubStats[subKey];
                            const tot = sub.present + sub.absent;
                            const pct = tot > 0 ? (sub.present / tot) * 100 : 0;
                            return (
                              <tr key={subKey}>
                                <td className="px-3 py-2 font-bold text-slate-200">{subKey}</td>
                                <td className="px-3 py-2 text-right text-emerald-500">{sub.present}</td>
                                <td className="px-3 py-2 text-right text-rose-500">{sub.absent}</td>
                                <td className="px-3 py-2 text-right">{tot}</td>
                                <td className={`px-3 py-2 text-right font-semibold ${pct >= targetThreshold ? 'text-emerald-400' : 'text-rose-400'}`}>
                                  {pct.toFixed(2)}%
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    {/* Custom SVG Line Chart showing Trends of Daily attendance */}
                    <div className="space-y-2">
                      <h4 className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Attendance Distribution</h4>
                      
                      {/* Responsive SVG Bar Chart for Subject percentages */}
                      <div className="bg-slate-950/50 p-4 border border-slate-900 rounded-xl h-44 flex flex-col justify-end">
                        <svg className="w-full h-28" viewBox="0 0 300 100" preserveAspectRatio="none">
                          {/* Draw bars */}
                          {Object.keys(monthSubStats).map((subKey, index, arr) => {
                            const sub = monthSubStats[subKey];
                            const tot = sub.present + sub.absent;
                            const pct = tot > 0 ? (sub.present / tot) * 100 : 0;
                            
                            const barWidth = 16;
                            const spacing = (300 - (arr.length * barWidth)) / (arr.length + 1);
                            const x = spacing + index * (barWidth + spacing);
                            const height = pct; // out of 100
                            const y = 100 - height;

                            return (
                              <g key={subKey}>
                                {/* Bar */}
                                <rect
                                  x={x}
                                  y={y}
                                  width={barWidth}
                                  height={height}
                                  rx="2"
                                  fill={pct >= targetThreshold ? '#10b981' : '#f43f5e'}
                                  opacity="0.85"
                                />
                                {/* Label inside or below */}
                                <text x={x + barWidth / 2} y="98" fill="#94a3b8" fontSize="6" textAnchor="middle" fontWeight="bold">
                                  {subKey}
                                </text>
                                <text x={x + barWidth / 2} y={y - 3} fill="#cbd5e1" fontSize="5.5" textAnchor="middle" fontWeight="semibold">
                                  {Math.round(pct)}%
                                </text>
                              </g>
                            );
                          })}
                        </svg>
                      </div>
                    </div>

                  </div>
                );
              })()}
            </div>

          </div>
        </div>
      )}

    </div>
  );
};

interface StudentWithStats extends User {
  overallPct: number;
  conducted: number;
  present: number;
  absent: number;
}

const AdminPanel: React.FC<{ theme: 'light' | 'dark' }> = ({ theme }) => {
  const { 
    fetchAllStudents, fetchStudentLogs, adminMarkAttendance, 
    globalHolidays, declareGlobalHoliday, removeGlobalHoliday, actionLoading 
  } = useAttendance();

  const [students, setStudents] = useState<StudentWithStats[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [showLowOnly, setShowLowOnly] = useState<boolean>(false);
  const [adminSubTab, setAdminSubTab] = useState<'directory' | 'holidays'>('directory');

  // Selected Student Drilldown State
  const [selectedStudent, setSelectedStudent] = useState<StudentWithStats | null>(null);
  const [studentLogs, setStudentLogs] = useState<AttendanceRecord[]>([]);
  const [studentHolidays, setStudentHolidays] = useState<Holiday[]>([]);
  const [studentStats, setStudentStats] = useState<{
    overall: OverallStats;
    subjects: Record<string, SubjectStats>;
  } | null>(null);
  const [auditLoading, setAuditLoading] = useState<boolean>(false);

  // Global Holiday Form State
  const [globalDate, setGlobalDate] = useState<string>('');
  const [globalReason, setGlobalReason] = useState<string>('');

  const loadDirectoryData = async () => {
    setLoading(true);
    try {
      const studentList = await fetchAllStudents();
      
      // Fetch all attendance logs and holidays to group them in memory
      const [logsSnap, holidaysSnap] = await Promise.all([
        getDocs(collection(db, 'attendance')),
        getDocs(collection(db, 'holidays'))
      ]);

      const logsByUser: Record<string, AttendanceRecord[]> = {};
      logsSnap.forEach((docSnap) => {
        const data = docSnap.data();
        const uid = data.userId;
        if (!logsByUser[uid]) logsByUser[uid] = [];
        logsByUser[uid].push({
          id: docSnap.id,
          user_id: uid,
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

      const holidaysByUser: Record<string, Holiday[]> = {};
      holidaysSnap.forEach((docSnap) => {
        const data = docSnap.data();
        const uid = data.userId;
        if (!holidaysByUser[uid]) holidaysByUser[uid] = [];
        holidaysByUser[uid].push({
          date: data.date,
          reason: data.reason || 'Holiday'
        });
      });

      const updatedStudents: StudentWithStats[] = studentList.map(student => {
        const sLogs = logsByUser[student.id] || [];
        const sHolidays = holidaysByUser[student.id] || [];
        
        const holidayDates = new Set([
          ...sHolidays.map(h => h.date),
          ...globalHolidays.map(g => g.date)
        ]);

        let present = 0;
        let absent = 0;
        sLogs.forEach(log => {
          if (log.status === 'HOLIDAY' || holidayDates.has(log.date)) return;
          if (log.status === 'PRESENT') present++;
          if (log.status === 'ABSENT') absent++;
        });

        const conducted = present + absent;
        const pct = conducted > 0 ? (present / conducted) * 100 : 0.00;

        return {
          ...student,
          overallPct: pct,
          conducted,
          present,
          absent
        };
      });

      setStudents(updatedStudents);
    } catch (err) {
      console.error('Error loading admin directory data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDirectoryData();
  }, [globalHolidays]);

  // Load student detail logs and holidays
  const handleAuditStudent = async (student: StudentWithStats) => {
    setSelectedStudent(student);
    setAuditLoading(true);
    try {
      const logs = await fetchStudentLogs(student.id);
      
      const holidaysSnap = await getDocs(
        query(collection(db, 'holidays'), where('userId', '==', student.id))
      );
      const sHolidays: Holiday[] = [];
      holidaysSnap.forEach((docSnap) => {
        sHolidays.push({
          date: docSnap.data().date,
          reason: docSnap.data().reason || 'Holiday'
        });
      });

      setStudentLogs(logs);
      setStudentHolidays(sHolidays);
      
      // Calculate subject-wise breakdown for auditing
      const holidayDates = new Set([
        ...sHolidays.map(h => h.date),
        ...globalHolidays.map(g => g.date)
      ]);

      let totalPresent = 0;
      let totalAbsent = 0;
      const subjects: Record<string, SubjectStats> = {};

      logs.forEach(log => {
        if (log.status === 'HOLIDAY' || holidayDates.has(log.date)) return;
        if (log.status === 'PRESENT') {
          totalPresent++;
          if (!subjects[log.subject]) subjects[log.subject] = { present: 0, absent: 0, code: log.subject_code };
          subjects[log.subject].present++;
        } else if (log.status === 'ABSENT') {
          totalAbsent++;
          if (!subjects[log.subject]) subjects[log.subject] = { present: 0, absent: 0, code: log.subject_code };
          subjects[log.subject].absent++;
        }
      });

      setStudentStats({
        overall: {
          present: totalPresent,
          absent: totalAbsent,
          conducted: totalPresent + totalAbsent,
          percentage: student.overallPct
        },
        subjects
      });
    } catch (err) {
      console.error('Error auditing student:', err);
    } finally {
      setAuditLoading(false);
    }
  };

  // Re-run audit calculations when logs are modified
  const handleUpdateStudentLog = async (log: AttendanceRecord, newStatus: 'PRESENT' | 'ABSENT' | 'NOT_MARKED') => {
    if (!selectedStudent) return;
    
    // Warn before overrides
    if (newStatus !== 'NOT_MARKED' && log.status !== 'NOT_MARKED' && log.status !== 'HOLIDAY') {
      if (!confirm(`Are you sure you want to change status from ${log.status} to ${newStatus}?`)) {
        return;
      }
    }

    const success = await adminMarkAttendance(selectedStudent.id, {
      date: log.date,
      day: log.day,
      subject: log.subject,
      subject_code: log.subject_code,
      period_number: log.period_number,
      start_time: log.start_time,
      end_time: log.end_time,
      status: newStatus
    });

    if (success) {
      // Reload specific student's details
      const logs = await fetchStudentLogs(selectedStudent.id);
      setStudentLogs(logs);

      // Re-evaluate stats locally
      const holidayDates = new Set([
        ...studentHolidays.map(h => h.date),
        ...globalHolidays.map(g => g.date)
      ]);

      let totalPresent = 0;
      let totalAbsent = 0;
      const subjects: Record<string, SubjectStats> = {};

      logs.forEach(l => {
        if (l.status === 'HOLIDAY' || holidayDates.has(l.date)) return;
        if (l.status === 'PRESENT') {
          totalPresent++;
          if (!subjects[l.subject]) subjects[l.subject] = { present: 0, absent: 0, code: l.subject_code };
          subjects[l.subject].present++;
        } else if (l.status === 'ABSENT') {
          totalAbsent++;
          if (!subjects[l.subject]) subjects[l.subject] = { present: 0, absent: 0, code: l.subject_code };
          subjects[l.subject].absent++;
        }
      });

      const conducted = totalPresent + totalAbsent;
      const pct = conducted > 0 ? (totalPresent / conducted) * 100 : 0.00;

      setStudentStats({
        overall: { present: totalPresent, absent: totalAbsent, conducted, percentage: pct },
        subjects
      });

      // Update student overallPct in the main list
      setStudents(prev => prev.map(s => s.id === selectedStudent.id ? { ...s, overallPct: pct, conducted, present: totalPresent, absent: totalAbsent } : s));
    }
  };

  const handleDeclareGlobalHoliday = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!globalDate || !globalReason.trim()) {
      alert('Please provide both date and holiday reason.');
      return;
    }
    const success = await declareGlobalHoliday(globalDate, globalReason);
    if (success) {
      setGlobalDate('');
      setGlobalReason('');
      alert('Global holiday declared successfully for all students.');
    }
  };

  const handleRemoveGlobalHoliday = async (date: string) => {
    if (confirm(`Remove global holiday status for ${date}?`)) {
      await removeGlobalHoliday(date);
    }
  };

  // Directory Filters
  const filteredStudents = students.filter(s => {
    const matchesSearch = s.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          s.roll_number.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesLow = showLowOnly ? s.overallPct < s.min_attendance_pct : true;
    return matchesSearch && matchesLow;
  });

  // Global Analytics Summary
  const classAvg = students.length > 0 
    ? Math.round((students.reduce((acc, s) => acc + s.overallPct, 0) / students.length) * 100) / 100 
    : 0.00;
  const lowAttendanceCount = students.filter(s => s.overallPct < s.min_attendance_pct).length;

  return (
    <div className="space-y-6 animate-fadeIn pb-8">
      {/* 1. Page Header */}
      <div>
        <h2 className="text-xl font-bold flex items-center gap-2">
          <Shield className="text-indigo-400" size={22} />
          Class Administration
        </h2>
        <p className="text-xs text-slate-400">Class: AIDS-3 | Semester: 1 | Year: III (2026)</p>
      </div>

      {/* 2. Top Analytics summary widgets */}
      <div className="grid grid-cols-3 gap-3">
        <div className={`p-4 rounded-2xl border text-center transition-colors ${
          theme === 'dark' ? 'bg-slate-900/30 border-slate-800/80 shadow-md' : 'bg-white border-slate-200 shadow-sm'
        }`}>
          <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">Students</span>
          <span className="text-xl font-extrabold text-slate-200 block mt-1">{students.length}</span>
        </div>
        <div className={`p-4 rounded-2xl border text-center transition-colors ${
          theme === 'dark' ? 'bg-slate-900/30 border-slate-800/80 shadow-md' : 'bg-white border-slate-200 shadow-sm'
        }`}>
          <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">Class Average</span>
          <span className="text-xl font-extrabold text-indigo-400 block mt-1">{classAvg.toFixed(1)}%</span>
        </div>
        <div className={`p-4 rounded-2xl border text-center transition-colors ${
          theme === 'dark' ? 'bg-slate-900/30 border-slate-800/80 shadow-md' : 'bg-white border-slate-200 shadow-sm'
        }`}>
          <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">Below 75%</span>
          <span className="text-xl font-extrabold text-rose-500 block mt-1">{lowAttendanceCount}</span>
        </div>
      </div>

      {/* 3. Sub-Navigation Tabs */}
      <div className="flex border-b border-slate-800 gap-4 pb-1">
        <button
          onClick={() => setAdminSubTab('directory')}
          className={`text-xs font-bold uppercase pb-2 px-1 border-b-2 transition-all ${
            adminSubTab === 'directory'
              ? 'border-indigo-500 text-indigo-400'
              : 'border-transparent text-slate-500 hover:text-slate-300'
          }`}
        >
          Student Directory
        </button>
        <button
          onClick={() => setAdminSubTab('holidays')}
          className={`text-xs font-bold uppercase pb-2 px-1 border-b-2 transition-all ${
            adminSubTab === 'holidays'
              ? 'border-indigo-500 text-indigo-400'
              : 'border-transparent text-slate-500 hover:text-slate-300'
          }`}
        >
          Global Holidays ({globalHolidays.length})
        </button>
      </div>

      {/* 4. Tab Content: Directory */}
      {adminSubTab === 'directory' && (
        <div className="space-y-4">
          {/* Search bar and Filters */}
          <div className="flex flex-col gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-3 text-slate-500" size={16} />
              <input
                type="text"
                placeholder="Search by name or roll number..."
                className="w-full bg-slate-950/80 border border-slate-800 focus:border-indigo-500 text-slate-100 rounded-xl pl-9 pr-4 py-2.5 text-xs focus:outline-none transition-colors"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            
            <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer select-none">
              <input
                type="checkbox"
                className="rounded border-slate-850 bg-slate-950 text-indigo-600 focus:ring-indigo-500 focus:ring-offset-slate-950"
                checked={showLowOnly}
                onChange={(e) => setShowLowOnly(e.target.checked)}
              />
              Show low attendance only (&lt; 75%)
            </label>
          </div>

          {/* Directory List */}
          {loading ? (
            <div className="text-center py-12 text-slate-500 text-xs">
              <div className="w-6 h-6 border-2 border-t-indigo-500 border-slate-800 animate-spin rounded-full mx-auto mb-2"></div>
              Loading directory data...
            </div>
          ) : filteredStudents.length === 0 ? (
            <p className="text-xs text-slate-500 text-center py-12">No student records found matching filters.</p>
          ) : (
            <div className="space-y-3">
              {filteredStudents.map((student) => {
                const isBelow = student.overallPct < student.min_attendance_pct;
                return (
                  <div 
                    key={student.id} 
                    className={`p-4 rounded-2xl border transition-colors flex items-center justify-between ${
                      theme === 'dark' ? 'bg-slate-900/20 border-slate-800/80 hover:border-slate-700' : 'bg-white border-slate-200'
                    }`}
                  >
                    <div>
                      <h4 className="text-sm font-bold text-slate-200">{student.name}</h4>
                      <p className="text-[10px] text-slate-400 mt-0.5">{student.roll_number}</p>
                    </div>

                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <span className={`text-sm font-black ${
                          isBelow ? 'text-rose-500' : 'text-emerald-500'
                        }`}>
                          {student.overallPct.toFixed(1)}%
                        </span>
                        <p className="text-[8px] text-slate-500 font-bold uppercase mt-0.5">
                          {student.conducted} classes
                        </p>
                      </div>
                      <button
                        onClick={() => handleAuditStudent(student)}
                        className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold px-3 py-1.5 rounded-xl text-[10px] transition-colors shadow-md shadow-indigo-600/10 active:scale-95"
                      >
                        Audit
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Tab Content: Global Holidays */}
      {adminSubTab === 'holidays' && (
        <div className="space-y-5">
          {/* Declare Holiday form */}
          <form onSubmit={handleDeclareGlobalHoliday} className={`p-5 rounded-2xl border space-y-4 transition-colors ${
            theme === 'dark' ? 'bg-slate-900/30 border-slate-800/80 shadow-md' : 'bg-white border-slate-200'
          }`}>
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300">Declare Global College Holiday</h4>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[9px] text-slate-500 font-bold uppercase mb-1">Select Date</label>
                <input
                  type="date"
                  className="w-full bg-slate-950 border border-slate-850 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
                  value={globalDate}
                  onChange={(e) => setGlobalDate(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-[9px] text-slate-500 font-bold uppercase mb-1">Reason</label>
                <input
                  type="text"
                  placeholder="e.g. Independence Day"
                  className="w-full bg-slate-950 border border-slate-850 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
                  value={globalReason}
                  onChange={(e) => setGlobalReason(e.target.value)}
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={actionLoading}
              className="w-full bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl py-2 text-xs font-bold transition-all disabled:opacity-50 active:scale-95"
            >
              Declare Global Holiday
            </button>
          </form>

          {/* List of Global Holidays */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">Declared Holidays List</h4>
            {globalHolidays.length === 0 ? (
              <p className="text-xs text-slate-500 text-center py-8">No global holidays declared yet.</p>
            ) : (
              <div className="space-y-2">
                {globalHolidays.map((holiday) => (
                  <div key={holiday.date} className="flex justify-between items-center p-3.5 bg-slate-950/40 border border-slate-900 rounded-xl">
                    <div>
                      <p className="text-xs font-bold text-slate-300">
                        {new Date(holiday.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </p>
                      <p className="text-[10px] text-slate-500 mt-0.5">{holiday.reason}</p>
                    </div>
                    <button
                      onClick={() => handleRemoveGlobalHoliday(holiday.date)}
                      className="text-rose-400 hover:text-rose-300 p-1.5 bg-rose-950/15 border border-rose-900/40 rounded-lg hover:bg-rose-950/30 transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 5. INDIVIDUAL STUDENT DETAIL AUDITOR MODAL */}
      {selectedStudent && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex justify-center items-end sm:items-center p-4">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-t-3xl sm:rounded-3xl p-6 shadow-2xl flex flex-col max-h-[85vh] animate-slideUp">
            
            {/* Header */}
            <div className="flex justify-between items-start border-b border-slate-800 pb-3 mb-4">
              <div>
                <h3 className="text-base font-bold text-slate-200">Student Attendance Audit</h3>
                <p className="text-[10px] text-slate-400 mt-0.5">{selectedStudent.name} • {selectedStudent.roll_number}</p>
              </div>
              <button
                onClick={() => setSelectedStudent(null)}
                className="text-xs uppercase tracking-wider font-bold opacity-60 hover:opacity-100 text-slate-200"
              >
                Close
              </button>
            </div>

            {auditLoading ? (
              <div className="text-center py-20 text-slate-500 text-xs">
                <div className="w-6 h-6 border-2 border-t-indigo-500 border-slate-800 animate-spin rounded-full mx-auto mb-2"></div>
                Loading student records...
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto space-y-6 pr-1 min-h-[45vh]">
                
                {/* Stats Summary */}
                {studentStats && (
                  <div className="p-4 bg-slate-950/40 border border-slate-950 rounded-2xl flex justify-between items-center text-xs">
                    <div>
                      <span className="text-[10px] text-slate-400 font-bold block uppercase tracking-wider">Overall Average</span>
                      <span className={`text-xl font-black block mt-1 ${
                        studentStats.overall.percentage < selectedStudent.min_attendance_pct ? 'text-rose-500' : 'text-emerald-500'
                      }`}>
                        {studentStats.overall.percentage.toFixed(1)}%
                      </span>
                    </div>
                    <div className="text-right text-[10px] text-slate-400 font-semibold space-y-0.5">
                      <p>Present: <b className="text-slate-200">{studentStats.overall.present}</b></p>
                      <p>Absent: <b className="text-slate-200">{studentStats.overall.absent}</b></p>
                      <p>Conducted: <b className="text-slate-200">{studentStats.overall.conducted}</b></p>
                    </div>
                  </div>
                )}

                {/* Subject breakdown */}
                {studentStats && (
                  <div className="space-y-3">
                    <h4 className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Subject Summary</h4>
                    <div className="grid grid-cols-2 gap-2.5">
                      {SUBJECTS.map((sub) => {
                        const subStat = studentStats.subjects[sub.shortName] || { present: 0, absent: 0 };
                        const total = subStat.present + subStat.absent;
                        const pct = total > 0 ? (subStat.present / total) * 100 : 0;
                        const isLow = total > 0 && pct < selectedStudent.min_attendance_pct;

                        return (
                          <div key={sub.shortName} className="p-3 bg-slate-950/30 border border-slate-950 rounded-xl space-y-1.5">
                            <div className="flex justify-between items-center text-[10px]">
                              <span className="font-bold text-slate-300">{sub.shortName}</span>
                              <span className={isLow ? 'text-rose-400 font-bold' : total > 0 ? 'text-emerald-400 font-bold' : 'text-slate-500 font-bold'}>
                                {total > 0 ? `${Math.round(pct)}%` : '—'}
                              </span>
                            </div>
                            <div className="w-full bg-slate-950 h-1.5 rounded-full overflow-hidden border border-slate-900">
                              <div 
                                className={`h-full rounded-full ${isLow ? 'bg-rose-500' : 'bg-emerald-500'}`}
                                style={{ width: `${total > 0 ? Math.min(pct, 100) : 0}%` }}
                              ></div>
                            </div>
                            <span className="text-[8px] text-slate-500 font-bold block">
                              Pres: {subStat.present} / Abs: {subStat.absent}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Detailed Logs Feed & Editor */}
                <div className="space-y-3">
                  <h4 className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Marked Logs List</h4>
                  {studentLogs.length === 0 ? (
                    <p className="text-xs text-slate-500 text-center py-6">No marked logs registered for this student.</p>
                  ) : (
                    <div className="space-y-2">
                      {studentLogs.map((log) => {
                        if (log.status === 'HOLIDAY') return null; // skip holidays
                        return (
                          <div key={log.id} className="p-3.5 bg-slate-950/40 border border-slate-950 rounded-xl flex justify-between items-center">
                            <div>
                              <p className="text-xs font-bold text-slate-200">{log.subject}</p>
                              <p className="text-[9px] text-slate-400 mt-0.5">
                                {new Date(log.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} • Period {log.period_number} ({log.start_time})
                              </p>
                            </div>
                            <select
                              value={log.status}
                              onChange={(e) => handleUpdateStudentLog(log, e.target.value as any)}
                              className={`text-[9px] font-bold rounded-lg px-2.5 py-1 focus:outline-none border transition-colors cursor-pointer ${
                                log.status === 'PRESENT'
                                  ? 'bg-emerald-950/60 border-emerald-900 text-emerald-400'
                                  : log.status === 'ABSENT'
                                  ? 'bg-rose-950/60 border-rose-900 text-rose-400'
                                  : 'bg-slate-900 border-slate-800 text-slate-400'
                              }`}
                            >
                              <option value="PRESENT">Present</option>
                              <option value="ABSENT">Absent</option>
                              <option value="NOT_MARKED">Delete (Pending)</option>
                            </select>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// Top-level Application Shell containing providers
const App: React.FC = () => {
  return (
    <AuthProvider>
      <AttendanceProvider>
        <AppContent />
      </AttendanceProvider>
    </AuthProvider>
  );
};

export default App;
