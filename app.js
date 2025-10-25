// --- APP.JS ---
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut, signInAnonymously } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, serverTimestamp, doc, setDoc, updateDoc, getDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// Importações dos Serviços e Utils
import { initializeFirebase, saveSelectedItemsToFirebase, getTableDocRef, auth } from '/services/firebaseService.js';
import { fetchWooCommerceProducts, fetchWooCommerceCategories } from '/services/wooCommerceService.js';
import { formatCurrency, formatElapsedTime } from '/utils.js';

// Importações dos Controllers
import { loadOpenTables, renderTableFilters, handleAbrirMesa, handleSearchTable, initPanelController, handleTableTransferConfirmed as panel_handleTableTransferConfirmed } from '/controllers/panelController.js';
import { renderMenu, renderOrderScreen, increaseLocalItemQuantity, decreaseLocalItemQuantity, openObsModalForGroup, initOrderController, handleSendSelectedItems } from '/controllers/orderController.js';
// Importa as *ações* que o modal de senha chamará
import {
    renderPaymentSummary, deletePayment, 
    // Removido: handleMassActionRequest (obsoleto)
    // Removido: activateItemSelection (obsoleto)
    handleConfirmTableTransfer,
    initPaymentController, handleFinalizeOrder,
    handleMassDeleteConfirmed, executeDeletePayment, // Funções de ação
    openTableTransferModal // Modal de transferência
} from '/controllers/paymentController.js';
import { initManagerController, handleGerencialAction } from '/controllers/managerController.js'; // Importa a ação gerencial

// --- VARIÁVEIS DE ESTADO GLOBAL ---
export const screens = {
    'loginScreen': 0, 'panelScreen': 1, 'orderScreen': 2, 'paymentScreen': 3, 'managerScreen': 4,
};
const STAFF_CREDENTIALS = {
    'agencia@fatormd.com': { password: '1234', role: 'gerente', name: 'Fmd' },
    'garcom@fator.com': { password: '1234', role: 'garcom', name: 'Mock Garçom' },
};
const MANAGER_PASSWORD = '1234'; // Senha Mestra

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

// **CORREÇÃO: MODAL DE AUTENTICAÇÃO ATUALIZADO**
window.openManagerAuthModal = (action, payload = null) => {
    const managerModal = document.getElementById('managerModal');
    if (!managerModal) { console.error("Modal Gerente não encontrado!"); return; }

    managerModal.innerHTML = `
        <div class="bg-dark-card border border-gray-600 p-6 rounded-xl shadow-2xl w-full max-w-sm">
            <h3 class="text-xl font-bold mb-4 text-red-400">Ação Gerencial Necessária</h3>
            <p class="text-base mb-3 text-dark-text">Insira a senha do gerente para prosseguir.</p>
            <input type="password" id="managerPasswordInput" placeholder="Senha" class="w-full p-3 bg-dark-input border border-gray-600 rounded-lg text-dark-text placeholder-dark-placeholder focus:ring-red-500 focus:border-red-500 text-base" maxlength="4">
            <div class="flex justify-end space-x-3 mt-4">
                <button class="px-4 py-3 bg-gray-600 text-gray-200 rounded-lg hover:bg-gray-500 transition text-base" onclick="document.getElementById('managerModal').style.display='none'">Cancelar</button>
                <button id="authManagerBtn" class="px-4 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 transition text-base">Autenticar</button>
            </div>
        </div>
    `;
    managerModal.style.display = 'flex';
    const input = document.getElementById('managerPasswordInput');
    const authBtn = document.getElementById('authManagerBtn');

    if(input) input.focus();

    if(authBtn && input) {
        const handleAuthClick = () => {
            if (input.value === MANAGER_PASSWORD) {
                managerModal.style.display = 'none';
                
                console.log(`[AUTH MODAL] Ação '${action}' autorizada.`);
                switch (action) {
                    // **AÇÕES ATUALIZADAS (Execução Direta)**
                    case 'executeMassDelete':
                        handleMassDeleteConfirmed(); // Chama a função importada
                        break;
                    case 'executeMassTransfer':
                        openTableTransferModal(); // Chama a função importada
                        break;
                    case 'deletePayment':
                        executeDeletePayment(payload); // 'payload' é o timestamp
                        break;
                    
                    // Ações do ManagerController (mantidas)
                    case 'goToManagerPanel':
                    case 'openProductManagement':
                    case 'openCategoryManagement':
                    // ... (outras ações do manager)
                        handleGerencialAction(action, payload);
                        break;

                    default:
                        console.warn(`Ação ${action} não reconhecida pelo modal.`);
                        // Fallback para ações do manager
                        if (!action.includes('Mass') && !action.includes('Payment')) {
                             handleGerencialAction(action, payload);
                        }
                }
            } else {
                alert("Senha incorreta.");
                input.value = '';
                input.focus();
            }
        };
        
        authBtn.onclick = handleAuthClick;
        input.onkeydown = (e) => { if (e.key === 'Enter') handleAuthClick(); };
    }
};

// Expor funções globais necessárias dos controllers
window.deletePayment = deletePayment; // Exposto por paymentController
// window.handleMassActionRequest = handleMassActionRequest; // REMOVIDO (não é mais chamado pelo HTML)
window.handleConfirmTableTransfer = handleConfirmTableTransfer; // Exposto por paymentController
window.openTableTransferModal = openTableTransferModal; // Exposto por paymentController
window.openKdsStatusModal = (id) => alert(`Abrir status KDS ${id} (DEV)`);
// Funções de item/obs
window.increaseLocalItemQuantity = increaseLocalItemQuantity;
window.decreaseLocalItemQuantity = decreaseLocalItemQuantity;
window.openObsModalForGroup = openObsModalForGroup;


// Listener da Mesa
export const setTableListener = (tableId) => { /* ... (lógica mantida) ... */ };
// Define a mesa atual e inicia o listener
export const setCurrentTable = (tableId) => { /* ... (lógica mantida) ... */ };
// Seleciona a mesa e inicia o listener
export const selectTableAndStartListener = async (tableId) => { /* ... (lógica mantida) ... */ };
window.selectTableAndStartListener = selectTableAndStartListener;

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
    let firebaseConfig;

    try {
        firebaseConfig = JSON.parse(window.__firebase_config);
        console.log("[INIT] Config Firebase carregada.");

        const app = initializeApp(firebaseConfig);
        const dbInstance = getFirestore(app);
        const authInstance = getAuth(app);
        initializeFirebase(dbInstance, authInstance, window.__app_id || 'pdv_default_app');
        console.log("[INIT] Firebase App e Serviços inicializados.");

        // Mapeia elementos Globais e de Login
        statusScreen = document.getElementById('statusScreen');
        // ... (outros mapeamentos) ...
        mainContent = document.getElementById('mainContent');
        appContainer = document.getElementById('appContainer');
        mainHeader = document.getElementById('mainHeader');
        loginBtn = document.getElementById('loginBtn');
        loginEmailInput = document.getElementById('loginEmail');
        loginPasswordInput = document.getElementById('loginPassword');
        loginErrorMsg = document.getElementById('loginErrorMsg');
        console.log("[INIT] Elementos Globais e de Login mapeados.");

        // Listener de Autenticação Firebase
        onAuthStateChanged(authInstance, async (user) => { /* ... (lógica mantida) ... */ });
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
        if (openNfeModalBtn) openNfeModalBtn.addEventListener('click', window.openNfeModal);

        console.log("[INIT] Listeners restantes adicionados.");

    } catch (e) {
        console.error("Erro CRÍTICO na inicialização (DOMContentLoaded):", e);
        alert("Falha grave ao carregar o PDV. Verifique o console.");
        if(statusScreen) statusScreen.innerHTML = '<h2 class="text-red-600 font-bold">Erro de Inicialização</h2>';
        return;
    }
    console.log("[INIT] DOMContentLoaded finalizado.");
}); // FIM DO DOMContentLoaded
