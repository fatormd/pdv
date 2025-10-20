// --- APP.JS ---
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signInAnonymously } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// Módulos Importados
import { initializeFirebase, getTableDocRef, getTablesCollectionRef, saveSelectedItemsToFirebase } from './services/firebaseService.js';
import { loadOpenTables, openTableForOrder, renderTableFilters } from './controllers/panelController.js';
import { fetchWooCommerceProducts, fetchWooCommerceCategories } from './services/wooCommerceService.js';


// --- VARIÁVEIS DE ESTADO GLOBAL ---
export const screens = { 'panelScreen': 0, 'orderScreen': 1, 'paymentScreen': 2, 'managerScreen': 3 };
export const mockUsers = { 'gerente': '1234', 'garcom': '1234' };
export const password = '1234'; 
export const WOOCOMMERCE_URL = 'https://nossotempero.fatormd.com';

// Variáveis Mutáveis
export let currentTableId = null;
export let selectedItems = []; 
export let currentOrderSnapshot = null;
export let userRole = 'anonymous'; 
export let userId = null;
export let unsubscribeTable = null;


// --- ELEMENTOS UI ---
const statusScreen = document.getElementById('statusScreen');
const mainContent = document.getElementById('mainContent');
const appContainer = document.getElementById('appContainer');

const loginModal = document.getElementById('loginModal');
const clientLoginBtn = document.getElementById('clientLoginBtn');
const staffLoginBtn = document.getElementById('staffLoginBtn');


// --- FUNÇÕES CORE E ROTEAMENTO ---

export const hideStatus = () => {
    if (statusScreen && mainContent) {
        statusScreen.style.display = 'none';
        mainContent.style.display = 'block';
    }
};

export const goToScreen = (screenId) => {
    if (screenId === 'panelScreen' && currentTableId) {
        saveSelectedItemsToFirebase(currentTableId, selectedItems);
    }

    if (screenId === 'panelScreen' && currentTableId && unsubscribeTable) {
        unsubscribeTable(); 
        unsubscribeTable = null; 
    }

    const screenIndex = screens[screenId];
    if (screenIndex !== undefined) {
        if (appContainer) {
            appContainer.style.transform = `translateX(-${screenIndex * 100}vw)`;
        }
        document.body.classList.toggle('bg-gray-900', screenId === 'managerScreen');
        document.body.classList.toggle('bg-gray-100', screenId !== 'managerScreen');
    }
};

window.goToScreen = goToScreen; // Exporta para o onclick do HTML


// --- LÓGICA DE LOGIN ---

const handleStaffLogin = async (username, passwordAttempt) => {
    const isAuthenticated = mockUsers[username] === passwordAttempt;

    if (isAuthenticated) {
        userRole = username === 'gerente' ? 'gerente' : 'garcom';
        
        try {
            const userCredential = await signInAnonymously(auth); 
            userId = userCredential.user.uid; 
            
            // ... (restante da inicialização)
            loginModal.style.display = 'none'; 
            hideStatus(); 
            
            document.getElementById('user-id-display').textContent = `Usuário ID: ${userId.substring(0, 8)} | Função: ${userRole}`;
            
            loadOpenTables();
            fetchWooCommerceProducts();
            fetchWooCommerceCategories();
            renderTableFilters();
            // ... (renderiza menus e botões de pagamento)

            goToScreen('panelScreen');
            
        } catch (error) {
             console.error("Erro ao autenticar Staff:", error);
        }
    } else {
        alert('Credenciais inválidas.');
    }
};

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {

    const firebaseConfig = JSON.parse(window.__firebase_config);
    const app = initializeApp(firebaseConfig); 
    const dbInstance = getFirestore(app);
    const authInstance = getAuth(app);
    
    // Inicializa o serviço Firebase para que outros módulos possam usá-lo
    initializeFirebase(dbInstance, authInstance, window.__app_id); 

    // Lógica de autenticação para o staff (botão no index.html)
    const loginUsernameInput = document.getElementById('loginUsername');
    const loginPasswordInput = document.getElementById('loginPassword');
    
    if (staffLoginBtn) {
        staffLoginBtn.addEventListener('click', () => {
            handleStaffLogin(loginUsernameInput.value, loginPasswordInput.value);
        });
    }

    // Lógica de login do cliente (a ser implementada em handleClientLogin)
    if (clientLoginBtn) {
        clientLoginBtn.addEventListener('click', () => {
             alert('A lógica de Login Cliente será implementada no módulo app.js.');
        });
    }
    
    // Inicia a visualização das mesas (Painel 1)
    loadOpenTables();
    renderTableFilters();
});
