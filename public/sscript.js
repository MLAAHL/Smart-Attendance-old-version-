
// Fetch and display student list
async function fetchStudents() {
    const tableBody = document.querySelector("#student-list tbody");
    tableBody.innerHTML = "<tr><td colspan='3'>Loading...</td></tr>"; // Show loading message

    try {
        // Dynamic API URL (Works for both local and Render)
        const API_BASE_URL = window.location.hostname.includes("localhost") 
            ? "http://localhost:9000" 
            : "https://attendance-co83.onrender.com"; 

        const res = await fetch(`${API_BASE_URL}/teacher/students`);

        if (!res.ok) {
            throw new Error(`Failed to fetch student data. Status: ${res.status}`);
        }

        const students = await res.json();
        tableBody.innerHTML = ""; // Clear loading message

        if (!Array.isArray(students) || students.length === 0) {
            tableBody.innerHTML = "<tr><td colspan='3'>No students found</td></tr>";
            return;
        }

        students.forEach(student => {
            if (!student.studentID || !student.name) return; // Ensure valid data
            
            const row = document.createElement("tr");
            row.innerHTML = `
                <td>${student.studentID}</td>
                <td>${student.name}</td>
                <td>
                    <input type="checkbox" class="student-checkbox" data-id="${student.studentID}">
                </td>
            `;
            tableBody.appendChild(row);
        });
    } catch (error) {
        tableBody.innerHTML = "<tr><td colspan='3' style='color:red;'>Error loading students</td></tr>";
        console.error("Error fetching students:", error);
    }
}

// Load students when the page loads
document.addEventListener("DOMContentLoaded", fetchStudents);
