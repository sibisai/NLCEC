// server/mock-calendar-service.js
class MockCalendarService {
  constructor() {
    // In-memory storage for events
    this.events = [];
  }
  
  async createEvent(eventData) {
    // Generate a random ID for the event
    const eventId = Math.random().toString(36).substring(2, 15);
    
    // Format the event
    const newEvent = {
      id: eventId,
      title: eventData.title,
      date: eventData.date,
      startTime: eventData.start_time,
      endTime: eventData.end_time || this._calculateEndTime(eventData.start_time),
      location: eventData.location || null,
      attendees: eventData.attendees || [],
      createdAt: new Date().toISOString()
    };
    
    // Store the event
    this.events.push(newEvent);
    console.log('Event created:', newEvent);
    
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 500));
    
    return {
      success: true,
      eventId: eventId,
      event: newEvent
    };
  }
  
  async getEvents() {
    // Return all events
    return this.events;
  }


  async deleteEvent(eventId) {
    const initialLength = this.events.length;
    this.events = this.events.filter(event => event.id !== eventId);
    
    const wasDeleted = this.events.length < initialLength;
    
    return {
      success: wasDeleted,
      message: wasDeleted ? 'Event deleted successfully' : 'Event not found'
    };
  }


  async updateEvent(eventId, eventData) {
  // Find the event
  const eventIndex = this.events.findIndex(event => event.id === eventId);
  
  if (eventIndex === -1) {
    throw new Error('Event not found');
  }
  
  // Update the event
  const updatedEvent = {
    ...this.events[eventIndex],
    title: eventData.title,
    date: eventData.date,
    startTime: eventData.start_time,
    endTime: eventData.end_time || this._calculateEndTime(eventData.start_time),
    location: eventData.location || null,
    attendees: eventData.attendees || [],
    updatedAt: new Date().toISOString()
  };
  
  // Replace the event in the array
  this.events[eventIndex] = updatedEvent;
  
  // Simulate API delay
  await new Promise(resolve => setTimeout(resolve, 500));
  
  return {
    success: true,
    event: updatedEvent
  };
}

  
  _calculateEndTime(startTime) {
    // Default to 1 hour after start time if no end time provided
    if (!startTime) return null;
    
    const [hours, minutes] = startTime.split(':');
    const date = new Date();
    date.setHours(parseInt(hours, 10) + 1, parseInt(minutes, 10));
    return `${date.getHours()}:${date.getMinutes().toString().padStart(2, '0')}`;
  }
}




module.exports = new MockCalendarService();
