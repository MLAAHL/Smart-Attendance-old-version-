const axios = require('axios');
require('dotenv').config();

class WhatsAppService {
  constructor() {
    this.accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
    this.phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    this.apiVersion = process.env.WHATSAPP_API_VERSION || 'v19.0';
    this.collegeName = process.env.COLLEGE_NAME || 'MLA Academy of Higher Learning';
    this.collegePhone = process.env.COLLEGE_PHONE || '+91-98866-65520';
    this.baseURL = `https://graph.facebook.com/${this.apiVersion}/${this.phoneNumberId}`;
    
    if (!this.accessToken || !this.phoneNumberId) {
      throw new Error('❌ Missing WHATSAPP_ACCESS_TOKEN or WHATSAPP_PHONE_NUMBER_ID in environment variables');
    }

    console.log(`✅ WhatsApp Service initialized with API version ${this.apiVersion}`);
    console.log(`📱 Phone Number ID: ${this.phoneNumberId}`);
    console.log(`🏫 College: ${this.collegeName}`);
    
    // Check token health on initialization
    this.checkTokenHealth();
  }

  /**
   * ✅ Enhanced phone number formatting for Indian numbers
   */
  formatPhoneNumber(phone) {
    if (!phone) return null;
    
    // Remove all non-numeric characters
    let cleanPhone = phone.toString().replace(/[^0-9]/g, '');
    
    // Handle different Indian number formats
    if (cleanPhone.startsWith('91') && cleanPhone.length === 12) {
      return cleanPhone; // Already has country code
    } else if (cleanPhone.length === 10 && cleanPhone.match(/^[6-9]/)) {
      return '91' + cleanPhone; // Add India country code
    } else if (cleanPhone.startsWith('0') && cleanPhone.length === 11) {
      return '91' + cleanPhone.substring(1); // Remove leading 0 and add country code
    } else if (cleanPhone.startsWith('+91') && cleanPhone.length === 13) {
      return cleanPhone.substring(1); // Remove + symbol
    }
    
    return cleanPhone; // Return as-is for other formats
  }

  /**
   * ✅ Check token health and warn about expiration
   */
  async checkTokenHealth() {
    try {
      const response = await axios.get(`https://graph.facebook.com/me?access_token=${this.accessToken}`);
      console.log('✅ Access token is healthy');
      return { healthy: true, data: response.data };
    } catch (error) {
      if (error.response?.status === 401) {
        console.error('🚨 ACCESS TOKEN EXPIRED - Please update your token!');
        console.error('📝 Update WHATSAPP_ACCESS_TOKEN in your .env file');
        return { healthy: false, expired: true };
      }
      console.warn('⚠️ Token health check failed:', error.message);
      return { healthy: false, error: error.message };
    }
  }

  /**
   * ✅ Enhanced text message sending with better error handling
   */
  async sendTextMessage(phone, message) {
    const formattedPhone = this.formatPhoneNumber(phone);
    
    if (!formattedPhone) {
      return {
        success: false,
        error: 'Invalid phone number format',
        recipientPhone: phone
      };
    }

    console.log(`📱 Sending WhatsApp message via Cloud API to: ${phone}`);
    console.log(`📱 Sending text message to ${formattedPhone}`);
    
    try {
      const payload = {
        messaging_product: "whatsapp",
        to: formattedPhone,
        type: "text",
        text: {
          body: message
        }
      };

      const response = await axios.post(
        `${this.baseURL}/messages`,
        payload,
        {
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json'
          },
          timeout: 30000
        }
      );

      console.log(`✅ WhatsApp Cloud API message sent successfully. ID: ${response.data.messages?.[0]?.id}`);

      return {
        success: true,
        messageId: response.data.messages?.[0]?.id || null,
        whatsappId: response.data.messages?.[0]?.wamid || null,
        recipientPhone: formattedPhone,
        timestamp: new Date().toISOString(),
        provider: 'WhatsApp Cloud API',
        rawResponse: response.data
      };

    } catch (error) {
      console.error(`❌ Text message failed to ${formattedPhone}:`, error.message);
      
      const errorDetails = {
        success: false,
        error: error.message,
        recipientPhone: formattedPhone,
        timestamp: new Date().toISOString(),
        provider: 'WhatsApp Cloud API'
      };

      // Enhanced error handling for WhatsApp Cloud API
      if (error.response?.data?.error) {
        const apiError = error.response.data.error;
        errorDetails.apiError = {
          code: apiError.code,
          message: apiError.message,
          type: apiError.type,
          details: apiError
        };

        // Map common error codes
        switch (apiError.code) {
          case 190:
            errorDetails.userFriendlyError = 'Access token expired - Please update token';
            console.error(`📱 WhatsApp API Error (${apiError.code}): ${apiError.message}`);
            break;
          case 131056:
            errorDetails.userFriendlyError = 'Phone number not registered on WhatsApp';
            break;
          case 131051:
            errorDetails.userFriendlyError = 'Invalid phone number format';
            break;
          case 100:
            errorDetails.userFriendlyError = 'Invalid access token or permissions';
            break;
          case 80007:
            errorDetails.userFriendlyError = 'Message could not be delivered';
            break;
          case 133010:
            errorDetails.userFriendlyError = 'Account not registered - Use /register API first';
            break;
          default:
            errorDetails.userFriendlyError = apiError.message || 'Unknown WhatsApp API error';
        }

        console.error(`📱 WhatsApp API Error (${apiError.code}): ${apiError.message}`);
      }

      console.error('❌ WhatsApp Cloud API message failed:', errorDetails.error);
      return errorDetails;
    }
  }

  /**
   * ✅ Enhanced absence alert with cleaner message format
   */
  async sendAbsenceAlert(parentPhone, studentName, studentID, absentSubjects, options = {}) {
    const {
      date = new Date().toLocaleDateString('en-IN', {
        day: '2-digit',
        month: '2-digit', 
        year: 'numeric'
      }),
      stream = '',
      semester = '',
      isFullDay = false,
      presentSubjects = 0
    } = options;

    let message;

    if (isFullDay) {
      message = `*${this.collegeName.toUpperCase()} - ATTENDANCE ALERT*

*FULL DAY ABSENCE*

Dear Parent/Guardian,

Your ward *${studentName}* (ID: ${studentID}) was absent for the entire day on ${date}.

*Academic Details:*
• Class: ${stream} Semester ${semester}
• Total Classes Missed: ${absentSubjects.length}
• Date: ${date}

*Action Required:*
Please contact the college office if:
• Your ward was present but not marked
• There was a medical emergency  
• You need absence documentation

College Office: ${this.collegePhone}
${this.collegeName}

*This is an automated message from our Smart Attendance System*`;
    } else {
      message = `*${this.collegeName.toUpperCase()} - ATTENDANCE ALERT*

*PARTIAL ABSENCE NOTICE*

Dear Parent/Guardian,

Your ward *${studentName}* (ID: ${studentID}) was absent for specific classes on ${date}.

*Missing Classes:*
${absentSubjects.map((subj, index) => `${index + 1}. ${subj}`).join('\n')}

*Summary:*
• Class: ${stream} Semester ${semester}
• Classes Missed: ${absentSubjects.length}
• Classes Attended: ${presentSubjects}
• Date: ${date}

For clarifications, contact: ${this.collegePhone}
${this.collegeName}

*This is an automated message from our Smart Attendance System*`;
    }

    console.log(`📱 Sending absence alert for ${studentName} to ${parentPhone}`);
    
    const result = await this.sendTextMessage(parentPhone, message);
    
    return {
      ...result,
      studentName,
      studentID,
      date,
      absentSubjects,
      messageType: isFullDay ? 'full_day_absence' : 'partial_absence',
      stream,
      semester
    };
  }

  /**
   * ✅ Enhanced bulk messaging with better error recovery
   */
  async sendBulkMessages(recipients, options = {}) {
    const {
      batchSize = 3,
      delayBetweenBatches = 2000,
      messageType = 'text',
      retryOnTokenError = true
    } = options;

    console.log(`📱 Starting bulk message send to ${recipients.length} recipients`);
    
    const results = [];
    const batches = [];

    // Create batches
    for (let i = 0; i < recipients.length; i += batchSize) {
      batches.push(recipients.slice(i, i + batchSize));
    }

    let totalProcessed = 0;
    let tokenExpired = false;

    for (const batch of batches) {
      // Check token health before each batch
      if (retryOnTokenError && !tokenExpired) {
        const healthCheck = await this.checkTokenHealth();
        if (!healthCheck.healthy && healthCheck.expired) {
          tokenExpired = true;
          console.error('🚨 Token expired during bulk messaging. Please update token and retry.');
          break;
        }
      }

      const batchPromises = batch.map(async (recipient) => {
        const { phone, message, ...otherData } = recipient;
        
        try {
          let result;
          if (messageType === 'absence') {
            result = await this.sendAbsenceAlert(
              phone,
              otherData.studentName,
              otherData.studentID,
              otherData.absentSubjects,
              otherData.options || {}
            );
          } else {
            result = await this.sendTextMessage(phone, message);
          }
          
          return {
            ...result,
            ...otherData
          };
        } catch (error) {
          return {
            success: false,
            error: error.message,
            phone: phone,
            timestamp: new Date().toISOString(),
            ...otherData
          };
        }
      });

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
      
      totalProcessed += batch.length;
      console.log(`📊 Processed ${totalProcessed}/${recipients.length} messages`);
      
      // Check if any token errors occurred in this batch
      const tokenErrors = batchResults.filter(r => 
        r.apiError?.code === 190 || r.error?.includes('token')
      );
      
      if (tokenErrors.length > 0) {
        tokenExpired = true;
        console.error('🚨 Token expired during batch processing');
        break;
      }
      
      // Delay between batches to respect rate limits
      if (totalProcessed < recipients.length) {
        console.log(`⏳ Waiting ${delayBetweenBatches}ms before next batch...`);
        await new Promise(resolve => setTimeout(resolve, delayBetweenBatches));
      }
    }

    const successCount = results.filter(r => r.success).length;
    const failureCount = results.length - successCount;

    console.log(`✅ Manual messaging completed: ${successCount}/${results.length} messages sent via WhatsApp Cloud API`);

    return {
      success: !tokenExpired,
      totalMessages: results.length,
      successCount,
      failureCount,
      successRate: results.length > 0 ? ((successCount / results.length) * 100).toFixed(1) : '0.0',
      tokenExpired,
      results,
      summary: {
        processed: totalProcessed,
        successful: successCount,
        failed: failureCount,
        provider: 'WhatsApp Cloud API',
        processingTime: Date.now()
      }
    };
  }

  /**
   * ✅ Get account information and status
   */
  async getAccountInfo() {
    try {
      const response = await axios.get(
        `https://graph.facebook.com/${this.apiVersion}/${this.phoneNumberId}`,
        {
          headers: {
            'Authorization': `Bearer ${this.accessToken}`
          },
          timeout: 10000
        }
      );

      return {
        success: true,
        accountInfo: response.data,
        phoneNumber: response.data.display_phone_number,
        verifiedName: response.data.verified_name,
        qualityRating: response.data.quality_rating,
        codeVerificationStatus: response.data.code_verification_status,
        nameStatus: response.data.name_status
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        tokenIssue: error.response?.status === 401
      };
    }
  }

  /**
   * ✅ Comprehensive health check
   */
  async healthCheck() {
    console.log('🔍 Running WhatsApp Service health check...');
    
    const tokenHealth = await this.checkTokenHealth();
    const accountInfo = await this.getAccountInfo();
    
    const health = {
      service: 'WhatsApp Cloud API',
      apiVersion: this.apiVersion,
      configured: !!(this.accessToken && this.phoneNumberId),
      phoneNumberId: this.phoneNumberId ? 'Configured' : 'Missing',
      accessToken: this.accessToken ? 'Configured' : 'Missing',
      collegeName: this.collegeName,
      collegePhone: this.collegePhone,
      baseURL: this.baseURL,
      tokenHealth: tokenHealth,
      accountInfo: accountInfo.success ? accountInfo : 'Unable to fetch account info',
      timestamp: new Date().toISOString(),
      status: 'unknown'
    };

    // Determine overall status
    if (!health.configured) {
      health.status = 'misconfigured';
      health.message = 'Missing required environment variables';
    } else if (!tokenHealth.healthy) {
      health.status = 'token_expired';
      health.message = 'Access token is expired or invalid';
    } else if (!accountInfo.success) {
      health.status = 'api_error';
      health.message = 'Cannot connect to WhatsApp Cloud API';
    } else {
      health.status = 'healthy';
      health.message = 'All systems operational';
    }

    console.log(`📊 Health check result: ${health.status.toUpperCase()}`);
    return health;
  }

  /**
   * ✅ Register phone number (if needed)
   */
  async registerPhoneNumber(pin = null) {
    console.log('📞 Attempting to register phone number...');
    
    try {
      const payload = {
        messaging_product: "whatsapp"
      };
      
      if (pin) {
        payload.pin = pin.toString();
      }

      const response = await axios.post(
        `https://graph.facebook.com/${this.apiVersion}/${this.phoneNumberId}/register`,
        payload,
        {
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json'
          },
          timeout: 30000
        }
      );

      console.log('✅ Phone number registered successfully');
      return {
        success: true,
        message: 'Phone number registered successfully',
        data: response.data
      };
    } catch (error) {
      console.error('❌ Phone registration failed:', error.message);
      return {
        success: false,
        error: error.message,
        apiError: error.response?.data?.error || null,
        needsPin: error.response?.data?.error?.code === 100
      };
    }
  }
}

// Export singleton instance
module.exports = new WhatsAppService();
