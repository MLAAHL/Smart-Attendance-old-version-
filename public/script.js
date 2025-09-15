// Global variables
let currentUser = null;
let teacherQueue = [];
let currentSubject = null;
let students = [];
let attendance = {};

// Firebase configuration (config.js)
const firebaseConfig = {
    // Your Firebase config here
    apiKey: "your-api-key",
    authDomain: "your-auth-domain",
    projectId: "your-project-id",
    // ... other config
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();

// Initialize app
document.addEventListener('DOMContentLoaded', function() {
    // Set today's date for attendance
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('attendanceDate').value = today;
    
    // Listen for auth state changes
    auth.onAuthStateChanged(function(user) {
        if (user) {
            currentUser = user;
            showDashboard();
        } else {
            showLogin();
        }
    });
    
    // Add event listeners
    setupEventListeners();
});

function setupEventListeners() {
    // Stream and semester change listeners
    document.getElementById('stream').addEventListener('change', handleStreamChange);
    document.getElementById('semester').addEventListener('change', handleSemesterChange);
    
    // Form submit listener
    document.getElementById('addSubjectForm').addEventListener('submit', handleAddSubject);
}

// Authentication functions
async function loginTeacher() {
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const loginBtn = document.getElementById('loginBtn');
    const errorDiv = document.getElementById('loginError');
    
    if (!email || !password) {
        showError('Please fill in all fields');
        return;
    }
    
    loginBtn.disabled = true;
    loginBtn.textContent = 'Logging in...';
    errorDiv.classList.add('hidden');
    
    try {
        await auth.signInWithEmailAndPassword(email, password);
    } catch (error) {
        showError('Invalid credentials. Please try again.');
        loginBtn.disabled = false;
        loginBtn.textContent = 'Login';
    }
}

function logoutTeacher() {
    auth.signOut();
}

function showLogin() {
    document.getElementById('loginScreen').classList.remove('hidden');
    document.getElementById('dashboardScreen').classList.add('hidden');
}

function showDashboard() {
    document.getElementById('loginScreen').classList.add('hidden');
    document.getElementById('dashboardScreen').classList.remove('hidden');
    document.getElementById('teacherName').textContent = currentUser.displayName || currentUser.email;
    loadTeacherQueue();
}

// Tab management
function showTab(tabName) {
    // Hide all tab contents
    document.getElementById('queueContent').classList.add('hidden');
    document.getElementById('addSubjectContent').classList.add('hidden');
    document.getElementById('attendanceContent').classList.add('hidden');
    
    // Reset tab buttons
    document.getElementById('queueTab').className = 'px-6 py-3 bg-white bg-opacity-20 border border-white border-opacity-30 text-white font-semibold rounded-full hover:bg-opacity-30 transition duration-200';
    document.getElementById('addSubjectTab').className = 'px-6 py-3 bg-white bg-opacity-20 border border-white border-opacity-30 text-white font-semibold rounded-full hover:bg-opacity-30 transition duration-200';
    
    // Show selected tab and update button style
    if (tabName === 'queue') {
        document.getElementById('queueContent').classList.remove('hidden');
        document.getElementById('queueTab').className = 'px-6 py-3 bg-white text-blue-600 font-semibold rounded-full transition duration-200';
    } else if (tabName === 'addSubject') {
        document.getElementById('addSubjectContent').classList.remove('hidden');
        document.getElementById('addSubjectTab').className = 'px-6 py-3 bg-white text-blue-600 font-semibold rounded-full transition duration-200';
    }
}

// Queue management functions
async function loadTeacherQueue() {
    try {
        const response = await fetch(`/api/teacher-queue/queue/${currentUser.uid}`);
        const data = await response.json();
        teacherQueue = data.subjects || [];
        renderQueue();
    } catch (error) {
        console.error('Error loading queue:', error);
        renderEmptyQueue();
    }
}

function renderQueue() {
    const queueList = document.getElementById('queueList');
    
    if (teacherQueue.length === 0) {
        renderEmptyQueue();
        return;
    }
    
    queueList.innerHTML = teacherQueue.map(subject => `
        <div class="bg-gray-50 border border-gray-200 rounded-lg p-4 hover:shadow-md transition duration-200">
            <div class="flex justify-between items-center">
                <div class="flex-1">
                    <h4 class="text-lg font-semibold text-gray-800 mb-2">${subject.subjectName}</h4>
                    <p class="text-gray-600 mb-1">${subject.stream} - Semester ${subject.semester}</p>
                    <p class="text-gray-500 text-sm mb-1">Code: ${subject.subjectCode}</p>
                    <p class="text-gray-400 text-xs">Added: ${new Date(subject.addedAt).toLocaleDateString()}</p>
                </div>
                <div class="flex space-x-3">
                    <button 
                        onclick="markAttendance('${subject._id}')"
                        class="px-4 py-2 bg-green-500 text-white text-sm font-semibold rounded-lg hover:bg-green-600 transition duration-200 flex items-center space-x-2"
                    >
                        <span>📝</span>
                        <span>Mark Attendance</span>
                    </button>
                    <button 
                        onclick="removeSubject('${subject._id}')"
                        class="px-4 py-2 bg-red-500 text-white text-sm font-semibold rounded-lg hover:bg-red-600 transition duration-200"
                    >
                        ❌
                    </button>
                </div>
            </div>
        </div>
    `).join('');
}

function renderEmptyQueue() {
    document.getElementById('queueList').innerHTML = `
        <div class="text-center py-12 text-gray-500">
            <div class="text-6xl mb-4">📚</div>
            <p class="text-lg mb-2">No subjects in queue</p>
            <p class="text-sm">Add subjects to start marking attendance</p>
        </div>
    `;
}

// Subject form handling
async function handleStreamChange() {
    const stream = document.getElementById('stream').value;
    const semester = document.getElementById('semester').value;
    
    if (stream && semester) {
        await loadAvailableSubjects(stream, semester);
    } else {
        document.getElementById('subjectGroup').classList.add('hidden');
    }
}

async function handleSemesterChange() {
    const stream = document.getElementById('stream').value;
    const semester = document.getElementById('semester').value;
    
    if (stream && semester) {
        await loadAvailableSubjects(stream, semester);
    } else {
        document.getElementById('subjectGroup').classList.add('hidden');
    }
}

async function loadAvailableSubjects(stream, semester) {
    try {
        const response = await fetch(`/api/teacher-queue/available-subjects/${stream}/${semester}`);
        const subjects = await response.json();
        
        const subjectSelect = document.getElementById('subject');
        subjectSelect.innerHTML = '<option value="">Select Subject</option>' + 
            subjects.map(subject => 
                `<option value="${subject.code}" data-name="${subject.name}">${subject.code} - ${subject.name}</option>`
            ).join('');
        
        document.getElementById('subjectGroup').classList.remove('hidden');
    } catch (error) {
        console.error('Error loading subjects:', error);
    }
}

async function handleAddSubject(e) {
    e.preventDefault();
    
    const stream = document.getElementById('stream').value;
    const semester = document.getElementById('semester').value;
    const subjectCode = document.getElementById('subject').value;
    const subjectName = document.getElementById('subject').selectedOptions[0]?.dataset.name;
    
    if (!stream || !semester || !subjectCode || !subjectName) {
        showMessage('Please fill in all fields', 'error');
        return;
    }
    
    const btn = document.getElementById('addSubjectBtn');
    btn.disabled = true;
    btn.textContent = 'Adding...';
    
    try {
        const response = await fetch('/api/teacher-queue/add-subject', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                teacherId: currentUser.uid,
                teacherName: currentUser.displayName || currentUser.email,
                stream,
                semester: parseInt(semester),
                subjectCode,
                subjectName
            }),
        });
        
        const result = await response.json();
        
        if (response.ok) {
            showMessage('Subject added to queue successfully!', 'success');
            document.getElementById('addSubjectForm').reset();
            document.getElementById('subjectGroup').classList.add('hidden');
            loadTeacherQueue();
        } else {
            showMessage(result.error || 'Error adding subject', 'error');
        }
    } catch (error) {
        showMessage('Error adding subject to queue', 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Add to Queue';
    }
}

// Attendance functions
async function markAttendance(subjectId) {
    currentSubject = teacherQueue.find(subject => subject._id === subjectId);
    
    if (!currentSubject) {
        alert('Subject not found');
        return;
    }
    
    // Update attendance header
    document.getElementById('attendanceSubjectName').textContent = currentSubject.subjectName;
    document.getElementById('attendanceSubjectInfo').textContent = `${currentSubject.stream} - Semester ${currentSubject.semester}`;
    
    // Show attendance tab
    showAttendanceTab();
    
    // Load students
    await loadStudents(currentSubject.stream, currentSubject.semester);
}

function showAttendanceTab() {
    document.getElementById('queueContent').classList.add('hidden');
    document.getElementById('addSubjectContent').classList.add('hidden');
    document.getElementById('attendanceContent').classList.remove('hidden');
}

async function loadStudents(stream, semester) {
    try {
        const response = await fetch(`/api/teacher-queue/students/${stream}/${semester}`);
        students = await response.json();
        
        // Initialize attendance
        attendance = {};
        students.forEach(student => {
            attendance[student.rollNumber] = false;
        });
        
        renderStudentsList();
        updateAttendanceCount();
    } catch (error) {
        console.error('Error loading students:', error);
        document.getElementById('studentsList').innerHTML = `
            <div class="p-8 text-center text-red-500">
                <p>Error loading students. Please try again.</p>
            </div>
        `;
    }
}

function renderStudentsList() {
    const studentsList = document.getElementById('studentsList');
    
    studentsList.innerHTML = students.map(student => `
        <div class="flex items-center p-3 border-b border-gray-200 hover:bg-gray-50">
            <label class="flex items-center cursor-pointer flex-1">
                <input 
                    type="checkbox" 
                    class="w-5 h-5 text-blue-600 rounded mr-4"
                    onchange="toggleAttendance('${student.rollNumber}')"
                    ${attendance[student.rollNumber] ? 'checked' : ''}
                >
                <div class="flex-1">
                    <p class="font-semibold text-gray-800">${student.name}</p>
                    <p class="text-sm text-gray-600">${student.rollNumber}</p>
                </div>
            </label>
        </div>
    `).join('');
}

function toggleAttendance(rollNumber) {
    attendance[rollNumber] = !attendance[rollNumber];
    updateAttendanceCount();
}

function updateAttendanceCount() {
    const presentCount = Object.values(attendance).filter(Boolean).length;
    const totalCount = students.length;
    
    document.getElementById('presentCount').textContent = presentCount;
    document.getElementById('totalCount').textContent = totalCount;
    
    // Update count color
    const countElement = document.getElementById('presentCount');
    if (presentCount === totalCount) {
        countElement.className = 'text-green-600 font-bold';
    } else if (presentCount > totalCount * 0.8) {
        countElement.className = 'text-blue-600 font-bold';
    } else {
        countElement.className = 'text-orange-600 font-bold';
    }
}

async function saveAttendance() {
    const attendanceDate = document.getElementById('attendanceDate').value;
    
    if (!attendanceDate) {
        alert('Please select a date');
        return;
    }
    
    const btn = document.getElementById('saveAttendanceBtn');
    btn.disabled = true;
    btn.textContent = 'Saving...';
    
    try {
        const attendanceData = {
            teacherId: currentUser.uid,
            teacherName: currentUser.displayName || currentUser.email,
            subject: currentSubject,
            date: attendanceDate,
            attendance: attendance,
            totalStudents: students.length,
            presentCount: Object.values(attendance).filter(Boolean).length
        };
        
        const response = await fetch('/api/attendance/save', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(attendanceData),
        });
        
        if (response.ok) {
            alert('Attendance saved successfully!');
            backToQueue();
        } else {
            alert('Error saving attendance');
        }
    } catch (error) {
        console.error('Error saving attendance:', error);
        alert('Error saving attendance');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Save Attendance';
    }
}

function backToQueue() {
    showTab('queue');
}

async function removeSubject(subjectId) {
    if (!confirm('Are you sure you want to remove this subject from your queue?')) {
        return;
    }
    
    try {
        const response = await fetch('/api/teacher-queue/remove-subject', {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                teacherId: currentUser.uid,
                subjectId: subjectId
            }),
        });
        
        if (response.ok) {
            loadTeacherQueue();
        } else {
            alert('Error removing subject');
        }
    } catch (error) {
        console.error('Error removing subject:', error);
        alert('Error removing subject');
    }
}

// Utility functions
function showError(message) {
    const errorDiv = document.getElementById('loginError');
    errorDiv.textContent = message;
    errorDiv.classList.remove('hidden');
}

function showMessage(message, type) {
    const messageDiv = document.getElementById('addSubjectMessage');
    messageDiv.textContent = message;
    messageDiv.className = `text-sm text-center ${type === 'success' ? 'text-green-600' : 'text-red-600'}`;
    messageDiv.classList.remove('hidden');
    
    setTimeout(() => {
        messageDiv.classList.add('hidden');
    }, 3000);
}
