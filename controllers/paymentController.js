// --- CONTROLLERS/PAYMENTCONTROLLER.JS (Painel 3) ---
import { currentTableId, currentOrderSnapshot } from "/app.js";
import { formatCurrency, calculateItemsValue, getNumericValueFromCurrency } from "/utils.js";
import { getTableDocRef } from "/services/firebaseService.js";
import { updateDoc, arrayUnion, arrayRemove, writeBatch, getFirestore, getDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
// REMOVIDO: import { openManagerAuthModal } from "./managerController.js";
import { handleTableTransferConfirmed } from "./panelController.js";

// --- VARIÁVEIS DE ELEMENTOS ---
let paymentSplitsContainer, addSplitAccountBtn;
let reviewItemsList;
let orderSubtotalDisplay, orderServiceTaxDisplay, orderTotalDisplay, valuePerDinerDisplay, remainingBalanceDisplay;
let toggleServiceTaxBtn, dinersSplitInput;
let paymentSummaryList, chargeInputs, openCustomerRegBtn, customerSearchInput, paymentMethodButtonsContainer, paymentValueInput, openCalculatorBtn, addPaymentBtn;
let finalizeOrderBtn, openNfeModalBtn;
let calculatorModal, calcDisplay, calcButtons, closeCalcBtnX;
let tableTransferModal;

// Estado local
let isMassSelectionActive = false;
let paymentInitialized = false;

const PAYMENT_METHODS = ['Dinheiro', 'Pix', 'Crédito', 'Débito', 'Ticket', 'Voucher'];


// --- FUNÇÕES DE CÁLCULO E UTILIDADE ---
const calculateTotal = (subtotal, applyServiceTax) => { /* ... (mantida) ... */ };
const updateText = (id, value) => { /* ... (mantida) ... */ };
const groupMainAccountItems = (orderSnapshot) => { /* ... (mantida) ... */ };

// --- FUNÇÕES DE AÇÃO ---

// Esta é a AÇÃO REAL (chamada pelo app.js após a senha)
export const executeDeletePayment = async (timestamp) => {
    if (!currentTableId || !currentOrderSnapshot) return;
    const tsNumber = parseInt(timestamp);
    const paymentToDelete = currentOrderSnapshot.payments?.find(p => p.timestamp === tsNumber);
    if (!paymentToDelete) { alert("Pagamento não encontrado."); return; }
    const tableRef = getTableDocRef(currentTableId);
    try {
        await updateDoc(tableRef, { payments: arrayRemove(paymentToDelete) });
        alert("Pagamento removido da lista.");
    } catch (e) { console.error("Erro ao deletar pagamento:", e); alert("Erro ao tentar remover."); }
}

// Esta função INICIA o fluxo de senha (chamada pelo HTML)
export const deletePayment = async (timestamp) => {
    // Chama a função GLOBAL do app.js
    window.openManagerAuthModal('deletePayment', timestamp);
}
window.deletePayment = deletePayment; // Expor globalmente para o HTML


// --- FUNÇÕES DE RENDERIZAÇÃO ---
const renderReviewItemsList = (orderSnapshot) => { /* ... (lógica mantida) ... */ };
const renderRegisteredPayments = (payments) => { /* ... (lógica mantida) ... */ };
const renderPaymentSplits = (orderSnapshot) => { /* ... (lógica mantida) ... */ };
const renderPaymentMethodButtons = () => { /* ... (lógica mantida) ... */ };
export const renderPaymentSummary = (tableId, orderSnapshot) => { /* ... (lógica mantida) ... */ };

// --- LÓGICAS DE AÇÃO EM MASSA E TRANSFERÊNCIA ---

// Esta é a AÇÃO REAL (chamada pelo app.js após a senha)
export function activateItemSelection(action) {
    const checkboxes = document.querySelectorAll('.item-select-checkbox');
    if (!checkboxes.length && !isMassSelectionActive) { alert("Não há itens para selecionar."); return; }

    if (!isMassSelectionActive) {
        isMassSelectionActive = true;
        checkboxes.forEach(cb => { cb.disabled = false; cb.checked = false; });
        alert(`SELEÇÃO ATIVA para ${action.toUpperCase()}. Clique no ícone novamente para executar.`);
    } else {
        isMassSelectionActive = false;
        const selectedGroups = Array.from(checkboxes).filter(cb => cb.checked).map(cb => ({ groupKey: cb.dataset.groupKey, itemKeys: cb.dataset.itemKeys.split(',') }));
        checkboxes.forEach(cb => { cb.disabled = true; cb.checked = false; });

        if (selectedGroups.length === 0) {
            alert("Nenhum item selecionado. Modo desativado.");
        } else if (action === 'transfer') {
            const allItemKeys = selectedGroups.flatMap(group => group.itemKeys);
            const itemsToTransferPayload = allItemKeys.map(key => {
                const [orderId, sentAt] = key.split('_');
                return currentOrderSnapshot?.sentItems?.find(item => item.orderId === orderId && String(item.sentAt) === sentAt);
            }).filter(Boolean);
            if (itemsToTransferPayload.length > 0) {
                openTableTransferModal(itemsToTransferPayload);
            } else {
                alert("Erro ao encontrar itens selecionados.");
            }
        } else if (action === 'delete') {
            handleMassDeleteConfirmed(selectedGroups);
        }
    }
    renderReviewItemsList(currentOrderSnapshot);
}

// Esta função INICIA o fluxo de senha (chamada pelo HTML)
export const handleMassActionRequest = (action) => {
    if (isMassSelectionActive) {
        activateItemSelection(action); // Executa
    } else {
        // Chama a função GLOBAL do app.js
        window.openManagerAuthModal(action === 'delete' ? 'openMassDelete' : 'openMassTransfer', action);
    }
};
window.handleMassActionRequest = handleMassActionRequest; // Expor globalmente

// Esta é a AÇÃO REAL (chamada pelo app.js após a senha)
export const handleMassDeleteConfirmed = async (selectedGroups) => {
    if (!currentTableId || !currentOrderSnapshot || selectedGroups.length === 0) return;
    try {
        const tableRef = getTableDocRef(currentTableId);
        let valueRemoved = 0;
        const groupKeysToRemove = selectedGroups.map(g => g.groupKey);
        const sentItemsAfterRemoval = currentOrderSnapshot.sentItems.filter(item => {
             const itemGroupKey = `${item.name}-${item.note || ''}`;
             if (groupKeysToRemove.includes(itemGroupKey)) {
                 valueRemoved += (item.price || 0);
                 return false;
             }
             return true;
        });
        const newTotal = Math.max(0, (currentOrderSnapshot.total || 0) - valueRemoved);
        await updateDoc(tableRef, {
            sentItems: sentItemsAfterRemoval,
            total: newTotal
        });
        alert(`Total de ${selectedGroups.length} grupos removidos. Valor: ${formatCurrency(valueRemoved)}.`);
    } catch (e) {
        console.error("Erro ao remover itens:", e);
        alert("Falha ao remover itens.");
    }
};

// Funções de Transferência
export function openTableTransferModal(items) { /* ... (lógica mantida) ... */ };
window.openTableTransferModal = openTableTransferModal; // Expor globalmente
export function handleConfirmTableTransfer() {
     const targetTableInput = document.getElementById('targetTableInput');
     const targetTableNumber = targetTableInput?.value.trim();
     if (!targetTableNumber || parseInt(targetTableNumber) <= 0 || targetTableNumber === currentTableId) { /* ... */ return; }
     const items = window.itemsToTransfer || [];
     if(items.length === 0) { /* ... */ return; }
     const dinersInput = document.getElementById('newTableDiners');
     const sectorInput = document.getElementById('newTableSector');
     const dinersContainer = document.getElementById('newTableDinersInput');
     let diners = 0;
     let sector = '';
     if (dinersContainer && !dinersContainer.classList.contains('hidden')) {
         diners = parseInt(dinersInput?.value);
         sector = sectorInput?.value;
         if (!diners || !sector) { alert('Preencha pessoas e setor.'); return; }
     }
     const confirmBtn = document.getElementById('confirmTableTransferBtn');
     if(confirmBtn) confirmBtn.disabled = true;
     // Chama a função importada do panelController
     handleTableTransferConfirmed(currentTableId, targetTableNumber, items, diners, sector);
     const modal = document.getElementById('tableTransferModal');
     if(modal) modal.style.display = 'none';
     window.itemsToTransfer = [];
 };
window.handleConfirmTableTransfer = handleConfirmTableTransfer; // Expor globalmente

// Placeholders (Exportados)
export const handleAddSplitAccount = async () => { alert("Divisão de conta (DEV)."); };
export const openPaymentModalForSplit = (splitKey) => { alert(`Pagar Conta ${splitKey} (DEV)`); };
export const moveItemsToMainAccount = (splitKey) => { alert(`Desfazer Conta ${splitKey} (DEV)`); };
export const openSplitTransferModal = (targetKey, mode, itemsToTransfer = null) => { alert(`Mover itens para/de ${targetKey} (DEV)`); };
export const handleFinalizeOrder = () => { alert("Finalizar Conta (DEV)"); };

// --- INICIALIZAÇÃO DO CONTROLLER ---
const attachReviewListListeners = () => { /* ... (lógica mantida) ... */ };

export const initPaymentController = () => {
    if(paymentInitialized) return;
    console.log("[PaymentController] Inicializando...");
    // Mapeia Elementos
    reviewItemsList = document.getElementById('reviewItemsList');
    paymentSplitsContainer = document.getElementById('paymentSplitsContainer');
    addSplitAccountBtn = document.getElementById('addSplitAccountBtn');
    orderSubtotalDisplay = document.getElementById('orderSubtotalDisplayPayment');
    orderServiceTaxDisplay = document.getElementById('orderServiceTaxDisplayPayment');
    orderTotalDisplay = document.getElementById('orderTotalDisplayPayment');
    valuePerDinerDisplay = document.getElementById('valuePerDinerDisplay');
    remainingBalanceDisplay = document.getElementById('remainingBalanceDisplay');
    toggleServiceTaxBtn = document.getElementById('toggleServiceTaxBtn');
    dinersSplitInput = document.getElementById('dinersSplitInput');
    paymentSummaryList = document.getElementById('paymentSummaryList');
    chargeInputs = document.getElementById('chargeInputs');
    openCustomerRegBtn = document.getElementById('openCustomerRegBtn');
    customerSearchInput = document.getElementById('customerSearchInput');
    paymentMethodButtonsContainer = document.getElementById('paymentMethodButtons');
    paymentValueInput = document.getElementById('paymentValueInput');
    openCalculatorBtn = document.getElementById('openCalculatorBtn');
    addPaymentBtn = document.getElementById('addPaymentBtn');
    finalizeOrderBtn = document.getElementById('finalizeOrderBtn');
    openNfeModalBtn = document.getElementById('openNfeModalBtn');
    calculatorModal = document.getElementById('calculatorModal');
    calcDisplay = document.getElementById('calcDisplay');
    calcButtons = calculatorModal?.querySelector('.grid');
    closeCalcBtnX = document.getElementById('closeCalcBtnX');
    tableTransferModal = document.getElementById('tableTransferModal'); // Modal de confirmação
    if (tableTransferModal) { // Elementos dentro do modal de transferência
         targetTableInput = tableTransferModal.querySelector('#targetTableInput');
         confirmTransferBtn = tableTransferModal.querySelector('#confirmTableTransferBtn');
         transferStatus = tableTransferModal.querySelector('#transferStatus');
    }

    if (!reviewItemsList) { console.error("[PaymentController] Erro Fatal: 'reviewItemsList' não encontrado."); return; }
    
    renderPaymentMethodButtons(); // Renderiza botões de pagamento
    // Adiciona Listeners Essenciais
    if(toggleServiceTaxBtn) toggleServiceTaxBtn.addEventListener('click', async () => { /* ... (lógica mantida) ... */ });
    if(dinersSplitInput) dinersSplitInput.addEventListener('input', () => renderPaymentSummary(currentTableId, currentOrderSnapshot));
    if(paymentMethodButtonsContainer) paymentMethodButtonsContainer.addEventListener('click', (e) => { /* ... (lógica mantida) ... */ });
    if(addPaymentBtn) addPaymentBtn.addEventListener('click', async () => { /* ... (lógica mantida) ... */ });
    if(finalizeOrderBtn) finalizeOrderBtn.addEventListener('click', handleFinalizeOrder);
    if (openCalculatorBtn) openCalculatorBtn.addEventListener('click', () => { if(calculatorModal) calculatorModal.style.display = 'flex'; /* ... */ });
    if (closeCalcBtnX) closeCalcBtnX.addEventListener('click', () => { if (calculatorModal) calculatorModal.style.display = 'none'; });
    if (calcButtons) calcButtons.addEventListener('click', (e) => { /* ... */ });
    if (confirmTransferBtn) {
        const newConfirmBtn = confirmTransferBtn.cloneNode(true);
        confirmTransferBtn.parentNode.replaceChild(newConfirmBtn, confirmTransferBtn);
        newConfirmBtn.addEventListener('click', handleConfirmTableTransfer);
    }
    if (targetTableInput) targetTableInput.addEventListener('input', async (e) => { /* ... (lógica mantida) ... */ });

    paymentInitialized = true;
    console.log("[PaymentController] Inicializado.");
};
