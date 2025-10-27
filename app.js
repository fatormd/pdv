// --- APP.JS ---
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut, signInAnonymously } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, serverTimestamp, doc, setDoc, updateDoc, getDoc, onSnapshot, writeBatch, arrayRemove, arrayUnion } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { getFunctions } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-functions.js";

// Importações dos Serviços e Utils (Estáticas - sempre necessárias)
import { initializeFirebase, saveSelectedItemsToFirebase, getTableDocRef, auth, db, functions } from '/services/firebaseService.js';
import { fetchWooCommerceProducts, fetchWooCommerceCategories } from '/services/wooCommerceService.js';
import { formatCurrency, formatElapsedTime } from '/utils.js';

// Importações de Controllers (REMOVIDAS - Serão carregadas dinamicamente)
// import { loadOpenTables, renderTableFilters, handleAbrirMesa, handleSearchTable, initPanelController } from '/controllers/panelController.js'; // REMOVIDO
// import { renderMenu, renderOrderScreen, increaseLocalItemQuantity, decreaseLocalItemQuantity, openObsModalForGroup, initOrderController, handleSendSelectedItems } from '/controllers/orderController.js'; // REMOVIDO
// import { renderPaymentSummary, deletePayment, handleMassActionRequest, initPaymentController, handleFinalizeOrder, handleMassDeleteConfirmed, executeDeletePayment, openTableTransferModal, handleConfirmTableTransfer } from '/controllers/paymentController.js'; // REMOVIDO
// import { initManagerController, handleGerencialAction } from '/controllers/managerController.js'; // REMOVIDO

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
    // Adicionar futuras telas aqui, ex: 'userManagementScreen': 5
};
const STAFF_CREDENTIALS = {
    'agencia@fatormd.com': { password: '1234', role: 'gerente', name: 'Fmd' },
    'garcom@fator.com': { password: '1234', role: 'garcom', name: 'Mock Garçom' },
    // Adicionar credenciais para 'caixa' se/quando implementar
};
const MANAGER_PASSWORD = '1234';

export let currentTableId = null;
export let selectedItems = [];
export let currentOrderSnapshot = null;
export let userRole = 'anonymous';
export let userId = null;
export let unsubscribeTable = null;

// Armazena os módulos que já foram inicializados para Lazy Loading
const initializedModules = new Set();

// Guarda referências globais para funções dos módulos carregados dinamicamente
// para que possam ser chamadas por onclicks ou outras partes do app.js
let globalOrderFunctions = {};
let globalPaymentFunctions = {};
let globalManagerFunctions = {};
let globalUserManagementFunctions = {}; // Para o futuro modal de usuários
let globalPanelFunctions = {}; // Para o panelController

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

// --- ATUALIZADO: Função goToScreen com Lazy Loading ---
export const goToScreen = async (screenId) => {
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

        if(currentTableNumEl) currentTableNumEl.textContent = 'Fator MD';
        if(paymentTableNumEl) paymentTableNumEl.textContent = `Mesa`;
        if(orderScreenTableNumEl) orderScreenTableNumEl.textContent = 'Pedido';
    }

    // Reseta o botão 'Finalizar Conta' sempre que voltamos ao painel
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

        // --- LÓGICA DE LAZY LOADING ---
        if (!initializedModules.has(screenId)) {
            console.log(`[LazyLoad] Carregando e inicializando módulo para: ${screenId}`);
            try {
                switch(screenId) {
                    // panelScreen é inicializado no initStaffApp
                    case 'orderScreen':
                        const orderModule = await import('/controllers/orderController.js');
                        orderModule.initOrderController();
                        // Guarda referências globais se necessário (ex: para onclicks)
                        globalOrderFunctions.increaseLocalItemQuantity = orderModule.increaseLocalItemQuantity;
                        globalOrderFunctions.decreaseLocalItemQuantity = orderModule.decreaseLocalItemQuantity;
                        globalOrderFunctions.openObsModalForGroup = orderModule.openObsModalForGroup;
                        initializedModules.add(screenId);
                        break;
                    case 'paymentScreen':
                        const paymentModule = await import('/controllers/paymentController.js');
                        paymentModule.initPaymentController();
                        // Guarda referências globais
                        globalPaymentFunctions.deletePayment = paymentModule.deletePayment;
                        globalPaymentFunctions.handleMassActionRequest = paymentModule.handleMassActionRequest;
                        globalPaymentFunctions.openTableTransferModal = paymentModule.openTableTransferModal;
                        globalPaymentFunctions.handleFinalizeOrder = paymentModule.handleFinalizeOrder; // Se precisar chamar de outro lugar
                        globalPaymentFunctions.executeDeletePayment = paymentModule.executeDeletePayment; // Para o modal auth
                        globalPaymentFunctions.handleMassDeleteConfirmed = paymentModule.handleMassDeleteConfirmed; // Para o modal auth
                        globalPaymentFunctions.handleConfirmTableTransfer = paymentModule.handleConfirmTableTransfer; // Para o modal auth
                        initializedModules.add(screenId);
                        break;
                    case 'managerScreen':
                        const managerModule = await import('/controllers/managerController.js');
                        managerModule.initManagerController();
                         // Guarda referências globais
                        globalManagerFunctions.handleGerencialAction = managerModule.handleGerencialAction;
                        initializedModules.add(screenId);
                        break;
                    // Adicionar 'case' para userManagementScreen aqui quando criar a tela
                }
                console.log(`[LazyLoad] Módulo para ${screenId} carregado e inicializado.`);
            } catch (err) {
                console.error(`Falha ao carregar o módulo para ${screenId}:`, err);
                alert(`Erro ao carregar a tela ${screenId}. Tente recarregar a página.`);
                return; // Impede a navegação se o módulo falhar
            }
        }
        // --- FIM DA LÓGICA DE LAZY LOADING ---

        console.log(`[NAV] Navegando para ${screenId} (índice ${screenIndex})`);
        if (appContainer) appContainer.style.transform = `translateX(-${screenIndex * 100}vw)`;
        if (mainContent && screenId !== 'loginScreen') mainContent.style.display = 'block';
        document.body.classList.toggle('bg-gray-900', screenId === 'managerScreen');
        document.body.classList.toggle('bg-dark-bg', screenId !== 'managerScreen');
    } else {
        console.error(`[NAV] Tentativa de navegar para tela inválida: ${screenId}`);
    }
};
window.goToScreen = goToScreen; // Expor globalmente

export const handleTableTransferConfirmed = async (originTableId, targetTableId, itemsToTransfer, newDiners = 0, newSector = '') => {
    // Esta função agora usa globalPaymentFunctions se o módulo já foi carregado
    if (globalPaymentFunctions.handleConfirmTableTransfer) {
        // A lógica real está no paymentController, aqui apenas delegamos
        // No entanto, a lógica original estava aqui, vamos mantê-la por enquanto
        // para evitar quebrar se o paymentController ainda não carregou (embora não devesse acontecer)
         if (!originTableId || !targetTableId || itemsToTransfer.length === 0) { /* ... */ return; }
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
                 batch.set(targetTableRef, { /* ... (abrir mesa) ... */ });
             }
             const transferValue = itemsToTransfer.reduce((sum, item) => sum + (item.price || 0), 0);
             const originCurrentTotal = currentOrderSnapshot?.total || 0;
             const originNewTotal = Math.max(0, originCurrentTotal - transferValue);
             itemsToTransfer.forEach(item => { batch.update(originTableRef, { sentItems: arrayRemove(item) }); });
             batch.update(originTableRef, { total: originNewTotal });
             const targetData = targetTableIsOpen ? targetSnap.data() : { total: 0 };
             const targetNewTotal = (targetData.total || 0) + transferValue;
             batch.update(targetTableRef, { sentItems: arrayUnion(...itemsToTransfer), total: targetNewTotal });
             await batch.commit();
             alert(`Sucesso! ${itemsToTransfer.length} item(s) transferidos da Mesa ${originTableId} para ${targetTableId}.`);
             goToScreen('panelScreen');
         } catch (e) { /* ... (erro) ... */ }

    } else {
        console.error("handleTableTransferConfirmed chamada antes do paymentController carregar.");
        alert("Erro interno: Módulo de pagamento não carregado.");
    }
};
window.handleTableTransferConfirmed = handleTableTransferConfirmed; // Expor globalmente

// --- ATUALIZADO: openManagerAuthModal com Lazy Loading para UserManagement ---
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
        const handleAuthClick = async () => { // Tornou-se async
            if (input.value === MANAGER_PASSWORD) {
                managerModal.style.display = 'none';
                console.log(`[AUTH MODAL] Ação '${action}' autorizada.`);

                // Garante que o módulo Manager está carregado antes de chamar handleGerencialAction
                 if (!initializedModules.has('managerScreen') && action !== 'goToManagerPanel') {
                    try {
                        console.log("[LazyLoad] Pré-carregando managerController para ação...");
                        const managerModule = await import('/controllers/managerController.js');
                        managerModule.initManagerController();
                        globalManagerFunctions.handleGerencialAction = managerModule.handleGerencialAction;
                        initializedModules.add('managerScreen');
                    } catch(err){ console.error("Erro ao pré-carregar managerController:", err); return; }
                 }

                // Lazy Load do UserManagementController se a ação for 'openWaiterReg'
                if (action === 'openWaiterReg') {
                    if (!initializedModules.has('userManagementScreen')) { // Usa um ID hipotético para o módulo
                         try {
                            console.log("[LazyLoad] Carregando userManagementController...");
                            const userMgmtModule = await import('/controllers/userManagementController.js');
                            userMgmtModule.initUserManagementController();
                            // Guarda a função para abrir o modal
                            globalUserManagementFunctions.openUserManagementModal = userMgmtModule.openUserManagementModal;
                            initializedModules.add('userManagementScreen'); // Marca como carregado
                        } catch (err) {
                            console.error("Erro ao carregar/inicializar UserManagementController:", err);
                            alert("Erro ao carregar módulo de gestão de usuários.");
                            return; // Impede a execução da ação
                        }
                    }
                }

                // Executa a ação (os módulos necessários já devem estar carregados e funções globais disponíveis)
                try {
                    switch (action) {
                        // Ações do PaymentController (usa funções globais)
                        case 'executeMassDelete':
                            if (globalPaymentFunctions.handleMassDeleteConfirmed) globalPaymentFunctions.handleMassDeleteConfirmed();
                            else console.error("PaymentController não carregado para executeMassDelete");
                            break;
                        case 'executeMassTransfer':
                             if (globalPaymentFunctions.openTableTransferModal) globalPaymentFunctions.openTableTransferModal();
                             else console.error("PaymentController não carregado para executeMassTransfer");
                            break;
                        case 'deletePayment':
                             if (globalPaymentFunctions.executeDeletePayment) globalPaymentFunctions.executeDeletePayment(payload);
                             else console.error("PaymentController não carregado para deletePayment");
                            break;

                        // Ações do ManagerController (usa função global)
                        case 'goToManagerPanel': // Não precisa do managerController carregado ainda
                            goToScreen('managerScreen');
                            break;
                        case 'openProductManagement':
                        case 'openCategoryManagement':
                        case 'openInventoryManagement':
                        case 'openRecipesManagement':
                            if (globalManagerFunctions.handleGerencialAction) globalManagerFunctions.handleGerencialAction(action, payload);
                            else console.error("ManagerController não carregado para ação:", action);
                            break;

                        // Ação específica do UserManagement (usa função global)
                        case 'openWaiterReg':
                            if (globalUserManagementFunctions.openUserManagementModal) {
                                globalUserManagementFunctions.openUserManagementModal();
                            } else {
                                console.error("UserManagementController não carregado para openWaiterReg");
                                alert("Erro ao abrir gestão de usuários.");
                            }
                            break;

                        default:
                            console.warn(`Ação ${action} não reconhecida explicitamente pelo modal. Tentando chamar handleGerencialAction...`);
                            if (globalManagerFunctions.handleGerencialAction) globalManagerFunctions.handleGerencialAction(action, payload);
                            else console.error("ManagerController não carregado para ação padrão:", action);
                    }
                } catch(execError) {
                    console.error(`Erro ao executar a ação '${action}' após autenticação:`, execError);
                    alert(`Ocorreu um erro ao tentar executar a ação: ${execError.message}`);
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
window.openManagerAuthModal = openManagerAuthModal; // Expor globalmente

// Expor funções globais que são chamadas por onclicks no HTML
// Essas funções agora chamam as funções reais guardadas em globalXFunctions
// após o módulo correspondente ser carregado.

window.deletePayment = (timestamp) => {
    if(globalPaymentFunctions.deletePayment) globalPaymentFunctions.deletePayment(timestamp);
    else console.error("deletePayment chamado antes do paymentController carregar.");
};
window.handleMassActionRequest = (action) => {
    if(globalPaymentFunctions.handleMassActionRequest) globalPaymentFunctions.handleMassActionRequest(action);
    else console.error("handleMassActionRequest chamado antes do paymentController carregar.");
};
window.openTableTransferModal = () => {
    if(globalPaymentFunctions.openTableTransferModal) globalPaymentFunctions.openTableTransferModal();
    else console.error("openTableTransferModal chamado antes do paymentController carregar.");
};
window.increaseLocalItemQuantity = (itemId, noteKey) => {
    if(globalOrderFunctions.increaseLocalItemQuantity) globalOrderFunctions.increaseLocalItemQuantity(itemId, noteKey);
    else console.error("increaseLocalItemQuantity chamado antes do orderController carregar.");
};
window.decreaseLocalItemQuantity = (itemId, noteKey) => {
    if(globalOrderFunctions.decreaseLocalItemQuantity) globalOrderFunctions.decreaseLocalItemQuantity(itemId, noteKey);
     else console.error("decreaseLocalItemQuantity chamado antes do orderController carregar.");
};
window.openObsModalForGroup = (itemId, noteKey) => {
    if(globalOrderFunctions.openObsModalForGroup) globalOrderFunctions.openObsModalForGroup(itemId, noteKey);
    else console.error("openObsModalForGroup chamado antes do orderController carregar.");
};
window.openKdsStatusModal = (id) => alert(`Abrir status KDS ${id} (DEV)`); // Placeholder mantido


// --- LÓGICA DE LISTENER DA MESA ---
// (Funções setTableListener, setCurrentTable, selectTableAndStartListener mantidas como estavam)
// Elas chamam renderOrderScreen e renderPaymentSummary, que precisam que os módulos
// correspondentes já tenham sido carregados pelo goToScreen.

export const setTableListener = (tableId) => {
    // Garante que os módulos de UI necessários estejam prontos
    if (!initializedModules.has('orderScreen') || !initializedModules.has('paymentScreen')) {
        console.error("setTableListener chamado antes dos módulos order/payment serem inicializados.");
        // Poderia tentar carregá-los aqui, mas idealmente goToScreen já fez isso.
        return;
    }

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
                 selectedItems.length = 0; // Limpa o array local
                 selectedItems.push(...firebaseSelectedItems); // Adiciona os itens do Firebase
            }

            // Chama as funções de renderização dos módulos já carregados
            import('/controllers/orderController.js').then(module => module.renderOrderScreen(currentOrderSnapshot));
            import('/controllers/paymentController.js').then(module => module.renderPaymentSummary(currentTableId, currentOrderSnapshot));

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
        // Mesmo se já ativo, força re-render para garantir UI atualizada
        if(currentOrderSnapshot && initializedModules.has('orderScreen') && initializedModules.has('paymentScreen')){
             import('/controllers/orderController.js').then(module => module.renderOrderScreen(currentOrderSnapshot));
             import('/controllers/paymentController.js').then(module => module.renderPaymentSummary(currentTableId, currentOrderSnapshot));
        }
        return; // Não precisa reiniciar listener
    }

    currentTableId = tableId;
    console.log(`[APP] Definindo mesa atual para ${tableId}`);

    // Atualiza os títulos nas telas relevantes
    const currentTableNumEl = document.getElementById('current-table-number');
    const paymentTableNumEl = document.getElementById('payment-table-number');
    const orderScreenTableNumEl = document.getElementById('order-screen-table-number');

    if(currentTableNumEl) currentTableNumEl.textContent = `Mesa ${tableId}`;
    if(paymentTableNumEl) paymentTableNumEl.textContent = `Mesa ${tableId}`;
    if(orderScreenTableNumEl) orderScreenTableNumEl.textContent = `Mesa ${tableId}`;

    // Inicia o listener (ou reinicia)
    setTableListener(tableId);
};

export const selectTableAndStartListener = async (tableId) => {
    console.log(`[APP] Selecionando mesa ${tableId} e iniciando listener.`);
    try {
        // Garante que produtos estejam carregados (já deve ter acontecido no initStaffApp)
        // await fetchWooCommerceProducts(); // Pode remover se já carregou antes

        // Navega para a tela E carrega/inicializa o orderController dinamicamente
        await goToScreen('orderScreen');
        // Define a mesa atual E inicia o listener (que depende do order/payment controllers)
        setCurrentTable(tableId);

    } catch (error) {
        console.error(`[APP] Erro ao selecionar mesa ${tableId}:`, error);
        alert("Erro ao abrir a mesa. Verifique a conexão.");
    }
};
window.selectTableAndStartListener = selectTableAndStartListener;


window.openNfeModal = () => { // Lógica mantida
    const modal = document.getElementById('nfeModal');
    if (!modal || !currentOrderSnapshot) { /* ... */ return; }
    const nfeError = document.getElementById('nfeError');
    const nfeErrorMessage = document.getElementById('nfeErrorMessage');
    // ... (resto da lógica igual)
};


// --- ATUALIZADO: initStaffApp carrega e inicializa o panelController ---
const initStaffApp = async () => {
    console.log("[INIT] Iniciando app para Staff...");
    try {
        // Carrega e inicializa o Panel Controller primeiro
        if (!initializedModules.has('panelScreen')) {
            const panelModule = await import('/controllers/panelController.js');
            panelModule.initPanelController();
            // Guarda funções globais se necessário
            globalPanelFunctions.loadOpenTables = panelModule.loadOpenTables;
            globalPanelFunctions.renderTableFilters = panelModule.renderTableFilters;
            initializedModules.add('panelScreen');
            console.log("[INIT] PanelController carregado e inicializado.");
        }

        // Agora chama as funções do módulo carregado
        if (globalPanelFunctions.renderTableFilters) globalPanelFunctions.renderTableFilters();
        else console.error("renderTableFilters não disponível.");
        console.log("[INIT] Filtros de setor renderizados.");

        // Carrega dados do WooCommerce
        fetchWooCommerceProducts().catch(e => console.error("[INIT ERROR] Falha ao carregar produtos:", e));
        fetchWooCommerceCategories().catch(e => console.error("[INIT ERROR] Falha ao carregar categorias:", e));

        hideStatus();
        hideLoginScreen(); // Mostra header/main
        console.log("[INIT] UI principal visível.");

        // Configura listener das mesas
        if (globalPanelFunctions.loadOpenTables) globalPanelFunctions.loadOpenTables();
         else console.error("loadOpenTables não disponível.");
        console.log("[INIT] Listener de mesas configurado.");

        // Navega para o painel (sem carregar módulo, já foi feito)
        await goToScreen('panelScreen'); // Usa await se goToScreen for async
        console.log("[INIT] Navegação inicial para panelScreen.");

    } catch (error) {
        console.error("[INIT] Erro CRÍTICO durante initStaffApp:", error);
        alert("Erro grave ao iniciar. Verifique o console.");
        showLoginScreen();
    }
};

const authenticateStaff = (email, password) => { // Lógica mantida
    const creds = STAFF_CREDENTIALS[email];
    return (creds && creds.password === password && creds.role !== 'client') ? creds : null;
};

const handleStaffLogin = async () => { // Lógica mantida
    loginBtn = document.getElementById('loginBtn');
    loginEmailInput = document.getElementById('loginEmail');
    // ... (resto igual)
    const staffData = authenticateStaff(email, password);
    if (staffData) {
        userRole = staffData.role;
        try {
            // ... (login anônimo Firebase)
            // ... (atualiza UI com nome)
            await initStaffApp(); // Chama a função atualizada
        } catch (error) { /* ... (erro) ... */ }
    } else { /* ... (erro credenciais) ... */ }
    // ... (reseta botão)
};

const handleLogout = () => { // Lógica mantida
    console.log("[LOGOUT] Iniciando...");
    // ... (signOut Firebase)
    userId = null; currentTableId = null; selectedItems.length = 0; userRole = 'anonymous'; currentOrderSnapshot = null;
    if (unsubscribeTable) { unsubscribeTable(); unsubscribeTable = null; }
    // Limpa o cache de módulos inicializados para forçar recarga no próximo login
    initializedModules.clear();
    globalOrderFunctions = {};
    globalPaymentFunctions = {};
    globalManagerFunctions = {};
    globalUserManagementFunctions = {};
    globalPanelFunctions = {};
    showLoginScreen();
    // ... (reseta display user id)
    console.log("[LOGOUT] Concluído.");
};
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
        initializeFirebase(dbInstance, authInstance, APP_ID, functionsInstance);
        console.log("[INIT] Firebase App e Serviços inicializados.");

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
                if (userRole === 'gerente' || userRole === 'garcom' || userRole === 'caixa') { // Inclui caixa se adicionar
                     console.log(`[AUTH] Role ${userRole} já definida via login local. Iniciando app...`);
                     const userName = STAFF_CREDENTIALS[loginEmailInput?.value?.trim()]?.name || userRole;
                     document.getElementById('user-id-display').textContent = `Usuário: ${userName} | ${userRole.toUpperCase()}`;
                     await initStaffApp(); // Chama a função que agora carrega o panelController
                } else if (!window.location.pathname.includes('client.html')) {
                    console.warn("[AUTH] Usuário Firebase existe, mas role local é 'anonymous'. Forçando logout.");
                    handleLogout();
                } else { /* ... (cliente) ... */ }
            } else if (!window.location.pathname.includes('client.html')) {
                 console.log("[AUTH] Nenhum usuário Firebase logado. -> showLoginScreen()");
                 showLoginScreen();
            } else { /* ... (cliente) ... */ }
        });
        console.log("[INIT] Listener AuthStateChanged configurado.");

        // Listener do Formulário de Login
        const loginForm = document.getElementById('loginForm');
        if (loginForm) {
            loginForm.addEventListener('submit', (e) => {
                e.preventDefault();
                handleStaffLogin();
            });
            console.log("[INIT] Listener do form Login adicionado.");
        } else if (!window.location.pathname.includes('client.html')) {
            console.error("[INIT] Form de Login (loginForm) não encontrado!");
        }

        // Inicializa os Controllers (REMOVIDO - Agora feito sob demanda)
        console.log("[INIT] Inicializadores estáticos removidos (agora sob demanda).");

        // Listeners Globais (Header, etc.)
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
        return;
    }
    console.log("[INIT] DOMContentLoaded finalizado.");
}); // FIM DO DOMContentLoaded
