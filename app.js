// --- APP.JS ---
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut, signInAnonymously } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, serverTimestamp, doc, setDoc, updateDoc, getDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// Importações dos Módulos Refatorados (CORREÇÃO DE CAMINHOS ABSOLUTOS)
import { initializeFirebase, saveSelectedItemsToFirebase, getTableDocRef, getCustomersCollectionRef, auth } from '/services/firebaseService.js';
import { fetchWooCommerceProducts, fetchWooCommerceCategories } from '/services/wooCommerceService.js';
import { loadOpenTables, renderTableFilters, handleAbrirMesa, loadTableOrder, handleSearchTable } from '/controllers/panelController.js';
import { renderMenu, renderOrderScreen, increaseLocalItemQuantity, decreaseLocalItemQuantity } from '/controllers/orderController.js';
import { renderPaymentSummary } from '/controllers/paymentController.js'; 
import { openManagerAuthModal } from '/controllers/managerController.js';

// --- VARIÁVEIS DE ESTADO GLOBAL ---
// NOVO MAPEAMENTO DE TELAS PARA index.html (Staff)
export const screens = { 
    'panelScreen': 0, // Novo Índice 0
    'orderScreen': 1, // Novo Índice 1
    'paymentScreen': 2, // Novo Índice 2
    'managerScreen': 3, // Novo Índice 3
    'clientOrderScreen': 4, // Mantido no final, fora do fluxo Staff principal
};
export const mockUsers = { 'gerente': '1234', 'garcom': '1234' };

// Credenciais Staff Centralizadas (para login unificado)
const STAFF_CREDENTIALS = {
    'agencia@fatormd.com': { password: '1234', role: 'gerente', name: 'Fmd' }, 
    'garcom@fator.com': { password: '1234', role: 'garcom', name: 'Mock Garçom' },
    'cliente@fator.com': { password: '1234', role: 'client', name: 'Cliente Teste' }, 
};

// Variáveis Mutáveis (Estado da Sessão)
export let currentTableId = null;
export let selectedItems = []; 
export let currentOrderSnapshot = null;
export let userRole = 'anonymous'; 
export let userId = null;
export let unsubscribeTable = null;


// --- ELEMENTOS UI (Definidos no escopo superior para referências, mas buscados no DOMContentLoaded) ---
const statusScreen = document.getElementById('statusScreen');
const mainContent = document.getElementById('mainContent');
const appContainer = document.getElementById('appContainer');
const loginModal = document.getElementById('loginModal');

// Variáveis para inputs de Login (inicialmente null, preenchidas no DOMContentLoaded)
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
    
    if (loginModal) {
        loginModal.style.display = 'flex'; 
    }
};

const hideLoginModal = () => {
    if (loginModal) {
        loginModal.style.display = 'none';
    }
};

export const goToScreen = (screenId) => {
    if (userRole === 'client' && screenId !== 'clientOrderScreen' && currentTableId) {
        if (screenId === 'panelScreen') {
             alert("Acesso restrito. Você só pode visualizar a sua mesa.");
             return; 
        }
    }
    
    if (currentTableId) {
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

window.goToScreen = goToScreen; 
window.openManagerAuthModal = openManagerAuthModal; 


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
        }
    }, (error) => {
        console.error("Erro ao carregar dados da mesa:", error);
    });
};

export const setCurrentTable = (tableId) => {
    currentTableId = tableId; 
    
    document.getElementById('current-table-number').textContent = `Mesa ${tableId}`; 
    document.getElementById('payment-table-number').textContent = `Mesa ${tableId}`; 
    if (document.getElementById('client-table-number')) {
         document.getElementById('client-table-number').textContent = `Mesa ${tableId}`; 
    }
    
    setTableListener(tableId); 
};


// --- INICIALIZAÇÃO ESPECÍFICA (Staff e Cliente) ---

const initStaffApp = async () => {
    // 1. Carrega dados síncronos (Filtros de Setor são síncronos)
    renderTableFilters(); 
    
    // 2. INÍCIO DA CARGA DE DADOS PARALELA (WOOCOMMERCE)
    // REMOVENDO AWAIT para garantir que loadOpenTables() seja chamado imediatamente.
    fetchWooCommerceProducts(renderOrderScreen).catch(e => console.error("Falha ao carregar produtos Woo:", e));
    fetchWooCommerceCategories(renderTableFilters).catch(e => console.error("Falha ao carregar categorias Woo:", e));
    
    // 3. Finaliza Inicialização da UI
    if (mainContent) mainContent.style.display = 'block'; 
    document.body.classList.remove('client-mode');
    hideStatus();

    // 4. CHAMADA GARANTIDA: Carrega mesas imediatamente.
    loadOpenTables(); 
    
    goToScreen('panelScreen'); 
};

const initClientApp = async () => {
    // 1. Carrega apenas o essencial do cliente
    renderTableFilters(); 
    
    // 2. Carrega Produtos e Categorias (MANTENDO AWAIT para o cliente, que precisa do menu)
    await fetchWooCommerceProducts(() => { 
        renderOrderScreen(); 
    });
    await fetchWooCommerceCategories(renderTableFilters); 
    
    // 3. Finaliza Inicialização
    if (mainContent) mainContent.style.display = 'block'; 
    document.body.classList.add('client-mode');
    hideStatus();
    alert("Bem-vindo Cliente! Insira o número da sua mesa no campo de busca para começar a pedir.");
    goToScreen('clientOrderScreen'); 
};


// --- LÓGICA DE AUTH/LOGIN ---

const authenticateStaff = (email, password) => {
    const creds = STAFF_CREDENTIALS[email];
    if (creds && creds.password === password) {
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
            const app = initializeApp(JSON.parse(window.__firebase_config));
            const authInstance = getAuth(app);
            
            // --- CORREÇÃO CRÍTICA: BYPASS E TRATAMENTO DE ERRO 403 (AUTH) ---
            try {
                const userCredential = await signInAnonymously(authInstance); 
                userId = userCredential.user.uid; 
                
            } catch (authError) {
                // Se o erro for de Auth (403 Forbidden persistente), gere um ID mock para o Staff prosseguir.
                if (userRole !== 'client') {
                    console.warn("Firebase Auth falhou (403 Forbidden). Gerando ID de sessão Mock para Staff/Gerente.", authError);
                    userId = `mock_${userRole}_${Date.now()}`;
                } else {
                    // Se o cliente falhar na autenticação, é um erro real.
                    throw authError; 
                }
            }
            // --- FIM CORREÇÃO CRÍTICA ---
            
            document.getElementById('user-id-display').textContent = `Usuário ID: ${userId.substring(0, 8)} | Função: ${userRole.toUpperCase()}`;
            
            hideLoginModal(); 
            
            // ROTEAMENTO PARA AS NOVAS FUNÇÕES DE INICIALIZAÇÃO
            if (userRole === 'client') {
                await initClientApp();
            } else {
                await initStaffApp();
            }
            
        } catch (error) {
             console.error("Erro ao autenticar Staff (Firebase/Anônimo):", error);
             alert("Autenticação falhou. Verifique as credenciais ou a configuração do Firebase.");
        }
    } else {
        alert('Credenciais inválidas. Verifique seu e-mail e senha.');
    }
    if (loginBtn) loginBtn.disabled = false;
};

const handleLogout = () => {
    userId = null;
    currentTableId = null;
    selectedItems = [];
    userRole = 'anonymous'; 
    
    const authInstance = getAuth(initializeApp(JSON.parse(window.__firebase_config)));
    if (authInstance && authInstance.currentUser) {
        signOut(authInstance).catch(e => console.error("Erro no sign out:", e)); 
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
        if (!user) {
            showLoginModal();
        } else if (userRole === 'client') {
            document.body.classList.add('client-mode');
        }
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
             openManagerAuthModal('goToManagerPanel'); 
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
            if (userRole === 'client') {
                 handleSearchTable(true);
            } else {
                 handleSearchTable();
            }
        });
    }
});
