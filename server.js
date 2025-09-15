// server.js
require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 5000;
const MONGODB_URI = process.env.MONGODB_URI;
// Add reports routes
const reportsRoutes = require('./routes/reports');
app.use('/api/reports', reportsRoutes);

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// Connect to MongoDB
mongoose.connect(MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
  .then(() => console.log("✅ MongoDB connected"))
  .catch((err) => console.error("❌ MongoDB connection error:", err));

// Routes
const teacherRoutes = require("./routes/teacherRoutes");
app.use("/api", teacherRoutes);
const teacher = require("./routes/teacher");
app.use("/api", teacher);
// ✅ Backend route to handle attendance page
app.get('/attendance/:stream/:semester/:subject', async (req, res) => {
  try {
    const { stream, semester, subject } = req.params;
    
    console.log('📚 Attendance route accessed:', { stream, semester, subject });
    
    // Decode URL parameters
    const decodedStream = decodeURIComponent(stream);
    const decodedSemester = parseInt(semester);
    const decodedSubject = decodeURIComponent(subject);
    
    // Validate parameters
    if (!decodedStream || !decodedSemester || !decodedSubject) {
      return res.status(400).send('Invalid attendance parameters');
    }

    // Create class info for frontend
    const classInfo = {
      stream: decodedStream,
      semester: decodedSemester,
      subject: decodedSubject,
      autoSelect: true
    };

    // Serve your main attendance page with pre-selected class data
    res.render('attendance', { 
      classData: classInfo,
      pageTitle: `Attendance - ${decodedSubject}`,
      selectedStream: decodedStream,
      selectedSem: decodedSemester,
      selectedSubject: decodedSubject
    });

  } catch (error) {
    console.error('❌ Error serving attendance page:', error);
    res.status(500).send('Error loading attendance page');
  }
});
// ✅ FIXED: Add this to your main app.js or server.js file
app.use((err, req, res, next) => {
  console.error('❌ Unhandled Application Error:', err);
  
  // Handle specific error types
  if (err.name === 'ValidationError') {
    return res.status(400).json({
      success: false,
      message: 'Validation Error',
      errors: Object.values(err.errors).map(e => e.message)
    });
  }
  
  if (err.name === 'CastError') {
    return res.status(400).json({
      success: false,
      message: 'Invalid ID format',
      error: err.message
    });
  }
  
  // Default error response
  res.status(err.statusCode || 500).json({
    success: false,
    message: err.message || 'Internal Server Error',
    timestamp: new Date().toISOString()
  });
});

// ✅ Handle unhandled promise rejections
process.on('unhandledRejection', (err, promise) => {
  console.error('❌ Unhandled Promise Rejection:', err);
  // Don't exit the process, just log the error
});

// ✅ Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  console.error('❌ Uncaught Exception:', err);
  process.exit(1); // Exit on uncaught exceptions
});

// ✅ Serve myclass.html route
app.get('/myclass', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Serve frontend fallback
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "login.html"));
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});