
import { initializeApp } from "firebase/app";
import {getAuth, GoogleAuthProvider} from "firebase/auth"
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_APIKEY,
  authDomain: "fullstackproject-20c56.firebaseapp.com",
  projectId: "fullstackproject-20c56",
  storageBucket: "fullstackproject-20c56.firebasestorage.app",
  messagingSenderId: "727170858112",
  appId: "1:727170858112:web:81a9197ffe6a86e1a4ba65"
};

const app = initializeApp(firebaseConfig);

const auth = getAuth(app);

const provider = new GoogleAuthProvider()

export {auth , provider}