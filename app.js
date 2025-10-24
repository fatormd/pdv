// --- APP.JS ---
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut, signInAnonymously } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, serverTimestamp, doc, setDoc, updateDoc, getDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// Importações dos Serviços e Utils
import { initializeFirebase, saveSelectedItemsToFirebase, getTableDocRef, auth } from '/services/firebaseService.js';
import { fetchWooCommerceProducts, fetchWooCommerceCategories } from '/services/wooCommerceService.js';
import { formatCurrency } from '/utils.js'; // Importar utils aqui se necessário globalmente

// Importações dos Controllers (para chamar funções `init` e `render`)
import { initPanelController, loadOpenTables, renderTableFilters } from '/controllers/panelController.js';
import { initOrderController, renderOrderScreen } from '/controllers/orderController.js';
import { initPaymentController, renderPaymentSummary, deletePayment, handleMassActionRequest } from '/controllers/paymentController.js'; // Importa deletePayment
import { initManagerController, openManagerAuthModal } from '/controllers/managerController.js';

// --- VARIÁVEIS DE ESTADO GLOBAL ---
export const screens = {
    'loginScreen': 0,
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
export let userRole = 'anonymous';
export let userId = null;
export let unsubscribeTable = null;


// --- ELEMENTOS UI GLOBAIS ---
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

export const hideStatus = () => {
    if (statusScreen) statusScreen.style.display = 'none';
};

const showLoginScreen = () => {
    hideStatus();
    if (mainContent) mainContent.style.display = 'none';
    if (mainHeader) mainHeader.style.display = 'none';
    if (appContainer) appContainer.style.transform = `translateX(0vw)`;
    document.body.classList.add('bg-dark-bg');

    // Limpa campos ao mostrar login
    if(loginEmailInput) loginEmailInput.value = '';
    if(loginPasswordInput) loginPasswordInput.value = '';
    if(loginErrorMsg) loginErrorMsg.style.display = 'none';
};

const hideLoginScreen = () => {
    if (mainContent) mainContent.style.display = 'block';
    if (mainHeader) mainHeader.style.display = 'flex';

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
    if (currentTableId && screenId === 'panelScreen') {
        saveSelectedItemsToFirebase(currentTableId, selectedItems);
    }

    if (screenId === 'panelScreen' && currentTableId && unsubscribeTable) {
        unsubscribeTable();
        unsubscribeTable = null;
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
window.goToScreen = goToScreen; // Expor globalmente para onclicks remanescentes

// Expor funções globais necessárias
window.openManagerAuthModal = openManagerAuthModal;
window.deletePayment = deletePayment; // Expor a função do controller
window.handleMassActionRequest = handleMassActionRequest; // Expor a função do controller

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
             console.warn(`Listener: Mesa ${tableId} não encontrada/fechada.`);
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
    // A lógica do modal permanece aqui ou pode ser movida para paymentController se preferir
    const nfeModal = document.getElementById('nfeModal');
    if (!nfeModal) return;
    nfeModal.innerHTML = `
        <div class="bg-dark-card border border-gray-600 p-6 rounded-xl shadow-2xl w-full max-w-sm">
            {/* ... Conteúdo do modal NF-e com estilo dark ... */}
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
        fetchWooCommerceProducts(/* Callback opcional, renderMenu é chamado por renderOrderScreen */)
            .then(() => console.log("[INIT] Produtos WooCommerce carregados."))
            .catch(e => console.error("[INIT ERROR] Falha ao carregar produtos Woo:", e));
        fetchWooCommerceCategories(/* Callback opcional, renderTableFilters já chamado */)
            .then(() => console.log("[INIT] Categorias WooCommerce carregadas."))
            .catch(e => console.error("[INIT ERROR] Falha ao carregar categorias Woo:", e));

        hideStatus();
        hideLoginScreen(); // Mostra header/main
        console.log("[INIT] UI principal visível.");

        loadOpenTables(); // Configura listener das mesas
        console.log("[INIT] Listener de mesas configurado.");

        goToScreen('panelScreen'); // Vai para o painel de mesas
        console.log("[INIT] Navegação inicial para panelScreen.");

    } catch (error) {
        console.error("[INIT] Erro CRÍTICO durante initStaffApp:", error);
        alert("Erro grave ao iniciar. Verifique o console.");
        showLoginScreen();
    }
};

// --- LÓGICA DE AUTH/LOGIN ---
const authenticateStaff = (email, password) => {
    const creds = STAFF_CREDENTIALS[email];
    return (creds && creds.password === password && creds.role !== 'client') ? creds : null;
};

const handleStaffLogin = async () => {
    if (!loginBtn || !loginEmailInput || !loginPasswordInput) return;
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

            await initStaffApp(); // Chama a inicialização principal APÓS definir userId
            console.log("[LOGIN] initStaffApp chamado com sucesso.");

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

    showLoginScreen(); // Mostra a tela de login
    document.getElementById('user-id-display').textContent = 'Usuário ID: Carregando...';
    console.log("[LOGOUT] Concluído.");
};
window.handleLogout = handleLogout; // Expor globalmente


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

        // Mapeia elementos do Login
        loginBtn = document.getElementById('loginBtn');
        loginEmailInput = document.getElementById('loginEmail');
        loginPasswordInput = document.getElementById('loginPassword');
        loginErrorMsg = document.getElementById('loginErrorMsg');
        console.log("[INIT] Elementos de Login mapeados.");

        // Listener de Autenticação Firebase
        onAuthStateChanged(authInstance, (user) => {
            console.log("[AUTH] State Changed:", user ? `User UID: ${user.uid}` : 'No user');
            // Se não há usuário E o userRole não é de staff (login local ainda não ocorreu ou falhou), mostra login.
            if (!user && userRole !== 'gerente' && userRole !== 'garcom') {
                 console.log("[AUTH] Nenhum usuário logado no Firebase & userRole não é staff -> showLoginScreen()");
                 showLoginScreen();
            }
            // Se JÁ existe um usuário Firebase OU o userRole já é de staff (login local com mock ID feito),
            // assume-se que o app deve estar inicializado ou em processo. initStaffApp é chamado APÓS login local.
        });
        console.log("[INIT] Listener AuthStateChanged configurado.");

        // Adiciona Listener ao Botão de Login
        if (loginBtn) {
            loginBtn.addEventListener('click', handleStaffLogin);
            console.log("[INIT] Listener do botão Login adicionado.");
        } else {
             console.error("[INIT] Botão de Login não encontrado!");
        }

        // Inicializa os Controllers (eles adicionarão seus próprios listeners)
        console.log("[INIT] Chamando inicializadores dos controllers...");
        initPanelController();
        initOrderController();
        initPaymentController();
        initManagerController();
        console.log("[INIT] Inicializadores dos controllers chamados.");

        // Listener para NF-e (mantido aqui por simplicidade, poderia ir para paymentController)
        const openNfeModalBtn = document.getElementById('openNfeModalBtn');
        if (openNfeModalBtn) openNfeModalBtn.addEventListener('click', window.openNfeModal);


    } catch (e) {
        console.error("Erro CRÍTICO na inicialização principal (DOMContentLoaded):", e);
        alert("Falha grave ao carregar o PDV. Verifique o console.");
        if(statusScreen) statusScreen.innerHTML = '<h2 class="text-red-600 font-bold">Erro de Inicialização</h2>';
    }
    console.log("[INIT] DOMContentLoaded finalizado.");
}); // FIM DO DOMContentLoaded
