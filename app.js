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
        // **CORREÇÃO:** Usa !important para sobrescrever o estilo inline
        statusScreen.style.cssText = 'display: none !important'; 
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

    hideStatus(); // Esconde "Iniciando..." (agora com !important)
    
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
    if (!mainHeader) mainHeader = document.getElementById('mainHeader'); // Garante mapeamento
    if (!mainContent) mainContent = document.getElementById('mainContent'); // Garante mapeamento

    if (mainHeader) mainHeader.style.display = 'flex'; // Mostra o header principal
    if (mainContent) mainContent.style.display = 'block'; // Garante que main content está visível
    document.body.classList.add('logged-in'); // Adiciona classe para indicar login

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
    if (!appContainer) appContainer = document.getElementById('appContainer'); // Garante mapeamento
    if (!mainContent) mainContent = document.getElementById('mainContent'); // Garante mapeamento

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
        unsubscribeTable();
        unsubscribeTable = null;
        currentTableId = null; // Limpa mesa ativa ao voltar
        currentOrderSnapshot = null;
        selectedItems = [];
        // Limpa displays de número da mesa
        const currentTableNumEl = document.getElementById('current-table-number');
        const paymentTableNumEl = document.getElementById('payment-table-number');
        if(currentTableNumEl) currentTableNumEl.textContent = `Mesa`;
        if(paymentTableNumEl) paymentTableNumEl.textContent = `Mesa`;
    }

    const screenIndex = screens[screenId];
    if (screenIndex !== undefined) {
        console.log(`[NAV] Navegando para ${screenId} (índice ${screenIndex})`);
        if (appContainer) {
            appContainer.style.transform = `translateX(-${screenIndex * 100}vw)`;
        }
        // Garante que mainContent esteja visível ao navegar para qualquer tela pós-login
        if (mainContent && screenId !== 'loginScreen') mainContent.style.display = 'block';

        document.body.classList.toggle('bg-gray-900', screenId === 'managerScreen');
        document.body.classList.toggle('bg-dark-bg', screenId !== 'managerScreen');
    } else {
        console.error(`[NAV] Tentativa de navegar para tela inválida: ${screenId}`);
    }
};
window.goToScreen = goToScreen; // Expor globalmente

// Expor funções globais necessárias dos controllers que são chamadas pelo HTML
window.openManagerAuthModal = openManagerAuthModal;
window.deletePayment = deletePayment; // Exportada de paymentController, exposta aqui
window.handleMassActionRequest = handleMassActionRequest; // Exportada de paymentController, exposta aqui
window.handleConfirmTableTransfer = handleConfirmTableTransfer; // Exportada de paymentController, exposta aqui
window.openTableTransferModal = openTableTransferModal; // Exportada de paymentController, exposta aqui
window.openKdsStatusModal = (id) => alert(`Abrir status KDS ${id} (DEV)`); // Placeholder


// Listener da Mesa (atualiza controllers relevantes)
export const setTableListener = (tableId) => {
    if (unsubscribeTable) unsubscribeTable(); // Cancela listener anterior
    console.log(`[APP] Configurando listener para mesa ${tableId}`);
    const tableRef = getTableDocRef(tableId);
    unsubscribeTable = onSnapshot(tableRef, (docSnapshot) => {
        if (docSnapshot.exists()) {
            console.log(`[APP] Snapshot recebido para mesa ${tableId}`);
            currentOrderSnapshot = docSnapshot.data();
            // Atualiza selectedItems local APENAS se mudou no Firebase E não estamos na tela de pedido
            const firebaseSelectedItems = currentOrderSnapshot.selectedItems || [];
            const isOrderScreenActive = appContainer?.style.transform === `translateX(-${screens['orderScreen'] * 100}vw)`;
            if (!isOrderScreenActive && JSON.stringify(firebaseSelectedItems) !== JSON.stringify(selectedItems)) {
                console.log("[APP] Atualizando selectedItems local com dados do Firebase.");
                selectedItems.length = 0;
                selectedItems.push(...firebaseSelectedItems);
            }
            renderOrderScreen(currentOrderSnapshot); // Atualiza Painel 2
            renderPaymentSummary(currentTableId, currentOrderSnapshot); // Atualiza Painel 3
        } else {
             console.warn(`[APP] Listener: Mesa ${tableId} não existe ou foi fechada.`);
             if (currentTableId === tableId) {
                 alert(`Mesa ${tableId} foi fechada ou removida.`);
                 if (unsubscribeTable) unsubscribeTable(); unsubscribeTable = null;
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
    // Atualiza UIs
    const currentTableNumEl = document.getElementById('current-table-number');
    const paymentTableNumEl = document.getElementById('payment-table-number');
    if(currentTableNumEl) currentTableNumEl.textContent = `Mesa ${tableId}`;
    if(paymentTableNumEl) paymentTableNumEl.textContent = `Mesa ${tableId}`;
    setTableListener(tableId); // Inicia o listener
};

// Função movida do panelController para quebrar dependência circular
export const selectTableAndStartListener = async (tableId) => {
    console.log(`[APP] Selecionando mesa ${tableId} e iniciando listener.`);
    try {
        await fetchWooCommerceProducts(/* Callback opcional */); // Garante menu
        setCurrentTable(tableId); // Define mesa e inicia listener
        goToScreen('orderScreen'); // Navega
    } catch (error) {
        console.error(`[APP] Erro ao selecionar mesa ${tableId}:`, error);
        alert("Erro ao abrir a mesa. Verifique a conexão.");
    }
};
// Expor globalmente para ser chamada pelo panelController
window.selectTableAndStartListener = selectTableAndStartListener;

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
const authenticateStaff = (email, password) => {
    const creds = STAFF_CREDENTIALS[email];
    return (creds && creds.password === password && creds.role !== 'client') ? creds : null;
};

// Define handleStaffLogin no escopo do módulo para garantir que esteja acessível
const handleStaffLogin = async () => {
    // Garante que os elementos de login estejam acessíveis aqui
    loginBtn = document.getElementById('loginBtn');
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
        onAuthStateChanged(authInstance, async (user) => { // Tornar async
            console.log("[AUTH] State Changed:", user ? `User UID: ${user.uid}` : 'No user');

            if (user) {
                // Usuário Firebase detectado (sessão anônima persistiu?)
                userId = user.uid; // Garante que userId esteja correto
                console.log(`[AUTH] Usuário Firebase ${userId} detectado.`);

                // Verifica se já temos uma role definida (pode ter vindo de um login local anterior)
                if (userRole === 'gerente' || userRole === 'garcom') {
                    console.log(`[AUTH] Role ${userRole} já definida. Iniciando app...`);
                     const userName = STAFF_CREDENTIALS[loginEmailInput?.value?.trim()]?.name || userRole; // Tenta pegar nome do input se ainda estiver lá
                     document.getElementById('user-id-display').textContent = `Usuário: ${userName} | ${userRole.toUpperCase()}`; // Atualiza display
                    await initStaffApp(); // Inicia app para usuário existente
                } else {
                    // Usuário Firebase existe, mas não temos role local (caso estranho)
                    console.warn("[AUTH] Usuário Firebase existe, mas role local é 'anonymous'. Forçando logout para relogin.");
                    handleLogout(); // Força o logout para o usuário logar de novo e definir a role
                }

            } else if (userRole !== 'gerente' && userRole !== 'garcom') {
                 // Nenhum usuário Firebase E userRole não é de staff -> mostra tela de login
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
