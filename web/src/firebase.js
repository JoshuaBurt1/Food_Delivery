// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyCrpKGEtXxx3Bj_bCWub1mvxULwYG8fWO4",
  authDomain: "fooddelivery196.firebaseapp.com",
  projectId: "fooddelivery196",
  storageBucket: "fooddelivery196.firebasestorage.app",
  messagingSenderId: "239076059413",
  appId: "1:239076059413:web:550bea2a3f7e81bf29611c",
  measurementId: "G-P1D1HG58SB"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

const analytics = getAnalytics(app);