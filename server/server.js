require('dotenv').config();
const express = require('express');
const path = require('path');
const axios = require('axios');
const session = require('express-session');
const crypto = require('crypto');

// Import calendar service
const googleCalendarService = require('./google-calendar-service');

const app = express();
const PORT = process.env.PORT || 3000;

// Session middleware for storing user data
app.use(session({
  secret: crypto.randomBytes(64).toString('hex'),
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false } // Set to true in production with HTTPS
}));

// Middleware to parse JSON bodies
app.use(express.json());

// Serve static files from the public directory
app.use(express.static(path.join(__dirname, '../public')));

// Check if user is authenticated
const isAuthenticated = (req, res, next) => {
  if (req.session.userId && req.session.isAuthenticated) {
    return next();
  }
  res.status(401).json({ error: 'Not authenticated', authUrl: '/api/auth/google' });
};

// API endpoint to parse natural language input
app.post('/api/parse', async (req, res) => {
  try {
    const { text } = req.body;
    
    if (!text) {
      return res.status(400).json({ error: 'No text provided' });
    }
    
    // Get current date and time information
    const now = new Date();
    const dateFormatter = new Intl.DateTimeFormat('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
    
    const formattedDate = dateFormatter.format(now);
    const isoDate = now.toISOString().split('T')[0];
    
    // Get current time in HH:MM format
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const currentTime = `${hours}:${minutes}`;
    
    // Call OpenAI API to extract event details
    const response = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `Extract calendar event details from the following text. 
            Today's date is ${formattedDate} (${isoDate}).
            The current time is ${currentTime}.
            
            Return a JSON object with the following fields:
            - title: The title or name of the event
            - date: The date in YYYY-MM-DD format
            - start_time: Start time in HH:MM format (24-hour)
            - end_time: End time in HH:MM format (24-hour), can be null
            - location: Location of the event, can be null
            - attendees: Array of attendees, can be empty array
            
            If the text mentions "today", use ${isoDate}.
            If the text mentions "tomorrow", calculate the date accordingly.
            If no date is specified, assume today.
            If no time is specified, assume a default time of 09:00.
            
            Return ONLY the JSON object, no other text.`
          },
          {
            role: 'user',
            content: text
          }
        ],
        temperature: 0.3,
        max_tokens: 150
      },
      {
        headers: {
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    // Extract the JSON content from the response
    const content = response.data.choices[0].message.content.trim();
    
    try {
      const eventDetails = JSON.parse(content);
      res.json({ success: true, eventDetails });
    } catch (parseError) {
      console.error('Error parsing OpenAI response:', parseError);
      // Attempt to extract JSON-like content from the response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const eventDetails = JSON.parse(jsonMatch[0]);
        res.json({ success: true, eventDetails });
      } else {
        throw new Error('Failed to parse event details from response');
      }
    }
  } catch (error) {
    console.error('Error calling OpenAI API:', error.message);
    if (error.response) {
      console.error('Response data:', error.response.data);
    }
    res.status(500).json({ error: 'Failed to process natural language input' });
  }
});

// Google Auth endpoints
app.get('/api/auth/google', (req, res) => {
  // Generate a unique ID for this user session if not exists
  if (!req.session.userId) {
    req.session.userId = crypto.randomBytes(16).toString('hex');
  }
  
  // Get auth URL from Google Calendar service
  const { authUrl, state } = googleCalendarService.getAuthUrl();
  
  // Store state in session for verification
  req.session.oauthState = state;
  
  // Redirect to Google's OAuth page
  res.json({ authUrl });
});

// OAuth callback endpoint
app.get('/api/auth/callback', async (req, res) => {
  const { code, state } = req.query;
  
  // Verify state to prevent CSRF attacks
  if (state !== req.session.oauthState) {
    return res.status(403).send('Invalid state parameter');
  }
  
  try {
    // Exchange code for tokens
    const result = await googleCalendarService.getTokensFromCode(code, req.session.userId);
    
    if (result.success) {
      // Mark user as authenticated
      req.session.isAuthenticated = true;
      
      // Redirect to the main app
      res.redirect('/');
    } else {
      res.status(500).send('Failed to authenticate with Google');
    }
  } catch (error) {
    console.error('Auth callback error:', error);
    res.status(500).send('Authentication error');
  }
});

// Check auth status
app.get('/api/auth/status', (req, res) => {
  res.json({
    isAuthenticated: !!(req.session.userId && req.session.isAuthenticated)
  });
});

// Logout endpoint
app.get('/api/auth/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

// Calendar API endpoints
app.post('/api/calendar/create', isAuthenticated, async (req, res) => {
  try {
    const eventData = req.body;
    
    // Validate event data
    if (!eventData.title || (!eventData.date && !eventData.start_time)) {
      return res.status(400).json({ error: 'Invalid event data: Title and either date or time are required' });
    }
    
    const result = await googleCalendarService.createEvent(req.session.userId, eventData);
    res.json(result);
  } catch (error) {
    console.error('Error creating event:', error);
    res.status(500).json({ error: 'Failed to create event' });
  }
});

app.get('/api/calendar/events', isAuthenticated, async (req, res) => {
  try {
    const options = {
      timeMin: req.query.timeMin,
      timeMax: req.query.timeMax,
      maxResults: req.query.maxResults
    };
    
    const result = await googleCalendarService.getEvents(req.session.userId, options);
    res.json(result);
  } catch (error) {
    console.error('Error fetching events:', error);
    res.status(500).json({ error: 'Failed to fetch events' });
  }
});

app.put('/api/calendar/events/:id', isAuthenticated, async (req, res) => {
  try {
    const eventId = req.params.id;
    const eventData = req.body;
    
    // Validate event data
    if (!eventData.title || (!eventData.date && !eventData.start_time)) {
      return res.status(400).json({ error: 'Invalid event data: Title and either date or time are required' });
    }
    
    const result = await googleCalendarService.updateEvent(req.session.userId, eventId, eventData);
    res.json(result);
  } catch (error) {
    console.error('Error updating event:', error);
    res.status(500).json({ error: 'Failed to update event' });
  }
});

app.delete('/api/calendar/events/:id', isAuthenticated, async (req, res) => {
  try {
    const eventId = req.params.id;
    const result = await googleCalendarService.deleteEvent(req.session.userId, eventId);
    res.json(result);
  } catch (error) {
    console.error('Error deleting event:', error);
    res.status(500).json({ error: 'Failed to delete event' });
  }
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
