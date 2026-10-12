import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";

const firebaseConfig = {
  apiKey: "AIzaSyCAk59-tOIz34mPSq-asBG5_SC_9SMIGsI",
  authDomain: "amaraponjon-ebd3e.firebaseapp.com",
  projectId: "amaraponjon-ebd3e",
  storageBucket: "amaraponjon-ebd3e.firebasestorage.app",
  messagingSenderId: "413682374191",
  appId: "1:413682374191:web:5572daf3ba12d7558e58da",
  measurementId: "G-1NT85WBNFY"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);