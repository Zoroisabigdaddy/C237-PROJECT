const express = require('express');
const mysql = require('mysql2');
const session = require('express-session');
const flash = require('connect-flash');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();

// Multer storage configuration
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'public/images/');
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, uniqueSuffix + ext);
  }
});
const upload = multer({ storage: storage });

// Database connection
const db = mysql.createConnection({
  host: 'c237-all.mysql.database.azure.com',
  user: 'c237admin',
  password: 'c2372025!',
  database: 'c237_ca_t1_e65e'
});

db.connect(err => {
  if (err) throw err;
  console.log('Connected to database');
});

app.use(express.urlencoded({ extended: false }));
app.use(express.static('public'));

// Session middleware
app.use(session({
  secret: 'secret',
  resave: false,
  saveUninitialized: true,
  cookie: { maxAge: 1000 * 60 * 60 * 24 * 7 } // 7 days
}));

app.use(flash());

// Set EJS as the view engine
app.set('view engine', 'ejs');

// Middleware: Check if user is logged in
const checkAuthenticated = (req, res, next) => {
  if (req.session.user) return next();
  req.flash('error', 'You must be logged in to view this page.');
  return res.redirect('/login');
};

// Middleware: Check if user is admin
const checkAdmin = (req, res, next) => {
  if (req.session.user && req.session.user.role === 'admin') {
    return next();
  }
  req.flash('error', 'You must be an admin to view this page.');
  return res.redirect('/');
};

// Home
app.get('/', (req, res) => {
  res.render('index', { user: req.session.user, messages: req.flash('success') });
});

// Register (simplified, no hashing demonstration)
app.get('/register', (req, res) => {
  res.render('register', {
    messages: req.flash('error'),
    formData: req.flash('formData')[0]
  });
});

app.post('/register', (req, res) => {
  const { username, email, password, address, contact, role } = req.body;
  if (!username || !email || !password || !address || !contact) {
    req.flash('error', 'All fields are required.');
    req.flash('formData', req.body);
    return res.redirect('/register');
  }
  if (password.length < 6) {
    req.flash('error', 'Password must be at least 6 characters long.');
    req.flash('formData', req.body);
    return res.redirect('/register');
  }

  const sql = 'INSERT INTO users (username, email, password, address, contact, role) VALUES (?, ?, SHA1(?), ?, ?, ?)';
  db.query(sql, [username, email, password, address, contact, role], (err) => {
    if (err) {
      req.flash('error', 'Registration failed. Possibly email already used.');
      req.flash('formData', req.body);
      return res.redirect('/register');
    }
    req.flash('success', 'Registration successful! Please log in.');
    res.redirect('/login');
  });
});

// Login
app.get('/login', (req, res) => {
  res.render('login', {
    messages: req.flash('success'),
    errors: req.flash('error')
  });
});

app.post('/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    req.flash('error', 'All fields are required.');
    return res.redirect('/login');
  }

  const sql = 'SELECT * FROM users WHERE email = ? AND password = SHA1(?)';
  db.query(sql, [email, password], (err, results) => {
    if (err) throw err;
    if (results.length > 0) {
      req.session.user = results[0];
      req.flash('success', 'Login successful!');
      return res.redirect('/dashboard');
    } else {
      req.flash('error', 'Invalid email or password.');
      return res.redirect('/login');
    }
  });
});

// Dashboard
app.get('/dashboard', checkAuthenticated, (req, res) => {
  const search = req.query.search || '';
  const category = req.query.category || '';

  let sql = `
    SELECT *,
    DATE_FORMAT(date_published, '%Y-%m-%d') AS date_input,
    DATE_FORMAT(date_published, '%d/%m/%Y') AS date_display
    FROM book WHERE 1=1
  `;

  const params = [];
  if (search) {
    sql += ` AND (title LIKE ? OR author LIKE ?)`;
    params.push(`%${search}%`, `%${search}%`);
  }
  if (category) {
    sql += ` AND category = ?`;
    params.push(category);
  }

  db.query(sql, params, (err, results) => {
    if (err) {
      console.error(err);
      return res.send('Error loading dashboard');
    }

    res.render('dashboard', {
      user: req.session.user,
      book: results,
      search,
      category
    });
  });
});

// Admin dashboard
app.get('/admin', checkAuthenticated, checkAdmin, (req, res) => {
  const sql = `
    SELECT *,
    DATE_FORMAT(date_published, '%Y-%m-%d') AS date_input,
    DATE_FORMAT(date_published, '%d/%m/%Y') AS date_display
    FROM book
    ORDER BY date_published DESC
  `;

  db.query(sql, (err, results) => {
    if (err) {
      console.error(err);
      return res.send('Error loading admin dashboard');
    }

    res.render('admin', {
      user: req.session.user,
      book: results,
      messages: req.flash('success'),
      errors: req.flash('error')
    });
  });
});

// Logout
app.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/');
});

// Server listen
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
