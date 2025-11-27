import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-database.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyDF374bHcODY8N0R78HE8kZpmjeGeuhniU",
  authDomain: "posdeventas-a03ca.firebaseapp.com",
  databaseURL: "https://posdeventas-a03ca-default-rtdb.firebaseio.com",
  projectId: "posdeventas-a03ca",
  storageBucket: "posdeventas-a03ca.firebasestorage.app",
  messagingSenderId: "975141670948",
  appId: "1:975141670948:web:e58ed3da11878ecfdf88b1"
};

// Inicializar Firebase
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const auth = getAuth(app);

// Exportar para usar en otros archivos
export { db, auth };
