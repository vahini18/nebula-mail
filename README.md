# 📬 Nebula Mail

### AI-Powered Mail Web Application

Nebula Mail is an AI-powered email web application developed for the **Nebula KnowLab 2027 Batch Hiring Task**.

It connects to a real Gmail account and provides a modern interface for managing emails, while an integrated AI assistant allows users to perform email actions using natural-language commands.

---

## ✨ Features

### 📥 Gmail Integration

- Google OAuth authentication
- Real Gmail Inbox and Sent Mail
- View email details
- Send real emails
- Reply to emails
- Gmail thread-aware replies

### 🔄 Automatic Email Synchronization

New emails are automatically detected and displayed without manually refreshing the page.

### 🤖 AI Mail Assistant

Users can control email actions using natural-language commands.

Examples:

```text
Send an email to john@example.com with subject "Meeting Tomorrow"
and body "Let's meet at 3pm"
```

```text
Show me emails from the last 10 days
```

```text
Find the email from Sarah about the project update
```

```text
Open the latest email from David
```

```text
Reply to this email with a polite response
```

### 🔎 Email Search & Filtering

- Search by sender
- Search by keyword
- Filter by date
- Filter read/unread emails
- AI-powered filtering

### ✉️ Compose & Send

Compose emails manually or use the AI assistant to prepare the recipient, subject, and message.

### 💬 AI-Powered Reply

The AI understands the currently opened email and prepares a contextual reply while preserving the Gmail conversation thread.

---

## 🛠️ Tech Stack

### Frontend

- React
- Vite
- JavaScript
- CSS

### Backend

- Node.js
- Express.js
- Google APIs

### AI

- Groq API
- AI Tool / Function Calling

### Email

- Gmail API
- Google OAuth 2.0

---

## 🏗️ Architecture

```text
                ┌──────────────────────┐
                │      React UI        │
                │   Frontend (Vite)    │
                └──────────┬───────────┘
                           │
                           │ HTTP API
                           ▼
                ┌──────────────────────┐
                │   Node.js + Express  │
                │       Backend        │
                └───────┬───────┬──────┘
                        │       │
              ┌─────────┘       └──────────┐
              ▼                            ▼
      ┌───────────────┐            ┌──────────────┐
      │   Gmail API   │            │   Groq API   │
      │ OAuth + Mail  │            │ AI Assistant │
      └───────────────┘            └──────────────┘
```

### Architecture Decisions & Trade-offs

- **React + Vite** was used for a fast and responsive frontend development experience.
- **Node.js + Express** was used as the backend to handle Gmail API communication and keep sensitive credentials away from the frontend.
- **Gmail API** was chosen instead of building a separate mail storage system because the application is intended to work with real Gmail data.
- **Groq tool/function calling** allows natural-language commands to be converted into specific mail actions such as composing, filtering, opening, and replying.
- **Gmail thread IDs** are preserved for replies so that conversations remain connected to the original Gmail thread.
- The current automatic synchronization approach keeps the inbox updated while the application is running without requiring manual refresh. A production version could use Gmail Pub/Sub push notifications for a more event-driven architecture.

---

## 🚀 Setup & Run Locally

### 1. Clone the repository

```bash
git clone https://github.com/vahini18/nebula-mail.git
cd nebula-mail
```

### 2. Install frontend dependencies

```bash
cd client
npm install
```

### 3. Install backend dependencies

```bash
cd ../server
npm install
```

### 4. Create environment variables

Create a `.env` file inside the `server` folder:

```env
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
GOOGLE_REDIRECT_URI=http://localhost:5000/auth/google/callback
GROQ_API_KEY=your_groq_api_key
SESSION_SECRET=your_session_secret
```

### 5. Start the backend

Inside the `server` folder:

```bash
node index.js
```

The backend runs on:

```text
http://localhost:5000
```

### 6. Start the frontend

Open another terminal:

```bash
cd client
npm run dev
```

The frontend runs on:

```text
http://localhost:5173
```

### 7. Google OAuth Setup

Configure the following redirect URI in Google Cloud Console:

```text
http://localhost:5000/auth/google/callback
```

Then open the frontend and sign in using Google.

---

## 🔐 Security

API keys, OAuth credentials, and environment variables are stored locally and excluded from the public repository.

Sensitive credentials are never committed to GitHub.

---

## 🎥 Demo Video

This video demonstrates the AI assistant understanding natural-language commands and controlling the mail web application UI.

[▶️ Watch the Demo Video](https://drive.google.com/file/d/1Jbidw-X9u1UpE8TVGjGJcvCoWcxSCYgh/view?usp=sharing)

---

## 🔮 What I Would Improve With More Time

- Implement Gmail Pub/Sub push notifications for fully event-driven email synchronization.
- Add a complete threaded conversation view.
- Add AI-powered email forwarding.
- Support rich-text email composition and attachments.
- Add more advanced Gmail search capabilities.
- Add automated unit and integration tests.
- Improve mobile responsiveness.
- Deploy the application for public demonstration.

---

## 👩‍💻 Developer

**Vahini M**

B.E. Computer Science and Engineering  
Sri Ramakrishna Engineering College

GitHub: https://github.com/vahini18

---

### 📌 Developed for

**Nebula KnowLab 2027 Batch Hiring Task**