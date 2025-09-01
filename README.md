# Time Tracker Webapp

A lightweight, self-contained **time tracker** that runs entirely in the browser.  
No server, no accounts, no setup. Just open `index.html` in a browser and start tracking.

---

## ✨ Features

- ⏳ **Countdown Timer** – set a task and duration, watch the timer count down
- 📝 **Task Attribution** – assign each timer to a specific task
- 🔔 **Notifications & Sound** – get a desktop notification and chime when time is up
- 📋 **Session History** – automatically logs tasks with start/end time and duration
- 📤 **Export to CSV** – download your task history in Excel-friendly format
- ❌ **Clear History** – remove all saved tasks if needed
- 🔇 **Mute Controls**
  - Mute Sound
  - Disable Notifications
  - Mute Reminders
- 🕑 **Idle Reminders** – if no timer is running for 20 minutes, receive a reminder to start one  
  (only between **09:30–13:00** and **14:00–18:00** Paris time)

---

## 🖥 Usage

1. Open `index.html` in a modern browser (Chrome, Brave, Firefox, Edge).
2. Enter a task name and duration (minutes).
3. Click **Start** to begin the timer.
4. When the timer finishes, you’ll get a sound + notification.  
   - Click **Stop** to log the task.  
   - You can extend overtime (if enabled).
5. See your sessions in the **Session History** table (newest first).
6. Click **Export CSV** to download your task log.

---

## 🔧 Controls

- **Start / Stop** – control the timer
- **Export CSV** – save history as a `.csv`
- **Clear History** – wipe all saved tasks
- **Mute Sound** – disables the chime
- **Disable Notifications** – disables desktop notifications
- **Mute Reminders** – disables idle reminders
- **Extend Timer** – appears at 0:00 if you want to keep working (counts up overtime)

---

## 💾 Data Persistence

- All data is stored in your browser’s **localStorage**:
  - Task logs (`time_log`)
  - Settings (mute states, last timer activity)
- Data is **never sent to a server**.

---

## 📦 Deployment

You can use it locally or host it:

- **Local**: just open `index.html`
- **GitHub Pages**: push to a GitHub repo and enable Pages for free hosting
- **Netlify/Vercel**: drag-and-drop deploy

---

## 🕒 Time Zones

- Task logs are saved in **UTC** (Excel-friendly format).
- Idle reminder windows (09:30–13:00 / 14:00–18:00) use **Europe/Paris** time.

---

## 🚀 Roadmap (ideas)

- Color-coded overtime display
- Quick “+5 min / +10 min” extension buttons
- Tagging / categorization of tasks
- Daily/weekly summaries

---

## 👨‍💻 Author

Built as a simple, personal productivity tool to keep focused and accountable during work hours.
