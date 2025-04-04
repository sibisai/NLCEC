const { google } = require('googleapis');
const { OAuth2Client } = require('google-auth-library');

class GoogleCalendarService {
  constructor() {
    // OAuth2 client configuration
    this.oauth2Client = new OAuth2Client(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.REDIRECT_URI
    );
    
    // Store tokens by user (in a real app, you'd use a database)
    this.userTokens = {};
  }
  
  /**
   * Generate the authorization URL for Google OAuth
   * @returns {Object} Auth URL and state for verification
   */
  getAuthUrl() {
    const state = Math.random().toString(36).substring(2, 15);
    
    const authUrl = this.oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: ['https://www.googleapis.com/auth/calendar'],
      state: state,
      prompt: 'consent' // Force to get refresh_token every time
    });
    
    return { authUrl, state };
  }
  
  /**
   * Exchange authorization code for tokens
   * @param {string} code - Authorization code from Google
   * @param {string} userId - User identifier (for token storage)
   * @returns {Promise<Object>} Token response
   */
  async getTokensFromCode(code, userId) {
    try {
      const { tokens } = await this.oauth2Client.getToken(code);
      
      // Store tokens for this user
      this.userTokens[userId] = tokens;
      
      return { success: true, tokens };
    } catch (error) {
      console.error('Error getting tokens:', error);
      return { success: false, error: error.message };
    }
  }
  
  /**
   * Set credentials for a specific user
   * @param {string} userId - User identifier
   * @returns {boolean} Whether credentials were set successfully
   */
  setCredentials(userId) {
    if (!this.userTokens[userId]) {
      return false;
    }
    
    this.oauth2Client.setCredentials(this.userTokens[userId]);
    return true;
  }
  
  /**
   * Create a calendar event
   * @param {string} userId - User identifier
   * @param {Object} eventData - Event details
   * @returns {Promise<Object>} Created event or error
   */
  async createEvent(userId, eventData) {
    try {
      // Set credentials for this user
      if (!this.setCredentials(userId)) {
        throw new Error('User not authenticated');
      }
      
      // Create calendar client
      const calendar = google.calendar({ version: 'v3', auth: this.oauth2Client });
      
      // Format start and end times
      const startDateTime = this._formatDateTime(eventData.date, eventData.start_time);
      let endDateTime;
      
      if (eventData.end_time) {
        endDateTime = this._formatDateTime(eventData.date, eventData.end_time);
      } else {
        // Default to 1 hour duration if no end time specified
        endDateTime = new Date(new Date(startDateTime).getTime() + 60 * 60 * 1000).toISOString();
      }
      
      // Create event resource
      const event = {
        summary: eventData.title,
        location: eventData.location || '',
        description: eventData.notes || 'Created with Natural Language Calendar App',
        start: {
          dateTime: startDateTime,
          timeZone: 'America/Los_Angeles', // You might want to make this configurable
        },
        end: {
          dateTime: endDateTime,
          timeZone: 'America/Los_Angeles',
        },
        attendees: eventData.attendees 
          ? eventData.attendees
              .filter(email => {
                // Basic email validation
                const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                return emailRegex.test(email);
              })
              .map(email => ({ email }))
          : [],
        reminders: {
          useDefault: true,
        },
      };
      
      // Insert event
      const response = await calendar.events.insert({
        calendarId: 'primary',
        resource: event,
      });
      
      return {
        success: true,
        event: {
          id: response.data.id,
          title: response.data.summary,
          date: eventData.date,
          startTime: eventData.start_time,
          endTime: eventData.end_time,
          location: response.data.location,
          attendees: eventData.attendees || [],
          htmlLink: response.data.htmlLink
        }
      };
    } catch (error) {
      console.error('Error creating event:', error);
      return { success: false, error: error.message };
    }
  }
  
  /**
   * Fetch events from Google Calendar
   * @param {string} userId - User identifier
   * @param {Object} options - Options for fetching events
   * @returns {Promise<Object>} List of events or error
   */
  async getEvents(userId, options = {}) {
    try {
      // Set credentials for this user
      if (!this.setCredentials(userId)) {
        throw new Error('User not authenticated');
      }
      
      // Create calendar client
      const calendar = google.calendar({ version: 'v3', auth: this.oauth2Client });
      
      // Set time range (default to next 30 days)
      const timeMin = options.timeMin || new Date().toISOString();
      const timeMax = options.timeMax || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      
      // Fetch events
      const response = await calendar.events.list({
        calendarId: 'primary',
        timeMin: timeMin,
        timeMax: timeMax,
        maxResults: options.maxResults || 100,
        singleEvents: true,
        orderBy: 'startTime',
      });
      
      // Format events for our app
      const events = response.data.items.map(item => {
        // Extract date and time from dateTime strings
        const startDateTime = new Date(item.start.dateTime || item.start.date);
        const endDateTime = new Date(item.end.dateTime || item.end.date);
        
        // Format as YYYY-MM-DD
        const date = startDateTime.toISOString().split('T')[0];
        
        // Format as HH:MM
        const startTime = startDateTime.toTimeString().substring(0, 5);
        const endTime = endDateTime.toTimeString().substring(0, 5);
        
        // Extract attendees
        const attendees = item.attendees 
          ? item.attendees.map(attendee => attendee.email)
          : [];
        
        return {
          id: item.id,
          title: item.summary,
          date: date,
          startTime: startTime,
          endTime: endTime,
          location: item.location || null,
          attendees: attendees,
          htmlLink: item.htmlLink
        };
      });
      
      return { success: true, events };
    } catch (error) {
      console.error('Error fetching events:', error);
      return { success: false, error: error.message };
    }
  }
  
  /**
   * Update an existing calendar event
   * @param {string} userId - User identifier
   * @param {string} eventId - Event ID to update
   * @param {Object} eventData - Updated event details
   * @returns {Promise<Object>} Updated event or error
   */
  async updateEvent(userId, eventId, eventData) {
    try {
      // Set credentials for this user
      if (!this.setCredentials(userId)) {
        throw new Error('User not authenticated');
      }
      
      // Create calendar client
      const calendar = google.calendar({ version: 'v3', auth: this.oauth2Client });
      
      // First get the existing event
      const existingEvent = await calendar.events.get({
        calendarId: 'primary',
        eventId: eventId
      });
      
      // Format start and end times
      const startDateTime = this._formatDateTime(eventData.date, eventData.start_time);
      let endDateTime;
      
      if (eventData.end_time) {
        endDateTime = this._formatDateTime(eventData.date, eventData.end_time);
      } else {
        // Default to 1 hour duration if no end time specified
        endDateTime = new Date(new Date(startDateTime).getTime() + 60 * 60 * 1000).toISOString();
      }
      
      // Create updated event resource
      const event = {
        summary: eventData.title,
        location: eventData.location || existingEvent.data.location || '',
        description: eventData.notes || existingEvent.data.description || 'Updated with Natural Language Calendar App',
        start: {
          dateTime: startDateTime,
          timeZone: existingEvent.data.start.timeZone || 'America/Los_Angeles',
        },
        end: {
          dateTime: endDateTime,
          timeZone: existingEvent.data.end.timeZone || 'America/Los_Angeles',
        },
        attendees: eventData.attendees 
          ? eventData.attendees.map(email => ({ email })) 
          : existingEvent.data.attendees || [],
        reminders: existingEvent.data.reminders || {
          useDefault: true,
        },
      };
      
      // Update event
      const response = await calendar.events.update({
        calendarId: 'primary',
        eventId: eventId,
        resource: event,
      });
      
      return {
        success: true,
        event: {
          id: response.data.id,
          title: response.data.summary,
          date: eventData.date,
          startTime: eventData.start_time,
          endTime: eventData.end_time,
          location: response.data.location,
          attendees: eventData.attendees || [],
          htmlLink: response.data.htmlLink
        }
      };
    } catch (error) {
      console.error('Error updating event:', error);
      return { success: false, error: error.message };
    }
  }
  
  /**
   * Delete a calendar event
   * @param {string} userId - User identifier
   * @param {string} eventId - Event ID to delete
   * @returns {Promise<Object>} Success status or error
   */
  async deleteEvent(userId, eventId) {
    try {
      // Set credentials for this user
      if (!this.setCredentials(userId)) {
        throw new Error('User not authenticated');
      }
      
      // Create calendar client
      const calendar = google.calendar({ version: 'v3', auth: this.oauth2Client });
      
      // Delete event
      await calendar.events.delete({
        calendarId: 'primary',
        eventId: eventId
      });
      
      return { success: true, message: 'Event deleted successfully' };
    } catch (error) {
      console.error('Error deleting event:', error);
      return { success: false, error: error.message };
    }
  }
  
  /**
   * Helper method to format date and time for Google Calendar API
   * @param {string} date - Date in YYYY-MM-DD format
   * @param {string} time - Time in HH:MM format
   * @returns {string} ISO datetime string
   */
  _formatDateTime(date, time) {
    if (!date) {
      date = new Date().toISOString().split('T')[0];
    }
    
    if (!time) {
      time = '09:00';
    }
    
    return `${date}T${time}:00`;
  }
}

module.exports = new GoogleCalendarService();
