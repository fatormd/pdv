// --- APP.JS ---
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut, signInAnonymously } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, serverTimestamp, doc, setDoc, updateDoc, getDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// Importações dos Módulos Refatorados
import { initializeFirebase, saveSelectedItemsToFirebase, getTableDocRef, auth } from '/services/firebaseService.js';
import { fetchWooCommerceProducts, fetchWooCommerceCategories } from '/services/wooCommerceService.js';
import { formatCurrency, formatElapsedTime } from '/utils.js'; // Importar utils

// Importações dos Controllers (com funções init e outras necessárias)
import { loadOpenTables, renderTableFilters, handleAbrirMesa, handleSearchTable, initPanelController, handleTableTransferConfirmed as panel_handleTableTransferConfirmed } from '/controllers/panelController.js';
import { renderMenu, renderOrderScreen, increaseLocalItemQuantity, decreaseLocalItemQuantity, openObsModalForGroup, initOrderController, handleSendSelectedItems } from '/controllers/orderController.js';
// Importa funções necessárias, incluindo as que precisam ser globais
import { renderPaymentSummary, deletePayment, handleMassActionRequest, handleConfirmTableTransfer, handleAddSplitAccount, openPaymentModalForSplit, moveItemsToMainAccount, openSplitTransferModal, openTableTransferModal, initPaymentController, handleFinalizeOrder } from '/controllers/paymentController.js';
import { openManagerAuthModal, initManagerController } from '/controllers/managerController.js';

// --- VARIÁVEIS DE ESTADO GLOBAL ---
export const screens = {
    'loginScreen': 0, // Tela de Login é o índice 0
    'panelScreen': 1,
    'orderScreen': 2,
    'paymentScreen': 3,
    'managerScreen': 4,
};

const STAFF_CREDENTIALS = {
    'agencia@fatormd.com': { password: '1234', role: 'gerente', name: 'Fmd' },
    'garcom@fator.com': { password: '1234', role: 'garcom', name: 'Mock Garçom' },
};

export let currentTableId = null;
export let selectedItems = [];
export let currentOrderSnapshot = null;
export let userRole = 'anonymous'; // Começa como anônimo
export let userId = null;
export let unsubscribeTable = null; // Listener da mesa ativa


// --- ELEMENTOS UI ---
// Declaradas aqui, mas atribuídas no DOMContentLoaded
let statusScreen, mainContent, appContainer, loginScreen, mainHeader;
let loginBtn, loginEmailInput, loginPasswordInput, loginErrorMsg;


// --- FUNÇÕES CORE E ROTIAMENTO ---

export const hideStatus = () => {
    // Garante que o elemento seja encontrado
    if (!statusScreen) statusScreen = document.getElementById('statusScreen');
    if (statusScreen) {
        statusScreen.style.display = 'none'; // Esconde a tela de status
        console.log("[UI] hideStatus executado.");
    } else {
        console.error("[UI] Elemento statusScreen não encontrado em hideStatus.");
    }
};

// Mostra a Tela de Login (Painel 0)
const showLoginScreen = () => {
    console.log("[UI] Chamando showLoginScreen...");
    // Garante mapeamento dos elementos essenciais para esta função
    if (!statusScreen) statusScreen = document.getElementById('statusScreen');
    if (!mainContent) mainContent = document.getElementById('mainContent');
    if (!mainHeader) mainHeader = document.getElementById('mainHeader');
    if (!appContainer) appContainer = document.getElementById('appContainer');
    if (!loginEmailInput) loginEmailInput = document.getElementById('loginEmail');
    if (!loginPasswordInput) loginPasswordInput = document.getElementById('loginPassword');
    if (!loginErrorMsg) loginErrorMsg = document.getElementById('loginErrorMsg');

    hideStatus(); // Esconde "Iniciando..."
    if (mainHeader) mainHeader.style.display = 'none'; // Esconde o header principal

    if (mainContent) {
        mainContent.style.display = 'block'; // Mostra o container principal
         console.log("[UI] mainContent display setado para 'block'");
    } else {
         console.error("[UI] mainContent NÃO encontrado em showLoginScreen!");
    }

    if (appContainer) appContainer.style.transform = `translateX(0vw)`; // Move para painel 0 (login)
    document.body.classList.add('bg-dark-bg'); // Garante fundo escuro
    document.body.classList.remove('bg-gray-900', 'logged-in'); // Remove outras classes

    // Limpa campos ao mostrar login
    if(loginEmailInput) loginEmailInput.value = '';
    if(loginPasswordInput) loginPasswordInput.value = '';
    if(loginErrorMsg) loginErrorMsg.style.display = 'none';
    console.log("[UI] showLoginScreen concluído."); // Log final da função
};

// Esconde a Tela de Login e mostra o conteúdo principal (Chamado após login SUCESSO)
const hideLoginScreen = () => {
    if (!mainHeader) mainHeader = document.getElementById('mainHeader');
    if (!mainContent) mainContent = document.getElementById('mainContent');

    if (mainHeader) mainHeader.style.display = 'flex';
    if (mainContent) mainContent.style.display = 'block';
    document.body.classList.add('logged-in'); // Adiciona classe para indicar login

    const logoutBtn = document.getElementById('logoutBtnHeader');
    const managerBtn = document.getElementById('openManagerPanelBtn');
    if (logoutBtn) logoutBtn.classList.remove('hidden');
    if (managerBtn) managerBtn.classList.toggle('hidden', userRole !== 'gerente');
};

// Função de Navegação Principal
export const goToScreen = (screenId) => {
    if (!appContainer) appContainer = document.getElementById('appContainer');
    if (!mainContent) mainContent = document.getElementById('mainContent');

    // Salva itens ao sair da tela de pedido ou pagamento e voltar pro painel
    if (currentTableId && screenId === 'panelScreen') {
        const currentTransform = appContainer?.style.transform || '';
        const currentScreenKey = Object.keys(screens).find(key => screens[key] * -100 + 'vw' === currentTransform.replace(/translateX\((.*?)\)/, '$1'));
        if (currentScreenKey === 'orderScreen' || currentScreenKey === 'paymentScreen') {
             console.log(`[NAV] Salvando itens da mesa ${currentTableId} ao sair de ${currentScreenKey}`);
            saveSelectedItemsToFirebase(currentTableId, selectedItems);
        }
    }

    // Desinscreve do listener da mesa ao voltar para o painel de login ou painel de mesas
    if ((screenId === 'panelScreen' || screenId === 'loginScreen') && currentTableId && unsubscribeTable) {
        console.log(`[NAV] Desinscrevendo do listener da mesa ${currentTableId}`);
        unsubscribeTable(); unsubscribeTable = null;
        currentTableId = null; currentOrderSnapshot = null; selectedItems = [];
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

// Expor funções globais necessárias dos controllers
window.openManagerAuthModal = openManagerAuthModal;
window.deletePayment = deletePayment;
window.handleMassActionRequest = handleMassActionRequest;
window.handleConfirmTableTransfer = handleConfirmTableTransfer;
window.openTableTransferModal = openTableTransferModal;
window.openKdsStatusModal = (id) => alert(`Abrir status KDS ${id} (DEV)`);


// Listener da Mesa
export const setTableListener = (tableId) => { /* ... (lógica mantida) ... */ };
// Define a mesa atual e inicia o listener
export const setCurrentTable = (tableId) => { /* ... (lógica mantida) ... */ };
// Seleciona a mesa e inicia o listener (chamada pelo panelController)
export const selectTableAndStartListener = async (tableId) => { /* ... (lógica mantida) ... */ };
window.selectTableAndStartListener = selectTableAndStartListener; // Expor globalmente

// Função NF-e (Placeholder global)
window.openNfeModal = () => { /* ... (lógica mantida) ... */ };


// --- INICIALIZAÇÃO APP STAFF ---
const initStaffApp = async () => {
    console.log("[INIT] Iniciando app para Staff...");
    try {
        renderTableFilters();
        console.log("[INIT] Filtros de setor renderizados.");

        // Carrega WooCommerce em paralelo
        fetchWooCommerceProducts(/* Callback opcional */)
            .then(() => console.log("[INIT] Produtos Woo carregados."))
            .catch(e => console.error("[INIT ERROR] Falha ao carregar produtos:", e));
        fetchWooCommerceCategories(/* Callback opcional */)
            .then(() => console.log("[INIT] Categorias Woo carregadas."))
            .catch(e => console.error("[INIT ERROR] Falha ao carregar categorias:", e));

        hideStatus(); // Garante que status sumiu
        hideLoginScreen(); // Mostra header/main
        console.log("[INIT] UI principal visível.");

        loadOpenTables(); // Configura listener das mesas
        console.log("[INIT] Listener de mesas configurado.");

        goToScreen('panelScreen'); // Navega para o painel de mesas
        console.log("[INIT] Navegação inicial para panelScreen.");

    } catch (error) {
        console.error("[INIT] Erro CRÍTICO durante initStaffApp:", error);
        alert("Erro grave ao iniciar. Verifique o console.");
        showLoginScreen();
    }
};

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

        // Inicializa Firebase App e Serviços
        const app = initializeApp(firebaseConfig);
        const dbInstance = getFirestore(app);
        const authInstance = getAuth(app);
        initializeFirebase(dbInstance, authInstance, window.__app_id || 'pdv_default_app');
        console.log("[INIT] Firebase App e Serviços inicializados.");

        // Mapeia elementos Globais e de Login AQUI
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
        onAuthStateChanged(authInstance, async (user) => { // Tornar async para usar await
            console.log("[AUTH] State Changed:", user ? `User UID: ${user.uid}` : 'No user');

            if (user) {
                // Usuário Firebase detectado (sessão anônima persistiu?)
                userId = user.uid; // Garante que userId esteja correto
                console.log(`[AUTH] Usuário Firebase ${userId} detectado.`);

                // Verifica se já temos uma role definida (pode ter vindo de um login local anterior antes do refresh)
                if (userRole === 'gerente' || userRole === 'garcom') {
                    console.log(`[AUTH] Role ${userRole} já definida. Iniciando app...`);
                     document.getElementById('user-id-display').textContent = `Usuário ID: ${userId.substring(0, 8)} | Função: ${userRole.toUpperCase()}`; // Atualiza display se possível
                    await initStaffApp(); // Inicia app para usuário existente
                } else {
                    // Usuário Firebase existe, mas não temos role local (caso estranho, pode forçar logout)
                    console.warn("[AUTH] Usuário Firebase existe, mas role local é 'anonymous'. Forçando logout para relogin.");
                    handleLogout(); // Força o logout para o usuário logar de novo e definir a role
                }

            } else if (userRole !== 'gerente' && userRole !== 'garcom') {
                 // Nenhum usuário Firebase E userRole não é de staff -> mostra tela de login
                 console.log("[AUTH] Nenhum usuário e userRole não é staff -> showLoginScreen()");
                 showLoginScreen();
            }
            // Se não houver user Firebase MAS userRole FOR staff (caso do mock ID), não faz nada aqui, espera o fluxo normal.
        });
        console.log("[INIT] Listener AuthStateChanged configurado.");

        // Adiciona Listener ao Botão de Login AQUI
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
        return; // Interrompe
    }
    console.log("[INIT] DOMContentLoaded finalizado.");
}); // FIM DO DOMContentLoaded
