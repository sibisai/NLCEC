# Natural Language Calendar Event Creator

A web application that allows users to create calendar events using natural language input. The application uses OpenAI's GPT model to parse natural language descriptions into structured calendar events.

## Features

- Natural language event creation
- Calendar event management (create, read, update, delete)
- Event filtering (All, Today, This Week)
- Responsive design for both desktop and mobile
- Mock calendar service for demonstration

## Tech Stack

- Frontend: HTML, CSS, JavaScript
- Backend: Node.js, Express
- API: OpenAI GPT API
- Mock Calendar Service for demonstration

## Setup Instructions

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Create a `.env` file in the `server` directory with your OpenAI API key:
   ```
   OPENAI_API_KEY=your_openai_api_key_here
   ```
4. Start the server:
   ```bash
   cd server/
   npm run dev
   ```
5. Open `localhost:3000` in your web browser

## Project Structure

- `public/` - Frontend files
  - `index.html` - Main application interface
  - `app.js` - Frontend JavaScript logic
- `server/` - Backend files
  - `server.js` - Express server and API endpoints
  - `mock-calendar-service.js` - Mock calendar service implementation
  - `.env` - Environment variables (not included in repository)

## API Endpoints

- `POST /api/parse` - Parse natural language into event details
- `POST /api/calendar/create` - Create a new calendar event
- `GET /api/calendar/events` - Get all calendar events
- `PUT /api/calendar/events/:id` - Update an existing event
- `DELETE /api/calendar/events/:id` - Delete an event

## Contributing

Feel free to submit issues and enhancement requests.

## License

This project is licensed under the MIT License.
