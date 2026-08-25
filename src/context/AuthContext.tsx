import React, { createContext, useState, useEffect, useContext } from 'react';
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged 
} from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { auth, db } from '../utils/firebase';

export interface User {
  id: string; // Firebase Auth UID
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

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setLoading(true);
      if (firebaseUser) {
        try {
          const userDocRef = doc(db, 'users', firebaseUser.uid);
          const userDoc = await getDoc(userDocRef);
          
          if (userDoc.exists()) {
            const data = userDoc.data();
            setUser({
              id: firebaseUser.uid,
              email: firebaseUser.email || '',
              name: data.name || '',
              roll_number: data.roll_number || '',
              department: data.department || 'Artificial Intelligence and Data Science',
              class: data.class || 'AIDS-3',
              semester: data.semester || '1',
              year: data.year || 'III',
              room_number: data.room_number || 'B404',
              min_attendance_pct: data.min_attendance_pct || 75
            });
            setToken('firebase-session-active');
          } else {
            // User doc might be in creation process during register()
          }
        } catch (err) {
          console.error('Error fetching user profile:', err);
          setError('Failed to fetch user profile.');
        }
      } else {
        setUser(null);
        setToken(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const login = async (email: string, password: string): Promise<boolean> => {
    setLoading(true);
    setError(null);
    try {
      await signInWithEmailAndPassword(auth, email, password);
      setLoading(false);
      return true;
    } catch (err: any) {
      console.error('Login error:', err);
      let errMsg = 'Login failed. Please check your credentials.';
      if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        errMsg = 'Invalid email or password.';
      } else if (err.code === 'auth/invalid-email') {
        errMsg = 'Invalid email address format.';
      }
      setError(errMsg);
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
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const firebaseUser = userCredential.user;
      
      const defaultProfile = {
        name,
        roll_number,
        department: 'Artificial Intelligence and Data Science',
        class: 'AIDS-3',
        semester: '1',
        year: 'III',
        room_number: 'B404',
        min_attendance_pct: 75
      };

      // Save user profile in Firestore
      await setDoc(doc(db, 'users', firebaseUser.uid), defaultProfile);
      
      // Update local state immediately
      setUser({
        id: firebaseUser.uid,
        email,
        ...defaultProfile
      });
      setToken('firebase-session-active');
      setLoading(false);
      return true;
    } catch (err: any) {
      console.error('Registration error:', err);
      let errMsg = 'Registration failed.';
      if (err.code === 'auth/email-already-in-use') {
        errMsg = 'Email already registered.';
      } else if (err.code === 'auth/weak-password') {
        errMsg = 'Password is too weak. Must be at least 6 characters.';
      } else if (err.code === 'auth/invalid-email') {
        errMsg = 'Invalid email address format.';
      }
      setError(errMsg);
      setLoading(false);
      return false;
    }
  };

  const logout = async () => {
    try {
      await signOut(auth);
      setUser(null);
      setToken(null);
      setError(null);
    } catch (err) {
      console.error('Sign out error:', err);
    }
  };

  const updateProfile = async (updatedData: Partial<User>): Promise<boolean> => {
    if (!user) return false;
    setError(null);
    
    const backupUser = { ...user };
    const mergedUser = { ...user, ...updatedData } as User;
    setUser(mergedUser);

    try {
      const userDocRef = doc(db, 'users', user.id);
      
      // Filter out id and email from the updated document fields
      const { id, email, ...docData } = updatedData;
      
      await updateDoc(userDocRef, docData);
      return true;
    } catch (err) {
      console.error('Update profile error:', err);
      setError('Failed to update profile.');
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
