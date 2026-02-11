const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = 5000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontend')));

/* =========================
   MYSQL CONNECTION POOL
========================= */

const pool = mysql.createPool({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'studentdb',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

/* =========================
   INITIAL DB SETUP
========================= */

pool.query(
    `CREATE TABLE IF NOT EXISTS students (
        id VARCHAR(50) PRIMARY KEY,
        username VARCHAR(100) NOT NULL,
        email VARCHAR(100) NOT NULL UNIQUE,
        password VARCHAR(255) NOT NULL,
        course VARCHAR(255) DEFAULT 'General',
        status VARCHAR(50) DEFAULT 'Active',
        attendance INT DEFAULT 0,
        gpa DECIMAL(3,1) DEFAULT 0.0
    )`,
    (err) => {
        if (err) {
            console.error("Students table creation failed:", err);
        } else {
            console.log("Students table ready");
        }
    }
);

pool.query(
    `CREATE TABLE IF NOT EXISTS admins (
        id VARCHAR(50) PRIMARY KEY,
        username VARCHAR(100) NOT NULL,
        email VARCHAR(100) NOT NULL UNIQUE,
        password VARCHAR(255) NOT NULL
    )`,
    (err) => {
        if (err) {
            console.error("Admins table creation failed:", err);
        } else {
            console.log("Admins table ready");
        }
    }
);

pool.query(
    `CREATE TABLE IF NOT EXISTS courses (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) NOT NULL UNIQUE,
        description TEXT
    )`,
    (err) => {
        if (err) {
            console.error("Courses table creation failed:", err);
        } else {
            console.log("Courses table ready");
            // Seed default courses if empty
            pool.query("SELECT COUNT(*) AS count FROM courses", (err, results) => {
                if (!err && results[0].count === 0) {
                    const defaults = ['Computer Science', 'Mathematics', 'Physics', 'Engineering', 'Cybersecurity'];
                    defaults.forEach(c => pool.query("INSERT INTO courses (name, description) VALUES (?, 'Standard Course')", [c]));
                }
            });
        }
    }
);

pool.query(
    `CREATE TABLE IF NOT EXISTS assignments (
        id INT AUTO_INCREMENT PRIMARY KEY,
        courseName VARCHAR(100) NOT NULL,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        dueDate DATE
    )`,
    (err) => {
        if (err) {
            console.error("Assignments table creation failed:", err);
        } else {
            console.log("Assignments table ready");
        }
    }
);

/* =========================
   API ROUTES
========================= */

// Register
app.post('/api/register', (req, res) => {
    const { username, email, password, role, selectedCourses } = req.body;
    
    if (role === 'admin') {
        const id = "ADM" + Math.floor(1000 + Math.random() * 9000);
        const sql = "INSERT INTO admins (id, username, email, password) VALUES (?, ?, ?, ?)";
        
        pool.query(sql, [id, username, email, password], (err) => {
            if (err) {
                if (err.code === 'ER_DUP_ENTRY') return res.status(400).json({ message: "Email already exists" });
                return res.status(500).json({ message: "Database error" });
            }
            res.status(201).json({ message: "Admin Registration Successful" });
        });
    } else {
        // Student Registration
        const id = "STU" + Math.floor(1000 + Math.random() * 9000);
        const courseStr = (selectedCourses && selectedCourses.length > 0) ? selectedCourses.join(', ') : 'General';

        let randomGPA;
        const chance = Math.random();
        if (chance < 0.33) randomGPA = (Math.random() * (4.0 - 3.5) + 3.5).toFixed(1);
        else if (chance < 0.66) randomGPA = (Math.random() * (3.4 - 3.0) + 3.0).toFixed(1);
        else randomGPA = (Math.random() * (2.9 - 2.0) + 2.0).toFixed(1);

        const randomAttendance = Math.floor(Math.random() * 41) + 60;

        const sql = "INSERT INTO students (id, username, email, password, course, attendance, gpa) VALUES (?, ?, ?, ?, ?, ?, ?)";
        
        pool.query(sql, [id, username, email, password, courseStr, randomAttendance, randomGPA], (err) => {
            if (err) {
                if (err.code === 'ER_DUP_ENTRY') return res.status(400).json({ message: "Email already exists" });
                return res.status(500).json({ message: "Database error" });
            }
            res.status(201).json({ message: "Student Registration Successful", id: id, role: 'student' });
        });
    }
});

// Login
app.post('/api/login', (req, res) => {
    const { usernameOrEmail, password } = req.body;

    // 1. Check Admins Table
    const adminSql = "SELECT * FROM admins WHERE (email = ? OR username = ?) AND password = ?";
    pool.query(adminSql, [usernameOrEmail, usernameOrEmail, password], (err, adminResults) => {
        if (err) return res.status(500).json({ message: "DB error" });

        if (adminResults.length > 0) {
            return res.json({
                message: "Login Successful",
                username: adminResults[0].username,
                role: 'admin',
                student: adminResults[0]
            });
        }

        // 2. Check Students Table
        const studentSql = "SELECT * FROM students WHERE (email = ? OR username = ?) AND password = ?";
        pool.query(studentSql, [usernameOrEmail, usernameOrEmail, password], (err, studentResults) => {
            if (err) return res.status(500).json({ message: "DB error" });

            if (studentResults.length > 0) {
                return res.json({
                    message: "Login Successful",
                    username: studentResults[0].username,
                    role: 'student',
                    student: studentResults[0]
                });
            }

            res.status(401).json({ message: "Invalid Credentials" });
        });
    });
});

// Get all students
app.get('/api/students', (req, res) => {
    pool.query("SELECT * FROM students", (err, results) => {
        if (err) return res.status(500).json({ message: "Error fetching students" });
        res.json(results);
    });
});

// Get specific student
app.get('/api/students/:id', (req, res) => {
    const { id } = req.params;
    pool.query("SELECT * FROM students WHERE id = ?", [id], (err, results) => {
        if (err) return res.status(500).json({ message: "Error fetching student" });
        if (results.length === 0) return res.status(404).json({ message: "Student not found" });
        res.json(results[0]);
    });
});

// Update Student (For Admin)
app.put('/api/students/:id', (req, res) => {
    const { id } = req.params;
    const { course, attendance } = req.body;
    
    let sql, params;
    if (attendance === undefined) {
        sql = "UPDATE students SET course = ? WHERE id = ?";
        params = [course, id];
    } else {
        sql = "UPDATE students SET course = ?, attendance = ? WHERE id = ?";
        params = [course, attendance, id];
    }
    
    pool.query(sql, params, (err, result) => {
        if (err) return res.status(500).json({ message: "Database update failed" });
        res.json({ message: "Student updated successfully" });
    });
});

// Delete Student (For Admin)
app.delete('/api/students/:id', (req, res) => {
    const { id } = req.params;
    const sql = "DELETE FROM students WHERE id = ?";
    pool.query(sql, [id], (err, result) => {
        if (err) return res.status(500).json({ message: "Database delete failed" });
        res.json({ message: "Student deleted successfully" });
    });
});

// Get all courses
app.get('/api/courses', (req, res) => {
    pool.query("SELECT * FROM courses ORDER BY name", (err, results) => {
        if (err) return res.status(500).json({ message: "Error fetching courses" });
        res.json(results);
    });
});

// Add a new course (Admin)
app.post('/api/courses', (req, res) => {
    const { name, description } = req.body;
    const sql = "INSERT INTO courses (name, description) VALUES (?, ?)";
    pool.query(sql, [name, description || ''], (err, result) => {
        if (err) {
            if (err.code === 'ER_DUP_ENTRY') return res.status(400).json({ message: "Course name already exists" });
            return res.status(500).json({ message: "Database error on course creation" });
        }
        res.status(201).json({ message: "Course added successfully", insertId: result.insertId });
    });
});

// Update a course (Admin)
app.put('/api/courses/:id', (req, res) => {
    const { id } = req.params;
    const { name, description } = req.body;
    const sql = "UPDATE courses SET name = ?, description = ? WHERE id = ?";
    pool.query(sql, [name, description, id], (err, result) => {
        if (err) return res.status(500).json({ message: "Database update failed" });
        res.json({ message: "Course updated successfully" });
    });
});

// Delete a course (Admin)
app.delete('/api/courses/:id', (req, res) => {
    const { id } = req.params;
    const sql = "DELETE FROM courses WHERE id = ?";
    pool.query(sql, [id], (err, result) => {
        if (err) return res.status(500).json({ message: "Database delete failed" });
        res.json({ message: "Course deleted successfully" });
    });
});

// --- ASSIGNMENT ROUTES ---

// Get all assignments
app.get('/api/assignments', (req, res) => {
    pool.query("SELECT * FROM assignments ORDER BY dueDate", (err, results) => {
        if (err) return res.status(500).json({ message: "Error fetching assignments" });
        res.json(results);
    });
});

// Add a new assignment (Admin)
app.post('/api/assignments', (req, res) => {
    const { courseName, title, description, dueDate } = req.body;
    const sql = "INSERT INTO assignments (courseName, title, description, dueDate) VALUES (?, ?, ?, ?)";
    pool.query(sql, [courseName, title, description, dueDate], (err, result) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ message: "Database error on assignment creation" });
        }
        res.status(201).json({ message: "Assignment added successfully", insertId: result.insertId });
    });
});

// Update an assignment (Admin)
app.put('/api/assignments/:id', (req, res) => {
    const { id } = req.params;
    const { courseName, title, description, dueDate } = req.body;
    const sql = "UPDATE assignments SET courseName = ?, title = ?, description = ?, dueDate = ? WHERE id = ?";
    pool.query(sql, [courseName, title, description, dueDate, id], (err, result) => {
        if (err) return res.status(500).json({ message: "Database update failed" });
        res.json({ message: "Assignment updated successfully" });
    });
});

// Delete an assignment (Admin)
app.delete('/api/assignments/:id', (req, res) => {
    const { id } = req.params;
    const sql = "DELETE FROM assignments WHERE id = ?";
    pool.query(sql, [id], (err, result) => {
        if (err) return res.status(500).json({ message: "Database delete failed" });
        res.json({ message: "Assignment deleted successfully" });
    });
});

/* ========================= */

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
