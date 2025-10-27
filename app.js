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
const STAFF_CREDENTIALS = { 'agencia@fatormd.com': { password: '1234', role: 'gerente', name: 'Fmd' }, 'garcom@fator.com': { password: '1234', role: 'garcom', name: 'Mock Garçom' } };
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
export const hideStatus = () => {
    if (!statusScreen) statusScreen = document.getElementById('statusScreen');
    if (statusScreen) {
        console.log("[hideStatus] Hiding status screen."); // Debug
        statusScreen.style.cssText = 'display: none !important;';
    } else { console.error("[hideStatus] statusScreen element NOT found!"); }
};
const showLoginScreen = () => {
    console.log("[UI] showLoginScreen called.");
    if (!mainContent) mainContent = document.getElementById('mainContent');
    if (!mainHeader) mainHeader = document.getElementById('mainHeader');
    if (!appContainer) appContainer = document.getElementById('appContainer');
    if (!loginEmailInput) loginEmailInput = document.getElementById('loginEmail');
    if (!loginPasswordInput) loginPasswordInput = document.getElementById('loginPassword');
    if (!loginErrorMsg) loginErrorMsg = document.getElementById('loginErrorMsg');

    hideStatus(); // Tenta esconder status

    if (mainHeader) mainHeader.style.display = 'none';
    if (mainContent) mainContent.style.display = 'block';
    if (appContainer) appContainer.style.transform = `translateX(0vw)`;
    document.body.classList.remove('logged-in');

    if(loginEmailInput) loginEmailInput.value = '';
    if(loginPasswordInput) loginPasswordInput.value = '';
    if(loginErrorMsg) loginErrorMsg.style.display = 'none';
    console.log("[UI] showLoginScreen finished.");
};
const hideLoginScreen = () => { /* ... (mantida) ... */ };
export const goToScreen = (screenId) => { /* ... (mantida) ... */ };
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

// --- LÓGICA DE AUTH/LOGIN (mantido com flag) ---
const authenticateStaff = (email, password) => { /* ... */ };
const handleStaffLogin = async () => { /* ... */ };
const handleLogout = () => { /* ... */ };
window.handleLogout = handleLogout;

// --- INICIALIZAÇÃO PRINCIPAL ---
document.addEventListener('DOMContentLoaded', () => {
    console.log("[INIT] DOMContentLoaded event fired.");

    // Mapeia o statusScreen AQUI
    statusScreen = document.getElementById('statusScreen');
    if (!statusScreen) {
        console.error("CRITICAL ERROR: statusScreen element not found!");
        alert("Erro Crítico: Elemento de carregamento não encontrado.");
        return;
    }
    console.log("[INIT] statusScreen mapped successfully.");

    const firebaseConfig = FIREBASE_CONFIG;

    try {
        console.log("[INIT] Firebase config loaded.");

        // Inicializa Firebase App e Serviços
        console.log("[INIT] Initializing Firebase App..."); // Log antes
        const app = initializeApp(firebaseConfig);
        console.log("[INIT] Firebase App initialized."); // Log depois
        console.log("[INIT] Getting Firestore instance..."); // Log antes
        const dbInstance = getFirestore(app);
        console.log("[INIT] Firestore instance obtained."); // Log depois
        console.log("[INIT] Getting Auth instance..."); // Log antes
        const authInstance = getAuth(app);
        console.log("[INIT] Auth instance obtained."); // Log depois

        initializeFirebase(dbInstance, authInstance, APP_ID); // Passa instâncias
        console.log("[INIT] Firebase services passed to firebaseService.");

        // Mapeia outros elementos Globais e de Login
        mainContent = document.getElementById('mainContent');
        appContainer = document.getElementById('appContainer');
        mainHeader = document.getElementById('mainHeader');
        loginBtn = document.getElementById('loginBtn');
        loginEmailInput = document.getElementById('loginEmail');
        loginPasswordInput = document.getElementById('loginPassword');
        loginErrorMsg = document.getElementById('loginErrorMsg');
        console.log("[INIT] Global and Login UI elements mapped.");

        // ==============================================
        //     LISTENER ATUALIZADO: onAuthStateChanged (com mais logs)
        // ==============================================
        console.log("[INIT] Setting up Firebase AuthStateChanged listener..."); // Log ANTES
        onAuthStateChanged(authInstance, async (user) => {
            // Log DENTRO para garantir que está sendo chamado
            console.log("[AUTH] Listener FIRED! User object:", user);

            if (isLoginProcessActive) {
                console.log("[AUTH] Ignoring Auth State change (login process active).");
                return;
            }

            if (user) {
                userId = user.uid;
                console.log(`[AUTH] User detected (UID: ${user.uid}). Current local role: '${userRole}'`);
                if (userRole === 'gerente' || userRole === 'garcom') {
                     console.log(`[AUTH] Initializing staff app for role '${userRole}'...`);
                     const userName = STAFF_CREDENTIALS[loginEmailInput?.value?.trim()]?.name || userRole;
                     const userIdDisplay = document.getElementById('user-id-display');
                     if(userIdDisplay) userIdDisplay.textContent = `Usuário: ${userName} | ${userRole.toUpperCase()}`;
                    await initStaffApp();
                } else {
                    console.warn("[AUTH] Firebase user exists, but local role is invalid ('anonymous'). Forcing logout.");
                    handleLogout();
                }
            } else {
                userId = null;
                userRole = 'anonymous';
                if (unsubscribeTable) { unsubscribeTable(); unsubscribeTable = null; }
                currentTableId = null; currentOrderSnapshot = null; selectedItems.length = 0;
                console.log("[AUTH] No Firebase user detected. Showing login screen.");
                showLoginScreen(); // Mostra a tela de login
            }
        });
        console.log("[INIT] Firebase AuthStateChanged listener configured."); // Log DEPOIS
        // ==============================================
        //           FIM DO LISTENER ATUALIZADO
        // ==============================================


        // Adiciona Listener ao Botão de Login
        if (loginBtn) {
            loginBtn.addEventListener('click', handleStaffLogin);
            console.log("[INIT] Login button listener added.");
        } else {
             console.error("[INIT] Login Button (loginBtn) not found!");
             // CONSIDERAR: Se o botão de login não existe, a app está quebrada.
             // Talvez forçar a esconder o status aqui? Ou mostrar erro?
             // hideStatus(); // Força esconder status se botão login falhar?
        }

        // Inicializa os Controllers
        console.log("[INIT] Calling controller initializers...");
        try {
            initPanelController();
            initOrderController();
            initPaymentController();
            initManagerController();
            console.log("[INIT] Controller initializers called successfully.");
        } catch (controllerError) {
             console.error("[INIT] Error initializing controllers:", controllerError);
             alert(`Erro ao inicializar módulos: ${controllerError.message}`);
             showLoginScreen(); // Tenta ir para o login em caso de erro nos controllers
             return;
        }

        // Outros Listeners Globais
        // ... (código mantido) ...

        console.log("[INIT] Remaining global listeners added.");

    } catch (e) {
        console.error("CRITICAL Error during DOMContentLoaded initialization:", e);
        alert(`Falha grave ao carregar o PDV: ${e.message}. Verifique o console.`);
        // Tenta esconder a tela de status em caso de erro grave
        hideStatus();
        return;
    }
    console.log("[INIT] DOMContentLoaded initialization finished successfully.");
}); // FIM DO DOMContentLoaded
