const { admin } = require('../config/firebase-admin');

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

module.exports = verifyToken;
