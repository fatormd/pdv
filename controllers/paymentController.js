// --- CONTROLLERS/PAYMENTCONTROLLER.JS (Painel 3) ---
import { currentTableId, currentOrderSnapshot } from "/app.js";
import { formatCurrency, calculateItemsValue, getNumericValueFromCurrency } from "/utils.js";
import { getTableDocRef } from "/services/firebaseService.js";
import { updateDoc, arrayUnion, arrayRemove, writeBatch, getFirestore, getDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
// REMOVIDO: import { openManagerAuthModal } from "./managerController.js";
// REMOVIDO: import { handleTableTransferConfirmed } from "./panelController.js"; // <-- CICLO QUEBRADO

// --- VARIÁVEIS DE ELEMENTOS ---
let paymentSplitsContainer, addSplitAccountBtn;
let reviewItemsList;
let orderSubtotalDisplay, orderServiceTaxDisplay, orderTotalDisplay, valuePerDinerDisplay, remainingBalanceDisplay;
let toggleServiceTaxBtn, dinersSplitInput;
let paymentSummaryList, chargeInputs, openCustomerRegBtn, customerSearchInput, paymentMethodButtonsContainer, paymentValueInput, openCalculatorBtn, addPaymentBtn;
let finalizeOrderBtn, openNfeModalBtn;
let calculatorModal, calcDisplay, calcButtons, closeCalcBtnX;
let selectiveTransferModal, targetTableInput, checkTargetTableBtn, confirmTransferBtn, transferStatus, transferItemsList;
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
// AÇÃO REAL (chamada pelo app.js)
export const executeDeletePayment = async (timestamp) => { /* ... (mantida) ... */ };

// INICIA o fluxo de senha (chamada pelo HTML)
export const deletePayment = async (timestamp) => {
    window.openManagerAuthModal('deletePayment', timestamp); // Chama função global
}
// window.deletePayment = deletePayment; // Exposto no app.js


// --- FUNÇÕES DE RENDERIZAÇÃO ---
const renderReviewItemsList = (orderSnapshot) => {
    if (!reviewItemsList) return;
    // ... (lógica de renderização da lista, incluindo barra de ação com 'selectAllItems') ...
    attachReviewListListeners();
};

const renderRegisteredPayments = (payments) => {
    if (!paymentSummaryList) return;
    // ... (lógica de renderização dos pagamentos) ...
    // Adiciona listener que chama a função GLOBAL
    // deleteBtn.onclick = () => window.deletePayment(p.timestamp);
    // ... (lógica mantida) ...
};
const renderPaymentSplits = (orderSnapshot) => { /* ... (lógica placeholder mantida) ... */ };
const renderPaymentMethodButtons = () => { /* ... (lógica mantida) ... */ };
export const renderPaymentSummary = (tableId, orderSnapshot) => {
    if (!orderSnapshot || !paymentInitialized) return;
    // ... (lógica de cálculo e atualização de UI mantida) ...
    renderReviewItemsList(orderSnapshot);
    renderRegisteredPayments(payments);
    renderPaymentSplits(orderSnapshot);
};


// --- LÓGICAS DE AÇÃO EM MASSA E TRANSFERÊNCIA ---

// AÇÃO REAL (chamada pelo app.js)
export function activateItemSelection(action) {
    // ... (lógica mantida) ...
    // Esta função é chamada pelo app.js, não precisa mais estar no window
};

// INICIA fluxo de senha (chamada pelos botões com contador)
export const handleMassActionRequest = (action) => {
    const selectedCheckboxes = document.querySelectorAll('#reviewItemsList input[type="checkbox"].item-select-checkbox:checked');
    if (selectedCheckboxes.length === 0) {
        alert("Nenhum item selecionado.");
        return;
    }
    // Chama a função GLOBAL do app.js
    if (action === 'delete') {
        window.openManagerAuthModal('executeMassDelete', null);
    } else if (action === 'transfer') {
        window.openManagerAuthModal('executeMassTransfer', null);
    }
};
// window.handleMassActionRequest = handleMassActionRequest; // Exposto no app.js

// AÇÃO REAL (chamada pelo app.js)
export const handleMassDeleteConfirmed = async () => { /* ... (lógica mantida) ... */ };

// AÇÃO REAL (chamada pelo app.js)
export function openTableTransferModal() { /* ... (lógica mantida) ... */ };
// window.openTableTransferModal = openTableTransferModal; // Exposto no app.js

export function handleConfirmTableTransfer() {
     const targetTableInput = document.getElementById('targetTableInput');
     const targetTableNumber = targetTableInput?.value.trim();
     if (!targetTableNumber || parseInt(targetTableNumber) <= 0 || targetTableNumber === currentTableId) { /* ... */ return; }
     const items = window.itemsToTransfer || [];
     if(items.length === 0) { /* ... */ return; }
     const dinersInput = document.getElementById('newTableDiners');
     const sectorInput = document.getElementById('newTableSector');
     const dinersContainer = document.getElementById('newTableDinersInput');
     let diners = 0; let sector = '';
     if (dinersContainer && !dinersContainer.classList.contains('hidden')) {
         diners = parseInt(dinersInput?.value);
         sector = sectorInput?.value;
         if (!diners || !sector) { alert('Preencha pessoas e setor.'); return; }
     }
     const confirmBtn = document.getElementById('confirmTableTransferBtn');
     if(confirmBtn) confirmBtn.disabled = true;
     
     // **CORREÇÃO:** Chama a função GLOBAL do app.js
     window.handleTableTransferConfirmed(currentTableId, targetTableNumber, items, diners, sector);
     
     const modal = document.getElementById('tableTransferModal');
     if(modal) modal.style.display = 'none';
     window.itemsToTransfer = [];
 };
// window.handleConfirmTableTransfer = handleConfirmTableTransfer; // Exposto no app.js

// Placeholders (Exportados)
export const handleAddSplitAccount = async () => { alert("Divisão de conta (DEV)."); };
export const openPaymentModalForSplit = (splitKey) => { alert(`Pagar Conta ${splitKey} (DEV)`); };
export const moveItemsToMainAccount = (splitKey) => { alert(`Desfazer Conta ${splitKey} (DEV)`); };
export const openSplitTransferModal = (targetKey, mode, itemsToTransfer = null) => { alert(`Mover itens para/de ${targetKey} (DEV)`); };
export const handleFinalizeOrder = () => { alert("Finalizar Conta (DEV)"); };

// --- INICIALIZAÇÃO DO CONTROLLER ---
const attachReviewListListeners = () => {
    // ---- INÍCIO DA CORREÇÃO ----
    // É preciso encontrar os botões aqui, pois eles são criados dinamicamente pela renderReviewItemsList
    const massDeleteBtn = document.getElementById('massDeleteBtn');
    const massTransferBtn = document.getElementById('massTransferBtn');
    // ---- FIM DA CORREÇÃO ----

    // ... (lógica mantida) ...
    // **CORREÇÃO:** Garante que os botões chamem a função global
    if (massDeleteBtn) {
         const newDeleteBtn = massDeleteBtn.cloneNode(true);
         massDeleteBtn.parentNode.replaceChild(newDeleteBtn, massDeleteBtn);
         newDeleteBtn.addEventListener('click', () => window.handleMassActionRequest('delete')); // Chama global
    }
     if (massTransferBtn) {
         const newTransferBtn = massTransferBtn.cloneNode(true);
         massTransferBtn.parentNode.replaceChild(newTransferBtn, massTransferBtn);
         newTransferBtn.addEventListener('click', () => window.handleMassActionRequest('transfer')); // Chama global
    }
    // ... (lógica mantida) ...
};

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
    tableTransferModal = document.getElementById('tableTransferModal');
    
    if (tableTransferModal) {
         targetTableInput = tableTransferModal.querySelector('#targetTableInput');
         confirmTransferBtn = tableTransferModal.querySelector('#confirmTableTransferBtn');
         transferStatus = tableTransferModal.querySelector('#transferStatus');
    }
    
    selectiveTransferModal = document.getElementById('selectiveTransferModal');
    if(selectiveTransferModal) {
        transferItemsList = selectiveTransferModal.querySelector('#transferItemsList');
    }

    if (!reviewItemsList) { console.error("[PaymentController] Erro Fatal: 'reviewItemsList' não encontrado."); return; }
    
    renderPaymentMethodButtons(); // Renderiza botões de pagamento

    // Adiciona Listeners Essenciais
    if(toggleServiceTaxBtn) toggleServiceTaxBtn.addEventListener('click', async () => { /* ... */ });
    if(dinersSplitInput) dinersSplitInput.addEventListener('input', () => renderPaymentSummary(currentTableId, currentOrderSnapshot));
    if(paymentMethodButtonsContainer) paymentMethodButtonsContainer.addEventListener('click', (e) => { /* ... */ });
    if(addPaymentBtn) addPaymentBtn.addEventListener('click', async () => { /* ... */ });
    if(finalizeOrderBtn) finalizeOrderBtn.addEventListener('click', handleFinalizeOrder);
    if (openCalculatorBtn) openCalculatorBtn.addEventListener('click', () => { if(calculatorModal) calculatorModal.style.display = 'flex'; });
    if (closeCalcBtnX) closeCalcBtnX.addEventListener('click', () => { if (calculatorModal) calculatorModal.style.display = 'none'; });
    if (calcButtons) calcButtons.addEventListener('click', (e) => { /* (lógica da calc mantida) */ });
    
    if(confirmTransferBtn) {
        const newConfirmBtn = confirmTransferBtn.cloneNode(true);
        confirmTransferBtn.parentNode.replaceChild(newConfirmBtn, confirmTransferBtn);
        newConfirmBtn.addEventListener('click', handleConfirmTableTransfer);
    }

    if (targetTableInput) {
        targetTableInput.addEventListener('input', async (e) => {
            const tableNumber = e.target.value.trim();
            const confirmBtn = document.getElementById('confirmTableTransferBtn');
            const newTableDinersInputEl = document.getElementById('newTableDinersInput');
            const transferStatusEl = tableTransferModal?.querySelector('#transferStatus'); 
            
            if(!confirmBtn || !newTableDinersInputEl) return; 

            confirmBtn.disabled = true;
            newTableDinersInputEl.classList.add('hidden');
            confirmBtn.textContent = 'Verificando...';
            if(transferStatusEl) transferStatusEl.classList.add('hidden');

            if (tableNumber && tableNumber !== currentTableId) {
                 try {
                    const targetRef = getTableDocRef(tableNumber);
                    const targetSnap = await getDoc(targetRef);
                    if (targetSnap.exists() && targetSnap.data().status?.toLowerCase() === 'open') {
                         confirmBtn.textContent = `Transferir para Mesa ${tableNumber}`;
                         confirmBtn.disabled = false;
                         if(transferStatusEl) { /* ... */ }
                    } else {
                         newTableDinersInputEl.classList.remove('hidden');
                         confirmBtn.textContent = `Abrir Mesa ${tableNumber} e Transferir`;
                         confirmBtn.disabled = false;
                         if(transferStatusEl) { /* ... */ }
                    }
                 } catch (error) { /* ... */ }
            } else if (tableNumber === currentTableId) {
                 confirmBtn.textContent = 'Mesa igual à atual';
                 if(transferStatusEl) { /* ... */ }
            } else {
                 confirmBtn.textContent = 'Prosseguir';
            }
       });
    } else {
        console.warn("[PaymentController] Input 'targetTableInput' (do modal de transferência) não encontrado.");
    }

    paymentInitialized = true;
    console.log("[PaymentController] Inicializado.");
};
