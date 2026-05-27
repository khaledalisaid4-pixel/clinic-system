import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
// 1️⃣ تأكد من استيراد getStorage من الفايربيز
import { getStorage } from "firebase/storage"; 

const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "clinic-system-38097.firebaseapp.com",
  projectId: "clinic-system-38097",
  storageBucket: "clinic-system-38097.firebasestorage.app", // أو الـ bucket الخاص بك
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};

// تهيئة الفايربيز
const app = initializeApp(firebaseConfig);

// 2️⃣ تأكد من عمل export للـ db والـ storage معاً
export const db = getFirestore(app);
export const storage = getStorage(app); // 🎯 السطر ده هو اللي كان ناقص وموقف الدنيا!