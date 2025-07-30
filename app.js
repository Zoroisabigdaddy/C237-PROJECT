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
    destination: (req, file, cb) => {
        cb(null, 'public/images');
    },
    filename: (req, file, cb) => {
        cb(null, file.originalname);
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


//contact us
app.get('/contact', (req, res) => {
    res.render('contact', {
        success: req.flash('success'),
        errors: req.flash('error')
    });
});

// Handle Contact Form Submission
app.post('/contact', (req, res) => {
    const { name, email, message } = req.body;

    if (!name || !email || !message) {
        req.flash('error', 'All fields are required.');
        return res.redirect('/contact');
    }

    // Log message to console (or save to DB/file)
    console.log("New Contact Message:", { name, email, message });

    // Set success flash and redirect
    req.flash('success', 'Thank you for contacting us! We will get back to you soon.');
    res.redirect('/contact');
});



// Logout
app.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/');
});

// Add Book Form
app.get('/addbook', checkAuthenticated, checkAdmin, (req, res) => {
  res.render('addbook', { messages: req.flash('error') });
});

// Add Book POST
app.post('/addbook', checkAuthenticated, checkAdmin, upload.single('images'), (req, res) => {
  const {title, author, category, description, date_published } = req.body;
  const images = req.file ? req.file.filename : null;

  if (!images||!title || !author || !category || !date_published) {
    req.flash('error', 'Please fill in all required fields.');
    return res.redirect('/addbook');
  }

  const sql = `
    INSERT INTO book (images, title, author, category, description, image, date_published)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `;
  db.query(sql, [images, title, author, category, description, image, date_published], (err) => {
    if (err) {
      console.error(err);
      req.flash('error', 'Failed to add book.');
      return res.redirect('/addbook');
    }
    req.flash('success', 'Book added successfully!');
    res.redirect('/admin');
  });
});

// Edit Book Form
app.get('/editbook/:id', checkAuthenticated, checkAdmin, (req, res) => {
  const sql = 'SELECT * FROM book WHERE id = ?';
  db.query(sql, [req.params.id], (err, result) => {
    if (err || result.length === 0) return res.send('Book not found');
    res.render('editbook', { book: result[0], messages: req.flash('error') });
  });
});

// Edit Book POST
app.post('/editbook/:id', checkAuthenticated, checkAdmin, upload.single('images'), (req, res) => {
  const { images, title, author, category, description, date_published } = req.body;

  let sql = `
    UPDATE book SET images=?, title=?, author=?, category=?, description=?, date_published=?
  `;
  const params = [images, title, author, category, description, date_published];

  // If new image uploaded
  if (req.file) {
    sql += `, images=?`;
    params.push(req.file.filename);
  }

  sql += ` WHERE id=?`;
  params.push(req.params.id);

  db.query(sql, params, (err) => {
    if (err) {
      console.error(err);
      req.flash('error', 'Failed to update book.');
      return res.redirect('/editbook/' + req.params.id);
    }
    req.flash('success', 'Book updated successfully!');
    res.redirect('/admin');
  });
});

// Delete Book
app.get('/deletebook/:id', checkAuthenticated, checkAdmin, (req, res) => {
  const sql = 'DELETE FROM book WHERE id = ?';
  db.query(sql, [req.params.id], (err) => {
    if (err) {
      console.error(err);
      req.flash('error', 'Failed to delete book.');
      return res.redirect('/admin');
    }
    req.flash('success', 'Book deleted successfully!');
    res.redirect('/admin');
  });
});

// Server listen
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
