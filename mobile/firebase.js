import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyCrpKGEtXxx3Bj_bCWub1mvxULwYG8fWO4",
  authDomain: "fooddelivery196.firebaseapp.com",
  projectId: "fooddelivery196",
  storageBucket: "fooddelivery196.firebasestorage.app",
  messagingSenderId: "239076059413",
  appId: "1:239076059413:web:550bea2a3f7e81bf29611c",
  measurementId: "G-P1D1HG58SB"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
