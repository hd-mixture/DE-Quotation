
"use client";

import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAnalytics, isSupported } from "firebase/analytics";
import { getAuth, GoogleAuthProvider, type Auth } from "firebase/auth";
import type { Analytics } from "firebase/analytics";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyAlUvm3SoM6msq99bg-t8AwBGEs1g8G6lc",
  authDomain: "de-quotation-format.firebaseapp.com",
  projectId: "de-quotation-format",
  storageBucket: "de-quotation-format.appspot.com",
  messagingSenderId: "803948663838",
  appId: "1:803948663838:web:b3652dcf5ce5321b8e0a0f",
  measurementId: "G-90FNYCMPDM"
};

// Initialize Firebase
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const db = getFirestore(app);

let auth: Auth;
let googleProvider: GoogleAuthProvider;
let analytics: Analytics | undefined;

if (typeof window !== 'undefined') {
    auth = getAuth(app);
    googleProvider = new GoogleAuthProvider();
    // Request permission to create files in Google Drive
    googleProvider.addScope('https://www.googleapis.com/auth/drive.file');

    isSupported().then(supported => {
        if (supported) {
            analytics = getAnalytics(app);
        }
    });
}

// Export the initialized services, which will be undefined on the server
// but defined on the client. Components using them will need to handle this.
// @ts-ignore
export { app, db, auth, googleProvider, analytics };
