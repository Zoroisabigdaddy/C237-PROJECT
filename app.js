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

  let params = [];

    // Search filter
    if (search) {
        sql += ` AND (title LIKE ? OR author LIKE ?)`;
        params.push(`%${search}%`, `%${search}%`);
    }

    // Category filter: match partial genre inside comma-separated string
    if (category) {
        sql += ` AND category LIKE ?`;
        params.push(`%${category}%`);
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
  const search = req.query.search || '';
  const category = req.query.category || '';
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
      errors: req.flash('error'),
      search,
      category
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


// Handle Contact Form Submission and updates the contact table in database
app.post('/contact', (req, res) => {
    const { username, email, message } = req.body;

    if (!username || !email || !message) {
        req.flash('error', 'All fields are required.');
        return res.redirect('/contact');
    }

    const sql = 'INSERT INTO contact (username, email, message) VALUES (?, ?, ?)';
    db.query(sql, [username, email, message], (err) => {
        if (err) {
            console.error('Error saving contact message:', err);
            req.flash('error', 'Failed to send message. Please try again later.');
            return res.redirect('/contact');
        }

        console.log("New Contact Message:", { username, email, message });
        req.flash('success', 'Thank you for contacting us! We will get back to you soon.');
        res.redirect('/contact');
    });
});

// Show the admin reply page
app.get('/admin_reply', (req, res) => {
  const sql = 'SELECT * FROM contact ORDER BY id DESC'; // Optional: show newest first

  db.query(sql, (err, results) => {
    if (err) {
      console.error('Error fetching contact messages:', err);
      req.flash('error', 'Failed to load contact messages.');
      return res.redirect('/admin');
    }

    res.render('admin_reply', {
      user: req.session.user || null,
      messages: results
    });
  });
});

// Handle admin reply
app.post('/admin_reply', (req, res) => {
  const { id, reply_message } = req.body;

  if (!id || !reply_message) {
    req.flash('error', 'Reply message is required.');
    return res.redirect('/admin_reply');
  }

  const sql = `
    UPDATE contact
    SET reply_message = ?
    WHERE id = ?
  `;

  db.query(sql, [reply_message, id], (err, result) => {
    if (err) {
      console.error('Error updating reply:', err);
      req.flash('error', 'Failed to update reply.');
      return res.redirect('/admin_reply');
    }

    req.flash('success', 'Reply sent successfully!');
    res.redirect('/admin_reply');
  });
});

// Delete Contact Message
app.post('/admin_delete/:id', checkAuthenticated, checkAdmin, (req, res) => {
  const sql = 'DELETE FROM contact WHERE id = ?';
  db.query(sql, [req.params.id], (err) => {
    if (err) {
      console.error(err);
      req.flash('error', 'Failed to delete contact message.');
      return res.redirect('/admin');
    }
    req.flash('success', 'Contact message deleted successfully!');
    res.redirect('/admin');
  });
});


// Logout
app.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/');
});

// Add Book Form
app.get('/addbook', checkAuthenticated, checkAdmin, (req, res) => {
  const sql = 'SELECT category FROM book';

  db.query(sql, (err, results) => {
    if (err) {
      console.error('Error fetching categories:', err);
      return res.send('Error loading categories');
    }

    const categorySet = new Set();
    results.forEach(row => {
      if (row.category) {
        row.category.split(',').forEach(cat => {
          categorySet.add(cat.trim());
        });
      }
    });

    const categories = Array.from(categorySet).sort();

    // Retrieve previously entered form data from flash (optional)
    const formData = req.flash('formData')[0] || {};

    res.render('addbook', {
      categories,
      messages: req.flash('error'),
      formData // pass formData so you can fill inputs with <%= formData.title %> etc.
    });
  });
});

// Add Book POST
app.post('/addbook', checkAuthenticated, checkAdmin, upload.single('images'), (req, res) => {
  let { title, author, category, date_published, description, stocks, newCategory } = req.body;

  // Convert multiple categories array to comma-separated string
  let finalCategory = category;
  if (Array.isArray(category)) {
    finalCategory = category.join(',');
  }

  // Append new category if provided
  if (newCategory && newCategory.trim() !== '') {
    finalCategory = finalCategory ? finalCategory + ',' + newCategory.trim() : newCategory.trim();
  }

  const safestocks = parseInt(stocks) || 0;
  const availability = safestocks > 0 ? 'Available' : 'Not Available';
  const images = req.file ? req.file.filename : null;

  if (!images || !title || !author || !finalCategory || !date_published || !description || !stocks || !availability) {
    req.flash('error', 'Please fill in all required fields.');
    return res.redirect('/addbook');
  }

  const sql = `
    INSERT INTO book (images, title, author, category, date_published, description, stocks, availability)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `;
  db.query(sql, [images, title, author, finalCategory, date_published, description, safestocks, availability], (err) => {
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
app.get('/editbook/:id', checkAuthenticated, (req, res) => {
  const bookId = req.params.id;

  const bookSql = `
    SELECT *, 
    DATE_FORMAT(date_published, '%Y-%m-%d') AS date_input,
    DATE_FORMAT(date_published, '%d/%m/%Y') AS date_display
    FROM book WHERE id = ?
  `;

  const categorySql = `SELECT category FROM book`; // fetch all categories (comma-separated)

  db.query(bookSql, [bookId], (err, bookResults) => {
    if (err) {
      console.error(err);
      return res.send("Error loading book");
    }
    if (bookResults.length === 0) {
      return res.send("Book not found");
    }

    const book = bookResults[0];

    db.query(categorySql, (err, categoryResults) => {
      if (err) {
        console.error(err);
        return res.send("Error loading categories");
      }

      // Extract all categories strings and split them by comma
      let allCategories = categoryResults
        .map(row => row.category)
        .filter(Boolean) // Remove null or empty
        .map(str => str.split(',').map(c => c.trim())) // Split and trim each string
        .flat();

      // Deduplicate categories
      const categories = [...new Set(allCategories)].sort();

      res.render('editbook', {
        book,
        categories,
        user: req.session.user
      });
    });
  });
});

// Edit Book POST
app.post('/editbook/:id', checkAuthenticated, checkAdmin, upload.single('images'), (req, res) => {
  let { title, author, category, description, date_published, stocks } = req.body;

  // Convert category array to comma-separated string if multiple selected
  if (Array.isArray(category)) {
    category = category.join(',');
  }

  const safeStocks = parseInt(stocks) || 0;
  const availability = safeStocks > 0 ? 'Available' : 'Not Available';

  // Start SQL for updating book
  let sql = `
    UPDATE book SET title = ?, author = ?, category = ?, description = ?, date_published = ?, stocks = ?, availability = ?
  `;
  const params = [title, author, category, description, date_published, safeStocks, availability];

  // If a new image file is uploaded, update the images field
  if (req.file) {
    sql += `, images = ?`;
    params.push(req.file.filename);
  }

  sql += ` WHERE id = ?`;
  params.push(req.params.id);

  db.query(sql, params, (err) => {
    if (err) {
      console.error("Error updating book:", err.sqlMessage);
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

// Display all available books with borrow button
app.get('/borrow', checkAuthenticated, (req, res) => {
  const sql = `
    SELECT *,
    DATE_FORMAT(date_published, '%Y-%m-%d') AS date_input,
    DATE_FORMAT(date_published, '%d/%m/%Y') AS date_display
    FROM book
    WHERE stocks > 0 AND availability = 'Available'
    ORDER BY title
  `;

  db.query(sql, (err, results) => {
    if (err) {
      console.error(err);
      return res.send('Error loading available books');
    }

    res.render('borrow', {
      user: req.session.user,
      book: results,
      messages: req.flash('success'),
      errors: req.flash('error'),
    });
  });
});

app.get('/borrow/book/:id', checkAuthenticated, (req, res) => {
  const bookId = req.params.id;

  const sql = 'SELECT * FROM book WHERE id = ? AND stocks > 0 AND availability = "Available"';
  db.query(sql, [bookId], (err, results) => {
    if (err || results.length === 0) {
      req.flash('error', 'Book not found or not available.');
      return res.redirect('/borrow');
    }
    res.render('borrow', {
      user: req.session.user,
      book: results[0],
      messages: req.flash('success'),
      errors: req.flash('error'),
    });
  });
});

app.post('/borrow/book/:id', checkAuthenticated, (req, res) => {
  const bookId = req.params.id;
  const { name, email, contact } = req.body;

  if (!name || !email || !contact) {
    req.flash('error', 'Please fill in all required fields.');
    return res.redirect(`/borrow/book/${bookId}`);
  }

  // First, get current stocks and bookname from db
  const getBookSql = 'SELECT stocks, title FROM book WHERE id = ?';
  db.query(getBookSql, [bookId], (err, results) => {
    if (err || results.length === 0) {
      req.flash('error', 'Book not found.');
      return res.redirect('/dashboard');
    }

    const currentStocks = results[0].stocks;
    const bookname = results[0].title;

    if (currentStocks <= 0) {
      req.flash('error', 'This book is currently out of stock.');
      return res.redirect('/dashboard');
    }

    const newStocks = currentStocks - 1;
    const availability = newStocks > 0 ? 'Available' : 'Not Available';

    // Start transaction to update book stocks and insert borrow record
    db.beginTransaction(err => {
      if (err) {
        console.error(err);
        req.flash('error', 'Database error.');
        return res.redirect('/dashboard');
      }

      // Update book stocks and availability
      const updateBookSql = 'UPDATE book SET stocks = ?, availability = ? WHERE id = ?';
      db.query(updateBookSql, [newStocks, availability, bookId], (err) => {
        if (err) {
          return db.rollback(() => {
            console.error(err);
            req.flash('error', 'Failed to update book stock.');
            return res.redirect('/dashboard');
          });
        }

        // Insert borrow record into borrow table
        const insertBorrowSql = `
          INSERT INTO borrow (name, email, contact, bookname, book_id)
          VALUES (?, ?, ?, ?, ?)
        `;

        db.query(insertBorrowSql, [name, email, contact, bookname, bookId], (err) => {
          if (err) {
            return db.rollback(() => {
              console.error(err);
              req.flash('error', 'Failed to save borrow record.');
              return res.redirect('/dashboard');
            });
          }

          db.commit((err) => {
            if (err) {
              return db.rollback(() => {
                console.error(err);
                req.flash('error', 'Database commit failed.');
                return res.redirect('/dashboard');
              });
            }

            req.flash('success', 'Book borrowed successfully!');
            res.redirect('/dashboard'); // redirect wherever you want
          });
        });
      });
    });
  });
});

// Server listen
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
