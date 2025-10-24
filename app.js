// --- APP.JS ---
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut, signInAnonymously } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, serverTimestamp, doc, setDoc, updateDoc, getDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// Importações dos Serviços e Utils
import { initializeFirebase, saveSelectedItemsToFirebase, getTableDocRef, auth } from '/services/firebaseService.js';
import { fetchWooCommerceProducts, fetchWooCommerceCategories } from '/services/wooCommerceService.js';
import { formatCurrency } from '/utils.js';

// Importações dos Controllers
// Removido 'loadTableOrder' da importação do panelController
import { loadOpenTables, renderTableFilters, handleAbrirMesa, handleSearchTable, initPanelController, handleTableTransferConfirmed as panel_handleTableTransferConfirmed } from '/controllers/panelController.js'; // Renomeia import para evitar conflito
import { renderMenu, renderOrderScreen, increaseLocalItemQuantity, decreaseLocalItemQuantity, openObsModalForGroup, initOrderController, handleSendSelectedItems } from '/controllers/orderController.js';
// Removido handleConfirmTableTransfer da importação do paymentController, pois já é exposto globalmente lá
import { renderPaymentSummary, deletePayment, handleMassActionRequest, handleAddSplitAccount, openPaymentModalForSplit, moveItemsToMainAccount, openSplitTransferModal, openTableTransferModal, initPaymentController, handleFinalizeOrder } from '/controllers/paymentController.js';
import { openManagerAuthModal, initManagerController } from '/controllers/managerController.js';

// --- VARIÁVEIS DE ESTADO GLOBAL ---
export const screens = {
    'loginScreen': 0, 'panelScreen': 1, 'orderScreen': 2, 'paymentScreen': 3, 'managerScreen': 4,
};
const STAFF_CREDENTIALS = {
    'agencia@fatormd.com': { password: '1234', role: 'gerente', name: 'Fmd' },
    'garcom@fator.com': { password: '1234', role: 'garcom', name: 'Mock Garçom' },
};
export let currentTableId = null;
export let selectedItems = [];
export let currentOrderSnapshot = null;
export let userRole = 'anonymous';
export let userId = null;
export let unsubscribeTable = null;


// --- ELEMENTOS UI ---
let statusScreen, mainContent, appContainer, loginScreen, mainHeader;
let loginBtn, loginEmailInput, loginPasswordInput, loginErrorMsg;


// --- FUNÇÕES CORE E ROTIAMENTO ---
export const hideStatus = () => { /* ... (mantida) ... */ };
const showLoginScreen = () => { /* ... (mantida) ... */ };
const hideLoginScreen = () => { /* ... (mantida) ... */ };
export const goToScreen = (screenId) => { /* ... (lógica mantida) ... */ };
window.goToScreen = goToScreen;

// Expor funções globais necessárias dos controllers que são chamadas pelo HTML
window.openManagerAuthModal = openManagerAuthModal;
// window.deletePayment = deletePayment; // Já exposto em paymentController
// window.handleMassActionRequest = handleMassActionRequest; // Já exposto em paymentController
// window.handleConfirmTableTransfer = handleConfirmTableTransfer; // REMOVIDO DAQUI - Já exposto em paymentController
// Funções de Split comentadas/removidas
// window.handleAddSplitAccount = handleAddSplitAccount;
// window.openPaymentModalForSplit = openPaymentModalForSplit;
// window.moveItemsToMainAccount = moveItemsToMainAccount;
// window.openSplitTransferModal = openSplitTransferModal;
// window.openTableTransferModal = openTableTransferModal; // Já exposto em paymentController
window.openKdsStatusModal = (id) => alert(`Abrir status KDS ${id} (DEV)`);

// Listener da Mesa
export const setTableListener = (tableId) => { /* ... (lógica mantida) ... */ };
// Define a mesa atual e inicia o listener
export const setCurrentTable = (tableId) => { /* ... (lógica mantida) ... */ };
// Função movida do panelController para quebrar dependência circular
export const selectTableAndStartListener = async (tableId) => { /* ... (lógica mantida) ... */ };

// Função NF-e (Placeholder global)
window.openNfeModal = () => { /* ... (lógica mantida) ... */ };


// --- INICIALIZAÇÃO APP STAFF ---
const initStaffApp = async () => { /* ... (lógica mantida) ... */ };

// --- LÓGICA DE AUTH/LOGIN ---
const authenticateStaff = (email, password) => { /* ... (lógica mantida) ... */ };
const handleStaffLogin = async () => { /* ... (lógica mantida) ... */ };
const handleLogout = () => { /* ... (lógica mantida) ... */ };
window.handleLogout = handleLogout;


// --- INICIALIZAÇÃO PRINCIPAL ---
document.addEventListener('DOMContentLoaded', () => {
    console.log("[INIT] DOMContentLoaded.");
    try {
        const firebaseConfig = JSON.parse(window.__firebase_config);
        console.log("[INIT] Config Firebase carregada.");

        // Inicializa Firebase App e Serviços
        const app = initializeApp(firebaseConfig);
        const dbInstance = getFirestore(app);
        const authInstance = getAuth(app);
        initializeFirebase(dbInstance, authInstance, window.__app_id || 'pdv_default_app');
        console.log("[INIT] Firebase App e Serviços inicializados.");

        // Mapeia elementos Globais e de Login
        statusScreen = document.getElementById('statusScreen');
        mainContent = document.getElementById('mainContent');
        appContainer = document.getElementById('appContainer');
        mainHeader = document.getElementById('mainHeader');
        loginBtn = document.getElementById('loginBtn');
        loginEmailInput = document.getElementById('loginEmail');
        loginPasswordInput = document.getElementById('loginPassword');
        loginErrorMsg = document.getElementById('loginErrorMsg');
        console.log("[INIT] Elementos Globais e de Login mapeados.");

        // Listener de Autenticação Firebase
        onAuthStateChanged(authInstance, (user) => {
            console.log("[AUTH] State Changed:", user ? `User UID: ${user.uid}` : 'No user');
            if (!user && userRole !== 'gerente' && userRole !== 'garcom') {
                 console.log("[AUTH] -> showLoginScreen()");
                 showLoginScreen();
            }
        });
        console.log("[INIT] Listener AuthStateChanged configurado.");

        // Adiciona Listener ao Botão de Login
        if (loginBtn) {
            loginBtn.addEventListener('click', handleStaffLogin);
            console.log("[INIT] Listener do botão Login adicionado.");
        } else {
             console.error("[INIT] Botão de Login (loginBtn) não encontrado!");
        }

        // Inicializa os Controllers
        console.log("[INIT] Chamando inicializadores dos controllers...");
        initPanelController();
        initOrderController();
        initPaymentController();
        initManagerController();
        console.log("[INIT] Inicializadores dos controllers chamados.");

        // Outros Listeners Globais (Header, etc.)
        const openManagerPanelBtn = document.getElementById('openManagerPanelBtn');
        const logoutBtnHeader = document.getElementById('logoutBtnHeader');
        const openNfeModalBtn = document.getElementById('openNfeModalBtn');

        if (openManagerPanelBtn) openManagerPanelBtn.addEventListener('click', () => { window.openManagerAuthModal('goToManagerPanel'); });
        if (logoutBtnHeader) logoutBtnHeader.addEventListener('click', handleLogout);
        if (openNfeModalBtn) openNfeModalBtn.addEventListener('click', window.openNfeModal); // Chama a função global

        console.log("[INIT] Listeners restantes adicionados.");

    } catch (e) {
        console.error("Erro CRÍTICO na inicialização (DOMContentLoaded):", e);
        alert("Falha grave ao carregar o PDV. Verifique o console.");
        if(statusScreen) statusScreen.innerHTML = '<h2 class="text-red-600 font-bold">Erro de Inicialização</h2>';
    }
    console.log("[INIT] DOMContentLoaded finalizado.");
}); // FIM DO DOMContentLoaded
