// --- APP.JS (CORRIGIDO: QUEBRA DE DEPENDÊNCIA CIRCULAR) ---

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut, signInAnonymously, signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, serverTimestamp, doc, setDoc, updateDoc, getDoc, onSnapshot, writeBatch, arrayRemove, arrayUnion, collection } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { getFunctions } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-functions.js";

// Serviços e Utils
import { initializeFirebase, saveSelectedItemsToFirebase, getTableDocRef, db as serviceDb } from '/services/firebaseService.js';
import { fetchWooCommerceProducts, fetchWooCommerceCategories } from '/services/wooCommerceService.js';
import { showToast } from '/utils.js'; 

// Re-exporta para uso nos controllers
export { showToast };

// Controladores
import { initPanelController, loadOpenTables, renderTableFilters, openTableMergeModal } from '/controllers/panelController.js';
import { initOrderController, renderOrderScreen, renderMenu } from '/controllers/orderController.js';
import { initPaymentController, renderPaymentSummary, handleMassActionRequest, openTableTransferModal, handleMassDeleteConfirmed, executeDeletePayment, handleConfirmTableTransfer } from '/controllers/paymentController.js';
import { initManagerController } from '/controllers/manager/hub/managerController.js'; 
import { initUserManagementController, openUserManagementModal } from '/controllers/userManagementController.js';
import { initCashierController } from '/controllers/cashierController.js';
import { initKdsController } from '/controllers/kdsController.js';

// Controladores Cliente
import { initClientOrderController, renderClientOrderScreen } from '/controllers/clientOrderController.js';
import { initClientPaymentController } from '/controllers/clientPaymentController.js';

// --- CONFIGURAÇÃO ---
const FIREBASE_CONFIG = {
    apiKey: "AIzaSyCQINQFRyAES3hkG8bVpQlRXGv9AzQuYYY",
    authDomain: "fator-pdv.firebaseapp.com",
    projectId: "fator-pdv",
    storageBucket: "fator-pdv.firebasestorage.app",
    messagingSenderId: "1097659747429",
    appId: "1:1097659747429:web:8ec0a7c3978c311dbe0a8c"
};

// --- VARIÁVEIS GLOBAIS ---
export const screens = { 
    'loginScreen': 0, 
    'panelScreen': 1, 
    'orderScreen': 2, 
    'paymentScreen': 3, 
    'managerScreen': 4,
    'kdsScreen': 5, 
    'clientOrderScreen': 0, 
    'clientPaymentScreen': 1 
};

export let currentTableId = null; 
export let selectedItems = []; 
export let currentOrderSnapshot = null;
export let userRole = 'anonymous'; 
export let userId = null; 
export let unsubscribeTable = null;

// Elementos UI
export let db = null; 
export let auth = null;
export let functions = null;
export let appId = null;

let statusScreen, mainContent, appContainer, mainHeader;
let clientLoginModal;

// Disponibiliza globais para quebrar dependência circular
window.showToast = showToast;
window.currentTableId = null; 

// --- FUNÇÕES DE ROTEAMENTO ---

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
    
    hideStatus();
    
    if (mainHeader) mainHeader.style.display = 'none';
    if (mainContent) mainContent.style.display = 'block'; 
    
    goToScreen('loginScreen'); 
    
    document.body.classList.add('bg-dark-bg');
    document.body.classList.remove('bg-gray-900', 'logged-in');
};

const hideLoginScreen = () => {
    mainHeader = document.getElementById('mainHeader');
    mainContent = document.getElementById('mainContent');
    
    if (mainHeader) mainHeader.style.display = 'flex';
    if (mainContent) mainContent.style.display = 'block';
    
    document.body.classList.add('logged-in');
    
    const logoutBtn = document.getElementById('logoutBtnHeader');
    if (logoutBtn) logoutBtn.classList.remove('hidden');
};

export const goToScreen = async (screenId) => {
    if (!appContainer) appContainer = document.getElementById('appContainer');
    if (!mainContent) mainContent = document.getElementById('mainContent');
    
    const isClientMode = window.location.pathname.includes('/client');

    if (!isClientMode) {
        if (currentTableId && screenId === 'panelScreen') { saveSelectedItemsToFirebase(currentTableId, selectedItems); }
        
        if ((screenId === 'panelScreen' || screenId === 'loginScreen') && currentTableId && unsubscribeTable) {
            unsubscribeTable(); unsubscribeTable = null; currentTableId = null; currentOrderSnapshot = null; selectedItems.length = 0;
            
            const els = ['current-table-number', 'payment-table-number', 'order-screen-table-number'];
            els.forEach(id => {
                const el = document.getElementById(id);
                if(el) el.textContent = id === 'current-table-number' ? 'Fator MD' : 'Mesa';
            });
        }
    }

    if (screenId === 'panelScreen' || screenId === 'loginScreen') {
        const finalizeBtn = document.getElementById('finalizeOrderBtn');
        if (finalizeBtn && !finalizeBtn.innerHTML.includes('fa-check-circle')) {
            finalizeBtn.disabled = true; finalizeBtn.innerHTML = '<i class="fas fa-check-circle"></i> FINALIZAR CONTA';
            finalizeBtn.classList.add('opacity-50', 'cursor-not-allowed');
        }
    }

    const screenIndex = screens[screenId];

    if (screenIndex !== undefined) {
        if (appContainer) appContainer.style.transform = `translateX(-${screenIndex * 100}vw)`;
        if (mainContent) mainContent.style.display = 'block';
        
        if (!isClientMode) {
            const isSpecialScreen = screenId === 'managerScreen' || screenId === 'kdsScreen';
            document.body.classList.toggle('bg-gray-900', isSpecialScreen);
            document.body.classList.toggle('bg-dark-bg', !isSpecialScreen);
        }
        
        if (isClientMode) {
            const event = new CustomEvent('screenChanged', { detail: { screenId: screenId } });
            window.dispatchEvent(event);
        }
    }
};
window.goToScreen = goToScreen;

// --- LÓGICA CENTRAL DA MESA ---

export const setTableListener = (tableId, isClientMode = false) => {
    if (unsubscribeTable) unsubscribeTable();
    const tableRef = getTableDocRef(tableId);

    unsubscribeTable = onSnapshot(tableRef, (docSnapshot) => {
        if (docSnapshot.exists()) {
            currentOrderSnapshot = docSnapshot.data();

            if (isClientMode && currentOrderSnapshot.status === 'merged') {
                 if (unsubscribeTable) unsubscribeTable(); unsubscribeTable = null;
                 currentTableId = null;
                 window.currentTableId = null;
                 alert(`Esta mesa foi agrupada na Mesa ${currentOrderSnapshot.masterTable}.`);
                 return;
            }

            const firebaseSelectedItems = currentOrderSnapshot.selectedItems || [];
            if (JSON.stringify(firebaseSelectedItems) !== JSON.stringify(selectedItems)) {
                 if (!isClientMode || (isClientMode && selectedItems.length === 0)){
                     selectedItems.length = 0;
                     selectedItems.push(...firebaseSelectedItems);
                 }
            }

            if (isClientMode) {
                 renderClientOrderScreen(currentOrderSnapshot);
            } else {
                 renderOrderScreen(currentOrderSnapshot);
                 renderPaymentSummary(currentTableId, currentOrderSnapshot);
            }

        } else {
             if (currentTableId === tableId) {
                 showToast(`Mesa ${tableId} fechada.`, true);
                 if (unsubscribeTable) unsubscribeTable(); 
                 currentTableId = null; 
                 window.currentTableId = null;
                 currentOrderSnapshot = null; selectedItems.length = 0;
                 if (!isClientMode) goToScreen('panelScreen');
             }
        }
    }, (error) => {
        console.error(`[APP] Erro listener mesa ${tableId}:`, error);
    });
};
window.setTableListener = setTableListener; // EXPOSTO GLOBALMENTE

export const setCurrentTable = (tableId, isClientMode = false, shouldListen = true) => {
    if (currentTableId === tableId && unsubscribeTable && shouldListen) {
        if(currentOrderSnapshot) {
             if (isClientMode) renderClientOrderScreen(currentOrderSnapshot);
             else {
                 renderOrderScreen(currentOrderSnapshot);
                 renderPaymentSummary(currentTableId, currentOrderSnapshot);
             }
        }
        return;
    }

    currentTableId = tableId;
    window.currentTableId = tableId; // SINCRONIZA GLOBAL
    selectedItems.length = 0;
    currentOrderSnapshot = null;

    const els = ['current-table-number', 'payment-table-number', 'order-screen-table-number'];
    els.forEach(id => {
        const el = document.getElementById(id);
        if(el) el.textContent = `Mesa ${tableId}`;
    });

    if (shouldListen) {
        setTableListener(tableId, isClientMode);
    }
};
window.setCurrentTable = setCurrentTable;

export const selectTableAndStartListener = async (tableId) => {
    try {
        await goToScreen('orderScreen'); 
        setCurrentTable(tableId); 
    } catch (error) { 
        console.error(`[APP] Erro ao selecionar mesa ${tableId}:`, error); 
        showToast("Erro ao abrir a mesa.", true); 
    }
};
window.selectTableAndStartListener = selectTableAndStartListener;

// --- LÓGICA DE TRANSFERÊNCIA DE MESA ---
export const handleTableTransferConfirmed = async (originTableId, targetTableId, itemsToTransfer, newDiners = 0, newSector = '') => {
    if (!originTableId || !targetTableId || itemsToTransfer.length === 0) return;
    if (originTableId === targetTableId) return;

    const originTableRef = getTableDocRef(originTableId);
    const targetTableRef = getTableDocRef(targetTableId);
    const batch = writeBatch(db);

    try {
        const targetSnap = await getDoc(targetTableRef);
        const targetTableIsOpen = targetSnap.exists() && targetSnap.data().status?.toLowerCase() === 'open';

        if (!targetTableIsOpen) {
            if (!newDiners || !newSector) return;
            batch.set(targetTableRef, {
                 tableNumber: parseInt(targetTableId), diners: newDiners, sector: newSector,
                 status: 'open', createdAt: serverTimestamp(),
                 total: 0, sentItems: [], payments: [], serviceTaxApplied: true, selectedItems: []
            });
        }

        const transferValue = itemsToTransfer.reduce((sum, item) => sum + (item.price || 0), 0);
        const originData = currentOrderSnapshot?.tableNumber == originTableId ? currentOrderSnapshot : (await getDoc(originTableRef)).data();
        const originNewTotal = Math.max(0, (originData?.total || 0) - transferValue);

        itemsToTransfer.forEach(item => { batch.update(originTableRef, { sentItems: arrayRemove(item) }); });
        batch.update(originTableRef, { total: originNewTotal });

        const targetData = targetTableIsOpen ? targetSnap.data() : { total: 0, sentItems: [] };
        const targetNewTotal = (targetData.total || 0) + transferValue;

        batch.update(targetTableRef, {
             sentItems: arrayUnion(...itemsToTransfer),
             total: targetNewTotal
        });

        await batch.commit();
        goToScreen('panelScreen');

    } catch (e) { 
        console.error("Erro transferência:", e); 
        throw e; 
    }
};
window.handleTableTransferConfirmed = handleTableTransferConfirmed;

// --- MODAL DE AUTENTICAÇÃO DE GERENTE ---
window.openManagerAuthModal = (action, payload = null) => {
    if (userRole !== 'gerente') {
        showToast("Acesso negado. Apenas Gerentes.", true);
        return;
    }
    if (action === 'openWaiterReg') {
        openUserManagementModal();
        return;
    }

    const managerModal = document.getElementById('managerModal');
    if (!managerModal) return;

    managerModal.innerHTML = `
        <div class="bg-dark-card border border-gray-600 p-6 rounded-xl shadow-2xl w-full max-w-sm">
            <h3 class="text-xl font-bold mb-4 text-red-400">Senha de Gerente</h3>
            <form id="managerAuthForm">
                <input type="password" id="managerPasswordInput" placeholder="Senha" class="w-full p-3 bg-dark-input border border-gray-600 rounded-lg text-dark-text focus:ring-red-500 focus:border-red-500 text-base" maxlength="4" autocomplete="current-password">
            </form>
            <div class="flex justify-end space-x-3 mt-4">
                <button class="px-4 py-3 bg-gray-600 text-gray-200 rounded-lg hover:bg-gray-500 transition text-base" onclick="document.getElementById('managerModal').style.display='none'">Cancelar</button>
                <button id="authManagerBtn" class="px-4 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 transition text-base" form="managerAuthForm">Confirmar</button>
            </div>
        </div>
    `;

    managerModal.style.display = 'flex';
    const input = document.getElementById('managerPasswordInput');
    const authBtn = document.getElementById('authManagerBtn');
    const authForm = document.getElementById('managerAuthForm');

    if(input) input.focus();

    const handleAuthClick = async () => {
        if (input.value === '1234') { 
            managerModal.style.display = 'none';
            switch (action) {
                case 'executeMassDelete': handleMassDeleteConfirmed(); break;
                case 'executeMassTransfer': openTableTransferModal(); break;
                case 'openTableMerge': openTableMergeModal(); break; 
                case 'deletePayment': executeDeletePayment(payload); break;
                case 'goToManagerPanel': await goToScreen('managerScreen'); break;
                case 'exportCsv': window.handleGerencialAction(action); break;
                default: window.handleGerencialAction(action, payload); break;
            }
        } else {
            showToast("Senha incorreta.", true);
            input.value = '';
            input.focus();
        }
    };

    if(authBtn) authBtn.onclick = handleAuthClick;
    if(authForm) authForm.addEventListener('submit', (e) => { e.preventDefault(); handleAuthClick(); });
    if(input) input.onkeydown = (e) => { if (e.key === 'Enter') handleAuthClick(); };
};
window.openManagerAuthModal = openManagerAuthModal;

// --- PERMISSÕES ---
const applyUserPermissions = (role) => {
    const elements = {
        managerBtn: document.getElementById('openManagerPanelBtn'),
        kdsBtn: document.getElementById('openKdsBtn'),
        cashierBtn: document.getElementById('openCashierBtn'),
        finalizeBtn: document.getElementById('finalizeOrderBtn')
    };

    if(elements.managerBtn) elements.managerBtn.classList.add('hidden');
    if(elements.kdsBtn) elements.kdsBtn.classList.add('hidden');
    if(elements.cashierBtn) elements.cashierBtn.classList.add('hidden');
    
    switch (role) {
        case 'gerente':
            if(elements.managerBtn) elements.managerBtn.classList.remove('hidden');
            if(elements.kdsBtn) elements.kdsBtn.classList.remove('hidden');
            if(elements.cashierBtn) elements.cashierBtn.classList.remove('hidden');
            break;
        case 'caixa':
            if(elements.cashierBtn) elements.cashierBtn.classList.remove('hidden');
            if(elements.kdsBtn) elements.kdsBtn.classList.remove('hidden'); 
            break;
        case 'garcom':
            if(elements.kdsBtn) elements.kdsBtn.classList.remove('hidden');
            break;
    }
};

// --- LÓGICA DE LOGIN ---
const handleStaffLogin = async (event) => {
    if(event) event.preventDefault();
    const loginEmailInput = document.getElementById('loginEmail');
    const loginPasswordInput = document.getElementById('loginPassword');
    const loginBtn = document.getElementById('loginBtn');
    const loginErrorMsg = document.getElementById('loginErrorMsg');

    if (!loginEmailInput || !loginPasswordInput) return;
    const email = loginEmailInput.value;
    const password = loginPasswordInput.value;

    if (!email || !password) {
        loginErrorMsg.textContent = "Preencha e-mail e senha.";
        loginErrorMsg.style.display = 'block';
        return;
    }

    loginBtn.disabled = true;
    loginBtn.textContent = 'Entrando...';
    loginErrorMsg.style.display = 'none';

    try {
        await signInWithEmailAndPassword(auth, email, password);
    } catch (error) {
        console.error("Erro login:", error);
        loginErrorMsg.textContent = "Dados inválidos.";
        loginErrorMsg.style.display = 'block';
        loginBtn.disabled = false;
        loginBtn.textContent = 'Entrar';
    }
};

const handleLogout = () => {
    userId = null; currentTableId = null; window.currentTableId = null; selectedItems.length = 0; userRole = 'anonymous'; currentOrderSnapshot = null;
    if (unsubscribeTable) { unsubscribeTable(); unsubscribeTable = null; }
    if (auth) signOut(auth);
    showLoginScreen();
    const userIdDisplay = document.getElementById('user-id-display');
    if(userIdDisplay) userIdDisplay.textContent = 'ID: Carregando...';
};
window.handleLogout = handleLogout;

// --- FUNÇÕES DE INICIALIZAÇÃO ---
const initStaffApp = async (staffName) => { 
    console.log("[StaffApp] Iniciando..."); 
    try {
        window.handleMassActionRequest = handleMassActionRequest;
        window.openTableTransferModal = openTableTransferModal;
        window.openTableMergeModal = openTableMergeModal; 
        window.showConfirm = showConfirm; 
        window.showAlert = showAlert;

        initPanelController();
        initOrderController();
        initPaymentController();
        initManagerController();
        initUserManagementController();
        initCashierController();
        initKdsController();

        applyUserPermissions(userRole);
        renderTableFilters();
        
        fetchWooCommerceProducts().catch(e => console.error("[INIT] Falha produtos:", e));
        fetchWooCommerceCategories(renderMenu).catch(e => console.error("[INIT] Falha categorias:", e));

        hideStatus();
        hideLoginScreen(); 
        
        const userIdDisplay = document.getElementById('user-id-display');
        if(userIdDisplay) userIdDisplay.textContent = `Usuário: ${staffName} | ${userRole.toUpperCase()}`;

        loadOpenTables(); 
        await goToScreen('panelScreen'); 

    } catch (error) {
        console.error("Erro CRÍTICO no initStaffApp:", error);
        showLoginScreen(); 
    }
};

const initClientApp = async () => {
    console.log("[ClientApp] Iniciando..."); 
    try {
        window.showConfirm = showConfirm; 
        window.showAlert = showAlert;

        if (auth && !auth.currentUser) await signInAnonymously(auth); 
        initClientOrderController();
        initClientPaymentController();
        clientLoginModal = document.getElementById('associationModal');
        if (clientLoginModal) clientLoginModal.style.display = 'none';
        
        import('/controllers/clientOrderController.js').then(module => {
             window.decreaseLocalItemQuantity = module.decreaseLocalItemQuantity; // Para HTML
             window.increaseLocalItemQuantity = module.increaseLocalItemQuantity;
        });
    } catch (error) {
        console.error("Erro CRÍTICO no initClientApp:", error);
    }
};

// --- DOMContentLoaded ---
document.addEventListener('DOMContentLoaded', async () => { 
    try {
        const isClientMode = window.location.pathname.includes('/client');
        console.log(`[APP] Modo: ${isClientMode ? 'CLIENTE' : 'STAFF'}`);

        const appIdentifier = "pdv_fator_instance_001";
        appId = appIdentifier;
        
        const app = initializeApp(FIREBASE_CONFIG);
        auth = getAuth(app);
        functions = getFunctions(app, 'us-central1');
        initializeFirebase(app, auth, appId, functions);
        db = serviceDb;

        statusScreen = document.getElementById('statusScreen');
        mainContent = document.getElementById('mainContent');
        appContainer = document.getElementById('appContainer');
        mainHeader = document.getElementById('mainHeader');

        if (isClientMode) {
            await initClientApp(); 
        } else {
             const loginForm = document.getElementById('loginForm');
             const loginPasswordInput = document.getElementById('loginPassword');

             if (loginForm) loginForm.addEventListener('submit', handleStaffLogin);
             if (loginPasswordInput) {
                 loginPasswordInput.addEventListener('keydown', (e) => {
                     if (e.key === 'Enter') handleStaffLogin(e);
                 });
             }

             const loginTimeout = setTimeout(() => {
                 if (statusScreen && statusScreen.style.display !== 'none' && !auth.currentUser) {
                     showLoginScreen();
                 }
             }, 3000);

             onAuthStateChanged(auth, async (user) => {
                 clearTimeout(loginTimeout);
                 if (user && !user.isAnonymous) {
                     console.log("[APP] Autenticado.");
                     const usersCollectionRef = collection(db, 'artifacts', appIdentifier, 'public', 'data', 'users');
                     const userDocRef = doc(usersCollectionRef, user.email);
                     const docSnap = await getDoc(userDocRef);

                     if (docSnap.exists()) {
                         const userData = docSnap.data();
                         if (!userData.isActive) {
                             alert("Conta desativada.");
                             handleLogout();
                             return;
                         }
                         userId = user.email;
                         userRole = userData.role;
                         await initStaffApp(userData.name); 
                     } else {
                         alert("Usuário não encontrado.");
                         handleLogout();
                     }
                 } else {
                     showLoginScreen();
                 }
             });

             const openManagerPanelBtn = document.getElementById('openManagerPanelBtn');
             const logoutBtnHeader = document.getElementById('logoutBtnHeader');
             if (openManagerPanelBtn) openManagerPanelBtn.addEventListener('click', () => { window.openManagerAuthModal('goToManagerPanel'); });
             if (logoutBtnHeader) logoutBtnHeader.addEventListener('click', handleLogout);
        }

    } catch (e) {
        console.error("Erro fatal:", e);
        if(statusScreen) {
             statusScreen.innerHTML = `<div class="flex flex-col items-center p-8 text-center"><h2 class="text-xl font-bold text-red-400">Erro Crítico</h2><p class="text-gray-400">${e.message}</p></div>`;
             statusScreen.style.display = 'flex';
        }
    }
});

export const playNotificationSound = () => {
    const audio = document.getElementById('notificationSound');
    if (audio) {
        audio.currentTime = 0; 
        audio.play().catch(e => console.warn("Som bloqueado."));
    }
};

// --- UTILITÁRIOS GLOBAIS DE UI (CONFIRM & ALERT) ---
window.showConfirm = (message, title = "Confirmação") => {
    return new Promise((resolve) => {
        const modal = document.getElementById('customConfirmModal');
        if(!modal) { resolve(confirm(message)); return; }
        document.getElementById('confirmTitle').textContent = title;
        document.getElementById('confirmMessage').textContent = message;
        const btnYes = document.getElementById('btnConfirmYes');
        const btnNo = document.getElementById('btnConfirmNo');
        const handleYes = () => { close(); resolve(true); };
        const handleNo = () => { close(); resolve(false); };
        const close = () => {
            modal.classList.add('hidden');
            btnYes.removeEventListener('click', handleYes);
            btnNo.removeEventListener('click', handleNo);
        };
        btnYes.addEventListener('click', handleYes);
        btnNo.addEventListener('click', handleNo);
        modal.classList.remove('hidden');
    });
};

window.showAlert = (message) => {
    return new Promise((resolve) => {
        const modal = document.getElementById('customAlertModal');
        if(!modal) { alert(message); resolve(); return; }
        if(document.getElementById('alertMessage')) document.getElementById('alertMessage').textContent = message;
        const btnOk = document.getElementById('btnAlertOk');
        const handleOk = () => {
            modal.classList.add('hidden');
            if(btnOk) btnOk.removeEventListener('click', handleOk);
            resolve();
        };
        if(btnOk) btnOk.addEventListener('click', handleOk);
        modal.classList.remove('hidden');
    });
};