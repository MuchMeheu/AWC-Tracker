# AWC Tracker (v0.5.0)

**Track your Anime Watching Challenge (AWC) progress with ease!**

Have you ever been annoyed about scrolling through your own forum comments, having to make an activity post or notes to keep track of your AWC challenges? Well, this app is here to fix those issues.

This web application helps you parse your AWC forum posts, keep track of your ongoing and completed challenges, compare your challenge progress with your AniList activity, and generate updated forum codes.

**➡️ [Access the AWC Tracker Here](https://muchmeheu.github.io/AWC-Tracker/)** ⬅️

---

## Features

*   **Challenge Parsing:** Paste your AWC forum post code directly into the app.
*   **AniList Integration:**
    *   Log in with your AniList account to automatically check the status (Completed, Watching, etc.) of anime in your challenges against your personal AniList.
    *   View your AniList profile picture and username.
*   **Status Tracking:**
    *   Clearly see how your challenge status (e.g., `[✔️]`, `[❌]`, `[⭐]`) compares to your AniList status.
    *   Highlights discrepancies (e.g., completed on AniList but not in your challenge post).
*   **Global Tracker:** Get an overview of all anime across all your saved challenges, showing their aggregated status.
*   **Challenge Management:**
    *   Save multiple challenges locally in your browser.
    *   View detailed breakdowns of each challenge.
    *   Refresh AniList statuses for a specific challenge.
    *   Copy updated forum code (reflecting current AniList statuses and your preferred title display).
    *   Copy the challenge's forum post URL (if provided).
    *   Direct link to the AWC Editor for your challenge post (if URL provided).
    *   Delete saved challenges.
*   **Title Preference:** Choose to display anime titles in Romaji or English throughout the app.
*   **Data Persistence:** Your challenges and AniList token are stored locally in your browser's localStorage.
*   **Help & Guidance:** Built-in help dialog explaining how to use the app and how status parsing works.
*   **Clear All Data:** Option to securely wipe all app-related data from your browser.

---

## How to Use

1.  **Visit the App:** [https://muchmeheu.github.io/AWC-Tracker/](https://muchmeheu.github.io/AWC-Tracker/)
2.  **Login with AniList:** Click the "Login with AniList" button to authorize the app. This allows it to fetch your anime list statuses.
3.  **Add a Challenge:**
    *   Copy the full BBCode for your AWC challenge from the AWC forums.
    *   Paste it into the "Add Challenge" text area.
    *   Optionally, add the URL to your forum post.
    *   Click "Save Challenge."
4.  **View & Manage:**
    *   Your saved challenges will appear in the left sidebar. Click one to view details.
    *   The main area will show either the "Add Challenge" / "Global Tracker" view or the selected challenge's details.
    *   The right sidebar provides management options for all saved challenges.
5.  **Refer to the "❓ Help" dialog** within the app for more detailed instructions on status parsing and features.

---

## Development Setup (For Contributors or Local Use)

If you wish to run this project locally or contribute:

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/MuchMeheu/AWC-Tracker.git
    cd AWC-Tracker
    ```
2.  **Install dependencies:**
    ```bash
    npm install
    # or
    yarn install
    ```
3.  **Set up Environment Variables:**
    Create a `.env` file in the root of the project and add your AniList Client ID:
    ```env
    REACT_APP_ANILIST_CLIENT_ID=YOUR_ANILIST_CLIENT_ID_HERE
    REACT_APP_ANILIST_API_DELAY_MS=4000 # Optional: Default API delay in milliseconds
    REACT_APP_VERSION=0.5.0 # Set your current app version
    ```
    *   You need to register a new API client on AniList (under Developer settings) to get a `CLIENT_ID`. Set the "Redirect URL" for your AniList client to your local development server (e.g., `http://localhost:3000`).
4.  **Start the development server:**
    ```bash
    npm start
    # or
    yarn start
    ```
    The app should now be running on `http://localhost:3000`.

---

## Known Issues / Future Ideas

*   **Rate Limiting:** While there's a delay implemented for AniList API calls, adding extremely large challenges or performing many actions quickly might still hit AniList's rate limits, especially if their API is in a degraded state. A more sophisticated queuing/retry mechanism could be an improvement.
*   **CORS in Development:** If you encounter CORS issues when fetching from AniList locally, ensure you have disabled any interfering browser extensions or consider using a CORS unblocker extension *for development only*. The `proxy` setting in `package.json` is not currently configured for this project but could be added.
*   **Different Emojis not being recognized by the App:** Even if you think you have the right emojis visually they may be different due to different Unicodes.
*   **Adding a backend to avoid parsing info about anime every time** Want to add a backend and server storage to rely less on API calls and reduce stress on the server and the API, which is ALMOST ALWAYS in a degraded state 🤦‍♂.
*   **Adding a bit of sorting and searching features**: Self-explanatory

---

## 📢 Disclaimer

This is a personal, fan-made project. It is **not** officially affiliated with, endorsed by, or connected to AWC or AniList.co. All trademarks and copyrights belong to their respective owners.
