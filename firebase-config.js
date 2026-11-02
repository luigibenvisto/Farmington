/*
 * Farmington App - Firebase settings.
 *
 * Leave this file as it is to run in "Local demo mode" (each phone keeps its
 * own data, nothing is shared).
 *
 * To make phones sync live, replace each PASTE_... value below with the
 * matching value from your Firebase project. The README explains where to
 * find them, step by step. Keep the quote marks around each value.
 *
 * These values are not secret passwords: Firebase expects them to be visible
 * in web pages. What protects the data is the Firestore security rules.
 */
window.FARMINGTON_FIREBASE_CONFIG = {
  apiKey: "PASTE_API_KEY_HERE",
  authDomain: "PASTE_AUTH_DOMAIN_HERE",
  projectId: "PASTE_PROJECT_ID_HERE",
  storageBucket: "PASTE_STORAGE_BUCKET_HERE",
  messagingSenderId: "PASTE_MESSAGING_SENDER_ID_HERE",
  appId: "PASTE_APP_ID_HERE"
};
