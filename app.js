// --- APP.JS (com Autenticação via Firestore) ---
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut, signInAnonymously } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, serverTimestamp, doc, setDoc, updateDoc, getDoc, onSnapshot, writeBatch, arrayRemove, arrayUnion, collection } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js"; // Adicionado 'collection'
import { getFunctions } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-functions.js";

// Importações dos Serviços e Utils (Estáticas - sempre necessárias)
import { initializeFirebase, saveSelectedItemsToFirebase, getTableDocRef, auth, db, functions } from '/services/firebaseService.js'; // db é necessário para a consulta
import { fetchWooCommerceProducts, fetchWooCommerceCategories } from '/services/wooCommerceService.js';
import { formatCurrency, formatElapsedTime } from '/utils.js';

// Importações de Controllers REMOVIDAS - Serão carregadas dinamicamente

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
// REMOVIDO: const STAFF_CREDENTIALS = {...}; // Não usaremos mais a lista hardcoded para login
const MANAGER_PASSWORD = '1234';

export let currentTableId = null;
export let selectedItems = [];
export let currentOrderSnapshot = null;
export let userRole = 'anonymous';
export let userId = null;
export let unsubscribeTable = null;

const initializedModules = new Set();
let globalOrderFunctions = {};
let globalPaymentFunctions = {};
let globalManagerFunctions = {};
let globalUserManagementFunctions = {};
let globalPanelFunctions = {};

// --- ELEMENTOS UI ---
let statusScreen, mainContent, appContainer, loginScreen, mainHeader;
let loginBtn, loginEmailInput, loginPasswordInput, loginErrorMsg;


// --- FUNÇÕES CORE E ROTIAMENTO ---
export const hideStatus = () => { /* ... (mantida) ... */
    if (!statusScreen) statusScreen = document.getElementById('statusScreen');
    if (statusScreen) {
        statusScreen.style.cssText = 'display: none !important';
        console.log("[UI] hideStatus executado.");
    } else {
        console.error("[UI] Elemento statusScreen não encontrado em hideStatus.");
    }
};
const showLoginScreen = () => { /* ... (mantida) ... */
    console.log("[UI] Chamando showLoginScreen...");
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
    console.log("[UI] showLoginScreen concluído.");
};
const hideLoginScreen = () => { /* ... (mantida) ... */
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
export const goToScreen = async (screenId) => { /* ... (mantida como na última versão) ... */
    if (!appContainer) appContainer = document.getElementById('appContainer');
    if (!mainContent) mainContent = document.getElementById('mainContent');

    // Salva itens locais antes de sair
    if (currentTableId && screenId === 'panelScreen') {
        const currentTransform = appContainer?.style.transform || '';
        const currentScreenKey = Object.keys(screens).find(key => screens[key] * -100 + 'vw' === currentTransform.replace(/translateX\((.*?)\)/, '$1'));
        if (currentScreenKey === 'orderScreen' || currentScreenKey === 'paymentScreen') {
             console.log(`[NAV] Salvando itens da mesa ${currentTableId} ao sair de ${currentScreenKey}`);
            saveSelectedItemsToFirebase(currentTableId, selectedItems);
        }
    }

    // Limpa estado ao voltar para painel/login
    if ((screenId === 'panelScreen' || screenId === 'loginScreen') && currentTableId && unsubscribeTable) {
        console.log(`[NAV] Limpando estado da mesa ${currentTableId} ao ir para ${screenId}`);
        unsubscribeTable(); unsubscribeTable = null;
        currentTableId = null; currentOrderSnapshot = null; selectedItems.length = 0;

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
            console.log("[NAV] Resetando botão 'Finalizar Conta' ao voltar para o painel.");
            finalizeBtn.disabled = true;
            finalizeBtn.innerHTML = '<i class="fas fa-check-circle"></i> FINALIZAR CONTA';
            finalizeBtn.classList.add('opacity-50', 'cursor-not-allowed');
        }
    }

    const screenIndex = screens[screenId];
    if (screenIndex !== undefined) {
        // --- LAZY LOADING ---
        if (!initializedModules.has(screenId)) {
            console.log(`[LazyLoad] Carregando e inicializando módulo para: ${screenId}`);
            try {
                switch(screenId) {
                    case 'orderScreen':
                        const orderModule = await import('/controllers/orderController.js');
                        orderModule.initOrderController();
                        globalOrderFunctions.increaseLocalItemQuantity = orderModule.increaseLocalItemQuantity;
                        globalOrderFunctions.decreaseLocalItemQuantity = orderModule.decreaseLocalItemQuantity;
                        globalOrderFunctions.openObsModalForGroup = orderModule.openObsModalForGroup;
                        initializedModules.add(screenId);
                        break;
                    case 'paymentScreen':
                        const paymentModule = await import('/controllers/paymentController.js');
                        paymentModule.initPaymentController();
                        globalPaymentFunctions.deletePayment = paymentModule.deletePayment;
                        globalPaymentFunctions.handleMassActionRequest = paymentModule.handleMassActionRequest;
                        globalPaymentFunctions.openTableTransferModal = paymentModule.openTableTransferModal;
                        globalPaymentFunctions.handleFinalizeOrder = paymentModule.handleFinalizeOrder;
                        globalPaymentFunctions.executeDeletePayment = paymentModule.executeDeletePayment;
                        globalPaymentFunctions.handleMassDeleteConfirmed = paymentModule.handleMassDeleteConfirmed;
                        globalPaymentFunctions.handleConfirmTableTransfer = paymentModule.handleConfirmTableTransfer;
                        initializedModules.add(screenId);
                        break;
                    case 'managerScreen':
                        const managerModule = await import('/controllers/managerController.js');
                        managerModule.initManagerController();
                        globalManagerFunctions.handleGerencialAction = managerModule.handleGerencialAction;
                        initializedModules.add(screenId);
                        break;
                    // Adicionar 'userManagementScreen' aqui quando/se virar uma tela
                }
                console.log(`[LazyLoad] Módulo para ${screenId} carregado e inicializado.`);
            } catch (err) { /* ... (erro) ... */ return; }
        }
        // --- FIM LAZY LOADING ---

        console.log(`[NAV] Navegando para ${screenId} (índice ${screenIndex})`);
        if (appContainer) appContainer.style.transform = `translateX(-${screenIndex * 100}vw)`;
        if (mainContent && screenId !== 'loginScreen') mainContent.style.display = 'block';
        document.body.classList.toggle('bg-gray-900', screenId === 'managerScreen');
        document.body.classList.toggle('bg-dark-bg', screenId !== 'managerScreen' && screenId !== 'loginScreen');

    } else { /* ... (erro tela inválida) ... */ }
};
window.goToScreen = goToScreen;
export const handleTableTransferConfirmed = async (originTableId, targetTableId, itemsToTransfer, newDiners = 0, newSector = '') => { /* ... (mantida) ... */
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
             console.log(`[APP] Abrindo Mesa ${targetTableId} para transferência.`);
             batch.set(targetTableRef, {
                 tableNumber: parseInt(targetTableId), diners: newDiners, sector: newSector, status: 'open',
                 createdAt: serverTimestamp(), total: 0, sentItems: [], payments: [], serviceTaxApplied: true, selectedItems: []
             });
         }
         const transferValue = itemsToTransfer.reduce((sum, item) => sum + (item.price || 0), 0);
         const originCurrentTotal = currentOrderSnapshot?.tableNumber == originTableId ? (currentOrderSnapshot.total || 0) : (await getDoc(originTableRef)).data()?.total || 0;
         const originNewTotal = Math.max(0, originCurrentTotal - transferValue);
         itemsToTransfer.forEach(item => { batch.update(originTableRef, { sentItems: arrayRemove(item) }); });
         batch.update(originTableRef, { total: originNewTotal });
         const targetData = targetTableIsOpen ? targetSnap.data() : { total: 0 };
         const targetNewTotal = (targetData.total || 0) + transferValue;
         batch.update(targetTableRef, { sentItems: arrayUnion(...itemsToTransfer), total: targetNewTotal });
         await batch.commit();
         alert(`Sucesso! ${itemsToTransfer.length} item(s) transferidos da Mesa ${originTableId} para ${targetTableId}.`);
         goToScreen('panelScreen');
     } catch (e) { console.error("Erro na transferência de mesa:", e); alert(`Falha na transferência dos itens: ${e.message}`); }
};
window.handleTableTransferConfirmed = handleTableTransferConfirmed;
window.openManagerAuthModal = (action, payload = null) => { /* ... (mantida como na última versão, com lazy loading interno) ... */
    const managerModal = document.getElementById('managerModal');
    if (!managerModal) { console.error("Modal Gerente não encontrado!"); return; }
    managerModal.innerHTML = `... (HTML do modal de senha) ... `; // O HTML interno não muda
    managerModal.style.display = 'flex';
    const input = document.getElementById('managerPasswordInput');
    const authBtn = document.getElementById('authManagerBtn');
    if(input) input.focus();

    if(authBtn && input) {
        const handleAuthClick = async () => {
            if (input.value === MANAGER_PASSWORD) {
                managerModal.style.display = 'none';
                console.log(`[AUTH MODAL] Ação '${action}' autorizada.`);
                // --- LAZY LOADING DOS MÓDULOS NECESSÁRIOS ---
                try {
                    if (['goToManagerPanel', 'openProductManagement', 'openCategoryManagement', 'openInventoryManagement', 'openRecipesManagement', 'openCashManagement', 'openReservations', 'openCustomerCRM', 'openWooSync'].includes(action)) {
                        if (!initializedModules.has('managerScreen')) { /* ... (carrega manager) ... */
                            console.log("[LazyLoad] Pré-carregando managerController para ação...");
                            const managerModule = await import('/controllers/managerController.js');
                            managerModule.initManagerController();
                            globalManagerFunctions.handleGerencialAction = managerModule.handleGerencialAction;
                            initializedModules.add('managerScreen');
                        }
                    }
                    if (['executeMassDelete', 'executeMassTransfer', 'deletePayment'].includes(action)) {
                         if (!initializedModules.has('paymentScreen')) { /* ... (carrega payment) ... */
                            console.log("[LazyLoad] Pré-carregando paymentController para ação...");
                            const paymentModule = await import('/controllers/paymentController.js');
                            paymentModule.initPaymentController();
                            globalPaymentFunctions.handleMassDeleteConfirmed = paymentModule.handleMassDeleteConfirmed;
                            globalPaymentFunctions.openTableTransferModal = paymentModule.openTableTransferModal;
                            globalPaymentFunctions.executeDeletePayment = paymentModule.executeDeletePayment;
                            initializedModules.add('paymentScreen');
                        }
                    }
                    if (action === 'openWaiterReg') {
                        if (!initializedModules.has('userManagementScreen')) { /* ... (carrega user mgmt) ... */
                            console.log("[LazyLoad] Carregando userManagementController...");
                            const userMgmtModule = await import('/controllers/userManagementController.js');
                            userMgmtModule.initUserManagementController();
                            globalUserManagementFunctions.openUserManagementModal = userMgmtModule.openUserManagementModal;
                            initializedModules.add('userManagementScreen');
                        }
                    }
                } catch(loadErr) { /* ... (erro no load) ... */ return; }
                // --- FIM LAZY LOADING ---
                // Executa a ação
                try {
                    switch (action) {
                        case 'executeMassDelete': if (globalPaymentFunctions.handleMassDeleteConfirmed) globalPaymentFunctions.handleMassDeleteConfirmed(); else console.error("Falha ao chamar handleMassDeleteConfirmed"); break;
                        case 'executeMassTransfer': if (globalPaymentFunctions.openTableTransferModal) globalPaymentFunctions.openTableTransferModal(); else console.error("Falha ao chamar openTableTransferModal"); break;
                        case 'deletePayment': if (globalPaymentFunctions.executeDeletePayment) globalPaymentFunctions.executeDeletePayment(payload); else console.error("Falha ao chamar executeDeletePayment"); break;
                        case 'goToManagerPanel': await goToScreen('managerScreen'); break;
                        case 'openProductManagement': case 'openCategoryManagement': /* ... outras ações manager ... */ case 'openWooSync':
                            if (globalManagerFunctions.handleGerencialAction) globalManagerFunctions.handleGerencialAction(action, payload); else console.error("Falha ao chamar handleGerencialAction para:", action); break;
                        case 'openWaiterReg': if (globalUserManagementFunctions.openUserManagementModal) globalUserManagementFunctions.openUserManagementModal(); else console.error("Falha ao chamar openUserManagementModal"); break;
                        default: console.warn(`Ação ${action} não reconhecida...`); if (globalManagerFunctions.handleGerencialAction) globalManagerFunctions.handleGerencialAction(action, payload); else console.warn("handleGerencialAction não disponível...");
                    }
                } catch(execError) { /* ... (erro na execução) ... */ }
            } else { /* ... (senha incorreta) ... */ }
        };
        authBtn.onclick = handleAuthClick;
        input.onkeydown = (e) => { if (e.key === 'Enter') handleAuthClick(); };
    }
};
window.openManagerAuthModal = openManagerAuthModal;
// --- WRAPPERS GLOBAIS PARA ONCLICKS ---
window.deletePayment = (timestamp) => window.openManagerAuthModal('deletePayment', timestamp);
window.handleMassActionRequest = (action) => { if(action === 'delete') window.openManagerAuthModal('executeMassDelete'); else if (action === 'transfer') window.openManagerAuthModal('executeMassTransfer'); };
window.increaseLocalItemQuantity = (itemId, noteKey) => { if(globalOrderFunctions.increaseLocalItemQuantity) globalOrderFunctions.increaseLocalItemQuantity(itemId, noteKey); else console.error("increaseLocalItemQuantity chamado antes do orderController carregar."); };
window.decreaseLocalItemQuantity = (itemId, noteKey) => { if(globalOrderFunctions.decreaseLocalItemQuantity) globalOrderFunctions.decreaseLocalItemQuantity(itemId, noteKey); else console.error("decreaseLocalItemQuantity chamado antes do orderController carregar."); };
window.openObsModalForGroup = (itemId, noteKey) => { if(globalOrderFunctions.openObsModalForGroup) globalOrderFunctions.openObsModalForGroup(itemId, noteKey); else console.error("openObsModalForGroup chamado antes do orderController carregar."); };
window.openKdsStatusModal = (id) => alert(`Abrir status KDS ${id} (DEV)`);
// --- LÓGICA DE LISTENER DA MESA ---
export const setTableListener = (tableId) => { /* ... (mantida) ... */
    if (!initializedModules.has('orderScreen') || !initializedModules.has('paymentScreen')) { /* ... (erro ou fallback load) ... */ return; }
    if (unsubscribeTable) unsubscribeTable();
    console.log(`[APP] Configurando listener para mesa ${tableId}`);
    const tableRef = getTableDocRef(tableId);
    unsubscribeTable = onSnapshot(tableRef, async (docSnapshot) => {
        if (docSnapshot.exists()) {
            console.log(`[APP] Snapshot recebido para mesa ${tableId}`);
            currentOrderSnapshot = docSnapshot.data();
            const firebaseSelectedItems = currentOrderSnapshot.selectedItems || [];
            if (JSON.stringify(firebaseSelectedItems) !== JSON.stringify(selectedItems)) {
                 console.log("[APP] Sincronizando 'selectedItems' local com dados do Firebase.");
                 selectedItems.length = 0;
                 selectedItems.push(...firebaseSelectedItems);
            }
            try { // Chama render das telas
                const orderModule = await import('/controllers/orderController.js');
                orderModule.renderOrderScreen(currentOrderSnapshot);
                const paymentModule = await import('/controllers/paymentController.js');
                paymentModule.renderPaymentSummary(currentTableId, currentOrderSnapshot);
            } catch (renderError) { console.error("Erro ao renderizar telas pós snapshot:", renderError); }
        } else { /* ... (mesa fechada) ... */ }
    }, (error) => { /* ... (erro no listener) ... */ });
};
export const setCurrentTable = (tableId) => { /* ... (mantida) ... */
    if (currentTableId === tableId && unsubscribeTable) { /* ... (re-renderiza) ... */ return; }
    currentTableId = tableId;
    console.log(`[APP] Definindo mesa atual para ${tableId}`);
    const currentTableNumEl = document.getElementById('current-table-number');
    const paymentTableNumEl = document.getElementById('payment-table-number');
    const orderScreenTableNumEl = document.getElementById('order-screen-table-number');
    if(currentTableNumEl) currentTableNumEl.textContent = `Mesa ${tableId}`;
    if(paymentTableNumEl) paymentTableNumEl.textContent = `Mesa ${tableId}`;
    if(orderScreenTableNumEl) orderScreenTableNumEl.textContent = `Mesa ${tableId}`;
    setTableListener(tableId);
};
export const selectTableAndStartListener = async (tableId) => { /* ... (mantida) ... */
    console.log(`[APP] Selecionando mesa ${tableId} e iniciando listener.`);
    try {
        await goToScreen('orderScreen');
        setCurrentTable(tableId);
    } catch (error) { console.error(`[APP] Erro ao selecionar mesa ${tableId}:`, error); alert("Erro ao abrir a mesa."); }
};
window.selectTableAndStartListener = selectTableAndStartListener;
window.openNfeModal = () => { /* ... (mantida) ... */ };
window.openNfeModal = openNfeModal;

// --- FUNÇÕES DE INICIALIZAÇÃO E AUTENTICAÇÃO ---

const initStaffApp = async () => { /* ... (mantida como na última versão) ... */
    console.log("[INIT] Iniciando app para Staff...");
    try {
        // Carrega e inicializa o Panel Controller primeiro
        if (!initializedModules.has('panelScreen')) {
            const panelModule = await import('/controllers/panelController.js');
            panelModule.initPanelController();
            globalPanelFunctions.loadOpenTables = panelModule.loadOpenTables;
            globalPanelFunctions.renderTableFilters = panelModule.renderTableFilters;
            initializedModules.add('panelScreen');
            console.log("[INIT] PanelController carregado e inicializado.");
        }

        if (globalPanelFunctions.renderTableFilters) globalPanelFunctions.renderTableFilters();
        else console.error("renderTableFilters não disponível.");
        console.log("[INIT] Filtros de setor renderizados.");

        fetchWooCommerceProducts().catch(e => console.error("[INIT ERROR] Falha ao carregar produtos:", e));
        fetchWooCommerceCategories().catch(e => console.error("[INIT ERROR] Falha ao carregar categorias:", e));

        hideStatus();
        hideLoginScreen();
        console.log("[INIT] UI principal visível.");

        if (globalPanelFunctions.loadOpenTables) globalPanelFunctions.loadOpenTables();
         else console.error("loadOpenTables não disponível.");
        console.log("[INIT] Listener de mesas configurado.");

        await goToScreen('panelScreen');
        console.log("[INIT] Navegação inicial para panelScreen concluída.");

    } catch (error) { /* ... (erro) ... */ }
};

// --- CORREÇÃO: Nova função de autenticação via Firestore ---
/**
 * Tenta autenticar um usuário consultando a coleção 'users' no Firestore.
 * @param {string} email - O email digitado.
 * @param {string} password - A senha digitada.
 * @returns {Promise<object|null>} Dados do usuário se autenticado, ou null.
 */
const authenticateUserFromFirestore = async (email, password) => {
    console.log(`[AUTH Firestore] Verificando credenciais para ${email}...`);
    try {
        // Garante que 'db' (instância do Firestore) foi inicializado
        if (!db) {
            console.error("[AUTH Firestore] Instância do Firestore (db) não está disponível.");
            throw new Error("Conexão com banco de dados indisponível.");
        }

        // Constrói a referência para o documento do usuário usando o email como ID
        const usersCollectionRef = collection(db, 'artifacts', APP_ID, 'public', 'data', 'users');
        const userDocRef = doc(usersCollectionRef, email); // Assume email como ID do documento

        const docSnap = await getDoc(userDocRef);

        if (docSnap.exists()) {
            const userData = docSnap.data();
            console.log("[AUTH Firestore] Usuário encontrado:", userData.email);

            // Verifica se o usuário está ativo
            if (!userData.isActive) {
                 console.warn(`[AUTH Firestore] Usuário ${email} está inativo.`);
                 return null; // Trata como inválido se inativo
            }

            // Compara a senha (ATENÇÃO: Comparação de texto plano!)
            if (userData.password === password) {
                console.log("[AUTH Firestore] Senha correta.");
                // Retorna os dados necessários para a sessão
                return {
                    email: userData.email,
                    name: userData.name,
                    role: userData.role
                    // Não retorna a senha!
                };
            } else {
                console.warn("[AUTH Firestore] Senha incorreta.");
                return null;
            }
        } else {
            console.log(`[AUTH Firestore] Usuário ${email} não encontrado.`);
            return null;
        }
    } catch (error) {
        console.error("[AUTH Firestore] Erro ao verificar usuário:", error);
        // Retorna null em caso de erro na consulta para não travar o login
        return null;
    }
};
// --- FIM DA CORREÇÃO ---

// --- CORREÇÃO: handleStaffLogin agora usa authenticateUserFromFirestore ---
const handleStaffLogin = async () => {
    loginBtn = document.getElementById('loginBtn');
    loginEmailInput = document.getElementById('loginEmail');
    loginPasswordInput = document.getElementById('loginPassword');
    loginErrorMsg = document.getElementById('loginErrorMsg');

    if (!loginBtn || !loginEmailInput || !loginPasswordInput) { /* ... (validação mantida) ... */ return; }
    if (loginErrorMsg) loginErrorMsg.style.display = 'none';
    loginBtn.disabled = true; loginBtn.textContent = 'Entrando...';

    const email = loginEmailInput.value.trim().toLowerCase(); // Garante minúsculas
    const password = loginPasswordInput.value.trim();

    console.log(`[LOGIN] Tentando autenticar ${email} via Firestore...`);
    // Chama a NOVA função de autenticação que consulta o Firestore
    const staffData = await authenticateUserFromFirestore(email, password);

    if (staffData) { // Se encontrou usuário VÁLIDO no Firestore
        console.log(`[LOGIN] Autenticação Firestore OK. Role: ${staffData.role}`);
        userRole = staffData.role; // Define a role global
        try {
            const authInstance = auth;
            if (!authInstance) throw new Error("Firebase Auth não inicializado.");

            // Tenta login anônimo no Firebase (para ter um UID, mesmo que não usado diretamente para permissões)
            console.log("[LOGIN] Tentando login anônimo Firebase...");
            try {
                const userCredential = await signInAnonymously(authInstance);
                userId = userCredential.user.uid;
                console.log(`[LOGIN] Login anônimo Firebase OK. UID: ${userId}`);
            } catch (authError) {
                console.warn("[LOGIN] Login anônimo Firebase falhou. Usando Mock ID.", authError.code);
                userId = `mock_${userRole}_${Date.now()}`;
            }

            // Atualiza UI com nome e role vindos do Firestore
            const userName = staffData.name || userRole; // Usa o nome do Firestore
            const userIdDisplay = document.getElementById('user-id-display');
            if(userIdDisplay) userIdDisplay.textContent = `Usuário: ${userName} | ${userRole.toUpperCase()}`;
            console.log("[LOGIN] User info display atualizado.");

            console.log("[LOGIN] Chamando initStaffApp...");
            await initStaffApp(); // Inicializa a aplicação principal
            console.log("[LOGIN] initStaffApp concluído.");

        } catch (error) { // Erro durante initStaffApp ou definição do userId
             console.error("[LOGIN] Erro pós-autenticação:", error);
             alert(`Erro ao iniciar sessão: ${error.message}.`);
             showLoginScreen();
             if(loginErrorMsg) { loginErrorMsg.textContent = `Erro: ${error.message}`; loginErrorMsg.style.display = 'block'; }
        }
    } else {
        // Usuário não encontrado no Firestore ou senha/status inválido
        console.log(`[LOGIN] Credenciais inválidas ou usuário inativo para ${email}.`);
        if(loginErrorMsg) { loginErrorMsg.textContent = 'E-mail, senha inválidos ou usuário inativo.'; loginErrorMsg.style.display = 'block'; }
    }

    // Reabilita botão
    if (loginBtn) {
        loginBtn.disabled = false;
        loginBtn.textContent = 'Entrar';
    }
    console.log("[LOGIN] Fim do handleStaffLogin.");
};
// --- FIM DA CORREÇÃO ---


const handleLogout = () => { /* ... (mantida) ... */
    console.log("[LOGOUT] Iniciando...");
    const authInstance = auth;
    if (authInstance && authInstance.currentUser && (!userId || !userId.startsWith('mock_'))) {
        console.log("[LOGOUT] Fazendo signOut Firebase...");
        signOut(authInstance).catch(e => console.error("Erro no sign out Firebase:", e));
    } else {
        console.log("[LOGOUT] Pulando signOut Firebase (usuário mock ou já deslogado).");
    }
    userId = null; currentTableId = null; selectedItems.length = 0; userRole = 'anonymous'; currentOrderSnapshot = null;
    if (unsubscribeTable) { unsubscribeTable(); unsubscribeTable = null; }
    initializedModules.clear();
    globalOrderFunctions = {}; globalPaymentFunctions = {}; globalManagerFunctions = {}; globalUserManagementFunctions = {}; globalPanelFunctions = {};
    showLoginScreen();
    const userIdDisplay = document.getElementById('user-id-display');
    if(userIdDisplay) userIdDisplay.textContent = 'Usuário ID: Carregando...';
    console.log("[LOGOUT] Concluído.");
};
window.handleLogout = handleLogout;


// --- INICIALIZAÇÃO PRINCIPAL (DOMContentLoaded) ---
document.addEventListener('DOMContentLoaded', () => { // <== Início do Bloco Principal
    console.log("[INIT] DOMContentLoaded.");
    const firebaseConfig = FIREBASE_CONFIG;
    try { // <== try principal
        console.log("[INIT] Config Firebase carregada.");
        const app = initializeApp(firebaseConfig);
        const dbInstance = getFirestore(app);
        const authInstance = getAuth(app);
        const functionsInstance = getFunctions(app, 'us-central1');
        initializeFirebase(dbInstance, authInstance, APP_ID, functionsInstance);
        console.log("[INIT] Firebase App e Serviços inicializados.");

        // Mapeia elementos Globais e de Login
        statusScreen = document.getElementById('statusScreen');
        mainContent = document.getElementById('mainContent');
        appContainer = document.getElementById('appContainer');
        mainHeader = document.getElementById('mainHeader');
        loginBtn = document.getElementById('loginBtn'); // Pode ser null se form já capturou
        loginEmailInput = document.getElementById('loginEmail');
        loginPasswordInput = document.getElementById('loginPassword');
        loginErrorMsg = document.getElementById('loginErrorMsg');
        console.log("[INIT] Elementos Globais e de Login mapeados.");

        // Listener de Autenticação Firebase
        onAuthStateChanged(authInstance, async (user) => { /* ... (lógica mantida) ... */
            console.log("[AUTH] State Changed:", user ? `User UID: ${user.uid}` : 'No user');
            if (user) {
                userId = user.uid;
                console.log(`[AUTH] Usuário Firebase ${userId} detectado.`);
                if (userRole === 'gerente' || userRole === 'garcom' || userRole === 'caixa') {
                     console.log(`[AUTH] Role ${userRole} já definida via login local. Iniciando app...`);
                     // Tenta pegar o nome do Firestore se disponível, senão usa a role
                     let userName = userRole;
                     if(loginEmailInput?.value) {
                         const userData = await authenticateUserFromFirestore(loginEmailInput.value.trim().toLowerCase(), loginPasswordInput?.value.trim());
                         if(userData?.name) userName = userData.name;
                     }
                     const userIdDisplay = document.getElementById('user-id-display');
                     if(userIdDisplay) userIdDisplay.textContent = `Usuário: ${userName} | ${userRole.toUpperCase()}`;
                     await initStaffApp();
                } else if (!window.location.pathname.includes('client.html')) {
                    console.warn("[AUTH] Usuário Firebase existe, mas role local é 'anonymous'. Forçando logout.");
                    handleLogout();
                } else { console.log("[AUTH] Usuário Firebase existe na tela do cliente."); }
            } else if (!window.location.pathname.includes('client.html')) {
                 console.log("[AUTH] Nenhum usuário Firebase logado. -> showLoginScreen()");
                 showLoginScreen();
            } else { console.log("[AUTH] Nenhum usuário Firebase logado na tela do cliente."); }
        });
        console.log("[INIT] Listener AuthStateChanged configurado.");

        // Listener do Formulário de Login
        const loginForm = document.getElementById('loginForm');
        if (loginForm) {
            loginForm.addEventListener('submit', (e) => {
                e.preventDefault();
                handleStaffLogin(); // Chama a função ATUALIZADA
            });
            console.log("[INIT] Listener do form Login adicionado.");
        } else if (!window.location.pathname.includes('client.html')) {
            console.error("[INIT] Form de Login (loginForm) não encontrado!");
        }

        console.log("[INIT] Inicializadores estáticos removidos (agora sob demanda).");

        // Listeners Globais do Header
        const openManagerPanelBtn = document.getElementById('openManagerPanelBtn');
        const logoutBtnHeader = document.getElementById('logoutBtnHeader');
        if (openManagerPanelBtn) openManagerPanelBtn.addEventListener('click', () => { window.openManagerAuthModal('goToManagerPanel'); });
        if (logoutBtnHeader) logoutBtnHeader.addEventListener('click', handleLogout);

        console.log("[INIT] Listeners restantes adicionados.");

    } catch (e) { // <== catch principal
        console.error("Erro CRÍTICO na inicialização (DOMContentLoaded):", e);
        alert(`Falha grave ao carregar o PDV: ${e.message}. Verifique o console.`);
        if(statusScreen) { /* ... (mostra erro na tela) ... */ }
        return;
    } // <== Fim do catch principal

    console.log("[INIT] DOMContentLoaded finalizado com sucesso.");

}); // <== FIM do Bloco Principal addEventListener.
// Fim do arquivo app.js
