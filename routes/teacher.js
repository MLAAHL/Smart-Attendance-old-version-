const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();

// Firebase Admin for token verification
const { admin } = require('../config/firebase-admin');

// ==========================================
// MONGOOSE SCHEMA DEFINITION
// ==========================================

const ClassSchema = new mongoose.Schema({
  id: {
    type: String,
    required: true
  },
  stream: {
    type: String,
    required: true,
    enum: ['BCA', 'BBA', 'BCom', 'BCom Section B', 'BCom-BDA', 'BCom A and F']
  },
  semester: {
    type: String,
    required: true,
    enum: ['1', '2', '3', '4', '5', '6']
  },
  subject: {
    type: String,
    required: true,
    trim: true
  },
  timeAdded: {
    type: String,
    required: true
  },
  dateAdded: {
    type: String,
    required: true
  },
  completedTime: {
    type: String
  },
  completedDate: {
    type: String
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

const TeacherSchema = new mongoose.Schema({
  firebaseUID: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  email: {
    type: String,
    required: true,
    lowercase: true,
    trim: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  attendanceQueue: [ClassSchema],
  completedToday: [ClassSchema],
  isActive: {
    type: Boolean,
    default: true
  },
  role: {
    type: String,
    default: 'teacher',
    enum: ['teacher', 'admin']
  },
  lastUpdated: {
    type: Date,
    default: Date.now
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Pre-save middleware to update lastUpdated
TeacherSchema.pre('save', function(next) {
  this.lastUpdated = new Date();
  next();
});

// Static method to find or create teacher
TeacherSchema.statics.findOrCreate = async function(firebaseUID, email, name) {
  let teacher = await this.findOne({ firebaseUID });
  
  if (!teacher) {
    teacher = new this({
      firebaseUID,
      email: email.toLowerCase(),
      name: name || email.split('@')[0],
      attendanceQueue: [],
      completedToday: [],
      isActive: true
    });
    await teacher.save();
  }
  
  return teacher;
};

// Instance method to add class to queue
TeacherSchema.methods.addToQueue = function(classData) {
  // Check for duplicates
  const isDuplicate = this.attendanceQueue.some(cls => 
    cls.stream === classData.stream && 
    cls.semester === classData.semester && 
    cls.subject === classData.subject
  );
  
  if (isDuplicate) {
    throw new Error('This class is already in your queue');
  }
  
  const newClass = {
    id: Date.now().toString(),
    stream: classData.stream.trim(),
    semester: classData.semester.trim(),
    subject: classData.subject.trim(),
    timeAdded: new Date().toLocaleTimeString(),
    dateAdded: new Date().toDateString(),
    createdAt: new Date()
  };
  
  this.attendanceQueue.push(newClass);
  return newClass;
};

// Instance method to complete class
TeacherSchema.methods.completeClass = function(classId) {
  const classIndex = this.attendanceQueue.findIndex(cls => cls.id === classId);
  
  if (classIndex === -1) {
    throw new Error('Class not found in queue');
  }
  
  const classToComplete = this.attendanceQueue[classIndex];
  const completedClass = {
    ...classToComplete.toObject(),
    completedTime: new Date().toLocaleTimeString(),
    completedDate: new Date().toDateString()
  };
  
  // Remove from queue and add to completed
  this.attendanceQueue.splice(classIndex, 1);
  this.completedToday.push(completedClass);
  
  return completedClass;
};

// Instance method to remove class from queue
TeacherSchema.methods.removeClass = function(classId) {
  const initialLength = this.attendanceQueue.length;
  this.attendanceQueue = this.attendanceQueue.filter(cls => cls.id !== classId);
  
  if (this.attendanceQueue.length === initialLength) {
    throw new Error('Class not found in queue');
  }
  
  return true;
};

// Create the model
const Teacher = mongoose.model('Teacher', TeacherSchema);

// ==========================================
// MIDDLEWARE - TOKEN VERIFICATION (NO EMAIL RESTRICTIONS)
// ==========================================

const verifyToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ 
        success: false,
        error: 'Access denied. No token provided or invalid format.' 
      });
    }

    const token = authHeader.split('Bearer ')[1];

    // Verify the Firebase ID token
    const decodedToken = await admin.auth().verifyIdToken(token);
    
    // Add user info to request object
    req.user = {
      uid: decodedToken.uid,
      email: decodedToken.email,
      name: decodedToken.name || decodedToken.email.split('@')[0]
    };

    next();
  } catch (error) {
    console.error('Token verification failed:', error);
    res.status(401).json({ 
      success: false,
      error: 'Invalid token. Access denied.' 
    });
  }
};

// Apply authentication middleware to all routes
router.use(verifyToken);

// ==========================================
// ROUTE HANDLERS
// ==========================================

// @route   GET /api/teacher/queue
// @desc    Get teacher's attendance queue and completed classes
// @access  Private
router.get('/queue', async (req, res) => {
  try {
    const teacher = await Teacher.findOne({ firebaseUID: req.user.uid });

    if (!teacher) {
      return res.json({
        success: true,
        data: {
          attendanceQueue: [],
          completedToday: []
        }
      });
    }

    res.json({
      success: true,
      data: {
        attendanceQueue: teacher.attendanceQueue,
        completedToday: teacher.completedToday,
        lastUpdated: teacher.lastUpdated
      }
    });

  } catch (error) {
    console.error('Error fetching teacher queue:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch queue data'
    });
  }
});

// @route   POST /api/teacher/queue/add
// @desc    Add a single class to the queue
// @access  Private
router.post('/queue/add', async (req, res) => {
  try {
    const { stream, semester, subject } = req.body;

    // Validate required fields
    if (!stream || !semester || !subject) {
      return res.status(400).json({
        success: false,
        error: 'Stream, semester, and subject are required'
      });
    }

    // Validate stream and semester combination
    if (stream === 'BCom Section B' && !['5', '6'].includes(semester)) {
      return res.status(400).json({
        success: false,
        error: 'BCom Section B only supports Semesters 5 and 6'
      });
    }

    // Find or create teacher
    let teacher = await Teacher.findOrCreate(
      req.user.uid, 
      req.user.email, 
      req.user.name
    );

    // Add class to queue using schema method
    const newClass = teacher.addToQueue({ stream, semester, subject });
    
    // Save the teacher
    await teacher.save();

    res.status(201).json({
      success: true,
      message: 'Class added to queue successfully',
      data: newClass
    });

  } catch (error) {
    console.error('Error adding class to queue:', error);
    
    if (error.message.includes('already in your queue')) {
      return res.status(409).json({
        success: false,
        error: error.message
      });
    }
    
    res.status(500).json({
      success: false,
      error: 'Failed to add class to queue'
    });
  }
});

// @route   DELETE /api/teacher/queue/:classId
// @desc    Remove a class from the queue
// @access  Private
router.delete('/queue/:classId', async (req, res) => {
  try {
    const { classId } = req.params;

    const teacher = await Teacher.findOne({ firebaseUID: req.user.uid });

    if (!teacher) {
      return res.status(404).json({
        success: false,
        error: 'Teacher not found'
      });
    }

    // Remove class using schema method
    teacher.removeClass(classId);
    await teacher.save();

    res.json({
      success: true,
      message: 'Class removed from queue successfully'
    });

  } catch (error) {
    console.error('Error removing class from queue:', error);
    
    if (error.message.includes('not found')) {
      return res.status(404).json({
        success: false,
        error: error.message
      });
    }
    
    res.status(500).json({
      success: false,
      error: 'Failed to remove class from queue'
    });
  }
});

// @route   POST /api/teacher/queue/complete/:classId
// @desc    Move a class from queue to completed
// @access  Private
router.post('/queue/complete/:classId', async (req, res) => {
  try {
    const { classId } = req.params;

    const teacher = await Teacher.findOne({ firebaseUID: req.user.uid });

    if (!teacher) {
      return res.status(404).json({
        success: false,
        error: 'Teacher not found'
      });
    }

    // Complete class using schema method
    const completedClass = teacher.completeClass(classId);
    await teacher.save();

    res.json({
      success: true,
      message: 'Class completed successfully',
      data: completedClass
    });

  } catch (error) {
    console.error('Error completing class:', error);
    
    if (error.message.includes('not found')) {
      return res.status(404).json({
        success: false,
        error: error.message
      });
    }
    
    res.status(500).json({
      success: false,
      error: 'Failed to complete class'
    });
  }
});

// @route   DELETE /api/teacher/queue/clear-completed
// @desc    Clear completed classes (for new day reset)
// @access  Private
router.delete('/queue/clear-completed', async (req, res) => {
  try {
    const teacher = await Teacher.findOne({ firebaseUID: req.user.uid });

    if (!teacher) {
      return res.status(404).json({
        success: false,
        error: 'Teacher not found'
      });
    }

    teacher.completedToday = [];
    await teacher.save();

    res.json({
      success: true,
      message: 'Completed classes cleared successfully'
    });

  } catch (error) {
    console.error('Error clearing completed classes:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to clear completed classes'
    });
  }
});

// @route   GET /api/teacher/profile
// @desc    Get teacher profile info
// @access  Private
router.get('/profile', async (req, res) => {
  try {
    const teacher = await Teacher.findOne({ firebaseUID: req.user.uid });

    if (!teacher) {
      return res.json({
        success: true,
        data: {
          firebaseUID: req.user.uid,
          email: req.user.email,
          name: req.user.name,
          totalClasses: 0,
          completedToday: 0,
          isActive: true,
          role: 'teacher'
        }
      });
    }

    res.json({
      success: true,
      data: {
        firebaseUID: teacher.firebaseUID,
        email: teacher.email,
        name: teacher.name,
        totalClasses: teacher.attendanceQueue.length,
        completedToday: teacher.completedToday.length,
        isActive: teacher.isActive,
        role: teacher.role,
        lastUpdated: teacher.lastUpdated,
        createdAt: teacher.createdAt
      }
    });

  } catch (error) {
    console.error('Error fetching teacher profile:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch profile data'
    });
  }
});

// @route   POST /api/teacher/queue/bulk-add
// @desc    Add multiple classes to queue at once
// @access  Private
router.post('/queue/bulk-add', async (req, res) => {
  try {
    const { classes } = req.body;

    if (!Array.isArray(classes) || classes.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Classes array is required'
      });
    }

    let teacher = await Teacher.findOrCreate(
      req.user.uid, 
      req.user.email, 
      req.user.name
    );

    const addedClasses = [];
    const errors = [];

    for (const classData of classes) {
      try {
        const newClass = teacher.addToQueue(classData);
        addedClasses.push(newClass);
      } catch (error) {
        errors.push({
          class: classData,
          error: error.message
        });
      }
    }

    await teacher.save();

    res.status(201).json({
      success: true,
      message: `${addedClasses.length} classes added successfully`,
      data: {
        added: addedClasses,
        errors: errors
      }
    });

  } catch (error) {
    console.error('Error bulk adding classes:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to bulk add classes'
    });
  }
});

// @route   GET /api/teacher/stats
// @desc    Get teacher statistics
// @access  Private
router.get('/stats', async (req, res) => {
  try {
    const teacher = await Teacher.findOne({ firebaseUID: req.user.uid });

    if (!teacher) {
      return res.json({
        success: true,
        data: {
          totalQueueClasses: 0,
          completedToday: 0,
          streamsInQueue: [],
          semestersInQueue: []
        }
      });
    }

    // Calculate statistics
    const streamsInQueue = [...new Set(teacher.attendanceQueue.map(c => c.stream))];
    const semestersInQueue = [...new Set(teacher.attendanceQueue.map(c => c.semester))];

    res.json({
      success: true,
      data: {
        totalQueueClasses: teacher.attendanceQueue.length,
        completedToday: teacher.completedToday.length,
        streamsInQueue: streamsInQueue,
        semestersInQueue: semestersInQueue.sort(),
        lastActivity: teacher.lastUpdated,
        accountCreated: teacher.createdAt
      }
    });

  } catch (error) {
    console.error('Error fetching teacher stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch statistics'
    });
  }
});

// @route   PUT /api/teacher/profile
// @desc    Update teacher profile
// @access  Private
router.put('/profile', async (req, res) => {
  try {
    const { name } = req.body;

    let teacher = await Teacher.findOrCreate(
      req.user.uid, 
      req.user.email, 
      req.user.name
    );

    if (name && name.trim()) {
      teacher.name = name.trim();
    }

    await teacher.save();

    res.json({
      success: true,
      message: 'Profile updated successfully',
      data: {
        name: teacher.name,
        email: teacher.email,
        lastUpdated: teacher.lastUpdated
      }
    });

  } catch (error) {
    console.error('Error updating teacher profile:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update profile'
    });
  }
});

// Export the router
module.exports = router;
