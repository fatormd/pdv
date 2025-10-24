// --- APP.JS ---
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut, signInAnonymously } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, serverTimestamp, doc, setDoc, updateDoc, getDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// Importações dos Serviços e Utils
import { initializeFirebase, saveSelectedItemsToFirebase, getTableDocRef, auth } from '/services/firebaseService.js';
import { fetchWooCommerceProducts, fetchWooCommerceCategories } from '/services/wooCommerceService.js';
import { formatCurrency } from '/utils.js';

// Importações dos Controllers (sem loadTableOrder de panelController)
import { loadOpenTables, renderTableFilters, handleAbrirMesa, handleSearchTable, initPanelController } from '/controllers/panelController.js'; // Removido loadTableOrder
import { renderMenu, renderOrderScreen, increaseLocalItemQuantity, decreaseLocalItemQuantity, openObsModalForGroup, initOrderController } from '/controllers/orderController.js';
import { renderPaymentSummary, deletePayment, handleMassActionRequest, handleConfirmTableTransfer, handleAddSplitAccount, openPaymentModalForSplit, moveItemsToMainAccount, openSplitTransferModal, openTableTransferModal, initPaymentController } from '/controllers/paymentController.js';
import { openManagerAuthModal, initManagerController } from '/controllers/managerController.js';

// --- VARIÁVEIS DE ESTADO GLOBAL ---
export const screens = {
    'loginScreen': 0, 'panelScreen': 1, 'orderScreen': 2, 'paymentScreen': 3, 'managerScreen': 4,
};
const STAFF_CREDENTIALS = {
    'agencia@fatormd.com': { password: '1234', role: 'gerente', name: 'Fmd' },
    'garcom@fator.com': { password: '1234', role: 'garcom', name: 'Mock Garçom' },
};
export let currentTableId = null;
export let selectedItems = [];
export let currentOrderSnapshot = null;
export let userRole = 'anonymous';
export let userId = null;
export let unsubscribeTable = null; // Listener da mesa ativa


// --- ELEMENTOS UI GLOBAIS ---
// ... (elementos mantidos) ...
const statusScreen = document.getElementById('statusScreen');
const mainContent = document.getElementById('mainContent');
const appContainer = document.getElementById('appContainer');
const loginScreen = document.getElementById('loginScreen');
const mainHeader = document.getElementById('mainHeader');
let loginBtn = null;
let loginEmailInput = null;
let loginPasswordInput = null;
let loginErrorMsg = null;


// --- FUNÇÕES CORE E ROTIAMENTO ---

export const hideStatus = () => { /* ... (mantida) ... */ };
const showLoginScreen = () => { /* ... (mantida) ... */ };
const hideLoginScreen = () => { /* ... (mantida) ... */ };

// Função de Navegação Principal
export const goToScreen = (screenId) => {
    // Salva itens ao sair da tela de pedido ou pagamento e voltar pro painel
    if (currentTableId && screenId === 'panelScreen') {
        const currentScreenIndex = Object.values(screens).find(index => {
             const transform = appContainer?.style.transform || '';
             return transform === `translateX(-${index * 100}vw)`;
        });
        if (currentScreenIndex === screens['orderScreen'] || currentScreenIndex === screens['paymentScreen']) {
            saveSelectedItemsToFirebase(currentTableId, selectedItems);
        }
    }

    // Desinscreve do listener da mesa ao voltar para o painel de login ou painel de mesas
    if ((screenId === 'panelScreen' || screenId === 'loginScreen') && currentTableId && unsubscribeTable) {
        console.log(`[NAV] Desinscrevendo do listener da mesa ${currentTableId}`);
        unsubscribeTable();
        unsubscribeTable = null;
        currentTableId = null; // Limpa mesa ativa ao voltar
        currentOrderSnapshot = null;
        selectedItems = [];
    }

    const screenIndex = screens[screenId];
    if (screenIndex !== undefined) {
        console.log(`[NAV] Navegando para ${screenId} (índice ${screenIndex})`);
        if (appContainer) {
            appContainer.style.transform = `translateX(-${screenIndex * 100}vw)`;
        }
        document.body.classList.toggle('bg-gray-900', screenId === 'managerScreen');
        document.body.classList.toggle('bg-dark-bg', screenId !== 'managerScreen');
    } else {
        console.error(`[NAV] Tentativa de navegar para tela inválida: ${screenId}`);
    }
};
window.goToScreen = goToScreen; // Expor globalmente

// Expor outras funções globais necessárias
window.openManagerAuthModal = openManagerAuthModal;
window.deletePayment = deletePayment;
window.handleMassActionRequest = handleMassActionRequest;
window.handleConfirmTableTransfer = handleConfirmTableTransfer;
// ... (outras funções globais do paymentController já expostas lá) ...

// Listener da Mesa (atualiza controllers relevantes)
export const setTableListener = (tableId) => {
    if (unsubscribeTable) unsubscribeTable(); // Cancela listener anterior
    console.log(`[APP] Configurando listener para mesa ${tableId}`);
    const tableRef = getTableDocRef(tableId);
    unsubscribeTable = onSnapshot(tableRef, (docSnapshot) => {
        if (docSnapshot.exists()) {
            console.log(`[APP] Snapshot recebido para mesa ${tableId}`);
            currentOrderSnapshot = docSnapshot.data();
            // Atualiza selectedItems local APENAS se mudou no Firebase (evita sobrescrever edições locais não salvas)
            const firebaseSelectedItems = currentOrderSnapshot.selectedItems || [];
            if (JSON.stringify(firebaseSelectedItems) !== JSON.stringify(selectedItems)) {
                console.log("[APP] Atualizando selectedItems local com dados do Firebase.");
                selectedItems.length = 0;
                selectedItems.push(...firebaseSelectedItems);
            }
            renderOrderScreen(currentOrderSnapshot); // Atualiza Painel 2
            renderPaymentSummary(currentTableId, currentOrderSnapshot); // Atualiza Painel 3
        } else {
             console.warn(`[APP] Listener: Mesa ${tableId} não existe ou foi fechada.`);
             if (currentTableId === tableId) { // Confirma que ainda é a mesa ativa
                 alert(`Mesa ${tableId} foi fechada ou removida.`);
                 // Limpa estado e volta ao painel
                 if (unsubscribeTable) unsubscribeTable();
                 unsubscribeTable = null;
                 currentTableId = null; currentOrderSnapshot = null; selectedItems = [];
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

// Define a mesa atual e inicia o listener (Chamada pelo panelController)
export const setCurrentTable = (tableId) => {
    if (currentTableId === tableId && unsubscribeTable) {
        console.log(`[APP] Listener para mesa ${tableId} já ativo.`);
        return; // Evita reiniciar listener desnecessariamente
    }
    currentTableId = tableId;
    console.log(`[APP] Definindo mesa atual para ${tableId}`);
    // Atualiza UIs que mostram o número da mesa
    const currentTableNumEl = document.getElementById('current-table-number');
    const paymentTableNumEl = document.getElementById('payment-table-number');
    if(currentTableNumEl) currentTableNumEl.textContent = `Mesa ${tableId}`;
    if(paymentTableNumEl) paymentTableNumEl.textContent = `Mesa ${tableId}`;
    setTableListener(tableId); // Inicia o listener
};

// **NOVO:** Função movida do panelController para quebrar dependência circular
// Usada pelo panelController ao clicar/buscar uma mesa
export const selectTableAndStartListener = async (tableId) => {
    console.log(`[APP] Selecionando mesa ${tableId} e iniciando listener.`);
    try {
        // Garante que o menu esteja pronto (necessário para a tela de pedido)
        await fetchWooCommerceProducts(renderMenu);
        setCurrentTable(tableId); // Define a mesa atual e inicia o listener
        goToScreen('orderScreen'); // Navega para a tela de pedido
    } catch (error) {
        console.error(`[APP] Erro ao selecionar mesa ${tableId}:`, error);
        alert("Erro ao abrir a mesa. Verifique a conexão e os produtos.");
    }
};


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

        hideStatus();
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

const handleStaffLogin = async () => {
    // Re-mapeia elementos de login para garantir que estão disponíveis
    loginBtn = document.getElementById('loginBtn');
    loginEmailInput = document.getElementById('loginEmail');
    loginPasswordInput = document.getElementById('loginPassword');
    loginErrorMsg = document.getElementById('loginErrorMsg');

    if (!loginBtn || !loginEmailInput || !loginPasswordInput) { /* ... (erro mantido) ... */ return; }
    if (loginErrorMsg) loginErrorMsg.style.display = 'none';
    loginBtn.disabled = true; loginBtn.textContent = 'Entrando...';

    const email = loginEmailInput.value.trim();
    const password = loginPasswordInput.value.trim();

    console.log(`[LOGIN] Autenticando ${email}...`);
    const staffData = authenticateStaff(email, password);

    if (staffData) {
        console.log(`[LOGIN] Auth local OK. Role: ${staffData.role}`);
        userRole = staffData.role;
        try {
            const authInstance = auth;
            if (!authInstance) throw new Error("Firebase Auth não inicializado.");
            console.log("[LOGIN] Tentando login anônimo Firebase...");
            try {
                const userCredential = await signInAnonymously(authInstance);
                userId = userCredential.user.uid;
                console.log(`[LOGIN] Login Firebase OK. UID: ${userId}`);
            } catch (authError) {
                console.warn("[LOGIN] Login Firebase falhou. Usando Mock ID.", authError);
                userId = `mock_${userRole}_${Date.now()}`;
            }
            document.getElementById('user-id-display').textContent = `Usuário: ${staffData.name} | ${userRole.toUpperCase()}`;
            console.log("[LOGIN] User info display atualizado.");

            console.log("[LOGIN] Chamando initStaffApp...");
            await initStaffApp(); // Chama a inicialização principal
            console.log("[LOGIN] initStaffApp concluído.");

        } catch (error) {
             console.error("[LOGIN] Erro pós-autenticação:", error);
             alert(`Erro ao iniciar sessão: ${error.message}.`);
             showLoginScreen();
             if(loginErrorMsg) { loginErrorMsg.textContent = `Erro: ${error.message}`; loginErrorMsg.style.display = 'block'; }
        }
    } else {
        console.log(`[LOGIN] Credenciais inválidas para ${email}.`);
        if(loginErrorMsg) { loginErrorMsg.textContent = 'E-mail ou senha inválidos.'; loginErrorMsg.style.display = 'block'; }
    }
    if (loginBtn) { loginBtn.disabled = false; loginBtn.textContent = 'Entrar'; }
    console.log("[LOGIN] Fim do handleStaffLogin.");
};

const handleLogout = () => { /* ... (lógica mantida) ... */ };
window.handleLogout = handleLogout;


// --- INICIALIZAÇÃO PRINCIPAL ---
document.addEventListener('DOMContentLoaded', () => {
    console.log("[INIT] DOMContentLoaded.");
    try {
        const firebaseConfig = JSON.parse(window.__firebase_config);
        console.log("[INIT] Config Firebase carregada.");

        // Inicializa Firebase App e Serviços
        const app = initializeApp(firebaseConfig);
        const dbInstance = getFirestore(app);
        const authInstance = getAuth(app);
        initializeFirebase(dbInstance, authInstance, window.__app_id || 'pdv_default_app');
        console.log("[INIT] Firebase App e Serviços inicializados.");

        // Mapeia elementos do Login AQUI
        loginBtn = document.getElementById('loginBtn');
        loginEmailInput = document.getElementById('loginEmail');
        loginPasswordInput = document.getElementById('loginPassword');
        loginErrorMsg = document.getElementById('loginErrorMsg');
        console.log("[INIT] Elementos de Login mapeados.");

        // Listener de Autenticação Firebase
        onAuthStateChanged(authInstance, (user) => {
            console.log("[AUTH] State Changed:", user ? `User UID: ${user.uid}` : 'No user');
            if (!user && userRole !== 'gerente' && userRole !== 'garcom') {
                 console.log("[AUTH] -> showLoginScreen()");
                 showLoginScreen();
            }
        });
        console.log("[INIT] Listener AuthStateChanged configurado.");

        // Adiciona Listener ao Botão de Login AQUI
        if (loginBtn) {
            loginBtn.addEventListener('click', handleStaffLogin);
            console.log("[INIT] Listener do botão Login adicionado.");
        } else {
             console.error("[INIT] Botão de Login (loginBtn) não encontrado!");
        }

        // Inicializa os Controllers (eles adicionarão seus próprios listeners)
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
        alert("Falha grave ao carregar. Verifique o console.");
        if(statusScreen) statusScreen.innerHTML = '<h2 class="text-red-600 font-bold">Erro de Inicialização</h2>';
    }
    console.log("[INIT] DOMContentLoaded finalizado.");
}); // FIM DO DOMContentLoaded
