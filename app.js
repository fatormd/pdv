// --- APP.JS ---
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signInAnonymously } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// Importações dos Módulos Refatorados
import { initializeFirebase, saveSelectedItemsToFirebase } from './services/firebaseService.js';
import { fetchWooCommerceProducts, fetchWooCommerceCategories } from './services/wooCommerceService.js';
import { loadOpenTables, renderTableFilters, handleAbrirMesa } from './controllers/panelController.js';
import { renderMenu, renderOrderScreen } from './controllers/orderController.js';
import { openManagerAuthModal } from './controllers/managerController.js';


// --- VARIÁVEIS DE ESTADO GLOBAL ---
export const screens = { 'panelScreen': 0, 'orderScreen': 1, 'paymentScreen': 2, 'managerScreen': 3 };
export const mockUsers = { 'gerente': '1234', 'garcom': '1234' };

// Variáveis Mutáveis (Estado da Sessão)
export let currentTableId = null;
export let selectedItems = []; 
export let userRole = 'anonymous'; 
export let userId = null;
export let unsubscribeTable = null;


// --- ELEMENTOS E UTILS CORE ---
const statusScreen = document.getElementById('statusScreen');
const mainContent = document.getElementById('mainContent');
const appContainer = document.getElementById('appContainer');

const loginModal = document.getElementById('loginModal');
const loginBtn = document.getElementById('loginBtn');
const logoutBtnHeader = document.getElementById('logoutBtnHeader');
const openManagerPanelBtn = document.getElementById('openManagerPanelBtn');
const abrirMesaBtn = document.getElementById('abrirMesaBtn');


// --- FUNÇÕES CORE E ROTEAMENTO ---

export const hideStatus = () => {
    if (statusScreen && mainContent) {
        statusScreen.style.display = 'none';
        mainContent.style.display = 'block';
    }
};

export const goToScreen = (screenId) => {
    if (screenId === 'panelScreen' && currentTableId) {
        // Salva o estado antes de sair do pedido
        saveSelectedItemsToFirebase(currentTableId, selectedItems);
    }

    if (screenId === 'panelScreen' && currentTableId && unsubscribeTable) {
        // Cancela o listener da mesa ao sair do pedido
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
window.openManagerAuthModal = openManagerAuthModal; // Exporta para o onclick do HTML


// --- INICIALIZAÇÃO E AUTENTICAÇÃO ---

document.addEventListener('DOMContentLoaded', () => {

    const firebaseConfig = JSON.parse(window.__firebase_config);
    const app = initializeApp(firebaseConfig); 
    const dbInstance = getFirestore(app);
    const authInstance = getAuth(app);
    
    // Inicializa o serviço Firebase para que outros módulos possam usá-lo
    initializeFirebase(dbInstance, authInstance, window.__app_id); 

    // 1. Lógica de Login
    if (loginBtn) {
        loginBtn.addEventListener('click', () => {
            const username = document.getElementById('loginUsername').value;
            const passwordAttempt = document.getElementById('loginPassword').value;
            
            const isAuthenticated = mockUsers[username] === passwordAttempt;

            if (isAuthenticated) {
                userRole = username === 'gerente' ? 'gerente' : 'garcom';
                
                // Simulação de login anônimo (para obter userId)
                signInAnonymously(authInstance).then(userCredential => {
                    userId = userCredential.user.uid;
                    
                    loginModal.style.display = 'none'; 
                    hideStatus(); 
                    
                    document.getElementById('user-id-display').textContent = `Usuário ID: ${userId.substring(0, 8)} | Função: ${userRole}`;
                    
                    // Carrega dados iniciais com a nova arquitetura
                    loadOpenTables();
                    renderTableFilters(); 
                    fetchWooCommerceProducts(renderMenu);
                    fetchWooCommerceCategories(renderTableFilters); // Opcional, mas carrega categorias
                    
                    goToScreen('panelScreen');
                });
            } else {
                alert('Credenciais inválidas.');
            }
        });
    }

    // 2. Event Listener para Abrir Mesa (usando o Controller)
    if (abrirMesaBtn) {
        abrirMesaBtn.addEventListener('click', handleAbrirMesa);
    }
    
    // 3. Lógica de Logout
    if (logoutBtnHeader) {
        logoutBtnHeader.addEventListener('click', () => {
            handleLogout();
            document.getElementById('loginUsername').value = '';
            document.getElementById('loginPassword').value = '';
            document.getElementById('user-id-display').textContent = 'Usuário ID: Deslogado...';
        });
    }

    // Abertura inicial da tela de status (Aguardando login)
    statusScreen.style.display = 'flex';
    mainContent.style.display = 'none';
});
