// --- APP.JS ---
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut, signInAnonymously } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, serverTimestamp, doc, setDoc, updateDoc, getDoc, onSnapshot, writeBatch, arrayRemove, arrayUnion } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// Importações dos Serviços e Utils
import { initializeFirebase, saveSelectedItemsToFirebase, getTableDocRef, auth, db } from '/services/firebaseService.js'; // Importa 'db'
import { fetchWooCommerceProducts, fetchWooCommerceCategories } from '/services/wooCommerceService.js';
import { formatCurrency, formatElapsedTime } from '/utils.js';

// Importações dos Controllers
import { loadOpenTables, renderTableFilters, handleAbrirMesa, handleSearchTable, initPanelController } from '/controllers/panelController.js'; // Removido handleTableTransferConfirmed
import { renderMenu, renderOrderScreen, increaseLocalItemQuantity, decreaseLocalItemQuantity, openObsModalForGroup, initOrderController, handleSendSelectedItems } from '/controllers/orderController.js';
import {
    renderPaymentSummary, deletePayment, handleMassActionRequest, handleConfirmTableTransfer,
    initPaymentController, handleFinalizeOrder,
    activateItemSelection, handleMassDeleteConfirmed, executeDeletePayment, // Funções de ação
    openTableTransferModal // Modal de transferência
} from '/controllers/paymentController.js';
import { initManagerController, handleGerencialAction } from '/controllers/managerController.js';

// --- CONFIGURAÇÃO ---
const APP_ID = "pdv_fator_instance_001";
const FIREBASE_CONFIG = {
    apiKey: "AIzaSyCQINQFRyAES3hkG8bVpQlRXGv9AzQuYYY",
    authDomain: "fator-pdv.firebaseapp.com",
    projectId: "fator-pdv",
    storageBucket: "fator-pdv.appspot.com",
    messagingSenderId: "1097659747429",
    appId: "1:1097659747429:web:8ec0a7c3978c311dbe0a8c"
};

// --- VARIÁVEIS DE ESTADO GLOBAL ---
export const screens = {
    'loginScreen': 0, 'panelScreen': 1, 'orderScreen': 2, 'paymentScreen': 3, 'managerScreen': 4,
};
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


// --- ELEMENTOS UI ---
let statusScreen, mainContent, appContainer, loginScreen, mainHeader;
let loginBtn, loginEmailInput, loginPasswordInput, loginErrorMsg;


// --- FUNÇÕES CORE E ROTIAMENTO ---

export const hideStatus = () => {
    if (!statusScreen) statusScreen = document.getElementById('statusScreen');
    if (statusScreen) {
        statusScreen.style.cssText = 'display: none !important';
        console.log("[UI] hideStatus executado.");
    } else {
        console.error("[UI] Elemento statusScreen não encontrado em hideStatus.");
    }
};

const showLoginScreen = () => {
    console.log("[UI] Chamando showLoginScreen...");
    if (!statusScreen) statusScreen = document.getElementById('statusScreen');
    if (!mainContent) mainContent = document.getElementById('mainContent');
    if (!mainHeader) mainHeader = document.getElementById('mainHeader');
    if (!appContainer) appContainer = document.getElementById('appContainer');
    if (!loginEmailInput) loginEmailInput = document.getElementById('loginEmail');
    if (!loginPasswordInput) loginPasswordInput = document.getElementById('loginPassword');
    if (!loginErrorMsg) loginErrorMsg = document.getElementById('loginErrorMsg');

    hideStatus();
    if (mainHeader) mainHeader.style.display = 'none';
    if (mainContent) mainContent.style.display = 'block';
    if (appContainer) appContainer.style.transform = `translateX(0vw)`;
    document.body.classList.add('bg-dark-bg');
    document.body.classList.remove('bg-gray-900', 'logged-in');

    if(loginEmailInput) loginEmailInput.value = '';
    if(loginPasswordInput) loginPasswordInput.value = '';
    if(loginErrorMsg) loginErrorMsg.style.display = 'none';
    console.log("[UI] showLoginScreen concluído.");
};

const hideLoginScreen = () => {
    if (!mainHeader) mainHeader = document.getElementById('mainHeader');
    if (!mainContent) mainContent = document.getElementById('mainContent');
    if (mainHeader) mainHeader.style.display = 'flex';
    if (mainContent) mainContent.style.display = 'block';
    document.body.classList.add('logged-in');

    const logoutBtn = document.getElementById('logoutBtnHeader');
    const managerBtn = document.getElementById('openManagerPanelBtn');
    if (logoutBtn) logoutBtn.classList.remove('hidden');
    if (managerBtn) {
        managerBtn.classList.toggle('hidden', userRole !== 'gerente');
    }
};

export const goToScreen = (screenId) => {
    if (!appContainer) appContainer = document.getElementById('appContainer');
    if (!mainContent) mainContent = document.getElementById('mainContent');

    if (currentTableId && screenId === 'panelScreen') {
        const currentTransform = appContainer?.style.transform || '';
        const currentScreenKey = Object.keys(screens).find(key => screens[key] * -100 + 'vw' === currentTransform.replace(/translateX\((.*?)\)/, '$1'));
        if (currentScreenKey === 'orderScreen' || currentScreenKey === 'paymentScreen') {
             console.log(`[NAV] Salvando itens da mesa ${currentTableId} ao sair de ${currentScreenKey}`);
            saveSelectedItemsToFirebase(currentTableId, selectedItems);
        }
    }

    if ((screenId === 'panelScreen' || screenId === 'loginScreen') && currentTableId && unsubscribeTable) {
        console.log(`[NAV] Desinscrevendo do listener da mesa ${currentTableId}`);
        unsubscribeTable(); unsubscribeTable = null;
        currentTableId = null; currentOrderSnapshot = null; selectedItems.length = 0;
        const currentTableNumEl = document.getElementById('current-table-number');
        const paymentTableNumEl = document.getElementById('payment-table-number');
        if(currentTableNumEl) currentTableNumEl.textContent = `Mesa`;
        if(paymentTableNumEl) paymentTableNumEl.textContent = `Mesa`;
    }

    const screenIndex = screens[screenId];
    if (screenIndex !== undefined) {
        console.log(`[NAV] Navegando para ${screenId} (índice ${screenIndex})`);
        if (appContainer) appContainer.style.transform = `translateX(-${screenIndex * 100}vw)`;
        if (mainContent && screenId !== 'loginScreen') mainContent.style.display = 'block';
        document.body.classList.toggle('bg-gray-900', screenId === 'managerScreen');
        document.body.classList.toggle('bg-dark-bg', screenId !== 'managerScreen');
    } else {
        console.error(`[NAV] Tentativa de navegar para tela inválida: ${screenId}`);
    }
};
window.goToScreen = goToScreen;

// **CORREÇÃO:** LÓGICA DE TRANSFERÊNCIA MOVIDA DO panelController PARA CÁ
export const handleTableTransferConfirmed = async (originTableId, targetTableId, itemsToTransfer, newDiners = 0, newSector = '') => {
    if (!originTableId || !targetTableId || itemsToTransfer.length === 0) {
        alert("Erro: Dados de transferência incompletos.");
        return;
    }

    const originTableRef = getTableDocRef(originTableId);
    const targetTableRef = getTableDocRef(targetTableId);
    // const { getFirestore, writeBatch, arrayRemove, arrayUnion } = await import("https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js");
    const dbInstance = db; // Usa o 'db' importado do firebaseService
    if (!dbInstance) {
        console.error("DB não inicializado!");
        alert("Erro de conexão. Tente novamente.");
        return;
    }
    const batch = writeBatch(dbInstance);

    try {
        const targetSnap = await getDoc(targetTableRef);
        const targetTableIsOpen = targetSnap.exists() && targetSnap.data().status?.toLowerCase() === 'open';

        // 1. Abertura/Setup da Mesa de Destino
        if (!targetTableIsOpen) {
            if (!newDiners || !newSector) {
                alert("Erro: Mesa destino fechada. Pessoas e setor obrigatórios.");
                return;
            }
            console.log(`[APP] Abrindo Mesa ${targetTableId} para transferência.`);
            batch.set(targetTableRef, {
                tableNumber: parseInt(targetTableId), diners: newDiners, sector: newSector, status: 'open',
                createdAt: serverTimestamp(), total: 0, sentItems: [], payments: [], serviceTaxApplied: true, selectedItems: []
            });
        }

        // 2. Transferência dos Itens
        const transferValue = itemsToTransfer.reduce((sum, item) => sum + (item.price || 0), 0);
        const originCurrentTotal = currentOrderSnapshot?.total || 0; // Usa snapshot global
        const originNewTotal = Math.max(0, originCurrentTotal - transferValue);
        itemsToTransfer.forEach(item => {
            batch.update(originTableRef, { sentItems: arrayRemove(item) });
        });
        batch.update(originTableRef, { total: originNewTotal });

        const targetData = targetTableIsOpen ? targetSnap.data() : { total: 0 };
        const targetNewTotal = (targetData.total || 0) + transferValue;
        batch.update(targetTableRef, {
            sentItems: arrayUnion(...itemsToTransfer),
            total: targetNewTotal
        });

        await batch.commit();
        alert(`Sucesso! ${itemsToTransfer.length} item(s) transferidos da Mesa ${originTableId} para ${targetTableId}.`);
        goToScreen('panelScreen');

    } catch (e) {
        console.error("Erro na transferência de mesa:", e);
        alert("Falha na transferência dos itens.");
    }
};
// Expor globalmente para o paymentController
window.handleTableTransferConfirmed = handleTableTransferConfirmed;


// MODAL DE AUTENTICAÇÃO GLOBAL
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
                    // Ações do PaymentController
                    case 'openMassDelete':
                    case 'openMassTransfer':
                        activateItemSelection(payload);
                        break;
                    case 'executeMassDelete':
                        handleMassDeleteConfirmed();
                        break;
                    case 'executeMassTransfer':
                        openTableTransferModal();
                        break;
                    case 'deletePayment':
                        executeDeletePayment(payload);
                        break;
                    
                    // Ações do ManagerController
                    case 'goToManagerPanel':
                    case 'openProductManagement':
                    case 'openCategoryManagement':
                    case 'openInventoryManagement':
                    case 'openRecipesManagement':
                    case 'openCashManagement':
                    case 'openReservations':
                    case 'openCustomerCRM':
                    case 'openWaiterReg':
                    case 'openWooSync':
                        handleGerencialAction(action, payload);
                        break;

                    default:
                        console.warn(`Ação ${action} não reconhecida pelo modal.`);
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
window.deletePayment = deletePayment;
window.handleMassActionRequest = handleMassActionRequest;
// window.handleConfirmTableTransfer = handleConfirmTableTransfer; // Já exposta acima
window.openTableTransferModal = openTableTransferModal;
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
    
    // **CORREÇÃO:** Usa o objeto FIREBASE_CONFIG definido no topo
    const firebaseConfig = FIREBASE_CONFIG;
    
    try {
        console.log("[INIT] Config Firebase carregada do módulo.");

        // Inicializa Firebase App e Serviços
        const app = initializeApp(firebaseConfig);
        const dbInstance = getFirestore(app);
        const authInstance = getAuth(app);
        initializeFirebase(dbInstance, authInstance, APP_ID);
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
        onAuthStateChanged(authInstance, async (user) => { // Tornar async
            console.log("[AUTH] State Changed:", user ? `User UID: ${user.uid}` : 'No user');
            if (user) {
                userId = user.uid;
                console.log(`[AUTH] Usuário Firebase ${userId} detectado.`);
                if (userRole === 'gerente' || userRole === 'garcom') {
                    console.log(`[AUTH] Role ${userRole} já definida. Iniciando app...`);
                     const userName = STAFF_CREDENTIALS[loginEmailInput?.value?.trim()]?.name || userRole;
                     document.getElementById('user-id-display').textContent = `Usuário: ${userName} | ${userRole.toUpperCase()}`;
                    await initStaffApp();
                } else {
                    console.warn("[AUTH] Usuário Firebase existe, mas role local é 'anonymous'. Forçando logout.");
                    handleLogout();
                }
            } else if (userRole !== 'gerente' && userRole !== 'garcom') {
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
