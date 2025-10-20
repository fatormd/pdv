// --- APP.JS ---
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signInAnonymously } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, serverTimestamp, doc, setDoc, updateDoc, getDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// Importações dos Módulos Refatorados
import { initializeFirebase, saveSelectedItemsToFirebase, getTableDocRef, getCustomersCollectionRef, auth } from './services/firebaseService.js';
import { fetchWooCommerceProducts, fetchWooCommerceCategories } from './services/wooCommerceService.js';
import { loadOpenTables, renderTableFilters, handleAbrirMesa, loadTableOrder, handleSearchTable } from './controllers/panelController.js';
import { renderMenu, renderOrderScreen, increaseLocalItemQuantity, decreaseLocalItemQuantity } from './controllers/orderController.js';
import { openManagerAuthModal } from './controllers/managerController.js';
import { renderPaymentSummary } from './controllers/paymentController.js'; 


// --- VARIÁVEIS DE ESTADO GLOBAL ---
export const screens = { 'panelScreen': 0, 'orderScreen': 1, 'paymentScreen': 2, 'managerScreen': 3 };
export const mockUsers = { 'gerente': '1234', 'garcom': '1234' };

// Credenciais Staff Centralizadas (para login unificado)
const STAFF_CREDENTIALS = {
    'agencia@fatormd.com': { password: '1234', role: 'gerente', name: 'Fmd' }, 
    'garcom@fator.com': { password: '1234', role: 'garcom', name: 'Mock Garçom' },
};

// Variáveis Mutáveis (Estado da Sessão)
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
const logoutBtnHeader = document.getElementById('logoutBtnHeader');
const abrirMesaBtn = document.getElementById('abrirMesaBtn');
const openManagerPanelBtn = document.getElementById('openManagerPanelBtn'); 

// Elementos de Login
const loginBtn = document.getElementById('loginBtn');
const loginEmailInput = document.getElementById('loginEmail'); 
const loginPasswordInput = document.getElementById('loginPassword');
const searchTableBtn = document.getElementById('searchTableBtn'); 


// --- FUNÇÕES CORE E ROTEAMENTO ---

export const hideStatus = () => {
    if (statusScreen && mainContent) {
        statusScreen.style.display = 'none';
        mainContent.style.display = 'block';
    }
};

const showLoginModal = () => {
    if (statusScreen) statusScreen.style.display = 'none'; 
    if (mainContent) mainContent.style.display = 'none'; 
    
    if (loginModal) {
        loginModal.style.display = 'flex'; 
    }
};

const hideLoginModal = () => {
    if (loginModal) {
        loginModal.style.display = 'none';
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

window.goToScreen = goToScreen; 
window.openManagerAuthModal = openManagerAuthModal; 

// NOVO: Função para o listener da mesa (MÓDULO DE FLUXO)
export const setTableListener = (tableId) => {
    if (unsubscribeTable) unsubscribeTable(); 

    const tableRef = getTableDocRef(tableId);

    // CRITICAL: Atualiza o estado global e chama os renderizadores de tela
    unsubscribeTable = onSnapshot(tableRef, (docSnapshot) => {
        if (docSnapshot.exists()) {
            currentOrderSnapshot = docSnapshot.data();
            selectedItems = currentOrderSnapshot.selectedItems || []; 
            renderOrderScreen(currentOrderSnapshot);
            renderPaymentSummary(currentTableId, currentOrderSnapshot);
        }
    }, (error) => {
        console.error("Erro ao carregar dados da mesa:", error);
    });
};

export const setCurrentTable = (tableId) => {
    currentTableId = tableId; 
    
    document.getElementById('current-table-number').textContent = `Mesa ${tableId}`; 
    document.getElementById('payment-table-number').textContent = `Mesa ${tableId}`; 
    
    setTableListener(tableId); 
};


// --- LÓGICA DE AUTH/LOGIN ---

const authenticateStaff = (email, password) => {
    const creds = STAFF_CREDENTIALS[email];
    if (creds && creds.password === password) {
        return creds; 
    }
    return null;
};

const handleStaffLogin = async () => {
    if (loginBtn) loginBtn.disabled = true; 
    
    const email = loginEmailInput.value.trim();
    const password = loginPasswordInput.value.trim();
    
    const staffData = authenticateStaff(email, password);

    if (staffData) {
        userRole = staffData.role;
        
        try {
            const authInstance = auth;
            const userCredential = await signInAnonymously(authInstance); 
            userId = userCredential.user.uid; 
            
            document.getElementById('user-id-display').textContent = `Usuário ID: ${userId.substring(0, 8)} | Função: ${userRole.toUpperCase()}`;
            
            hideLoginModal(); 
            hideStatus(); 
            
            loadOpenTables();
            renderTableFilters(); 
            fetchWooCommerceProducts(renderMenu);
            fetchWooCommerceCategories(renderTableFilters); 
            
            goToScreen('panelScreen');
            
        } catch (error) {
             console.error("Erro ao autenticar Staff (Firebase/Anônimo):", error);
             alert("Autenticação local OK, mas falha no Firebase. Verifique a conexão.");
        }
    } else {
        alert('Credenciais inválidas. Verifique seu e-mail e senha.');
    }
    if (loginBtn) loginBtn.disabled = false;
};

const handleLogout = () => {
    userId = null;
    currentTableId = null;
    selectedItems = [];
    userRole = 'anonymous'; 
    
    if (auth && auth.currentUser) {
        auth.signOut().catch(e => console.error("Erro no sign out:", e)); 
    }
    
    goToScreen('panelScreen');
    showLoginModal();
    document.getElementById('user-id-display').textContent = 'Usuário ID: Carregando...';
};

window.handleLogout = handleLogout;


// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {

    const firebaseConfig = JSON.parse(window.__firebase_config);
    const app = initializeApp(firebaseConfig); 
    const dbInstance = getFirestore(app);
    const authInstance = getAuth(app);
    
    initializeFirebase(dbInstance, authInstance, window.__app_id || 'pdv_default_app'); 

    onAuthStateChanged(authInstance, (user) => {
        if (!user) {
            showLoginModal();
        } 
    });

    // 1. Event Listeners de Login
    if (loginBtn) {
        loginBtn.addEventListener('click', handleStaffLogin);
    }
    
    // 2. Event Listeners do Cabeçalho e Painel
    const openManagerPanelBtn = document.getElementById('openManagerPanelBtn');
    const logoutBtnHeader = document.getElementById('logoutBtnHeader');
    const abrirMesaBtn = document.getElementById('abrirMesaBtn');
    const searchTableBtn = document.getElementById('searchTableBtn');

    if (openManagerPanelBtn) { 
        openManagerPanelBtn.addEventListener('click', () => {
             openManagerAuthModal('goToManagerPanel'); 
        });
    }
    if (logoutBtnHeader) {
        logoutBtnHeader.addEventListener('click', handleLogout); 
    }
    if (abrirMesaBtn) {
        abrirMesaBtn.addEventListener('click', handleAbrirMesa);
    }
    if (searchTableBtn) {
        searchTableBtn.addEventListener('click', handleSearchTable);
    }

    // 3. Carrega UI Inicial
    loadOpenTables();
    renderTableFilters(); 
});
