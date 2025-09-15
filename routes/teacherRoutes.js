const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const BaseAttendance = require("../models/BaseAttendance");

// ✅ FIXED: WhatsApp Cloud API Service Integration
const WhatsAppService = require('../utils/sendWhatsAppMessage'); // Your WhatsApp Cloud API service

// ✅ FIXED: Async Error Handler Middleware
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// ✅ FIXED: Enhanced Student Schema with Language Support
const studentSchema = new mongoose.Schema({
  studentID: {
    type: String,
    required: [true, 'Student ID is required'],
    unique: true,
    trim: true,
    uppercase: true,
    validate: {
      validator: function(v) {
        return /^[A-Z0-9]{6,10}$/.test(v);
      },
      message: 'Student ID must be 6-10 uppercase alphanumeric characters'
    }
  },
  name: {
    type: String,
    required: [true, 'Student name is required'],
    trim: true,
    uppercase: true,
    minlength: [2, 'Name must be at least 2 characters'],
    maxlength: [100, 'Name cannot exceed 100 characters']
  },
  stream: {
    type: String,
    required: [true, 'Stream is required'],
    uppercase: true,
    enum: {
      values: ['BCA', 'BBA', 'BCOM', 'BCOM SECTION B', 'BCOM-BDA', 'BCOM A AND F'],
      message: 'Invalid stream'
    }
  },
  semester: {
    type: Number,
    required: [true, 'Semester is required'],
    min: [1, 'Semester must be at least 1'],
    max: [8, 'Semester cannot exceed 8']
  },
  parentPhone: {
    type: String,
    required: [true, 'Parent phone number is required'],
    validate: {
      validator: function(v) {
        // Supports formats: +919876543210, 919876543210, 9876543210
        const cleaned = v.replace(/[\s\-\(\)\+]/g, '');
        return /^(91)?[6-9]\d{9}$/.test(cleaned);
      },
      message: "Please enter a valid Indian phone number"
    },
    set: function(v) {
      // Normalize phone number format
      const cleaned = v.replace(/[\s\-\(\)\+]/g, '');
      if (cleaned.length === 10 && !cleaned.startsWith('91')) {
        return '91' + cleaned;
      }
      return cleaned;
    }
  },
  
  // ✅ ENHANCED: Language preference fields
  languageSubject: {
    type: String,
    uppercase: true,
    enum: {
      values: ['KANNADA', 'HINDI', 'SANSKRIT', null],
      message: 'Invalid language subject'
    },
    default: null
  },
  languageGroup: {
    type: String,
    uppercase: true,
    default: function() {
      if (this.languageSubject) {
        return `${this.stream}_SEM${this.semester}_${this.languageSubject}`;
      }
      return null;
    }
  },
  
  isActive: {
    type: Boolean,
    default: true
  },
  migrationGeneration: {
    type: Number,
    default: 0
  },
  originalSemester: {
    type: Number,
    required: true,
    default: function() { return this.semester; }
  },
  lastMigrationDate: {
    type: Date,
    default: null
  },
  migrationBatch: {
    type: String,
    default: null
  },
  addedToSemesterDate: {
    type: Date,
    default: Date.now
  },
  migrationHistory: [{
    fromSemester: {
      type: Number,
      required: true
    },
    toSemester: {
      type: Number,
      required: true
    },
    migratedDate: {
      type: Date,
      default: Date.now
    },
    migrationBatch: String,
    generation: Number
  }],
  academicYear: {
    type: String,
    default: () => new Date().getFullYear().toString()
  }
}, {
  timestamps: true,
  strict: false
});

// ✅ FIXED: Add indexes for better performance
studentSchema.index({ studentID: 1 });
studentSchema.index({ stream: 1, semester: 1 });
studentSchema.index({ languageGroup: 1 });
studentSchema.index({ isActive: 1 });

// ✅ ENHANCED: Subject Schema with Language Support
const subjectSchema = new mongoose.Schema({
  subjectName: {
    type: String,
    required: [true, 'Subject name is required'],
    trim: true,
    uppercase: true,
    minlength: [2, 'Subject name must be at least 2 characters']
  },
  stream: {
    type: String,
    required: [true, 'Stream is required'],
    uppercase: true,
    enum: {
      values: ['BCA', 'BBA', 'BCOM', 'BCOM SECTION B', 'BCOM-BDA', 'BCOM A AND F'],
      message: 'Invalid stream'
    }
  },
  semester: {
    type: Number,
    required: [true, 'Semester is required'],
    min: [1, 'Semester must be at least 1'],
    max: [8, 'Semester cannot exceed 8']
  },
  credits: {
    type: Number,
    required: [true, 'Credits are required'],
    min: [1, 'Credits must be at least 1'],
    max: [6, 'Credits cannot exceed 6'],
    default: 4
  },
  subjectType: {
    type: String,
    required: [true, 'Subject type is required'],
    uppercase: true,
    enum: {
      values: ['CORE', 'ELECTIVE', 'LANGUAGE', 'OPTIONAL'],
      message: 'Invalid subject type'
    },
    default: 'CORE'
  },
  
  // ✅ ENHANCED: Language-specific fields
  isLanguageSubject: {
    type: Boolean,
    default: function() {
      return this.subjectType === 'LANGUAGE';
    }
  },
  languageType: {
    type: String,
    uppercase: true,
    enum: {
      values: ['KANNADA', 'HINDI', 'SANSKRIT', null],
      message: 'Invalid language type'
    },
    default: null,
    validate: {
      validator: function(v) {
        if (this.isLanguageSubject) {
          return v !== null;
        }
        return true;
      },
      message: 'Language type is required for language subjects'
    }
  },
  
  isActive: {
    type: Boolean,
    default: true
  },
  academicYear: {
    type: String,
    default: () => new Date().getFullYear().toString()
  }
}, {
  timestamps: true,
  strict: false
});

// ✅ FIXED: Add indexes for subjects
subjectSchema.index({ stream: 1, semester: 1 });
subjectSchema.index({ subjectType: 1 });
subjectSchema.index({ isLanguageSubject: 1, languageType: 1 });

// ✅ ENHANCED: Attendance Schema with Language Group Support
const attendanceSchema = new mongoose.Schema({
  date: {
    type: Date,
    required: [true, 'Date is required'],
    validate: {
      validator: function(v) {
        return v <= new Date();
      },
      message: 'Attendance date cannot be in the future'
    }
  },
  subject: {
    type: String,
    required: [true, 'Subject is required']
  },
  stream: {
    type: String,
    required: [true, 'Stream is required'],
    uppercase: true
  },
  semester: {
    type: Number,
    required: [true, 'Semester is required'],
    min: 1,
    max: 8
  },
  
  // ✅ ENHANCED: Language group support
  isLanguageSubject: {
    type: Boolean,
    default: false
  },
  languageType: {
    type: String,
    uppercase: true,
    enum: {
      values: ['KANNADA', 'HINDI', 'SANSKRIT', null],
      message: 'Invalid language type'
    },
    default: null
  },
  languageGroup: {
    type: String,
    uppercase: true,
    default: null
  },
  
  studentsPresent: {
    type: [String],
    default: [],
    validate: {
      validator: function(arr) {
        return arr.length <= this.totalPossibleStudents;
      },
      message: 'Present students cannot exceed total possible students'
    }
  },
  totalStudents: {
    type: Number,
    default: 0,
    min: 0
  },
  totalPossibleStudents: {
    type: Number,
    default: 0,
    min: 0
  },
  attendancePercentage: {
    type: Number,
    default: function() {
      if (this.totalPossibleStudents > 0) {
        return ((this.studentsPresent.length / this.totalPossibleStudents) * 100).toFixed(2);
      }
      return 0;
    }
  }
}, {
  timestamps: true
});

// ✅ FIXED: Add indexes for attendance
attendanceSchema.index({ date: 1, subject: 1, stream: 1, semester: 1 }, { unique: true });
attendanceSchema.index({ languageGroup: 1 });

// ✅ ENHANCED: Message Log Schema with WhatsApp Cloud API details
const messageLogSchema = new mongoose.Schema({
  date: {
    type: String,
    required: [true, 'Date is required'],
    validate: {
      validator: function(v) {
        return /^\d{4}-\d{2}-\d{2}$/.test(v);
      },
      message: 'Date must be in YYYY-MM-DD format'
    }
  },
  stream: {
    type: String,
    required: [true, 'Stream is required'],
    uppercase: true
  },
  semester: {
    type: Number,
    required: [true, 'Semester is required'],
    min: 1,
    max: 8
  },
  
  // ✅ ENHANCED: Language group messaging support
  languageGroup: {
    type: String,
    uppercase: true,
    default: null
  },
  
  messagesSent: {
    type: Number,
    default: 0,
    min: 0
  },
  messagesFailed: {
    type: Number,
    default: 0,
    min: 0
  },
  totalStudentsNotified: {
    type: Number,
    default: 0,
    min: 0
  },
  fullDayAbsentCount: {
    type: Number,
    default: 0,
    min: 0
  },
  partialDayAbsentCount: {
    type: Number,
    default: 0,
    min: 0
  },
  subjectsIncluded: [{
    type: String,
    required: true
  }],
  sentAt: {
    type: Date,
    default: Date.now
  },
  sentBy: {
    type: String,
    default: 'manual',
    enum: ['manual', 'manual-force', 'automated', 'cron']
  },
  
  // ✅ ENHANCED: WhatsApp Cloud API specific fields
  successRate: {
    type: Number,
    default: function() {
      const total = this.messagesSent + this.messagesFailed;
      return total > 0 ? ((this.messagesSent / total) * 100).toFixed(2) : 0;
    }
  },
  estimatedCost: {
    type: String,
    default: function() {
      // WhatsApp Cloud API: First 1000 messages free, then ₹0.04 per message
      const cost = this.messagesSent <= 1000 ? 0 : (this.messagesSent - 1000) * 0.04;
      return cost === 0 ? '₹0.00 (Free Tier)' : `₹${cost.toFixed(2)}`;
    }
  },
  provider: {
    type: String,
    default: 'WhatsApp Cloud API'
  },
  apiVersion: {
    type: String,
    default: 'v19.0'
  },
  processingTimeMs: {
    type: Number,
    default: 0
  },
  
  whatsappResults: [{
    studentID: {
      type: String,
      required: true
    },
    studentName: {
      type: String,
      required: true
    },
    parentPhone: String,
    success: {
      type: Boolean,
      required: true
    },
    messageType: {
      type: String,
      enum: ['full_day', 'partial_day'],
      required: true
    },
    error: String,
    messageId: String,        // WhatsApp Cloud API message ID
    whatsappId: String,       // WhatsApp message identifier (wamid)
    apiErrorCode: Number,     // Specific Cloud API error codes
    languageGroup: String,
    timestamp: {
      type: Date,
      default: Date.now
    }
  }],
  
  analytics: {
    totalStudents: Number,
    presentStudents: Number,
    absentStudents: Number,
    attendanceRate: String
  }
}, {
  timestamps: true
});

// ✅ FIXED: Add indexes for message logs
messageLogSchema.index({ date: 1, stream: 1, semester: 1 }, { unique: true });
messageLogSchema.index({ sentAt: -1 });

// ✅ FIXED: Enhanced Stream mappings with proper validation
const STREAM_MAPPINGS = {
  "BCA": "bca",
  "BBA": "bba", 
  "BCom": "bcom",
  "BCom Section B": "bcomsectionb",  // ✅ Fixed naming
  "BCom-BDA": "bcom-bda",              // ✅ Fixed hyphen
  "BCom A and F": "bcom_a_and_f"       // ✅ Consistent naming
};

// ✅ FIXED: Enhanced collection name function with better error handling
function getCollectionName(stream, semester, type) {
  if (!stream || !semester || !type) {
    throw new Error(`Missing required parameters: stream="${stream}", semester="${semester}", type="${type}"`);
  }
  
  const streamCode = STREAM_MAPPINGS[stream];
  if (!streamCode) {
    const validStreams = Object.keys(STREAM_MAPPINGS);
    throw new Error(`Invalid stream: "${stream}". Valid streams are: ${validStreams.join(', ')}`);
  }
  
  if (isNaN(semester) || parseInt(semester) < 1 || parseInt(semester) > 8) {
    throw new Error(`Invalid semester: "${semester}". Must be between 1-8`);
  }
  
  const collectionName = `${streamCode}_sem${semester}_${type}`;
  console.log(`🗂️ Generated collection name: "${collectionName}"`);
  return collectionName;
}

// ✅ ENHANCED: Model cache with better management
const modelCache = new Map();

// ✅ FIXED: Clear model cache function for testing
function clearModelCache() {
  modelCache.clear();
  console.log('🧹 Model cache cleared');
}

// ✅ ENHANCED: Student Model with better error handling
function getStudentModel(stream, sem) {
  if (!stream || !sem) {
    throw new Error("Stream and semester are required for student model");
  }
  
  try {
    const modelName = getCollectionName(stream, sem, "students");
    
    if (modelCache.has(modelName)) {
      return modelCache.get(modelName);
    }
    
    // Check if model already exists to avoid OverwriteModelError
    let model;
    if (mongoose.models[modelName]) {
      model = mongoose.models[modelName];
    } else {
      model = mongoose.model(modelName, studentSchema, modelName);
    }
    
    modelCache.set(modelName, model);
    console.log(`✅ Student model ready: ${modelName}`);
    return model;
  } catch (error) {
    console.error(`❌ Error creating student model: ${error.message}`);
    throw error;
  }
}

// ✅ ENHANCED: Subject Model with better error handling
function getSubjectModel(stream, sem) {
  if (!stream || !sem) {
    throw new Error("Stream and semester are required for subject model");
  }
  
  try {
    const modelName = getCollectionName(stream, sem, "subjects");
    
    if (modelCache.has(modelName)) {
      return modelCache.get(modelName);
    }
    
    let model;
    if (mongoose.models[modelName]) {
      model = mongoose.models[modelName];
    } else {
      model = mongoose.model(modelName, subjectSchema, modelName);
    }
    
    modelCache.set(modelName, model);
    console.log(`✅ Subject model ready: ${modelName}`);
    return model;
  } catch (error) {
    console.error(`❌ Error creating subject model: ${error.message}`);
    throw error;
  }
}

// ✅ ENHANCED: Attendance Model with better naming and error handling
function getAttendanceModel(stream, sem, subject) {
  if (!stream || !sem || !subject) {
    throw new Error("Stream, semester, and subject are required for attendance model");
  }
  
  try {
    const streamCode = STREAM_MAPPINGS[stream];
    if (!streamCode) {
      throw new Error(`Invalid stream: ${stream}`);
    }
    
    // ✅ IMPROVED: Better subject name sanitization
    const cleanSubject = subject
      .toLowerCase()
      .trim()
      .replace(/\s+/g, '_')           // Replace spaces with underscores
      .replace(/[^a-z0-9_]/g, '')     // Remove special characters
      .replace(/_{2,}/g, '_')         // Replace multiple underscores with single
      .replace(/^_|_$/g, '');         // Remove leading/trailing underscores
    
    if (!cleanSubject) {
      throw new Error(`Invalid subject name: ${subject}`);
    }
    
    const modelName = `${streamCode}_sem${sem}_${cleanSubject}_attendance`;
    
    if (modelCache.has(modelName)) {
      return modelCache.get(modelName);
    }
    
    let model;
    if (mongoose.models[modelName]) {
      model = mongoose.models[modelName];
    } else {
      model = mongoose.model(modelName, attendanceSchema, modelName);
    }
    
    modelCache.set(modelName, model);
    console.log(`✅ Attendance model ready: ${modelName}`);
    return model;
  } catch (error) {
    console.error(`❌ Error creating attendance model: ${error.message}`);
    throw error;
  }
}

// ✅ FIXED: Message Log Model with singleton pattern
function getMessageLogModel() {
  const modelName = 'message_logs';
  
  if (mongoose.models[modelName]) {
    return mongoose.models[modelName];
  }
  
  return mongoose.model(modelName, messageLogSchema, modelName);
}

// ✅ ENHANCED: Input Validation Middleware with better error messages
const validateParams = asyncHandler(async (req, res, next) => {
  const { stream, sem } = req.params;
  
  if (!stream) {
    const error = new Error("Stream parameter is required");
    error.statusCode = 400;
    throw error;
  }
  
  if (!sem) {
    const error = new Error("Semester parameter is required");
    error.statusCode = 400;
    throw error;
  }
  
  const semester = parseInt(sem);
  if (isNaN(semester) || semester < 1 || semester > 8) {
    const error = new Error(`Invalid semester: ${sem}. Must be between 1-8`);
    error.statusCode = 400;
    throw error;
  }
  
  const validStreams = Object.keys(STREAM_MAPPINGS);
  if (!validStreams.includes(stream)) {
    const error = new Error(`Invalid stream: ${stream}. Valid streams are: ${validStreams.join(', ')}`);
    error.statusCode = 400;
    throw error;
  }
  
  // Add validated values to request
  req.validatedParams = {
    stream,
    semester,
    streamCode: STREAM_MAPPINGS[stream]
  };
  
  next();
});

// ✅ ENHANCED: Helper functions with better error handling
const getActiveStudentQuery = () => ({
  $or: [
    { isActive: true },
    { isActive: { $exists: false } },
    { isActive: null }
  ]
});

// ✅ ENHANCED: Get students by language group with validation
const getStudentsByLanguage = async (Student, languageType = null) => {
  try {
    let query = getActiveStudentQuery();
    
    if (languageType) {
      const validLanguages = ['KANNADA', 'HINDI', 'SANSKRIT'];
      if (!validLanguages.includes(languageType.toUpperCase())) {
        throw new Error(`Invalid language type: ${languageType}. Valid types: ${validLanguages.join(', ')}`);
      }
      
      query.languageSubject = languageType.toUpperCase();
    }
    
    const students = await Student.find(query)
      .sort({ studentID: 1 })
      .select('studentID name parentPhone languageSubject languageGroup')
      .lean();
    
    console.log(`📚 Found ${students.length} students${languageType ? ` for language: ${languageType}` : ''}`);
    return students;
  } catch (error) {
    console.error(`❌ Error getting students by language: ${error.message}`);
    throw error;
  }
};

// ✅ ENHANCED: Get subjects by type with better validation
const getSubjectsByType = async (Subject, subjectType = null, languageType = null) => {
  try {
    let query = { isActive: { $ne: false } };
    
    if (subjectType) {
      const validTypes = ['CORE', 'ELECTIVE', 'LANGUAGE', 'OPTIONAL'];
      if (!validTypes.includes(subjectType.toUpperCase())) {
        throw new Error(`Invalid subject type: ${subjectType}. Valid types: ${validTypes.join(', ')}`);
      }
      query.subjectType = subjectType.toUpperCase();
    }
    
    if (languageType) {
      const validLanguages = ['KANNADA', 'HINDI', 'SANSKRIT'];
      if (!validLanguages.includes(languageType.toUpperCase())) {
        throw new Error(`Invalid language type: ${languageType}. Valid types: ${validLanguages.join(', ')}`);
      }
      query.languageType = languageType.toUpperCase();
      query.isLanguageSubject = true;
    }
    
    const subjects = await Subject.find(query)
      .sort({ subjectName: 1 })
      .select('subjectName subjectType isLanguageSubject languageType')
      .lean();
    
    console.log(`📖 Found ${subjects.length} subjects${subjectType ? ` of type: ${subjectType}` : ''}${languageType ? ` for language: ${languageType}` : ''}`);
    return subjects;
  } catch (error) {
    console.error(`❌ Error getting subjects by type: ${error.message}`);
    throw error;
  }
};

// ✅ FIXED: WhatsApp Cloud API message sending function
const sendWhatsAppMessage = async (phone, message) => {
  try {
    console.log(`📱 Sending WhatsApp message via Cloud API to: ${phone}`);
    const result = await WhatsAppService.sendTextMessage(phone, message);
    
    if (result.success) {
      console.log(`✅ WhatsApp Cloud API message sent successfully. ID: ${result.messageId}`);
    } else {
      console.error(`❌ WhatsApp Cloud API message failed: ${result.error}`);
    }
    
    return result;
  } catch (error) {
    console.error(`❌ Error sending WhatsApp message: ${error.message}`);
    return {
      success: false,
      error: error.message,
      provider: 'WhatsApp Cloud API'
    };
  }
};
// ✅ ADD THIS FUNCTION DEFINITION AT THE TOP OF YOUR ROUTES FILE
function validateSingleDate(dateStr) {
  const errors = [];
  
  // Basic format check
  const isoRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!isoRegex.test(dateStr)) {
    errors.push('Invalid format - use YYYY-MM-DD');
  }
  
  // Date parsing check
  try {
    const date = new Date(dateStr + 'T00:00:00.000Z');
    if (isNaN(date.getTime())) {
      errors.push('Invalid date value');
    }
    
    // Date range check (1 year back to 1 year forward)
    if (errors.length === 0) {
      const today = new Date();
      const oneYearAgo = new Date(today.getFullYear() - 1, today.getMonth(), today.getDate());
      const oneYearFromNow = new Date(today.getFullYear() + 1, today.getMonth(), today.getDate());
      
      if (date < oneYearAgo) {
        errors.push('Date too far in past (>1 year)');
      } else if (date > oneYearFromNow) {
        errors.push('Date too far in future (>1 year)');
      }
    }
  } catch (error) {
    errors.push(`Date parsing error: ${error.message}`);
  }
  
  return {
    isValid: errors.length === 0,
    errors: errors
  };
}

// ✅ ALTERNATIVE: Simple date validation if the above doesn't work
function validateSingleDateSimple(dateStr) {
  // Basic format check
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return {
      isValid: false,
      errors: ['Invalid format - use YYYY-MM-DD']
    };
  }
  
  // Date parsing check
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) {
    return {
      isValid: false,
      errors: ['Invalid date value']
    };
  }
  
  return {
    isValid: true,
    errors: []
  };
}

// ===== ROUTE DEFINITIONS START HERE =====

// ✅ FIXED: Simple promotion system with BCom Section B support
router.post("/simple-promotion/:stream", asyncHandler(async (req, res) => {
  const { stream } = req.params;
  
  // ✅ Updated stream validation
  const validStreams = ['BCA', 'BBA', 'BCom', 'BCom Section B', 'BCom-BDA', 'BCom A and F'];
  if (!stream || !validStreams.includes(stream)) {
    return res.status(400).json({
      success: false,
      message: `Invalid stream. Must be one of: ${validStreams.join(', ')}`
    });
  }
  
  console.log(`Starting simple promotion for ${stream.toUpperCase()}`);
  
  const promotionDate = new Date();
  const promotionBatch = `simple_promotion_${stream.replace(/\s+/g, '_')}_${Date.now()}`;
  let totalPromoted = 0;
  let totalGraduated = 0;
  const promotionDetails = [];
  
  // ✅ Handle BCom Section B (only semesters 5-6)
  let semesterRange;
  if (stream === 'BCom Section B') {
    semesterRange = [5, 6];
    console.log('📚 Processing BCom Section B - Limited to semesters 5-6');
  } else {
    semesterRange = [1, 2, 3, 4, 5, 6];
    console.log('📚 Processing regular stream - Full semester range 1-6');
  }
  
  // Start transaction for data consistency
  const session = await mongoose.startSession();
  
  try {
    await session.withTransaction(async () => {
      
      // Step 1: Handle graduation (6th semester students)
      if (semesterRange.includes(6)) {
        try {
          const Semester6Students = getStudentModel(stream, 6);
          const semester6Count = await Semester6Students.countDocuments().session(session);
          
          if (semester6Count > 0) {
            // Get student details before deletion for logging
            const graduatingStudents = await Semester6Students.find({}).session(session);
            
            // Delete 6th semester students (graduated)
            await Semester6Students.deleteMany({}).session(session);
            totalGraduated = semester6Count;
            
            console.log(`Graduated ${totalGraduated} students from Semester 6`);
            promotionDetails.push({
              action: 'graduation',
              semester: 6,
              count: totalGraduated,
              students: graduatingStudents.map(s => ({ id: s.studentID, name: s.name }))
            });
          }
        } catch (error) {
          console.error(`Error handling Semester 6 graduation:`, error);
          // Continue with other semesters even if 6th semester fails
        }
      }
      
      // Step 2: Promote students
      const promotionPairs = [];
      if (stream === 'BCom Section B') {
        // BCom Section B: only 5→6 promotion
        promotionPairs.push({ from: 5, to: 6 });
      } else {
        // Regular streams: 5→6, 4→5, 3→4, 2→3, 1→2
        for (let fromSem = 5; fromSem >= 1; fromSem--) {
          promotionPairs.push({ from: fromSem, to: fromSem + 1 });
        }
      }
      
      for (const { from: fromSem, to: toSem } of promotionPairs) {
        try {
          const SourceStudent = getStudentModel(stream, fromSem);
          const TargetStudent = getStudentModel(stream, toSem);
          
          // Get all active students in source semester
          const studentsToPromote = await SourceStudent.find(getActiveStudentQuery()).session(session);
          
          console.log(`Promoting ${stream} Semester ${fromSem}→${toSem}: ${studentsToPromote.length} students`);
          
          if (studentsToPromote.length > 0) {
            // Create students in target semester
            const promotedStudents = studentsToPromote.map(student => ({
              studentID: student.studentID,
              name: student.name,
              stream: student.stream,
              semester: toSem,
              parentPhone: student.parentPhone,
              languageSubject: student.languageSubject,
              languageGroup: student.languageGroup,
              isActive: true,
              migrationGeneration: (student.migrationGeneration || 0) + 1,
              originalSemester: student.originalSemester || fromSem,
              addedToSemesterDate: promotionDate,
              lastMigrationDate: promotionDate,
              migrationBatch: promotionBatch,
              migrationHistory: [
                ...(student.migrationHistory || []),
                {
                  fromSemester: fromSem,
                  toSemester: toSem,
                  migratedDate: promotionDate,
                  migrationBatch: promotionBatch,
                  generation: (student.migrationGeneration || 0) + 1
                }
              ],
              academicYear: new Date().getFullYear().toString()
            }));
            
            // Insert all promoted students to target semester
            await TargetStudent.insertMany(promotedStudents, { session });
            
            // Remove students from source semester
            await SourceStudent.deleteMany({}).session(session);
            
            totalPromoted += studentsToPromote.length;
            
            promotionDetails.push({
              action: 'promotion',
              fromSemester: fromSem,
              toSemester: toSem,
              count: studentsToPromote.length,
              students: studentsToPromote.map(s => ({ id: s.studentID, name: s.name }))
            });
          }
        } catch (error) {
          console.error(`Error promoting from Semester ${fromSem} to ${toSem}:`, error);
          throw error; // Re-throw to abort transaction
        }
      }
      
    });
    
  } finally {
    await session.endSession();
  }
  
  console.log(`Simple promotion completed: ${totalPromoted} promoted, ${totalGraduated} graduated`);
  
  // ✅ Build promotion flow based on stream type
  let promotionFlow;
  if (stream === 'BCom Section B') {
    promotionFlow = [
      "Semester 5 → Semester 6",
      `Semester 6 → Graduated (${totalGraduated} students removed)`
    ];
  } else {
    promotionFlow = [
      "Semester 1 → Semester 2",
      "Semester 2 → Semester 3", 
      "Semester 3 → Semester 4",
      "Semester 4 → Semester 5",
      "Semester 5 → Semester 6",
      `Semester 6 → Graduated (${totalGraduated} students removed)`
    ];
  }
  
  res.json({
    success: true,
    message: `Simple Promotion Completed for ${stream.toUpperCase()}!`,
    stream: stream.toUpperCase(),
    streamType: stream === 'BCom Section B' ? 'Limited Stream (5-6)' : 'Full Stream (1-6)',
    promotionDate: promotionDate.toISOString(),
    promotionBatch: promotionBatch,
    totalPromoted: totalPromoted,
    totalGraduated: totalGraduated,
    promotionFlow: promotionFlow,
    promotionDetails: promotionDetails,
    note: stream === 'BCom Section B' 
      ? "BCom Section B students promoted. Only semester 5 is now empty for new admissions."
      : "All students moved up one semester. Semester 1 is now empty for new admissions."
  });
}));

// ✅ FIXED: GET Students Route with Language Fields
router.get("/students/:stream/sem:sem", validateParams, asyncHandler(async (req, res) => {
  const { stream, sem } = req.params;
  
  console.log(`👥 Loading students for: ${stream} Semester ${sem}`);
  
  const Student = getStudentModel(stream, sem);
  const query = getActiveStudentQuery();
  
  const students = await Student.find(query)
    .select('studentID name parentPhone stream semester migrationGeneration originalSemester languageSubject languageGroup')
    .sort({ studentID: 1 });
  
  // ✅ Group students by language for better organization
  const studentsByLanguage = students.reduce((acc, student) => {
    const lang = student.languageSubject || 'NO_LANGUAGE';
    if (!acc[lang]) acc[lang] = [];
    acc[lang].push(student);
    return acc;
  }, {});
  
  console.log(`✅ Found ${students.length} students in collection: ${Student.collection.name}`);
  
  res.json({
    success: true,
    count: students.length,
    stream: stream,
    semester: parseInt(sem),
    students: students,
    studentsByLanguage: studentsByLanguage,
    languageBreakdown: Object.keys(studentsByLanguage).map(lang => ({
      language: lang,
      count: studentsByLanguage[lang].length,
      students: studentsByLanguage[lang].map(s => ({ id: s.studentID, name: s.name }))
    })),
    collectionUsed: Student.collection.name
  });
}));

// ✅ FIXED: GET Subjects Route with Language Fields
router.get("/subjects/:stream/sem:sem", validateParams, asyncHandler(async (req, res) => {
  const { stream, sem } = req.params;
  
  console.log(`📚 Loading subjects for: ${stream} Semester ${sem}`);
  
  const Subject = getSubjectModel(stream, sem);
  const query = { isActive: { $ne: false } };
  
  const subjects = await Subject.find(query)
    .select('subjectName stream semester isActive subjectType isLanguageSubject languageType credits')
    .sort({ subjectName: 1 });
  
  // ✅ Separate core and language subjects
  const coreSubjects = subjects.filter(s => !s.isLanguageSubject);
  const languageSubjects = subjects.filter(s => s.isLanguageSubject);
  
  console.log(`✅ Found ${subjects.length} subjects in collection: ${Subject.collection.name}`);
  console.log(`   Core: ${coreSubjects.length}, Language: ${languageSubjects.length}`);
  
  res.json({
    success: true,
    count: subjects.length,
    stream: stream,
    semester: parseInt(sem),
    subjects: subjects,
    subjectsByType: {
      core: coreSubjects.map(s => ({
        name: s.subjectName,
        type: s.subjectType,
        credits: s.credits,
        attendanceType: 'ALL_STUDENTS'
      })),
      language: languageSubjects.map(s => ({
        name: s.subjectName,
        type: s.subjectType,
        languageType: s.languageType,
        credits: s.credits,
        attendanceType: 'LANGUAGE_FILTERED'
      }))
    },
    attendanceInfo: {
      coreSubjects: "All students attend together",
      languageSubjects: "Students filtered by language choice"
    },
    collectionUsed: Subject.collection.name
  });
}));

// ✅ FIXED: POST Mark Attendance with Language Subject Filtering
router.post("/attendance/:stream/sem:sem/:subject", validateParams, asyncHandler(async (req, res) => {
  const { stream, sem, subject } = req.params;
  const { date, studentsPresent, forceOverwrite } = req.body;

  if (!date || !subject || !Array.isArray(studentsPresent)) {
    return res.status(400).json({ 
      success: false,
      message: "Missing required fields: date, subject, studentsPresent (array)" 
    });
  }

  console.log(`📝 Marking attendance for: ${stream} Sem ${sem} - ${subject} on ${date}`);
  
  const Attendance = getAttendanceModel(stream, sem, subject);
  const Student = getStudentModel(stream, sem);
  const Subject = getSubjectModel(stream, sem);
  
  // ✅ Get subject details to determine filtering
  const subjectDoc = await Subject.findOne({ 
    subjectName: subject.toUpperCase(),
    isActive: { $ne: false }
  });
  
  if (!subjectDoc) {
    return res.status(404).json({
      success: false,
      message: `Subject "${subject}" not found in ${stream} Semester ${sem}`
    });
  }
  
  // ✅ KEY FIX: Filter students based on subject type
  let relevantStudents;
  let attendanceScope;
  
  if (subjectDoc.isLanguageSubject && subjectDoc.languageType) {
    // Language Subject: Only get students who chose this language
    relevantStudents = await Student.find({
      ...getActiveStudentQuery(),
      languageSubject: subjectDoc.languageType
    }, "studentID name parentPhone languageSubject languageGroup");
    
    attendanceScope = {
      type: 'LANGUAGE_FILTERED',
      language: subjectDoc.languageType,
      note: `Only ${subjectDoc.languageType} students`
    };
    
    console.log(`🔤 Language subject: Found ${relevantStudents.length} ${subjectDoc.languageType} students`);
    
  } else {
    // Core Subject: Get all students
    relevantStudents = await Student.find(
      getActiveStudentQuery(), 
      "studentID name parentPhone languageSubject languageGroup"
    );
    
    attendanceScope = {
      type: 'ALL_STUDENTS',
      language: null,
      note: 'All students attend together'
    };
    
    console.log(`📚 Core subject: Found ${relevantStudents.length} total students`);
  }

  const totalRelevantStudents = relevantStudents.length;

  if (totalRelevantStudents === 0) {
    return res.status(404).json({ 
      success: false,
      message: subjectDoc.isLanguageSubject ? 
        `No students found who chose ${subjectDoc.languageType}` :
        "No students found for this stream and semester"
    });
  }

  // ✅ Check for existing record
  if (!forceOverwrite) {
    const existingRecord = await Attendance.findOne({
      date: new Date(date),
      subject: subject
    });

    if (existingRecord) {
      return res.status(409).json({
        success: false,
        exists: true,
        message: "Attendance already taken for this subject and date",
        date: date,
        subject: subject,
        stream: stream,
        semester: sem,
        attendanceScope,
        existingData: {
          studentsPresent: existingRecord.studentsPresent,
          recordId: existingRecord._id,
          createdAt: existingRecord.createdAt
        }
      });
    }
  }

  // ✅ Validate that all present students are in the relevant student list
  const relevantStudentIDs = relevantStudents.map(s => s.studentID);
  const invalidStudents = studentsPresent.filter(id => !relevantStudentIDs.includes(id));
  
  if (invalidStudents.length > 0) {
    return res.status(400).json({
      success: false,
      message: `Invalid students for this ${subjectDoc.isLanguageSubject ? 'language ' : ''}subject`,
      invalidStudents,
      attendanceScope,
      hint: subjectDoc.isLanguageSubject ? 
        `Only ${subjectDoc.languageType} students can attend this subject` :
        "Only enrolled students can be marked present"
    });
  }
  
  const existingRecord = await Attendance.findOne({
    date: new Date(date),
    subject: subject
  });
  const isOverwrite = !!existingRecord;

  // ✅ Store attendance in database with language info
  const attendanceData = {
    date: new Date(date),
    subject: subject,
    stream: stream.toUpperCase(),
    semester: parseInt(sem),
    studentsPresent: studentsPresent,
    totalStudents: totalRelevantStudents,
    totalPossibleStudents: totalRelevantStudents,
    isLanguageSubject: subjectDoc.isLanguageSubject,
    languageType: subjectDoc.languageType || null,
    languageGroup: subjectDoc.isLanguageSubject ? 
      `${stream.toUpperCase()}_SEM${sem}_${subjectDoc.languageType}` : null
  };
  
  const record = await Attendance.findOneAndUpdate(
    { 
      date: new Date(date), 
      subject: subject 
    },
    { $set: attendanceData },
    { upsert: true, new: true }
  );

  // ✅ Update base attendance collection
  await BaseAttendance.findOneAndUpdate(
    {
      date: new Date(date).toISOString().slice(0, 10),
      stream: stream.toUpperCase(),
      semester: Number(sem),
      subject: subject,
    },
    {
      $set: {
        studentsPresent: studentsPresent,
        studentsTotal: totalRelevantStudents,
        isLanguageSubject: subjectDoc.isLanguageSubject,
        languageType: subjectDoc.languageType || null
      },
    },
    { upsert: true, new: true }
  );

  // ✅ Calculate absent students from relevant student pool
  const absentStudents = relevantStudents.filter(
    student => !studentsPresent.includes(student.studentID)
  );

  const absentWithPhone = absentStudents.filter(s => s.parentPhone).length;
  const absentWithoutPhone = absentStudents.filter(s => !s.parentPhone).length;

  console.log(`✅ Attendance ${isOverwrite ? 'updated' : 'marked'} for ${stream} Semester ${sem} - ${subject} on ${date}`);
  console.log(`   Attendance Scope: ${attendanceScope.note}`);
  console.log(`   Relevant Students: ${totalRelevantStudents}`);
  console.log(`   Present: ${studentsPresent.length}, Absent: ${absentStudents.length}`);
  console.log(`   Absent with phone: ${absentWithPhone}, Absent without phone: ${absentWithoutPhone}`);

  res.status(200).json({ 
    success: true,
    message: `✅ Attendance ${isOverwrite ? 'updated' : 'marked'} successfully for ${subjectDoc.isLanguageSubject ? 'language ' : ''}subject. Use manual messaging system to send WhatsApp notifications.`, 
    data: record,
    isOverwrite,
    subject: {
      name: subjectDoc.subjectName,
      type: subjectDoc.subjectType,
      isLanguageSubject: subjectDoc.isLanguageSubject,
      languageType: subjectDoc.languageType,
      credits: subjectDoc.credits
    },
    attendanceScope,
    summary: {
      totalRelevantStudents: totalRelevantStudents,
      presentStudents: studentsPresent.length,
      absentStudents: absentStudents.length,
      absentWithPhone: absentWithPhone,
      absentWithoutPhone: absentWithoutPhone,
      attendancePercentage: ((studentsPresent.length / totalRelevantStudents) * 100).toFixed(1),
      absentStudentsList: absentStudents.map(s => ({
        studentID: s.studentID,
        name: s.name,
        hasPhone: !!s.parentPhone,
        parentPhone: s.parentPhone ? 'Available' : 'Not Available',
        languageSubject: s.languageSubject || null
      }))
    },
    manualMessaging: {
      enabled: true,
      note: `Attendance data stored for ${attendanceScope.note.toLowerCase()}. Use manual messaging system to send consolidated WhatsApp messages.`,
      nextSteps: [
        "Go to Manual Messaging System",
        `Select ${stream} - Semester ${sem}`,
        subjectDoc.isLanguageSubject ? `Filter by ${subjectDoc.languageType} students` : "Include all students",
        `Set date to ${new Date(date).toLocaleDateString('en-IN')}`,
        "Click 'Send Messages Now' when ready"
      ]
    }
  });
}));
// ✅ FIXED: Manual Send Consolidated WhatsApp Messages (Updated for WhatsApp Cloud API)
router.post("/send-absence-messages/:stream/sem:sem/:date", 
  validateParams, 
  asyncHandler(async (req, res) => {
    const { stream, sem, date } = req.params;
    const { forceResend = false } = req.body;
    
    console.log(`📱 Manual messaging triggered for ${stream} Semester ${sem} on ${date}`);
    
    const startTime = Date.now();
    
    const Student = getStudentModel(stream, sem);
    const Subject = getSubjectModel(stream, sem);
    const MessageLog = getMessageLogModel();
    
    const dateKey = new Date(date).toISOString().slice(0, 10);
    
    // ✅ Enhanced duplicate prevention check
    if (!forceResend) {
      const existingLog = await MessageLog.findOne({
        date: dateKey,
        stream: stream.toUpperCase(),
        semester: parseInt(sem)
      });
      
      if (existingLog && existingLog.messagesSent > 0) {
        const formatDate = new Date(date).toLocaleDateString('en-IN', {
          day: '2-digit',
          month: '2-digit', 
          year: 'numeric'
        });
        
        return res.status(200).json({
          success: true,
          alreadySent: true,
          message: `📱 Messages already sent for ${stream} Semester ${sem} on ${formatDate}`,
          previousSendInfo: {
            date: formatDate,
            stream: stream.toUpperCase(),
            semester: sem,
            messagesSent: existingLog.messagesSent,
            messagesFailed: existingLog.messagesFailed,
            totalStudentsNotified: existingLog.totalStudentsNotified,
            sentAt: existingLog.sentAt,
            subjectsIncluded: existingLog.subjectsIncluded,
            sentBy: existingLog.sentBy,
            provider: existingLog.provider || 'WhatsApp Cloud API',
            lastSentAgo: Math.floor((Date.now() - new Date(existingLog.sentAt).getTime()) / (1000 * 60)) + ' minutes ago'
          },
          note: "Messages already sent. Use 'forceResend: true' to send again."
        });
      }
    }
    
    // ✅ Parallel data fetching for better performance
    const [allStudents, allSubjects] = await Promise.all([
      Student.find(getActiveStudentQuery(), "studentID name parentPhone languageSubject").lean(),
      Subject.find({ isActive: { $ne: false } }, "subjectName isLanguageSubject languageType").lean()
    ]);
    
    if (allStudents.length === 0 || allSubjects.length === 0) {
      return res.status(404).json({ 
        success: false,
        message: "No students or subjects found for this stream and semester",
        details: {
          studentsFound: allStudents.length,
          subjectsFound: allSubjects.length
        }
      });
    }
    
    // ✅ Optimized attendance record fetching with language support
    const attendancePromises = allSubjects.map(async (subject) => {
      try {
        const Attendance = getAttendanceModel(stream, sem, subject.subjectName);
        const record = await Attendance.findOne(
          { date: new Date(date) },
          { studentsPresent: 1, isLanguageSubject: 1, languageType: 1 }
        ).lean();
        
        return {
          subject: subject.subjectName,
          studentsPresent: record ? record.studentsPresent : [],
          hasAttendance: !!record,
          isLanguageSubject: subject.isLanguageSubject || false,
          languageType: subject.languageType || null,
          error: null
        };
      } catch (error) {
        console.warn(`⚠️ Error fetching attendance for ${subject.subjectName}:`, error.message);
        return {
          subject: subject.subjectName,
          studentsPresent: [],
          hasAttendance: false,
          isLanguageSubject: false,
          languageType: null,
          error: error.message
        };
      }
    });
    
    const allAttendanceRecords = await Promise.all(attendancePromises);
    const subjectsWithAttendance = allAttendanceRecords.filter(r => r.hasAttendance);
    
    if (subjectsWithAttendance.length === 0) {
      return res.status(400).json({
        success: false,
        message: `No attendance records found for ${date}. Please mark attendance first.`,
        suggestion: "Mark attendance for at least one subject before sending messages",
        availableSubjects: allSubjects.map(s => s.subjectName)
      });
    }
    
    // ✅ Enhanced absence calculation with language subject support
    const studentsToNotify = [];
    const presentStudentsSet = new Set();
    
    // Create attendance map for efficient lookup
    const attendanceMap = new Map(
      subjectsWithAttendance.map(record => [record.subject, new Set(record.studentsPresent)])
    );
    
    allStudents.forEach(student => {
      const absentSubjects = [];
      let presentSubjectCount = 0;
      let applicableSubjectCount = 0;
      
      subjectsWithAttendance.forEach(record => {
        // ✅ Check if student should attend this subject (language filtering)
        const shouldAttend = !record.isLanguageSubject || 
                            !record.languageType || 
                            student.languageSubject === record.languageType;
        
        if (shouldAttend) {
          applicableSubjectCount++;
          if (attendanceMap.get(record.subject).has(student.studentID)) {
            presentSubjectCount++;
            presentStudentsSet.add(student.studentID);
          } else {
            absentSubjects.push(record.subject);
          }
        }
      });
      
      if (absentSubjects.length > 0 && student.parentPhone && applicableSubjectCount > 0) {
        const isFullDayAbsent = absentSubjects.length === applicableSubjectCount;
        
        studentsToNotify.push({
          student: student,
          absentSubjects: absentSubjects,
          presentSubjects: presentSubjectCount,
          applicableSubjects: applicableSubjectCount,
          isFullDayAbsent: isFullDayAbsent,
          messageType: isFullDayAbsent ? 'full_day' : 'partial_day'
        });
      }
    });
    
    if (studentsToNotify.length === 0) {
      await MessageLog.findOneAndUpdate(
        {
          date: dateKey,
          stream: stream.toUpperCase(),
          semester: parseInt(sem)
        },
        {
          messagesSent: 0,
          messagesFailed: 0,
          totalStudentsNotified: 0,
          fullDayAbsentCount: 0,
          partialDayAbsentCount: 0,
          subjectsIncluded: subjectsWithAttendance.map(s => s.subject),
          sentAt: new Date(),
          sentBy: forceResend ? 'manual-force' : 'manual',
          provider: 'WhatsApp Cloud API',
          apiVersion: process.env.WHATSAPP_API_VERSION || 'v19.0',
          reason: 'no_absentees',
          summary: 'All students were present for all applicable subjects'
        },
        { upsert: true, new: true }
      );
      
      return res.status(200).json({
        success: true,
        message: `🎉 Excellent! No students with absences found for ${date}. All students were present!`,
        summary: {
          totalStudents: allStudents.length,
          subjectsWithAttendance: subjectsWithAttendance.length,
          studentsToNotify: 0,
          messagesSent: 0,
          presentStudents: presentStudentsSet.size,
          attendanceRate: ((presentStudentsSet.size / allStudents.length) * 100).toFixed(1) + '%'
        }
      });
    }
    
    // ✅ Enhanced message sending with cleaner templates
    const whatsappResults = [];
    const formatDate = new Date(date).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: '2-digit', 
      year: 'numeric'
    });
    
    console.log(`📱 Sending messages to ${studentsToNotify.length} students via WhatsApp Cloud API`);
    
    // ✅ Process messages in batches to respect rate limits
    const BATCH_SIZE = 3;
    const batches = [];
    
    for (let i = 0; i < studentsToNotify.length; i += BATCH_SIZE) {
      batches.push(studentsToNotify.slice(i, i + BATCH_SIZE));
    }
    
    let totalProcessed = 0;
    
    for (const batch of batches) {
      const batchPromises = batch.map(async (notificationData) => {
        const { student, absentSubjects, isFullDayAbsent, applicableSubjects } = notificationData;
        
        try {
          let message;
          
          if (isFullDayAbsent) {
            message = `*MLA ACADEMY - ATTENDANCE ALERT*

*FULL DAY ABSENCE*

Dear Parent/Guardian,

Your ward *${student.name}* (ID: ${student.studentID}) was absent for the entire day on ${formatDate}.

*Academic Details:*
• Class: ${stream.toUpperCase()} Semester ${sem}
• Total Classes Missed: ${absentSubjects.length}
• Date: ${formatDate}

*Action Required:*
Please contact the college office if:
• Your ward was present but not marked
• There was a medical emergency
• You need absence documentation

College Office: ${process.env.COLLEGE_PHONE || '+91-98866-65520'}
MLA Academy of Higher Learning

*This is an automated message from our Smart Attendance System*`;
          } else {
            message = `*MLA ACADEMY - ATTENDANCE ALERT*

*PARTIAL ABSENCE NOTICE*

Dear Parent/Guardian,

Your ward *${student.name}* (ID: ${student.studentID}) was absent for specific classes on ${formatDate}.

*Missing Classes:*
${absentSubjects.map((subj, index) => `${index + 1}. ${subj}`).join('\n')}

*Summary:*
• Class: ${stream.toUpperCase()} Semester ${sem}
• Classes Missed: ${absentSubjects.length}
• Classes Attended: ${notificationData.presentSubjects}
• Total Applicable: ${applicableSubjects}
• Date: ${formatDate}

For clarifications, contact: ${process.env.COLLEGE_PHONE || '+91-98866-65520'}
MLA Academy of Higher Learning

*This is an automated message from our Smart Attendance System*`;
          }

          const result = await sendWhatsAppMessage(student.parentPhone, message);
          
          return {
            studentID: student.studentID,
            studentName: student.name,
            parentPhone: student.parentPhone,
            success: result.success,
            messageId: result.messageId || null,
            whatsappId: result.whatsappId || null,
            error: result.error || null,
            apiErrorCode: result.apiError?.code || null,
            userFriendlyError: result.userFriendlyError || null,
            messageType: isFullDayAbsent ? 'full_day' : 'partial_day',
            absentSubjects: absentSubjects,
            subjectCount: absentSubjects.length,
            timestamp: new Date().toISOString(),
            languageSubject: student.languageSubject || null
          };

        } catch (error) {
          console.error(`❌ WhatsApp error for ${student.studentID}:`, error.message);
          return {
            studentID: student.studentID,
            studentName: student.name,
            parentPhone: student.parentPhone,
            success: false,
            error: error.message,
            messageType: isFullDayAbsent ? 'full_day' : 'partial_day',
            absentSubjects: absentSubjects,
            timestamp: new Date().toISOString()
          };
        }
      });

      const batchResults = await Promise.all(batchPromises);
      whatsappResults.push(...batchResults);
      
      totalProcessed += batch.length;
      console.log(`📊 Processed ${totalProcessed}/${studentsToNotify.length} messages`);
      
      // ✅ Delay between batches for WhatsApp Cloud API
      if (totalProcessed < studentsToNotify.length) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
    
    const successCount = whatsappResults.filter(r => r.success).length;
    const failureCount = whatsappResults.length - successCount;
    const fullDayCount = whatsappResults.filter(r => r.messageType === 'full_day' && r.success).length;
    const partialDayCount = whatsappResults.filter(r => r.messageType === 'partial_day' && r.success).length;
    
    // ✅ Calculate processing time
    const processingTimeMs = Date.now() - startTime;
    
    // ✅ Enhanced message logging with WhatsApp Cloud API details
    const messageLogData = {
      date: dateKey,
      stream: stream.toUpperCase(),
      semester: parseInt(sem),
      messagesSent: successCount,
      messagesFailed: failureCount,
      totalStudentsNotified: studentsToNotify.length,
      fullDayAbsentCount: fullDayCount,
      partialDayAbsentCount: partialDayCount,
      subjectsIncluded: subjectsWithAttendance.map(s => s.subject),
      sentAt: new Date(),
      sentBy: forceResend ? 'manual-force' : 'manual',
      successRate: whatsappResults.length > 0 ? ((successCount / whatsappResults.length) * 100).toFixed(1) : '0.0',
      provider: 'WhatsApp Cloud API',
      apiVersion: process.env.WHATSAPP_API_VERSION || 'v19.0',
      // ✅ WhatsApp Cloud API pricing
      estimatedCost: successCount <= 1000 ? '₹0.00 (Free Tier)' : `₹${((successCount - 1000) * 0.04).toFixed(2)}`,
      processingTimeMs: processingTimeMs,
      whatsappResults: whatsappResults.map(r => ({
        studentID: r.studentID,
        studentName: r.studentName,
        success: r.success,
        messageId: r.messageId,
        whatsappId: r.whatsappId,
        messageType: r.messageType,
        error: r.error,
        apiErrorCode: r.apiErrorCode,
        userFriendlyError: r.userFriendlyError,
        timestamp: r.timestamp,
        languageSubject: r.languageSubject
      })),
      analytics: {
        totalStudents: allStudents.length,
        presentStudents: presentStudentsSet.size,
        absentStudents: studentsToNotify.length,
        attendanceRate: ((presentStudentsSet.size / allStudents.length) * 100).toFixed(1),
        processingTimeMs: processingTimeMs
      }
    };
    
    await MessageLog.findOneAndUpdate(
      {
        date: dateKey,
        stream: stream.toUpperCase(),
        semester: parseInt(sem)
      },
      messageLogData,
      { upsert: true, new: true }
    );
    
    console.log(`✅ Manual messaging completed: ${successCount}/${whatsappResults.length} messages sent via WhatsApp Cloud API`);
    
    // ✅ Enhanced response with better error information
    res.json({
      success: true,
      message: successCount === whatsappResults.length 
        ? `✅ All absence messages sent successfully via WhatsApp Cloud API!` 
        : `⚠️ Messages sent with ${failureCount} failures`,
      date: formatDate,
      stream: stream.toUpperCase(),
      semester: sem,
      summary: {
        totalStudents: allStudents.length,
        subjectsWithAttendance: subjectsWithAttendance.length,
        studentsToNotify: studentsToNotify.length,
        messagesSent: successCount,
        messagesFailed: failureCount,
        successRate: whatsappResults.length > 0 ? ((successCount / whatsappResults.length) * 100).toFixed(1) + '%' : '0.0%',
        fullDayAbsent: fullDayCount,
        partialDayAbsent: partialDayCount,
        isForceResend: forceResend,
        attendanceRate: ((presentStudentsSet.size / allStudents.length) * 100).toFixed(1) + '%',
        estimatedCost: successCount <= 1000 ? '₹0.00 (Free Tier)' : `₹${((successCount - 1000) * 0.04).toFixed(2)}`,
        provider: 'WhatsApp Cloud API',
        apiVersion: process.env.WHATSAPP_API_VERSION || 'v19.0',
        processingTime: `${(processingTimeMs / 1000).toFixed(1)}s`
      },
      subjectsIncluded: subjectsWithAttendance.map(s => s.subject),
      whatsappResults: whatsappResults,
      triggeredAt: new Date().toISOString(),
      triggerType: forceResend ? 'manual-force' : 'manual',
      nextActions: {
        viewHistory: `/api/message-history/${stream}/sem${sem}`,
        viewSummary: `/api/daily-absence-summary/${stream}/sem${sem}/${date}`,
        retryFailed: failureCount > 0 ? `/api/send-absence-messages/${stream}/sem${sem}/${date}` : null
      },
      // ✅ Include failed message details for debugging
      failedMessages: failureCount > 0 ? whatsappResults.filter(r => !r.success) : []
    });
  })
);

// ✅ FIXED: GET Daily Absence Summary (Updated for WhatsApp Cloud API)
router.get("/daily-absence-summary/:stream/sem:sem/:date", 
  validateParams, 
  asyncHandler(async (req, res) => {
    const { stream, sem, date } = req.params;
    
    console.log(`📊 Getting daily absence summary for ${stream} Semester ${sem} on ${date}`);
    
    const Student = getStudentModel(stream, sem);
    const Subject = getSubjectModel(stream, sem);
    const MessageLog = getMessageLogModel();
    
    const dateKey = new Date(date).toISOString().slice(0, 10);
    
    const [messageLog, allStudents, allSubjects] = await Promise.all([
      MessageLog.findOne({
        date: dateKey,
        stream: stream.toUpperCase(),
        semester: parseInt(sem)
      }).lean(),
      Student.find(getActiveStudentQuery(), "studentID name parentPhone languageSubject").lean(),
      Subject.find({ isActive: { $ne: false } }, "subjectName isLanguageSubject languageType").lean()
    ]);
    
    if (allStudents.length === 0 || allSubjects.length === 0) {
      return res.status(404).json({ 
        success: false,
        message: "No students or subjects found for this stream and semester",
        details: {
          studentsFound: allStudents.length,
          subjectsFound: allSubjects.length
        }
      });
    }
    
    const attendancePromises = allSubjects.map(async (subject) => {
      try {
        const Attendance = getAttendanceModel(stream, sem, subject.subjectName);
        const record = await Attendance.findOne(
          { date: new Date(date) },
          { studentsPresent: 1, totalStudents: 1, createdAt: 1, isLanguageSubject: 1, languageType: 1 }
        ).lean();
        
        return {
          subject: subject.subjectName,
          studentsPresent: record ? record.studentsPresent : [],
          totalMarked: record ? record.studentsPresent.length : 0,
          hasAttendance: !!record,
          markedAt: record ? record.createdAt : null,
          isLanguageSubject: subject.isLanguageSubject || false,
          languageType: subject.languageType || null
        };
      } catch (error) {
        return {
          subject: subject.subjectName,
          studentsPresent: [],
          totalMarked: 0,
          hasAttendance: false,
          error: error.message,
          isLanguageSubject: false,
          languageType: null
        };
      }
    });
    
    const allAttendanceRecords = await Promise.all(attendancePromises);
    const subjectsWithAttendance = allAttendanceRecords.filter(r => r.hasAttendance);
    
    const attendanceMap = new Map(
      subjectsWithAttendance.map(record => [record.subject, new Set(record.studentsPresent)])
    );
    
    const absenceSummary = allStudents.map(student => {
      const absentSubjects = [];
      const presentSubjects = [];
      let applicableSubjectCount = 0;
      
      subjectsWithAttendance.forEach(record => {
        // ✅ Check if student should attend this subject (language filtering)
        const shouldAttend = !record.isLanguageSubject || 
                            !record.languageType || 
                            student.languageSubject === record.languageType;
        
        if (shouldAttend) {
          applicableSubjectCount++;
          if (attendanceMap.get(record.subject).has(student.studentID)) {
            presentSubjects.push(record.subject);
          } else {
            absentSubjects.push(record.subject);
          }
        }
      });
      
      const isFullDayAbsent = absentSubjects.length === applicableSubjectCount && applicableSubjectCount > 0;
      const attendancePercentage = applicableSubjectCount > 0 
        ? ((presentSubjects.length / applicableSubjectCount) * 100).toFixed(1)
        : '0.0';
      
      return {
        studentID: student.studentID,
        studentName: student.name,
        parentPhone: student.parentPhone,
        languageSubject: student.languageSubject || null,
        absentSubjects: absentSubjects,
        presentSubjects: presentSubjects,
        absentSubjectCount: absentSubjects.length,
        presentSubjectCount: presentSubjects.length,
        applicableSubjectCount: applicableSubjectCount,
        totalSubjectsWithAttendance: subjectsWithAttendance.length,
        attendancePercentage: attendancePercentage,
        isFullDayAbsent: isFullDayAbsent,
        isFullyPresent: absentSubjects.length === 0 && applicableSubjectCount > 0,
        messageType: isFullDayAbsent ? 'full_day' : absentSubjects.length > 0 ? 'partial_day' : 'present',
        willReceiveMessage: absentSubjects.length > 0 && student.parentPhone && applicableSubjectCount > 0,
        hasValidPhone: !!student.parentPhone
      };
    });
    
    const studentsToNotify = absenceSummary.filter(s => s.willReceiveMessage);
    const formatDate = new Date(date).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: '2-digit', 
      year: 'numeric'
    });
    
    const response = {
      success: true,
      date: formatDate,
      stream: stream.toUpperCase(),
      semester: sem,
      summary: {
        totalStudents: allStudents.length,
        totalSubjects: allSubjects.length,
        subjectsWithAttendance: subjectsWithAttendance.length,
        studentsToNotify: studentsToNotify.length,
        fullDayAbsent: absenceSummary.filter(s => s.isFullDayAbsent).length,
        partialDayAbsent: absenceSummary.filter(s => s.absentSubjectCount > 0 && !s.isFullDayAbsent).length,
        studentsPresent: absenceSummary.filter(s => s.isFullyPresent).length,
        // ✅ Updated cost calculation for WhatsApp Cloud API
        estimatedCost: studentsToNotify.length <= 1000 ? 
          '₹0.00 (Free Tier)' : 
          `₹${((studentsToNotify.length - 1000) * 0.04).toFixed(2)}`,
        provider: 'WhatsApp Cloud API'
      },
      absenceSummary: absenceSummary,
      subjects: allSubjects.map(s => ({
        name: s.subjectName,
        isLanguageSubject: s.isLanguageSubject,
        languageType: s.languageType
      })),
      subjectsWithAttendance: subjectsWithAttendance.map(s => ({
        subject: s.subject,
        totalMarked: s.totalMarked,
        markedAt: s.markedAt,
        isLanguageSubject: s.isLanguageSubject,
        languageType: s.languageType
      }))
    };
    
    // ✅ Enhanced message status with WhatsApp Cloud API details
    if (messageLog && messageLog.messagesSent > 0) {
      response.messageStatus = {
        alreadySent: true,
        sentAt: messageLog.sentAt,
        messagesSent: messageLog.messagesSent,
        messagesFailed: messageLog.messagesFailed,
        successRate: messageLog.successRate,
        totalStudentsNotified: messageLog.totalStudentsNotified,
        fullDayAbsentCount: messageLog.fullDayAbsentCount,
        partialDayAbsentCount: messageLog.partialDayAbsentCount,
        sentBy: messageLog.sentBy,
        provider: messageLog.provider || 'WhatsApp Cloud API',
        apiVersion: messageLog.apiVersion,
        estimatedCost: messageLog.estimatedCost,
        subjectsIncluded: messageLog.subjectsIncluded,
        timeSinceSent: Math.floor((Date.now() - new Date(messageLog.sentAt).getTime()) / (1000 * 60)) + ' minutes ago',
        note: "Messages have already been sent for this date. Use 'forceResend: true' to send again."
      };
    } else {
      response.messageStatus = {
        alreadySent: false,
        readyToSend: studentsToNotify.length > 0,
        provider: 'WhatsApp Cloud API',
        note: studentsToNotify.length > 0 
          ? `Ready to send ${studentsToNotify.length} messages via WhatsApp Cloud API`
          : "No messages needed - all students present!"
      };
    }
    
    response.actions = {
      sendMessages: `/api/send-absence-messages/${stream}/sem${sem}/${date}`,
      forceResend: `/api/send-absence-messages/${stream}/sem${sem}/${date}`,
      messageHistory: `/api/message-history/${stream}/sem${sem}`,
      downloadReport: `/api/absence-report/${stream}/sem${sem}/${date}`
    };
    
    res.json(response);
  })
);

// ✅ NEW: Get WhatsApp API Status and Configuration
router.get("/whatsapp-status", asyncHandler(async (req, res) => {
  const hasCredentials = !!(process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID);
  
  res.json({
    success: true,
    provider: 'WhatsApp Cloud API',
    apiVersion: process.env.WHATSAPP_API_VERSION || 'v19.0',
    configured: hasCredentials,
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID ? 'Configured' : 'Missing',
    accessToken: process.env.WHATSAPP_ACCESS_TOKEN ? 'Configured' : 'Missing',
    webhookConfigured: !!process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN,
    rateLimits: {
      messagesPerSecond: 20,
      messagesPerMinute: 1000,
      messagesPerDay: 100000
    },
    pricing: {
      freeTierMessages: 1000,
      costPerMessageAfterFreeTier: '₹0.04',
      billingCycle: 'Monthly'
    },
    features: [
      'Rich Message Templates',
      'Media Messages', 
      'Interactive Messages',
      'Webhook Support',
      'Read Receipts',
      'Message Status Updates'
    ]
  });
}));

// ✅ Add other routes (bulk upload, subject setup, etc.)
// ... [Include all other routes from the original file with the same fixes applied]

// ✅ ENHANCED: Export all functions and models
module.exports = {
  router,
  
  // Schemas
  studentSchema,
  subjectSchema,
  attendanceSchema,
  messageLogSchema,
  
  // Model functions
  getStudentModel,
  getSubjectModel,
  getAttendanceModel,
  getMessageLogModel,
  
  // Utility functions
  getCollectionName,
  validateParams,
  asyncHandler,
  clearModelCache,
  
  // Helper functions
  getActiveStudentQuery,
  getStudentsByLanguage,
  getSubjectsByType,
  sendWhatsAppMessage,
  
  // Constants
  STREAM_MAPPINGS
};
// ✅ FIXED: GET Attendance Register with Enhanced Validation and Sorting
router.get("/attendance-register/:stream/sem:sem/:subject", 
  validateParams, 
  asyncHandler(async (req, res) => {
    const { stream, sem, subject } = req.params;
    const startTime = Date.now();

    try {
      console.log(`📊 Getting attendance register for: ${subject} in ${stream} Sem ${sem}`);
      
      const Student = getStudentModel(stream, sem);
      const Subject = getSubjectModel(stream, sem);
      const Attendance = getAttendanceModel(stream, sem, subject);

      // ✅ Enhanced subject validation
      const subjectDoc = await Subject.findOne({ 
        subjectName: subject.toUpperCase(),
        isActive: { $ne: false }
      });

      if (!subjectDoc) {
        const availableSubjects = await Subject.find({ isActive: { $ne: false } }, 'subjectName').lean();
        return res.status(404).json({ 
          success: false,
          error: 'SUBJECT_NOT_FOUND',
          message: `Subject "${subject}" not found in ${stream} Semester ${sem}`,
          availableSubjects: availableSubjects.map(s => s.subjectName),
          suggestion: 'Please verify the subject name and try again'
        });
      }

      // ✅ Build comprehensive student query
      let studentQuery = getActiveStudentQuery();
      let attendanceScope;

      if (subjectDoc.isLanguageSubject && subjectDoc.languageType) {
        // Language Subject: Filter by language type
        studentQuery.languageSubject = subjectDoc.languageType;
        
        attendanceScope = {
          type: 'LANGUAGE_FILTERED',
          language: subjectDoc.languageType,
          note: `Only ${subjectDoc.languageType} students`,
          filterApplied: true
        };
        
        console.log(`🔤 Language subject filter: ${subjectDoc.languageType}`);
      } else {
        // Core Subject: All active students
        attendanceScope = {
          type: 'ALL_STUDENTS',
          language: null,
          note: 'All active students attend together',
          filterApplied: false
        };
        
        console.log(`📚 Core subject: Including all active students`);
      }

      // ✅ Fetch students with enhanced query
      let students = await Student.find(
        studentQuery, 
        "studentID name parentPhone languageSubject section migrationGeneration isActive createdAt"
      ).lean();

      if (students.length === 0) {
        return res.status(404).json({ 
          success: false,
          error: 'NO_STUDENTS_FOUND',
          message: subjectDoc.isLanguageSubject ? 
            `No students found who chose ${subjectDoc.languageType} language in ${stream} Semester ${sem}` :
            `No active students found in ${stream} Semester ${sem}`,
          attendanceScope,
          subjectInfo: {
            name: subjectDoc.subjectName,
            type: subjectDoc.isLanguageSubject ? 'Language Subject' : 'Core Subject',
            languageType: subjectDoc.languageType || null
          },
          suggestion: 'Check if students are enrolled and active in this semester'
        });
      }

      // ✅ Enhanced sorting with better alphanumeric handling
      students = students.sort((a, b) => {
        const aID = a.studentID;
        const bID = b.studentID;
        
        // Extract numeric parts for proper sorting
        const aNumMatch = aID.match(/\d+/);
        const bNumMatch = bID.match(/\d+/);
        
        if (aNumMatch && bNumMatch) {
          const aNum = parseInt(aNumMatch[0]);
          const bNum = parseInt(bNumMatch[0]);
          
          // If both have same prefix, sort by number
          const aPrefix = aID.substring(0, aNumMatch.index);
          const bPrefix = bID.substring(0, bNumMatch.index);
          
          if (aPrefix === bPrefix) {
            return aNum - bNum;
          }
        }
        
        // Fallback to alphanumeric comparison
        return aID.localeCompare(bID, undefined, {
          numeric: true,
          sensitivity: 'base'
        });
      });

      attendanceScope.totalPossible = students.length;
      console.log(`✅ Found ${students.length} students (sorted by Student ID)`);

      // ✅ Fetch attendance records with better error handling
      let attendanceRecords = [];
      try {
        attendanceRecords = await Attendance.find({
          subject: { $regex: new RegExp(`^${subject}$`, 'i') }
        }).sort({ date: 1 }).lean();
      } catch (attendanceError) {
        console.warn(`⚠️ Error fetching attendance records: ${attendanceError.message}`);
        // Continue with empty records - don't fail the entire request
      }

      console.log(`📅 Found ${attendanceRecords.length} attendance records for ${subject}`);

      // ✅ Build attendance map with enhanced filtering
      const attendanceMap = {};
      const studentIDs = new Set(students.map(s => s.studentID));

      attendanceRecords.forEach(record => {
        try {
          const dateKey = new Date(record.date).toISOString().split("T")[0];
          
          // Validate and filter present students
          const studentsPresent = Array.isArray(record.studentsPresent) ? record.studentsPresent : [];
          const filteredPresent = studentsPresent.filter(studentID => 
            studentID && typeof studentID === 'string' && studentIDs.has(studentID)
          );
          
          attendanceMap[dateKey] = filteredPresent;
          
          // Debug log for first few records
          if (Object.keys(attendanceMap).length <= 3) {
            console.log(`📊 ${dateKey}: ${filteredPresent.length}/${students.length} present`);
          }
        } catch (recordError) {
          console.warn(`⚠️ Error processing attendance record: ${recordError.message}`);
        }
      });

      // ✅ Calculate comprehensive statistics
      const totalDates = Object.keys(attendanceMap).length;
      const attendanceDates = Object.keys(attendanceMap).sort();
      
      let avgAttendance = 0;
      let studentAttendanceStats = [];

      if (students.length > 0 && totalDates > 0) {
        studentAttendanceStats = students.map(student => {
          const attendedCount = Object.values(attendanceMap).filter(datePresent => 
            datePresent.includes(student.studentID)
          ).length;
          const attendancePercentage = (attendedCount / totalDates) * 100;
          
          return {
            studentID: student.studentID,
            name: student.name,
            attendedDays: attendedCount,
            totalDays: totalDates,
            attendancePercentage: parseFloat(attendancePercentage.toFixed(1)),
            status: attendancePercentage >= 75 ? 'Good' : attendancePercentage >= 60 ? 'Average' : 'Poor'
          };
        });

        avgAttendance = (studentAttendanceStats.reduce((sum, stat) => 
          sum + stat.attendancePercentage, 0) / students.length).toFixed(1);
      }

      // ✅ Enhanced date range calculation
      const dateRange = attendanceDates.length > 0 ? {
        startDate: attendanceDates[0],
        endDate: attendanceDates[attendanceDates.length - 1],
        totalDays: attendanceDates.length,
        span: attendanceDates.length > 1 ? 
          Math.ceil((new Date(attendanceDates[attendanceDates.length - 1]) - new Date(attendanceDates[0])) / (1000 * 60 * 60 * 24)) + 1 
          : 1
      } : null;

      const processingTime = Date.now() - startTime;
      
      console.log(`✅ Register loaded: ${students.length} students, ${totalDates} dates, ${avgAttendance}% avg attendance`);

      // ✅ Comprehensive success response
      res.status(200).json({ 
        success: true,
        message: `Attendance register loaded successfully for ${subject}`,
        students: students, // Already sorted by Student ID
        attendanceMap, 
        subject: subject.toUpperCase(), 
        stream: stream.toUpperCase(), 
        semester: parseInt(sem),
        subjectInfo: {
          name: subjectDoc.subjectName,
          type: subjectDoc.subjectType || (subjectDoc.isLanguageSubject ? 'Language' : 'Core'),
          isLanguageSubject: subjectDoc.isLanguageSubject || false,
          languageType: subjectDoc.languageType || null,
          credits: subjectDoc.credits || null,
          isActive: subjectDoc.isActive !== false,
          description: subjectDoc.description || null
        },
        attendanceScope,
        summary: {
          totalStudents: students.length,
          totalDates: totalDates,
          averageAttendance: parseFloat(avgAttendance),
          attendanceRecords: attendanceRecords.length,
          dateRange,
          sortedBy: 'studentID',
          sortOrder: 'ascending',
          attendanceQuality: parseFloat(avgAttendance) >= 75 ? 'Good' : parseFloat(avgAttendance) >= 60 ? 'Average' : 'Poor'
        },
        studentStats: studentAttendanceStats.slice(0, 10), // First 10 for preview
        metadata: {
          processingTimeMs: processingTime,
          timestamp: new Date().toISOString(),
          appliedFilters: {
            stream: stream.toUpperCase(),
            semester: parseInt(sem),
            subject: subject.toUpperCase(),
            languageFilter: subjectDoc.languageType || 'None',
            activeOnly: true
          },
          cacheInfo: {
            cacheable: true,
            ttl: 300 // 5 minutes
          }
        }
      });

    } catch (error) {
      console.error("❌ Error fetching attendance register:", error);
      
      // Enhanced error response
      const errorResponse = {
        success: false,
        error: 'SERVER_ERROR',
        message: "Failed to fetch attendance register",
        subject: subject,
        stream: stream,
        semester: sem,
        timestamp: new Date().toISOString()
      };

      // Add specific error details in development
      if (process.env.NODE_ENV !== 'production') {
        errorResponse.details = {
          message: error.message,
          stack: error.stack,
          code: error.code
        };
      }

      res.status(500).json(errorResponse);
    }
  })
);
// ✅ FIXED: POST Bulk Attendance Update with Enhanced Validation and Error Handling
router.post("/update-attendance/:stream/sem:sem/:subject", 
  validateParams, 
  asyncHandler(async (req, res) => {
    const { stream, sem, subject } = req.params;
    const { attendanceMap } = req.body;
    const startTime = Date.now();

    console.log(`📊 Bulk update request for: ${subject} in ${stream} Sem ${sem}`);
    console.log(`📊 Attendance data received for ${Object.keys(attendanceMap || {}).length} dates`);

    // ✅ Enhanced input validation
    if (!attendanceMap || typeof attendanceMap !== "object") {
      return res.status(400).json({ 
        success: false,
        error: 'INVALID_INPUT_FORMAT',
        message: "Invalid attendance data. Expected object with date keys and student arrays.",
        expectedFormat: {
          attendanceMap: {
            "2025-09-13": ["1001", "1002"],
            "2025-09-14": ["1003", "1004"]
          }
        },
        receivedType: typeof attendanceMap,
        hint: "Ensure you're sending JSON with proper structure"
      });
    }

    const dates = Object.keys(attendanceMap);
    if (dates.length === 0) {
      return res.status(400).json({ 
        success: false,
        error: 'EMPTY_ATTENDANCE_DATA',
        message: "No attendance data provided",
        hint: "Include at least one date with student attendance data"
      });
    }

    // ✅ Enhanced date validation with better error reporting
    const dateValidationResults = [];
    const validDates = [];

    dates.forEach(dateStr => {
      const validation = validateSingleDate(dateStr);
      if (validation.isValid) {
        validDates.push(dateStr);
      } else {
        dateValidationResults.push({
          date: dateStr,
          issues: validation.errors
        });
      }
    });

    if (dateValidationResults.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_DATE_FORMAT',
        message: `Found ${dateValidationResults.length} invalid dates`,
        invalidDates: dateValidationResults,
        validDates: validDates,
        hint: "Use YYYY-MM-DD format for dates"
      });
    }

    try {
      const Student = getStudentModel(stream, sem);
      const Subject = getSubjectModel(stream, sem);
      const Attendance = getAttendanceModel(stream, sem, subject);

      // ✅ Enhanced subject validation
      const subjectDoc = await Subject.findOne({ 
        subjectName: subject.toUpperCase(),
        isActive: { $ne: false }
      });

      if (!subjectDoc) {
        return res.status(404).json({ 
          success: false,
          error: 'SUBJECT_NOT_FOUND',
          message: `Subject "${subject}" not found in ${stream} Semester ${sem}`,
          suggestion: 'Verify the subject name and ensure it exists in the database'
        });
      }

      // ✅ Enhanced student validation
      let validStudents;
      const studentQuery = getActiveStudentQuery();

      if (subjectDoc.isLanguageSubject && subjectDoc.languageType) {
        studentQuery.languageSubject = subjectDoc.languageType;
        validStudents = await Student.find(studentQuery, "studentID name").lean();
        console.log(`🔤 Language subject: Found ${validStudents.length} ${subjectDoc.languageType} students`);
      } else {
        validStudents = await Student.find(studentQuery, "studentID name").lean();
        console.log(`📚 Core subject: Found ${validStudents.length} students`);
      }

      if (validStudents.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'NO_STUDENTS_FOUND',
          message: subjectDoc.isLanguageSubject ? 
            `No students found who chose ${subjectDoc.languageType} language` :
            "No active students found for this stream and semester",
          subjectInfo: {
            name: subjectDoc.subjectName,
            type: subjectDoc.isLanguageSubject ? 'Language Subject' : 'Core Subject',
            languageType: subjectDoc.languageType || null
          }
        });
      }

      const validStudentIDs = validStudents.map(s => s.studentID);
      const validStudentIDsSet = new Set(validStudentIDs);

      // ✅ Enhanced student data validation
      const validationWarnings = [];
      const processedAttendanceMap = {};

      for (const [dateStr, studentsPresent] of Object.entries(attendanceMap)) {
        if (!Array.isArray(studentsPresent)) {
          return res.status(400).json({
            success: false,
            error: 'INVALID_STUDENT_DATA',
            message: `Invalid data for date ${dateStr}: Expected array of student IDs`,
            received: typeof studentsPresent
          });
        }

        const validStudentsForDate = [];
        const invalidStudentsForDate = [];

        studentsPresent.forEach(studentID => {
          const normalizedID = String(studentID).trim();
          
          if (!normalizedID) {
            invalidStudentsForDate.push({ id: studentID, issue: 'Empty student ID' });
          } else if (!validStudentIDsSet.has(normalizedID)) {
            invalidStudentsForDate.push({ id: studentID, issue: 'Student ID not found' });
          } else {
            validStudentsForDate.push(normalizedID);
          }
        });

        processedAttendanceMap[dateStr] = validStudentsForDate;

        if (invalidStudentsForDate.length > 0) {
          validationWarnings.push({
            date: dateStr,
            invalidStudents: invalidStudentsForDate,
            validCount: validStudentsForDate.length,
            invalidCount: invalidStudentsForDate.length
          });
        }
      }

      console.log(`👥 Processing ${validDates.length} dates for ${validStudentIDs.length} students`);
      if (validationWarnings.length > 0) {
        console.warn(`⚠️ Found validation warnings for ${validationWarnings.length} dates`);
      }

      // ✅ Enhanced database transaction with better error handling
      const session = await Student.db.startSession();
      const updateResults = [];
      let transactionError = null;

      try {
        await session.withTransaction(async () => {
          const updatePromises = validDates.map(async (dateStr) => {
            const studentsPresent = processedAttendanceMap[dateStr] || [];
            const dateObj = new Date(dateStr + 'T00:00:00.000Z'); // Force UTC
            
            console.log(`📅 Updating ${dateStr}: ${studentsPresent.length}/${validStudentIDs.length} present`);

            const result = await Attendance.findOneAndUpdate(
              { 
                date: dateObj, 
                subject: subject.toUpperCase()
              },
              { 
                $set: { 
                  studentsPresent: studentsPresent,
                  totalStudents: validStudentIDs.length,
                  presentCount: studentsPresent.length,
                  absentCount: validStudentIDs.length - studentsPresent.length,
                  stream: stream.toUpperCase(),
                  semester: parseInt(sem),
                  isLanguageSubject: subjectDoc.isLanguageSubject || false,
                  languageType: subjectDoc.languageType || null,
                  lastUpdated: new Date(),
                  updatedBy: req.user?.name || 'bulk_update',
                  updateMethod: 'bulk_attendance_update'
                }
              },
              { 
                upsert: true, 
                new: true,
                session
              }
            );

            return {
              date: dateStr,
              dateFormatted: new Date(dateStr).toLocaleDateString('en-IN'),
              totalStudents: validStudentIDs.length,
              presentStudents: studentsPresent.length,
              absentStudents: validStudentIDs.length - studentsPresent.length,
              attendanceRate: ((studentsPresent.length / validStudentIDs.length) * 100).toFixed(1),
              attendanceId: result._id,
              wasCreated: !result.lastUpdated || result.createdAt === result.updatedAt
            };
          });

          const results = await Promise.all(updatePromises);
          updateResults.push(...results);
        });

        console.log(`✅ Transaction completed successfully for ${validDates.length} dates`);

      } catch (error) {
        transactionError = error;
        console.error(`❌ Transaction failed: ${error.message}`);
      } finally {
        await session.endSession();
      }

      // Handle transaction failure
      if (transactionError) {
        return res.status(500).json({
          success: false,
          error: 'TRANSACTION_FAILED',
          message: 'Failed to update attendance due to database transaction error',
          details: process.env.NODE_ENV !== 'production' ? transactionError.message : 'Database error occurred',
          partialResults: updateResults.length > 0 ? updateResults : null
        });
      }

      // ✅ Calculate comprehensive summary
      const totalPresent = updateResults.reduce((sum, result) => sum + result.presentStudents, 0);
      const totalPossible = updateResults.length * validStudentIDs.length;
      const avgAttendance = totalPossible > 0 ? 
        (totalPresent / totalPossible * 100).toFixed(1) : '0.0';

      const processingTime = Date.now() - startTime;

      console.log(`✅ Bulk update completed: ${validDates.length} dates, ${avgAttendance}% avg attendance`);

      // ✅ Enhanced success response
      res.status(200).json({ 
        success: true,
        message: `✅ Attendance updated successfully for ${validDates.length} dates`,
        updatedDates: validDates.length,
        summary: {
          totalDates: validDates.length,
          totalStudents: validStudentIDs.length,
          averageAttendance: parseFloat(avgAttendance),
          totalPresentMarks: totalPresent,
          totalPossibleMarks: totalPossible,
          processingTimeMs: processingTime,
          successRate: '100%'
        },
        subjectInfo: {
          name: subjectDoc.subjectName,
          type: subjectDoc.subjectType || (subjectDoc.isLanguageSubject ? 'Language' : 'Core'),
          isLanguageSubject: subjectDoc.isLanguageSubject || false,
          languageType: subjectDoc.languageType || null
        },
        updateResults: updateResults,
        validationWarnings: validationWarnings.length > 0 ? {
          count: validationWarnings.length,
          details: validationWarnings,
          message: 'Some invalid student IDs were filtered out during processing'
        } : null,
        metadata: {
          requestedDates: dates.length,
          processedDates: validDates.length,
          skippedDates: dates.length - validDates.length,
          timestamp: new Date().toISOString(),
          stream: stream.toUpperCase(),
          semester: parseInt(sem),
          subject: subject.toUpperCase()
        }
      });

    } catch (error) {
      console.error("❌ Server error while updating attendance:", error);
      
      res.status(500).json({ 
        success: false,
        error: 'SERVER_ERROR',
        message: "Server error while updating attendance",
        details: process.env.NODE_ENV !== 'production' ? error.message : 'Internal server error',
        context: {
          subject: subject,
          stream: stream,
          semester: sem,
          requestedDates: dates.length,
          timestamp: new Date().toISOString()
        },
        stack: process.env.NODE_ENV !== 'production' ? error.stack : undefined
      });
    }
  })
);

// ✅ FIXED: Debug route with consistent format
router.get("/debug/test-bcom-mapping", asyncHandler(async (req, res) => {
  const stream = "BCom A and F";
  const semester = "5";
  
  try {
    // Test the mapping
    const studentCollection = getCollectionName(stream, semester, "students");
    const subjectCollection = getCollectionName(stream, semester, "subjects");
    
    // Test direct access to your collection
    const StudentModel = mongoose.model('TestBComStudents', studentSchema, 'bcom_a_and_f_sem5_students');
    const count = await StudentModel.countDocuments();
    const sample = await StudentModel.findOne();
    
    res.json({
      success: true,
      message: "Debug mapping test completed",
      mapping: {
        input: { stream, semester },
        output: {
          students: studentCollection,
          subjects: subjectCollection
        },
        expected: "bcom_a_and_f_sem5_students"
      },
      directAccess: {
        collectionName: "bcom_a_and_f_sem5_students",
        documentCount: count,
        sampleStudent: sample ? {
          studentID: sample.studentID,
          name: sample.name,
          isActive: sample.isActive
        } : null
      },
      mappingCorrect: studentCollection === "bcom_a_and_f_sem5_students"
    });
  } catch (error) {
    res.status(500).json({ 
      success: false,
      error: 'DEBUG_ERROR',
      message: "Debug test failed",
      details: error.message 
    });
  }
}));

// ✅ FIXED: Reports route with consistent format
router.get("/reports/student-subject-report/:stream/sem:sem", validateParams, asyncHandler(async (req, res) => {
  const { stream, sem } = req.params;
  
  try {
    console.log(`📊 Generating report for: ${stream} Semester ${sem}`);
    
    let studentCollectionName, subjectCollectionName;
    
    // Handle BCom A and F specifically
    if (stream === "BCom A and F" && sem === "5") {
      studentCollectionName = "bcom_a_and_f_sem5_students";
      subjectCollectionName = "bcom_a_and_f_sem5_subjects";
      console.log(`🎯 Using exact collection names for BCom A and F`);
    } else {
      // Use mapping function for other streams
      studentCollectionName = getCollectionName(stream, sem, "students");
      subjectCollectionName = getCollectionName(stream, sem, "subjects");
    }
    
    console.log(`🗂️ Collections: ${studentCollectionName}, ${subjectCollectionName}`);
    
    // Create models with exact collection names
    const StudentModel = mongoose.models[studentCollectionName] || 
      mongoose.model(studentCollectionName, studentSchema, studentCollectionName);
    const SubjectModel = mongoose.models[subjectCollectionName] || 
      mongoose.model(subjectCollectionName, subjectSchema, subjectCollectionName);
    
    // Fetch data
    const students = await StudentModel.find({ isActive: true }).lean();
    const subjects = await SubjectModel.find().lean();
    
    console.log(`✅ Found ${students.length} students and ${subjects.length} subjects`);
    
    if (students.length === 0) {
      return res.status(404).json({ 
        success: false,
        error: 'NO_STUDENTS_FOUND',
        message: `No students found in collection: ${studentCollectionName}` 
      });
    }
    
    // Build report data
    const reportData = {
      success: true,
      message: "Report generated successfully",
      stream: stream.toUpperCase(),
      semester: parseInt(sem),
      reportDate: new Date().toLocaleDateString('en-IN'),
      totalStudents: students.length,
      totalSubjects: subjects.length,
      subjects: subjects.map(s => s.subjectName),
      students: students.map(student => ({
        studentID: student.studentID,
        name: student.name,
        subjects: subjects.reduce((acc, subject) => {
          // Mock percentage for now - replace with actual attendance calculation
          acc[subject.subjectName] = {
            attended: Math.floor(Math.random() * 20) + 15,
            total: 30,
            percentage: Math.floor(Math.random() * 25) + 75 // 75-100%
          };
          return acc;
        }, {})
      }))
    };
    
    console.log(`🎉 Report generated successfully!`);
    res.json(reportData);
    
  } catch (error) {
    console.error(`❌ Report error:`, error);
    res.status(500).json({ 
      success: false,
      error: 'REPORT_ERROR',
      message: "Failed to generate report",
      details: error.message 
    });
  }
}));
// ✅ FIXED: Get Students for Selected Subject (Sorted by Student ID)
router.get("/attendance-students/:stream/sem:sem/:subject", 
  validateParams, 
  asyncHandler(async (req, res) => {
    const { stream, sem, subject } = req.params;

    try {
      console.log(`📊 Getting students for: ${subject} in ${stream} Sem ${sem}`);
      
      const Student = getStudentModel(stream, sem);
      const Subject = getSubjectModel(stream, sem);

      // ✅ Get subject details to determine filtering
      const subjectDoc = await Subject.findOne({ 
        subjectName: subject.toUpperCase(),
        isActive: { $ne: false }
      });

      if (!subjectDoc) {
        return res.status(404).json({ 
          success: false,
          message: `Subject "${subject}" not found in ${stream} Semester ${sem}`,
          availableSubjects: await Subject.find({ isActive: { $ne: false } }, 'subjectName').lean()
        });
      }

      // ✅ Build query based on subject type
      let studentQuery = getActiveStudentQuery();
      let studentsCount = 0;

      if (subjectDoc.isLanguageSubject && subjectDoc.languageType) {
        // Language Subject: Only get students who chose this language
        studentQuery.languageSubject = subjectDoc.languageType;
        console.log(`🔤 Filtering for ${subjectDoc.languageType} language students`);
      }

      // ✅ Fetch students with proper sorting by Student ID
      let students = await Student.find(
        studentQuery, 
        "studentID name parentPhone languageSubject section isActive"
      ).lean();

      // ✅ Enhanced sorting for mixed alphanumeric Student IDs
      students = students.sort((a, b) => {
        const aNum = parseInt(a.studentID);
        const bNum = parseInt(b.studentID);
        
        // If both are pure numbers, sort numerically
        if (!isNaN(aNum) && !isNaN(bNum) && 
            a.studentID === aNum.toString() && 
            b.studentID === bNum.toString()) {
          return aNum - bNum;
        }
        
        // Otherwise, sort alphanumerically (handles mixed formats)
        return a.studentID.localeCompare(b.studentID, undefined, {
          numeric: true,
          sensitivity: 'base'
        });
      });

      studentsCount = students.length;

      if (studentsCount === 0) {
        return res.status(404).json({
          success: false,
          message: subjectDoc.isLanguageSubject 
            ? `No students found for ${subjectDoc.languageType} language in ${stream} Semester ${sem}`
            : `No active students found in ${stream} Semester ${sem}`,
          subject: {
            name: subjectDoc.subjectName,
            type: subjectDoc.isLanguageSubject ? 'Language Subject' : 'Core Subject',
            languageType: subjectDoc.languageType || null
          }
        });
      }

      console.log(`✅ Found ${studentsCount} students (sorted by Student ID)`);

      // ✅ Enhanced response with sorting confirmation
      res.json({
        success: true,
        students: students,
        subject: {
          name: subjectDoc.subjectName,
          isLanguageSubject: subjectDoc.isLanguageSubject || false,
          languageType: subjectDoc.languageType || null,
          type: subjectDoc.subjectType || (subjectDoc.isLanguageSubject ? 'Language' : 'Core'),
          isActive: subjectDoc.isActive !== false
        },
        metadata: {
          totalStudents: studentsCount,
          stream: stream.toUpperCase(),
          semester: parseInt(sem),
          sortedBy: 'studentID',
          sortOrder: 'ascending',
          message: subjectDoc.isLanguageSubject 
            ? `${subjectDoc.languageType} language students only` 
            : 'All active students',
          appliedFilters: {
            stream,
            semester: sem,
            subject: subject.toUpperCase(),
            languageFilter: subjectDoc.languageType || 'None',
            activeOnly: true
          }
        },
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error("❌ Error fetching students:", error);
      res.status(500).json({ 
        success: false,
        message: "Failed to fetch students for subject",
        error: error.message,
        subject: subject,
        stream,
        semester: sem,
        timestamp: new Date().toISOString()
      });
    }
  })
);


module.exports = router;
