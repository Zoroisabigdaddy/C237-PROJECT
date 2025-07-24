const express = require('express');
const mysql = require('mysql2');
const session = require('express-session');
const flash = require('connect-flash');


const app = express();

// Database connection
const db = mysql.createConnection({
    host: 'c237-all.mysql.database.azure.com',
    user: 'c237admin',
    password: 'c2372025!',
    database: 'c237_ca_t1_e65e'
});

db.connect((err) => {
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
    cookie: { maxAge : 1000 * 60 * 60 * 24 * 7 } // 7 days
}));

app.use(flash());

// Set EJS as the view engine
app.set('view engine', 'ejs');

// Middleware: Check if user is logged in
const checkAuthenticated = (req, res, next) => {
    if (req.session.user) {
        return next();
    } else {
        req.flash('error', 'You must be logged in to view this page.');
        return res.redirect('/login');
    }
};

// Middleware: Check if user is admin
const checkAdmin = (req, res, next) => {
    if (req.session.user.role === 'admin') {
        return next();
    } else {
        req.flash('error', 'You must be an admin to view this page.');
        return res.redirect('/');
    }
};

// Home
app.get('/', (req, res) => {
    res.render('index', { user: req.session.user, messages: req.flash('success') });
});

// Register
app.get('/register', (req, res) => {
    res.render('register', {
        messages: req.flash('error'),
        formData: req.flash('formData')[0]
    });
});

const validateRegistration = (req, res, next) => {
    const { username, email, password, address, contact } = req.body;
    if (!username || !email || !password || !address || !contact) {
        return res.status(400).send('All fields are required.');
    }
    if (password.length < 6) {
        req.flash('error', 'Password must be at least 6 characters long.');
        req.flash('formData', req.body);
        return res.redirect('/register');
    }
    next();
};

app.post('/register', validateRegistration, (req, res) => {
    const { username, email, password, address, contact, role } = req.body;
    const sql = 'INSERT INTO users (username, email, password, address, contact, role) VALUES (?, ?, SHA1(?), ?, ?, ?)';
    db.query(sql, [username, email, password, address, contact, role], (err, result) => {
        if (err) throw err;
        req.flash('success', 'Registration successful! Please log in.');
        res.redirect('/login');
    });
});

// Login
app.get('/login', (req, res) => {
    res.render('login', {
        messages: req.flash('success'),
        errors: req.flash('error'),
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
            res.redirect('/dashboard');
        } else {
            req.flash('error', 'Invalid email or password.');
            res.redirect('/login');
        }
    });
});

// Dashboard 
app.get('/dashboard', checkAuthenticated, (req, res) => {
    const search = req.query.search || '';
    const category = req.query.category || '';
    
    let sql = "SELECT * FROM book WHERE 1=1"; // Start with a base query
    // Initialize params array for prepared statements
    // This allows us to build the query dynamically based on filters
    let params = [];

    // Search filter
    if (search) {
        sql += ` AND (title LIKE '%${search}%' OR author LIKE '%${search}%')`;
    }

    // category filter
    if (category) {
        sql += ` AND category = '${category}'`;
    }
    
    db.query(sql, (err, results) => {
        if (err) {
            console.error(err);
            return res.send("Error loading dashboard");
        }

        // Format date fields
        results.forEach(book => {
            if (book.date_published) {
                const d = new Date(book.date_published);
                book.date_input = d.toISOString().slice(0, 10); // 'YYYY-MM-DD'

                const day = String(d.getDate()).padStart(2, '0'); 
                const month = String(d.getMonth() + 1).padStart(2, '0');
                const year = d.getFullYear();
                book.date_display = `${day}/${month}/${year}`; // 'DD-MM-YYYY'
            } else {
                book.date_input = '';
                book.date_display = '';
            }
        });
        res.render('dashboard', {
            user: req.session.user,
            book: results,
            search: search,
            category: category
        });
    });
});

// Admin dashboard
app.get('/admin', checkAuthenticated, checkAdmin, (req, res) => {
    const sql = "SELECT * FROM book";
    db.query(sql, (err, results) => {
        if (err) {
            console.error(err);
            return res.send("Error loading dashboard");
        }
        results.forEach(book => {
            if (book.date_published) {
                const d = new Date(book.date_published);
                book.date_input = d.toISOString().slice(0, 10); // 'YYYY-MM-DD'

                const day = String(d.getDate()).padStart(2, '0');
                const month = String(d.getMonth() + 1).padStart(2, '0');
                const year = d.getFullYear();
                book.date_display = `${day}/${month}/${year}`; // 'DD-MM-YYYY'
            } else {
                book.date_input = '';
                book.date_display = '';
            }
        });
        res.render('admin', {
            user: req.session.user,
            book: results
        });
    });
});

// Logout
app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/');
});

// Add Book
app.get('/addbook', checkAuthenticated, (req, res) => {
    res.render('addbook', { user: req.session.user });
});

app.post('/addbook', (req, res) => {
    console.log("Form data received:", req.body);

    const { title, author, category, date_published, description, stocks } = req.body;
    const safeStocks = parseInt(stocks) || 0;
    const availability = safeStocks > 0 ? 'Yes' : 'No';  // 👈 Set based on stocks

    const sql = "INSERT INTO book (title, author, category, date_published, description, stocks, availability) VALUES (?, ?, ?, ?, ?, ?, ?)";

    db.query(sql, [title, author, category, date_published, description, safeStocks, availability], (err) => {
        if (err) {
            console.error("SQL error:", err.sqlMessage);
            return res.send("Error adding book: " + err.sqlMessage);
        }
        res.redirect('/dashboard');
    });
});

// Edit Book
app.get('/editbook/:id', checkAuthenticated, (req, res) => {
    const bookId = req.params.id;
    const sql = "SELECT * FROM book WHERE id = ?";
    db.query(sql, [bookId], (err, results) => {
        if (err) {
            console.error(err);
            return res.send("Error loading book");
        }
        if (results.length === 0) {
            return res.send("Book not found");
        }

        const book = results[0];
        if (book.date_published) {
            const d = new Date(book.date_published);
            book.date_input = d.toISOString().slice(0, 10); // 'YYYY-MM-DD'

            // Format for display as 'DD/MM/YYYY'
            const day = String(d.getDate()).padStart(2, '0');
            const month = String(d.getMonth() + 1).padStart(2, '0');
            const year = d.getFullYear();
            book.date_display = `${day}/${month}/${year}`; // 'DD/MM/YYYY'
        } else {
            book.date_input = '';
            book.date_display = '';
        }
        res.render('editbook', {
            book: book,
            user: req.session.user
        });
        
    });
});


app.post('/editbook/:id', (req, res) => {
    const bookId = req.params.id;
    const { title, author, category, description, date_published, stocks } = req.body;

    const safeStocks = parseInt(stocks) || 0;
    const availability = safeStocks > 0 ? 'Yes' : 'No';

    const sql = "UPDATE book SET title = ?, author = ?, category = ?, description = ?, date_published = ?, stocks = ?, availability = ? WHERE id = ?";

    db.query(sql, [title, author, category, description, date_published, safeStocks, availability, bookId], (err) => {
        if (err) {
            console.error("Error updating book:", err.sqlMessage);
            return res.send("Error updating book: " + err.sqlMessage);
        }
        res.redirect('/dashboard');
    });
});


// Delete Book
app.get('/deletebook/:id', checkAuthenticated, (req, res) => {
    const bookId = req.params.id;
    const sql = 'DELETE FROM book WHERE id = ?';
    db.query(sql, [bookId], (err) => {
        if (err) {
            console.error("Error deleting book:", err);
            res.status(500).send('Error deleting book');
        } else {
            res.redirect('/dashboard');
        }
    });
});

// Start server
app.listen(3000, () => {
    console.log('Server started on port 3000');
});
