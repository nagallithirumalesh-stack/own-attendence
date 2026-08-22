import React, { createContext, useState, useEffect, useContext } from 'react';

export interface User {
  id: number;
  email: string;
  name: string;
  roll_number: string;
  department: string;
  class: string;
  semester: string;
  year: string;
  room_number: string;
  min_attendance_pct: number;
}

interface AuthContextType {
  token: string | null;
  user: User | null;
  loading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<boolean>;
  register: (email: string, password: string, name: string, roll_number: string) => Promise<boolean>;
  logout: () => void;
  updateProfile: (updatedData: Partial<User>) => Promise<boolean>;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const API_BASE = 'http://localhost:5000/api';

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [token, setToken] = useState<string | null>(localStorage.getItem('auth_token'));
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadProfile = async () => {
      if (!token) {
        setLoading(false);
        return;
      }

      try {
        const res = await fetch(`${API_BASE}/auth/profile`, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        
        if (res.ok) {
          const userData = await res.json();
          setUser(userData);
        } else {
          // Token expired or invalid
          logout();
        }
      } catch (err) {
        console.error('Failed to load profile:', err);
        // Do not logout on network error so they can work offline if needed,
        // but set error status.
        setError('Could not connect to backend server.');
      } finally {
        setLoading(false);
      }
    };

    loadProfile();
  }, [token]);

  const login = async (email: string, password: string): Promise<boolean> => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });

      const data = await res.json();

      if (res.ok) {
        localStorage.setItem('auth_token', data.token);
        setToken(data.token);
        setUser(data.user);
        setLoading(false);
        return true;
      } else {
        setError(data.error || 'Login failed.');
        setLoading(false);
        return false;
      }
    } catch (err) {
      setError('Connection failed. Please make sure backend is running.');
      setLoading(false);
      return false;
    }
  };

  const register = async (
    email: string,
    password: string,
    name: string,
    roll_number: string
  ): Promise<boolean> => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, name, roll_number })
      });

      const data = await res.json();

      if (res.ok) {
        localStorage.setItem('auth_token', data.token);
        setToken(data.token);
        setUser(data.user);
        setLoading(false);
        return true;
      } else {
        setError(data.error || 'Registration failed.');
        setLoading(false);
        return false;
      }
    } catch (err) {
      setError('Connection failed. Please make sure backend is running.');
      setLoading(false);
      return false;
    }
  };

  const logout = () => {
    localStorage.removeItem('auth_token');
    setToken(null);
    setUser(null);
    setError(null);
  };

  const updateProfile = async (updatedData: Partial<User>): Promise<boolean> => {
    if (!token || !user) return false;
    setError(null);
    
    // Optimistic UI updates
    const backupUser = { ...user };
    const mergedUser = { ...user, ...updatedData } as User;
    setUser(mergedUser);

    try {
      const res = await fetch(`${API_BASE}/auth/profile`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(mergedUser)
      });

      if (res.ok) {
        const data = await res.json();
        setUser(data.user);
        return true;
      } else {
        const data = await res.json();
        setError(data.error || 'Failed to update profile.');
        setUser(backupUser); // rollback
        return false;
      }
    } catch (err) {
      setError('Failed to sync profile with server.');
      setUser(backupUser); // rollback
      return false;
    }
  };

  const clearError = () => setError(null);

  return (
    <AuthContext.Provider value={{
      token,
      user,
      loading,
      error,
      login,
      register,
      logout,
      updateProfile,
      clearError
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
