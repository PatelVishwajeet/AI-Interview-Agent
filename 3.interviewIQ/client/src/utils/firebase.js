
import { initializeApp } from "firebase/app";
import {getAuth, GoogleAuthProvider} from "firebase/auth"
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_APIKEY,
  authDomain: "mern-1b35c.firebaseapp.com",
  projectId: "mern-1b35c",
  storageBucket: "mern-1b35c.firebasestorage.app",
  messagingSenderId: "1009739279485",
  appId: "1:1009739279485:web:9805608c8b9fdafd291514"
};

const app = initializeApp(firebaseConfig);

const auth = getAuth(app);

const provider = new GoogleAuthProvider()

export {auth , provider}