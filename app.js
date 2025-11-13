// --- APP.JS (VERSÃO FINAL COM FIREBASE AUTH) ---
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
// ATUALIZADO: Importa as funções de Auth necessárias
import { getAuth, onAuthStateChanged, signOut, signInAnonymously, signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, serverTimestamp, doc, setDoc, updateDoc, getDoc, onSnapshot, writeBatch, arrayRemove, arrayUnion, collection } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { getFunctions } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-functions.js";

// Importações dos Serviços e Utils
import { initializeFirebase, saveSelectedItemsToFirebase, getTableDocRef, auth, db, functions, appId } from '/services/firebaseService.js';
import { fetchWooCommerceProducts, fetchWooCommerceCategories } from '/services/wooCommerceService.js';
import { formatCurrency, formatElapsedTime } from '/utils.js';

// --- IMPORTS ESTÁTICOS PARA CONTROLADORES CORE (Garantia de Funcionamento) ---
import { initPanelController, loadOpenTables, renderTableFilters, handleAbrirMesa, handleSearchTable, openTableMergeModal } from '/controllers/panelController.js';
import { initOrderController, renderOrderScreen, increaseLocalItemQuantity, decreaseLocalItemQuantity, openObsModalForGroup, renderMenu } from '/controllers/orderController.js';
import { initPaymentController, renderPaymentSummary, deletePayment, handleMassActionRequest, handleFinalizeOrder, handleMassDeleteConfirmed, executeDeletePayment, openTableTransferModal, handleConfirmTableTransfer } from '/controllers/paymentController.js';
import { initManagerController, handleGerencialAction } from '/controllers/managerController.js';
import { initUserManagementController, openUserManagementModal } from '/controllers/userManagementController.js';

// ATUALIZADO: Importa os dois controladores do cliente
import { initClientOrderController, renderClientOrderScreen } from '/controllers/clientOrderController.js';
import { initClientPaymentController } from '/controllers/clientPaymentController.js';


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
export const screens = { 
    'loginScreen': 0, 
    'panelScreen': 1, 
    'orderScreen': 2, 
    'paymentScreen': 3, 
    'managerScreen': 4,
    'clientOrderScreen': 0, // Telas do cliente (separadas)
    'clientPaymentScreen': 1
};
export let currentTableId = null; export let selectedItems = []; export let currentOrderSnapshot = null;
export let userRole = 'anonymous'; export let userId = null; export let unsubscribeTable = null;

// --- ELEMENTOS UI ---
let statusScreen, mainContent, appContainer, loginScreen, mainHeader;
let loginBtn, loginEmailInput, loginPasswordInput, loginErrorMsg;
let clientLoginModal;


// --- FUNÇÕES CORE E ROTIAMENTO ---
export const hideStatus = () => {
    if (!statusScreen) statusScreen = document.getElementById('statusScreen');
    if (statusScreen) {
        statusScreen.style.cssText = 'display: none !important';
    }
};

// =======================================================
// ===== CORREÇÃO 1: Função showToast (Estava faltando) =====
// =======================================================
export const showToast = (message, isError = false) => {
    try {
        const toast = document.createElement('div');
        toast.textContent = message;
        
        // Estilização base (Tailwind)
        toast.className = 'fixed bottom-5 right-5 p-4 rounded-lg shadow-lg text-white z-[9999] transition-opacity duration-300 ease-out';
        
        // Cor de fundo
        toast.style.backgroundColor = isError 
            ? 'rgb(220, 38, 38)'  // Vermelho (bg-red-600)
            : 'rgb(22, 163, 74)'; // Verde (bg-green-600)
        
        toast.style.opacity = '0'; // Começa invisível para o fade-in
        document.body.appendChild(toast);
        
        // Fade-in
        setTimeout(() => {
            toast.style.opacity = '1';
        }, 10);
        
        // Faz o toast desaparecer após 3 segundos
        setTimeout(() => {
            toast.style.opacity = '0';
            // Remove o elemento da DOM após a transição
            setTimeout(() => {
                if (toast.parentNode) {
                    toast.parentNode.removeChild(toast);
                }
            }, 300); // 300ms = duração da transição
        }, 3000); // 3000ms = 3 segundos visível

    } catch (e) {
        console.error("Falha ao mostrar toast:", e);
        alert(message);
    }
};
// =======================================================
// ================ FIM DA CORREÇÃO 1 ====================
// =======================================================


const showLoginScreen = () => {
    // Esta função mostra a tela de login
    statusScreen = document.getElementById('statusScreen');
    mainContent = document.getElementById('mainContent');
    mainHeader = document.getElementById('mainHeader');
    appContainer = document.getElementById('appContainer');

    hideStatus();
    if (mainHeader) mainHeader.style.display = 'none';
    if (mainContent) mainContent.style.display = 'block'; // Garante que o container principal apareça
    
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
    const managerBtn = document.getElementById('openManagerPanelBtn');
    const cashierBtn = document.getElementById('openCashierBtn'); 

    if (logoutBtn) logoutBtn.classList.remove('hidden');
    if (cashierBtn) cashierBtn.classList.remove('hidden'); 
    
    if (managerBtn) {
        managerBtn.classList.toggle('hidden', userRole !== 'gerente');
    }
};

// --- FUNÇÃO DE AUTENTICAÇÃO (REMOVIDA) ---
// const authenticateUserFromFirestore = ... (REMOVIDA - Não é mais necessária)


/**
 * Navega entre as telas do SPA.
 */
export const goToScreen = async (screenId) => {
    if (!appContainer) appContainer = document.getElementById('appContainer');
    if (!mainContent) mainContent = document.getElementById('mainContent');
    
    const isClientMode = window.location.pathname.includes('/client');

    // Lógicas de pré-navegação e limpeza de estado (apenas Staff)
    if (!isClientMode) {
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
    }

    // Reseta botão finalizar (apenas Staff)
    if (screenId === 'panelScreen' || screenId === 'loginScreen') {
        const finalizeBtn = document.getElementById('finalizeOrderBtn');
        if (finalizeBtn && !finalizeBtn.innerHTML.includes('fa-check-circle')) {
            finalizeBtn.disabled = true; finalizeBtn.innerHTML = '<i class="fas fa-check-circle"></i> FINALIZAR CONTA';
            finalizeBtn.classList.add('opacity-50', 'cursor-not-allowed');
        }
    }

    const screenIndex = isClientMode ? screens[screenId] : screens[screenId]; // Usa o mapa correto

    if (screenIndex !== undefined) {
        console.log(`[NAV] Navegando para ${screenId} (índice ${screenIndex})`);
        if (appContainer) appContainer.style.transform = `translateX(-${screenIndex * 100}vw)`;
        if (mainContent) mainContent.style.display = 'block';

        // Ajuste visual para Staff
        if (!isClientMode) {
            document.body.classList.toggle('bg-gray-900', screenId === 'managerScreen');
            document.body.classList.toggle('bg-dark-bg', screenId !== 'managerScreen');
        }
        
        // Dispara o evento de mudança de tela (para o clientPaymentController)
        if (isClientMode) {
            const event = new CustomEvent('screenChanged', { detail: { screenId: screenId } });
            window.dispatchEvent(event);
        }

    } else { console.error(`[NAV] Tentativa de navegar para tela inválida: ${screenId}`); }
};
window.goToScreen = goToScreen;

export const handleTableTransferConfirmed = async (originTableId, targetTableId, itemsToTransfer, newDiners = 0, newSector = '') => {
    // ... (Esta função está OK, sem alterações necessárias) ...
    if (!originTableId || !targetTableId || itemsToTransfer.length === 0) { /* ... */ return; }
    if (originTableId === targetTableId) { /* ... */ return; }

    const originTableRef = getTableDocRef(originTableId);
    const targetTableRef = getTableDocRef(targetTableId);

    const dbInstance = db;
    if (!dbInstance) { /* ... */ return; }
    const batch = writeBatch(dbInstance);

    try {
        const targetSnap = await getDoc(targetTableRef);
        const targetTableIsOpen = targetSnap.exists() && targetSnap.data().status?.toLowerCase() === 'open';

        if (!targetTableIsOpen) {
            if (!newDiners || !newSector) { /* ... */ return; }
            batch.set(targetTableRef, {
                 tableNumber: parseInt(targetTableId), diners: newDiners, sector: newSector,
                 status: 'open', createdAt: serverTimestamp(),
                 total: 0, sentItems: [], payments: [], serviceTaxApplied: true, selectedItems: []
            });
        }

        const transferValue = itemsToTransfer.reduce((sum, item) => sum + (item.price || 0), 0);
        const originCurrentTotal = currentOrderSnapshot?.tableNumber == originTableId ? (currentOrderSnapshot.total || 0) : (await getDoc(originTableRef)).data()?.total || 0;
        const originNewTotal = Math.max(0, originCurrentTotal - transferValue);

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

    } catch (e) { console.error("Erro na transferência de mesa:", e); alert(`Falha na transferência dos itens: ${e.message}`); }
};
window.handleTableTransferConfirmed = handleTableTransferConfirmed;

/**
 * Abre o modal de autenticação para ações gerenciais e delega a ação.
 */
window.openManagerAuthModal = (action, payload = null) => {
    // ... (Esta função está OK, sem alterações necessárias) ...
    if (userRole !== 'gerente') {
        alert("Acesso negado. Apenas o perfil 'Gerente' pode realizar esta ação.");
        return;
    }
    
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
            
            <form id="managerAuthForm">
                <input type="password" id="managerPasswordInput" placeholder="Senha" class="w-full p-3 bg-dark-input border border-gray-600 rounded-lg text-dark-text placeholder-dark-placeholder focus:ring-red-500 focus:border-red-500 text-base" maxlength="4" autocomplete="current-password">
            </form>

            <div class="flex justify-end space-x-3 mt-4">
                <button class="px-4 py-3 bg-gray-600 text-gray-200 rounded-lg hover:bg-gray-500 transition text-base" onclick="document.getElementById('managerModal').style.display='none'">Cancelar</button>
                <button id="authManagerBtn" class="px-4 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 transition text-base" form="managerAuthForm">Autenticar</button>
            </div>
        </div>
    `;

    managerModal.style.display = 'flex';
    const input = document.getElementById('managerPasswordInput');
    const authBtn = document.getElementById('authManagerBtn');
    const authForm = document.getElementById('managerAuthForm');

    if(authBtn && input && authForm) {
        const handleAuthClick = async () => {
            if (input.value === '1234') { // ATENÇÃO: Senha 'chumbada' no código
                managerModal.style.display = 'none';

                switch (action) {
                    case 'executeMassDelete': handleMassDeleteConfirmed(); break;
                    case 'executeMassTransfer': openTableTransferModal(); break;
                    case 'openTableMerge': openTableMergeModal(); break;
                    case 'deletePayment': executeDeletePayment(payload); break;
                    case 'goToManagerPanel': await goToScreen('managerScreen'); break;
                    case 'openProductManagement': handleGerencialAction(action); break;
                    case 'openCashManagement': handleGerencialAction(action); break;
                    case 'openInventoryManagement': handleGerencialAction(action); break;
                    case 'openRecipesManagement': handleGerencialAction(action); break;
                    case 'openCustomerCRM': handleGerencialAction(action); break;
                    case 'openWooSync': handleGerencialAction(action); break;
                    default: handleGerencialAction(action, payload); break;
                }
            } else {
                alert("Senha incorreta.");
                input.value = '';
                input.focus();
            }
        };

        authBtn.onclick = handleAuthClick;
        authForm.addEventListener('submit', (e) => {
            e.preventDefault(); 
            handleAuthClick();
        });
        input.onkeydown = (e) => { if (e.key === 'Enter') handleAuthClick(); };
    }
};
window.openManagerAuthModal = openManagerAuthModal;

// --- WRAPPERS GLOBAIS PARA ONCLICKS ---
window.deletePayment = (timestamp) => window.openManagerAuthModal('deletePayment', timestamp);
window.handleMassActionRequest = (action) => { if(action === 'delete') window.openManagerAuthModal('executeMassDelete'); else if (action === 'transfer') window.openManagerAuthModal('executeMassTransfer'); };
window.openObsModalForGroup = openObsModalForGroup;
window.openKdsStatusModal = (id) => alert(`Abrir status KDS ${id} (DEV)`);
window.openNfeModal = () => { /* Lógica para abrir modal NFe */ };
window.openNfeModal = openNfeModal;


// --- LÓGICA DE LISTENER DA MESA ---
export const setTableListener = (tableId, isClientMode = false) => {
    // ... (Esta função está OK, sem alterações necessárias) ...
    if (unsubscribeTable) unsubscribeTable();
    const tableRef = getTableDocRef(tableId);

    unsubscribeTable = onSnapshot(tableRef, (docSnapshot) => {
        if (docSnapshot.exists()) {
            currentOrderSnapshot = docSnapshot.data();

            if (isClientMode && currentOrderSnapshot.status === 'merged') {
                 if (unsubscribeTable) unsubscribeTable(); unsubscribeTable = null;
                 currentTableId = null;
                 const masterTable = currentOrderSnapshot.masterTable || 'Mestra';
                 clientLoginModal = document.getElementById('associationModal');
                 if (clientLoginModal) clientLoginModal.style.display = 'flex';
                 alert(`Esta mesa foi agrupada na Mesa ${masterTable}. Por favor, insira o número da Mesa ${masterTable}.`);
                 const assocTableInput = document.getElementById('assocTableNumber');
                 if (assocTableInput) assocTableInput.value = '';
                 return;
            }

            const firebaseSelectedItems = currentOrderSnapshot.selectedItems || [];

            if (JSON.stringify(firebaseSelectedItems) !== JSON.stringify(selectedItems)) {
                 if (!isClientMode || (isClientMode && selectedItems.length === 0)){
                     console.log("[Listener] Syncing selectedItems from Firebase.");
                     selectedItems.length = 0;
                     selectedItems.push(...firebaseSelectedItems);
                 } else {
                     console.log("[Listener] Client has local items, not syncing from Firebase.");
                 }
            }

            if (isClientMode) {
                 renderClientOrderScreen();
                 // renderPaymentSummary(currentTableId, currentOrderSnapshot); // Removido
            } else {
                 renderOrderScreen(currentOrderSnapshot);
                 renderPaymentSummary(currentTableId, currentOrderSnapshot);
            }

        } else {
             if (currentTableId === tableId) {
                 alert(`Mesa ${tableId} foi fechada ou removida.`);
                 if (unsubscribeTable) unsubscribeTable(); unsubscribeTable = null;
                 currentTableId = null; currentOrderSnapshot = null; selectedItems.length = 0;
                 if (isClientMode) {
                     clientLoginModal = document.getElementById('associationModal');
                     if(clientLoginModal) clientLoginModal.style.display = 'flex';
                     alert('A mesa foi fechada. Você pode tentar se associar a outra mesa.');
                 } else {
                     goToScreen('panelScreen');
                 }
             }
        }
    }, (error) => {
        console.error(`[APP] Erro no listener da mesa ${tableId}:`, error);
         if (unsubscribeTable) unsubscribeTable(); unsubscribeTable = null;
         alert("Erro ao sincronizar com a mesa. Voltando ao painel.");
         goToScreen('panelScreen');
    });
};

export const setCurrentTable = (tableId, isClientMode = false) => {
    // ... (Esta função está OK, sem alterações necessárias) ...
    if (currentTableId === tableId && unsubscribeTable) {
        console.log(`[APP] Already listening to table ${tableId}. Forcing re-render.`);
        if(currentOrderSnapshot){
             if (isClientMode) {
                 renderClientOrderScreen();
                 // renderPaymentSummary(currentTableId, currentOrderSnapshot); // Removido
             } else {
                 renderOrderScreen(currentOrderSnapshot);
                 renderPaymentSummary(currentTableId, currentOrderSnapshot);
             }
        } else {
             console.warn(`[APP] No currentOrderSnapshot for table ${tableId} to re-render.`);
        }
        return;
    }

    console.log(`[APP] Setting current table to ${tableId} (ClientMode: ${isClientMode})`);
    currentTableId = tableId;
    selectedItems.length = 0;
    currentOrderSnapshot = null;

    if (isClientMode) {
         const clientTableNumEl = document.getElementById('client-table-number');
         const paymentTableNumElClient = document.getElementById('payment-table-number');
         if(clientTableNumEl) clientTableNumEl.textContent = `Mesa ${tableId}`;
         if(paymentTableNumElClient) paymentTableNumElClient.textContent = `Mesa ${tableId}`;
    } else {
         const currentTableNumEl = document.getElementById('current-table-number');
         const paymentTableNumEl = document.getElementById('payment-table-number');
         const orderScreenTableNumEl = document.getElementById('order-screen-table-number');
         if(currentTableNumEl) currentTableNumEl.textContent = `Mesa ${tableId}`;
         if(paymentTableNumEl) paymentTableNumEl.textContent = `Mesa ${tableId}`;
         if(orderScreenTableNumEl) orderScreenTableNumEl.textContent = `Mesa ${tableId}`;
    }

    setTableListener(tableId, isClientMode);
};
// ===== CORREÇÃO 2: Expõe a função para a window =====
window.setCurrentTable = setCurrentTable;
// ===== FIM DA CORREÇÃO 2 =====


export const selectTableAndStartListener = async (tableId) => {
    try {
        await goToScreen('orderScreen'); // Navega para a tela de pedido
        setCurrentTable(tableId); // Define a mesa atual e inicia o listener
    } catch (error) { console.error(`[APP] Erro ao selecionar mesa ${tableId}:`, error); alert("Erro ao abrir a mesa. Verifique a conexão."); }
};
window.selectTableAndStartListener = selectTableAndStartListener;


// --- LÓGICA DE LOGIN (ATUALIZADA PARA FIREBASE AUTH) ---
const handleStaffLogin = async (event) => {
    if(event) event.preventDefault();

    // Mapeia os elementos do index.html
    const loginEmailInput = document.getElementById('loginEmail');
    const loginPasswordInput = document.getElementById('loginPassword');
    const loginBtn = document.getElementById('loginBtn');
    const loginErrorMsg = document.getElementById('loginErrorMsg');

    if (!loginEmailInput || !loginPasswordInput || !loginBtn || !loginErrorMsg) {
        console.error("Elementos do formulário de login não encontrados.");
        return;
    }

    const email = loginEmailInput.value;
    const password = loginPasswordInput.value;

    if (!email || !password) {
        loginErrorMsg.textContent = "Por favor, preencha o e-mail e a senha.";
        loginErrorMsg.style.display = 'block';
        return;
    }

    loginBtn.disabled = true;
    loginBtn.textContent = 'Entrando...';
    loginErrorMsg.style.display = 'none';

    try {
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        console.log("Login com Firebase Auth bem-sucedido!", userCredential.user);

    } catch (error) {
        console.error("Erro no login Firebase Auth:", error.code, error.message);
        if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
            loginErrorMsg.textContent = "E-mail ou senha inválidos.";
        } else if (error.code === 'auth/invalid-email') {
            loginErrorMsg.textContent = "Formato de e-mail inválido.";
        } else {
            loginErrorMsg.textContent = "Erro de conexão. Tente novamente.";
        }
        loginErrorMsg.style.display = 'block';
        loginBtn.disabled = false;
        loginBtn.textContent = 'Entrar';
    }
};


const handleLogout = () => {
    // Limpa estado global
    userId = null; currentTableId = null; selectedItems.length = 0; userRole = 'anonymous'; currentOrderSnapshot = null;
    if (unsubscribeTable) { unsubscribeTable(); unsubscribeTable = null; }

    // Desloga do Firebase Auth
    const authInstance = auth;
    if (authInstance) {
        signOut(authInstance).catch(error => console.error("Erro ao deslogar:", error));
    }

    // Mostra a tela de login
    showLoginScreen();
    const userIdDisplay = document.getElementById('user-id-display');
    if(userIdDisplay) userIdDisplay.textContent = 'Usuário ID: Carregando...';
};
window.handleLogout = handleLogout;

// --- FUNÇÕES DE INICIALIZAÇÃO ---
const initStaffApp = async (staffName) => { // Aceita o nome como parâmetro
    console.log("[StaffApp] initStaffApp CALLED"); 
    try {
        // Inicializa controladores
        initPanelController();
        initOrderController();
        initPaymentController();
        initManagerController();
        initUserManagementController();

        // Renderiza filtros e busca dados iniciais
        renderTableFilters();
        fetchWooCommerceProducts(renderMenu).catch(e => console.error("[INIT Staff] Falha ao carregar produtos:", e));
        fetchWooCommerceCategories(renderMenu).catch(e => console.error("[INIT Staff] Falha ao carregar categorias:", e));

        hideStatus();
        hideLoginScreen(); // Apenas exibe o header e mainContent
        
        // Atualiza display do usuário
        const userIdDisplay = document.getElementById('user-id-display');
        if(userIdDisplay) userIdDisplay.textContent = `Usuário: ${staffName} | ${userRole.toUpperCase()}`;

        loadOpenTables(); // Carrega as mesas abertas

        await goToScreen('panelScreen'); 
        console.log("[StaffApp] initStaffApp FINISHED."); 

    } catch (error) {
        console.error("Erro CRÍTICO durante initStaffApp:", error);
        alert(`Erro grave na inicialização: ${error.message}. Verifique o console.`);
        showLoginScreen(); // Volta pro login em caso de erro grave
    }
};

// --- initClientApp (ATUALIZADO PARA CORRIGIR RACE CONDITION) ---
const initClientApp = async () => {
    console.log("[ClientApp] initClientApp CALLED"); 
    try {
        // PASSO 1: Autenticar PRIMEIRO
        const authInstance = auth;
        if (authInstance && !authInstance.currentUser) {
             await signInAnonymously(authInstance); 
             console.log("[ClientApp] Signed in anonymously."); 
        }

        // PASSO 2: AGORA inicializar os controllers
        initClientOrderController();
        initClientPaymentController();

        clientLoginModal = document.getElementById('associationModal');
        if (clientLoginModal) clientLoginModal.style.display = 'none';

        console.log("[ClientApp] initClientApp FINISHED"); 
    } catch (error) {
        console.error("Erro CRÍTICO durante initClientApp:", error);
        alert(`Erro grave na inicialização do Cliente: ${error.message}. Verifique o console.`);
    }
};


// --- DOMContentLoaded (Ponto de entrada ATUALIZADO) ---
document.addEventListener('DOMContentLoaded', async () => { 
    console.log("[APP] DOMContentLoaded"); 
    try {
        // Inicialização do Firebase
        const firebaseConfigRaw = typeof window.__firebase_config !== 'undefined' ? window.__firebase_config : null;
        const firebaseConfig = firebaseConfigRaw ? JSON.parse(firebaseConfigRaw) : FIREBASE_CONFIG;
        const appIdentifier = typeof window.__app_id !== 'undefined' ? window.__app_id : "pdv_fator_instance_001";
        const app = initializeApp(firebaseConfig);
        const dbInstance = getFirestore(app);
        const authInstance = getAuth(app);
        const functionsInstance = getFunctions(app, 'us-central1');
        initializeFirebase(dbInstance, authInstance, appIdentifier, functionsInstance);
        console.log("[APP] Firebase Initialized"); 

        // DETECÇÃO DE MODO
        const isClientMode = window.location.pathname.includes('/client');
        console.log(`[APP] Mode: ${isClientMode ? 'Client' : 'Staff'}`); 

        // Mapeamento UI
        statusScreen = document.getElementById('statusScreen');
        mainContent = document.getElementById('mainContent');
        appContainer = document.getElementById('appContainer');
        mainHeader = document.getElementById('mainHeader');

        if (isClientMode) {
            // Fluxo do cliente
            initClientApp(); 
            import('/controllers/clientOrderController.js').then(module => {
                 window.decreaseLocalItemQuantity = module.decreaseLocalItemQuantity;
                 window.increaseLocalItemQuantity = module.increaseLocalItemQuantity;
             }).catch(err => console.error("Failed to dynamically load client quantity functions:", err));
        } else {
             // FLUXO DE STAFF
             const loginForm = document.getElementById('loginForm');
             loginBtn = document.getElementById('loginBtn');
             loginPasswordInput = document.getElementById('loginPassword');

             if (loginForm) {
                 loginForm.addEventListener('submit', handleStaffLogin);
             }
             
             if (loginPasswordInput) {
                 loginPasswordInput.addEventListener('keydown', (e) => {
                     if (e.key === 'Enter') {
                         handleStaffLogin(e);
                     }
                 });
             }

             // Inicia o observador de autenticação
             onAuthStateChanged(authInstance, async (user) => {
                 if (user && !user.isAnonymous) {
                     // --- USUÁRIO STAFF LOGADO! ---
                     console.log("[APP] Usuário Staff autenticado:", user.email);
                     
                     const usersCollectionRef = collection(db, 'artifacts', appId, 'public', 'data', 'users');
                     const userDocRef = doc(usersCollectionRef, user.email);
                     const docSnap = await getDoc(userDocRef);

                     if (docSnap.exists()) {
                         const userData = docSnap.data();
                         if (!userData.isActive) {
                             alert("Sua conta foi desativada. Contate o gerente.");
                             handleLogout();
                             return;
                         }
                         
                         userId = user.email;
                         userRole = userData.role;
                         await initStaffApp(userData.name); 
                     } else {
                         alert("Erro: Usuário autenticado, mas não encontrado no banco de dados. Contate o suporte.");
                         handleLogout();
                     }
                 } else if (user && user.isAnonymous) {
                     // É o cliente. Ignora no app de staff.
                 } else {
                     // --- NINGUÉM LOGADO ---
                     console.log("[APP] Usuário não autenticado, mostrando tela de login.");
                     showLoginScreen();
                 }
             });

             // Listeners do cabeçalho
             const openManagerPanelBtn = document.getElementById('openManagerPanelBtn');
             const logoutBtnHeader = document.getElementById('logoutBtnHeader');
             const cashierBtn = document.getElementById('openCashierBtn');
             
             if (cashierBtn) {
                 cashierBtn.addEventListener('click', () => {
                     alert("Módulo de 'Meu Caixa' em desenvolvimento.");
                 });
             }

             if (openManagerPanelBtn) openManagerPanelBtn.addEventListener('click', () => { window.openManagerAuthModal('goToManagerPanel'); });
             if (logoutBtnHeader) logoutBtnHeader.addEventListener('click', handleLogout);
        }

    } catch (e) {
        if(statusScreen) {
             statusScreen.innerHTML = `<div class="flex flex-col items-center p-8 max-w-sm w-full text-center"><i class="fas fa-times-circle text-4xl text-red-500 mb-4"></i><h2 class="text-xl font-bold mb-2 text-red-400">Erro Crítico</h2><p class="text-dark-placeholder">${e.message}</p></div>`;
             statusScreen.style.display = 'flex';
        }
        console.error("Erro fatal na inicialização:", e); 
        return;
    }
});