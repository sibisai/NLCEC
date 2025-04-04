require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// Import the mock calendar service
const mockCalendarService = require('./mock-calendar-service');

// OpenAI API integration
async function extractEventDetails(text) {
  try {
    // Get current date and time information with proper timezone handling
    const now = new Date();
    
    // Format date in local timezone
    const dateFormatter = new Intl.DateTimeFormat('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      timeZone: 'America/Los_Angeles' // Set to Pacific timezone
    });
    
    const formattedDate = dateFormatter.format(now);
    
    // Get YYYY-MM-DD format in local timezone
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const isoDate = `${year}-${month}-${day}`;
    
    // Get current time in HH:MM format
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const currentTime = `${hours}:${minutes}`;

    // Add this right before the API call
    console.log('Current date information:', {
      formattedDate,
      isoDate,
      currentTime,
      systemTime: new Date().toString()
    });


    const response = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `Extract calendar event details from the following text. 
            Today's date is ${formattedDate} (${isoDate}) .
            The current time is ${currentTime}.
            Return a JSON object with the following fields:
            - title: The title or name of the event
            - date: The date in YYYY-MM-DD format. If "today" is mentioned, use ${isoDate}. If "tomorrow" is mentioned, calculate tomorrow's date.
            - start_time: Start time in HH:MM format (24-hour)
            - end_time: End time in HH:MM format (24-hour), can be null
            - location: Location of the event, can be null
            - attendees: Array of attendees, can be empty array
            
            If no date is specified, assume today (${isoDate}).
            If no time is specified, assume a default time of 09:00.`
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
    
    // Parse the response to extract the JSON object
    const content = response.data.choices[0].message.content;
    try {
      // Clean the content by removing markdown code block syntax
      const cleanedContent = content.replace(/```(?:json)?\s*/g, '').replace(/```/g, '');
      return JSON.parse(cleanedContent);
    } catch (parseError) {
      console.error('Error parsing OpenAI response:', parseError);
      // Attempt to extract JSON-like content from the response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      throw new Error('Failed to parse event details from response');
    }
  } catch (error) {
    console.error('Error calling OpenAI API:', error.message);
    if (error.response) {
      console.error('Response data:', error.response.data);
    }
    throw new Error('Failed to process natural language input');
  }
}

// API endpoint to process natural language input
app.post('/api/parse', async (req, res) => {
  try {
    const { text } = req.body;
    
    if (!text) {
      return res.status(400).json({ error: 'Text input is required' });
    }
    
    const eventDetails = await extractEventDetails(text);
    res.json({ success: true, eventDetails });
  } catch (error) {
    console.error('Error in parse endpoint:', error);
    res.status(500).json({ error: error.message });
  }
});


// Create calendar event
app.post('/api/calendar/create', async (req, res) => {
  try {
    const result = await mockCalendarService.createEvent(req.body);
    res.json(result);
  } catch (error) {
    console.error('Error creating event:', error);
    res.status(500).json({ error: 'Failed to create calendar event' });
  }
});

// Get all calendar events
app.get('/api/calendar/events', async (req, res) => {
  try {
    const events = await mockCalendarService.getEvents();
    res.json({ events });
  } catch (error) {
    console.error('Error fetching events:', error);
    res.status(500).json({ error: 'Failed to fetch calendar events' });
  }
});

app.put('/api/calendar/events/:id', async (req, res) => {
  try {
    const eventId = req.params.id;
    const eventData = req.body;
    
    // Validate event data
    if (!eventData.title || (!eventData.date && !eventData.start_time)) {
      return res.status(400).json({ error: 'Invalid event data: Title and either date or time are required' });
    }
    
    const result = await mockCalendarService.updateEvent(eventId, eventData);
    res.json(result);
  } catch (error) {
    console.error('Error updating event:', error);
    res.status(500).json({ error: 'Failed to update event' });
  }
});



app.delete('/api/calendar/events/:id', async (req, res) => {
  try {
    const eventId = req.params.id;
    const result = await mockCalendarService.deleteEvent(eventId);
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
