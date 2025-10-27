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
export const hideStatus = () => { /* ... (Mantida) ... */ };
const showLoginScreen = () => { /* ... (Mantida) ... */ };
const hideLoginScreen = () => { /* ... (Mantida) ... */ };
export const goToScreen = (screenId) => { /* ... (Mantida com requestAnimationFrame) ... */ };
window.goToScreen = goToScreen;

// Lógica de Transferência (Revisada para garantir navegação pós-commit)
export const handleTableTransferConfirmed = async (originTableId, targetTableId, itemsToTransfer, newDiners = 0, newSector = '') => {
    console.log(`[APP] handleTableTransferConfirmed: origin=${originTableId}, target=${targetTableId}, items=${itemsToTransfer.length}`);
    if (!originTableId || !targetTableId || itemsToTransfer.length === 0) { alert("Erro: Dados incompletos."); return; }

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
        // ... (lógica de comparação) ...
        if (allOriginItemsWillBeTransferred) { closeOriginTableConfirmed = confirm(/* ... */); }

        const targetSnap = await getDoc(targetTableRef);
        const targetTableIsOpen = targetSnap.exists() && targetSnap.data().status?.toLowerCase() === 'open';

        // 1. Setup Mesa Destino
        if (!targetTableIsOpen) { /* ... */ }
        // 2. Remove da Origem
        const transferValue = itemsToTransfer.reduce((sum, item) => sum + (item.price || 0), 0);
        const originCurrentTotal = originSnap.data()?.total || 0;
        const originNewTotal = Math.max(0, originCurrentTotal - transferValue);
        itemsToTransfer.forEach(item => { batch.update(originTableRef, { sentItems: arrayRemove(item) }); });
        batch.update(originTableRef, { total: originNewTotal });
        // 3. Fecha Origem se Confirmado
        if (closeOriginTableConfirmed) { batch.update(originTableRef, { status: 'closed' }); }
        // 4. Adiciona ao Destino
        const targetData = targetTableIsOpen ? targetSnap.data() : { total: 0 };
        const targetNewTotal = (targetData.total || 0) + transferValue;
        batch.update(targetTableRef, { sentItems: arrayUnion(...itemsToTransfer), total: targetNewTotal });

        console.log("[APP] Committing transfer batch...");
        await batch.commit(); // <<< COMMIT
        console.log("[APP] Transfer batch committed successfully.");
        transferSuccessful = true; // Marca sucesso APÓS commit

        alert(`Sucesso! ${itemsToTransfer.length} item(s) transferidos.${closeOriginTableConfirmed ? ' A mesa de origem foi fechada.' : ''}`);

    } catch (e) {
        console.error("Erro CRÍTICO na transferência:", e);
        alert(`Falha CRÍTICA na transferência: ${e.message}.`);
        transferSuccessful = false;
         // Reabilita botão no modal
         const modal = document.getElementById('tableTransferModal');
         if(modal) { const confirmBtn = modal.querySelector('#confirmTableTransferBtn'); if(confirmBtn) confirmBtn.disabled = false; }
    } finally {
        // Navega para o painel APENAS se o commit foi bem sucedido
        if (transferSuccessful) {
            console.log("[APP] Navigating to panelScreen after successful transfer.");
            goToScreen('panelScreen'); // <<< NAVEGAÇÃO CONDICIONAL
        }
    }
};
window.handleTableTransferConfirmed = handleTableTransferConfirmed; // Exposto

// MODAL DE AUTENTICAÇÃO GLOBAL (mantido)
window.openManagerAuthModal = (action, payload = null) => { /* ... */ };

// Expor funções globais (mantido)
window.deletePayment = deletePayment; window.handleMassActionRequest = handleMassActionRequest; window.openTableTransferModal = openTableTransferModal; window.openKdsStatusModal = (id) => alert(`KDS ${id} (DEV)`); window.increaseLocalItemQuantity = increaseLocalItemQuantity; window.decreaseLocalItemQuantity = decreaseLocalItemQuantity; window.openObsModalForGroup = openObsModalForGroup;

// Listener da Mesa (GARANTIR que chama renderPaymentSummary)
export const setTableListener = (tableId) => {
    if (unsubscribeTable) unsubscribeTable();
    console.log(`[APP] Setting up listener for table ${tableId}`);
    const tableRef = getTableDocRef(tableId);
    unsubscribeTable = onSnapshot(tableRef, (docSnapshot) => {
        if (docSnapshot.exists()) {
            // console.log(`[APP] Snapshot received for table ${tableId}`); // Log verboso
            currentOrderSnapshot = docSnapshot.data();
            const firebaseSelectedItems = currentOrderSnapshot.selectedItems || [];

            if (JSON.stringify(firebaseSelectedItems) !== JSON.stringify(selectedItems)) {
                 // console.log("[APP] Syncing local 'selectedItems'."); // Log verboso
                 selectedItems.length = 0; selectedItems.push(...firebaseSelectedItems);
            }

            // CHAMA AS FUNÇÕES DE RENDERIZAÇÃO
            renderOrderScreen(currentOrderSnapshot); // Atualiza tela de pedido
            renderPaymentSummary(currentTableId, currentOrderSnapshot); // <<< ATUALIZA TELA DE PAGAMENTO

        } else { // Mesa não existe ou foi fechada
             console.warn(`[APP] Listener: Table ${tableId} closed or removed.`);
             if (currentTableId === tableId) { // Se era a mesa ativa
                 alert(`Mesa ${tableId} foi fechada.`);
                 if (unsubscribeTable) unsubscribeTable(); unsubscribeTable = null;
                 currentTableId = null; currentOrderSnapshot = null; selectedItems.length = 0;
                 goToScreen('panelScreen'); // Volta ao painel
             }
        }
    }, (error) => { /* ... (tratamento de erro mantido) ... */ });
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

// --- LÓGICA DE AUTH/LOGIN (mantido com flag e logs) ---
const authenticateStaff = (email, password) => { /* ... */ };
const handleStaffLogin = async () => { /* ... */ };
const handleLogout = () => { /* ... */ };
window.handleLogout = handleLogout;

// --- INICIALIZAÇÃO PRINCIPAL (mantido com listener Auth corrigido e logs) ---
document.addEventListener('DOMContentLoaded', () => { /* ... */ });
