// --- APP.JS (Versão ESTÁVEL com Autenticação Firestore) ---
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut, signInAnonymously } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, serverTimestamp, doc, setDoc, updateDoc, getDoc, onSnapshot, writeBatch, arrayRemove, arrayUnion, collection } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { getFunctions } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-functions.js";

// Importações dos Serviços e Utils
import { initializeFirebase, saveSelectedItemsToFirebase, getTableDocRef, auth, db, functions, appId } from '/services/firebaseService.js';
import { fetchWooCommerceProducts, fetchWooCommerceCategories } from '/services/wooCommerceService.js';
import { formatCurrency, formatElapsedTime } from '/utils.js';

// --- IMPORTS ESTÁTICOS PARA CONTROLADORES CORE (Garantia de Funcionamento) ---
import { initPanelController, loadOpenTables, renderTableFilters, handleAbrirMesa, handleSearchTable } from '/controllers/panelController.js';
import { initOrderController, renderOrderScreen, increaseLocalItemQuantity, decreaseLocalItemQuantity, openObsModalForGroup } from '/controllers/orderController.js';
import { initPaymentController, renderPaymentSummary, deletePayment, handleMassActionRequest, handleFinalizeOrder, handleMassDeleteConfirmed, executeDeletePayment, openTableTransferModal, handleConfirmTableTransfer } from '/controllers/paymentController.js';
import { initManagerController, handleGerencialAction } from '/controllers/managerController.js';
import { initUserManagementController, openUserManagementModal } from '/controllers/userManagementController.js';


// --- CONFIGURAÇÃO ---
const FIREBASE_CONFIG = {
    apiKey: "AIzaSyCQINQFRyAES3hkG8bVpQlRXGv9AzQuYYY",
    authDomain: "fator-pdv.firebaseapp.com",
    projectId: "fator-pdv",
    storageBucket: "fator-pdv.appspot.com",
    messagingSenderId: "1097659747429",
    appId: "1:1097659747429:web:8ec0a7c39777c311dbe0a8c"
};

// --- VARIÁVEIS GLOBAIS ---
export const screens = { 'loginScreen': 0, 'panelScreen': 1, 'orderScreen': 2, 'paymentScreen': 3, 'managerScreen': 4, };
const MANAGER_PASSWORD = '1234';
export let currentTableId = null; export let selectedItems = []; export let currentOrderSnapshot = null;
export let userRole = 'anonymous'; export let userId = null; export let unsubscribeTable = null;

// --- ELEMENTOS UI ---
let statusScreen, mainContent, appContainer, loginScreen, mainHeader;
let loginBtn, loginEmailInput, loginPasswordInput, loginErrorMsg;

// --- FUNÇÕES CORE E ROTIAMENTO ---
export const hideStatus = () => {
    if (!statusScreen) statusScreen = document.getElementById('statusScreen');
    if (statusScreen) {
        statusScreen.style.cssText = 'display: none !important';
    }
};

const showLoginScreen = () => {
    statusScreen = document.getElementById('statusScreen');
    mainContent = document.getElementById('mainContent');
    mainHeader = document.getElementById('mainHeader');
    appContainer = document.getElementById('appContainer');
    loginEmailInput = document.getElementById('loginEmail');
    loginPasswordInput = document.getElementById('loginPassword');
    loginErrorMsg = document.getElementById('loginErrorMsg');

    hideStatus();
    if (mainHeader) mainHeader.style.display = 'none';
    if (mainContent) mainContent.style.display = 'block';
    if (appContainer) appContainer.style.transform = `translateX(0vw)`;
    document.body.classList.add('bg-dark-bg');
    document.body.classList.remove('bg-gray-900', 'logged-in');

    if(loginEmailInput) loginEmailInput.value = '';
    if(loginPasswordInput) loginPasswordInput.value = '';
    if(loginErrorMsg) loginErrorMsg.style.display = 'none';
};

const hideLoginScreen = () => {
    mainHeader = document.getElementById('mainHeader');
    mainContent = document.getElementById('mainContent');

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

// --- FUNÇÃO DE AUTENTICAÇÃO VIA FIRESTORE (CORE) ---
const authenticateUserFromFirestore = async (email, password) => {
    try {
        if (!db) throw new Error("Conexão com banco de dados indisponível.");
        if (!appId) throw new Error("appId não está definido no firebaseService.");

        const usersCollectionRef = collection(db, 'artifacts', appId, 'public', 'data', 'users');
        const userDocRef = doc(usersCollectionRef, email);
        const docSnap = await getDoc(userDocRef);

        if (docSnap.exists()) {
            const userData = docSnap.data();
            if (!userData.isActive) { return null; }
            if (userData.password === password) { 
                return { email: userData.email, name: userData.name, role: userData.role };
            }
            return null;
        } else { return null; }
    } catch (error) {
        console.error("[AUTH Firestore] Erro ao verificar usuário:", error);
        return null;
    }
};


/**
 * Navega entre as telas do SPA.
 */
export const goToScreen = async (screenId) => {
    if (!appContainer) appContainer = document.getElementById('appContainer');
    if (!mainContent) mainContent = document.getElementById('mainContent');

    // Lógicas de pré-navegação e limpeza de estado
    if (currentTableId && screenId === 'panelScreen') { saveSelectedItemsToFirebase(currentTableId, selectedItems); }
    if ((screenId === 'panelScreen' || screenId === 'loginScreen') && currentTableId && unsubscribeTable) {
        unsubscribeTable(); unsubscribeTable = null; currentTableId = null; currentOrderSnapshot = null; selectedItems.length = 0;
        const currentTableNumEl = document.getElementById('current-table-number');
        const paymentTableNumEl = document.getElementById('payment-table-number');
        const orderScreenTableNumEl = document.getElementById('order-screen-table-number');
        if(currentTableNumEl) currentTableNumEl.textContent = 'Fator MD';
        if(paymentTableNumEl) paymentTableNumEl.textContent = `Mesa`;
        if(orderScreenTableNumEl) orderScreenTableNumEl.textContent = 'Pedido';
    }

    // Reseta botão finalizar
    if (screenId === 'panelScreen') {
        const finalizeBtn = document.getElementById('finalizeOrderBtn');
        if (finalizeBtn && !finalizeBtn.innerHTML.includes('fa-check-circle')) {
            finalizeBtn.disabled = true; finalizeBtn.innerHTML = '<i class="fas fa-check-circle"></i> FINALIZAR CONTA';
            finalizeBtn.classList.add('opacity-50', 'cursor-not-allowed');
        }
    }

    const screenIndex = screens[screenId];
    if (screenIndex !== undefined) {
        console.log(`[NAV] Navegando para ${screenId} (índice ${screenIndex})`);
        if (appContainer) appContainer.style.transform = `translateX(-${screenIndex * 100}vw)`;
        if (mainContent && screenId !== 'loginScreen') mainContent.style.display = 'block';
        document.body.classList.toggle('bg-gray-900', screenId === 'managerScreen');
        document.body.classList.toggle('bg-dark-bg', screenId !== 'managerScreen' && screenId !== 'loginScreen');

    } else { console.error(`[NAV] Tentativa de navegar para tela inválida: ${screenId}`); }
};
window.goToScreen = goToScreen;

export const handleTableTransferConfirmed = async (originTableId, targetTableId, itemsToTransfer, newDiners = 0, newSector = '') => {
    if (!originTableId || !targetTableId || itemsToTransfer.length === 0) {
        alert("Erro: Dados de transferência incompletos.");
        return;
    }
    if (originTableId === targetTableId) {
        alert("Mesa de origem e destino não podem ser a mesma.");
        return;
    }

    const originTableRef = getTableDocRef(originTableId);
    const targetTableRef = getTableDocRef(targetTableId);

    const dbInstance = db;
    if (!dbInstance) {
        console.error("DB não inicializado!");
        alert("Erro de conexão. Tente novamente.");
        return;
    }
    const batch = writeBatch(dbInstance);

    try {
        const targetSnap = await getDoc(targetTableRef);
        const targetTableIsOpen = targetSnap.exists() && targetSnap.data().status?.toLowerCase() === 'open';

        if (!targetTableIsOpen) {
            if (!newDiners || !newSector) {
                alert("Erro: Mesa destino fechada. Pessoas e setor são obrigatórios para abrir.");
                return;
            }
            console.log(`[APP] Abrindo Mesa ${targetTableId} para transferência.`);
            batch.set(targetTableRef, {
                tableNumber: parseInt(targetTableId), diners: newDiners, sector: newSector, status: 'open',
                createdAt: serverTimestamp(), total: 0, sentItems: [], payments: [], serviceTaxApplied: true, selectedItems: []
            });
        }

        const transferValue = itemsToTransfer.reduce((sum, item) => sum + (item.price || 0), 0);
        const originCurrentTotal = currentOrderSnapshot?.tableNumber == originTableId ? (currentOrderSnapshot.total || 0) : (await getDoc(originTableRef)).data()?.total || 0;
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
        alert(`Falha na transferência dos itens: ${e.message}`);
    }
};
window.handleTableTransferConfirmed = handleTableTransferConfirmed;

/**
 * Abre o modal de autenticação para ações gerenciais e delega a ação.
 */
window.openManagerAuthModal = (action, payload = null) => {
    // Ação de Usuários não exige senha (para flexibilidade do processo de cadastro)
    if (action === 'openWaiterReg') {
        openUserManagementModal();
        return;
    }
    
    const managerModal = document.getElementById('managerModal');
    if (!managerModal) { console.error("Modal Gerente não encontrado!"); return; }

    managerModal.innerHTML = `
        <div class="bg-dark-card border border-gray-600 p-6 rounded-xl shadow-2xl w-full max-w-sm">
            <h3 class="text-xl font-bold mb-4 text-red-400">Ação Gerencial Necessária</h3>
            <p class="text-base mb-3 text-dark-text">Insira a senha do gerente para prosseguir.</p>
            <input type="password" id="managerPasswordInput" placeholder="Senha" class="w-full p-3 bg-dark-input border border-gray-600 rounded-lg text-dark-text placeholder-dark-placeholder focus:ring-red-500 focus:border-red-500 text-base" maxlength="4" autocomplete="current-password">
            <div class="flex justify-end space-x-3 mt-4">
                <button class="px-4 py-3 bg-gray-600 text-gray-200 rounded-lg hover:bg-gray-500 transition text-base" onclick="document.getElementById('managerModal').style.display='none'">Cancelar</button>
                <button id="authManagerBtn" class="px-4 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 transition text-base">Autenticar</button>
            </div>
        </div>
    `;
    managerModal.style.display = 'flex';
    const input = document.getElementById('managerPasswordInput');
    const authBtn = document.getElementById('authManagerBtn');

    if(authBtn && input) {
        const handleAuthClick = async () => {
            if (input.value === MANAGER_PASSWORD) {
                managerModal.style.display = 'none';
                console.log(`[AUTH MODAL] Ação '${action}' autorizada.`);

                // Executa a ação (usando as funções estaticamente importadas)
                switch (action) {
                    case 'executeMassDelete': handleMassDeleteConfirmed(); break;
                    case 'executeMassTransfer': openTableTransferModal(); break;
                    case 'deletePayment': executeDeletePayment(payload); break;
                    case 'goToManagerPanel': await goToScreen('managerScreen'); break;
                    default: handleGerencialAction(action, payload); break;
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
window.openManagerAuthModal = openManagerAuthModal;

// --- WRAPPERS GLOBAIS PARA ONCLICKS (Chamadas para funções estaticamente importadas) ---
window.deletePayment = (timestamp) => window.openManagerAuthModal('deletePayment', timestamp);
window.handleMassActionRequest = (action) => { if(action === 'delete') window.openManagerAuthModal('executeMassDelete'); else if (action === 'transfer') window.openManagerAuthModal('executeMassTransfer'); };
window.increaseLocalItemQuantity = increaseLocalItemQuantity;
window.decreaseLocalItemQuantity = decreaseLocalItemQuantity;
window.openObsModalForGroup = openObsModalForGroup;
window.openKdsStatusModal = (id) => alert(`Abrir status KDS ${id} (DEV)`);
window.openNfeModal = () => { /* ... (lógica) ... */ };
window.openNfeModal = openNfeModal;

// --- LÓGICA DE LISTENER DA MESA ---
export const setTableListener = (tableId) => {
    if (unsubscribeTable) unsubscribeTable();
    const tableRef = getTableDocRef(tableId);
    
    unsubscribeTable = onSnapshot(tableRef, (docSnapshot) => {
        if (docSnapshot.exists()) {
            currentOrderSnapshot = docSnapshot.data();
            const firebaseSelectedItems = currentOrderSnapshot.selectedItems || [];

            if (JSON.stringify(firebaseSelectedItems) !== JSON.stringify(selectedItems)) {
                 selectedItems.length = 0;
                 selectedItems.push(...firebaseSelectedItems);
            }

            renderOrderScreen(currentOrderSnapshot);
            renderPaymentSummary(currentTableId, currentOrderSnapshot);

        } else {
             if (currentTableId === tableId) {
                 alert(`Mesa ${tableId} foi fechada ou removida.`);
                 if (unsubscribeTable) unsubscribeTable(); unsubscribeTable = null;
                 currentTableId = null; currentOrderSnapshot = null; selectedItems.length = 0;
                 goToScreen('panelScreen');
             }
        }
    }, (error) => {
        console.error(`[APP] Erro no listener da mesa ${tableId}:`, error);
         if (unsubscribeTable) unsubscribeTable(); unsubscribeTable = null;
         alert("Erro ao sincronizar com a mesa. Voltando ao painel.");
         goToScreen('panelScreen');
    });
};

export const setCurrentTable = (tableId) => {
    if (currentTableId === tableId && unsubscribeTable) {
        if(currentOrderSnapshot){
             import('/controllers/orderController.js').then(m => m.renderOrderScreen(currentOrderSnapshot));
             import('/controllers/paymentController.js').then(m => m.renderPaymentSummary(currentTableId, currentOrderSnapshot));
        }
        return;
    }

    currentTableId = tableId;
    const currentTableNumEl = document.getElementById('current-table-number');
    const paymentTableNumEl = document.getElementById('payment-table-number');
    const orderScreenTableNumEl = document.getElementById('order-screen-table-number');
    if(currentTableNumEl) currentTableNumEl.textContent = `Mesa ${tableId}`;
    if(paymentTableNumEl) paymentTableNumEl.textContent = `Mesa ${tableId}`;
    if(orderScreenTableNumEl) orderScreenTableNumEl.textContent = `Mesa ${tableId}`;

    setTableListener(tableId);
};

export const selectTableAndStartListener = async (tableId) => {
    try {
        await goToScreen('orderScreen');
        setCurrentTable(tableId);
    } catch (error) { console.error(`[APP] Erro ao selecionar mesa ${tableId}:`, error); alert("Erro ao abrir a mesa. Verifique a conexão."); }
};
window.selectTableAndStartListener = selectTableAndStartListener;


// --- LÓGICA DE LOGIN ---
const handleStaffLogin = async () => { 
    loginBtn = document.getElementById('loginBtn');
    loginEmailInput = document.getElementById('loginEmail');
    loginPasswordInput = document.getElementById('loginPassword');
    loginErrorMsg = document.getElementById('loginErrorMsg');

    if (!loginBtn || !loginEmailInput || !loginPasswordInput) { return; }
    if (loginErrorMsg) loginErrorMsg.style.display = 'none';
    loginBtn.disabled = true; loginBtn.textContent = 'Entrando...';

    const email = loginEmailInput.value.trim().toLowerCase();
    const password = loginPasswordInput.value.trim();

    const staffData = await authenticateUserFromFirestore(email, password);

    if (staffData) {
        userRole = staffData.role;
        try {
            const authInstance = auth;
            if (!authInstance) throw new Error("Firebase Auth não inicializado.");
            const userCredential = await signInAnonymously(authInstance);
            userId = userCredential.user.uid;
            
            const userName = staffData.name || userRole;
            const userIdDisplay = document.getElementById('user-id-display');
            if(userIdDisplay) userIdDisplay.textContent = `Usuário: ${userName} | ${userRole.toUpperCase()}`;
            
            await initStaffApp(); // Inicializa o app principal

        } catch (error) { 
             console.error("[LOGIN] Erro pós-autenticação:", error);
             alert(`Erro ao iniciar sessão: ${error.message}.`);
             showLoginScreen();
             if(loginErrorMsg) { loginErrorMsg.textContent = `Erro: ${error.message}`; loginErrorMsg.style.display = 'block'; }
        }
    } else {
        if(loginErrorMsg) { loginErrorMsg.textContent = 'E-mail, senha inválidos ou usuário inativo.'; loginErrorMsg.style.display = 'block'; }
    }
    if (loginBtn) { loginBtn.disabled = false; loginBtn.textContent = 'Entrar'; }
};

const handleLogout = () => {
    // Limpa estado global
    userId = null; currentTableId = null; selectedItems.length = 0; userRole = 'anonymous'; currentOrderSnapshot = null;
    if (unsubscribeTable) { unsubscribeTable(); unsubscribeTable = null; }
    showLoginScreen();
    const userIdDisplay = document.getElementById('user-id-display');
    if(userIdDisplay) userIdDisplay.textContent = 'Usuário ID: Carregando...';
};
window.handleLogout = handleLogout;

// --- FUNÇÕES DE INICIALIZAÇÃO ---
const initStaffApp = async () => { 
    try {
        // 1. Inicializa todos os controladores estáticos
        initPanelController();
        initOrderController();
        initPaymentController();
        initManagerController();
        initUserManagementController();

        // 2. Renderiza e carrega dados
        renderTableFilters();
        fetchWooCommerceProducts().catch(e => console.error("[INIT ERROR] Falha ao carregar produtos:", e));
        fetchWooCommerceCategories().catch(e => console.error("[INIT ERROR] Falha ao carregar categorias:", e));

        hideStatus(); 
        hideLoginScreen();

        loadOpenTables(); // Carrega as mesas
        
        await goToScreen('panelScreen');

    } catch (error) { 
        console.error("[INIT] Erro CRÍTICO durante initStaffApp:", error); 
        alert(`Erro grave na inicialização: ${error.message}. Verifique o console.`); 
        showLoginScreen(); 
    }
};

// --- DOMContentLoaded (Ponto de entrada) ---
document.addEventListener('DOMContentLoaded', () => {
    try {
        const firebaseConfig = FIREBASE_CONFIG;
        const app = initializeApp(firebaseConfig);
        const dbInstance = getFirestore(app);
        const authInstance = getAuth(app);
        const functionsInstance = getFunctions(app, 'us-central1');
        initializeFirebase(dbInstance, authInstance, "pdv_fator_instance_001", functionsInstance); 
        
        // Mapeamento UI
        statusScreen = document.getElementById('statusScreen');
        mainContent = document.getElementById('mainContent');
        appContainer = document.getElementById('appContainer');
        mainHeader = document.getElementById('mainHeader');
        loginBtn = document.getElementById('loginBtn');
        loginEmailInput = document.getElementById('loginEmail');
        loginPasswordInput = document.getElementById('loginPassword');
        loginErrorMsg = document.getElementById('loginErrorMsg');

        onAuthStateChanged(authInstance, async (user) => {
            if (user) {
                userId = user.uid; 
                if (userRole !== 'anonymous') { 
                     await initStaffApp(); 
                } else if (!window.location.pathname.includes('client.html')) {
                    showLoginScreen();
                }
            } else if (!window.location.pathname.includes('client.html')) {
                 showLoginScreen();
            }
        });

        const loginForm = document.getElementById('loginForm');
        if (loginForm) {
            loginForm.addEventListener('submit', (e) => { e.preventDefault(); handleStaffLogin(); });
        }
        
        const openManagerPanelBtn = document.getElementById('openManagerPanelBtn');
        const logoutBtnHeader = document.getElementById('logoutBtnHeader');
        if (openManagerPanelBtn) openManagerPanelBtn.addEventListener('click', () => { window.openManagerAuthModal('goToManagerPanel'); });
        if (logoutBtnHeader) logoutBtnHeader.addEventListener('click', handleLogout);

    } catch (e) { 
        if(statusScreen) { 
             statusScreen.innerHTML = `<div class="flex flex-col items-center p-8 max-w-sm w-full text-center"><i class="fas fa-times-circle text-4xl text-red-500 mb-4"></i><h2 class="text-xl font-bold mb-2 text-red-400">Erro Crítico</h2><p class="text-dark-placeholder">${e.message}</p></div>`;
             statusScreen.style.display = 'flex';
        }
        return;
    }
});
