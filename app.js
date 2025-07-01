const express = require('express');
const path = require('path');
const morgan = require('morgan');
const connectDB = require('./config/db');
require('dotenv').config();
const session = require('express-session');
const authRoutes = require('./routes/auth');
const { requireAuth } = require('./middleware/auth');

const app = express();

// Connect to MongoDB
connectDB();

// Middleware
app.use(morgan('combined')); // HTTP request logging
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Session middleware
app.use(session({
  secret: process.env.SESSION_SECRET || 'weboto_secret',
  resave: false,
  saveUninitialized: false
}));

// View engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Auth routes (login, logout)
app.use('/', authRoutes);

// Authentication middleware (login hariç tüm route'lar korumalı)
app.use((req, res, next) => {
  if (req.path === '/login') return next();
  requireAuth(req, res, next);
});

// Routes
app.use('/', require('./routes/index'));

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ success: false, error: 'Something broke!' });
});

module.exports = app; 