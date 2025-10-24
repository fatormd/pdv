// --- APP.JS ---
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut, signInAnonymously } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, serverTimestamp, doc, setDoc, updateDoc, getDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// Importações dos Módulos Refatorados
import { initializeFirebase, saveSelectedItemsToFirebase, getTableDocRef, auth } from '/services/firebaseService.js'; // Removido getCustomersCollectionRef
import { fetchWooCommerceProducts, fetchWooCommerceCategories } from '/services/wooCommerceService.js';
import { loadOpenTables, renderTableFilters, handleAbrirMesa, loadTableOrder, handleSearchTable } from '/controllers/panelController.js';
import { renderMenu, renderOrderScreen, increaseLocalItemQuantity, decreaseLocalItemQuantity, openObsModalForGroup } from '/controllers/orderController.js'; // Removido renderClientOrderScreen, openClientObsModalForGroup
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
// export const mockUsers = { 'gerente': '1234', 'garcom': '1234' }; // Mock não é mais necessário com STAFF_CREDENTIALS

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
    // REMOVIDA: Verificação de userRole === 'client'
    
    if (currentTableId && screenId === 'panelScreen') { // Salva apenas ao voltar para o painel principal
        saveSelectedItemsToFirebase(currentTableId, selectedItems);
    }
    
    if (screenId === 'panelScreen' && currentTableId && unsubscribeTable) {
        unsubscribeTable(); 
        unsubscribeTable = null; 
    }

    const screenIndex = screens[screenId];
    if (screenIndex !== undefined) {
        if (appContainer) {
            appContainer.style.transform = `translateX(-${screenIndex * 100}vw)`;
        }
        document.body.classList.toggle('bg-gray-900', screenId === 'managerScreen');
        document.body.classList.toggle('bg-gray-100', screenId !== 'managerScreen');
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
            
            // Chama renderOrderScreen (que renderiza apenas a tela Staff agora)
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
    // 1. Carrega dados síncronos (Filtros de Setor são síncronos)
    renderTableFilters(); 
    
    // 2. INÍCIO DA CARGA DE DADOS PARALELA (WOOCOMMERCE)
    fetchWooCommerceProducts(renderOrderScreen).catch(e => console.error("Falha ao carregar produtos Woo:", e));
    fetchWooCommerceCategories(renderTableFilters).catch(e => console.error("Falha ao carregar categorias Woo:", e));
    
    // 3. Finaliza Inicialização da UI
    if (mainContent) mainContent.style.display = 'block'; 
    // REMOVIDO: document.body.classList.remove('client-mode'); // Não é mais necessário
    hideStatus();

    // 4. CHAMADA GARANTIDA: Carrega mesas imediatamente.
    loadOpenTables(); 
    
    goToScreen('panelScreen'); 
};

// REMOVIDO: initClientApp


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
    
    const staffData = authenticateStaff(email, password);

    if (staffData) {
        userRole = staffData.role;
        
        try {
            const authInstance = auth; 
            if (!authInstance) throw new Error("Firebase Auth não inicializado. Recarregue a página.");
            
            // Tenta login anônimo (pode falhar com 403, tratado abaixo)
            try {
                const userCredential = await signInAnonymously(authInstance); 
                userId = userCredential.user.uid; 
                
            } catch (authError) {
                 // Gera ID mock SE o login anônimo falhar (comum em regras restritas)
                console.warn("Firebase Auth anônimo falhou. Gerando ID de sessão Mock para Staff/Gerente.", authError);
                userId = `mock_${userRole}_${Date.now()}`;
            }
            
            document.getElementById('user-id-display').textContent = `Usuário ID: ${userId.substring(0, 8)} | Função: ${userRole.toUpperCase()}`;
            
            hideLoginModal(); 
            
            // INICIALIZA A APLICAÇÃO STAFF
            await initStaffApp();
            
        } catch (error) {
             console.error("Erro ao autenticar Staff:", error);
             alert("Autenticação falhou. Verifique as credenciais ou a configuração do Firebase.");
        }
    } else {
        alert('Credenciais inválidas ou não permitidas para Staff. Verifique seu e-mail e senha.');
    }
    if (loginBtn) loginBtn.disabled = false;
};

const handleLogout = () => {
    userId = null;
    currentTableId = null;
    selectedItems = [];
    userRole = 'anonymous'; 
    
    const authInstance = auth;
    if (authInstance && authInstance.currentUser) {
        // Apenas faz signOut se não for um usuário Mock
        if (!userId || !userId.startsWith('mock_')) { 
            signOut(authInstance).catch(e => console.error("Erro no sign out:", e)); 
        }
    }
    
    goToScreen('panelScreen');
    showLoginModal();
    document.getElementById('user-id-display').textContent = 'Usuário ID: Carregando...';
};

window.handleLogout = handleLogout;


// --- INITIALIZATION ---
let firebaseConfig;
document.addEventListener('DOMContentLoaded', () => {
    
    firebaseConfig = JSON.parse(window.__firebase_config);

    const loginBtnElement = document.getElementById('loginBtn');
    const loginEmailInputElement = document.getElementById('loginEmail'); 
    const loginPasswordInputElement = document.getElementById('loginPassword');
    const searchTableInputElement = document.getElementById('searchTableInput'); 
    
    loginBtn = loginBtnElement;
    loginEmailInput = loginEmailInputElement;
    loginPasswordInput = loginPasswordInputElement;
    searchTableInput = searchTableInputElement;
    
    const app = initializeApp(firebaseConfig); 
    const dbInstance = getFirestore(app);
    const authInstance = getAuth(app);
    
    initializeFirebase(dbInstance, authInstance, window.__app_id || 'pdv_default_app'); 

    onAuthStateChanged(authInstance, (user) => {
        if (!user && userRole !== 'gerente' && userRole !== 'garcom') { // Mostra login se não estiver logado como staff
            showLoginModal();
        } 
        // REMOVIDO: else if (userRole === 'client') ...
    });

    // 1. Event Listeners de Login
    if (loginBtn) {
        loginBtn.addEventListener('click', handleStaffLogin);
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
            // REMOVIDO: Verificação de isClientFlow
             handleSearchTable();
        });
    }

    // Listener para NF-e
    const openNfeModalBtn = document.getElementById('openNfeModalBtn');
    if (openNfeModalBtn) openNfeModalBtn.addEventListener('click', window.openNfeModal);
});
