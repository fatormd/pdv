// --- APP.JS (Versão Corrigida - PanelController Estático) ---
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut, signInAnonymously } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, serverTimestamp, doc, setDoc, updateDoc, getDoc, onSnapshot, writeBatch, arrayRemove, arrayUnion, collection } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { getFunctions } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-functions.js";

// Importações dos Serviços e Utils
import { initializeFirebase, saveSelectedItemsToFirebase, getTableDocRef, auth, db, functions, appId } from '/services/firebaseService.js';
import { fetchWooCommerceProducts, fetchWooCommerceCategories } from '/services/wooCommerceService.js';
import { formatCurrency, formatElapsedTime } from '/utils.js';

// --- IMPORTAÇÃO ESTATICA DO PANEL CONTROLLER (Necessário para initStaffApp) ---
import { initPanelController, loadOpenTables, renderTableFilters } from '/controllers/panelController.js';

// --- CONFIGURAÇÃO ---
const FIREBASE_CONFIG = {
    apiKey: "AIzaSyCQINQFRyAES3hkG8bVpQlRXGv9AzQuYYY",
    authDomain: "fator-pdv.firebaseapp.com",
    projectId: "fator-pdv",
    storageBucket: "fator-pdv.appspot.com",
    messagingSenderId: "1097659747429",
    appId: "1:1097659747429:web:8ec0a7c39777c311dbe0a8c" // Usando a do cliente como fallback
};

// --- VARIÁVEIS GLOBAIS ---
export const screens = { 'loginScreen': 0, 'panelScreen': 1, 'orderScreen': 2, 'paymentScreen': 3, 'managerScreen': 4, };
const MANAGER_PASSWORD = '1234';
export let currentTableId = null; export let selectedItems = []; export let currentOrderSnapshot = null;
export let userRole = 'anonymous'; export let userId = null; export let unsubscribeTable = null;
const initializedModules = new Set();
let globalOrderFunctions = {}; let globalPaymentFunctions = {}; let globalManagerFunctions = {};
let globalUserManagementFunctions = {}; // Removido globalPanelFunctions (agora as chamadas são diretas)

// --- ELEMENTOS UI ---
let statusScreen, mainContent, appContainer, loginScreen, mainHeader;
let loginBtn, loginEmailInput, loginPasswordInput, loginErrorMsg;

// --- FUNÇÕES CORE E ROTIAMENTO ---
export const hideStatus = () => { /* ... (mantida) ... */ };
const showLoginScreen = () => { /* ... (mantida) ... */ };
const hideLoginScreen = () => { /* ... (mantida) ... */ };

/**
 * Navega entre as telas do SPA e carrega módulos sob demanda (Lazy Loading).
 * @param {string} screenId - A chave da tela de destino.
 */
export const goToScreen = async (screenId) => {
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

        // --- LÓGICA DE LAZY LOADING (Ignora 'panelScreen' pois é estático) ---
        if (screenId !== 'panelScreen' && !initializedModules.has(screenId)) {
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
            } catch (err) { console.error(`Falha ao carregar o módulo para ${screenId}:`, err); alert(`Erro ao carregar a tela ${screenId}. Tente recarregar a página.`); return; }
        }
        // --- FIM LAZY LOADING ---

        console.log(`[NAV] Navegando para ${screenId} (índice ${screenIndex})`);
        if (appContainer) appContainer.style.transform = `translateX(-${screenIndex * 100}vw)`;
        if (mainContent && screenId !== 'loginScreen') mainContent.style.display = 'block';
        document.body.classList.toggle('bg-gray-900', screenId === 'managerScreen');
        document.body.classList.toggle('bg-dark-bg', screenId !== 'managerScreen' && screenId !== 'loginScreen');

    } else { console.error(`[NAV] Tentativa de navegar para tela inválida: ${screenId}`); }
};
window.goToScreen = goToScreen;
export const handleTableTransferConfirmed = async (originTableId, targetTableId, itemsToTransfer, newDiners = 0, newSector = '') => { /* ... (mantida) ... */ };
window.handleTableTransferConfirmed = handleTableTransferConfirmed;
window.openManagerAuthModal = (action, payload = null) => { /* ... (mantida) ... */ };
window.openManagerAuthModal = openManagerAuthModal;
// --- WRAPPERS GLOBAIS PARA ONCLICKS ---
window.deletePayment = (timestamp) => window.openManagerAuthModal('deletePayment', timestamp);
window.handleMassActionRequest = (action) => { if(action === 'delete') window.openManagerAuthModal('executeMassDelete'); else if (action === 'transfer') window.openManagerAuthModal('executeMassTransfer'); };
window.increaseLocalItemQuantity = (itemId, noteKey) => { if(globalOrderFunctions.increaseLocalItemQuantity) globalOrderFunctions.increaseLocalItemQuantity(itemId, noteKey); else console.error("..."); };
window.decreaseLocalItemQuantity = (itemId, noteKey) => { if(globalOrderFunctions.decreaseLocalItemQuantity) globalOrderFunctions.decreaseLocalItemQuantity(itemId, noteKey); else console.error("..."); };
window.openObsModalForGroup = (itemId, noteKey) => { if(globalOrderFunctions.openObsModalForGroup) globalOrderFunctions.openObsModalForGroup(itemId, noteKey); else console.error("..."); };
window.openKdsStatusModal = (id) => alert(`Abrir status KDS ${id} (DEV)`);
// --- LÓGICA DE LISTENER DA MESA ---
export const setTableListener = (tableId) => { /* ... (mantida) ... */ };
export const setCurrentTable = (tableId) => { /* ... (mantida) ... */ };
export const selectTableAndStartListener = async (tableId) => {
    console.log(`[APP] Selecionando mesa ${tableId} e iniciando listener.`);
    try {
        // Navega para a tela de pedido (o goToScreen vai carregar o módulo se necessário)
        await goToScreen('orderScreen');
        // Define a mesa atual e inicia o listener
        setCurrentTable(tableId);

    } catch (error) { console.error(`[APP] Erro ao selecionar mesa ${tableId}:`, error); alert("Erro ao abrir a mesa. Verifique a conexão."); }
};
window.selectTableAndStartListener = selectTableAndStartListener;
window.openNfeModal = () => { /* ... (mantida) ... */ };
window.openNfeModal = openNfeModal;

// --- FUNÇÕES DE INICIALIZAÇÃO E AUTENTICAÇÃO ---
const authenticateUserFromFirestore = async (email, password) => { /* ... (mantida) ... */ };

// --- ATUALIZADO: initStaffApp usa o panelController estático ---
const initStaffApp = async () => { 
    console.log("[INIT] Iniciando app para Staff...");
    try {
        // 1. Inicializa o Panel Controller (Carregado estaticamente no DOMContentLoaded)
        if (!initializedModules.has('panelScreen')) {
            initPanelController();
            initializedModules.add('panelScreen');
            console.log("[INIT] PanelController inicializado.");
        }

        // 2. Renderiza filtros de setor (direto)
        renderTableFilters();
        console.log("[INIT] Filtros de setor renderizados.");

        // 3. Carrega dados do WooCommerce em segundo plano
        fetchWooCommerceProducts().catch(e => console.error("[INIT ERROR] Falha ao carregar produtos:", e));
        fetchWooCommerceCategories().catch(e => console.error("[INIT ERROR] Falha ao carregar categorias:", e));

        hideStatus(); 
        hideLoginScreen();
        console.log("[INIT] UI principal visível.");

        // 4. Configura listener das mesas
        loadOpenTables();
        console.log("[INIT] Listener de mesas configurado.");

        // 5. Navega para o painel
        await goToScreen('panelScreen');
        console.log("[INIT] Navegação inicial para panelScreen concluída.");

    } catch (error) { console.error("[INIT] Erro CRÍTICO durante initStaffApp:", error); alert(`Erro grave ao iniciar: ${error.message}. Verifique o console.`); showLoginScreen(); }
};

const handleStaffLogin = async () => { /* ... (mantida) ... */ };
const handleLogout = () => { /* ... (mantida) ... */ };
window.handleLogout = handleLogout;

// --- INICIALIZAÇÃO PRINCIPAL (DOMContentLoaded) ---
document.addEventListener('DOMContentLoaded', () => {
    console.log("[INIT] DOMContentLoaded.");
    const firebaseConfig = FIREBASE_CONFIG;
    try {
        console.log("[INIT] Config Firebase carregada.");
        const app = initializeApp(firebaseConfig);
        const dbInstance = getFirestore(app);
        const authInstance = getAuth(app);
        const functionsInstance = getFunctions(app, 'us-central1');
        // Define o APP_ID customizado aqui
        initializeFirebase(dbInstance, authInstance, "pdv_fator_instance_001", functionsInstance); 
        console.log("[INIT] Firebase App e Serviços inicializados.");

        statusScreen = document.getElementById('statusScreen');
        mainContent = document.getElementById('mainContent');
        appContainer = document.getElementById('appContainer');
        mainHeader = document.getElementById('mainHeader');
        loginBtn = document.getElementById('loginBtn');
        loginEmailInput = document.getElementById('loginEmail');
        loginPasswordInput = document.getElementById('loginPassword');
        loginErrorMsg = document.getElementById('loginErrorMsg');

        // Listener de Autenticação Firebase
        onAuthStateChanged(authInstance, async (user) => {
            if (user) {
                userId = user.uid; 
                // Se a role é anônima (primeira vez), força a mostrar login
                if (userRole !== 'anonymous') { 
                     // Se já tem role, significa que o login manual foi concluído.
                     await initStaffApp(); 
                } else if (!window.location.pathname.includes('client.html')) {
                    console.warn("[AUTH] Unknown session detected. Forcing login view.");
                    showLoginScreen();
                }
            } else if (!window.location.pathname.includes('client.html')) {
                 showLoginScreen();
            }
        });

        // Listener do Formulário de Login
        const loginForm = document.getElementById('loginForm');
        if (loginForm) {
            loginForm.addEventListener('submit', (e) => {
                e.preventDefault();
                handleStaffLogin();
            });
        }
        
        // Listeners Globais do Header
        const openManagerPanelBtn = document.getElementById('openManagerPanelBtn');
        const logoutBtnHeader = document.getElementById('logoutBtnHeader');
        if (openManagerPanelBtn) openManagerPanelBtn.addEventListener('click', () => { window.openManagerAuthModal('goToManagerPanel'); });
        if (logoutBtnHeader) logoutBtnHeader.addEventListener('click', handleLogout);

    } catch (e) { 
        console.error("Erro CRÍTICO na inicialização (DOMContentLoaded):", e);
        if(statusScreen) { 
             statusScreen.innerHTML = `<div class="flex flex-col items-center p-8 max-w-sm w-full text-center"><i class="fas fa-times-circle text-4xl text-red-500 mb-4"></i><h2 class="text-xl font-bold mb-2 text-red-400">Erro Crítico</h2><p class="text-dark-placeholder">${e.message}</p></div>`;
             statusScreen.style.display = 'flex';
        }
        return;
    }
});
