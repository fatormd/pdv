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
}; // <<< VERIFIQUE SE ESTÁ EXATAMENTE ASSIM NO SEU CÓDIGO
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

// --- LÓGICA DE AUTH/LOGIN ---

// ==============================================
//     FUNÇÃO ATUALIZADA: authenticateStaff (com logs detalhados)
// ==============================================
const authenticateStaff = (email, password) => {
    console.log(`[AUTH_STAFF] Authenticating with Email: "${email}", Password: "${password}"`); // Log input

    // Log das credenciais armazenadas para comparação
    console.log("[AUTH_STAFF] Stored credentials:", STAFF_CREDENTIALS);

    const creds = STAFF_CREDENTIALS[email]; // Tenta encontrar pelo email exato

    if (!creds) {
        console.log(`[AUTH_STAFF] FAILURE: No credentials found for email key "${email}"`); // Log se email não achou
        return null;
    }

    console.log(`[AUTH_STAFF] Credentials found for ${email}:`, creds); // Log se achou email

    // Verifica a senha
    if (creds.password !== password) {
        console.log(`[AUTH_STAFF] FAILURE: Password mismatch. Provided: "${password}", Expected: "${creds.password}"`); // Log se senha errada
        return null;
    }

    // Verifica a role (só por segurança)
    if (creds.role === 'client') {
        console.log(`[AUTH_STAFF] FAILURE: Role is 'client', not allowed for staff login.`); // Log se role errada
        return null;
    }

    console.log("[AUTH_STAFF] SUCCESS: Credentials match."); // Log se tudo deu certo
    return creds; // Retorna os dados do usuário
};
// ==============================================
//           FIM DA FUNÇÃO ATUALIZADA
// ==============================================


const handleStaffLogin = async () => {
    console.log("[LOGIN] handleStaffLogin called.");
    loginBtn = loginBtn || document.getElementById('loginBtn');
    loginEmailInput = loginEmailInput || document.getElementById('loginEmail');
    loginPasswordInput = loginPasswordInput || document.getElementById('loginPassword');
    loginErrorMsg = loginErrorMsg || document.getElementById('loginErrorMsg');
    if (!loginBtn || !loginEmailInput || !loginPasswordInput) { console.error("[LOGIN] Login elements missing!"); return; }

    if (loginErrorMsg) loginErrorMsg.style.display = 'none';
    loginBtn.disabled = true; loginBtn.textContent = 'Entrando...';
    isLoginProcessActive = true;

    const email = loginEmailInput.value.trim(); // Pega o email do input
    const password = loginPasswordInput.value.trim(); // Pega a senha do input

    console.log(`[LOGIN] Attempting local auth for trimmed Email: "${email}", trimmed Password: "${password}"`); // Log ANTES de chamar authenticateStaff

    // Chama a função de autenticação com os valores dos inputs
    const staffData = authenticateStaff(email, password);

    if (staffData) { // Se authenticateStaff retornou os dados (não null)
        console.log(`[LOGIN] Local auth successful via authenticateStaff. Role: ${staffData.role}`);
        userRole = staffData.role;
        try {
            const authInstance = getAuth();
            if (!authInstance) throw new Error("Auth instance missing.");

            console.log("[LOGIN] Attempting Firebase anonymous sign-in...");
            const userCredential = await signInAnonymously(authInstance);
            userId = userCredential.user.uid;
            console.log(`[LOGIN] Firebase sign-in OK. UID: ${userId}`);

            const userName = staffData.name || userRole;
            const userIdDisplay = document.getElementById('user-id-display');
            if(userIdDisplay) userIdDisplay.textContent = `Usuário: ${userName} | ${userRole.toUpperCase()}`;
            console.log("[LOGIN] User display updated.");

            console.log("[LOGIN] Calling initStaffApp...");
            await initStaffApp();
            console.log("[LOGIN] initStaffApp finished.");

        } catch (error) {
             console.error("[LOGIN] Error during Firebase sign-in/app init:", error);
             alert(`Erro login/init: ${error.message}.`);
             userRole = 'anonymous'; userId = null;
             showLoginScreen();
             if(loginErrorMsg) { loginErrorMsg.textContent = `Erro: ${error.message}`; loginErrorMsg.style.display = 'block'; }
        }
    } else { // Se authenticateStaff retornou null
        console.log(`[LOGIN] authenticateStaff returned null. Invalid credentials for "${email}".`); // Log específico
        if(loginErrorMsg) { loginErrorMsg.textContent = 'E-mail ou senha inválidos.'; loginErrorMsg.style.display = 'block'; }
    }

    if (loginBtn) { loginBtn.disabled = false; loginBtn.textContent = 'Entrar'; }
    isLoginProcessActive = false;
    console.log("[LOGIN] handleStaffLogin finished.");
};

const handleLogout = () => { /* ... (mantida) ... */ };
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

        // Mapeia elementos (mantido)
        mainContent=document.getElementById('mainContent'); appContainer=document.getElementById('appContainer'); mainHeader=document.getElementById('mainHeader'); loginBtn=document.getElementById('loginBtn'); loginEmailInput=document.getElementById('loginEmail'); loginPasswordInput=document.getElementById('loginPassword'); loginErrorMsg=document.getElementById('loginErrorMsg');
        console.log("[INIT] UI mapped.");

        console.log("[INIT] Setting up Auth listener...");
        onAuthStateChanged(authInstance, async (user) => {
            console.log("[AUTH] Listener FIRED! User:", user ? user.uid : 'null');
            if (isLoginProcessActive) { console.log("[AUTH] Ignoring (login active)."); return; }
            if (user) { /* ... (lógica mantida) ... */ }
            else { /* ... (lógica mantida) ... */ showLoginScreen(); }
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
        const openManagerPanelBtn = document.getElementById('openManagerPanelBtn');
        const logoutBtnHeader = document.getElementById('logoutBtnHeader');
        const openNfeModalBtn = document.getElementById('openNfeModalBtn');
        if (openManagerPanelBtn) openManagerPanelBtn.addEventListener('click', () => { window.openManagerAuthModal('goToManagerPanel'); });
        if (logoutBtnHeader) logoutBtnHeader.addEventListener('click', handleLogout);
        if (openNfeModalBtn) openNfeModalBtn.addEventListener('click', window.openNfeModal);
        console.log("[INIT] Global listeners added.");

    } catch (e) {
        console.error("CRITICAL init error:", e);
        alert(`Falha grave init: ${e.message}.`);
        hideStatus(); return;
    }
    console.log("[INIT] DOMContentLoaded finished. Waiting for Auth...");
}); // FIM DO DOMContentLoaded
