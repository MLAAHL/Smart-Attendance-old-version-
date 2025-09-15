const admin = require('firebase-admin');
const path = require('path');

// Path to your service account key file
const serviceAccountPath = path.join(__dirname, '../firebase-service-account-key.json');

let app;
try {
  // Check if Firebase app is already initialized
  if (!admin.apps.length) {
    app = admin.initializeApp({
      credential: admin.credential.cert(require(serviceAccountPath)),
      projectId: "smart-attendance-a9ab4"
    });
    console.log('✅ Firebase Admin initialized successfully');
  } else {
    app = admin.app();
  }
} catch (error) {
  console.error('❌ Firebase Admin initialization failed:', error);
  console.error('Make sure firebase-service-account-key.json exists in your project root');
  process.exit(1);
}

module.exports = { admin, app };
