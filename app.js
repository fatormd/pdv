// --- APP.JS ---
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut, signInAnonymously } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, serverTimestamp, doc, setDoc, updateDoc, getDoc, onSnapshot, writeBatch, arrayRemove, arrayUnion } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { getFunctions } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-functions.js";

// Importações dos Serviços e Utils (Estáticas - sempre necessárias)
import { initializeFirebase, saveSelectedItemsToFirebase, getTableDocRef, auth, db, functions } from '/services/firebaseService.js';
import { fetchWooCommerceProducts, fetchWooCommerceCategories } from '/services/wooCommerceService.js';
import { formatCurrency, formatElapsedTime } from '/utils.js';

// Importações de Controllers REMOVIDAS - Serão carregadas dinamicamente

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
// Simulação de credenciais (NÃO SEGURO PARA PRODUÇÃO)
const STAFF_CREDENTIALS = {
    'agencia@fatormd.com': { password: '1234', role: 'gerente', name: 'Fmd' },
    'garcom@fator.com': { password: '1234', role: 'garcom', name: 'Mock Garçom' },
    // Adicionar credenciais para 'caixa' se/quando implementar
};
const MANAGER_PASSWORD = '1234'; // Senha para ações gerenciais

export let currentTableId = null;
export let selectedItems = []; // Itens selecionados localmente antes de enviar
export let currentOrderSnapshot = null; // Último snapshot da mesa recebido do Firebase
export let userRole = 'anonymous'; // Papel do usuário logado ('garcom', 'gerente', 'caixa')
export let userId = null; // ID do usuário (Firebase anônimo ou mock)
export let unsubscribeTable = null; // Função para desligar o listener da mesa atual

// Armazena os módulos que já foram inicializados para Lazy Loading
const initializedModules = new Set();

// Guarda referências globais para funções dos módulos carregados dinamicamente
// para que possam ser chamadas por onclicks ou outras partes do app.js
let globalOrderFunctions = {};
let globalPaymentFunctions = {};
let globalManagerFunctions = {};
let globalUserManagementFunctions = {};
let globalPanelFunctions = {};

// --- ELEMENTOS UI ---
// Mapeados no DOMContentLoaded para garantir que existam
let statusScreen, mainContent, appContainer, loginScreen, mainHeader;
let loginBtn, loginEmailInput, loginPasswordInput, loginErrorMsg;


// --- FUNÇÕES CORE E ROTIAMENTO ---

// Esconde a tela de status/loading inicial
export const hideStatus = () => {
    if (!statusScreen) statusScreen = document.getElementById('statusScreen');
    if (statusScreen) {
        statusScreen.style.cssText = 'display: none !important'; // Usa !important para garantir
        console.log("[UI] hideStatus executado.");
    } else {
        console.error("[UI] Elemento statusScreen não encontrado em hideStatus.");
    }
};

// Mostra a tela de login e reseta campos
const showLoginScreen = () => {
    console.log("[UI] Chamando showLoginScreen...");
    // Garante que os elementos sejam buscados novamente
    statusScreen = document.getElementById('statusScreen');
    mainContent = document.getElementById('mainContent');
    mainHeader = document.getElementById('mainHeader');
    appContainer = document.getElementById('appContainer');
    loginEmailInput = document.getElementById('loginEmail');
    loginPasswordInput = document.getElementById('loginPassword');
    loginErrorMsg = document.getElementById('loginErrorMsg');

    hideStatus(); // Garante que a tela de loading esteja escondida
    if (mainHeader) mainHeader.style.display = 'none'; // Esconde cabeçalho
    if (mainContent) mainContent.style.display = 'block'; // Mostra container principal
    if (appContainer) appContainer.style.transform = `translateX(0vw)`; // Garante que a tela de login (índice 0) esteja visível
    document.body.classList.add('bg-dark-bg'); // Aplica fundo escuro
    document.body.classList.remove('bg-gray-900', 'logged-in'); // Remove classes de outros estados

    // Limpa campos e mensagens de erro do login
    if(loginEmailInput) loginEmailInput.value = '';
    if(loginPasswordInput) loginPasswordInput.value = '';
    if(loginErrorMsg) loginErrorMsg.style.display = 'none';
    console.log("[UI] showLoginScreen concluído.");
};

// Esconde a tela de login e mostra o cabeçalho principal
const hideLoginScreen = () => {
    // Garante que os elementos sejam buscados novamente
    mainHeader = document.getElementById('mainHeader');
    mainContent = document.getElementById('mainContent');

    if (mainHeader) mainHeader.style.display = 'flex'; // Mostra cabeçalho
    if (mainContent) mainContent.style.display = 'block'; // Garante que container principal esteja visível
    document.body.classList.add('logged-in'); // Adiciona classe para indicar que está logado

    // Mostra/Esconde botões do cabeçalho baseado na role
    const logoutBtn = document.getElementById('logoutBtnHeader');
    const managerBtn = document.getElementById('openManagerPanelBtn');
    if (logoutBtn) logoutBtn.classList.remove('hidden');
    if (managerBtn) {
        managerBtn.classList.toggle('hidden', userRole !== 'gerente'); // Só mostra se for gerente
    }
};

/**
 * Navega entre as telas do SPA e carrega módulos sob demanda (Lazy Loading).
 * @param {string} screenId - A chave da tela de destino (ex: 'panelScreen', 'orderScreen').
 */
export const goToScreen = async (screenId) => {
    // Garante que elementos sejam buscados
    if (!appContainer) appContainer = document.getElementById('appContainer');
    if (!mainContent) mainContent = document.getElementById('mainContent');

    // --- LÓGICA PRE-NAVEGAÇÃO ---

    // Salva itens locais no Firebase ANTES de sair da tela de pedido/pagamento para o painel
    if (currentTableId && screenId === 'panelScreen') {
        const currentTransform = appContainer?.style.transform || '';
        const currentScreenKey = Object.keys(screens).find(key => screens[key] * -100 + 'vw' === currentTransform.replace(/translateX\((.*?)\)/, '$1'));
        if (currentScreenKey === 'orderScreen' || currentScreenKey === 'paymentScreen') {
             console.log(`[NAV] Salvando itens da mesa ${currentTableId} ao sair de ${currentScreenKey}`);
            saveSelectedItemsToFirebase(currentTableId, selectedItems);
        }
    }

    // Desliga listener e limpa estado local SE estiver saindo de uma mesa ativa para o painel ou login
    if ((screenId === 'panelScreen' || screenId === 'loginScreen') && currentTableId && unsubscribeTable) {
        console.log(`[NAV] Limpando estado da mesa ${currentTableId} ao ir para ${screenId}`);
        unsubscribeTable(); unsubscribeTable = null;
        currentTableId = null; currentOrderSnapshot = null; selectedItems.length = 0;

        // Reseta títulos
        const currentTableNumEl = document.getElementById('current-table-number');
        const paymentTableNumEl = document.getElementById('payment-table-number');
        const orderScreenTableNumEl = document.getElementById('order-screen-table-number');
        if(currentTableNumEl) currentTableNumEl.textContent = 'Fator MD';
        if(paymentTableNumEl) paymentTableNumEl.textContent = `Mesa`;
        if(orderScreenTableNumEl) orderScreenTableNumEl.textContent = 'Pedido';
    }

    // Reseta o botão 'Finalizar Conta' sempre que voltamos AO painel
    if (screenId === 'panelScreen') {
        const finalizeBtn = document.getElementById('finalizeOrderBtn');
        if (finalizeBtn && !finalizeBtn.innerHTML.includes('fa-check-circle')) {
            console.log("[NAV] Resetando botão 'Finalizar Conta' ao voltar para o painel.");
            finalizeBtn.disabled = true;
            finalizeBtn.innerHTML = '<i class="fas fa-check-circle"></i> FINALIZAR CONTA';
            finalizeBtn.classList.add('opacity-50', 'cursor-not-allowed');
        }
    }

    // --- NAVEGAÇÃO E LAZY LOADING ---

    const screenIndex = screens[screenId];
    if (screenIndex !== undefined) {

        // --- LAZY LOADING: Carrega e inicializa o módulo se ainda não foi feito ---
        if (!initializedModules.has(screenId)) {
            console.log(`[LazyLoad] Carregando e inicializando módulo para: ${screenId}`);
            try {
                switch(screenId) {
                    // panelScreen é inicializado no initStaffApp, não precisa carregar aqui
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
                    // Adicionar 'case' para userManagementScreen e outros módulos gerenciais aqui
                    // Exemplo:
                    // case 'userManagementScreen':
                    //     const userMgmtModule = await import('/controllers/userManagementController.js');
                    //     userMgmtModule.initUserManagementController();
                    //     globalUserManagementFunctions.openUserManagementModal = userMgmtModule.openUserManagementModal;
                    //     initializedModules.add(screenId);
                    //     break;
                }
                console.log(`[LazyLoad] Módulo para ${screenId} carregado e inicializado.`);
            } catch (err) {
                console.error(`Falha ao carregar o módulo para ${screenId}:`, err);
                alert(`Erro ao carregar a tela ${screenId}. Tente recarregar a página.`);
                return; // Impede a navegação se o módulo falhar
            }
        }
        // --- FIM LAZY LOADING ---

        // Realiza a transição da tela
        console.log(`[NAV] Navegando para ${screenId} (índice ${screenIndex})`);
        if (appContainer) appContainer.style.transform = `translateX(-${screenIndex * 100}vw)`;
        if (mainContent && screenId !== 'loginScreen') mainContent.style.display = 'block'; // Garante visibilidade

        // Ajusta o fundo da página (ex: mais escuro para tela gerencial)
        document.body.classList.toggle('bg-gray-900', screenId === 'managerScreen');
        document.body.classList.toggle('bg-dark-bg', screenId !== 'managerScreen' && screenId !== 'loginScreen'); // Fundo padrão

    } else {
        console.error(`[NAV] Tentativa de navegar para tela inválida: ${screenId}`);
    }
};
window.goToScreen = goToScreen; // Expor globalmente

/**
 * Executa a transferência de itens entre mesas (chamada pelo modal de confirmação).
 * A lógica principal reside aqui, mas poderia ser movida para paymentController se preferir.
 */
export const handleTableTransferConfirmed = async (originTableId, targetTableId, itemsToTransfer, newDiners = 0, newSector = '') => {
    if (!originTableId || !targetTableId || itemsToTransfer.length === 0) {
        alert("Erro: Dados de transferência incompletos.");
        return;
    }
    if (originTableId === targetTableId) {
        alert("Mesa de origem e destino não podem ser a mesma.");
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
        // Verifica/Prepara a mesa de destino
        const targetSnap = await getDoc(targetTableRef);
        const targetTableIsOpen = targetSnap.exists() && targetSnap.data().status?.toLowerCase() === 'open';

        if (!targetTableIsOpen) { // Se a mesa destino está fechada, precisa abrir
            if (!newDiners || !newSector) {
                alert("Erro: Mesa destino fechada. Pessoas e setor são obrigatórios para abrir.");
                return;
            }
            console.log(`[APP] Abrindo Mesa ${targetTableId} para transferência.`);
            batch.set(targetTableRef, {
                tableNumber: parseInt(targetTableId), diners: newDiners, sector: newSector, status: 'open',
                createdAt: serverTimestamp(), total: 0, sentItems: [], payments: [], serviceTaxApplied: true, selectedItems: []
            });
        }

        // Prepara a transferência dos itens
        const transferValue = itemsToTransfer.reduce((sum, item) => sum + (item.price || 0), 0);

        // Remove itens e ajusta total da mesa de origem
        // Lê o total atual ANTES de modificar, usando o snapshot global se disponível
        const originCurrentTotal = currentOrderSnapshot?.tableNumber == originTableId ? (currentOrderSnapshot.total || 0) : (await getDoc(originTableRef)).data()?.total || 0;
        const originNewTotal = Math.max(0, originCurrentTotal - transferValue);
        itemsToTransfer.forEach(item => {
            // Importante: arrayRemove precisa do objeto EXATO que está no array
            // Se itemsToTransfer veio direto do snapshot, deve funcionar.
            batch.update(originTableRef, { sentItems: arrayRemove(item) });
        });
        batch.update(originTableRef, { total: originNewTotal });

        // Adiciona itens e ajusta total da mesa de destino
        const targetData = targetTableIsOpen ? targetSnap.data() : { total: 0 }; // Usa dados existentes ou inicia do zero
        const targetNewTotal = (targetData.total || 0) + transferValue;
        batch.update(targetTableRef, {
            sentItems: arrayUnion(...itemsToTransfer), // Adiciona os itens transferidos
            total: targetNewTotal
        });

        // Executa todas as operações em lote
        await batch.commit();
        alert(`Sucesso! ${itemsToTransfer.length} item(s) transferidos da Mesa ${originTableId} para ${targetTableId}.`);
        goToScreen('panelScreen'); // Volta para o painel após a transferência

    } catch (e) {
        console.error("Erro na transferência de mesa:", e);
        alert(`Falha na transferência dos itens: ${e.message}`);
    }
};
window.handleTableTransferConfirmed = handleTableTransferConfirmed; // Expor globalmente

/**
 * Abre o modal de autenticação para ações gerenciais e carrega módulos sob demanda.
 * @param {string} action - A ação a ser executada após autenticação.
 * @param {*} [payload=null] - Dados adicionais para a ação (ex: ID do pagamento a excluir).
 */
window.openManagerAuthModal = (action, payload = null) => {
    const managerModal = document.getElementById('managerModal');
    if (!managerModal) { console.error("Modal Gerente não encontrado!"); return; }

    // Cria o HTML do modal dinamicamente (pode ser movido para index.html se preferir)
    managerModal.innerHTML = `
        <div class="bg-dark-card border border-gray-600 p-6 rounded-xl shadow-2xl w-full max-w-sm">
            <h3 class="text-xl font-bold mb-4 text-red-400">Ação Gerencial Necessária</h3>
            <p class="text-base mb-3 text-dark-text">Insira a senha do gerente para prosseguir.</p>
            <input type="password" id="managerPasswordInput" placeholder="Senha" class="w-full p-3 bg-dark-input border border-gray-600 rounded-lg text-dark-text placeholder-dark-placeholder focus:ring-red-500 focus:border-red-500 text-base" maxlength="4" autocomplete="current-password">
            <div class="flex justify-end space-x-3 mt-4">
                <button class="px-4 py-3 bg-gray-600 text-gray-200 rounded-lg hover:bg-gray-500 transition text-base" onclick="document.getElementById('managerModal').style.display='none'">Cancelar</button>
                <button id="authManagerBtn" class="px-4 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 transition text-base">Autenticar</button>
            </div>
        </div>
    `;
    managerModal.style.display = 'flex';
    const input = document.getElementById('managerPasswordInput');
    const authBtn = document.getElementById('authManagerBtn');

    if(input) input.focus(); // Foca no campo de senha

    if(authBtn && input) {
        const handleAuthClick = async () => { // Tornou-se async para lazy loading
            if (input.value === MANAGER_PASSWORD) {
                managerModal.style.display = 'none'; // Esconde o modal de senha
                console.log(`[AUTH MODAL] Ação '${action}' autorizada.`);

                // --- LAZY LOADING DOS MÓDULOS NECESSÁRIOS ---
                try {
                    // Garante que o módulo Manager está carregado se a ação for dele
                    if (['goToManagerPanel', 'openProductManagement', 'openCategoryManagement', 'openInventoryManagement', 'openRecipesManagement', 'openCashManagement', 'openReservations', 'openCustomerCRM', 'openWooSync'].includes(action)) {
                        if (!initializedModules.has('managerScreen')) {
                            console.log("[LazyLoad] Pré-carregando managerController para ação...");
                            const managerModule = await import('/controllers/managerController.js');
                            managerModule.initManagerController();
                            globalManagerFunctions.handleGerencialAction = managerModule.handleGerencialAction;
                            initializedModules.add('managerScreen');
                        }
                    }
                    // Garante que o módulo Payment está carregado se a ação for dele
                    if (['executeMassDelete', 'executeMassTransfer', 'deletePayment'].includes(action)) {
                         if (!initializedModules.has('paymentScreen')) {
                            console.log("[LazyLoad] Pré-carregando paymentController para ação...");
                            const paymentModule = await import('/controllers/paymentController.js');
                            paymentModule.initPaymentController();
                            // Guarda as funções necessárias para essas ações
                            globalPaymentFunctions.handleMassDeleteConfirmed = paymentModule.handleMassDeleteConfirmed;
                            globalPaymentFunctions.openTableTransferModal = paymentModule.openTableTransferModal;
                            globalPaymentFunctions.executeDeletePayment = paymentModule.executeDeletePayment;
                            initializedModules.add('paymentScreen');
                        }
                    }
                    // Garante que o módulo UserManagement está carregado se a ação for 'openWaiterReg'
                    if (action === 'openWaiterReg') {
                        if (!initializedModules.has('userManagementScreen')) { // Usa ID hipotético
                            console.log("[LazyLoad] Carregando userManagementController...");
                            const userMgmtModule = await import('/controllers/userManagementController.js');
                            userMgmtModule.initUserManagementController();
                            globalUserManagementFunctions.openUserManagementModal = userMgmtModule.openUserManagementModal;
                            initializedModules.add('userManagementScreen');
                        }
                    }
                } catch(loadErr) {
                     console.error("Erro ao carregar módulo necessário:", loadErr);
                     alert(`Erro ao carregar módulo: ${loadErr.message}`);
                     return; // Impede a execução da ação
                }
                // --- FIM LAZY LOADING ---


                // Executa a ação (usando as funções globais que foram populadas)
                try {
                    switch (action) {
                        // Ações do PaymentController
                        case 'executeMassDelete':
                            if (globalPaymentFunctions.handleMassDeleteConfirmed) globalPaymentFunctions.handleMassDeleteConfirmed();
                            else console.error("Falha ao chamar handleMassDeleteConfirmed");
                            break;
                        case 'executeMassTransfer':
                             if (globalPaymentFunctions.openTableTransferModal) globalPaymentFunctions.openTableTransferModal();
                             else console.error("Falha ao chamar openTableTransferModal");
                            break;
                        case 'deletePayment':
                             if (globalPaymentFunctions.executeDeletePayment) globalPaymentFunctions.executeDeletePayment(payload);
                             else console.error("Falha ao chamar executeDeletePayment");
                            break;

                        // Ações do ManagerController
                        case 'goToManagerPanel': // Navega primeiro
                            await goToScreen('managerScreen'); // Usa await se goToScreen é async
                            break;
                        case 'openProductManagement':
                        case 'openCategoryManagement':
                        case 'openInventoryManagement':
                        case 'openRecipesManagement':
                        case 'openCashManagement': // Adicionando ações que faltavam
                        case 'openReservations':
                        case 'openCustomerCRM':
                        case 'openWooSync':
                            if (globalManagerFunctions.handleGerencialAction) globalManagerFunctions.handleGerencialAction(action, payload);
                            else console.error("Falha ao chamar handleGerencialAction para:", action);
                            break;

                        // Ação do UserManagementController
                        case 'openWaiterReg':
                            if (globalUserManagementFunctions.openUserManagementModal) globalUserManagementFunctions.openUserManagementModal();
                            else console.error("Falha ao chamar openUserManagementModal");
                            break;

                        default:
                            console.warn(`Ação ${action} não reconhecida explicitamente. Tentando chamar handleGerencialAction...`);
                            if (globalManagerFunctions.handleGerencialAction) globalManagerFunctions.handleGerencialAction(action, payload);
                            else console.warn("handleGerencialAction não disponível para ação padrão.");
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

// --- WRAPPERS GLOBAIS PARA ONCLICKS ---
// Delega chamadas para as funções guardadas nas variáveis globais
// após o módulo correspondente ser carregado pelo goToScreen ou openManagerAuthModal.

window.deletePayment = (timestamp) => {
    // A ação deletePayment agora passa pelo openManagerAuthModal primeiro
    window.openManagerAuthModal('deletePayment', timestamp);
    // if(globalPaymentFunctions.deletePayment) globalPaymentFunctions.deletePayment(timestamp);
    // else console.error("deletePayment chamado antes do paymentController carregar.");
};
window.handleMassActionRequest = (action) => {
    // A ação de exclusão/transferência em massa passa pelo openManagerAuthModal
     if(action === 'delete') window.openManagerAuthModal('executeMassDelete');
     else if (action === 'transfer') window.openManagerAuthModal('executeMassTransfer');
    // if(globalPaymentFunctions.handleMassActionRequest) globalPaymentFunctions.handleMassActionRequest(action);
    // else console.error("handleMassActionRequest chamado antes do paymentController carregar.");
};
// openTableTransferModal é chamado DENTRO do openManagerAuthModal agora
// window.openTableTransferModal = () => { ... }; // Não precisa mais ser global direto

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
window.openKdsStatusModal = (id) => alert(`Abrir status KDS ${id} (DEV)`); // Mantido como placeholder

// --- LÓGICA DE LISTENER DA MESA ---

/**
 * Configura o listener do Firestore para uma mesa específica.
 * @param {string} tableId - O número da mesa.
 */
export const setTableListener = (tableId) => {
    // Garante que os módulos de UI (Order e Payment) estejam prontos
    // Se não estiverem, algo deu errado no fluxo (goToScreen deveria ter carregado)
    if (!initializedModules.has('orderScreen') || !initializedModules.has('paymentScreen')) {
        console.error("setTableListener chamado antes dos módulos order/payment serem inicializados. Tentando carregá-los...");
        // Tenta carregar sob demanda como fallback (mas idealmente não deveria chegar aqui)
        Promise.all([
            import('/controllers/orderController.js').then(m => { if (!initializedModules.has('orderScreen')) { m.initOrderController(); initializedModules.add('orderScreen'); } return m; }),
            import('/controllers/paymentController.js').then(m => { if (!initializedModules.has('paymentScreen')) { m.initPaymentController(); initializedModules.add('paymentScreen'); } return m; })
        ]).catch(err => {
             console.error("Erro ao carregar módulos de fallback no setTableListener:", err);
             alert("Erro ao carregar dados da mesa.");
        });
        // Não continua com o listener se os módulos não estavam prontos
        return;
    }

    if (unsubscribeTable) unsubscribeTable(); // Desliga listener anterior, se houver
    console.log(`[APP] Configurando listener para mesa ${tableId}`);
    const tableRef = getTableDocRef(tableId);

    unsubscribeTable = onSnapshot(tableRef, async (docSnapshot) => { // Tornou-se async
        if (docSnapshot.exists()) {
            console.log(`[APP] Snapshot recebido para mesa ${tableId}`);
            currentOrderSnapshot = docSnapshot.data(); // Atualiza o snapshot global
            const firebaseSelectedItems = currentOrderSnapshot.selectedItems || [];

            // Sincroniza o array local 'selectedItems' com o Firebase
            // Faz uma comparação simples por string JSON para ver se mudou
            if (JSON.stringify(firebaseSelectedItems) !== JSON.stringify(selectedItems)) {
                 console.log("[APP] Sincronizando 'selectedItems' local com dados do Firebase.");
                 selectedItems.length = 0; // Limpa o array local (MUTÁVEL)
                 selectedItems.push(...firebaseSelectedItems); // Adiciona os itens do Firebase (MUTÁVEL)
            }

            // Chama as funções de renderização dos módulos (que já devem estar carregados)
            // Usamos import() aqui novamente para garantir que estamos chamando a versão mais recente
            // caso o módulo tenha sido recarregado (embora não deva acontecer com a lógica atual)
            try {
                const orderModule = await import('/controllers/orderController.js');
                orderModule.renderOrderScreen(currentOrderSnapshot); // Renderiza itens selecionados e cardápio
                const paymentModule = await import('/controllers/paymentController.js');
                paymentModule.renderPaymentSummary(currentTableId, currentOrderSnapshot); // Renderiza resumo da conta
            } catch (renderError) {
                 console.error("Erro ao renderizar telas após snapshot:", renderError);
            }

        } else {
             // A mesa não existe mais (foi fechada/excluída)
             console.warn(`[APP] Listener: Mesa ${tableId} não existe ou foi fechada.`);
             if (currentTableId === tableId) { // Só age se ainda estávamos olhando para essa mesa
                 alert(`Mesa ${tableId} foi fechada ou removida.`);
                 if (unsubscribeTable) unsubscribeTable(); unsubscribeTable = null;
                 currentTableId = null; currentOrderSnapshot = null; selectedItems.length = 0;
                 goToScreen('panelScreen'); // Volta para o painel
             }
        }
    }, (error) => {
        // Erro no listener (ex: permissão negada)
        console.error(`[APP] Erro no listener da mesa ${tableId}:`, error);
         if (unsubscribeTable) unsubscribeTable(); unsubscribeTable = null;
         alert("Erro ao sincronizar com a mesa. Voltando ao painel.");
         goToScreen('panelScreen');
    });
};

/**
 * Define a mesa atual, atualiza a UI e configura o listener.
 * @param {string} tableId - O número da mesa.
 */
export const setCurrentTable = (tableId) => {
    // Se já estamos nesta mesa e o listener está ativo, apenas re-renderiza
    if (currentTableId === tableId && unsubscribeTable) {
        console.log(`[APP] Listener para mesa ${tableId} já ativo. Re-renderizando.`);
        if(currentOrderSnapshot && initializedModules.has('orderScreen') && initializedModules.has('paymentScreen')){
             import('/controllers/orderController.js').then(module => module.renderOrderScreen(currentOrderSnapshot));
             import('/controllers/paymentController.js').then(module => module.renderPaymentSummary(currentTableId, currentOrderSnapshot));
        }
        return; // Não precisa reiniciar listener
    }

    currentTableId = tableId; // Define a mesa atual globalmente
    console.log(`[APP] Definindo mesa atual para ${tableId}`);

    // Atualiza os títulos nas diferentes telas
    const currentTableNumEl = document.getElementById('current-table-number'); // Header principal
    const paymentTableNumEl = document.getElementById('payment-table-number'); // Header tela pagamento
    const orderScreenTableNumEl = document.getElementById('order-screen-table-number'); // Header tela pedido
    if(currentTableNumEl) currentTableNumEl.textContent = `Mesa ${tableId}`;
    if(paymentTableNumEl) paymentTableNumEl.textContent = `Mesa ${tableId}`;
    if(orderScreenTableNumEl) orderScreenTableNumEl.textContent = `Mesa ${tableId}`;

    // Configura (ou reconfigura) o listener do Firestore para esta mesa
    setTableListener(tableId);
};

/**
 * Função chamada ao clicar em um card de mesa no painel.
 * Carrega produtos (se necessário), navega para a tela de pedido e inicia o listener.
 * @param {string} tableId - O número da mesa selecionada.
 */
export const selectTableAndStartListener = async (tableId) => {
    console.log(`[APP] Selecionando mesa ${tableId} e iniciando listener.`);
    try {
        // O carregamento de produtos agora acontece no initStaffApp, não precisa aqui
        // await fetchWooCommerceProducts();

        // Navega para a tela de pedido (o goToScreen vai carregar o módulo se necessário)
        await goToScreen('orderScreen');
        // Define a mesa atual e inicia o listener (que depende dos módulos já carregados)
        setCurrentTable(tableId);

    } catch (error) {
        console.error(`[APP] Erro ao selecionar mesa ${tableId}:`, error);
        alert("Erro ao abrir a mesa. Verifique a conexão.");
        // Opcional: voltar ao painel se falhar
        // goToScreen('panelScreen');
    }
};
// Expõe globalmente para ser chamada pelo onclick dos cards de mesa
window.selectTableAndStartListener = selectTableAndStartListener;

/**
 * Abre o modal de emissão de NF-e (simulação).
 */
window.openNfeModal = () => { // Lógica mantida como estava
    const modal = document.getElementById('nfeModal');
    if (!modal) { console.error("Modal NF-e não encontrado"); return; }
    if (!currentOrderSnapshot) { alert("Nenhuma mesa selecionada para emitir NF-e."); return; }

    const nfeError = document.getElementById('nfeError');
    const nfeErrorMessage = document.getElementById('nfeErrorMessage');
    const nfeDetails = document.getElementById('nfeDetails');
    const nfeCustomerName = document.getElementById('nfeCustomerName');
    const nfeCustomerDoc = document.getElementById('nfeCustomerDoc');
    const nfeTotalValue = document.getElementById('nfeTotalValue');
    const nfeConfirmBtn = document.getElementById('nfeConfirmBtn');

    // Reseta estado do modal
    if(nfeError) nfeError.style.display = 'none';
    if(nfeDetails) nfeDetails.style.display = 'block';
    if(nfeConfirmBtn) nfeConfirmBtn.style.display = 'block';

    // Preenche dados se houver cliente associado
    if (currentOrderSnapshot.clientId && currentOrderSnapshot.clientName) {
        if(nfeCustomerName) nfeCustomerName.textContent = currentOrderSnapshot.clientName;
        if(nfeCustomerDoc) nfeCustomerDoc.textContent = currentOrderSnapshot.clientId;

        const totalValueEl = document.getElementById('orderTotalDisplayPayment');
        if(nfeTotalValue) nfeTotalValue.textContent = totalValueEl ? totalValueEl.textContent : 'R$ 0,00';

        // Reanexa listener do botão de confirmação para evitar múltiplos cliques
        if (nfeConfirmBtn) {
            const newConfirmBtn = nfeConfirmBtn.cloneNode(true); // Clona para remover listeners antigos
            nfeConfirmBtn.parentNode.replaceChild(newConfirmBtn, nfeConfirmBtn);
            newConfirmBtn.addEventListener('click', () => {
                console.log("--- DADOS PARA NF-e (SIMULAÇÃO) ---");
                console.log("Cliente:", currentOrderSnapshot.clientName);
                console.log("Documento:", currentOrderSnapshot.clientId);
                console.log("Valor:", nfeTotalValue?.textContent);
                console.log("Itens:", currentOrderSnapshot.sentItems);
                console.log("Pagamentos:", currentOrderSnapshot.payments);
                alert("Simulação: Dados da NF-e enviados para o backend. (Verifique o console)");
                modal.style.display = 'none';
            });
        }
    } else {
        // Esconde detalhes e botão se não houver cliente
        if(nfeDetails) nfeDetails.style.display = 'none';
        if(nfeConfirmBtn) nfeConfirmBtn.style.display = 'none';
        if(nfeError) nfeError.style.display = 'block';
        if(nfeErrorMessage) nfeErrorMessage.textContent = "Nenhum cliente (CPF/CNPJ) associado a esta mesa. Associe um cliente antes de emitir a NF-e.";
    }

    modal.style.display = 'flex'; // Mostra o modal
};
window.openNfeModal = openNfeModal; // Expor globalmente


// --- FUNÇÕES DE INICIALIZAÇÃO E AUTENTICAÇÃO ---

/**
 * Inicializa a aplicação para usuários Staff (Garçom, Gerente, Caixa).
 * Carrega dados iniciais e navega para o painel de mesas.
 */
const initStaffApp = async () => {
    console.log("[INIT] Iniciando app para Staff...");
    try {
        // Carrega e inicializa o Panel Controller primeiro (essencial para a primeira tela)
        if (!initializedModules.has('panelScreen')) {
            const panelModule = await import('/controllers/panelController.js');
            panelModule.initPanelController();
            // Guarda funções globais necessárias imediatamente
            globalPanelFunctions.loadOpenTables = panelModule.loadOpenTables;
            globalPanelFunctions.renderTableFilters = panelModule.renderTableFilters;
            initializedModules.add('panelScreen');
            console.log("[INIT] PanelController carregado e inicializado.");
        }

        // Renderiza filtros de setor (agora usando a função global)
        if (globalPanelFunctions.renderTableFilters) globalPanelFunctions.renderTableFilters();
        else console.error("renderTableFilters não disponível após carregar panelController.");
        console.log("[INIT] Filtros de setor renderizados.");

        // Carrega dados do WooCommerce em segundo plano
        fetchWooCommerceProducts().catch(e => console.error("[INIT ERROR] Falha ao carregar produtos:", e));
        fetchWooCommerceCategories().catch(e => console.error("[INIT ERROR] Falha ao carregar categorias:", e));

        hideStatus(); // Esconde tela de loading
        hideLoginScreen(); // Mostra header/main
        console.log("[INIT] UI principal visível.");

        // Configura listener das mesas (agora usando a função global)
        if (globalPanelFunctions.loadOpenTables) globalPanelFunctions.loadOpenTables();
         else console.error("loadOpenTables não disponível após carregar panelController.");
        console.log("[INIT] Listener de mesas configurado.");

        // Navega para o painel (sem carregar módulo, já foi feito)
        await goToScreen('panelScreen');
        console.log("[INIT] Navegação inicial para panelScreen concluída.");

    } catch (error) {
        console.error("[INIT] Erro CRÍTICO durante initStaffApp:", error);
        alert(`Erro grave ao iniciar: ${error.message}. Verifique o console.`);
        showLoginScreen(); // Volta para o login em caso de erro grave na inicialização
    }
};

/**
 * Autentica o usuário localmente (sem Firebase Auth real).
 * @param {string} email
 * @param {string} password
 * @returns {object|null} Dados do usuário se autenticado, ou null.
 */
const authenticateStaff = (email, password) => {
    const creds = STAFF_CREDENTIALS[email];
    // Verifica se credenciais existem, senha bate e não é 'client' (se houver essa role)
    return (creds && creds.password === password && creds.role !== 'client') ? creds : null;
};

/**
 * Lida com a tentativa de login do formulário.
 */
const handleStaffLogin = async () => {
    // Garante que os elementos sejam buscados novamente dentro da função
    loginBtn = document.getElementById('loginBtn');
    loginEmailInput = document.getElementById('loginEmail');
    loginPasswordInput = document.getElementById('loginPassword');
    loginErrorMsg = document.getElementById('loginErrorMsg');

    if (!loginBtn || !loginEmailInput || !loginPasswordInput) { /* ... (validação mantida) ... */ return; }
    if (loginErrorMsg) loginErrorMsg.style.display = 'none';
    loginBtn.disabled = true; loginBtn.textContent = 'Entrando...';

    const email = loginEmailInput.value.trim();
    const password = loginPasswordInput.value.trim();

    console.log(`[LOGIN] Tentando autenticar ${email}...`);
    const staffData = authenticateStaff(email, password); // Autenticação local

    if (staffData) {
        console.log(`[LOGIN] Autenticação local OK. Role: ${staffData.role}`);
        userRole = staffData.role; // Define a role global
        try {
            const authInstance = auth;
            if (!authInstance) throw new Error("Firebase Auth não inicializado.");

            // Tenta login anônimo no Firebase (pode falhar com erro 403)
            console.log("[LOGIN] Tentando login anônimo Firebase...");
            try {
                const userCredential = await signInAnonymously(authInstance);
                userId = userCredential.user.uid;
                console.log(`[LOGIN] Login Firebase OK. UID: ${userId}`);
            } catch (authError) {
                console.warn("[LOGIN] Login anônimo Firebase falhou (Erro 403?). Usando Mock ID.", authError.code, authError.message);
                // Define um userId mock se o login anônimo falhar
                userId = `mock_${userRole}_${Date.now()}`;
                // Opcional: Mostrar um aviso mais claro ao usuário sobre o erro 403, se relevante
                // if (authError.code === 'auth/internal-error' || authError.message.includes('permission denied')) {
                //     alert("Aviso: Falha na autenticação anônima com Firebase (possível restrição de chave API). Continuando com ID local.");
                // }
            }

            // Atualiza UI com nome e role
            const userName = staffData.name || userRole;
            const userIdDisplay = document.getElementById('user-id-display');
            if(userIdDisplay) userIdDisplay.textContent = `Usuário: ${userName} | ${userRole.toUpperCase()}`;
            console.log("[LOGIN] User info display atualizado.");

            console.log("[LOGIN] Chamando initStaffApp...");
            await initStaffApp(); // Inicializa a aplicação principal
            console.log("[LOGIN] initStaffApp concluído.");

        } catch (error) { // Captura erros durante initStaffApp ou definição do userId
             console.error("[LOGIN] Erro pós-autenticação local:", error);
             alert(`Erro ao iniciar sessão: ${error.message}.`);
             showLoginScreen(); // Volta para o login em caso de erro
             if(loginErrorMsg) { loginErrorMsg.textContent = `Erro: ${error.message}`; loginErrorMsg.style.display = 'block'; }
        }
    } else {
        // Credenciais inválidas
        console.log(`[LOGIN] Credenciais inválidas para ${email}.`);
        if(loginErrorMsg) { loginErrorMsg.textContent = 'E-mail ou senha inválidos.'; loginErrorMsg.style.display = 'block'; }
    }

    // Garante que o botão seja reabilitado, mesmo se houver erro
    if (loginBtn) {
        loginBtn.disabled = false;
        loginBtn.textContent = 'Entrar';
    }
    console.log("[LOGIN] Fim do handleStaffLogin.");
};

/**
 * Lida com o logout do usuário.
 */
const handleLogout = () => {
    console.log("[LOGOUT] Iniciando...");
    const authInstance = auth;
    // Tenta deslogar do Firebase Auth anônimo se existir e não for mock
    if (authInstance && authInstance.currentUser && (!userId || !userId.startsWith('mock_'))) {
        console.log("[LOGOUT] Fazendo signOut Firebase...");
        signOut(authInstance).catch(e => console.error("Erro no sign out Firebase:", e));
    } else {
        console.log("[LOGOUT] Pulando signOut Firebase (usuário mock ou já deslogado).");
    }

    // Limpa estado global
    userId = null; currentTableId = null; selectedItems.length = 0; userRole = 'anonymous'; currentOrderSnapshot = null;
    if (unsubscribeTable) { unsubscribeTable(); unsubscribeTable = null; }

    // Limpa o cache de módulos inicializados para forçar recarga no próximo login
    initializedModules.clear();
    globalOrderFunctions = {};
    globalPaymentFunctions = {};
    globalManagerFunctions = {};
    globalUserManagementFunctions = {};
    globalPanelFunctions = {};

    showLoginScreen(); // Mostra a tela de login
    const userIdDisplay = document.getElementById('user-id-display');
    if(userIdDisplay) userIdDisplay.textContent = 'Usuário ID: Carregando...'; // Reseta display
    console.log("[LOGOUT] Concluído.");
};
window.handleLogout = handleLogout; // Expor globalmente


// --- INICIALIZAÇÃO PRINCIPAL (DOMContentLoaded) ---
document.addEventListener('DOMContentLoaded', () => {
    console.log("[INIT] DOMContentLoaded.");

    const firebaseConfig = FIREBASE_CONFIG;

    // --- Bloco TRY/CATCH Principal ---
    try { // <== O 'try' principal começa aqui
        console.log("[INIT] Config Firebase carregada.");
        // Inicializa Firebase App e Serviços
        const app = initializeApp(firebaseConfig);
        const dbInstance = getFirestore(app);
        const authInstance = getAuth(app);
        const functionsInstance = getFunctions(app, 'us-central1'); // Região importante
        initializeFirebase(dbInstance, authInstance, APP_ID, functionsInstance); // Passa instâncias para firebaseService
        console.log("[INIT] Firebase App e Serviços inicializados.");

        // Mapeia elementos Globais e de Login (necessários antes do auth state change)
        statusScreen = document.getElementById('statusScreen');
        mainContent = document.getElementById('mainContent');
        appContainer = document.getElementById('appContainer');
        mainHeader = document.getElementById('mainHeader');
        loginBtn = document.getElementById('loginBtn'); // Pode ser null se form já capturou
        loginEmailInput = document.getElementById('loginEmail');
        loginPasswordInput = document.getElementById('loginPassword');
        loginErrorMsg = document.getElementById('loginErrorMsg');
        console.log("[INIT] Elementos Globais e de Login mapeados.");

        // Listener de Autenticação Firebase (para lidar com refresh da página ou login anônimo)
        onAuthStateChanged(authInstance, async (user) => {
            console.log("[AUTH] State Changed:", user ? `User UID: ${user.uid}` : 'No user');
            if (user) {
                userId = user.uid; // Guarda o UID do Firebase
                console.log(`[AUTH] Usuário Firebase ${userId} detectado.`);
                // Verifica se JÁ temos uma role definida pelo login local (handleStaffLogin)
                if (userRole === 'gerente' || userRole === 'garcom' || userRole === 'caixa') {
                     console.log(`[AUTH] Role ${userRole} já definida via login local. Iniciando app...`);
                     const userName = STAFF_CREDENTIALS[loginEmailInput?.value?.trim()]?.name || userRole; // Pega nome das credenciais
                     const userIdDisplay = document.getElementById('user-id-display');
                     if(userIdDisplay) userIdDisplay.textContent = `Usuário: ${userName} | ${userRole.toUpperCase()}`;
                     await initStaffApp(); // Inicia o app principal
                } else if (!window.location.pathname.includes('client.html')) {
                    // Estado inconsistente: usuário Firebase existe, mas login local não aconteceu. Força logout.
                    console.warn("[AUTH] Usuário Firebase existe, mas role local é 'anonymous'. Forçando logout.");
                    handleLogout();
                } else {
                     console.log("[AUTH] Usuário Firebase existe na tela do cliente. (Ignorando para client.html)");
                }
            } else if (!window.location.pathname.includes('client.html')) { // Se não tem usuário Firebase E não é client.html
                 console.log("[AUTH] Nenhum usuário Firebase logado. -> showLoginScreen()");
                 showLoginScreen(); // Mostra a tela de login
            } else {
                 console.log("[AUTH] Nenhum usuário Firebase logado na tela do cliente. (Ignorando para client.html)");
                 // Poderia redirecionar ou mostrar erro no client.html aqui, se necessário
            }
        });
        console.log("[INIT] Listener AuthStateChanged configurado.");

        // Listener do Formulário de Login (usa 'submit')
        const loginForm = document.getElementById('loginForm');
        if (loginForm) {
            loginForm.addEventListener('submit', (e) => {
                e.preventDefault(); // Impede recarregamento da página
                handleStaffLogin(); // Chama a função de login
            });
            console.log("[INIT] Listener do form Login adicionado.");
        } else if (!window.location.pathname.includes('client.html')) {
            console.error("[INIT] Form de Login (loginForm) não encontrado!");
        }

        // Inicialização dos Controllers REMOVIDA daqui (agora feita sob demanda)
        console.log("[INIT] Inicializadores estáticos removidos (agora sob demanda).");

        // Listeners Globais do Header (sempre presentes após login)
        const openManagerPanelBtn = document.getElementById('openManagerPanelBtn');
        const logoutBtnHeader = document.getElementById('logoutBtnHeader');
        const openNfeModalBtn = document.getElementById('openNfeModalBtn'); // Botão NF-e na tela de pagamento

        if (openManagerPanelBtn) openManagerPanelBtn.addEventListener('click', () => { window.openManagerAuthModal('goToManagerPanel'); });
        if (logoutBtnHeader) logoutBtnHeader.addEventListener('click', handleLogout);
        // O listener do NFE é adicionado no initPaymentController, pois só existe naquela tela

        console.log("[INIT] Listeners restantes adicionados.");

    } catch (e) { // <== O 'catch' principal correspondente está aqui
        console.error("Erro CRÍTICO na inicialização (DOMContentLoaded):", e);
        alert(`Falha grave ao carregar o PDV: ${e.message}. Verifique o console.`);
        // Mostra uma mensagem de erro na tela de loading se ela ainda existir
        if(statusScreen) {
             statusScreen.innerHTML = `
                <div class="flex flex-col items-center p-8 max-w-sm w-full text-center">
                    <i class="fas fa-times-circle text-4xl text-red-500 mb-4"></i>
                    <h2 class="text-xl font-bold mb-2 text-red-400">Erro de Inicialização</h2>
                    <p class="text-dark-placeholder">${e.message}</p>
                 </div>`;
             statusScreen.style.display = 'flex'; // Garante que esteja visível
        }
        return; // Interrompe a execução se houver erro crítico
    } // <== O 'catch' principal TERMINA aqui.

    console.log("[INIT] DOMContentLoaded finalizado com sucesso.");

}); // <== FIM do Bloco Principal addEventListener.
// Fim do arquivo app.js
