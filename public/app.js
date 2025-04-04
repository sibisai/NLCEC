document.addEventListener('DOMContentLoaded', function() {
    // Get DOM elements
    const eventTextArea = document.getElementById('eventText');
    const parseButton = document.getElementById('parseButton');
    const loadingIndicator = document.getElementById('loadingIndicator');
    const errorMessage = document.getElementById('errorMessage');
    const resultContainer = document.getElementById('resultContainer');
    const confirmButton = document.getElementById('confirmButton');
    const editButton = document.getElementById('editButton');
    
    // Event detail elements
    const eventTitle = document.getElementById('eventTitle');
    const eventDate = document.getElementById('eventDate');
    const eventStartTime = document.getElementById('eventStartTime');
    const eventEndTime = document.getElementById('eventEndTime');
    const eventLocation = document.getElementById('eventLocation');
    const eventAttendees = document.getElementById('eventAttendees');
    
    // Store the current event details
    let currentEventDetails = null;
    
    // Add edit mode state variables
    let editMode = false;
    let editingEventId = null;
    
    // Store all events for filtering
    let allEvents = [];
    
    // Default filter
    let currentFilter = 'all';
    
    // Add event listeners
    parseButton.addEventListener('click', handleParseEvent);
    confirmButton.addEventListener('click', handleConfirmEvent);
    editButton.addEventListener('click', handleEditEvent);
    document.getElementById('refreshEventsButton').addEventListener('click', fetchEvents);
    
    // Add event listeners for filter buttons
    document.getElementById('filterAll').addEventListener('click', () => applyFilter('all'));
    document.getElementById('filterToday').addEventListener('click', () => applyFilter('today'));
    document.getElementById('filterWeek').addEventListener('click', () => applyFilter('week'));
    
    // Function to handle parsing the event text
    async function handleParseEvent() {
        const text = eventTextArea.value.trim();
        
        // Enhanced validation
        if (!text) {
            showError('Please enter an event description');
            return;
        }
        
        // Check for minimum length
        if (text.length < 3) {
            showError('Please provide a more detailed event description');
            return;
        }
        
        // Check for basic event keywords
        const eventKeywords = ['meeting', 'call', 'appointment', 'lunch', 'dinner', 'breakfast', 'conference', 'event', 'reminder', 'deadline'];
        const timeKeywords = ['today', 'tomorrow', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday', 'am', 'pm', ':'];
        const hasEventKeyword = eventKeywords.some(keyword => text.toLowerCase().includes(keyword));
        const hasTimeKeyword = timeKeywords.some(keyword => text.toLowerCase().includes(keyword));
        
        // Suggest improvements if missing key information
        if (!hasEventKeyword && !hasTimeKeyword) {
            showError('Tip: Include event type (meeting, call, etc.) and time information for better results');
            // Continue anyway, as OpenAI might still extract useful information
        }
        
        // Show loading indicator and hide other elements
        loadingIndicator.style.display = 'block';
        errorMessage.style.display = 'none';
        resultContainer.style.display = 'none';
        parseButton.disabled = true;
        
        try {
            // Add timeout for API call
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
            
            // If in edit mode, handle differently
            if (editMode && editingEventId) {
                // Parse the text to get updated event details
                const response = await fetch('/api/parse', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ text }),
                    signal: controller.signal
                });
                
                clearTimeout(timeoutId);
                
                const data = await response.json();
                
                if (!response.ok) {
                    throw new Error(data.error || 'Failed to parse event details');
                }
                
                if (data.success && data.eventDetails) {
                    // Update the event
                    await updateEvent(editingEventId, data.eventDetails);
                    
                    // Reset edit mode
                    editMode = false;
                    editingEventId = null;
                    
                    // Reset button text
                    parseButton.textContent = 'Create Event';
                    
                    // Clear the text area
                    eventTextArea.value = '';
                    
                    // Show success message
                    showNotification('Event updated successfully!');
                    
                    // Refresh events
                    await fetchEvents();
                } else {
                    showError('Could not extract event details from the text');
                }
            } else {
                // Regular event creation flow
                const response = await fetch('/api/parse', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ text }),
                    signal: controller.signal
                });
                
                clearTimeout(timeoutId);
                
                const data = await response.json();
                
                if (!response.ok) {
                    throw new Error(data.error || 'Failed to parse event details');
                }
                
                // Hide loading indicator
                loadingIndicator.style.display = 'none';
                
                if (data.success && data.eventDetails) {
                    displayEventDetails(data.eventDetails);
                } else {
                    showError('Could not extract event details from the text');
                }
            }
        } catch (error) {
            console.error('Error:', error);
            
            // Handle timeout or network errors
            if (error.name === 'AbortError') {
                showError('Request timed out. The OpenAI API may be unavailable.');
                
                // Offer manual entry option
                if (confirm('Would you like to enter event details manually instead?')) {
                    showManualEntryForm();
                }
            } else {
                showError(error.message || 'An error occurred while processing your request');
            }
        } finally {
            loadingIndicator.style.display = 'none';
            parseButton.disabled = false;
        }
    }
    
    // Function to convert 24-hour time to AM/PM format
    function formatTime(timeStr) {
        if (!timeStr) return 'Not specified';
        
        // Split the time string into hours and minutes
        const [hours, minutes] = timeStr.split(':');
        const hour = parseInt(hours);
        
        // Convert to AM/PM format
        const period = hour >= 12 ? 'PM' : 'AM';
        const formattedHour = hour % 12 || 12; // Convert 0 to 12 for 12 AM
        
        return `${formattedHour}:${minutes} ${period}`;
    }
    
    // Function to format date in a more readable format
    function formatDate(dateStr) {
        if (!dateStr) return 'Not specified';
        
        // Fix timezone issue by ensuring the date is interpreted in local timezone
        // Add 'T00:00:00' to ensure it's treated as midnight in local timezone
        const localDateStr = dateStr.includes('T') ? dateStr : `${dateStr}T00:00:00`;
        
        // Create date object and adjust for timezone if needed
        const date = new Date(localDateStr);
        if (isNaN(date.getTime())) return dateStr; // Return original if invalid
        
        // Force interpretation in local timezone by creating a new date with local components
        const localDate = new Date(
            date.getFullYear(),
            date.getMonth(),
            date.getDate()
        );
        
        const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
        return localDate.toLocaleDateString(undefined, options);
    }
    
    // Function to display the extracted event details
    function displayEventDetails(details) {
        // Store the current event details
        currentEventDetails = details;
        
        // Update the UI with the extracted details
        eventTitle.textContent = details.title || 'Not specified';
        eventDate.textContent = formatDate(details.date);
        eventStartTime.textContent = formatTime(details.start_time);
        eventEndTime.textContent = formatTime(details.end_time);
        eventLocation.textContent = details.location || 'Not specified';
        
        // Handle attendees array
        if (details.attendees && Array.isArray(details.attendees) && details.attendees.length > 0) {
            eventAttendees.textContent = details.attendees.join(', ');
        } else {
            eventAttendees.textContent = 'None';
        }
        
        // Show the result container
        resultContainer.style.display = 'block';
    }
    
    // Function to validate event data
    function validateEventData(eventData) {
        // Check if we have at least a title
        if (!eventData || !eventData.title) {
            showError('Event must have a title');
            return false;
        }
        
        // Check title length
        if (eventData.title.length < 2) {
            showError('Event title is too short');
            return false;
        }
        
        // If no date is provided, set it to today
        if (!eventData.date) {
            const today = new Date();
            eventData.date = today.toISOString().split('T')[0]; // YYYY-MM-DD format
        }
        
        // Validate date format
        const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
        if (!dateRegex.test(eventData.date)) {
            showError('Invalid date format');
            return false;
        }
        
        // If no start time is provided, set a default
        if (!eventData.start_time) {
            eventData.start_time = '09:00';
        }
        
        // Validate time format
        const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
        if (eventData.start_time && !timeRegex.test(eventData.start_time)) {
            showError('Invalid start time format');
            return false;
        }
        
        if (eventData.end_time && !timeRegex.test(eventData.end_time)) {
            showError('Invalid end time format');
            return false;
        }
        
        // Ensure end time is after start time if both are provided
        if (eventData.start_time && eventData.end_time) {
            const [startHour, startMinute] = eventData.start_time.split(':').map(Number);
            const [endHour, endMinute] = eventData.end_time.split(':').map(Number);
            
            const startMinutes = startHour * 60 + startMinute;
            const endMinutes = endHour * 60 + endMinute;
            
            if (endMinutes <= startMinutes) {
                // Auto-fix: Set end time to 1 hour after start time
                const newEndHour = (startHour + 1) % 24;
                eventData.end_time = `${String(newEndHour).padStart(2, '0')}:${String(startMinute).padStart(2, '0')}`;
            }
        }
        
        return true;
    }
    
    // Function to handle confirming the event
    async function handleConfirmEvent() {
        try {
            // Validate event data before submission
            if (!validateEventData(currentEventDetails)) {
                return; // Error already shown by validateEventData
            }
            
            // Show loading state
            confirmButton.disabled = true;
            confirmButton.textContent = 'Creating event...';
            
            const response = await fetch('/api/calendar/create', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(currentEventDetails)
            });
            
            const data = await response.json();
            
            if (!response.ok) {
                throw new Error(data.error || 'Failed to create calendar event');
            }
            
            // Show success message
            showNotification(`Event "${data.event.title}" created successfully!`);
            
            // Reset the form
            eventTextArea.value = '';
            resultContainer.style.display = 'none';
            
            // Fetch and display events
            await fetchEvents();
        } catch (error) {
            console.error('Error creating calendar event:', error);
            showError(error.message || 'An error occurred while creating the event');
        } finally {
            // Reset button state
            confirmButton.disabled = false;
            confirmButton.textContent = 'Confirm & Add to Calendar';
        }
    }
    
    // Function to handle editing the event details
    function handleEditEvent() {
        // If we're in the confirmation view, populate the text area with current event details
        if (currentEventDetails) {
            // Convert event details back to natural language
            let eventText = `${currentEventDetails.title} `;
            
            if (currentEventDetails.date) {
                eventText += `on ${formatDate(currentEventDetails.date)} `;
            }
            
            if (currentEventDetails.start_time) {
                eventText += `at ${formatTime(currentEventDetails.start_time)} `;
                
                if (currentEventDetails.end_time) {
                    eventText += `until ${formatTime(currentEventDetails.end_time)} `;
                }
            }
            
            if (currentEventDetails.location) {
                eventText += `at ${currentEventDetails.location} `;
            }
            
            if (currentEventDetails.attendees && currentEventDetails.attendees.length > 0) {
                eventText += `with ${currentEventDetails.attendees.join(', ')} `;
            }
            
            // Set the text area value
            eventTextArea.value = eventText.trim();
            
            // Hide the result container
            resultContainer.style.display = 'none';
            
            // Clear current event details
            currentEventDetails = null;
        }
    }
    
    // Function to show a notification
    function showNotification(message, isError = false) {
        // Create notification element if it doesn't exist
        let notification = document.getElementById('notification');
        if (!notification) {
            notification = document.createElement('div');
            notification.id = 'notification';
            notification.style.position = 'fixed';
            notification.style.top = '20px';
            notification.style.right = '20px';
            notification.style.padding = '10px 20px';
            notification.style.borderRadius = '4px';
            notification.style.color = 'white';
            notification.style.fontWeight = 'bold';
            notification.style.zIndex = '1000';
            notification.style.boxShadow = '0 2px 10px rgba(0,0,0,0.2)';
            document.body.appendChild(notification);
        }
        
        // Set style based on type
        notification.style.backgroundColor = isError ? '#ff6b6b' : '#4CAF50';
        
        // Set message
        notification.textContent = message;
        
        // Show notification
        notification.style.display = 'block';
        
        // Hide after 3 seconds
        setTimeout(() => {
            notification.style.display = 'none';
        }, 3000);
    }
    
    // Function to show an error message
    function showError(message) {
        // Show in the error element
        errorMessage.textContent = message;
        errorMessage.style.display = 'block';
        
        // Also show as a notification
        showNotification(message, true);
        
        // Auto-hide error message after 5 seconds
        setTimeout(() => {
            errorMessage.style.display = 'none';
        }, 5000);
    }
    
    // Function to show manual entry form
    function showManualEntryForm() {
        // Hide other elements
        loadingIndicator.style.display = 'none';
        errorMessage.style.display = 'none';
        
        // Create a simple event object
        const manualEvent = {
            title: '',
            date: new Date().toISOString().split('T')[0],
            start_time: '09:00',
            end_time: '10:00',
            location: '',
            attendees: []
        };
        
        // Store as current event
        currentEventDetails = manualEvent;
        
        // Display for editing
        displayEventDetails(manualEvent);
        
        // Show a message
        showNotification('Please edit the event details and confirm when ready.');
    }
    
    // Function to fetch and display events
    async function fetchEvents() {
        try {
            const response = await fetch('/api/calendar/events');
            const data = await response.json();
            
            if (!response.ok) {
                throw new Error(data.error || 'Failed to fetch events');
            }
            
            // Store all events
            allEvents.length = 0; // Clear array
            allEvents.push(...data.events);
            
            // Apply current filter
            const filteredEvents = filterEvents(data.events, currentFilter);
            displayFilteredEvents(filteredEvents);
        } catch (error) {
            console.error('Error fetching events:', error);
            showError('Failed to load calendar events');
        }
    }
    
    // Function to apply filter
    function applyFilter(filter) {
        // Update active button
        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.classList.remove('active');
            btn.style.backgroundColor = '';
            btn.style.color = '';
        });
        
        const activeBtn = document.getElementById(`filter${filter.charAt(0).toUpperCase() + filter.slice(1)}`);
        activeBtn.classList.add('active');
        activeBtn.style.backgroundColor = '#4CAF50';
        activeBtn.style.color = 'white';
        
        // Set current filter
        currentFilter = filter;
        
        // Apply filter to events
        if (allEvents.length > 0) {
            const filteredEvents = filterEvents(allEvents, filter);
            displayFilteredEvents(filteredEvents);
        }
    }
    
    // Function to filter events based on selected filter
    function filterEvents(events, filter) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const weekEnd = new Date(today);
        weekEnd.setDate(today.getDate() + 7);
        
        return events.filter(event => {
            if (filter === 'all') return true;
            
            if (!event.date) return false;
            
            // Create date object in local timezone
            const eventDate = new Date(`${event.date}T00:00:00`);
            const localEventDate = new Date(
                eventDate.getFullYear(),
                eventDate.getMonth(),
                eventDate.getDate()
            );
            
            if (filter === 'today') {
                return localEventDate.getTime() === today.getTime();
            }
            
            if (filter === 'week') {
                return localEventDate >= today && localEventDate < weekEnd;
            }
            
            return true;
        });
    }
    
    // Function to display filtered events
    function displayFilteredEvents(events) {
        const eventsListElement = document.getElementById('eventsList');
        eventsListElement.innerHTML = '';
        
        if (events.length === 0) {
            eventsListElement.innerHTML = `<p>No events found${currentFilter !== 'all' ? ' for the selected filter' : ''}.</p>`;
            return;
        }
        
        // Sort events chronologically by date and then by start time
        events.sort((a, b) => {
            // First compare by date
            const dateA = a.date ? new Date(`${a.date}T00:00:00`) : new Date(9999, 11, 31);
            const dateB = b.date ? new Date(`${b.date}T00:00:00`) : new Date(9999, 11, 31);
            
            // Create dates in local timezone to avoid UTC conversion issues
            const localDateA = dateA.getTime() !== 8640000000000000 ? 
                new Date(dateA.getFullYear(), dateA.getMonth(), dateA.getDate()) : dateA;
            const localDateB = dateB.getTime() !== 8640000000000000 ? 
                new Date(dateB.getFullYear(), dateB.getMonth(), dateB.getDate()) : dateB;
            
            if (localDateA.getTime() !== localDateB.getTime()) {
                return localDateA - localDateB;
            }
            
            // If dates are the same, compare by start time
            if (a.startTime && b.startTime) {
                const [hoursA, minutesA] = a.startTime.split(':');
                const [hoursB, minutesB] = b.startTime.split(':');
                
                const timeA = parseInt(hoursA) * 60 + parseInt(minutesA);
                const timeB = parseInt(hoursB) * 60 + parseInt(minutesB);
                
                return timeA - timeB;
            }
            
            // If one has start time and the other doesn't
            if (a.startTime) return -1;
            if (b.startTime) return 1;
            
            return 0;
        });
        
        events.forEach(event => {
            const eventElement = document.createElement('div');
            eventElement.className = 'event-item';
            eventElement.style.padding = '10px';
            eventElement.style.margin = '10px 0';
            eventElement.style.border = '1px solid #ddd';
            eventElement.style.borderRadius = '4px';
            
            // Add background color based on date (past, today, future)
            const eventDate = event.date ? new Date(`${event.date}T00:00:00`) : null;
            const today = new Date();
            today.setHours(0, 0, 0, 0); // Set to beginning of day for comparison
            
            if (eventDate) {
                // Create a local date to avoid timezone issues
                const localEventDate = new Date(
                    eventDate.getFullYear(),
                    eventDate.getMonth(),
                    eventDate.getDate()
                );
                
                if (localEventDate < today) {
                    eventElement.style.backgroundColor = '#f8f8f8'; // Light gray for past events
                } else if (localEventDate.getTime() === today.getTime()) {
                    eventElement.style.backgroundColor = '#e6f7ff'; // Light blue for today's events
                } else {
                    eventElement.style.backgroundColor = '#f0fff0'; // Light green for future events
                }
            }
            
            // Update the event element HTML to include an edit button
            eventElement.innerHTML = `
                <h4>${event.title}</h4>
                <p><strong>Date:</strong> ${formatDate(event.date)}</p>
                <p><strong>Time:</strong> ${formatTime(event.startTime)} - ${event.endTime ? formatTime(event.endTime) : 'Not specified'}</p>
                ${event.location ? `<p><strong>Location:</strong> ${event.location}</p>` : ''}
                ${event.attendees && event.attendees.length > 0 ? 
                    `<p><strong>Attendees:</strong> ${event.attendees.join(', ')}</p>` : ''}
                <div style="margin-top: 10px;">
                    <button class="edit-btn" data-event-id="${event.id}" style="background-color: #4CAF50; margin-right: 10px;">Edit Event</button>
                    <button class="delete-btn" data-event-id="${event.id}" style="background-color: #ff6b6b;">Delete Event</button>
                </div>
            `;
            
            eventsListElement.appendChild(eventElement);
            
            // Add event listeners for buttons
            const editBtn = eventElement.querySelector('.edit-btn');
            const deleteBtn = eventElement.querySelector('.delete-btn');
            
            if (editBtn) {
                editBtn.addEventListener('click', function() {
                    const eventId = this.getAttribute('data-event-id');
                    editEvent(eventId, event);
                });
            }
            
            if (deleteBtn) {
                deleteBtn.addEventListener('click', function() {
                    const eventId = this.getAttribute('data-event-id');
                    if (confirm('Are you sure you want to delete this event?')) {
                        deleteEvent(eventId);
                    }
                });
            }
        });
        
        // Show the calendar view
        document.getElementById('calendarView').style.display = 'block';
    }
    
    // Function to edit an event
    function editEvent(eventId, eventData) {
        // Set edit mode
        editMode = true;
        editingEventId = eventId;
        
        // Convert event data to natural language for editing
        let eventText = `${eventData.title} `;
        
        if (eventData.date) {
            eventText += `on ${formatDate(eventData.date)} `;
        }
        
        if (eventData.startTime) {
            eventText += `at ${formatTime(eventData.startTime)} `;
            
            if (eventData.endTime) {
                eventText += `until ${formatTime(eventData.endTime)} `;
            }
        }
        
        if (eventData.location) {
            eventText += `at ${eventData.location} `;
        }
        
        if (eventData.attendees && eventData.attendees.length > 0) {
            eventText += `with ${eventData.attendees.join(', ')} `;
        }
        
        // Set the text area value
        eventTextArea.value = eventText.trim();
        
        // Change the parse button text
        parseButton.textContent = 'Update Event';
        
        // Scroll to the top
        window.scrollTo(0, 0);
        
        // Show a notification
        showNotification('Editing event. Make your changes and click "Update Event".');
    }
    
    // Function to update an event
    async function updateEvent(eventId, eventDetails) {
        try {
            const response = await fetch(`/api/calendar/events/${eventId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(eventDetails)
            });
            
            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || 'Failed to update event');
            }
            
            return true;
        } catch (error) {
            console.error('Error updating event:', error);
            showError(error.message || 'An error occurred while updating the event');
            return false;
        }
    }
    
    // Function to delete an event
    async function deleteEvent(eventId) {
        try {
            const response = await fetch(`/api/calendar/events/${eventId}`, {
                method: 'DELETE'
            });
            
            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || 'Failed to delete event');
            }
            
            // Refresh the events list
            await fetchEvents();
            showNotification('Event deleted successfully!');
        } catch (error) {
            console.error('Error deleting event:', error);
            showError(error.message || 'An error occurred while deleting the event');
        }
    }
    
    // Add responsive design improvements
    window.addEventListener('resize', function() {
        const isMobile = window.innerWidth < 600;
        
        // Adjust styles for mobile
        if (isMobile) {
            // Make container full width
            document.querySelector('.container').style.maxWidth = '100%';
            document.querySelector('.container').style.padding = '10px';
            
            // Stack buttons on mobile
            const buttonContainers = document.querySelectorAll('.result div[style*="margin-top: 20px"]');
            buttonContainers.forEach(container => {
                container.style.display = 'flex';
                container.style.flexDirection = 'column';
                container.style.gap = '10px';
            });
            
            // Make buttons full width
            const buttons = document.querySelectorAll('button');
            buttons.forEach(button => {
                button.style.width = '100%';
                button.style.margin = '5px 0';
            });
        } else {
            // Reset styles for desktop
            document.querySelector('.container').style.maxWidth = '800px';
            document.querySelector('.container').style.padding = '20px';
            
            // Reset button containers
            const buttonContainers = document.querySelectorAll('.result div[style*="margin-top: 20px"]');
            buttonContainers.forEach(container => {
                container.style.display = 'block';
            });
            
            // Reset buttons
            const buttons = document.querySelectorAll('button');
            buttons.forEach(button => {
                button.style.width = 'auto';
                button.style.margin = '';
            });
        }
    });
    
    // Trigger resize event on load to apply correct styles
    window.dispatchEvent(new Event('resize'));
    
    // Fetch events on page load
    fetchEvents();
});
