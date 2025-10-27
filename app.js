// --- APP.JS ---
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut, signInAnonymously } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, serverTimestamp, doc, setDoc, updateDoc, getDoc, onSnapshot, writeBatch, arrayRemove, arrayUnion } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
// NOVO IMPORT
import { getFunctions } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-functions.js";


// Importações dos Serviços e Utils
// 'functions' será importado do firebaseService agora
import { initializeFirebase, saveSelectedItemsToFirebase, getTableDocRef, auth, db, functions } from '/services/firebaseService.js';
import { fetchWooCommerceProducts, fetchWooCommerceCategories } from '/services/wooCommerceService.js';
import { formatCurrency, formatElapsedTime } from '/utils.js';

// Importações dos Controllers
import { loadOpenTables, renderTableFilters, handleAbrirMesa, handleSearchTable, initPanelController } from '/controllers/panelController.js';
import { renderMenu, renderOrderScreen, increaseLocalItemQuantity, decreaseLocalItemQuantity, openObsModalForGroup, initOrderController, handleSendSelectedItems } from '/controllers/orderController.js';
import {
    renderPaymentSummary, deletePayment, handleMassActionRequest,
    initPaymentController, handleFinalizeOrder,
    handleMassDeleteConfirmed, executeDeletePayment, // Funções de ação
    openTableTransferModal, handleConfirmTableTransfer // Funções de UI
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
        console.log("[UI] hideStatus executado.");
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

        // --- INÍCIO DA CORREÇÃO ---
        // Reseta os títulos ao sair da mesa
        const currentTableNumEl = document.getElementById('current-table-number');
        const paymentTableNumEl = document.getElementById('payment-table-number');
        const orderScreenTableNumEl = document.getElementById('order-screen-table-number'); // Novo

        if(currentTableNumEl) currentTableNumEl.textContent = 'Fator MD'; // Reseta para o nome do sistema
        if(paymentTableNumEl) paymentTableNumEl.textContent = `Mesa`;
        if(orderScreenTableNumEl) orderScreenTableNumEl.textContent = 'Pedido'; // Reseta para o padrão
        // --- FIM DA CORREÇÃO ---
        
        // --- CÓDIGO DE RESET REMOVIDO DAQUI ---
    }

    // --- CORREÇÃO DEFINITIVA ---
    // Se a navegação é PARA o painel (de qualquer lugar, a qualquer momento),
    // garante que o botão de finalizar seja resetado.
    if (screenId === 'panelScreen') {
        const finalizeBtn = document.getElementById('finalizeOrderBtn');
        // Só reseta se o botão existir E não estiver no estado padrão (para evitar trabalho desnecessário)
        if (finalizeBtn && !finalizeBtn.innerHTML.includes('fa-check-circle')) {
            console.log("[NAV] Resetando botão 'Finalizar Conta' ao voltar para o painel.");
            finalizeBtn.disabled = true;
            finalizeBtn.innerHTML = '<i class="fas fa-check-circle"></i> FINALIZAR CONTA';
            finalizeBtn.classList.add('opacity-50', 'cursor-not-allowed');
        }
    }
    // --- FIM DA CORREÇÃO DEFINITIVA ---

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

export const handleTableTransferConfirmed = async (originTableId, targetTableId, itemsToTransfer, newDiners = 0, newSector = '') => {
    if (!originTableId || !targetTableId || itemsToTransfer.length === 0) {
        alert("Erro: Dados de transferência incompletos.");
        return;
    }

    const originTableRef = getTableDocRef(originTableId);
    const targetTableRef = getTableDocRef(targetTableId);

    const dbInstance = db; // Usa o 'db' importado do firebaseService
    if (!dbInstance) {
        console.error("DB não inicializado!");
        alert("Erro de conexão. Tente novamente.");
        return;
    }
    const batch = writeBatch(dbInstance);

    try {
        const targetSnap = await getDoc(targetTableRef);
        const targetTableIsOpen = targetSnap.exists() && targetSnap.data().status?.toLowerCase() === 'open';

        // 1. Abertura/Setup da Mesa de Destino
        if (!targetTableIsOpen) {
            if (!newDiners || !newSector) {
                alert("Erro: Mesa destino fechada. Pessoas e setor obrigatórios.");
                return;
            }
            console.log(`[APP] Abrindo Mesa ${targetTableId} para transferência.`);
            batch.set(targetTableRef, {
                tableNumber: parseInt(targetTableId), diners: newDiners, sector: newSector, status: 'open',
                createdAt: serverTimestamp(), total: 0, sentItems: [], payments: [], serviceTaxApplied: true, selectedItems: []
            });
        }

        // 2. Transferência dos Itens
        const transferValue = itemsToTransfer.reduce((sum, item) => sum + (item.price || 0), 0);
        const originCurrentTotal = currentOrderSnapshot?.total || 0; // Usa snapshot global
        const originNewTotal = Math.max(0, originCurrentTotal - transferValue);
        itemsToTransfer.forEach(item => {
            batch.update(originTableRef, { sentItems: arrayRemove(item) });
        });
        batch.update(originTableRef, { total: originNewTotal });

        const targetData = targetTableIsOpen ? targetSnap.data() : { total: 0 };
        const targetNewTotal = (targetData.total || 0) + transferValue;
        batch.update(targetTableRef, {
            sentItems: arrayUnion(...itemsToTransfer),
            total: targetNewTotal
        });

        await batch.commit();
        alert(`Sucesso! ${itemsToTransfer.length} item(s) transferidos da Mesa ${originTableId} para ${targetTableId}.`);
        goToScreen('panelScreen');

    } catch (e) {
        console.error("Erro na transferência de mesa:", e);
        alert("Falha na transferência dos itens.");
    }
};
window.handleTableTransferConfirmed = handleTableTransferConfirmed;


window.openManagerAuthModal = (action, payload = null) => {
    const managerModal = document.getElementById('managerModal');
    if (!managerModal) { console.error("Modal Gerente não encontrado!"); return; }

    managerModal.innerHTML = `
        <div class="bg-dark-card border border-gray-600 p-6 rounded-xl shadow-2xl w-full max-w-sm">
            <h3 class="text-xl font-bold mb-4 text-red-400">Ação Gerencial Necessária</h3>
            <p class="text-base mb-3 text-dark-text">Insira a senha do gerente para prosseguir.</p>
            <input type="password" id="managerPasswordInput" placeholder="Senha" class="w-full p-3 bg-dark-input border border-gray-600 rounded-lg text-dark-text placeholder-dark-placeholder focus:ring-red-500 focus:border-red-500 text-base" maxlength="4">
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
                    // Ações do PaymentController
                    case 'executeMassDelete':
                        handleMassDeleteConfirmed();
                        break;
                    case 'executeMassTransfer':
                        openTableTransferModal();
                        break;
                    case 'deletePayment':
                        executeDeletePayment(payload);
                        break;

                    // Ações do ManagerController
                    case 'goToManagerPanel':
                    case 'openProductManagement':
                    case 'openCategoryManagement':
                    case 'openInventoryManagement':
                    case 'openRecipesManagement':
                        handleGerencialAction(action, payload);
                        break;

                    default:
                        console.warn(`Ação ${action} não reconhecida pelo modal.`);
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

window.deletePayment = deletePayment;
window.handleMassActionRequest = handleMassActionRequest;
window.openTableTransferModal = openTableTransferModal;
window.openKdsStatusModal = (id) => alert(`Abrir status KDS ${id} (DEV)`);
window.increaseLocalItemQuantity = increaseLocalItemQuantity;
window.decreaseLocalItemQuantity = decreaseLocalItemQuantity;
window.openObsModalForGroup = openObsModalForGroup;


export const setTableListener = (tableId) => {
    if (unsubscribeTable) unsubscribeTable();
    console.log(`[APP] Configurando listener para mesa ${tableId}`);
    const tableRef = getTableDocRef(tableId);
    unsubscribeTable = onSnapshot(tableRef, (docSnapshot) => {
        if (docSnapshot.exists()) {
            console.log(`[APP] Snapshot recebido para mesa ${tableId}`);
            currentOrderSnapshot = docSnapshot.data();
            const firebaseSelectedItems = currentOrderSnapshot.selectedItems || [];

            if (JSON.stringify(firebaseSelectedItems) !== JSON.stringify(selectedItems)) {
                 console.log("[APP] Sincronizando 'selectedItems' local com dados do Firebase.");
                 selectedItems.length = 0;
                 selectedItems.push(...firebaseSelectedItems);
            }

            renderOrderScreen(currentOrderSnapshot);
            renderPaymentSummary(currentTableId, currentOrderSnapshot);

        } else {
             console.warn(`[APP] Listener: Mesa ${tableId} não existe ou foi fechada.`);
             if (currentTableId === tableId) {
                 alert(`Mesa ${tableId} foi fechada ou removida.`);
                 if (unsubscribeTable) unsubscribeTable(); unsubscribeTable = null;
                 currentTableId = null; currentOrderSnapshot = null; selectedItems.length = 0;
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


export const setCurrentTable = (tableId) => {
    if (currentTableId === tableId && unsubscribeTable) {
        console.log(`[APP] Listener para mesa ${tableId} já ativo.`);
    }

    currentTableId = tableId;
    console.log(`[APP] Definindo mesa atual para ${tableId}`);

    // --- INÍCIO DA CORREÇÃO (Aplicando a sugestão do header) ---
    // Atualiza os títulos nas telas relevantes
    const currentTableNumEl = document.getElementById('current-table-number'); // <-- LINHA ADICIONADA
    const paymentTableNumEl = document.getElementById('payment-table-number');
    const orderScreenTableNumEl = document.getElementById('order-screen-table-number');

    if(currentTableNumEl) currentTableNumEl.textContent = `Mesa ${tableId}`; // <-- LINHA ADICIONADA (Atualiza o header)
    if(paymentTableNumEl) paymentTableNumEl.textContent = `Mesa ${tableId}`;
    if(orderScreenTableNumEl) orderScreenTableNumEl.textContent = `Mesa ${tableId}`;
     // --- FIM DA CORREÇÃO ---

    // Inicia o listener (ou reinicia)
    setTableListener(tableId);
};


export const selectTableAndStartListener = async (tableId) => {
    console.log(`[APP] Selecionando mesa ${tableId} e iniciando listener.`);
    try {
        await fetchWooCommerceProducts(/* Callback opcional */);
        setCurrentTable(tableId);
        goToScreen('orderScreen');
    } catch (error) {
        console.error(`[APP] Erro ao selecionar mesa ${tableId}:`, error);
        alert("Erro ao abrir a mesa. Verifique a conexão.");
    }
};
window.selectTableAndStartListener = selectTableAndStartListener;


window.openNfeModal = () => {
    const modal = document.getElementById('nfeModal');
    if (!modal || !currentOrderSnapshot) {
        alert("Erro: Modal NF-e não encontrado ou nenhuma mesa selecionada.");
        return;
    }

    const nfeError = document.getElementById('nfeError');
    const nfeErrorMessage = document.getElementById('nfeErrorMessage');
    const nfeDetails = document.getElementById('nfeDetails');
    const nfeCustomerName = document.getElementById('nfeCustomerName');
    const nfeCustomerDoc = document.getElementById('nfeCustomerDoc');
    const nfeTotalValue = document.getElementById('nfeTotalValue');
    const nfeConfirmBtn = document.getElementById('nfeConfirmBtn');

    // Reseta o estado
    nfeError.style.display = 'none';
    nfeDetails.style.display = 'block';
    nfeConfirmBtn.style.display = 'block';

    // Verifica se há um cliente associado (que salvamos no snapshot)
    if (currentOrderSnapshot.clientId && currentOrderSnapshot.clientName) {
        // Cliente ENCONTRADO
        nfeCustomerName.textContent = currentOrderSnapshot.clientName;
        nfeCustomerDoc.textContent = currentOrderSnapshot.clientId; // (CPF ou CNPJ)

        // Pega o valor total da tela de pagamento
        const totalValueEl = document.getElementById('orderTotalDisplayPayment');
        nfeTotalValue.textContent = totalValueEl ? totalValueEl.textContent : 'R$ 0,00';

        // Remove listener antigo e adiciona um novo
        const newConfirmBtn = nfeConfirmBtn.cloneNode(true);
        nfeConfirmBtn.parentNode.replaceChild(newConfirmBtn, nfeConfirmBtn);
        newConfirmBtn.addEventListener('click', () => {
            // Aqui é onde os dados seriam enviados para o backend
            console.log("--- DADOS PARA NF-e (SIMULAÇÃO) ---");
            console.log("Cliente:", currentOrderSnapshot.clientName);
            console.log("Documento:", currentOrderSnapshot.clientId);
            console.log("Valor:", nfeTotalValue.textContent);
            console.log("Itens:", currentOrderSnapshot.sentItems);
            console.log("Pagamentos:", currentOrderSnapshot.payments);

            alert("Simulação: Dados da NF-e enviados para o backend. (Verifique o console)");
            modal.style.display = 'none';
        });

    } else {
        // Cliente NÃO ENCONTRADO
        nfeDetails.style.display = 'none'; // Esconde os detalhes
        nfeConfirmBtn.style.display = 'none'; // Esconde o botão de emitir

        nfeError.style.display = 'block'; // Mostra o erro
        nfeErrorMessage.textContent = "Nenhum cliente (CPF/CNPJ) associado a esta mesa. Associe um cliente antes de emitir a NF-e.";
    }

    modal.style.display = 'flex';
};


const initStaffApp = async () => {
    console.log("[INIT] Iniciando app para Staff...");
    try {
        renderTableFilters();
        console.log("[INIT] Filtros de setor renderizados.");

        // Chamadas agora usam o proxy (Cloud Function)
        fetchWooCommerceProducts().catch(e => console.error("[INIT ERROR] Falha ao carregar produtos:", e));
        fetchWooCommerceCategories().catch(e => console.error("[INIT ERROR] Falha ao carregar categorias:", e));

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

const authenticateStaff = (email, password) => {
    const creds = STAFF_CREDENTIALS[email];
    return (creds && creds.password === password && creds.role !== 'client') ? creds : null;
};

const handleStaffLogin = async () => {
    loginBtn = document.getElementById('loginBtn');
    loginEmailInput = document.getElementById('loginEmail');
    loginPasswordInput = document.getElementById('loginPassword');
    loginErrorMsg = document.getElementById('loginErrorMsg');

    if (!loginBtn || !loginEmailInput || !loginPasswordInput) { /* ... (erro mantido) ... */ return; }
    if (loginErrorMsg) loginErrorMsg.style.display = 'none';
    loginBtn.disabled = true; loginBtn.textContent = 'Entrando...';

    const email = loginEmailInput.value.trim();
    const password = loginPasswordInput.value.trim();

    console.log(`[LOGIN] Tentando autenticar ${email}...`);
    const staffData = authenticateStaff(email, password);

    if (staffData) {
        console.log(`[LOGIN] Autenticação local OK. Role: ${staffData.role}`);
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

            const userName = staffData.name || userRole;
            document.getElementById('user-id-display').textContent = `Usuário: ${userName} | ${userRole.toUpperCase()}`;
            console.log("[LOGIN] User info display atualizado.");

            console.log("[LOGIN] Chamando initStaffApp...");
            await initStaffApp();
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

const handleLogout = () => {
    console.log("[LOGOUT] Iniciando...");
    const authInstance = auth;
    if (authInstance && authInstance.currentUser && (!userId || !userId.startsWith('mock_'))) {
        console.log("[LOGOUT] Fazendo signOut Firebase...");
        signOut(authInstance).catch(e => console.error("Erro no sign out:", e));
    } else {
        console.log("[LOGOUT] Pulando signOut Firebase (usuário mock ou já deslogado).");
    }
    userId = null; currentTableId = null; selectedItems.length = 0; userRole = 'anonymous'; currentOrderSnapshot = null;
    if (unsubscribeTable) { unsubscribeTable(); unsubscribeTable = null; }

    showLoginScreen();
    document.getElementById('user-id-display').textContent = 'Usuário ID: Carregando...';
    console.log("[LOGOUT] Concluído.");
};
window.handleLogout = handleLogout;


// --- INICIALIZAÇÃO PRINCIPAL ---
document.addEventListener('DOMContentLoaded', () => {
    console.log("[INIT] DOMContentLoaded.");

    const firebaseConfig = FIREBASE_CONFIG;

    try {
        console.log("[INIT] Config Firebase carregada do módulo.");

        // Inicializa Firebase App e Serviços
        const app = initializeApp(firebaseConfig);
        const dbInstance = getFirestore(app);
        const authInstance = getAuth(app);
        // ATUALIZADO: Inicializa o Functions com a REGIÃO
        const functionsInstance = getFunctions(app, 'us-central1'); // <--- ADICIONADO 'us-central1'

        // Passa o functionsInstance
        initializeFirebase(dbInstance, authInstance, APP_ID, functionsInstance);
        console.log("[INIT] Firebase App e Serviços (DB, Auth, Functions) inicializados.");

        // Mapeia elementos Globais e de Login
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
        onAuthStateChanged(authInstance, async (user) => {
            console.log("[AUTH] State Changed:", user ? `User UID: ${user.uid}` : 'No user');
            if (user) {
                userId = user.uid;
                console.log(`[AUTH] Usuário Firebase ${userId} detectado.`);
                // CORREÇÃO LÓGICA AUTH: Verifica a role ANTES de forçar logout
                if (userRole === 'gerente' || userRole === 'garcom') {
                     console.log(`[AUTH] Role ${userRole} já definida via login local. Iniciando app...`);
                     const userName = STAFF_CREDENTIALS[loginEmailInput?.value?.trim()]?.name || userRole;
                     document.getElementById('user-id-display').textContent = `Usuário: ${userName} | ${userRole.toUpperCase()}`;
                     await initStaffApp();
                } else if (!window.location.pathname.includes('client.html')) { // Evita logout automático na tela do cliente
                    // Se há um user Firebase mas a role local não é staff (e não estamos na client.html),
                    // provavelmente é um estado inconsistente, força logout.
                    console.warn("[AUTH] Usuário Firebase existe, mas role local é 'anonymous' na tela de staff. Forçando logout.");
                    handleLogout();
                } else {
                     console.log("[AUTH] Usuário Firebase existe na tela do cliente. (Ignorando para client.html)");
                }
            } else if (!window.location.pathname.includes('client.html')) { // Só mostra login se não for client.html
                 console.log("[AUTH] Nenhum usuário Firebase logado. -> showLoginScreen()");
                 showLoginScreen();
            } else {
                 console.log("[AUTH] Nenhum usuário Firebase logado na tela do cliente. (Ignorando para client.html)");
                 // Você pode querer adicionar lógica aqui para redirecionar ou mostrar erro na client.html se não houver user
            }
        });
        console.log("[INIT] Listener AuthStateChanged configurado.");

        // --- CORREÇÃO: Adiciona Listener ao Formulário de Login (para 'submit') ---
        const loginForm = document.getElementById('loginForm');
        if (loginForm) {
            loginForm.addEventListener('submit', (e) => {
                e.preventDefault(); // Impede o recarregamento da página
                handleStaffLogin(); // Chama a função de login existente
            });
            console.log("[INIT] Listener do form Login adicionado.");
        } else if (!window.location.pathname.includes('client.html')) {
            console.error("[INIT] Form de Login (loginForm) não encontrado na tela de staff!");
        }
        
        /* COMENTADO/REMOVIDO o listener antigo
        // Adiciona Listener ao Botão de Login
        if (loginBtn) {
            loginBtn.addEventListener('click', handleStaffLogin);
            console.log("[INIT] Listener do botão Login adicionado.");
        } else if (!window.location.pathname.includes('client.html')) {
             console.error("[INIT] Botão de Login (loginBtn) não encontrado na tela de staff!");
        }
        */

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
        const openNfeModalBtn = document.getElementById('openNfeModalBtn'); // O listener ainda encontra pelo ID

        if (openManagerPanelBtn) openManagerPanelBtn.addEventListener('click', () => { window.openManagerAuthModal('goToManagerPanel'); });
        if (logoutBtnHeader) logoutBtnHeader.addEventListener('click', handleLogout);
        if (openNfeModalBtn) openNfeModalBtn.addEventListener('click', window.openNfeModal); // <-- Este agora chama a função corrigida

        console.log("[INIT] Listeners restantes adicionados.");

    } catch (e) {
        console.error("Erro CRÍTICO na inicialização (DOMContentLoaded):", e);
        alert("Falha grave ao carregar o PDV. Verifique o console.");
        if(statusScreen) statusScreen.innerHTML = '<h2 class="text-red-600 font-bold">Erro de Inicialização</h2>';
        return;
    }
    console.log("[INIT] DOMContentLoaded finalizado.");
}); // FIM DO DOMContentLoaded
