import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyBp-WMVvFjD5n0Ba0ggecYa5BJY7j1ddTM",
  authDomain: "cspln-app.firebaseapp.com",
  projectId: "cspln-app",
  storageBucket: "cspln-app.firebasestorage.app",
  messagingSenderId: "58830049573",
  appId: "1:58830049573:web:fcbf756c7a85cedc100acc",
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
