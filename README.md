# Farmington App (demo)

A small, phone-first ride board for a country club transportation team.

**DEMO with invented data. Not connected to any club system.** Drivers, events and numbers are made up (Driver A, Driver B, "Fall Classic"). The app only records head counts, never names.

## What it does

- **Request page** (members and workers): send an **H2B** ride or a **Game** ride with a head count. Senders do not see any list.
- **Driver page**: switch between the **H2B** and **Game** lists. Each request has a counter and a **Picked up** button (**Dropped off** for rides to the stadium). Under each request is a log such as "Driver A took 3, 2 min ago".
- **Game headcount**: left to pick up, dropped off and picked up. One shared number for every driver.
- **Reset demo**: tap once, then tap again within 4 seconds. It wipes all requests and brings back the sample data on every phone.

## Two modes

| Mode | When | What happens |
|---|---|---|
| **Local demo mode, not synced** | `firebase-config.js` still has the `PASTE_...` placeholders | Each phone keeps its own data. Phones do not see each other. |
| **Live sync on** | You pasted your Firebase values into `firebase-config.js` | Every phone sees the same lists. A tap on one phone shows on the others within a second or two. |

A small label under the app name shows which mode you are in. When a synced phone loses signal it shows **Offline, will sync**. Anything done offline is kept on the phone and sent when the signal returns.

---

## Part 1: Create the free Firebase project (about 10 minutes)

Firebase is Google's service that keeps the shared data. The free plan ("Spark") is enough for this demo and does not ask for a credit card.

Google sometimes renames buttons. If a label below looks slightly different, pick the closest match.

### 1. Create the project
1. On a computer, go to **https://console.firebase.google.com** and sign in with a Google account.
2. Click **Create a new Firebase project** (it may say **Create a project** or **Get started by setting up a Firebase project**).
3. Type a name, for example `farmington-demo`. Click **Continue**.
4. If asked to accept the Firebase terms, tick the box and click **Continue**.
5. If you see a page about **Gemini in Firebase** or **AI assistance**, leave it as it is and click **Continue**.
6. On the **Google Analytics** page, switch it **off** (not needed). Click **Create project**.
7. Wait until it says your project is ready. Click **Continue**. You are now on the project's home page.

### 2. Add a web app and copy its settings
1. On the project home page, find **Get started by adding Firebase to your app** and click the round **`</>`** icon (Web).
   *If you don't see it: click the gear icon ⚙ next to "Project Overview" at the top left → **Project settings** → scroll to **Your apps** → click **`</>`**.*
2. **App nickname**: type `Farmington App`. Leave **Also set up Firebase Hosting** unticked. Click **Register app**.
3. You now see a box of code. If there are two options, choose **Use a `<script>` tag**. Look for the part that looks like this:
   ```js
   const firebaseConfig = {
     apiKey: "AIzaSy...",
     authDomain: "farmington-demo.firebaseapp.com",
     projectId: "farmington-demo",
     storageBucket: "farmington-demo.firebasestorage.app",
     messagingSenderId: "1234567890",
     appId: "1:1234567890:web:abc123"
   };
   ```
4. Keep this page open. You will copy these six values in the next step. (You can always find them again under ⚙ → **Project settings** → **Your apps**.)
5. Click **Continue to console** when you are done.

### 3. Paste the settings into `firebase-config.js`
You can do this straight on the GitHub website:
1. Open this repository on GitHub and click the file **`firebase-config.js`**.
2. Click the **pencil icon** (Edit this file) at the top right of the file.
3. Replace each placeholder with the matching value from Firebase. Keep the quote marks. For example change
   `apiKey: "PASTE_API_KEY_HERE",` to `apiKey: "AIzaSy...your value...",`
   Do the same for `authDomain`, `projectId`, `storageBucket`, `messagingSenderId` and `appId`.
4. Click **Commit changes...**, then **Commit changes** again in the box that opens.

These values are not passwords. Firebase expects them to sit in the web page. What protects the database is the rules in step 5.

### 4. Create the Firestore database
1. In the Firebase console's left menu, open **Build** (it may be called **Databases & Storage**) and click **Firestore Database** (or **Firestore**).
2. Click **Create database**.
3. If asked for an **edition**, choose **Standard edition**. Click **Next**.
4. **Database ID**: leave it as `(default)`.
5. **Location**: pick one near the club, for example `nam5 (United States)`. You can't change this later, but any choice works for a demo. Click **Next**.
6. Choose **Start in production mode**. Click **Create**. Wait a few seconds until the empty database appears.

### 5. Paste the demo security rules
1. Still in Firestore, click the **Rules** tab at the top.
2. Delete everything in the box and paste this:
   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       // DEMO ONLY: anyone with the app link can read and write the invented
       // demo requests until 27 Nov 2026. Everything else stays locked.
       match /farmingtonDemo/{docId} {
         allow read, write: if request.time < timestamp.date(2026, 11, 27);
       }
     }
   }
   ```
3. Click **Publish**.

> **Important:** these rules are for invented demo data only. They let anyone who has the app link read and change the demo requests, and they switch themselves off on **27 November 2026** (30 days after this was written). After that date the app shows "Sync problem" until you change the date and publish again. **Before any real use, these rules must be replaced** with proper logins and access rules. Never put real member or staff information into this demo.

Your Firebase setup is done. The first time someone opens the synced app, it fills the empty database with the sample requests (6 people left to pick up at the game, plus a few H2B requests).

---

## Part 2: Put the app online with GitHub Pages (about 5 minutes)

This gives you a web link that opens the app on any phone.

1. Make sure the files are on the `main` branch (merge the pull request into `main` on GitHub first).
2. On GitHub, open the repository and click **Settings** (top menu, gear icon).
3. In the left menu click **Pages**.
4. Under **Build and deployment** → **Source**, choose **Deploy from a branch**.
5. Under **Branch**, choose **main** and **/ (root)**. Click **Save**.
6. Wait 1 to 2 minutes, then refresh the page. A box at the top shows **Your site is live at** followed by a link, usually `https://<your-github-name>.github.io/<repository-name>/`.
7. Open that link on your phone. Tip: in the phone browser use **Share → Add to Home Screen** so it opens like an app.

On a free GitHub account, Pages only works for **public** repositories. If the Pages page says you need to upgrade, change the repository to public under **Settings → General → Danger Zone → Change visibility**. Everything in it is invented demo data.

After any later change to the files on `main` (for example editing `firebase-config.js`), GitHub updates the site by itself within a minute or two. Refresh the page on the phone to get it.

---

## Part 3: Try the live sync

1. Open the link on two phones (or a phone and a computer).
2. On both, tap **Driver**, then **Game**. Pick **Driver A** on one and **Driver B** on the other.
3. Check the label under the app name says **Live sync on** on both.
4. On phone A, tap **Picked up** on a request. Within a second or two, "left to pick up" drops on phone B, and the log shows "Driver A took ...".
5. To test a weak signal, turn on airplane mode on one phone: the label changes to **Offline, will sync**. Log some people, turn airplane mode off, and watch the other phone catch up.
6. Use **Reset demo** (tap twice) to start again on every phone.

---

## Files

| File | What it is |
|---|---|
| `index.html` | The page layout |
| `styles.css` | Colours and layout |
| `app.js` | Draws the screens and handles taps |
| `logic.js` | The shared rules (how people are counted, the sample data) |
| `store-local.js` | Local mode: saves in this browser only |
| `store-firebase.js` | Synced mode: Firestore live listeners, safe counting with transactions, offline handling |
| `firebase-config.js` | Your Firebase settings (placeholders until you fill them in) |
| `tests/` | Automated checks for developers (not used by the app) |

## For developers: running the checks

- `node --test tests/sync.test.js` runs the sync and counting rules against a fake in-memory Firestore (Node 18 or newer, no install).
- `node tests/browser-check.js` runs the real page as two phones side by side in a headless browser (needs Playwright).

No build step and no other dependencies. The Firebase web SDK (version 12.19.0) loads from Google's CDN at `www.gstatic.com` only in synced mode.
