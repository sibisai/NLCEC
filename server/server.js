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
    
    // Get current date and time information with proper timezone handling
    const now = new Date();
    
    // Get today's date in YYYY-MM-DD format in local timezone
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayISO = today.toISOString().split('T')[0];

    // Get tomorrow's date
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowISO = tomorrow.toISOString().split('T')[0];
    
    // Format date in local timezone
    const dateFormatter = new Intl.DateTimeFormat('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      timeZone: 'UTC'
    });
    
    const formattedDate = dateFormatter.format(now);
    
    // Get current time in HH:MM format
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const currentTime = `${hours}:${minutes}`;
    
    // Call OpenAI API with enhanced prompt that explicitly handles dates
    const response = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: `Extract calendar event details from the following text. 
            Today's date is ${formattedDate} (${todayISO}) .
            Tomorrow's date is ${tomorrowISO}.
            The current time is ${currentTime}.

            Return a JSON object with the following fields:
            - title: The title or name of the event
            - date: The date in YYYY-MM-DD format
            - start_time: Start time in HH:MM format (24-hour)
            - end_time: End time in HH:MM format (24-hour), can be null
            - location: Location of the event, can be null
            - attendees: Array of attendees, can be empty array

            If the text mentions "today", use ${todayISO}.
            If the text mentions "tomorrow", use ${tomorrowISO}.
            If no date is specified, assume today (${todayISO}).
            If no time is specified, assume a default time of 09:00.

            Return ONLY the JSON object, no other text.`
          },
          {
            role: 'user',
            content: text
          }
        ],
        temperature: 0.3,
        max_tokens: 300
      },
      {
        headers: {
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    // Extract the JSON content
    const content = response.data.choices[0].message.content.trim();
    let eventDetails;
    try {
      eventDetails = JSON.parse(content);
    } catch (parseError) {
      console.error('Error parsing OpenAI response:', parseError);
      // Attempt to extract JSON-like content from the response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        eventDetails = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('Failed to parse event details from response');
      }
    }
    
    res.json({ success: true, eventDetails });
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

// Create operation handler
async function handleCreateOperation(userId, eventData) {
  try {
    // Validate event data
    if (!eventData.title || (!eventData.date && !eventData.start_time)) {
      return { success: false, error: 'Invalid event data: Title and either date or time are required' };
    }
    
    // Use your existing Google Calendar service to create the event
    return await googleCalendarService.createEvent(userId, eventData);
  } catch (error) {
    console.error('Error in create operation:', error);
    return { success: false, error: error.message };
  }
}

// Read operation handler
async function handleReadOperation(userId, query) {
  try {
    // Check for relative dates
    let options = {};
    if (query.toLowerCase().includes('tomorrow')) {
      options.relativeDate = true;
    } else {
      // Extract date from query if present
      const dateMatch = query.match(/(\d{4}-\d{2}-\d{2})/);
      if (dateMatch) {
        options.date = dateMatch[1];
      }
    }
    
    // Get events with appropriate filter
    const allEvents = await googleCalendarService.getEvents(userId, options);
    
    if (!allEvents.success) {
      return allEvents;
    }
    
    // If no query provided, return all events
    if (!query || query.trim() === '') {
      return { success: true, events: allEvents.events };
    }
    
    // Normalize the query for case-insensitive search
    const searchTerms = query.toLowerCase()
      .replace(/\d{4}-\d{2}-\d{2}/g, '') // Remove date from search terms
      .replace(/tomorrow/g, '') // Remove relative date terms
      .split(' ')
      .filter(term => term.length > 0); // Remove empty terms
    
    // If no search terms left after removing date, return all events for that date
    if (searchTerms.length === 0) {
      return { success: true, events: allEvents.events };
    }
    
    // Filter events based on remaining search terms
    const filteredEvents = allEvents.events.filter(event => {
      // Create a searchable string from all event properties
      const searchableText = [
        event.title,
        event.location,
        event.startTime,
        event.endTime,
        ...(event.attendees || [])
      ].join(' ').toLowerCase();
      
      // Check if all search terms are present in the event
      return searchTerms.every(term => searchableText.includes(term));
    });
    
    return { success: true, events: filteredEvents };
  } catch (error) {
    console.error('Error in read operation:', error);
    return { success: false, error: error.message };
  }
}

// Update operation handler
async function handleUpdateOperation(userId, query, updateData) {
  try {
    // First find the event
    const searchResult = await handleReadOperation(userId, query);
    
    if (!searchResult.success) {
      return searchResult;
    }
    
    if (searchResult.events.length === 0) {
      return { success: false, error: 'No matching events found' };
    }
    
    // If multiple matches, update the first one
    const eventToUpdate = searchResult.events[0];
    
    // Merge existing data with update data
    const mergedData = {
      ...eventToUpdate,
      ...updateData,
      // Convert property names
      start_time: updateData.start_time || eventToUpdate.startTime,
      end_time: updateData.end_time || eventToUpdate.endTime
    };
    
    return await googleCalendarService.updateEvent(userId, eventToUpdate.id, mergedData);
  } catch (error) {
    console.error('Error in update operation:', error);
    return { success: false, error: error.message };
  }
}

// Delete operation handler
async function handleDeleteOperation(userId, query) {
  try {
    // First find the event
    const searchResult = await handleReadOperation(userId, query);
    
    if (!searchResult.success) {
      return searchResult;
    }
    
    if (searchResult.events.length === 0) {
      return { 
        success: false, 
        error: `No events found matching "${query}". Try being more specific with the event title, date, or time.` 
      };
    }
    
    // If multiple matches, show the matches to help user be more specific
    if (searchResult.events.length > 1) {
      const eventTitles = searchResult.events.map(e => `"${e.title}" on ${e.date}`).join(', ');
      return { 
        success: false, 
        error: `Multiple events found matching "${query}": ${eventTitles}. Please be more specific with the event details.` 
      };
    }
    
    // Single match found, proceed with deletion
    const eventToDelete = searchResult.events[0];
    const deleteResult = await googleCalendarService.deleteEvent(userId, eventToDelete.id);
    
    if (deleteResult.success) {
      return { 
        success: true, 
        event: eventToDelete,
        message: `Successfully deleted event "${eventToDelete.title}"` 
      };
    }
    
    return deleteResult;
  } catch (error) {
    console.error('Error in delete operation:', error);
    return { success: false, error: error.message };
  }
}


// Start the server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
