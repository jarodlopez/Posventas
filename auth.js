import { auth } from './firebase-config.js';
import { 
    createUserWithEmailAndPassword, 
    signInWithEmailAndPassword, 
    onAuthStateChanged,
    signOut 
} from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";

const authScreen = document.getElementById('auth-screen');
const appScreen = document.getElementById('app-screen');
const loginForm = document.getElementById('login-form');
const registerForm = document.getElementById('register-form');
const logoutBtn = document.getElementById('logout-btn');

// 1. Manejar estado de Auth
onAuthStateChanged(auth, (user) => {
    if (user) {
        // Usuario logueado
        authScreen.classList.add('hidden');
        
        // Revisar si estamos viendo una factura pública por URL
        const urlParams = new URLSearchParams(window.location.search);
        if(!urlParams.get('orderId')) {
            appScreen.classList.remove('hidden');
        }
        
        console.log("Usuario activo:", user.email);
    } else {
        // Usuario no logueado
        authScreen.classList.remove('hidden');
        appScreen.classList.add('hidden');
        
        // Si hay link de factura pero no login, pedirá login primero (seguridad básica)
    }
});

// 2. Login
loginForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const pass = document.getElementById('login-pass').value;
    
    signInWithEmailAndPassword(auth, email, pass)
        .catch((error) => alert("Error login: " + error.message));
});

// 3. Registro
registerForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const email = document.getElementById('reg-email').value;
    const pass = document.getElementById('reg-pass').value;

    createUserWithEmailAndPassword(auth, email, pass)
        .then(() => {
            alert("Usuario creado. Ingresando...");
            registerForm.reset();
        })
        .catch((error) => alert("Error registro: " + error.message));
});

// 4. Logout
logoutBtn.addEventListener('click', () => {
    if(confirm("¿Cerrar sesión?")) signOut(auth);
});

// UI Alternar registro
document.getElementById('show-register-btn').addEventListener('click', () => {
    document.getElementById('login-form').classList.add('hidden');
    registerForm.classList.remove('hidden');
});
document.getElementById('cancel-reg-btn').addEventListener('click', () => {
    registerForm.classList.add('hidden');
    document.getElementById('login-form').classList.remove('hidden');
});
