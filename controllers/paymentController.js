// --- CONTROLLERS/PAYMENTCONTROLLER.JS (Painel 3) ---
import { currentTableId, currentOrderSnapshot } from "/app.js";
import { formatCurrency, calculateItemsValue, getNumericValueFromCurrency } from "/utils.js";
import { getTableDocRef } from "/services/firebaseService.js";
import { updateDoc, arrayUnion, arrayRemove, writeBatch } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { openManagerAuthModal } from "./managerController.js";
import { handleTableTransferConfirmed } from "./panelController.js";

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


// --- FUNÇÕES DE CÁLCULO E UTILIDADE ---
const calculateTotal = (subtotal, applyServiceTax) => { /* ... (mantida) ... */ };
const updateText = (id, value) => { /* ... (mantida) ... */ };
const groupMainAccountItems = (orderSnapshot) => { /* ... (mantida) ... */ };

// --- FUNÇÕES DE AÇÃO ---
const executeDeletePayment = async (timestamp) => { /* ... (mantida) ... */ };
export const deletePayment = async (timestamp) => { openManagerAuthModal('deletePayment', timestamp); }; // Exportada corretamente
// window.deletePayment = deletePayment; // Removido

// --- FUNÇÕES DE RENDERIZAÇÃO ---
const renderReviewItemsList = (orderSnapshot) => { /* ... (lógica mantida) ... */ };
const renderRegisteredPayments = (payments) => {
    if (!paymentSummaryList) return;
    paymentSummaryList.innerHTML = ''; // Limpa antes de renderizar

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
                // Chama a função exportada deletePayment
                deleteBtn.onclick = () => deletePayment(p.timestamp);
            }
            paymentSummaryList.appendChild(paymentDiv);
        });
    }
};
const renderPaymentSplits = (orderSnapshot) => { /* ... (lógica placeholder mantida) ... */ };
export const renderPaymentSummary = (tableId, orderSnapshot) => { /* ... (lógica mantida) ... */ };

// --- LÓGICAS DE AÇÃO EM MASSA E TRANSFERÊNCIA ---
export function activateItemSelection(action) { /* ... (lógica mantida) ... */ };
export const handleMassActionRequest = (action) => { /* ... (lógica mantida) ... */ };
export const handleMassDeleteConfirmed = async (selectedGroups) => { /* ... (lógica mantida) ... */ };
export function openTableTransferModal(items) { /* ... (lógica mantida) ... */ };
export function handleConfirmTableTransfer() { /* ... (lógica mantida) ... */ };

// Placeholders (CORRIGIDO: Adicionado export)
export const handleAddSplitAccount = async () => { alert("Divisão de conta em desenvolvimento."); };
export const openPaymentModalForSplit = (splitKey) => { alert(`Pagar Conta ${splitKey} (DEV)`); };
export const moveItemsToMainAccount = (splitKey) => { alert(`Desfazer Conta ${splitKey} (DEV)`); };
export const openSplitTransferModal = (targetKey, mode, itemsToTransfer = null) => { alert(`Mover itens para/de ${targetKey} (DEV)`); }; // Adicionado itemsToTransfer aqui também
export const handleFinalizeOrder = () => { alert("Finalizar Conta (DEV)"); };

// --- INICIALIZAÇÃO DO CONTROLLER ---
const attachReviewListListeners = () => { /* ... (lógica mantida) ... */ };

export const initPaymentController = () => {
    if(paymentInitialized) return;
    console.log("[PaymentController] Inicializando...");

    // Mapeia Elementos
    reviewItemsList = document.getElementById('reviewItemsList');
    // ... (restante das atribuições mantidas) ...
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
    selectiveTransferModal = document.getElementById('selectiveTransferModal');
    targetTableInput = document.getElementById('targetTableInput');
    // checkTargetTableBtn = document.getElementById('checkTargetTableBtn'); // Removido
    confirmTransferBtn = document.getElementById('confirmTransferBtn');
    transferStatus = document.getElementById('transferStatus');
    transferItemsList = document.getElementById('transferItemsList');
    tableTransferModal = document.getElementById('tableTransferModal');


    if (!reviewItemsList) {
        console.error("[PaymentController] Erro Fatal: Elemento 'reviewItemsList' não encontrado.");
        return;
    }

    // Adiciona Listeners Essenciais
    if(toggleServiceTaxBtn) toggleServiceTaxBtn.addEventListener('click', async () => { /* ... */ });
    if(dinersSplitInput) dinersSplitInput.addEventListener('input', () => renderPaymentSummary(currentTableId, currentOrderSnapshot));
    // if(addSplitAccountBtn) addSplitAccountBtn.addEventListener('click', handleAddSplitAccount); // Desabilitado
    if(paymentMethodButtonsContainer) paymentMethodButtonsContainer.addEventListener('click', (e) => { /* ... */ });
    if(addPaymentBtn) addPaymentBtn.addEventListener('click', async () => { /* ... */ });
    if(finalizeOrderBtn) finalizeOrderBtn.addEventListener('click', handleFinalizeOrder);
    if (openCalculatorBtn) openCalculatorBtn.addEventListener('click', () => { /* ... */ });
    if (closeCalcBtnX) closeCalcBtnX.addEventListener('click', () => { /* ... */ });
    if (calcButtons) calcButtons.addEventListener('click', (e) => { /* ... */ });
    const confirmTableTransferBtn = document.getElementById('confirmTableTransferBtn');
    if(confirmTableTransferBtn) {
        const newConfirmBtn = confirmTableTransferBtn.cloneNode(true);
        confirmTableTransferBtn.parentNode.replaceChild(newConfirmBtn, confirmTableTransferBtn);
        newConfirmBtn.addEventListener('click', handleConfirmTableTransfer);
    }
    if (targetTableInput) targetTableInput.addEventListener('input', async (e) => { /* ... */ });

    paymentInitialized = true;
    console.log("[PaymentController] Inicializado.");
};

// Remove atribuições globais redundantes
// window.handleAddSplitAccount = handleAddSplitAccount;
// window.openPaymentModalForSplit = openPaymentModalForSplit;
// window.moveItemsToMainAccount = moveItemsToMainAccount;
// window.openSplitTransferModal = openSplitTransferModal;
