// --- APP.JS ---
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut, signInAnonymously } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, serverTimestamp, doc, setDoc, updateDoc, getDoc, onSnapshot, writeBatch, arrayRemove, arrayUnion } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// Importações (mantidas)
import { initializeFirebase, saveSelectedItemsToFirebase, getTableDocRef, auth, db } from '/services/firebaseService.js';
import { fetchWooCommerceProducts, fetchWooCommerceCategories } from '/services/wooCommerceService.js';
import { formatCurrency, formatElapsedTime } from '/utils.js';
import { loadOpenTables, renderTableFilters, handleAbrirMesa, handleSearchTable, initPanelController } from '/controllers/panelController.js';
import { renderMenu, renderOrderScreen, increaseLocalItemQuantity, decreaseLocalItemQuantity, openObsModalForGroup, initOrderController, handleSendSelectedItems } from '/controllers/orderController.js';
import {
    renderPaymentSummary, deletePayment, handleMassActionRequest,
    initPaymentController, handleFinalizeOrder,
    handleMassDeleteConfirmed, executeDeletePayment,
    openTableTransferModal // handleConfirmTableTransfer é LOCAL aqui
} from '/controllers/paymentController.js';
import { initManagerController, handleGerencialAction } from '/controllers/managerController.js';

// --- CONFIGURAÇÃO E VARIÁVEIS GLOBAIS ---
const APP_ID = "pdv_fator_instance_001";
const FIREBASE_CONFIG = { apiKey: "AIzaSyCQINQFRyAES3hkG8bVpQlRXGv9AzQuYYY", authDomain: "fator-pdv.firebaseapp.com", projectId: "fator-pdv", storageBucket: "fator-pdv.appspot.com", messagingSenderId: "1097659747429", appId: "1:1097659747429:web:8ec0a7c3978c311dbe0a8c" };
export const screens = { 'loginScreen': 0, 'panelScreen': 1, 'orderScreen': 2, 'paymentScreen': 3, 'managerScreen': 4 };
const STAFF_CREDENTIALS = { 'agencia@fatormd.com': { password: '1234', role: 'gerente', name: 'Fmd' }, 'garcom@fator.com': { password: '1234', role: 'garcom', name: 'Mock Garçom' } };
const MANAGER_PASSWORD = '1234';
export let currentTableId = null;
export let selectedItems = [];
export let currentOrderSnapshot = null;
export let userRole = 'anonymous';
export let userId = null;
export let unsubscribeTable = null;
let statusScreen = null;
let mainContent = null;
let appContainer = null;
let loginScreen = null;
let mainHeader = null;
let loginBtn = null;
let loginEmailInput = null;
let loginPasswordInput = null;
let loginErrorMsg = null;
let isLoginProcessActive = false; // Flag para prevenir race condition no login

// --- FUNÇÕES CORE E ROTIAMENTO ---
export const hideStatus = () => {
    if (!statusScreen) statusScreen = document.getElementById('statusScreen');
    if (statusScreen) {
        // console.log("[hideStatus] Hiding status screen."); // Debug
        statusScreen.style.cssText = 'display: none !important;';
    } else { console.error("[hideStatus] statusScreen element NOT found!"); }
};
const showLoginScreen = () => {
    console.log("[UI] showLoginScreen called."); // Debug
    // Mapeia elementos essenciais se ainda não mapeados
    if (!mainContent) mainContent = document.getElementById('mainContent');
    if (!mainHeader) mainHeader = document.getElementById('mainHeader');
    if (!appContainer) appContainer = document.getElementById('appContainer');
    if (!loginEmailInput) loginEmailInput = document.getElementById('loginEmail');
    if (!loginPasswordInput) loginPasswordInput = document.getElementById('loginPassword');
    if (!loginErrorMsg) loginErrorMsg = document.getElementById('loginErrorMsg');

    hideStatus(); // Garante que status esteja escondido

    if (mainHeader) mainHeader.style.display = 'none';
    if (mainContent) mainContent.style.display = 'block';
    if (appContainer) appContainer.style.transform = `translateX(0vw)`; // Vai para tela de login
    document.body.classList.remove('logged-in'); // Remove classe de logado

    if(loginEmailInput) loginEmailInput.value = '';
    if(loginPasswordInput) loginPasswordInput.value = '';
    if(loginErrorMsg) loginErrorMsg.style.display = 'none';
    console.log("[UI] showLoginScreen finished."); // Debug
};
const hideLoginScreen = () => {
    console.log("[UI] hideLoginScreen called."); // Debug
    if (!mainHeader) mainHeader = document.getElementById('mainHeader');
    if (!mainContent) mainContent = document.getElementById('mainContent');
    if (mainHeader) mainHeader.style.display = 'flex';
    if (mainContent) mainContent.style.display = 'block';
    document.body.classList.add('logged-in');

    const logoutBtn = document.getElementById('logoutBtnHeader');
    const managerBtn = document.getElementById('openManagerPanelBtn');
    if (logoutBtn) logoutBtn.classList.remove('hidden');
    if (managerBtn) { managerBtn.classList.toggle('hidden', userRole !== 'gerente'); }
};
export const goToScreen = (screenId) => {
    // console.log(`[NAV] Request to navigate to ${screenId}`); // Debug
     if (!appContainer) appContainer = document.getElementById('appContainer');
     if (!mainContent) mainContent = document.getElementById('mainContent');

     // Salva itens ANTES de sair da tela de pedido/pagamento para o painel
     if (currentTableId && screenId === 'panelScreen') {
        const currentTransform = appContainer?.style.transform || '';
        const currentScreenKey = Object.keys(screens).find(key => screens[key] * -100 + 'vw' === currentTransform.replace(/translateX\((.*?)\)/, '$1'));
        if (currentScreenKey === 'orderScreen' || currentScreenKey === 'paymentScreen') {
             console.log(`[NAV] Saving selectedItems for table ${currentTableId} before leaving ${currentScreenKey}`);
            saveSelectedItemsToFirebase(currentTableId, selectedItems);
        }
    }

    // Desliga listener e limpa estado AO SAIR de uma mesa (indo para painel ou login)
    if ((screenId === 'panelScreen' || screenId === 'loginScreen') && currentTableId && unsubscribeTable) {
        console.log(`[NAV] Unsubscribing from table ${currentTableId} listener.`);
        unsubscribeTable(); unsubscribeTable = null;
        currentTableId = null; currentOrderSnapshot = null; selectedItems.length = 0;
        // Reseta títulos
        const headerTitleEl = document.getElementById('current-table-number');
        const paymentTitleEl = document.getElementById('payment-table-number');
        const orderTitleEl = document.getElementById('order-screen-table-number');
        if(headerTitleEl) headerTitleEl.textContent = 'Fator MD';
        if(paymentTitleEl) paymentTitleEl.textContent = `Mesa`;
        if(orderTitleEl) orderTitleEl.textContent = 'Pedido';
    }

    // Aplica a transformação para mudar de tela
    const screenIndex = screens[screenId];
    if (screenIndex !== undefined) {
        console.log(`[NAV] Navigating to ${screenId} (index ${screenIndex})`);
        if (appContainer) appContainer.style.transform = `translateX(-${screenIndex * 100}vw)`;
        if (mainContent && screenId !== 'loginScreen') mainContent.style.display = 'block'; // Garante main visível
        document.body.classList.toggle('bg-gray-900', screenId === 'managerScreen');
        document.body.classList.toggle('bg-dark-bg', screenId !== 'managerScreen');
    } else { console.error(`[NAV] Invalid screenId: ${screenId}`); }
};
window.goToScreen = goToScreen;

// Lógica de Transferência (Revisada com logs e navegação no final)
export const handleTableTransferConfirmed = async (originTableId, targetTableId, itemsToTransfer, newDiners = 0, newSector = '') => {
    console.log(`[APP] handleTableTransferConfirmed: origin=${originTableId}, target=${targetTableId}, items=${itemsToTransfer.length}`);
    if (!originTableId || !targetTableId || itemsToTransfer.length === 0) { /* ... */ return; }

    const originTableRef = getTableDocRef(originTableId);
    const targetTableRef = getTableDocRef(targetTableId);
    const dbInstance = db;
    if (!dbInstance) { alert("Erro de conexão."); return; }

    const batch = writeBatch(dbInstance);
    let closeOriginTableConfirmed = false;
    let transferSuccessful = false; // Flag para controlar navegação

    try {
        const originSnap = await getDoc(originTableRef);
        const originSentItems = originSnap.data()?.sentItems || [];
        let allOriginItemsWillBeTransferred = false;
        // ... (lógica de comparação mantida) ...
        if (allOriginItemsWillBeTransferred) { closeOriginTableConfirmed = confirm(/* ... */); }

        const targetSnap = await getDoc(targetTableRef);
        const targetTableIsOpen = targetSnap.exists() && targetSnap.data().status?.toLowerCase() === 'open';

        // 1. Setup Mesa Destino (mantido)
        if (!targetTableIsOpen) { /* ... */ }
        // 2. Remove da Origem (mantido)
        const transferValue = itemsToTransfer.reduce((sum, item) => sum + (item.price || 0), 0);
        const originCurrentTotal = originSnap.data()?.total || 0;
        const originNewTotal = Math.max(0, originCurrentTotal - transferValue);
        itemsToTransfer.forEach(item => { batch.update(originTableRef, { sentItems: arrayRemove(item) }); });
        batch.update(originTableRef, { total: originNewTotal });
        // 3. Fecha Origem se Confirmado (mantido)
        if (closeOriginTableConfirmed) { batch.update(originTableRef, { status: 'closed' }); }
        // 4. Adiciona ao Destino (mantido)
        const targetData = targetTableIsOpen ? targetSnap.data() : { total: 0 };
        const targetNewTotal = (targetData.total || 0) + transferValue;
        batch.update(targetTableRef, { sentItems: arrayUnion(...itemsToTransfer), total: targetNewTotal });

        console.log("[APP] Committing transfer batch...");
        await batch.commit(); // <<< COMMIT
        console.log("[APP] Transfer batch committed successfully.");
        transferSuccessful = true; // Marca como sucesso

        alert(`Sucesso! ${itemsToTransfer.length} item(s) transferidos.${closeOriginTableConfirmed ? ' A mesa de origem foi fechada.' : ''}`);

    } catch (e) {
        console.error("Erro CRÍTICO na transferência:", e);
        alert(`Falha CRÍTICA na transferência: ${e.message}.`);
        transferSuccessful = false; // Marca como falha
         // Reabilita botão no modal em caso de erro
         const modal = document.getElementById('tableTransferModal');
         if(modal) { /* ... (reabilitar botão) ... */ }
    } finally {
        // Navega para o painel APENAS se o commit foi bem sucedido
        if (transferSuccessful) {
            console.log("[APP] Navigating to panelScreen after successful transfer.");
            goToScreen('panelScreen'); // <<< NAVEGAÇÃO APÓS SUCESSO
        }
    }
};
window.handleTableTransferConfirmed = handleTableTransferConfirmed;

// MODAL DE AUTENTICAÇÃO GLOBAL (mantido)
window.openManagerAuthModal = (action, payload = null) => { /* ... */ };

// Expor funções globais (mantido)
window.deletePayment = deletePayment;
window.handleMassActionRequest = handleMassActionRequest;
window.openTableTransferModal = openTableTransferModal;
window.openKdsStatusModal = (id) => alert(`Abrir status KDS ${id} (DEV)`);
window.increaseLocalItemQuantity = increaseLocalItemQuantity;
window.decreaseLocalItemQuantity = decreaseLocalItemQuantity;
window.openObsModalForGroup = openObsModalForGroup;

// Listener da Mesa (GARANTIR que chama renderPaymentSummary)
export const setTableListener = (tableId) => {
    if (unsubscribeTable) unsubscribeTable();
    console.log(`[APP] Setting up listener for table ${tableId}`);
    const tableRef = getTableDocRef(tableId);
    unsubscribeTable = onSnapshot(tableRef, (docSnapshot) => {
        if (docSnapshot.exists()) {
            console.log(`[APP] Snapshot received for table ${tableId}`);
            currentOrderSnapshot = docSnapshot.data(); // Atualiza snapshot global
            const firebaseSelectedItems = currentOrderSnapshot.selectedItems || [];

            // Sincroniza selectedItems local (mantido)
            if (JSON.stringify(firebaseSelectedItems) !== JSON.stringify(selectedItems)) {
                 console.log("[APP] Syncing local 'selectedItems' with Firebase data.");
                 selectedItems.length = 0;
                 selectedItems.push(...firebaseSelectedItems);
            }

            // CHAMA AS FUNÇÕES DE RENDERIZAÇÃO
            renderOrderScreen(currentOrderSnapshot); // Atualiza tela de pedido
            renderPaymentSummary(currentTableId, currentOrderSnapshot); // <<< GARANTE ATUALIZAÇÃO DA TELA DE PAGAMENTO

        } else {
             console.warn(`[APP] Listener detected table ${tableId} does not exist or was closed.`);
             // Se a mesa ATUAL foi fechada, limpa estado e volta ao painel
             if (currentTableId === tableId) {
                 alert(`Mesa ${tableId} foi fechada ou removida.`);
                 // Limpa estado ANTES de navegar
                 if (unsubscribeTable) unsubscribeTable(); unsubscribeTable = null;
                 currentTableId = null; currentOrderSnapshot = null; selectedItems.length = 0;
                 goToScreen('panelScreen'); // Navega para o painel
             }
        }
    }, (error) => {
        console.error(`[APP] Error in table listener for ${tableId}:`, error);
         if (unsubscribeTable) unsubscribeTable(); unsubscribeTable = null;
         currentTableId = null; currentOrderSnapshot = null; selectedItems.length = 0;
         alert("Erro ao sincronizar com a mesa. Voltando ao painel.");
         goToScreen('panelScreen');
    });
};

// Define a mesa atual (mantido)
export const setCurrentTable = (tableId) => { /* ... */ };

// Seleciona a mesa (mantido)
export const selectTableAndStartListener = async (tableId) => { /* ... */ };
window.selectTableAndStartListener = selectTableAndStartListener;

// NF-e Placeholder (mantido)
window.openNfeModal = () => { alert("Abrir modal NF-e (DEV)"); };

// --- INICIALIZAÇÃO APP STAFF (mantido) ---
const initStaffApp = async () => { /* ... */ };

// --- LÓGICA DE AUTH/LOGIN (mantido com flag) ---
const authenticateStaff = (email, password) => { /* ... */ };
const handleStaffLogin = async () => { /* ... */ };
const handleLogout = () => { /* ... */ };
window.handleLogout = handleLogout;

// --- INICIALIZAÇÃO PRINCIPAL (mantido com listener Auth corrigido) ---
document.addEventListener('DOMContentLoaded', () => { /* ... */ });
