# Natural Language Calendar Event Creator

A simple web application that allows users to create calendar events using natural language input. This project uses OpenAI's API to parse natural language descriptions into structured event data.

## Features

- Natural language input for creating calendar events
- Automatic extraction of event details (title, date, time, location, attendees)
- Calendar view with filtering options (All, Today, This Week)
- Complete CRUD operations (Create, Read, Update, Delete)
- Responsive design for mobile and desktop
- Error handling and validation
- Google Calendar integration

## Tech Stack

- **Frontend**: HTML, CSS, JavaScript (Vanilla)
- **Backend**: Node.js with Express
- **NLP Processing**: OpenAI API (GPT-4)
- **Calendar Integration**: Google Calendar API
- **Authentication**: OAuth 2.0

## Getting Started

### Prerequisites

- Node.js (v14 or higher)
- OpenAI API key
- Google Cloud Platform account with Calendar API enabled

### Installation

1. Clone the repository

   ```
   git clone https://github.com/yourusername/natural-language-calendar.git
   cd natural-language-calendar
   ```

2. Install dependencies

   ```
   cd server
   npm install
   ```

3. Create a `.env` file in the server directory with your API keys

   ```
   OPENAI_API_KEY=your_openai_api_key
   GOOGLE_CLIENT_ID=your_google_client_id
   GOOGLE_CLIENT_SECRET=your_google_client_secret
   REDIRECT_URI=http://localhost:3000/api/auth/callback
   ```

4. Start the server

   ```
   npm run dev
   ```

5. Open your browser and navigate to `http://localhost:3000`

## Usage

1. Enter an event description in natural language (e.g., "Meeting with John tomorrow at 3pm")
2. Click "Create Event" to parse the description
3. Review the extracted event details
4. Click "Confirm & Add to Calendar" to save the event
5. View and manage your events in the calendar view

## Project Structure

```
calendar_mvp_simple/
├── public/                 # Frontend files
│   ├── index.html          # Main HTML page
│   └── app.js              # Frontend JavaScript
└── server/                 # Backend files
    ├── server.js           # Express server
    ├── mock-calendar-service.js  # Calendar service (mock)
    ├── package.json        # Node.js dependencies
    └── .env                # Environment variables
```

## Future Enhancements

- Recurring events support
- Email notifications
- Calendar sharing
- Mobile app version (iOS/Android)
- Advanced natural language features (e.g., "Move my meeting to 4pm")

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

- OpenAI for providing the GPT-4 API
- Google for the Calendar API
