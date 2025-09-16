

# Chatbot Project – Node.js, Express & EJS

## Overview
This project is a simple chatbot web application built with **Node.js**, **Express**, and **EJS**.  
It demonstrates client-server communication, form handling, and template rendering with some added chatbot logic.

## Key Features
- **Express server setup** – basic Node.js/Express application with routes for GET and POST.
- **EJS templating** – dynamic rendering of the chat interface and messages.
- **Form handling** – user input is captured via HTML forms and processed on the server.
- **Responses logic** – a simple rule-based system with support for placeholders like `{{name}}` and `{{greet}}`.
- **Dynamic greetings** – added a time-based greeting helper so the bot can respond with “good morning”, “good afternoon”, etc.
- **Chat history** – stored in memory (RAM) and displayed in the UI.
- **Styling** – custom CSS with a dark theme and a professional layout.
- **Logo integration** – a custom logo is displayed in the chat interface.

## How it Works
1. The user enters a message and submits the form.
2. The server processes the input:
   - If the message matches defined rules, a predefined response is sent.
   - Otherwise, a fallback can be triggered (optionally AI, if configured).
3. The response and user message are saved to chat history.
4. The EJS template renders the updated conversation back to the browser.

## Project Structure
```
chatbot-HaniBassam/
├── server.js          # Express server with routes and chatbot logic
├── views/
│   └── index.ejs      # EJS template for chat UI
├── public/
│   └── style.css      # Styling for the application
└── README.md          # Project documentation
```

## Getting Started
- Install dependencies: `npm install`
- Start the server: `npm run dev`
- Open in browser: `http://localhost:3000`

## Notes
- This version uses simple in-memory storage for chat history (resets on server restart).
- Responses can be extended by editing the `responses` array in the server code.
- The project can later be expanded with database integration or AI responses.