# Ride Board Demo

A small, mobile-first prototype of a ride board for a country club transportation team.

**DEMO with invented data. Not connected to any club system.** All places, events, vehicles and drivers (Driver A, Van 1, Gate 3, Lot B, and so on) are made up. The app only records head counts, never names.

## What it does

- **Request view**: add an H2B worker ride (pickup location, head count, optional note) or a stadium trip (event, direction, head count, Van 1 or Van 2, ETA). New requests appear on the board as *Waiting* with the time created.
- **Driver view**: large *Start trip* and *Complete trip* buttons with a live timer. Completed trips are listed with their duration and head count.
- **Stadium headcount panel**: for the selected event, people dropped off, picked up, and still left to pick up, per van and combined, plus each van's current ETA.
- **Reset demo** restores the sample data. **About this demo** lists what a full version would add.

Plain HTML, CSS and JavaScript. No backend, no build step, no external libraries, no network calls. Data is saved in the browser's localStorage, so each phone or computer keeps its own copy.

## Run it locally

Open `index.html` in any modern browser. That's it.

## Publish with GitHub Pages

1. Push this repository to GitHub.
2. On GitHub, open the repository and go to **Settings → Pages**.
3. Under **Build and deployment**, set **Source** to **Deploy from a branch**.
4. Pick the branch that holds these files (for example `main`) and the folder **/ (root)**, then click **Save**.
5. Wait a minute or two. The page URL appears at the top of the Pages settings, usually `https://<your-username>.github.io/<repository-name>/`.

Open that URL on a phone to try it as a driver would.

## Files

- `index.html`: page layout
- `styles.css`: styling
- `app.js`: logic, sample data and localStorage saving
