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
export let userRole = 'anonymous'; // Start as anonymous
export let userId = null;
export let unsubscribeTable = null;
let statusScreen, mainContent, appContainer, loginScreen, mainHeader;
let loginBtn, loginEmailInput, loginPasswordInput, loginErrorMsg;
let isLoginProcessActive = false; // Flag to prevent race condition

// --- FUNÇÕES CORE E ROTIAMENTO ---
export const hideStatus = () => { /* ... (mantida) ... */ };
const showLoginScreen = () => {
    console.log("[UI] Calling showLoginScreen..."); // Debug
    // ... (restante da função mantida) ...
    if (!statusScreen) statusScreen = document.getElementById('statusScreen');
    if (!mainContent) mainContent = document.getElementById('mainContent');
    if (!mainHeader) mainHeader = document.getElementById('mainHeader');
    if (!appContainer) appContainer = document.getElementById('appContainer');
    if (!loginEmailInput) loginEmailInput = document.getElementById('loginEmail');
    if (!loginPasswordInput) loginPasswordInput = document.getElementById('loginPassword');
    if (!loginErrorMsg) loginErrorMsg = document.getElementById('loginErrorMsg');

    hideStatus(); // Garante que a tela de status saia
    if (mainHeader) mainHeader.style.display = 'none'; // Esconde header
    if (mainContent) mainContent.style.display = 'block'; // Mostra main content
    if (appContainer) appContainer.style.transform = `translateX(0vw)`; // Garante que está na tela 0
    document.body.classList.add('bg-dark-bg');
    document.body.classList.remove('bg-gray-900', 'logged-in');

    if(loginEmailInput) loginEmailInput.value = '';
    if(loginPasswordInput) loginPasswordInput.value = '';
    if(loginErrorMsg) loginErrorMsg.style.display = 'none';
    console.log("[UI] showLoginScreen completed."); // Debug
};
const hideLoginScreen = () => {
    console.log("[UI] Calling hideLoginScreen..."); // Debug
    // ... (restante da função mantida) ...
    if (!mainHeader) mainHeader = document.getElementById('mainHeader');
    if (!mainContent) mainContent = document.getElementById('mainContent');
    if (mainHeader) mainHeader.style.display = 'flex'; // Mostra header
    if (mainContent) mainContent.style.display = 'block';
    document.body.classList.add('logged-in'); // Adiciona classe para indicar login

    const logoutBtn = document.getElementById('logoutBtnHeader');
    const managerBtn = document.getElementById('openManagerPanelBtn');
    if (logoutBtn) logoutBtn.classList.remove('hidden');
    if (managerBtn) {
        managerBtn.classList.toggle('hidden', userRole !== 'gerente');
    }
     console.log("[UI] hideLoginScreen completed."); // Debug
};
export const goToScreen = (screenId) => {
    // ... (função goToScreen mantida como na versão anterior) ...
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
        const orderScreenTableNumEl = document.getElementById('order-screen-table-number');
        if(currentTableNumEl) currentTableNumEl.textContent = 'Fator MD';
        if(paymentTableNumEl) paymentTableNumEl.textContent = `Mesa`;
        if(orderScreenTableNumEl) orderScreenTableNumEl.textContent = 'Pedido';
    }
    const screenIndex = screens[screenId];
    if (screenIndex !== undefined) {
        console.log(`[NAV] Navigating to ${screenId} (index ${screenIndex})`); // Log detalhado
        if (appContainer) appContainer.style.transform = `translateX(-${screenIndex * 100}vw)`;
        if (mainContent && screenId !== 'loginScreen') mainContent.style.display = 'block';
        document.body.classList.toggle('bg-gray-900', screenId === 'managerScreen');
        document.body.classList.toggle('bg-dark-bg', screenId !== 'managerScreen');
    } else { console.error(`[NAV] Attempted to navigate to invalid screen: ${screenId}`); }
};
window.goToScreen = goToScreen;

// Lógica de Transferência (com confirmação para fechar origem - mantida)
export const handleTableTransferConfirmed = async (originTableId, targetTableId, itemsToTransfer, newDiners = 0, newSector = '') => { /* ... (mantida) ... */ };
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

// Listener da Mesa (setTableListener - mantido)
export const setTableListener = (tableId) => { /* ... */ };

// Define a mesa atual (setCurrentTable - mantido)
export const setCurrentTable = (tableId) => { /* ... */ };

// Seleciona a mesa (selectTableAndStartListener - mantido)
export const selectTableAndStartListener = async (tableId) => { /* ... */ };
window.selectTableAndStartListener = selectTableAndStartListener;

// NF-e Placeholder (mantido)
window.openNfeModal = () => { alert("Abrir modal NF-e (DEV)"); };

// --- INICIALIZAÇÃO APP STAFF ---
const initStaffApp = async () => {
    console.log("[INIT] Initializing staff application..."); // Debug
    try {
        renderTableFilters();
        console.log("[INIT] Sector filters rendered.");

        // Carrega produtos e categorias em paralelo, mas não bloqueia a UI
        fetchWooCommerceProducts().catch(e => console.error("[INIT ERROR] Failed to load products:", e));
        fetchWooCommerceCategories().catch(e => console.error("[INIT ERROR] Failed to load categories:", e));

        // Garante que a tela de login esteja escondida e a principal visível ANTES de navegar
        hideLoginScreen();
        console.log("[INIT] Main UI visible.");

        loadOpenTables(); // Configura listener das mesas
        console.log("[INIT] Open tables listener configured.");

        // Navega para o painel de mesas
        goToScreen('panelScreen'); // Chama a navegação
        console.log("[INIT] Staff app initialized, user should be on panel screen."); // Debug

    } catch (error) {
        console.error("[INIT] CRITICAL Error during initStaffApp:", error);
        alert(`Erro grave ao iniciar o aplicativo: ${error.message}. Verifique o console.`);
        showLoginScreen(); // Volta para o login em caso de erro grave
    }
};

// --- LÓGICA DE AUTH/LOGIN ---
const authenticateStaff = (email, password) => {
    const creds = STAFF_CREDENTIALS[email];
    // Retorna credenciais se a senha corresponder E não for 'client'
    return (creds && creds.password === password && creds.role !== 'client') ? creds : null;
};

// ==============================================
//     FUNÇÃO ATUALIZADA: handleStaffLogin
// ==============================================
const handleStaffLogin = async () => {
    // Mapeia elementos (se ainda não mapeados)
    loginBtn = loginBtn || document.getElementById('loginBtn');
    loginEmailInput = loginEmailInput || document.getElementById('loginEmail');
    loginPasswordInput = loginPasswordInput || document.getElementById('loginPassword');
    loginErrorMsg = loginErrorMsg || document.getElementById('loginErrorMsg');

    if (!loginBtn || !loginEmailInput || !loginPasswordInput) {
        console.error("[LOGIN] Login form elements not found!");
        return;
    }

    if (loginErrorMsg) loginErrorMsg.style.display = 'none';
    loginBtn.disabled = true;
    loginBtn.textContent = 'Entrando...';
    isLoginProcessActive = true; // Define a flag indicando que o login manual está em andamento

    const email = loginEmailInput.value.trim();
    const password = loginPasswordInput.value.trim();

    console.log(`[LOGIN] Attempting local authentication for ${email}...`);
    const staffData = authenticateStaff(email, password);

    if (staffData) {
        console.log(`[LOGIN] Local authentication successful. Role: ${staffData.role}`);
        userRole = staffData.role; // Define a role ANTES do sign-in anônimo
        try {
            const authInstance = getAuth(); // Pega a instância do Auth
            if (!authInstance) throw new Error("Firebase Auth not initialized.");

            console.log("[LOGIN] Attempting Firebase anonymous sign-in...");
            // O signInAnonymously vai disparar o onAuthStateChanged
            const userCredential = await signInAnonymously(authInstance);
            userId = userCredential.user.uid; // Define o userId
            console.log(`[LOGIN] Firebase sign-in successful. UID: ${userId}`);

            // Atualiza o display do usuário
            const userName = staffData.name || userRole;
            const userIdDisplay = document.getElementById('user-id-display');
            if(userIdDisplay) userIdDisplay.textContent = `Usuário: ${userName} | ${userRole.toUpperCase()}`;
            console.log("[LOGIN] User info display updated.");

            // Chama initStaffApp DIRETAMENTE aqui após o sucesso
            console.log("[LOGIN] Calling initStaffApp from handleStaffLogin...");
            await initStaffApp(); // Espera a inicialização completar
            console.log("[LOGIN] initStaffApp completed after manual login.");

        } catch (error) {
             console.error("[LOGIN] Error during Firebase sign-in or app init:", error);
             alert(`Erro ao iniciar sessão: ${error.message}.`);
             userRole = 'anonymous'; // Reseta role em caso de erro
             userId = null;
             showLoginScreen(); // Volta para login
             if(loginErrorMsg) { loginErrorMsg.textContent = `Erro: ${error.message}`; loginErrorMsg.style.display = 'block'; }
        }
    } else {
        console.log(`[LOGIN] Invalid credentials for ${email}.`);
        if(loginErrorMsg) { loginErrorMsg.textContent = 'E-mail ou senha inválidos.'; loginErrorMsg.style.display = 'block'; }
    }

    // Reabilita o botão e reseta a flag DEPOIS de tudo (sucesso ou falha)
    if (loginBtn) { loginBtn.disabled = false; loginBtn.textContent = 'Entrar'; }
    isLoginProcessActive = false; // Reseta a flag
    console.log("[LOGIN] handleStaffLogin finished.");
};
// ==============================================
//           FIM DA FUNÇÃO ATUALIZADA
// ==============================================

const handleLogout = () => {
    console.log("[LOGOUT] Initiating logout...");
    const authInstance = getAuth();
    // Apenas faz signOut se houver um usuário Firebase E ele não for mock
    if (authInstance && authInstance.currentUser && (!userId || !userId.startsWith('mock_'))) {
        console.log("[LOGOUT] Signing out from Firebase...");
        signOut(authInstance).catch(e => console.error("Error during sign out:", e));
        // O onAuthStateChanged vai lidar com a transição para showLoginScreen quando o user ficar null
    } else {
        console.log("[LOGOUT] Skipping Firebase signOut (mock user or already signed out).");
        // Se for mock ou já deslogado, força a ida para a tela de login manualmente
        userId = null;
        userRole = 'anonymous'; // Garante reset do estado local
        if (unsubscribeTable) { unsubscribeTable(); unsubscribeTable = null; }
        currentTableId = null; currentOrderSnapshot = null; selectedItems.length = 0;
        showLoginScreen(); // Mostra login imediatamente
        const userIdDisplay = document.getElementById('user-id-display');
        if(userIdDisplay) userIdDisplay.textContent = 'Usuário ID: Carregando...';
    }
    console.log("[LOGOUT] Logout completed.");
};
window.handleLogout = handleLogout; // Exposto para header

// --- INICIALIZAÇÃO PRINCIPAL ---
document.addEventListener('DOMContentLoaded', () => {
    console.log("[INIT] DOMContentLoaded event fired."); // Debug inicial

    const firebaseConfig = FIREBASE_CONFIG; // Usa a constante local

    try {
        console.log("[INIT] Firebase config loaded.");

        // Inicializa Firebase App e Serviços
        const app = initializeApp(firebaseConfig);
        const dbInstance = getFirestore(app);
        const authInstance = getAuth(app);
        initializeFirebase(dbInstance, authInstance, APP_ID); // Passa instâncias para o serviço
        console.log("[INIT] Firebase App and Services initialized.");

        // Mapeia elementos Globais e de Login (apenas uma vez)
        statusScreen = document.getElementById('statusScreen');
        mainContent = document.getElementById('mainContent');
        appContainer = document.getElementById('appContainer');
        mainHeader = document.getElementById('mainHeader');
        loginBtn = document.getElementById('loginBtn');
        loginEmailInput = document.getElementById('loginEmail');
        loginPasswordInput = document.getElementById('loginPassword');
        loginErrorMsg = document.getElementById('loginErrorMsg');
        console.log("[INIT] Global and Login UI elements mapped.");

        // ==============================================
        //     LISTENER ATUALIZADO: onAuthStateChanged
        // ==============================================
        onAuthStateChanged(authInstance, async (user) => {
            console.log("[AUTH] Auth State Changed:", user ? `User detected (UID: ${user.uid})` : 'No user detected');

            // Ignora a mudança de estado se o login manual acabou de acontecer
            if (isLoginProcessActive) {
                console.log("[AUTH] Ignoring Auth State change because manual login process is active.");
                return;
            }

            if (user) {
                // Usuário Firebase detectado (pode ser de sessão anterior ou recém-criado anônimo)
                userId = user.uid; // Atualiza userId global

                // Verifica se JÁ temos uma role válida (indicando que o login manual ocorreu ANTES do listener)
                // OU se é um retorno de sessão (role pode ter sido definida antes)
                if (userRole === 'gerente' || userRole === 'garcom') {
                    console.log(`[AUTH] User detected with valid local role '${userRole}'. Initializing staff app...`);
                    // Garante que o nome do usuário seja exibido corretamente (caso seja recarregamento)
                     const userName = STAFF_CREDENTIALS[loginEmailInput?.value?.trim()]?.name || userRole; // Tenta pegar do input se disponível
                     const userIdDisplay = document.getElementById('user-id-display');
                     if(userIdDisplay) userIdDisplay.textContent = `Usuário: ${userName} | ${userRole.toUpperCase()}`;
                    await initStaffApp(); // Inicia o app se a role local é válida
                } else {
                    // Usuário Firebase existe, mas a role local NÃO é válida ('anonymous' ou outra coisa)
                    // Isso pode acontecer se o usuário anônimo persistiu mas a app foi recarregada sem o login local
                    console.warn("[AUTH] Firebase user exists, but local role is not valid ('anonymous'). Forcing logout to ensure proper login flow.");
                    handleLogout(); // Força logout para limpar tudo e mostrar login
                }
            } else {
                // Nenhum usuário Firebase detectado (logout completo ou estado inicial)
                userId = null;
                userRole = 'anonymous'; // Reseta estado local
                if (unsubscribeTable) { unsubscribeTable(); unsubscribeTable = null; } // Limpa listener de mesa se houver
                currentTableId = null; currentOrderSnapshot = null; selectedItems.length = 0;
                console.log("[AUTH] No Firebase user and no local role. Showing login screen.");
                showLoginScreen(); // Mostra a tela de login
            }
        });
        console.log("[INIT] Firebase AuthStateChanged listener configured.");
        // ==============================================
        //           FIM DO LISTENER ATUALIZADO
        // ==============================================


        // Adiciona Listener ao Botão de Login (apenas se existir)
        if (loginBtn) {
            loginBtn.addEventListener('click', handleStaffLogin);
            console.log("[INIT] Login button listener added.");
        } else {
             console.error("[INIT] Login Button (loginBtn) not found!");
        }

        // Inicializa os Controllers (apenas uma vez)
        console.log("[INIT] Calling controller initializers...");
        try {
            initPanelController();
            initOrderController();
            initPaymentController();
            initManagerController();
            console.log("[INIT] Controller initializers called successfully.");
        } catch (controllerError) {
             console.error("[INIT] Error initializing controllers:", controllerError);
             alert(`Erro ao inicializar módulos internos: ${controllerError.message}`);
             // Pode ser útil mostrar a tela de login aqui também ou uma mensagem de erro
             showLoginScreen();
             return; // Aborta inicialização adicional
        }


        // Outros Listeners Globais (Header, etc.)
        const openManagerPanelBtn = document.getElementById('openManagerPanelBtn');
        const logoutBtnHeader = document.getElementById('logoutBtnHeader');
        const openNfeModalBtn = document.getElementById('openNfeModalBtn'); // Listener será anexado mesmo se botão mudar de lugar

        if (openManagerPanelBtn) openManagerPanelBtn.addEventListener('click', () => { window.openManagerAuthModal('goToManagerPanel'); });
        if (logoutBtnHeader) logoutBtnHeader.addEventListener('click', handleLogout);
        if (openNfeModalBtn) openNfeModalBtn.addEventListener('click', window.openNfeModal);

        console.log("[INIT] Remaining global listeners added.");

    } catch (e) {
        console.error("CRITICAL Error during DOMContentLoaded initialization:", e);
        alert(`Falha grave ao carregar o PDV: ${e.message}. Verifique o console.`);
        if(statusScreen) statusScreen.innerHTML = '<h2 class="text-red-600 font-bold">Erro Crítico de Inicialização</h2>';
        // Não continua se a inicialização base falhar
        return;
    }
    console.log("[INIT] DOMContentLoaded initialization finished successfully.");
}); // FIM DO DOMContentLoaded
