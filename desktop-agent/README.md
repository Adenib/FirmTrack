# FirmTrack Desktop Agent

Runs on a lawyer's Windows PC. Every 30 seconds it reads the active window title
and process name and reports it to FirmTrack's Activity Log, where it can be
reviewed and converted into a time entry with one click.

## Setup

1. In FirmTrack, sign in as the lawyer whose activity this agent will track, go to
   **TimeTrack > Activity Log**, and click **Generate new agent key**. Copy the key
   immediately — it is only shown once. Generate a separate key per lawyer/PC; don't share one.
2. In this folder:
   ```
   npm install
   copy .env.example .env
   ```
3. Edit `.env` and set:
   - `FIRMTRACK_API_URL` — your FirmTrack deployment's activity endpoint, e.g.
     `https://yourfirm.example.com/api/timetrack/activity`
   - `FIRMTRACK_API_KEY` — the key generated in step 1
4. Run it:
   ```
   npm start
   ```

## Running at login (Windows)

Use Task Scheduler to run `npm start` (or `node index.js`) from this folder on
user logon, or wrap it with a process manager like `pm2` if you want automatic
restarts. No tray UI is included in this MVP — it runs as a background console
process.

## Notes

- Only the window title and process name are captured, never keystrokes or
  screen content.
- Each report is tied to the lawyer's account via the API key, so keys should
  not be shared between users.
