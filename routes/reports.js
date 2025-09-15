const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");

// ✅ FIXED: Enhanced Stream Mapping with BCom Section B
function getCollectionName(stream, semester, type) {
  const streamMappings = {
    "BCA": "bca",
    "BBA": "bba", 
    "BCom": "bcom",
    "BCom Section B": "bcomsectionb",  // ✅ ADDED - Missing stream
    "BCom-BDA": "bcom_bda",
    "BCom A and F": "bcom_a_and_f"
  };
  
  const streamCode = streamMappings[stream] || stream.toLowerCase().replace(/[\s&-]/g, "_");
  const collectionName = `${streamCode}_sem${semester}_${type}`;
  
  console.log(`🗂️ Mapped "${stream}" → "${collectionName}"`);
  return collectionName;
}

// ✅ Enhanced Student Model with better schema
function getStudentModel(stream, sem) {
  const modelName = getCollectionName(stream, sem, "students");
  
  if (mongoose.models[modelName]) {
    return mongoose.models[modelName];
  }
  
  const studentSchema = new mongoose.Schema({
    studentID: { type: String, required: true },
    name: { type: String, required: true },
    stream: { type: String, required: true },
    semester: { type: Number, required: true },
    parentPhone: String,
    isActive: { type: Boolean, default: true },
    migrationGeneration: { type: Number, default: 0 },
    originalSemester: Number,
    addedToSemesterDate: { type: Date, default: Date.now }
  }, { strict: false });
  
  return mongoose.model(modelName, studentSchema, modelName);
}

// ✅ Enhanced Subject Model
function getSubjectModel(stream, sem) {
  const modelName = getCollectionName(stream, sem, "subjects");
  
  if (mongoose.models[modelName]) {
    return mongoose.models[modelName];
  }
  
  const subjectSchema = new mongoose.Schema({
    subjectName: { type: String, required: true },
    stream: { type: String, required: true },
    semester: { type: Number, required: true },
    isActive: { type: Boolean, default: true }
  }, { strict: false });
  
  return mongoose.model(modelName, subjectSchema, modelName);
}

// ✅ Enhanced Attendance Model
function getAttendanceModel(stream, sem, subject) {
  const streamCode = getCollectionName(stream, sem, "").replace(`_sem${sem}_`, "");
  const cleanSubject = subject.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
  const modelName = `${streamCode}_sem${sem}_${cleanSubject}_attendance`;
  
  if (mongoose.models[modelName]) {
    return mongoose.models[modelName];
  }
  
  const attendanceSchema = new mongoose.Schema({
    date: { type: Date, required: true },
    subject: { type: String, required: true },
    stream: { type: String, required: true },
    semester: { type: Number, required: true },
    studentsPresent: { type: [String], default: [] },
    totalStudents: { type: Number, default: 0 }
  }, { timestamps: true });
  
  return mongoose.model(modelName, attendanceSchema, modelName);
}

// ✅ Helper function for active students query
const getActiveStudentQuery = () => ({
  $or: [
    { isActive: true },
    { isActive: { $exists: false } },
    { isActive: null }
  ]
});

// ✅ MAIN ROUTE: Generate Student-Subject Attendance Report
router.get("/student-subject-report/:stream/sem:sem", async (req, res) => {
  const { stream, sem } = req.params;
  
  // Input validation
  if (!stream || !sem) {
    return res.status(400).json({
      success: false,
      message: "Stream and semester are required"
    });
  }
  
  if (isNaN(sem) || parseInt(sem) < 1 || parseInt(sem) > 6) {
    return res.status(400).json({
      success: false,
      message: "Invalid semester. Must be between 1-6"
    });
  }
  
  const validStreams = ['BCA', 'BBA', 'BCom', 'BCom Section B', 'BCom-BDA', 'BCom A and F'];
  if (!validStreams.includes(stream)) {
    return res.status(400).json({
      success: false,
      message: `Invalid stream. Must be one of: ${validStreams.join(', ')}`
    });
  }
  
  try {
    console.log(`📊 Generating attendance report for ${stream} Semester ${sem}`);
    
    // Get models using proper mapping
    const Student = getStudentModel(stream, sem);
    const Subject = getSubjectModel(stream, sem);
    
    console.log(`🗂️ Using collections:`);
    console.log(`   Students: ${getCollectionName(stream, sem, "students")}`);
    console.log(`   Subjects: ${getCollectionName(stream, sem, "subjects")}`);
    
    // Fetch students and subjects
    const students = await Student.find(getActiveStudentQuery()).sort({ studentID: 1 });
    const subjects = await Subject.find({ isActive: { $ne: false } }).sort({ subjectName: 1 });
    
    console.log(`👥 Found ${students.length} students`);
    console.log(`📚 Found ${subjects.length} subjects`);
    
    if (students.length === 0) {
      return res.status(404).json({
        success: false,
        message: `No students found for ${stream} Semester ${sem}`,
        debug: {
          searchedCollection: getCollectionName(stream, sem, "students"),
          streamMapping: stream,
          availableStreams: validStreams
        }
      });
    }
    
    if (subjects.length === 0) {
      return res.status(404).json({
        success: false,
        message: `No subjects found for ${stream} Semester ${sem}`,
        debug: {
          searchedCollection: getCollectionName(stream, sem, "subjects"),
          streamMapping: stream
        }
      });
    }
    
    // Calculate attendance for each student in each subject
    const reportData = [];
    let totalAttendanceRecords = 0;
    
    for (const student of students) {
      const studentReport = {
        studentID: student.studentID,
        name: student.name,
        subjects: {}
      };
      
      for (const subject of subjects) {
        try {
          const Attendance = getAttendanceModel(stream, sem, subject.subjectName);
          
          // Get all attendance records for this subject up to current date
          const attendanceRecords = await Attendance.find({
            date: { $lte: new Date() },
            subject: subject.subjectName
          }).sort({ date: 1 });
          
          const totalClasses = attendanceRecords.length;
          const attendedClasses = attendanceRecords.filter(record => 
            record.studentsPresent && record.studentsPresent.includes(student.studentID)
          ).length;
          
          const percentage = totalClasses > 0 ? 
            parseFloat(((attendedClasses / totalClasses) * 100).toFixed(1)) : 0;
          
          studentReport.subjects[subject.subjectName] = {
            totalClasses,
            attendedClasses,
            percentage,
            absentClasses: totalClasses - attendedClasses
          };
          
          totalAttendanceRecords += totalClasses;
          
        } catch (error) {
          // Subject attendance collection doesn't exist or no data
          console.log(`⚠️ No attendance data for ${subject.subjectName}: ${error.message}`);
          studentReport.subjects[subject.subjectName] = {
            totalClasses: 0,
            attendedClasses: 0,
            percentage: 0,
            absentClasses: 0
          };
        }
      }
      
      reportData.push(studentReport);
    }
    
    // Calculate summary statistics
    let totalPercentageSum = 0;
    let totalEntries = 0;
    let excellentCount = 0; // >= 85%
    let goodCount = 0;      // 75-84%
    let poorCount = 0;      // < 75%
    
    reportData.forEach(student => {
      Object.values(student.subjects).forEach(subject => {
        if (subject.totalClasses > 0) {
          totalPercentageSum += subject.percentage;
          totalEntries++;
          
          if (subject.percentage >= 85) excellentCount++;
          else if (subject.percentage >= 75) goodCount++;
          else poorCount++;
        }
      });
    });
    
    const overallAverage = totalEntries > 0 ? 
      parseFloat((totalPercentageSum / totalEntries).toFixed(1)) : 0;
    
    console.log(`✅ Report generated successfully for ${stream} Sem ${sem}`);
    console.log(`📈 Statistics: ${excellentCount} excellent, ${goodCount} good, ${poorCount} poor performances`);
    
    res.json({
      success: true,
      stream: stream.toUpperCase(),
      semester: parseInt(sem),
      subjects: subjects.map(s => s.subjectName),
      students: reportData,
      totalStudents: students.length,
      totalSubjects: subjects.length,
      statistics: {
        overallAverage,
        excellentCount,
        goodCount,
        poorCount,
        totalAttendanceRecords
      },
      collections: {
        students: getCollectionName(stream, sem, "students"),
        subjects: getCollectionName(stream, sem, "subjects")
      },
      generatedAt: new Date().toISOString(),
      reportDate: new Date().toLocaleDateString('en-IN', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      })
    });
    
  } catch (error) {
    console.error("❌ Error generating student-subject report:", error);
    res.status(500).json({
      success: false,
      message: "Failed to generate attendance report",
      error: error.message,
      stream,
      semester: sem
    });
  }
});

// ✅ ROUTE: Get Available Streams and Semesters with Data
router.get("/available-data", async (req, res) => {
  try {
    console.log('🔍 Scanning for available data across all streams...');
    
    const availableData = {
      streams: [],
      semesters: {},
      summary: {}
    };
    
    // All supported streams including BCom Section B
    const allStreams = ['BCA', 'BBA', 'BCom', 'BCom Section B', 'BCom-BDA', 'BCom A and F'];
    
    for (const stream of allStreams) {
      let streamHasData = false;
      availableData.semesters[stream] = [];
      let totalStudents = 0;
      
      for (let sem = 1; sem <= 6; sem++) {
        try {
          const Student = getStudentModel(stream, sem);
          const studentCount = await Student.countDocuments(getActiveStudentQuery());
          
          if (studentCount > 0) {
            streamHasData = true;
            availableData.semesters[stream].push({
              semester: sem,
              studentCount
            });
            totalStudents += studentCount;
            console.log(`✅ Found ${studentCount} students in ${stream} Sem ${sem}`);
          }
        } catch (error) {
          console.log(`⚠️ No data for ${stream} Sem ${sem}: ${error.message}`);
          continue;
        }
      }
      
      if (streamHasData) {
        availableData.streams.push(stream);
        availableData.summary[stream] = {
          totalStudents,
          availableSemesters: availableData.semesters[stream].length
        };
      }
    }

    console.log(`📊 Data scan complete: ${availableData.streams.length} streams with data`);

    res.json({
      success: true,
      availableData,
      totalStreamsWithData: availableData.streams.length,
      generatedAt: new Date().toISOString()
    });
    
  } catch (error) {
    console.error("❌ Error getting available data:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get available data",
      error: error.message
    });
  }
});

// ✅ ROUTE: Debug Collection Access
router.get("/debug/test-collections/:stream/sem:sem", async (req, res) => {
  const { stream, sem } = req.params;
  
  try {
    const studentCollection = getCollectionName(stream, sem, "students");
    const subjectCollection = getCollectionName(stream, sem, "subjects");
    
    const Student = getStudentModel(stream, sem);
    const Subject = getSubjectModel(stream, sem);
    
    const studentCount = await Student.countDocuments();
    const subjectCount = await Subject.countDocuments();
    const activeStudentCount = await Student.countDocuments(getActiveStudentQuery());
    
    // Test a sample subject attendance collection
    let sampleAttendanceData = null;
    if (subjectCount > 0) {
      const sampleSubject = await Subject.findOne();
      if (sampleSubject) {
        try {
          const Attendance = getAttendanceModel(stream, sem, sampleSubject.subjectName);
          const attendanceCount = await Attendance.countDocuments();
          sampleAttendanceData = {
            subject: sampleSubject.subjectName,
            attendanceRecords: attendanceCount,
            collection: `${getCollectionName(stream, sem, "").replace(`_sem${sem}_`, "")}_sem${sem}_${sampleSubject.subjectName.toLowerCase().replace(/\s+/g, "_")}_attendance`
          };
        } catch (error) {
          sampleAttendanceData = {
            subject: sampleSubject.subjectName,
            error: error.message
          };
        }
      }
    }

    res.json({
      success: true,
      stream,
      semester: parseInt(sem),
      collections: {
        students: {
          name: studentCollection,
          totalCount: studentCount,
          activeCount: activeStudentCount
        },
        subjects: {
          name: subjectCollection,
          count: subjectCount
        }
      },
      sampleAttendanceData,
      hasData: studentCount > 0 && subjectCount > 0,
      mapping: {
        originalStream: stream,
        mappedStream: getCollectionName(stream, sem, "").replace(`_sem${sem}_`, "")
      }
    });
    
  } catch (error) {
    console.error("❌ Debug test error:", error);
    res.status(500).json({
      success: false,
      error: error.message,
      stream,
      semester: sem
    });
  }
});

// ✅ ROUTE: Get Detailed Subject Analysis
router.get("/subject-analysis/:stream/sem:sem", async (req, res) => {
  const { stream, sem } = req.params;
  
  try {
    const Subject = getSubjectModel(stream, sem);
    const subjects = await Subject.find({ isActive: { $ne: false } });
    
    const subjectAnalysis = [];
    
    for (const subject of subjects) {
      try {
        const Attendance = getAttendanceModel(stream, sem, subject.subjectName);
        const totalRecords = await Attendance.countDocuments();
        const dateRange = await Attendance.aggregate([
          {
            $group: {
              _id: null,
              minDate: { $min: "$date" },
              maxDate: { $max: "$date" }
            }
          }
        ]);
        
        subjectAnalysis.push({
          subjectName: subject.subjectName,
          totalAttendanceRecords: totalRecords,
          dateRange: dateRange[0] || null,
          collection: `${getCollectionName(stream, sem, "").replace(`_sem${sem}_`, "")}_sem${sem}_${subject.subjectName.toLowerCase().replace(/\s+/g, "_")}_attendance`
        });
        
      } catch (error) {
        subjectAnalysis.push({
          subjectName: subject.subjectName,
          totalAttendanceRecords: 0,
          error: error.message
        });
      }
    }
    
    res.json({
      success: true,
      stream,
      semester: parseInt(sem),
      subjectAnalysis,
      totalSubjects: subjects.length
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
