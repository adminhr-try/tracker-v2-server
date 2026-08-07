require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const connectDB = require('./config/db');

const authRoutes = require('./routes/auth');
const attendanceRoutes = require('./routes/attendance');
const leaveRoutes = require('./routes/leave');
const holidayRoutes = require('./routes/holiday');
const departmentRoutes = require('./routes/department');
const directoryRoutes = require('./routes/directory');
const announcementRoutes = require('./routes/announcement');
const todoRoutes = require('./routes/todo');

const app = express();
app.use(cors());
app.use(express.json({ limit: '3mb' })); // base64 photo uploads need more than the 100kb default

connectDB();

app.use('/api/auth', authRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/leave', leaveRoutes);
app.use('/api/holidays', holidayRoutes);
app.use('/api/departments', departmentRoutes);
app.use('/api/directory', directoryRoutes);
app.use('/api/announcements', announcementRoutes);
app.use('/api/todos', todoRoutes);

// Serve the built frontend (Vite React app) from the same server, so the
// whole app runs from one URL (http://localhost:5000) instead of a separate
// dev server. `npm run build` in frontend/ outputs static assets to
// frontend/dist — that's what gets served, not the frontend source.
//
// Layout: backend/ (this file) and frontend/ are siblings under the repo root.
const frontendDistPath = path.join(__dirname, '..', 'frontend', 'dist');
app.use(express.static(frontendDistPath));

app.get('/api', (req, res) => res.send('Attendance API running'));

// SPA fallback: the frontend is a client-side-routed React app (React
// Router), so a direct request/refresh on e.g. /directory has no matching
// file on disk. Hand it index.html for any non-API route and let the router
// take over client-side, instead of 404ing.
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  res.sendFile(path.join(frontendDistPath, 'index.html'));
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
