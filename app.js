// --- APP.JS (AGORA SEM OBRIGAÇÃO DE LOGIN) ---
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut, signInAnonymously } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, serverTimestamp, doc, setDoc, updateDoc, getDoc, onSnapshot, writeBatch, arrayRemove, arrayUnion, collection } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { getFunctions } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-functions.js";

// Importações dos Serviços e Utils
import { initializeFirebase, saveSelectedItemsToFirebase, getTableDocRef, auth, db, functions, appId } from '/services/firebaseService.js';
import { fetchWooCommerceProducts, fetchWooCommerceCategories } from '/services/wooCommerceService.js';
import { formatCurrency, formatElapsedTime } from '/utils.js';

// --- IMPORTS ESTÁTICOS PARA CONTROLADORES CORE (Garantia de Funcionamento) ---
import { initPanelController, loadOpenTables, renderTableFilters, handleAbrirMesa, handleSearchTable, openTableMergeModal } from '/controllers/panelController.js';
//
// /===================================================\
// | INÍCIO DA ATUALIZAÇÃO (Importa renderMenu)        |
// \===================================================/
//
import { initOrderController, renderOrderScreen, increaseLocalItemQuantity, decreaseLocalItemQuantity, openObsModalForGroup, renderMenu } from '/controllers/orderController.js';
//
// /===================================================\
// | FIM DA ATUALIZAÇÃO                                |
// \===================================================/
//
import { initPaymentController, renderPaymentSummary, deletePayment, handleMassActionRequest, handleFinalizeOrder, handleMassDeleteConfirmed, executeDeletePayment, openTableTransferModal, handleConfirmTableTransfer } from '/controllers/paymentController.js';
import { initManagerController, handleGerencialAction } from '/controllers/managerController.js';
import { initUserManagementController, openUserManagementModal } from '/controllers/userManagementController.js';

// ATUALIZADO: Importa apenas o INIT e o RENDER da TELA DE PEDIDO (não o menu)
import { initClientOrderController, renderClientOrderScreen } from '/controllers/clientOrderController.js';


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
export const screens = { 'loginScreen': 0, 'panelScreen': 1, 'orderScreen': 2, 'paymentScreen': 3, 'managerScreen': 4, 'clientOrderScreen': 0, 'clientPaymentScreen': 1};
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
        const userDocRef = doc(usersCollectionRef, email); // Email como ID
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
 * Navega entre as telas do SPA. (Adaptado para Cliente também)
 */
export const goToScreen = async (screenId) => {
    if (!appContainer) appContainer = document.getElementById('appContainer');
    if (!mainContent) mainContent = document.getElementById('mainContent');
    const isClientMode = window.location.pathname.includes('client.html');

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
    if (screenId === 'panelScreen') {
        const finalizeBtn = document.getElementById('finalizeOrderBtn');
        if (finalizeBtn && !finalizeBtn.innerHTML.includes('fa-check-circle')) {
            finalizeBtn.disabled = true; finalizeBtn.innerHTML = '<i class="fas fa-check-circle"></i> FINALIZAR CONTA';
            finalizeBtn.classList.add('opacity-50', 'cursor-not-allowed');
        }
    }

    const screenIndex = isClientMode ? screens[screenId] : screens[screenId]; // Mantém a lógica, mas usa o mapa correto

    if (screenIndex !== undefined) {
        console.log(`[NAV] Navegando para ${screenId} (índice ${screenIndex})`);
        if (appContainer) appContainer.style.transform = `translateX(-${screenIndex * 100}vw)`;
        if (mainContent && screenId !== 'loginScreen') mainContent.style.display = 'block';

        // Ajuste visual para Staff
        if (!isClientMode) {
            document.body.classList.toggle('bg-gray-900', screenId === 'managerScreen');
            document.body.classList.toggle('bg-dark-bg', screenId !== 'managerScreen' && screenId !== 'loginScreen');
        }

    } else { console.error(`[NAV] Tentativa de navegar para tela inválida: ${screenId}`); }
};
window.goToScreen = goToScreen;

export const handleTableTransferConfirmed = async (originTableId, targetTableId, itemsToTransfer, newDiners = 0, newSector = '') => {
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
    // AJUSTE DE SEGURANÇA: Bloqueia acesso se o usuário não for gerente
    if (userRole !== 'gerente') {
        alert("Acesso negado. Apenas o perfil 'Gerente' pode realizar esta ação.");
        return;
    }
    
    // Ação de Usuários é tratada diretamente para simplificar o fluxo de cadastro
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
            // OBS: A checagem de senha em '1234' é apenas para fluxo/demonstração.
            // A segurança real está na checagem do 'userRole' no início desta função.
            if (input.value === '1234') {
                managerModal.style.display = 'none';

                // Executa a ação (usando as funções estaticamente importadas)
                switch (action) {
                    case 'executeMassDelete': handleMassDeleteConfirmed(); break;
                    case 'executeMassTransfer': openTableTransferModal(); break;
                    case 'openTableMerge': openTableMergeModal(); break; // NOVO: Agrupamento de Mesas
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
        input.onkeydown = (e) => { if (e.key === 'Enter') handleAuthClick(); };
    }
};
window.openManagerAuthModal = openManagerAuthModal;

// --- WRAPPERS GLOBAIS PARA ONCLICKS ---
window.deletePayment = (timestamp) => window.openManagerAuthModal('deletePayment', timestamp);
window.handleMassActionRequest = (action) => { if(action === 'delete') window.openManagerAuthModal('executeMassDelete'); else if (action === 'transfer') window.openManagerAuthModal('executeMassTransfer'); };
// Removidos os wrappers de increase/decrease aqui, pois serão definidos no DOMContentLoaded dependendo do modo
// As funções agora são importadas dinamicamente no DOMContentLoaded para o cliente
window.openObsModalForGroup = openObsModalForGroup; // Este ainda é usado pelo Staff
window.openKdsStatusModal = (id) => alert(`Abrir status KDS ${id} (DEV)`);
window.openNfeModal = () => { /* Lógica para abrir modal NFe */ }; // Garante que a função exista
window.openNfeModal = openNfeModal; // Expondo para o HTML (se houver botão)


// --- LÓGICA DE LISTENER DA MESA ---
export const setTableListener = (tableId, isClientMode = false) => {
    if (unsubscribeTable) unsubscribeTable();
    const tableRef = getTableDocRef(tableId);

    unsubscribeTable = onSnapshot(tableRef, (docSnapshot) => {
        if (docSnapshot.exists()) {
            currentOrderSnapshot = docSnapshot.data();

            // Redirecionamento se a mesa foi agrupada (apenas para cliente)
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

            // Sincroniza 'selectedItems' global APENAS se diferente do Firebase
            // OU se for o cliente e o array local estiver vazio (evita sobrescrever pedido em montagem)
            if (JSON.stringify(firebaseSelectedItems) !== JSON.stringify(selectedItems)) {
                 if (!isClientMode || (isClientMode && selectedItems.length === 0)){
                     console.log("[Listener] Syncing selectedItems from Firebase."); // Log Adicionado
                     selectedItems.length = 0; // Limpa o array local
                     selectedItems.push(...firebaseSelectedItems); // Preenche com dados do Firebase
                 } else {
                     console.log("[Listener] Client has local items, not syncing from Firebase."); // Log Adicionado
                 }
            }


            // Renderiza a tela apropriada
            if (isClientMode) {
                 renderClientOrderScreen(); // Renderiza a lista do carrinho do cliente
                 renderPaymentSummary(currentTableId, currentOrderSnapshot); // Renderiza a conta para o cliente (tela de pagamento)
            } else {
                 renderOrderScreen(currentOrderSnapshot); // Renderiza tela de pedido do Staff
                 renderPaymentSummary(currentTableId, currentOrderSnapshot); // Renderiza conta para Staff (tela de pagamento)
            }

        } else {
             // Ação de limpeza se a mesa for fechada
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
    // Não executa se já estiver na mesma mesa E o listener estiver ativo
    if (currentTableId === tableId && unsubscribeTable) {
        console.log(`[APP] Already listening to table ${tableId}. Forcing re-render.`);
        // Força a re-renderização caso algo tenha falhado
        if(currentOrderSnapshot){
             if (isClientMode) {
                 renderClientOrderScreen(); // Re-renderiza carrinho cliente
                 renderPaymentSummary(currentTableId, currentOrderSnapshot); // Re-renderiza pagamento cliente
             } else {
                 renderOrderScreen(currentOrderSnapshot); // Re-renderiza pedido staff
                 renderPaymentSummary(currentTableId, currentOrderSnapshot); // Re-renderiza pagamento staff
             }
        } else {
             console.warn(`[APP] No currentOrderSnapshot for table ${tableId} to re-render.`);
        }
        return;
    }

    console.log(`[APP] Setting current table to ${tableId} (ClientMode: ${isClientMode})`);
    currentTableId = tableId;
    selectedItems.length = 0; // Limpa itens ao trocar de mesa
    currentOrderSnapshot = null; // Limpa snapshot antigo

    // Atualiza cabeçalhos
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

    // Inicia o novo listener
    setTableListener(tableId, isClientMode);
};

export const selectTableAndStartListener = async (tableId) => {
    try {
        await goToScreen('orderScreen'); // Navega para a tela de pedido
        setCurrentTable(tableId); // Define a mesa atual e inicia o listener
    } catch (error) { console.error(`[APP] Erro ao selecionar mesa ${tableId}:`, error); alert("Erro ao abrir a mesa. Verifique a conexão."); }
};
window.selectTableAndStartListener = selectTableAndStartListener;


// --- LÓGICA DE LOGIN (DESATIVADA) ---
// Função de login mantida apenas para referência, mas não será usada no fluxo principal
const handleStaffLogin = async () => {
    let loginBtn, loginEmailInput, loginPasswordInput, loginErrorMsg;
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
            
            if (authInstance.currentUser) {
                console.log("[LOGIN] Clearing previous session before Staff login.");
                await signOut(authInstance); 
            }
            
            const userCredential = await signInAnonymously(authInstance);
            userId = userCredential.user.uid; 

            const userName = staffData.name || userRole;
            const userIdDisplay = document.getElementById('user-id-display');
            if(userIdDisplay) userIdDisplay.textContent = `Usuário: ${userName} | ${userRole.toUpperCase()}`;

            await initStaffApp(); 

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

    // Desloga do Firebase Auth
    const authInstance = auth;
    if (authInstance) {
        signOut(authInstance).catch(error => console.error("Erro ao deslogar:", error));
    }

    // Mostra a tela de login (o onAuthStateChanged também fará isso, mas garantimos aqui)
    showLoginScreen();
    const userIdDisplay = document.getElementById('user-id-display');
    if(userIdDisplay) userIdDisplay.textContent = 'Usuário ID: Carregando...';
};
window.handleLogout = handleLogout;

// --- FUNÇÕES DE INICIALIZAÇÃO ---
const initStaffApp = async () => {
    console.log("[StaffApp] initStaffApp CALLED"); // Log Adicionado
    try {
        // Inicializa controladores
        initPanelController();
        initOrderController();
        initPaymentController();
        initManagerController();
        initUserManagementController();

        // Renderiza filtros e busca dados iniciais
        renderTableFilters();
        //
        // /===================================================\
        // | INÍCIO DA ATUALIZAÇÃO (Adiciona callback 'renderMenu') |
        // \===================================================/
        //
        fetchWooCommerceProducts(renderMenu).catch(e => console.error("[INIT Staff] Falha ao carregar produtos:", e));
        fetchWooCommerceCategories(renderMenu).catch(e => console.error("[INIT Staff] Falha ao carregar categorias:", e));
        //
        // /===================================================\
        // | FIM DA ATUALIZAÇÃO                                |
        // \===================================================/
        //

        hideStatus();
        hideLoginScreen();

        loadOpenTables(); // Carrega as mesas abertas

        await goToScreen('panelScreen'); // Vai para o painel inicial
        console.log("[StaffApp] initStaffApp FINISHED"); // Log Adicionado

    } catch (error) {
        console.error("Erro CRÍTICO durante initStaffApp:", error);
        alert(`Erro grave na inicialização: ${error.message}. Verifique o console.`);
        showLoginScreen(); // Volta pro login em caso de erro grave
    }
};

// ATUALIZADO: initClientApp agora só chama o init do controller do cliente
const initClientApp = async () => {
    console.log("[ClientApp] initClientApp CALLED"); // Log Adicionado
    try {
        // 1. Inicializa o controlador do cliente (que agora busca seus próprios dados)
        initClientOrderController();

        // 2. Esconde o modal de associação
        clientLoginModal = document.getElementById('associationModal');
        if (clientLoginModal) clientLoginModal.style.display = 'none';

        // 3. Garante login anônimo
        const authInstance = auth;
        if (authInstance && !authInstance.currentUser) {
             await signInAnonymously(authInstance);
             console.log("[ClientApp] Signed in anonymously."); // Log Adicionado
        }

        console.log("[ClientApp] initClientApp FINISHED"); // Log Adicionado
    } catch (error) {
        console.error("Erro CRÍTICO durante initClientApp:", error);
        alert(`Erro grave na inicialização do Cliente: ${error.message}. Verifique o console.`);
    }
};


// --- DOMContentLoaded (Ponto de entrada) ---
document.addEventListener('DOMContentLoaded', async () => { // Adicionado 'async'
    console.log("[APP] DOMContentLoaded"); // Log Adicionado
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
        console.log("[APP] Firebase Initialized"); // Log Adicionado

        const isClientMode = window.location.pathname.includes('client.html');
        console.log(`[APP] Mode: ${isClientMode ? 'Client' : 'Staff'}`); // Log Adicionado

        // Mapeamento UI
        statusScreen = document.getElementById('statusScreen');
        mainContent = document.getElementById('mainContent');
        appContainer = document.getElementById('appContainer');
        mainHeader = document.getElementById('mainHeader');

        if (isClientMode) {
            // Fluxo do cliente (mantido)
            initClientApp(); 
            import('/controllers/clientOrderController.js').then(module => {
                 window.decreaseLocalItemQuantity = module.decreaseLocalItemQuantity;
                 window.increaseLocalItemQuantity = module.increaseLocalItemQuantity;
                 console.log("[APP] Client quantity functions attached to window.");
             }).catch(err => console.error("Failed to dynamically load client quantity functions:", err));
        } else {
             // Fluxo do Staff (LOGIN DESATIVADO)
             
             // 1. Força o login anônimo para obter um UID, se não existir
             if (!authInstance.currentUser) {
                 await signInAnonymously(authInstance);
                 console.log("[APP] Forced anonymous sign-in for Staff dev mode.");
             }
             
             // 2. Define o perfil padrão para o desenvolvimento
             userRole = 'garcom'; 
             userId = authInstance.currentUser.uid;
             
             // 3. Atualiza a UI e inicializa o app
             const userIdDisplay = document.getElementById('user-id-display');
             if(userIdDisplay) userIdDisplay.textContent = `Usuário: DEV Mode | GARCOM`;
             
             await initStaffApp(); // Inicia o app diretamente

             // Remove listeners do formulário de login (agora inútil)
             const loginForm = document.getElementById('loginForm');
             if(loginForm) loginForm.removeEventListener('submit', (e) => e.preventDefault());


             // Listener de Logout/Gerencial (mantido)
             const openManagerPanelBtn = document.getElementById('openManagerPanelBtn');
             const logoutBtnHeader = document.getElementById('logoutBtnHeader');
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
}); // <-- FECHAMENTO CORRETO DO DOMContentLoaded
