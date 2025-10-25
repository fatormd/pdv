// --- CONTROLLERS/PAYMENTCONTROLLER.JS (Painel 3) ---
import { currentTableId, currentOrderSnapshot } from "/app.js";
import { formatCurrency, calculateItemsValue, getNumericValueFromCurrency } from "/utils.js";
import { getTableDocRef } from "/services/firebaseService.js";
import { updateDoc, arrayUnion, arrayRemove, writeBatch, getFirestore, getDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
// REMOVIDO: import { openManagerAuthModal } from "./managerController.js";
import { handleTableTransferConfirmed } from "./panelController.js"; // Importa função de transferência

// --- VARIÁVEIS DE ELEMENTOS ---
let paymentSplitsContainer, addSplitAccountBtn;
let reviewItemsList;
// ... (demais variáveis) ...
let toggleServiceTaxBtn, dinersSplitInput;
let paymentSummaryList, chargeInputs, openCustomerRegBtn, customerSearchInput, paymentMethodButtonsContainer, paymentValueInput, openCalculatorBtn, addPaymentBtn;
let finalizeOrderBtn, openNfeModalBtn;
let calculatorModal, calcDisplay, calcButtons, closeCalcBtnX;
let tableTransferModal, targetTableInput, confirmTransferBtn, transferStatus;

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
// window.deletePayment = deletePayment; // Exposição global movida para app.js

// --- FUNÇÕES DE RENDERIZAÇÃO ---
const renderReviewItemsList = (orderSnapshot) => {
    // ... (lógica mantida) ...
    if (!reviewItemsList) return;
    const groupedItems = groupMainAccountItems(orderSnapshot);
    const mainAccountItemsCount = Object.values(groupedItems).reduce((sum, group) => sum + group.totalCount, 0);

    const transferBtn = document.getElementById('itemMassTransferBtn');
    const deleteBtn = document.getElementById('itemMassDeleteBtn');
    // ... (lógica de habilitar/desabilitar botões) ...

    if (mainAccountItemsCount === 0) {
        reviewItemsList.innerHTML = `<div class="text-sm text-dark-placeholder italic p-2">Nenhum item enviado para a conta ainda.</div>`;
        if (transferBtn) transferBtn.disabled = true;
        if (deleteBtn) deleteBtn.disabled = true;
        const selectAll = document.getElementById('selectAllItems');
        if(selectAll) selectAll.disabled = true;
        return;
    } else {
        if (transferBtn) transferBtn.disabled = false;
        if (deleteBtn) deleteBtn.disabled = false;
        const selectAll = document.getElementById('selectAllItems');
        if(selectAll) selectAll.disabled = false;
    }
    // ... (lógica de renderização do HTML da lista mantida) ...
    reviewItemsList.innerHTML = `...`; // (HTML omitido por brevidade)
    attachReviewListListeners();
};

const renderRegisteredPayments = (payments) => {
    if (!paymentSummaryList) return;
    paymentSummaryList.innerHTML = '';
    if (!payments || payments.length === 0) {
        paymentSummaryList.innerHTML = `<p class="text-xs text-dark-placeholder italic p-2">Nenhum pagamento registrado.</p>`;
    } else {
        payments.forEach(p => {
            const paymentDiv = document.createElement('div');
            paymentDiv.className = "flex justify-between items-center py-1 border-b border-gray-700";
            paymentDiv.innerHTML = `
                <div class="flex flex-col">
                    <span class="text-xs text-gray-400">${p.method}</span>
                    <span class="font-semibold text-sm text-dark-text">${formatCurrency(p.value)}</span>
                </div>
                <button class="delete-payment-btn text-red-500 hover:text-red-400 transition" title="Excluir Pagamento (Gerente)">
                    <i class="fas fa-trash text-sm pointer-events-none"></i>
                </button>
            `;
            const deleteBtn = paymentDiv.querySelector('.delete-payment-btn');
            if (deleteBtn) {
                // CHAMA A FUNÇÃO GLOBAL (window.deletePayment)
                deleteBtn.onclick = () => window.deletePayment(p.timestamp);
            }
            paymentSummaryList.appendChild(paymentDiv);
        });
    }
};
const renderPaymentSplits = (orderSnapshot) => { /* ... (lógica placeholder mantida) ... */ };
const renderPaymentMethodButtons = () => {
    if (!paymentMethodButtonsContainer) return;
    paymentMethodButtonsContainer.innerHTML = '';
    PAYMENT_METHODS.forEach(method => {
        paymentMethodButtonsContainer.innerHTML += `
            <button class="payment-method-btn bg-dark-input text-dark-text border border-gray-600" data-method="${method}">
                ${method}
            </button>
        `;
    });
};
export const renderPaymentSummary = (tableId, orderSnapshot) => { /* ... (lógica mantida) ... */ };

// --- LÓGICAS DE AÇÃO EM MASSA E TRANSFERÊNCIA ---

// AÇÃO REAL (chamada pelo app.js)
export function activateItemSelection(action) { /* ... (lógica mantida) ... */ };

// INICIA fluxo de senha (chamada pelo HTML)
export const handleMassActionRequest = (action) => {
    if (isMassSelectionActive) {
        activateItemSelection(action); // Executa
    } else {
        // Chama a função GLOBAL do app.js
        window.openManagerAuthModal(action === 'delete' ? 'openMassDelete' : 'openMassTransfer', action);
    }
};
// window.handleMassActionRequest = handleMassActionRequest; // Exposto no app.js

// AÇÃO REAL (chamada pelo app.js)
export const handleMassDeleteConfirmed = async (selectedGroups) => { /* ... (lógica mantida) ... */ };
// AÇÃO REAL
export function openTableTransferModal(items) { /* ... (lógica mantida) ... */ };
// window.openTableTransferModal = openTableTransferModal; // Exposto no app.js
// AÇÃO REAL
export function handleConfirmTableTransfer() { /* ... (lógica mantida) ... */ };
// window.handleConfirmTableTransfer = handleConfirmTableTransfer; // Exposto no app.js

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
    
    tableTransferModal = document.getElementById('tableTransferModal');
    if (tableTransferModal) {
         targetTableInput = tableTransferModal.querySelector('#targetTableInput');
         confirmTransferBtn = tableTransferModal.querySelector('#confirmTableTransferBtn');
         transferStatus = tableTransferModal.querySelector('#transferStatus');
    }

    if (!reviewItemsList) {
        console.error("[PaymentController] Erro Fatal: 'reviewItemsList' não encontrado.");
        return;
    }
    
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

    if (targetTableInput) { // Listener do input de transferência
        targetTableInput.addEventListener('input', async (e) => {
            const tableNumber = e.target.value.trim();
            const confirmBtn = document.getElementById('confirmTableTransferBtn');
            const newTableDinersInputEl = document.getElementById('newTableDinersInput');
            const transferStatusEl = document.getElementById('transferStatus');

            if(!confirmBtn || !newTableDinersInputEl) return;

            confirmBtn.disabled = true;
            newTableDinersInputEl.classList.add('hidden');
            confirmBtn.textContent = 'Verificando...';
            if(transferStatusEl) transferStatusEl.classList.add('hidden');

            if (tableNumber && tableNumber !== currentTableId) {
                 try {
                    const targetRef = getTableDocRef(tableNumber);
                    const targetSnap = await getDoc(targetRef); // Precisa do getDoc aqui
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
