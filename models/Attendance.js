const mongoose = require('mongoose');

const attendanceSchema = new mongoose.Schema({
  date: {
    type: Date,
    required: true
  },
  stream: {
    type: String,
    required: true
  },
  semester: {
    type: Number,
    required: true
  },
  subject: {
    type: String,
    required: true
  },
  studentsPresent: {
    type: [String],
    default: []
  },
  studentsTotal: {
    type: Number,
    required: true
  }
});

module.exports = mongoose.model('BaseAttendance', attendanceSchema);
