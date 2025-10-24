// --- APP.JS ---
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut, signInAnonymously } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, serverTimestamp, doc, setDoc, updateDoc, getDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// Importações dos Módulos Refatorados
import { initializeFirebase, saveSelectedItemsToFirebase, getTableDocRef, auth } from '/services/firebaseService.js';
import { fetchWooCommerceProducts, fetchWooCommerceCategories } from '/services/wooCommerceService.js';
import { loadOpenTables, renderTableFilters, handleAbrirMesa, loadTableOrder, handleSearchTable } from '/controllers/panelController.js';
import { renderMenu, renderOrderScreen, increaseLocalItemQuantity, decreaseLocalItemQuantity, openObsModalForGroup } from '/controllers/orderController.js';
import { renderPaymentSummary, deletePayment, handleMassActionRequest, handleConfirmTableTransfer, handleAddSplitAccount, openPaymentModalForSplit, moveItemsToMainAccount, openSplitTransferModal, openTableTransferModal } from '/controllers/paymentController.js';
import { openManagerAuthModal } from '/controllers/managerController.js';

// --- VARIÁVEIS DE ESTADO GLOBAL ---
// CORREÇÃO: Mapeamento de telas APENAS para Staff (4 telas)
export const screens = {
    'panelScreen': 0,
    'orderScreen': 1,
    'paymentScreen': 2,
    'managerScreen': 3,
};

// Credenciais Staff Centralizadas (REMOVIDO role 'client')
const STAFF_CREDENTIALS = {
    'agencia@fatormd.com': { password: '1234', role: 'gerente', name: 'Fmd' },
    'garcom@fator.com': { password: '1234', role: 'garcom', name: 'Mock Garçom' },
};

// Variáveis Mutáveis (Estado da Sessão)
export let currentTableId = null;
export let selectedItems = [];
export let currentOrderSnapshot = null;
export let userRole = 'anonymous';
export let userId = null;
export let unsubscribeTable = null;


// --- ELEMENTOS UI ---
const statusScreen = document.getElementById('statusScreen');
const mainContent = document.getElementById('mainContent');
const appContainer = document.getElementById('appContainer');
const loginModal = document.getElementById('loginModal');
let loginBtn = null;
let loginEmailInput = null;
let loginPasswordInput = null;
let searchTableInput = null;


// --- FUNÇÕES CORE E ROTIAMENTO ---

export const hideStatus = () => {
    if (statusScreen && mainContent) {
        statusScreen.style.display = 'none';
    }
};

const showLoginModal = () => {
    if (statusScreen) statusScreen.style.display = 'none';
    if (mainContent) mainContent.style.display = 'none';

    // Mostra botões de header apenas se logado
    const logoutBtn = document.getElementById('logoutBtnHeader');
    const managerBtn = document.getElementById('openManagerPanelBtn');
    if (logoutBtn) logoutBtn.classList.add('hidden');
    if (managerBtn) managerBtn.classList.add('hidden');

    if (loginModal) {
        loginModal.style.display = 'flex';
    }
};

const hideLoginModal = () => {
    if (loginModal) {
        loginModal.style.display = 'none';
    }
    // Mostra botões de header após login
    const logoutBtn = document.getElementById('logoutBtnHeader');
    const managerBtn = document.getElementById('openManagerPanelBtn');
    if (logoutBtn) logoutBtn.classList.remove('hidden');
    // Mostra botão gerente apenas se for gerente
    if (managerBtn && userRole === 'gerente') managerBtn.classList.remove('hidden');
};

export const goToScreen = (screenId) => {
    if (currentTableId && screenId === 'panelScreen') { // Salva apenas ao voltar para o painel principal
        saveSelectedItemsToFirebase(currentTableId, selectedItems);
    }

    if (screenId === 'panelScreen' && currentTableId && unsubscribeTable) {
        unsubscribeTable();
        unsubscribeTable = null;
    }

    const screenIndex = screens[screenId];
    if (screenIndex !== undefined) {
        console.log(`[NAV] Navegando para ${screenId} (índice ${screenIndex})`); // Log de Navegação
        if (appContainer) {
            appContainer.style.transform = `translateX(-${screenIndex * 100}vw)`;
        }
        document.body.classList.toggle('bg-gray-900', screenId === 'managerScreen');
        document.body.classList.toggle('bg-gray-100', screenId !== 'managerScreen');
    } else {
        console.error(`[NAV] Tentativa de navegar para tela inválida: ${screenId}`);
    }
};

// Expondo funções necessárias globalmente para onclicks no HTML
window.goToScreen = goToScreen;
window.openManagerAuthModal = openManagerAuthModal;
window.increaseLocalItemQuantity = increaseLocalItemQuantity;
window.decreaseLocalItemQuantity = decreaseLocalItemQuantity;
window.openObsModalForGroup = openObsModalForGroup;
window.deletePayment = deletePayment;
window.handleMassActionRequest = handleMassActionRequest;
window.handleConfirmTableTransfer = handleConfirmTableTransfer;
window.handleAddSplitAccount = handleAddSplitAccount;
window.openPaymentModalForSplit = openPaymentModalForSplit;
window.moveItemsToMainAccount = moveItemsToMainAccount;
window.openSplitTransferModal = openSplitTransferModal;
window.openTableTransferModal = openTableTransferModal;


// NOVO: Função para o listener da mesa (MÓDULO DE FLUXO)
export const setTableListener = (tableId) => {
    if (unsubscribeTable) unsubscribeTable();

    const tableRef = getTableDocRef(tableId);

    // CRITICAL: Atualiza o estado global e chama os renderizadores de tela
    unsubscribeTable = onSnapshot(tableRef, (docSnapshot) => {
        if (docSnapshot.exists()) {
            currentOrderSnapshot = docSnapshot.data();

            const newSelectedItems = currentOrderSnapshot.selectedItems || [];
            selectedItems.length = 0;
            selectedItems.push(...newSelectedItems);

            renderOrderScreen(currentOrderSnapshot);
            renderPaymentSummary(currentTableId, currentOrderSnapshot);
        } else {
             console.warn(`Listener ativo, mas mesa ${tableId} não encontrada ou foi fechada.`);
             // Se a mesa foi fechada enquanto o listener estava ativo, volta para o painel
             if (currentTableId === tableId) { // Confirma que ainda é a mesa atual
                 alert(`Mesa ${tableId} foi fechada ou removida.`);
                 currentTableId = null;
                 currentOrderSnapshot = null;
                 selectedItems = [];
                 goToScreen('panelScreen');
             }
        }
    }, (error) => {
        console.error("Erro ao carregar dados da mesa:", error);
         // Se houver erro no listener, desativa e volta ao painel
         if (unsubscribeTable) unsubscribeTable();
         unsubscribeTable = null;
         alert("Erro ao sincronizar com a mesa. Voltando ao painel.");
         goToScreen('panelScreen');
    });
};

export const setCurrentTable = (tableId) => {
    currentTableId = tableId;

    document.getElementById('current-table-number').textContent = `Mesa ${tableId}`;
    document.getElementById('payment-table-number').textContent = `Mesa ${tableId}`;
    // REMOVIDO: client-table-number

    setTableListener(tableId);
};


window.openNfeModal = () => {
    const nfeModal = document.getElementById('nfeModal');
    if (!nfeModal) return;

    nfeModal.innerHTML = `
        <div class="bg-white p-6 rounded-xl shadow-2xl w-full max-w-sm">
            <h3 class="text-xl font-bold mb-4 text-green-700">NF-e / Recibo</h3>
            <p class="text-base mb-3">Deseja incluir CPF/CNPJ?</p>
            <input type="text" id="nfeCpfCnpjInput" placeholder="CPF ou CNPJ (Opcional)" class="w-full p-3 border border-gray-300 rounded-lg focus:ring-green-500 focus:border-green-500 text-base">

            <div class="flex flex-col space-y-2 mt-4">
                <button class="px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition text-base">Imprimir Recibo</button>
                <button class="px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition text-base">Enviar por Email</button>
            </div>

            <div class="flex justify-end mt-4">
                <button class="px-4 py-3 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition text-base" onclick="document.getElementById('nfeModal').style.display='none'">Fechar</button>
            </div>
        </div>
    `;
    nfeModal.style.display = 'flex';
};


// --- INICIALIZAÇÃO (Apenas Staff) ---

const initStaffApp = async () => {
    console.log("[INIT] Iniciando app para Staff...");
    try {
        // 1. Renderiza Filtros (Síncrono)
        console.log("[INIT] Tentando renderizar filtros de setor...");
        renderTableFilters();
        console.log("[INIT] Filtros de setor renderizados.");

        // 2. Carrega Dados WooCommerce (Assíncrono, não bloqueia)
        console.log("[INIT] Iniciando carregamento de dados WooCommerce...");
        fetchWooCommerceProducts(renderOrderScreen)
            .then(() => console.log("[INIT] Produtos WooCommerce carregados."))
            .catch(e => console.error("[INIT ERROR] Falha ao carregar produtos Woo:", e));
        fetchWooCommerceCategories(renderTableFilters)
            .then(() => console.log("[INIT] Categorias WooCommerce carregadas."))
            .catch(e => console.error("[INIT ERROR] Falha ao carregar categorias Woo:", e));

        // 3. Mostra UI Principal e Esconde Status
        if (mainContent) mainContent.style.display = 'block';
        hideStatus();
        console.log("[INIT] UI principal visível.");

        // 4. Carrega Mesas Abertas (Assíncrono via onSnapshot)
        console.log("[INIT] Tentando carregar mesas abertas...");
        loadOpenTables(); // Esta função configura o listener
        console.log("[INIT] Listener de mesas abertas configurado.");

        // 5. Navega para a Tela Inicial
        console.log("[INIT] Tentando navegar para panelScreen...");
        goToScreen('panelScreen');
        console.log("[INIT] Navegação para panelScreen solicitada.");

    } catch (error) {
        console.error("[INIT] Erro CRÍTICO durante a inicialização do app Staff:", error);
        alert("Ocorreu um erro grave ao iniciar o PDV. Verifique o console (F12).");
        showLoginModal(); // Volta para o login em caso de erro na inicialização
    }
};

// --- LÓGICA DE AUTH/LOGIN (Apenas Staff) ---

const authenticateStaff = (email, password) => {
    const creds = STAFF_CREDENTIALS[email];
    // Verifica se credenciais existem e a role NÃO É 'client'
    if (creds && creds.password === password && creds.role !== 'client') {
        return creds;
    }
    return null;
};

const handleStaffLogin = async () => {
    if (!loginBtn || !loginEmailInput || !loginPasswordInput) {
         console.error("Erro: Elementos de login não encontrados.");
         alert("Erro interno: Elementos de login não carregados.");
         return;
    }

    if (loginBtn) loginBtn.disabled = true;

    const email = loginEmailInput.value.trim();
    const password = loginPasswordInput.value.trim();

    console.log(`[LOGIN] Tentando autenticar ${email}...`);
    const staffData = authenticateStaff(email, password);

    if (staffData) {
        console.log(`[LOGIN] Autenticação local bem-sucedida para ${email}. Role: ${staffData.role}`);
        userRole = staffData.role;

        try {
            const authInstance = auth;
            if (!authInstance) throw new Error("Firebase Auth não inicializado. Recarregue a página.");

            console.log("[LOGIN] Tentando login anônimo no Firebase...");
            try {
                // Use the existing initialized auth instance
                const userCredential = await signInAnonymously(authInstance);
                userId = userCredential.user.uid;
                console.log(`[LOGIN] Login anônimo no Firebase bem-sucedido. UID: ${userId}`);

            } catch (authError) {
                 // Gera ID mock SE o login anônimo falhar (comum em regras restritas)
                console.warn("[LOGIN] Firebase Auth anônimo falhou. Gerando ID de sessão Mock para Staff/Gerente.", authError);
                userId = `mock_${userRole}_${Date.now()}`; // Garante que userId tenha um valor
            }

            document.getElementById('user-id-display').textContent = `Usuário ID: ${userId.substring(0, 8)} | Função: ${userRole.toUpperCase()}`;
            console.log("[LOGIN] ID do usuário definido.");

            hideLoginModal();
            console.log("[LOGIN] Modal de login oculto.");

            // CHAMA A INICIALIZAÇÃO DA APLICAÇÃO STAFF
            console.log("[LOGIN] Chamando initStaffApp...");
            await initStaffApp(); // Espera a inicialização antes de reabilitar o botão
            console.log("[LOGIN] initStaffApp concluído.");

        } catch (error) {
             console.error("[LOGIN] Erro durante o processo de login:", error);
             alert(`Autenticação falhou: ${error.message}. Verifique as credenciais ou a configuração.`);
             showLoginModal(); // Garante que o modal de login seja exibido em caso de erro
        }
    } else {
        console.log(`[LOGIN] Credenciais inválidas para ${email}.`);
        alert('Credenciais inválidas ou não permitidas para Staff. Verifique seu e-mail e senha.');
    }
    // Garante que o botão seja reabilitado mesmo em caso de falha
    if (loginBtn) loginBtn.disabled = false;
    console.log("[LOGIN] Processo de login finalizado.");
};

const handleLogout = () => {
    console.log("[LOGOUT] Iniciando processo de logout...");
    userId = null;
    currentTableId = null;
    selectedItems = [];
    userRole = 'anonymous';

    const authInstance = auth;
    if (authInstance && authInstance.currentUser) {
        // Apenas faz signOut se não for um usuário Mock
        if (!userId || !userId.startsWith('mock_')) {
            console.log("[LOGOUT] Fazendo signOut do Firebase...");
            signOut(authInstance).catch(e => console.error("Erro no sign out:", e));
        } else {
            console.log("[LOGOUT] Pulando signOut do Firebase para usuário Mock.");
        }
    }

    goToScreen('panelScreen'); // Tenta ir para o painel (será redirecionado para login)
    showLoginModal();
    document.getElementById('user-id-display').textContent = 'Usuário ID: Carregando...';
    console.log("[LOGOUT] Logout concluído.");
};

window.handleLogout = handleLogout;


// --- INITIALIZATION ---
let firebaseConfig;
document.addEventListener('DOMContentLoaded', () => {
    console.log("[INIT] DOMContentLoaded disparado.");
    try {
        firebaseConfig = JSON.parse(window.__firebase_config);
        console.log("[INIT] Configuração Firebase carregada.");
    } catch (e) {
        console.error("Erro ao parsear configuração Firebase:", e);
        alert("Erro crítico na configuração do Firebase. Verifique __firebase_config.");
        statusScreen.innerHTML = '<h2 class="text-red-600 font-bold">Erro de Configuração</h2>';
        return; // Impede a continuação se a config falhar
    }


    const loginBtnElement = document.getElementById('loginBtn');
    const loginEmailInputElement = document.getElementById('loginEmail');
    const loginPasswordInputElement = document.getElementById('loginPassword');
    const searchTableInputElement = document.getElementById('searchTableInput');

    loginBtn = loginBtnElement;
    loginEmailInput = loginEmailInputElement;
    loginPasswordInput = loginPasswordInputElement;
    searchTableInput = searchTableInputElement;
    console.log("[INIT] Elementos de UI mapeados.");

    // FIX: Initialize App using the imported function
    try {
        const app = initializeApp(firebaseConfig);
        const dbInstance = getFirestore(app);
        const authInstance = getAuth(app);
        console.log("[INIT] Firebase App inicializado.");

        initializeFirebase(dbInstance, authInstance, window.__app_id || 'pdv_default_app');
        console.log("[INIT] Serviço Firebase inicializado.");

        onAuthStateChanged(authInstance, (user) => {
            console.log("[AUTH] onAuthStateChanged:", user ? `Usuário ${user.uid}` : 'Nenhum usuário');
            // Mostra login apenas se NÃO houver usuário E o userRole interno não for de staff (evita loop se o mock foi usado)
            if (!user && userRole !== 'gerente' && userRole !== 'garcom') {
                showLoginModal();
            }
        });
        console.log("[INIT] Listener onAuthStateChanged configurado.");

    } catch (e) {
        console.error("Erro CRÍTICO ao inicializar Firebase:", e);
        alert("Falha ao inicializar o Firebase. Verifique a configuração e a conexão. Detalhes no console.");
        statusScreen.innerHTML = '<h2 class="text-red-600 font-bold">Erro Firebase</h2>';
        return; // Impede a continuação
    }

    // 1. Event Listeners de Login
    if (loginBtn) {
        loginBtn.addEventListener('click', handleStaffLogin);
        console.log("[INIT] Listener do botão de login adicionado.");
    } else {
         console.error("[INIT] Botão de Login (loginBtn) não encontrado no DOM!");
    }

    // 2. Event Listeners do Cabeçalho e Painel
    const openManagerPanelBtn = document.getElementById('openManagerPanelBtn');
    const logoutBtnHeader = document.getElementById('logoutBtnHeader');
    const abrirMesaBtn = document.getElementById('abrirMesaBtn');
    const searchTableBtnTrigger = document.getElementById('searchTableBtn');

    if (openManagerPanelBtn) {
        openManagerPanelBtn.addEventListener('click', () => {
             // Chamada global para a função exposta
             window.openManagerAuthModal('goToManagerPanel');
        });
    }
    if (logoutBtnHeader) {
        logoutBtnHeader.addEventListener('click', handleLogout);
    }
    if (abrirMesaBtn) {
        abrirMesaBtn.addEventListener('click', handleAbrirMesa);
    }
    if (searchTableBtnTrigger) {
        searchTableBtnTrigger.addEventListener('click', () => {
             handleSearchTable(); // Apenas fluxo Staff agora
        });
    }

    // Listener para NF-e
    const openNfeModalBtn = document.getElementById('openNfeModalBtn');
    if (openNfeModalBtn) openNfeModalBtn.addEventListener('click', window.openNfeModal);
    console.log("[INIT] Listeners restantes adicionados.");
    console.log("[INIT] Inicialização do DOMContentLoaded concluída.");
});
