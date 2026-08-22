import express from 'express';
import cors from 'cors';
import sqlite3 from 'sqlite3';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const JWT_SECRET = process.env.JWT_SECRET || 'aids3-attendance-secret-key-987';
const PORT = process.env.PORT || 5000;

const app = express();
app.use(cors());
app.use(express.json());

// Initialize Database
const dbPath = path.join(__dirname, 'attendance.db');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database:', err.message);
  } else {
    console.log('Connected to SQLite database at:', dbPath);
    initializeTables();
  }
});

function initializeTables() {
  db.serialize(() => {
    // 1. Users table
    db.run(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        name TEXT NOT NULL,
        roll_number TEXT NOT NULL,
        department TEXT DEFAULT 'Artificial Intelligence and Data Science',
        class TEXT DEFAULT 'AIDS-3',
        semester TEXT DEFAULT '1',
        year TEXT DEFAULT 'III',
        room_number TEXT DEFAULT 'B404',
        min_attendance_pct REAL DEFAULT 75.0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 2. Attendance table
    db.run(`
      CREATE TABLE IF NOT EXISTS attendance (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        date TEXT NOT NULL,
        day TEXT NOT NULL,
        subject TEXT NOT NULL,
        subject_code TEXT NOT NULL,
        period_number INTEGER NOT NULL,
        start_time TEXT NOT NULL,
        end_time TEXT NOT NULL,
        status TEXT CHECK(status IN ('PRESENT', 'ABSENT', 'NOT_MARKED', 'HOLIDAY')) DEFAULT 'NOT_MARKED',
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id),
        UNIQUE(user_id, date, period_number, subject)
      )
    `);

    // 3. Holidays table
    db.run(`
      CREATE TABLE IF NOT EXISTS holidays (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        date TEXT NOT NULL,
        reason TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id),
        UNIQUE(user_id, date)
      )
    `);
  });
}

// Helpers
function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

// Authentication Middleware
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ error: 'Access token required.' });
  }

  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token.' });
    }
    req.userId = decoded.userId;
    next();
  });
}

// ----------------------------------------------------
// AUTHENTICATION ROUTES
// ----------------------------------------------------

app.post('/api/auth/register', (req, res) => {
  const { email, password, name, roll_number } = req.body;
  if (!email || !password || !name || !roll_number) {
    return res.status(400).json({ error: 'All fields are required.' });
  }

  const hashedPassword = hashPassword(password);
  const query = `
    INSERT INTO users (email, password, name, roll_number)
    VALUES (?, ?, ?, ?)
  `;

  db.run(query, [email, hashedPassword, name, roll_number], function (err) {
    if (err) {
      if (err.message.includes('UNIQUE constraint failed')) {
        return res.status(400).json({ error: 'Email already registered.' });
      }
      return res.status(500).json({ error: 'Database error occurred.' });
    }

    const userId = this.lastID;
    const token = jwt.sign({ userId }, JWT_SECRET, { expiresIn: '30d' });

    res.status(201).json({
      token,
      user: {
        id: userId,
        email,
        name,
        roll_number,
        department: 'Artificial Intelligence and Data Science',
        class: 'AIDS-3',
        semester: '1',
        year: 'III',
        room_number: 'B404',
        min_attendance_pct: 75.0
      }
    });
  });
});

app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password required.' });
  }

  const query = `SELECT * FROM users WHERE email = ?`;
  db.get(query, [email], (err, user) => {
    if (err) {
      return res.status(500).json({ error: 'Database error occurred.' });
    }
    if (!user || user.password !== hashPassword(password)) {
      return res.status(400).json({ error: 'Invalid email or password.' });
    }

    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '30d' });
    const { password: _, ...userWithoutPassword } = user;
    
    res.json({
      token,
      user: userWithoutPassword
    });
  });
});

app.get('/api/auth/profile', authenticateToken, (req, res) => {
  const query = `SELECT id, email, name, roll_number, department, class, semester, year, room_number, min_attendance_pct FROM users WHERE id = ?`;
  db.get(query, [req.userId], (err, user) => {
    if (err || !user) {
      return res.status(404).json({ error: 'User not found.' });
    }
    res.json(user);
  });
});

app.put('/api/auth/profile', authenticateToken, (req, res) => {
  const { name, roll_number, department, class: userClass, semester, year, room_number, min_attendance_pct } = req.body;
  
  if (!name || !roll_number) {
    return res.status(400).json({ error: 'Name and Roll Number are required.' });
  }

  const query = `
    UPDATE users 
    SET name = ?, roll_number = ?, department = ?, class = ?, semester = ?, year = ?, room_number = ?, min_attendance_pct = ?
    WHERE id = ?
  `;

  db.run(query, [
    name, roll_number, department, userClass, semester, year, room_number, min_attendance_pct, req.userId
  ], (err) => {
    if (err) {
      return res.status(500).json({ error: 'Failed to update profile.' });
    }
    
    res.json({
      message: 'Profile updated successfully.',
      user: {
        id: req.userId,
        name, roll_number, department, class: userClass, semester, year, room_number, min_attendance_pct
      }
    });
  });
});

// ----------------------------------------------------
// HOLIDAY ROUTES
// ----------------------------------------------------

app.get('/api/holidays', authenticateToken, (req, res) => {
  db.all(`SELECT date, reason FROM holidays WHERE user_id = ? ORDER BY date DESC`, [req.userId], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: 'Failed to fetch holidays.' });
    }
    res.json(rows);
  });
});

app.post('/api/holidays', authenticateToken, (req, res) => {
  const { date, reason } = req.body;
  if (!date) {
    return res.status(400).json({ error: 'Date is required.' });
  }

  db.serialize(() => {
    // Insert into holidays table
    db.run(
      `INSERT OR REPLACE INTO holidays (user_id, date, reason) VALUES (?, ?, ?)`,
      [req.userId, date, reason || 'Holiday'],
      (err) => {
        if (err) {
          return res.status(500).json({ error: 'Failed to save holiday.' });
        }
      }
    );

    // Update existing attendance records on this date to HOLIDAY status
    db.run(
      `UPDATE attendance SET status = 'HOLIDAY' WHERE user_id = ? AND date = ?`,
      [req.userId, date],
      (err) => {
        if (err) {
          console.error('Error updating holiday attendance logs:', err.message);
        }
        res.status(201).json({ message: 'Holiday marked successfully.', date, reason });
      }
    );
  });
});

app.delete('/api/holidays/:date', authenticateToken, (req, res) => {
  const { date } = req.params;
  if (!date) {
    return res.status(400).json({ error: 'Date parameter is required.' });
  }

  db.serialize(() => {
    // Delete from holidays table
    db.run(
      `DELETE FROM holidays WHERE user_id = ? AND date = ?`,
      [req.userId, date],
      (err) => {
        if (err) {
          return res.status(500).json({ error: 'Failed to remove holiday.' });
        }
      }
    );

    // Remove or reset attendance records on this date to NOT_MARKED (or delete them so they revert dynamically)
    db.run(
      `DELETE FROM attendance WHERE user_id = ? AND date = ? AND status = 'HOLIDAY'`,
      [req.userId, date],
      (err) => {
        if (err) {
          console.error('Error removing holiday attendance logs:', err.message);
        }
        res.json({ message: 'Holiday removed successfully.', date });
      }
    );
  });
});

// ----------------------------------------------------
// ATTENDANCE ROUTES
// ----------------------------------------------------

app.get('/api/attendance', authenticateToken, (req, res) => {
  const { date, subject, status } = req.query;
  let query = `SELECT * FROM attendance WHERE user_id = ?`;
  const params = [req.userId];

  if (date) {
    query += ` AND date = ?`;
    params.push(date);
  }
  if (subject) {
    query += ` AND subject = ?`;
    params.push(subject);
  }
  if (status) {
    query += ` AND status = ?`;
    params.push(status);
  }

  query += ` ORDER BY date DESC, period_number ASC`;

  db.all(query, params, (err, rows) => {
    if (err) {
      return res.status(500).json({ error: 'Failed to fetch attendance.' });
    }
    res.json(rows);
  });
});

app.post('/api/attendance/mark', authenticateToken, (req, res) => {
  const { date, day, subject, subject_code, period_number, start_time, end_time, status } = req.body;
  
  if (!date || !day || !subject || !subject_code || period_number === undefined || !start_time || !end_time || !status) {
    return res.status(400).json({ error: 'Missing required attendance fields.' });
  }

  // Check if date is a holiday
  db.get(`SELECT date FROM holidays WHERE user_id = ? AND date = ?`, [req.userId, date], (err, holiday) => {
    if (err) {
      return res.status(500).json({ error: 'Database check failed.' });
    }
    
    // If it's a holiday, we override status to HOLIDAY or reject
    const targetStatus = holiday ? 'HOLIDAY' : status;

    const query = `
      INSERT INTO attendance (user_id, date, day, subject, subject_code, period_number, start_time, end_time, status, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(user_id, date, period_number, subject) DO UPDATE SET
        status = excluded.status,
        updated_at = CURRENT_TIMESTAMP
    `;

    db.run(query, [
      req.userId, date, day, subject, subject_code, period_number, start_time, end_time, targetStatus
    ], (err) => {
      if (err) {
        console.error('Database write error:', err.message);
        return res.status(500).json({ error: 'Attendance could not be saved. Please try again.' });
      }
      res.json({
        message: 'Attendance saved successfully.',
        record: { date, period_number, subject, status: targetStatus }
      });
    });
  });
});

app.get('/api/attendance/stats', authenticateToken, (req, res) => {
  // Fetch holidays and attendance logs for the user to perform all calculations in one pass
  db.all(`SELECT date FROM holidays WHERE user_id = ?`, [req.userId], (err, holidays) => {
    if (err) return res.status(500).json({ error: 'Failed to read holidays.' });
    const holidayDates = new Set(holidays.map(h => h.date));

    db.all(`SELECT * FROM attendance WHERE user_id = ?`, [req.userId], (err, logs) => {
      if (err) return res.status(500).json({ error: 'Failed to read attendance logs.' });

      // Calculate stats
      let totalPresent = 0;
      let totalAbsent = 0;

      // Subject-wise mappings
      const subjectStats = {};
      const monthlyStats = {};

      logs.forEach(log => {
        // Exclude holidays
        if (log.status === 'HOLIDAY' || holidayDates.has(log.date)) {
          return;
        }

        if (log.status === 'PRESENT') {
          totalPresent++;
          
          // Subject-wise
          if (!subjectStats[log.subject]) {
            subjectStats[log.subject] = { present: 0, absent: 0, code: log.subject_code };
          }
          subjectStats[log.subject].present++;

          // Monthly
          const monthKey = log.date.substring(0, 7); // YYYY-MM
          if (!monthlyStats[monthKey]) {
            monthlyStats[monthKey] = { present: 0, absent: 0 };
          }
          monthlyStats[monthKey].present++;
        } 
        
        else if (log.status === 'ABSENT') {
          totalAbsent++;

          // Subject-wise
          if (!subjectStats[log.subject]) {
            subjectStats[log.subject] = { present: 0, absent: 0, code: log.subject_code };
          }
          subjectStats[log.subject].absent++;

          // Monthly
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

      res.json({
        overall: {
          present: totalPresent,
          absent: totalAbsent,
          conducted: totalConducted,
          percentage: overallPercentage
        },
        subjects: subjectStats,
        monthly: monthlyStats
      });
    });
  });
});

app.post('/api/attendance/reset', authenticateToken, (req, res) => {
  db.serialize(() => {
    db.run(`DELETE FROM attendance WHERE user_id = ?`, [req.userId]);
    db.run(`DELETE FROM holidays WHERE user_id = ?`, [req.userId], (err) => {
      if (err) {
        return res.status(500).json({ error: 'Failed to reset database.' });
      }
      res.json({ message: 'Database reset successfully for current user.' });
    });
  });
});

// Start Server
app.listen(PORT, () => {
  console.log(`Express server running on http://localhost:${PORT}`);
});
