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
let isLoginProcessActive = false; // Flag para prevenir race condition no login

// --- FUNÇÕES CORE E ROTIAMENTO ---
export const hideStatus = () => {
    if (!statusScreen) statusScreen = document.getElementById('statusScreen');
    if (statusScreen) {
        console.log("[hideStatus] Hiding status screen.");
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

    hideStatus();

    if (mainHeader) mainHeader.style.display = 'none';
    if (mainContent) mainContent.style.display = 'block'; // <<< Garante que o container principal esteja visível
    if (appContainer) appContainer.style.transform = `translateX(0vw)`;
    document.body.classList.remove('logged-in');

    if(loginEmailInput) loginEmailInput.value = '';
    if(loginPasswordInput) loginPasswordInput.value = '';
    if(loginErrorMsg) loginErrorMsg.style.display = 'none';
    console.log("[UI] showLoginScreen finished.");
};
const hideLoginScreen = () => {
    console.log("[UI] hideLoginScreen called."); // Debug
    if (!mainHeader) mainHeader = document.getElementById('mainHeader');
    if (!mainContent) mainContent = document.getElementById('mainContent');
    if (mainHeader) mainHeader.style.display = 'flex';
    if (mainContent) mainContent.style.display = 'block'; // <<< Garante que o container principal esteja visível
    document.body.classList.add('logged-in');

    const logoutBtn = document.getElementById('logoutBtnHeader');
    const managerBtn = document.getElementById('openManagerPanelBtn');
    if (logoutBtn) logoutBtn.classList.remove('hidden');
    if (managerBtn) { managerBtn.classList.toggle('hidden', userRole !== 'gerente'); }
     console.log("[UI] hideLoginScreen finished."); // Debug
};
export const goToScreen = (screenId) => {
     console.log(`[NAV] Requesting navigation to ${screenId}`); // Debug INÍCIO da função
     if (!appContainer) appContainer = document.getElementById('appContainer');
     if (!mainContent) mainContent = document.getElementById('mainContent');

     if (currentTableId && screenId === 'panelScreen') { /* ... (salvar itens) ... */ }

     if ((screenId === 'panelScreen' || screenId === 'loginScreen') && currentTableId && unsubscribeTable) { /* ... (limpar estado da mesa) ... */ }

    const screenIndex = screens[screenId];
    if (screenIndex !== undefined) {
        console.log(`[NAV] Applying transform for ${screenId} (index ${screenIndex})`); // Debug ANTES de aplicar
        if (appContainer) appContainer.style.transform = `translateX(-${screenIndex * 100}vw)`;
        // Garante que o mainContent esteja visível para todas as telas exceto login
        if (mainContent) {
            mainContent.style.display = (screenId !== 'loginScreen') ? 'block' : 'block'; // Garante block
            console.log(`[NAV] Set mainContent display to: ${mainContent.style.display}`); // Debug
        }
        document.body.classList.toggle('bg-gray-900', screenId === 'managerScreen');
        document.body.classList.toggle('bg-dark-bg', screenId !== 'managerScreen');
        console.log(`[NAV] Navigation to ${screenId} styles applied.`); // Debug DEPOIS de aplicar
    } else { console.error(`[NAV] Invalid screenId: ${screenId}`); }
};
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

// --- INICIALIZAÇÃO APP STAFF ---
const initStaffApp = async () => {
    console.log("[INIT] initStaffApp called."); // Debug INÍCIO
    try {
        renderTableFilters();
        console.log("[INIT] Sector filters rendered.");

        // Fetch em background
        fetchWooCommerceProducts().catch(e => console.error("[INIT ERROR] Failed loading products:", e));
        fetchWooCommerceCategories().catch(e => console.error("[INIT ERROR] Failed loading categories:", e));

        console.log("[INIT] Calling hideLoginScreen..."); // Debug ANTES
        hideLoginScreen();
        console.log("[INIT] hideLoginScreen finished."); // Debug DEPOIS

        loadOpenTables();
        console.log("[INIT] Open tables listener configured.");

        console.log("[INIT] Calling goToScreen('panelScreen')..."); // Debug ANTES
        goToScreen('panelScreen');
        console.log("[INIT] goToScreen('panelScreen') finished."); // Debug DEPOIS
        console.log("[INIT] Staff app initialization seems complete."); // Debug FIM

    } catch (error) {
        console.error("[INIT] CRITICAL Error during initStaffApp:", error);
        alert(`Erro grave ao iniciar: ${error.message}.`);
        showLoginScreen();
    }
};

// --- LÓGICA DE AUTH/LOGIN ---
const authenticateStaff = (email, password) => { /* ... (mantida) ... */ };

const handleStaffLogin = async () => {
    console.log("[LOGIN] handleStaffLogin called."); // Debug INÍCIO
    loginBtn = loginBtn || document.getElementById('loginBtn');
    loginEmailInput = loginEmailInput || document.getElementById('loginEmail');
    loginPasswordInput = loginPasswordInput || document.getElementById('loginPassword');
    loginErrorMsg = loginErrorMsg || document.getElementById('loginErrorMsg');
    if (!loginBtn || !loginEmailInput || !loginPasswordInput) { console.error("[LOGIN] Login form elements missing!"); return; }

    if (loginErrorMsg) loginErrorMsg.style.display = 'none';
    loginBtn.disabled = true; loginBtn.textContent = 'Entrando...';
    isLoginProcessActive = true; // Define a flag
    console.log("[LOGIN] Flag isLoginProcessActive set to true."); // Debug

    const email = loginEmailInput.value.trim();
    const password = loginPasswordInput.value.trim();

    console.log(`[LOGIN] Attempting local auth for ${email}...`);
    const staffData = authenticateStaff(email, password);

    if (staffData) {
        console.log(`[LOGIN] Local auth successful. Role: ${staffData.role}`);
        userRole = staffData.role; // Define role ANTES do sign-in
        try {
            const authInstance = getAuth();
            if (!authInstance) throw new Error("Auth instance not available.");

            console.log("[LOGIN] Attempting Firebase anonymous sign-in...");
            const userCredential = await signInAnonymously(authInstance); // Espera o sign-in
            userId = userCredential.user.uid;
            console.log(`[LOGIN] Firebase sign-in successful. UID: ${userId}`);

            const userName = staffData.name || userRole;
            const userIdDisplay = document.getElementById('user-id-display');
            if(userIdDisplay) userIdDisplay.textContent = `Usuário: ${userName} | ${userRole.toUpperCase()}`;
            console.log("[LOGIN] User display updated.");

            console.log("[LOGIN] Calling initStaffApp from handleStaffLogin...");
            await initStaffApp(); // Chama a inicialização
            console.log("[LOGIN] initStaffApp finished execution from handleStaffLogin.");

        } catch (error) {
             console.error("[LOGIN] Error during sign-in or app init:", error);
             alert(`Erro login/init: ${error.message}.`);
             userRole = 'anonymous'; userId = null; // Reseta estado
             showLoginScreen();
             if(loginErrorMsg) { loginErrorMsg.textContent = `Erro: ${error.message}`; loginErrorMsg.style.display = 'block'; }
        }
    } else {
        console.log(`[LOGIN] Invalid credentials for ${email}.`);
        if(loginErrorMsg) { loginErrorMsg.textContent = 'E-mail ou senha inválidos.'; loginErrorMsg.style.display = 'block'; }
    }

    // Garante reabilitação do botão e reset da flag no final
    if (loginBtn) { loginBtn.disabled = false; loginBtn.textContent = 'Entrar'; }
    isLoginProcessActive = false;
    console.log("[LOGIN] Flag isLoginProcessActive set to false. handleStaffLogin finished."); // Debug
};

const handleLogout = () => { /* ... (mantida) ... */ };
window.handleLogout = handleLogout;

// --- INICIALIZAÇÃO PRINCIPAL ---
document.addEventListener('DOMContentLoaded', () => {
    console.log("[INIT] DOMContentLoaded event fired.");
    statusScreen = document.getElementById('statusScreen');
    if (!statusScreen) { console.error("CRITICAL ERROR: statusScreen element not found!"); alert("Erro Crítico: Interface não carregou."); return; }
    console.log("[INIT] statusScreen mapped.");

    const firebaseConfig = FIREBASE_CONFIG;
    let authInstance; // Declara fora do try para usar no log final

    try {
        console.log("[INIT] Firebase config loaded.");
        const app = initializeApp(firebaseConfig);
        console.log("[INIT] Firebase App initialized.");
        const dbInstance = getFirestore(app);
        console.log("[INIT] Firestore instance obtained.");
        authInstance = getAuth(app); // Atribui à variável externa
        console.log("[INIT] Auth instance obtained.");
        initializeFirebase(dbInstance, authInstance, APP_ID);
        console.log("[INIT] Firebase services passed to firebaseService.");

        mainContent = document.getElementById('mainContent');
        appContainer = document.getElementById('appContainer');
        mainHeader = document.getElementById('mainHeader');
        loginBtn = document.getElementById('loginBtn');
        loginEmailInput = document.getElementById('loginEmail');
        loginPasswordInput = document.getElementById('loginPassword');
        loginErrorMsg = document.getElementById('loginErrorMsg');
        console.log("[INIT] UI elements mapped.");

        console.log("[INIT] Setting up AuthStateChanged listener...");
        onAuthStateChanged(authInstance, async (user) => {
            console.log("[AUTH] Listener FIRED! User:", user ? user.uid : 'null'); // Log DENTRO

            if (isLoginProcessActive) {
                console.log("[AUTH] Ignoring Auth State change (login process active).");
                return;
            }

            if (user) {
                userId = user.uid;
                console.log(`[AUTH] User detected. Local role: '${userRole}'`);
                if (userRole === 'gerente' || userRole === 'garcom') {
                     console.log(`[AUTH] Initializing staff app...`);
                     const userName = STAFF_CREDENTIALS[loginEmailInput?.value?.trim()]?.name || userRole;
                     const userIdDisplay = document.getElementById('user-id-display');
                     if(userIdDisplay) userIdDisplay.textContent = `Usuário: ${userName} | ${userRole.toUpperCase()}`;
                    await initStaffApp();
                } else {
                    console.warn("[AUTH] Firebase user exists, but local role invalid. Forcing logout.");
                    handleLogout();
                }
            } else {
                userId = null; userRole = 'anonymous';
                if (unsubscribeTable) { unsubscribeTable(); unsubscribeTable = null; }
                currentTableId = null; currentOrderSnapshot = null; selectedItems.length = 0;
                console.log("[AUTH] No Firebase user. Showing login screen.");
                showLoginScreen();
            }
        });
        console.log("[INIT] AuthStateChanged listener configured.");


        if (loginBtn) {
            loginBtn.addEventListener('click', handleStaffLogin);
            console.log("[INIT] Login button listener added.");
        } else { console.error("[INIT] Login Button (loginBtn) not found!"); }

        console.log("[INIT] Calling controller initializers...");
        try {
            initPanelController();
            initOrderController();
            initPaymentController();
            initManagerController();
            console.log("[INIT] Controller initializers called.");
        } catch (controllerError) {
             console.error("[INIT] Error initializing controllers:", controllerError);
             alert(`Erro init controllers: ${controllerError.message}`);
             showLoginScreen(); return;
        }

        // Outros Listeners (mantido)
        const openManagerPanelBtn = document.getElementById('openManagerPanelBtn');
        const logoutBtnHeader = document.getElementById('logoutBtnHeader');
        const openNfeModalBtn = document.getElementById('openNfeModalBtn');
        if (openManagerPanelBtn) openManagerPanelBtn.addEventListener('click', () => { window.openManagerAuthModal('goToManagerPanel'); });
        if (logoutBtnHeader) logoutBtnHeader.addEventListener('click', handleLogout);
        if (openNfeModalBtn) openNfeModalBtn.addEventListener('click', window.openNfeModal);
        console.log("[INIT] Global listeners added.");

    } catch (e) {
        console.error("CRITICAL Error during DOMContentLoaded:", e);
        alert(`Falha grave init: ${e.message}.`);
        hideStatus(); // Tenta esconder loading mesmo com erro
        return;
    }
    console.log("[INIT] DOMContentLoaded finished. Waiting for AuthStateChanged..."); // Mensagem final do DOMContentLoaded
}); // FIM DO DOMContentLoaded
