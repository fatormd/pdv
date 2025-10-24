// --- APP.JS ---
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut, signInAnonymously } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, serverTimestamp, doc, setDoc, updateDoc, getDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// Importações dos Módulos Refatorados
import { initializeFirebase, saveSelectedItemsToFirebase, getTableDocRef, auth } from '/services/firebaseService.js';
import { fetchWooCommerceProducts, fetchWooCommerceCategories } from '/services/wooCommerceService.js';
import { loadOpenTables, renderTableFilters, handleAbrirMesa, loadTableOrder, handleSearchTable, initPanelController } from '/controllers/panelController.js'; // Importa init
import { renderMenu, renderOrderScreen, increaseLocalItemQuantity, decreaseLocalItemQuantity, openObsModalForGroup, initOrderController } from '/controllers/orderController.js'; // Importa init
import { renderPaymentSummary, deletePayment, handleMassActionRequest, handleConfirmTableTransfer, handleAddSplitAccount, openPaymentModalForSplit, moveItemsToMainAccount, openSplitTransferModal, openTableTransferModal, initPaymentController } from '/controllers/paymentController.js'; // Importa init
import { openManagerAuthModal, initManagerController } from '/controllers/managerController.js'; // Importa init

// --- VARIÁVEIS DE ESTADO GLOBAL ---
// CORREÇÃO: Mapeamento de telas APENAS para Staff (4 telas + Login=0)
export const screens = {
    'loginScreen': 0, // <-- NOVO: Tela de Login é o índice 0
    'panelScreen': 1,
    'orderScreen': 2,
    'paymentScreen': 3,
    'managerScreen': 4,
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
export let userRole = 'anonymous'; // Começa como anônimo
export let userId = null;
export let unsubscribeTable = null;


// --- ELEMENTOS UI ---
const statusScreen = document.getElementById('statusScreen');
const mainContent = document.getElementById('mainContent');
const appContainer = document.getElementById('appContainer');
// const loginModal = document.getElementById('loginModal'); // Não usado mais
const loginScreen = document.getElementById('loginScreen'); // Referência para a nova tela de login
const mainHeader = document.getElementById('mainHeader'); // Referência para o header principal

let loginBtn = null;
let loginEmailInput = null;
let loginPasswordInput = null;
let loginErrorMsg = null; // Para mensagens de erro


// --- FUNÇÕES CORE E ROTIAMENTO ---

export const hideStatus = () => {
    if (statusScreen) statusScreen.style.display = 'none';
};

// Mostra a Tela de Login (Painel 0)
const showLoginScreen = () => {
    hideStatus();
    if (mainContent) mainContent.style.display = 'none'; // Esconde o conteúdo principal
    if (mainHeader) mainHeader.style.display = 'none'; // Esconde o header principal
    if (appContainer) appContainer.style.transform = `translateX(0vw)`; // Garante que o painel 0 esteja visível
    document.body.classList.add('bg-dark-bg'); // Garante fundo escuro

    // Limpa campos ao mostrar login
    if(loginEmailInput) loginEmailInput.value = '';
    if(loginPasswordInput) loginPasswordInput.value = '';
    if(loginErrorMsg) loginErrorMsg.style.display = 'none';
};

// Esconde a Tela de Login e mostra o conteúdo principal
const hideLoginScreen = () => {
    if (mainContent) mainContent.style.display = 'block'; // Mostra o conteúdo principal
    if (mainHeader) mainHeader.style.display = 'flex'; // Mostra o header principal

    // Mostra/Esconde botões do header baseados no role
    const logoutBtn = document.getElementById('logoutBtnHeader');
    const managerBtn = document.getElementById('openManagerPanelBtn');
    if (logoutBtn) logoutBtn.classList.remove('hidden');
    if (managerBtn) {
        managerBtn.classList.toggle('hidden', userRole !== 'gerente');
    }
};

// Função de Navegação Principal
export const goToScreen = (screenId) => {
    if (currentTableId && screenId === 'panelScreen') { // Salva apenas ao voltar para o painel de mesas
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
        // Ajusta o fundo do body APENAS para o managerScreen
        document.body.classList.toggle('bg-gray-900', screenId === 'managerScreen'); // Usa um cinza mais escuro pro manager
        document.body.classList.toggle('bg-dark-bg', screenId !== 'managerScreen'); // Usa o fundo padrão para os outros
    } else {
        console.error(`[NAV] Tentativa de navegar para tela inválida: ${screenId}`);
    }
};
window.goToScreen = goToScreen; // Expor globalmente para onclicks remanescentes

// Expor funções globais necessárias (Verificar se todas são realmente necessárias globalmente vs. importadas)
window.openManagerAuthModal = openManagerAuthModal;
// Funções de item/obs são chamadas via listener agora, não precisam ser globais
// window.increaseLocalItemQuantity = increaseLocalItemQuantity;
// window.decreaseLocalItemQuantity = decreaseLocalItemQuantity;
// window.openObsModalForGroup = openObsModalForGroup;
window.deletePayment = deletePayment; // Expor a função do controller para onclick
window.handleMassActionRequest = handleMassActionRequest; // Expor a função do controller para onclick
window.handleConfirmTableTransfer = handleConfirmTableTransfer; // Expor a função do controller para listener
// window.handleAddSplitAccount = handleAddSplitAccount; // Removido por hora
// window.openPaymentModalForSplit = openPaymentModalForSplit; // Removido por hora
// window.moveItemsToMainAccount = moveItemsToMainAccount; // Removido por hora
// window.openSplitTransferModal = openSplitTransferModal; // Removido por hora
window.openTableTransferModal = openTableTransferModal; // Expor a função do controller


// Listener da Mesa (atualiza controllers relevantes)
export const setTableListener = (tableId) => {
    if (unsubscribeTable) unsubscribeTable();
    const tableRef = getTableDocRef(tableId);
    unsubscribeTable = onSnapshot(tableRef, (docSnapshot) => {
        if (docSnapshot.exists()) {
            currentOrderSnapshot = docSnapshot.data();
            const newSelectedItems = currentOrderSnapshot.selectedItems || [];
            selectedItems.length = 0;
            selectedItems.push(...newSelectedItems);
            // Chama as funções de renderização dos controllers que dependem do snapshot da mesa
            renderOrderScreen(currentOrderSnapshot); // Atualiza Painel 2
            renderPaymentSummary(currentTableId, currentOrderSnapshot); // Atualiza Painel 3
        } else {
             console.warn(`Listener: Mesa ${tableId} não encontrada ou foi fechada.`);
             if (currentTableId === tableId) {
                 alert(`Mesa ${tableId} foi fechada ou removida.`);
                 currentTableId = null; currentOrderSnapshot = null; selectedItems = [];
                 goToScreen('panelScreen');
             }
        }
    }, (error) => {
        console.error("Erro no listener da mesa:", error);
         if (unsubscribeTable) unsubscribeTable(); unsubscribeTable = null;
         alert("Erro ao sincronizar com a mesa. Voltando ao painel.");
         goToScreen('panelScreen');
    });
};

// Define a mesa atual e inicia o listener
export const setCurrentTable = (tableId) => {
    currentTableId = tableId;
    // Atualiza UIs que mostram o número da mesa
    const currentTableNumEl = document.getElementById('current-table-number');
    const paymentTableNumEl = document.getElementById('payment-table-number');
    if(currentTableNumEl) currentTableNumEl.textContent = `Mesa ${tableId}`;
    if(paymentTableNumEl) paymentTableNumEl.textContent = `Mesa ${tableId}`;
    setTableListener(tableId);
};

// Função NF-e (Placeholder global)
window.openNfeModal = () => {
    const nfeModal = document.getElementById('nfeModal');
    if (!nfeModal) return;
    nfeModal.innerHTML = `
        <div class="bg-dark-card border border-gray-600 p-6 rounded-xl shadow-2xl w-full max-w-sm">
            <h3 class="text-xl font-bold mb-4 text-green-400">NF-e / Recibo</h3>
            <p class="text-base mb-3 text-dark-text">Deseja incluir CPF/CNPJ?</p>
            <input type="text" id="nfeCpfCnpjInput" placeholder="CPF ou CNPJ (Opcional)" class="w-full p-3 bg-dark-input border border-gray-600 rounded-lg text-dark-text placeholder-dark-placeholder focus:ring-pumpkin focus:border-pumpkin text-base">
            <div class="flex flex-col space-y-2 mt-4">
                <button class="px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition text-base">Imprimir Recibo</button>
                <button class="px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition text-base">Enviar por Email</button>
            </div>
            <div class="flex justify-end mt-4">
                <button class="px-4 py-3 bg-gray-600 text-gray-200 rounded-lg hover:bg-gray-500 transition text-base" onclick="document.getElementById('nfeModal').style.display='none'">Fechar</button>
            </div>
        </div>
    `;
    nfeModal.style.display = 'flex';
};


// --- INICIALIZAÇÃO APP STAFF ---
const initStaffApp = async () => {
    console.log("[INIT] Iniciando app para Staff...");
    try {
        renderTableFilters(); // Renderiza filtros de setor (síncrono)
        console.log("[INIT] Filtros de setor renderizados.");

        // Carrega WooCommerce em paralelo
        fetchWooCommerceProducts(/* Callback opcional */)
            .then(() => console.log("[INIT] Produtos WooCommerce carregados."))
            .catch(e => console.error("[INIT ERROR] Falha ao carregar produtos Woo:", e));
        fetchWooCommerceCategories(/* Callback opcional */)
            .then(() => console.log("[INIT] Categorias WooCommerce carregadas."))
            .catch(e => console.error("[INIT ERROR] Falha ao carregar categorias Woo:", e));

        hideStatus(); // Esconde tela de "Iniciando..."
        hideLoginScreen(); // Mostra header/main em vez da tela de login
        console.log("[INIT] UI principal visível.");

        loadOpenTables(); // Configura o listener das mesas
        console.log("[INIT] Listener de mesas configurado.");

        goToScreen('panelScreen'); // Navega para o painel de mesas
        console.log("[INIT] Navegação inicial para panelScreen solicitada.");

    } catch (error) {
        console.error("[INIT] Erro CRÍTICO durante initStaffApp:", error);
        alert("Ocorreu um erro grave ao iniciar o PDV. Verifique o console (F12).");
        showLoginScreen(); // Volta para o login em caso de erro na inicialização
    }
};

// --- LÓGICA DE AUTH/LOGIN ---
const authenticateStaff = (email, password) => {
    const creds = STAFF_CREDENTIALS[email];
    return (creds && creds.password === password && creds.role !== 'client') ? creds : null;
};

// Define handleStaffLogin no escopo do módulo para garantir que esteja acessível
const handleStaffLogin = async () => {
    // Garante que os elementos de login estejam acessíveis aqui
    loginBtn = document.getElementById('loginBtn'); // Re-mapeia caso tenha sido perdido
    loginEmailInput = document.getElementById('loginEmail');
    loginPasswordInput = document.getElementById('loginPassword');
    loginErrorMsg = document.getElementById('loginErrorMsg');

    if (!loginBtn || !loginEmailInput || !loginPasswordInput) {
         console.error("Erro FATAL: Elementos de login não encontrados DENTRO de handleStaffLogin.");
         alert("Erro interno crítico. Recarregue a página.");
         return;
    }
    if (loginErrorMsg) loginErrorMsg.style.display = 'none';
    loginBtn.disabled = true; loginBtn.textContent = 'Entrando...';

    const email = loginEmailInput.value.trim();
    const password = loginPasswordInput.value.trim();

    console.log(`[LOGIN] Tentando autenticar ${email}...`); // LOG INICIAL DA FUNÇÃO
    const staffData = authenticateStaff(email, password);

    if (staffData) {
        console.log(`[LOGIN] Autenticação local OK. Role: ${staffData.role}`);
        userRole = staffData.role;

        try {
            const authInstance = auth; // Usa a instância global inicializada
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

            // Não chama mais hideLoginModal, pois agora a tela é um painel
            // A inicialização cuidará de mostrar o header/main

            console.log("[LOGIN] Chamando initStaffApp...");
            await initStaffApp(); // Chama a inicialização principal APÓS definir userId
            console.log("[LOGIN] initStaffApp concluído.");

        } catch (error) {
             console.error("[LOGIN] Erro pós-autenticação:", error);
             alert(`Erro ao iniciar sessão: ${error.message}.`);
             showLoginScreen(); // Garante que a tela de login seja exibida em caso de erro
             if(loginErrorMsg) { loginErrorMsg.textContent = `Erro: ${error.message}`; loginErrorMsg.style.display = 'block'; }
        }
    } else {
        console.log(`[LOGIN] Credenciais inválidas para ${email}.`);
        if(loginErrorMsg) { loginErrorMsg.textContent = 'E-mail ou senha inválidos.'; loginErrorMsg.style.display = 'block'; }
    }
    // Garante que o botão seja reabilitado mesmo em caso de falha
    if (loginBtn) { loginBtn.disabled = false; loginBtn.textContent = 'Entrar'; }
    console.log("[LOGIN] Fim do handleStaffLogin.");
};

const handleLogout = () => {
    console.log("[LOGOUT] Iniciando...");
    const authInstance = auth; // Usa a instância global
    if (authInstance && authInstance.currentUser && (!userId || !userId.startsWith('mock_'))) {
        console.log("[LOGOUT] Fazendo signOut Firebase...");
        signOut(authInstance).catch(e => console.error("Erro no sign out:", e));
    } else {
        console.log("[LOGOUT] Pulando signOut Firebase (usuário mock ou já deslogado).");
    }
    // Reseta estado global
    userId = null; currentTableId = null; selectedItems = []; userRole = 'anonymous'; currentOrderSnapshot = null;
    if (unsubscribeTable) { unsubscribeTable(); unsubscribeTable = null; }

    showLoginScreen(); // Mostra a tela de login (Painel 0)
    document.getElementById('user-id-display').textContent = 'Usuário ID: Carregando...';
    console.log("[LOGOUT] Concluído.");
};
window.handleLogout = handleLogout; // Expor globalmente


// --- INICIALIZAÇÃO PRINCIPAL ---
document.addEventListener('DOMContentLoaded', () => {
    console.log("[INIT] DOMContentLoaded.");
    try {
        firebaseConfig = JSON.parse(window.__firebase_config);
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
            // Se NÃO houver usuário Firebase E o userRole interno NÃO for de staff, mostra login.
            if (!user && userRole !== 'gerente' && userRole !== 'garcom') {
                 console.log("[AUTH] Nenhum usuário logado no Firebase & userRole não é staff -> showLoginScreen()");
                 showLoginScreen();
            }
            // Não fazemos initStaffApp aqui para evitar chamadas duplas ou antes do login local
        });
        console.log("[INIT] Listener AuthStateChanged configurado.");

        // Adiciona Listener ao Botão de Login AQUI, após mapear o botão
        if (loginBtn) {
            loginBtn.addEventListener('click', handleStaffLogin); // <- ANEXA O LISTENER AQUI
            console.log("[INIT] Listener do botão Login adicionado.");
        } else {
             console.error("[INIT] Botão de Login (loginBtn) não encontrado no DOM!");
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
        console.error("Erro CRÍTICO na inicialização principal (DOMContentLoaded):", e);
        alert("Falha grave ao carregar o PDV. Verifique o console.");
        if(statusScreen) statusScreen.innerHTML = '<h2 class="text-red-600 font-bold">Erro de Inicialização</h2>';
    }
    console.log("[INIT] DOMContentLoaded finalizado.");
}); // FIM DO DOMContentLoaded
