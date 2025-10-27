// --- APP.JS ---
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut, signInAnonymously } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, serverTimestamp, doc, setDoc, updateDoc, getDoc, onSnapshot, writeBatch, arrayRemove, arrayUnion } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// Importações (mantidas)
import { initializeFirebase, saveSelectedItemsToFirebase, getTableDocRef, auth, db } from '/services/firebaseService.js';
import { fetchWooCommerceProducts, fetchWooCommerceCategories } from '/services/wooCommerceService.js';
import { formatCurrency, formatElapsedTime } from '/utils.js';
import { loadOpenTables, renderTableFilters, handleAbrirMesa, handleSearchTable, initPanelController } from '/controllers/panelController.js';
import { renderMenu, renderOrderScreen, increaseLocalItemQuantity, decreaseLocalItemQuantity, openObsModalForGroup, initOrderController, handleSendSelectedItems } from '/controllers/orderController.js';
import {
    renderPaymentSummary, deletePayment, handleMassActionRequest,
    initPaymentController, handleFinalizeOrder,
    handleMassDeleteConfirmed, executeDeletePayment,
    openTableTransferModal // handleConfirmTableTransfer é LOCAL aqui
} from '/controllers/paymentController.js';
import { initManagerController, handleGerencialAction } from '/controllers/managerController.js';

// --- CONFIGURAÇÃO E VARIÁVEIS GLOBAIS ---
const APP_ID = "pdv_fator_instance_001";
const FIREBASE_CONFIG = { apiKey: "AIzaSyCQINQFRyAES3hkG8bVpQlRXGv9AzQuYYY", authDomain: "fator-pdv.firebaseapp.com", projectId: "fator-pdv", storageBucket: "fator-pdv.appspot.com", messagingSenderId: "1097659747429", appId: "1:1097659747429:web:8ec0a7c3978c311dbe0a8c" };
export const screens = { 'loginScreen': 0, 'panelScreen': 1, 'orderScreen': 2, 'paymentScreen': 3, 'managerScreen': 4 };
const STAFF_CREDENTIALS = {
    'agencia@fatormd.com': { password: '1234', role: 'gerente', name: 'Fmd' },
    'garcom@fator.com': { password: '1234', role: 'garcom', name: 'Mock Garçom' },
};
const MANAGER_PASSWORD = '1234';
export let currentTableId = null;
export let selectedItems = [];
export let currentOrderSnapshot = null;
export let userRole = 'anonymous';
export let userId = null;
export let unsubscribeTable = null;
let statusScreen = null;
let mainContent = null;
let appContainer = null;
let loginScreen = null;
let mainHeader = null;
let loginBtn = null;
let loginEmailInput = null;
let loginPasswordInput = null;
let loginErrorMsg = null;
let isLoginProcessActive = false;

// --- FUNÇÕES CORE E ROTIAMENTO ---
export const hideStatus = () => { /* ... (mantida) ... */ };
const showLoginScreen = () => { /* ... (mantida) ... */ };
const hideLoginScreen = () => { /* ... (mantida) ... */ };

// ==============================================
//     FUNÇÃO ATUALIZADA: goToScreen (com requestAnimationFrame)
// ==============================================
export const goToScreen = (screenId) => {
     console.log(`[NAV] Requesting navigation to ${screenId}`);
     // Mapeia elementos aqui para garantir que existem no momento da chamada
     const currentAppContainer = document.getElementById('appContainer');
     const currentMainContent = document.getElementById('mainContent');

     if (!currentAppContainer || !currentMainContent) {
         console.error("[NAV] Critical error: appContainer or mainContent not found!");
         return;
     }

     // Lógica de salvar itens e limpar estado (mantida)
     if (currentTableId && screenId === 'panelScreen') { /* ... */ }
     if ((screenId === 'panelScreen' || screenId === 'loginScreen') && currentTableId && unsubscribeTable) { /* ... */ }

    const screenIndex = screens[screenId];
    if (screenIndex !== undefined) {
        console.log(`[NAV] Preparing styles for ${screenId} (index ${screenIndex})`);

        // Aplica estilos visuais ANTES da transformação
        currentMainContent.style.display = 'block'; // Garante que o container principal está visível
        document.body.classList.toggle('bg-gray-900', screenId === 'managerScreen');
        document.body.classList.toggle('bg-dark-bg', screenId !== 'managerScreen');

        // Usa requestAnimationFrame para garantir que o navegador processe
        // as mudanças de estilo ANTES de aplicar a transformação da transição.
        requestAnimationFrame(() => {
            console.log(`[NAV] Applying transform: translateX(-${screenIndex * 100}vw)`);
            currentAppContainer.style.transform = `translateX(-${screenIndex * 100}vw)`;
             // Força reflow (leitura de propriedade) - pode ajudar em alguns casos
             // currentAppContainer.offsetHeight;
            console.log(`[NAV] Transform applied for ${screenId}.`);
        });

    } else {
        console.error(`[NAV] Invalid screenId: ${screenId}`);
    }
};
// ==============================================
//           FIM DA FUNÇÃO ATUALIZADA
// ==============================================
window.goToScreen = goToScreen;

// Lógica de Transferência (mantida)
export const handleTableTransferConfirmed = async (originTableId, targetTableId, itemsToTransfer, newDiners = 0, newSector = '') => { /* ... */ };
window.handleTableTransferConfirmed = handleTableTransferConfirmed;

// MODAL DE AUTENTICAÇÃO GLOBAL (mantido)
window.openManagerAuthModal = (action, payload = null) => { /* ... */ };

// Expor funções globais (mantido)
window.deletePayment = deletePayment;
window.handleMassActionRequest = handleMassActionRequest;
window.openTableTransferModal = openTableTransferModal;
window.openKdsStatusModal = (id) => alert(`Abrir status KDS ${id} (DEV)`);
window.increaseLocalItemQuantity = increaseLocalItemQuantity;
window.decreaseLocalItemQuantity = decreaseLocalItemQuantity;
window.openObsModalForGroup = openObsModalForGroup;

// Listener da Mesa (mantido)
export const setTableListener = (tableId) => { /* ... */ };

// Define a mesa atual (mantido)
export const setCurrentTable = (tableId) => { /* ... */ };

// Seleciona a mesa (mantido)
export const selectTableAndStartListener = async (tableId) => { /* ... */ };
window.selectTableAndStartListener = selectTableAndStartListener;

// NF-e Placeholder (mantido)
window.openNfeModal = () => { alert("Abrir modal NF-e (DEV)"); };

// --- INICIALIZAÇÃO APP STAFF (mantido) ---
const initStaffApp = async () => { /* ... */ };

// --- LÓGICA DE AUTH/LOGIN ---
const authenticateStaff = (email, password) => { /* ... (Mantida com logs detalhados) ... */ };
const handleStaffLogin = async () => { /* ... (Mantida com flag e chamada direta a initStaffApp) ... */ };
const handleLogout = () => { /* ... (Mantida) ... */ };
window.handleLogout = handleLogout;

// --- INICIALIZAÇÃO PRINCIPAL ---
document.addEventListener('DOMContentLoaded', () => {
    console.log("[INIT] DOMContentLoaded fired.");
    statusScreen = document.getElementById('statusScreen');
    if (!statusScreen) { console.error("CRITICAL: statusScreen missing!"); return; }
    console.log("[INIT] statusScreen mapped.");

    const firebaseConfig = FIREBASE_CONFIG;
    let authInstance;

    try {
        console.log("[INIT] Firebase config OK.");
        const app = initializeApp(firebaseConfig); console.log("[INIT] Firebase App OK.");
        const dbInstance = getFirestore(app); console.log("[INIT] Firestore OK.");
        authInstance = getAuth(app); console.log("[INIT] Auth OK.");
        initializeFirebase(dbInstance, authInstance, APP_ID); console.log("[INIT] Services passed.");

        // Mapeia elementos globais AQUI para garantir que existam
        mainContent = document.getElementById('mainContent');
        appContainer = document.getElementById('appContainer');
        mainHeader = document.getElementById('mainHeader');
        loginBtn = document.getElementById('loginBtn');
        loginEmailInput = document.getElementById('loginEmail');
        loginPasswordInput = document.getElementById('loginPassword');
        loginErrorMsg = document.getElementById('loginErrorMsg');
        console.log("[INIT] UI mapped.");

        console.log("[INIT] Setting up Auth listener...");
        onAuthStateChanged(authInstance, async (user) => {
            console.log("[AUTH] Listener FIRED! User:", user ? user.uid : 'null');
            if (isLoginProcessActive) { console.log("[AUTH] Ignoring (login active)."); return; }
            if (user) { /* ... (lógica mantida) ... */ }
            else { /* ... (lógica mantida) ... */ showLoginScreen(); } // Chama showLoginScreen se não houver usuário
        });
        console.log("[INIT] Auth listener configured.");


        if (loginBtn) {
            loginBtn.addEventListener('click', handleStaffLogin);
            console.log("[INIT] Login listener added.");
        } else { console.error("[INIT] Login Button missing!"); }

        console.log("[INIT] Calling controller inits...");
        try {
            initPanelController(); initOrderController(); initPaymentController(); initManagerController();
            console.log("[INIT] Controllers initialized.");
        } catch (controllerError) { /* ... (erro mantido) ... */ }

        // Outros Listeners (mantido)
        // ...

        console.log("[INIT] Global listeners added.");

    } catch (e) {
        console.error("CRITICAL init error:", e);
        alert(`Falha grave init: ${e.message}.`);
        hideStatus(); return;
    }
    console.log("[INIT] DOMContentLoaded finished. Waiting for Auth...");
}); // FIM DO DOMContentLoaded
