// --- APP.JS ---
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut, signInAnonymously } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, serverTimestamp, doc, setDoc, updateDoc, getDoc, onSnapshot, writeBatch, arrayRemove, arrayUnion } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// Importações dos Serviços e Utils
import { initializeFirebase, saveSelectedItemsToFirebase, getTableDocRef, auth, db } from '/services/firebaseService.js'; // Importa 'db'
import { fetchWooCommerceProducts, fetchWooCommerceCategories } from '/services/wooCommerceService.js';
import { formatCurrency, formatElapsedTime } from '/utils.js';

// Importações dos Controllers
// CORREÇÃO: Removido 'handleTableTransferConfirmed' da importação do panelController
import { loadOpenTables, renderTableFilters, handleAbrirMesa, handleSearchTable, initPanelController } from '/controllers/panelController.js';
import { renderMenu, renderOrderScreen, increaseLocalItemQuantity, decreaseLocalItemQuantity, openObsModalForGroup, initOrderController, handleSendSelectedItems } from '/controllers/orderController.js';
import {
    renderPaymentSummary, deletePayment, handleMassActionRequest,
    initPaymentController, handleFinalizeOrder,
    handleMassDeleteConfirmed, executeDeletePayment, // Funções de ação
    openTableTransferModal // handleConfirmTableTransfer é LOCAL aqui
} from '/controllers/paymentController.js';
import { initManagerController, handleGerencialAction } from '/controllers/managerController.js';

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
const STAFF_CREDENTIALS = {
    'agencia@fatormd.com': { password: '1234', role: 'gerente', name: 'Fmd' },
    'garcom@fator.com': { password: '1234', role: 'garcom', name: 'Mock Garçom' },
};
const MANAGER_PASSWORD = '1234';

export let currentTableId = null;
export let selectedItems = [];
export let currentOrderSnapshot = null;
export let userRole = 'anonymous';
export let userId = null;
export let unsubscribeTable = null;


// --- ELEMENTOS UI ---
let statusScreen, mainContent, appContainer, loginScreen, mainHeader;
let loginBtn, loginEmailInput, loginPasswordInput, loginErrorMsg;


// --- FUNÇÕES CORE E ROTIAMENTO ---

export const hideStatus = () => {
    if (!statusScreen) statusScreen = document.getElementById('statusScreen');
    if (statusScreen) {
        statusScreen.style.cssText = 'display: none !important';
        // console.log("[UI] hideStatus executado."); // Removido log excessivo
    } else {
        console.error("[UI] Elemento statusScreen não encontrado em hideStatus.");
    }
};

const showLoginScreen = () => {
    console.log("[UI] Chamando showLoginScreen...");
    if (!statusScreen) statusScreen = document.getElementById('statusScreen');
    if (!mainContent) mainContent = document.getElementById('mainContent');
    if (!mainHeader) mainHeader = document.getElementById('mainHeader');
    if (!appContainer) appContainer = document.getElementById('appContainer');
    if (!loginEmailInput) loginEmailInput = document.getElementById('loginEmail');
    if (!loginPasswordInput) loginPasswordInput = document.getElementById('loginPassword');
    if (!loginErrorMsg) loginErrorMsg = document.getElementById('loginErrorMsg');

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

const hideLoginScreen = () => {
    if (!mainHeader) mainHeader = document.getElementById('mainHeader');
    if (!mainContent) mainContent = document.getElementById('mainContent');
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

export const goToScreen = (screenId) => {
    if (!appContainer) appContainer = document.getElementById('appContainer');
    if (!mainContent) mainContent = document.getElementById('mainContent');

    // Salva os itens locais no Firebase ANTES de navegar para o painel
    if (currentTableId && screenId === 'panelScreen') {
        const currentTransform = appContainer?.style.transform || '';
        const currentScreenKey = Object.keys(screens).find(key => screens[key] * -100 + 'vw' === currentTransform.replace(/translateX\((.*?)\)/, '$1'));
        if (currentScreenKey === 'orderScreen' || currentScreenKey === 'paymentScreen') {
             console.log(`[NAV] Salvando itens da mesa ${currentTableId} ao sair de ${currentScreenKey}`);
            saveSelectedItemsToFirebase(currentTableId, selectedItems);
        }
    }

    // Desliga o listener e limpa o estado local DEPOIS de salvar
    if ((screenId === 'panelScreen' || screenId === 'loginScreen') && currentTableId && unsubscribeTable) {
        console.log(`[NAV] Desinscrevendo do listener da mesa ${currentTableId}`);
        unsubscribeTable(); unsubscribeTable = null;
        currentTableId = null; currentOrderSnapshot = null; selectedItems.length = 0; // Limpa o array local

        // Reseta os títulos ao sair da mesa
        const currentTableNumEl = document.getElementById('current-table-number');
        const paymentTableNumEl = document.getElementById('payment-table-number');
        const orderScreenTableNumEl = document.getElementById('order-screen-table-number');

        if(currentTableNumEl) currentTableNumEl.textContent = 'Fator MD'; // Reseta para o nome do sistema
        if(paymentTableNumEl) paymentTableNumEl.textContent = `Mesa`;
        if(orderScreenTableNumEl) orderScreenTableNumEl.textContent = 'Pedido'; // Reseta para o padrão
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

// Lógica de Transferência (com confirmação para fechar origem)
export const handleTableTransferConfirmed = async (originTableId, targetTableId, itemsToTransfer, newDiners = 0, newSector = '') => {
    console.log(`[APP] handleTableTransferConfirmed: origin=${originTableId}, target=${targetTableId}, items=${itemsToTransfer.length}`);
    if (!originTableId || !targetTableId || itemsToTransfer.length === 0) {
        alert("Erro: Dados de transferência incompletos.");
        return;
    }

    const originTableRef = getTableDocRef(originTableId);
    const targetTableRef = getTableDocRef(targetTableId);
    const dbInstance = db;
    if (!dbInstance) {
        console.error("DB não inicializado!");
        alert("Erro de conexão. Tente novamente.");
        return;
    }

    const batch = writeBatch(dbInstance);

    try {
        const originSnap = await getDoc(originTableRef);
        if (!originSnap.exists()) {
            alert(`Erro: Mesa de origem ${originTableId} não encontrada.`);
            return;
        }
        const originData = originSnap.data();
        const originSentItems = originData?.sentItems || [];

        // Compara os itens a serem transferidos com os itens existentes na mesa de origem
        let allOriginItemsWillBeTransferred = false;
        if (originSentItems.length > 0 && originSentItems.length === itemsToTransfer.length) {
            // Verifica se todos os sentItems estão na lista itemsToTransfer (comparação mais robusta)
             const originItemKeys = originSentItems.map(item => `${item.id}-${item.note || ''}-${item.sentAt || ''}`).sort();
             const transferItemKeys = itemsToTransfer.map(item => `${item.id}-${item.note || ''}-${item.sentAt || ''}`).sort();
             allOriginItemsWillBeTransferred = JSON.stringify(originItemKeys) === JSON.stringify(transferItemKeys);
        }
        console.log("[APP] All origin sent items will be transferred:", allOriginItemsWillBeTransferred);


        let closeOriginTableConfirmed = false;
        if (allOriginItemsWillBeTransferred) {
            closeOriginTableConfirmed = confirm(`Todos os ${itemsToTransfer.length} item(ns) serão transferidos da Mesa ${originTableId}. Deseja FECHAR a mesa de origem após a transferência?`);
            console.log("[APP] Close origin table confirmation:", closeOriginTableConfirmed);
        }

        const targetSnap = await getDoc(targetTableRef);
        const targetTableIsOpen = targetSnap.exists() && targetSnap.data().status?.toLowerCase() === 'open';

        // 1. Abertura/Setup da Mesa de Destino
        if (!targetTableIsOpen) {
             if (!newDiners || !newSector) { alert("Erro: Mesa destino fechada. Pessoas e setor obrigatórios."); return; }
             console.log(`[APP] Abrindo Mesa ${targetTableId} para transferência.`);
             batch.set(targetTableRef, { tableNumber: parseInt(targetTableId), diners: newDiners, sector: newSector, status: 'open', createdAt: serverTimestamp(), total: 0, sentItems: [], payments: [], serviceTaxApplied: true, selectedItems: [] });
        }

        // 2. Transferência dos Itens
        const transferValue = itemsToTransfer.reduce((sum, item) => sum + (item.price || 0), 0);
        const originCurrentTotal = originData?.total || 0;
        const originNewTotal = Math.max(0, originCurrentTotal - transferValue);
        itemsToTransfer.forEach(item => { batch.update(originTableRef, { sentItems: arrayRemove(item) }); });
        batch.update(originTableRef, { total: originNewTotal });

        // 3. Adiciona Fechamento da Mesa de Origem se confirmado
        if (closeOriginTableConfirmed) {
            batch.update(originTableRef, { status: 'closed' });
            console.log("[APP] Origin table status set to 'closed' in batch.");
        }

        // 4. Atualiza Mesa de Destino
        const targetData = targetTableIsOpen ? targetSnap.data() : { total: 0 };
        const targetNewTotal = (targetData.total || 0) + transferValue;
        batch.update(targetTableRef, { sentItems: arrayUnion(...itemsToTransfer), total: targetNewTotal });

        console.log("[APP] Committing transfer batch...");
        await batch.commit();
        console.log("[APP] Transfer batch committed successfully.");

        alert(`Sucesso! ${itemsToTransfer.length} item(s) transferidos da Mesa ${originTableId} para ${targetTableId}.${closeOriginTableConfirmed ? ' A mesa de origem foi fechada.' : ''}`);

        console.log("[APP] Navigating to panelScreen after transfer.");
        goToScreen('panelScreen'); // Navega para o painel após sucesso

    } catch (e) {
        console.error("Erro CRÍTICO na transferência de mesa:", e);
        alert(`Falha CRÍTICA na transferência dos itens: ${e.message}. Verifique o console.`);
         const modal = document.getElementById('tableTransferModal');
         if(modal) {
            const confirmBtn = modal.querySelector('#confirmTableTransferBtn');
            if(confirmBtn) confirmBtn.disabled = false; // Reabilita botão do modal em caso de erro
         }
    }
};
// Expor globalmente para o paymentController chamar
window.handleTableTransferConfirmed = handleTableTransferConfirmed;


// MODAL DE AUTENTICAÇÃO GLOBAL
window.openManagerAuthModal = (action, payload = null) => {
    const managerModal = document.getElementById('managerModal');
    if (!managerModal) { console.error("Modal Gerente não encontrado!"); return; }

    managerModal.innerHTML = `
        <div class="bg-dark-card border border-gray-600 p-6 rounded-xl shadow-2xl w-full max-w-sm">
            <h3 class="text-xl font-bold mb-4 text-red-400">Ação Gerencial Necessária</h3>
            <p class="text-base mb-3 text-dark-text">Insira a senha do gerente para prosseguir.</p>
            <input type="password" id="managerPasswordInput" placeholder="Senha" class="w-full p-3 bg-dark-input border border-gray-600 rounded-lg text-dark-text placeholder-dark-placeholder focus:ring-red-500 focus:border-red-500 text-base" maxlength="4" autocomplete="off">
            <div class="flex justify-end space-x-3 mt-4">
                <button class="px-4 py-3 bg-gray-600 text-gray-200 rounded-lg hover:bg-gray-500 transition text-base" onclick="document.getElementById('managerModal').style.display='none'">Cancelar</button>
                <button id="authManagerBtn" class="px-4 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 transition text-base">Autenticar</button>
            </div>
        </div>
    `;
    managerModal.style.display = 'flex';
    const input = document.getElementById('managerPasswordInput');
    const authBtn = document.getElementById('authManagerBtn');

    if(input) input.focus();

    if(authBtn && input) {
        const handleAuthClick = () => {
            if (input.value === MANAGER_PASSWORD) {
                managerModal.style.display = 'none';
                console.log(`[AUTH MODAL] Ação '${action}' autorizada.`);
                switch (action) {
                    case 'executeMassDelete':
                        handleMassDeleteConfirmed(); // Chama função importada do paymentController
                        break;
                    case 'executeMassTransfer':
                        openTableTransferModal(); // Chama função importada do paymentController
                        break;
                    case 'deletePayment':
                        executeDeletePayment(payload); // Chama função importada do paymentController
                        break;
                    case 'goToManagerPanel': // Ação do managerController
                    // Adicione outros cases para ações do manager aqui
                    default: // Trata ações do managerController por padrão
                        handleGerencialAction(action, payload); // Chama função importada do managerController
                        break;
                }
            } else {
                alert("Senha incorreta.");
                input.value = '';
                input.focus();
            }
        };
        authBtn.onclick = handleAuthClick; // Adiciona listener de clique
        input.onkeydown = (e) => { if (e.key === 'Enter') handleAuthClick(); }; // Adiciona listener de Enter
    }
};

// Expor funções globais necessárias dos controllers
window.deletePayment = deletePayment; // Exposto para paymentController (onclick)
window.handleMassActionRequest = handleMassActionRequest; // Exposto para paymentController
window.openTableTransferModal = openTableTransferModal; // Exposto para paymentController
window.openKdsStatusModal = (id) => alert(`Abrir status KDS ${id} (DEV)`);
// Funções de item/obs (expostas para orderController onclicks)
window.increaseLocalItemQuantity = increaseLocalItemQuantity;
window.decreaseLocalItemQuantity = decreaseLocalItemQuantity;
window.openObsModalForGroup = openObsModalForGroup;


// Listener da Mesa
export const setTableListener = (tableId) => {
    if (unsubscribeTable) {
        console.log(`[APP] Unsubscribing from previous table listener.`);
        unsubscribeTable();
    }
    console.log(`[APP] Setting up listener for table ${tableId}`);
    const tableRef = getTableDocRef(tableId);
    unsubscribeTable = onSnapshot(tableRef, (docSnapshot) => {
        if (docSnapshot.exists()) {
            // console.log(`[APP] Snapshot received for table ${tableId}`); // Log frequente, comentado
            currentOrderSnapshot = docSnapshot.data();
            const firebaseSelectedItems = currentOrderSnapshot.selectedItems || [];

            // Sincroniza o array local 'selectedItems' com o Firebase
            if (JSON.stringify(firebaseSelectedItems) !== JSON.stringify(selectedItems)) {
                 console.log("[APP] Syncing local 'selectedItems' with Firebase data.");
                 selectedItems.length = 0;
                 selectedItems.push(...firebaseSelectedItems);
            }

            // Renderiza as telas relevantes com os dados atualizados
            renderOrderScreen(currentOrderSnapshot); // Atualiza tela de pedido
            renderPaymentSummary(currentTableId, currentOrderSnapshot); // Atualiza tela de pagamento

        } else {
             console.warn(`[APP] Listener Warning: Table ${tableId} does not exist or was closed.`);
             if (currentTableId === tableId) { // Só age se for a mesa ativa
                 alert(`A Mesa ${tableId} foi fechada ou removida.`);
                 if (unsubscribeTable) unsubscribeTable(); unsubscribeTable = null;
                 currentTableId = null; currentOrderSnapshot = null; selectedItems.length = 0;
                 goToScreen('panelScreen'); // Volta ao painel se a mesa ativa sumir
             }
        }
    }, (error) => {
        console.error(`[APP] Error in table listener for ${tableId}:`, error);
         if (unsubscribeTable) unsubscribeTable(); unsubscribeTable = null;
         alert(`Erro ao sincronizar com a mesa ${tableId}. Voltando ao painel.`);
         goToScreen('panelScreen');
    });
};

// Define a mesa atual e inicia o listener
export const setCurrentTable = (tableId) => {
    if (currentTableId === tableId && unsubscribeTable) {
        console.log(`[APP] Listener for table ${tableId} already active.`);
        // Mesmo se ativo, chama setTableListener para garantir a carga inicial caso tenha voltado do painel
    }

    currentTableId = tableId;
    console.log(`[APP] Setting current table to ${tableId}`);

    // Atualiza os títulos nas telas relevantes
    // const currentTableNumEl = document.getElementById('current-table-number'); // Header fica Fator MD
    const paymentTableNumEl = document.getElementById('payment-table-number');
    const orderScreenTableNumEl = document.getElementById('order-screen-table-number');

    if(paymentTableNumEl) paymentTableNumEl.textContent = `Mesa ${tableId}`;
    if(orderScreenTableNumEl) orderScreenTableNumEl.textContent = `Mesa ${tableId}`;

    // Inicia o listener (ou reinicia para garantir carga inicial)
    setTableListener(tableId);
};

// Seleciona a mesa, garante menu, inicia listener e navega
export const selectTableAndStartListener = async (tableId) => {
    console.log(`[APP] Selecting table ${tableId} and starting listener.`);
    try {
        await fetchWooCommerceProducts(/* Callback opcional */); // Garante que produtos estão carregados
        setCurrentTable(tableId); // Define a mesa e inicia o listener (que carrega selectedItems)
        goToScreen('orderScreen'); // Navega para a tela de pedido
    } catch (error) {
        console.error(`[APP] Error selecting table ${tableId}:`, error);
        alert("Erro ao abrir a mesa. Verifique a conexão com a internet ou o servidor.");
    }
};
window.selectTableAndStartListener = selectTableAndStartListener; // Exposto para panelController onclicks

// NF-e Placeholder
window.openNfeModal = () => { alert("Abrir modal NF-e (DEV)"); };


// --- INICIALIZAÇÃO APP STAFF ---
const initStaffApp = async () => {
    console.log("[INIT] Initializing staff application...");
    try {
        renderTableFilters(); // Renderiza filtros de setor primeiro
        console.log("[INIT] Sector filters rendered.");

        // Carrega produtos e categorias em paralelo, mas não bloqueia a UI
        fetchWooCommerceProducts().catch(e => console.error("[INIT ERROR] Failed to load WooCommerce products:", e));
        fetchWooCommerceCategories().catch(e => console.error("[INIT ERROR] Failed to load WooCommerce categories:", e));

        hideStatus(); // Esconde tela de loading
        hideLoginScreen(); // Mostra header/main content
        console.log("[INIT] Main UI visible.");

        loadOpenTables(); // Configura listener para mesas abertas
        console.log("[INIT] Open tables listener configured.");

        // Não navega aqui, deixa o usuário no painel inicialmente
        // goToScreen('panelScreen'); // Removido - já deve estar no painel
        console.log("[INIT] Staff app initialized, user is on panel screen.");

    } catch (error) {
        console.error("[INIT] CRITICAL error during initStaffApp:", error);
        alert("Erro grave ao iniciar o aplicativo. Verifique o console.");
        showLoginScreen(); // Volta para login em caso de erro grave
    }
};

// --- LÓGICA DE AUTH/LOGIN ---
const authenticateStaff = (email, password) => {
    const creds = STAFF_CREDENTIALS[email];
    return (creds && creds.password === password && creds.role !== 'client') ? creds : null;
};

const handleStaffLogin = async () => {
    loginBtn = document.getElementById('loginBtn');
    loginEmailInput = document.getElementById('loginEmail');
    loginPasswordInput = document.getElementById('loginPassword');
    loginErrorMsg = document.getElementById('loginErrorMsg');

    if (!loginBtn || !loginEmailInput || !loginPasswordInput) {
         console.error("[LOGIN] Login form elements not found!");
         return;
    }
    if (loginErrorMsg) loginErrorMsg.style.display = 'none';
    loginBtn.disabled = true; loginBtn.textContent = 'Entrando...';

    const email = loginEmailInput.value.trim();
    const password = loginPasswordInput.value.trim();

    console.log(`[LOGIN] Attempting local authentication for ${email}...`);
    const staffData = authenticateStaff(email, password);

    if (staffData) {
        console.log(`[LOGIN] Local authentication successful. Role: ${staffData.role}`);
        userRole = staffData.role; // Define a role global
        try {
            const authInstance = auth;
            if (!authInstance) throw new Error("Firebase Auth service not available.");
            console.log("[LOGIN] Attempting Firebase anonymous sign-in...");
            try {
                // Tenta signInAnonymously para obter um UID, mas a role vem do login local
                const userCredential = await signInAnonymously(authInstance);
                userId = userCredential.user.uid;
                console.log(`[LOGIN] Firebase sign-in successful. UID: ${userId}`);
            } catch (authError) {
                // Se Firebase falhar, usa um ID mock, mas continua
                console.warn("[LOGIN] Firebase anonymous sign-in failed. Using Mock ID.", authError);
                userId = `mock_${userRole}_${Date.now()}`;
            }

            const userName = staffData.name || userRole; // Usa o nome definido ou a role
            document.getElementById('user-id-display').textContent = `Usuário: ${userName} | ${userRole.toUpperCase()}`;
            console.log("[LOGIN] User info display updated.");

            console.log("[LOGIN] Calling initStaffApp...");
            await initStaffApp(); // Inicia a aplicação principal para staff
            console.log("[LOGIN] initStaffApp completed.");

        } catch (error) {
             console.error("[LOGIN] Error after local authentication:", error);
             alert(`Erro ao iniciar sessão: ${error.message}.`);
             showLoginScreen(); // Garante que volte para login
             if(loginErrorMsg) { loginErrorMsg.textContent = `Erro: ${error.message}`; loginErrorMsg.style.display = 'block'; }
        }
    } else {
        console.log(`[LOGIN] Invalid credentials for ${email}.`);
        if(loginErrorMsg) { loginErrorMsg.textContent = 'E-mail ou senha inválidos.'; loginErrorMsg.style.display = 'block'; }
    }
    // Reabilita botão de login independentemente do resultado
    if (loginBtn) { loginBtn.disabled = false; loginBtn.textContent = 'Entrar'; }
    console.log("[LOGIN] handleStaffLogin finished.");
};

const handleLogout = () => {
    console.log("[LOGOUT] Initiating logout...");
    const authInstance = auth;
    if (authInstance && authInstance.currentUser && (!userId || !userId.startsWith('mock_'))) {
        console.log("[LOGOUT] Signing out from Firebase...");
        signOut(authInstance).catch(e => console.error("Error during Firebase sign out:", e));
    } else {
        console.log("[LOGOUT] Skipping Firebase sign out (mock user or already signed out).");
    }
    // Reseta estado global
    userId = null; currentTableId = null; selectedItems.length = 0; userRole = 'anonymous'; currentOrderSnapshot = null;
    if (unsubscribeTable) {
         console.log("[LOGOUT] Unsubscribing from table listener.");
         unsubscribeTable();
         unsubscribeTable = null;
    }

    showLoginScreen(); // Mostra tela de login
    document.getElementById('user-id-display').textContent = 'Usuário ID: Desconectado';
    console.log("[LOGOUT] Logout completed.");
};
window.handleLogout = handleLogout;


// --- INICIALIZAÇÃO PRINCIPAL ---
document.addEventListener('DOMContentLoaded', () => {
    console.log("[INIT] DOMContentLoaded event fired.");

    const firebaseConfig = FIREBASE_CONFIG; // Usa a const definida no topo

    try {
        console.log("[INIT] Firebase config loaded.");

        // Inicializa Firebase App e Serviços
        const app = initializeApp(firebaseConfig);
        const dbInstance = getFirestore(app);
        const authInstance = getAuth(app);
        initializeFirebase(dbInstance, authInstance, APP_ID); // Passa instâncias para firebaseService
        console.log("[INIT] Firebase App and Services initialized.");

        // Mapeia elementos Globais e de Login
        statusScreen = document.getElementById('statusScreen');
        mainContent = document.getElementById('mainContent');
        appContainer = document.getElementById('appContainer');
        mainHeader = document.getElementById('mainHeader');
        loginBtn = document.getElementById('loginBtn');
        loginEmailInput = document.getElementById('loginEmail');
        loginPasswordInput = document.getElementById('loginPassword');
        loginErrorMsg = document.getElementById('loginErrorMsg');
        console.log("[INIT] Global and Login UI elements mapped.");

        // Listener de Autenticação Firebase
        onAuthStateChanged(authInstance, async (user) => {
            console.log("[AUTH] Auth State Changed:", user ? `User detected (UID: ${user.uid})` : 'No user detected');
            if (user) {
                // Se um usuário Firebase existe E JÁ temos uma role local (garcom/gerente)
                // significa que o login local já aconteceu, então iniciamos o app.
                // Se não tivermos role, forçamos logout para evitar estado inconsistente.
                userId = user.uid; // Atualiza userId mesmo se for forçar logout
                if (userRole === 'gerente' || userRole === 'garcom') {
                    console.log(`[AUTH] User detected with valid local role '${userRole}'. Initializing staff app...`);
                    // Tenta pegar o nome do staff logado, se possível
                    const loggedInEmail = loginEmailInput?.value?.trim();
                    const userName = loggedInEmail ? (STAFF_CREDENTIALS[loggedInEmail]?.name || userRole) : userRole;
                    document.getElementById('user-id-display').textContent = `Usuário: ${userName} | ${userRole.toUpperCase()}`;
                    await initStaffApp();
                } else {
                    // Usuário Firebase existe, mas não passou pelo login local -> força logout
                    console.warn("[AUTH] Firebase user exists, but local role is 'anonymous'. Forcing logout to ensure proper login flow.");
                    handleLogout();
                }
            } else if (userRole !== 'gerente' && userRole !== 'garcom') {
                 // Sem usuário Firebase E sem role local -> mostra login
                 console.log("[AUTH] No Firebase user and no local role. Showing login screen.");
                 showLoginScreen();
            } else {
                // Sem usuário Firebase, MAS com role local (ex: após logout manual) -> mostra login
                 console.log("[AUTH] No Firebase user but local role exists. Showing login screen.");
                 showLoginScreen();
            }
        });
        console.log("[INIT] Firebase AuthStateChanged listener configured.");

        // Adiciona Listener ao Botão de Login
        if (loginBtn) {
            loginBtn.addEventListener('click', handleStaffLogin);
            console.log("[INIT] Login button listener added.");
        } else {
             console.error("[INIT] CRITICAL: Login button (loginBtn) not found!");
             // Mostra um erro na tela se o botão de login não for encontrado
             if(statusScreen) statusScreen.innerHTML = '<h2 class="text-red-600 font-bold p-4">Erro Crítico: Botão de Login não encontrado. Recarregue a página.</h2>';
             hideStatus(); // Esconde o spinner
             return; // Aborta inicialização se o login não puder funcionar
        }

        // Inicializa os Controllers (chama as funções init de cada um)
        console.log("[INIT] Calling controller initializers...");
        try {
            initPanelController();
            initOrderController();
            initPaymentController(); // Inicializa o paymentController AQUI
            initManagerController();
            console.log("[INIT] Controller initializers called successfully.");
        } catch (controllerError) {
             console.error("[INIT] Error initializing controllers:", controllerError);
             alert(`Erro ao inicializar módulos: ${controllerError.message}. Verifique o console.`);
             // Pode ser necessário mostrar a tela de login ou uma tela de erro aqui
        }


        // Outros Listeners Globais (Header, etc.) - Adiciona DEPOIS que os controllers foram inicializados
        const openManagerPanelBtn = document.getElementById('openManagerPanelBtn');
        const logoutBtnHeader = document.getElementById('logoutBtnHeader');
        // O openNfeModalBtn é tratado dentro do initPaymentController agora

        if (openManagerPanelBtn) openManagerPanelBtn.addEventListener('click', () => { window.openManagerAuthModal('goToManagerPanel'); });
        if (logoutBtnHeader) logoutBtnHeader.addEventListener('click', handleLogout);

        console.log("[INIT] Remaining global listeners added.");

    } catch (e) {
        console.error("CRITICAL error during DOMContentLoaded initialization:", e);
        alert(`Falha grave ao carregar o PDV: ${e.message}. Verifique o console.`);
        if(statusScreen) statusScreen.innerHTML = `<h2 class="text-red-600 font-bold p-4">Erro Grave de Inicialização: ${e.message}</h2>`;
        hideStatus();
        return; // Aborta se a inicialização principal falhar
    }
    console.log("[INIT] DOMContentLoaded initialization finished successfully.");
}); // FIM DO DOMContentLoaded
