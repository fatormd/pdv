// --- CONTROLLERS/PAYMENTCONTROLLER.JS (Painel 3) ---
import { currentTableId, currentOrderSnapshot } from "/app.js"; // Apenas estados globais necessários
import { formatCurrency, calculateItemsValue, getNumericValueFromCurrency } from "/utils.js";
import { getTableDocRef } from "/services/firebaseService.js";
import { updateDoc, arrayUnion, arrayRemove, writeBatch } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { openManagerAuthModal } from "./managerController.js";
import { handleTableTransferConfirmed } from "./panelController.js";

// --- VARIÁVEIS DE ELEMENTOS (Definidas na função init) ---
// Declara as variáveis no escopo do módulo
let paymentSplitsContainer, addSplitAccountBtn;
let reviewItemsList; // <<<<<<<< Declarada aqui
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
export const deletePayment = async (timestamp) => { /* ... (mantida) ... */ };
window.deletePayment = deletePayment; // Expor globalmente

// --- FUNÇÕES DE RENDERIZAÇÃO ---
const renderReviewItemsList = (orderSnapshot) => {
    // FIX: Adiciona verificação se reviewItemsList já foi mapeado
    if (!reviewItemsList) {
        console.warn("[PaymentController] Tentativa de renderizar reviewItemsList antes de mapear o elemento.");
        return;
    }
    const groupedItems = groupMainAccountItems(orderSnapshot);
    const mainAccountItemsCount = Object.values(groupedItems).reduce((sum, group) => sum + group.totalCount, 0);

    // Atualiza ícones (com verificações)
    const transferBtn = document.getElementById('itemMassTransferBtn');
    const deleteBtn = document.getElementById('itemMassDeleteBtn');
    if(transferBtn) transferBtn.classList.toggle('text-yellow-400', isMassSelectionActive);
    if(deleteBtn) deleteBtn.classList.toggle('text-red-400', isMassSelectionActive);
    if(transferBtn) transferBtn.classList.toggle('text-gray-400', !isMassSelectionActive);
    if(deleteBtn) deleteBtn.classList.toggle('text-gray-400', !isMassSelectionActive);

    if (mainAccountItemsCount === 0) {
        reviewItemsList.innerHTML = `<div class="text-sm text-dark-placeholder italic p-2">Nenhum item na conta principal.</div>`;
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

    const listHtml = Object.values(groupedItems).map(group => { /* ... (HTML interno mantido) ... */ }).join('');

    reviewItemsList.innerHTML = `
        <div class="flex justify-between items-center pb-2 border-b border-gray-600 mb-2">
            <label class="flex items-center space-x-2 text-sm font-semibold text-dark-text">
                <input type="checkbox" id="selectAllItems" class="h-4 w-4 rounded bg-dark-input border-gray-500 text-pumpkin focus:ring-pumpkin">
                <span>Todos</span>
            </label>
            <div class="flex space-x-2">
                 <button id="massTransferBtn" class="px-2 py-1 text-xs bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition disabled:opacity-50" title="Transferir (Gerente)">T (<span id="selectedItemsCount">0</span>)</button>
                 <button id="massDeleteBtn" class="px-2 py-1 text-xs bg-red-600 text-white rounded-lg hover:bg-red-700 transition disabled:opacity-50" title="Excluir (Gerente)">X (<span id="selectedItemsCountDelete">0</span>)</button>
            </div>
        </div>
        <div class="border border-gray-600 p-2 rounded-lg bg-dark-bg max-h-48 overflow-y-auto">
            ${listHtml}
        </div>
    `;
    attachReviewListListeners(); // Reanexa listeners após renderizar
};

const renderRegisteredPayments = (payments) => { /* ... (lógica mantida) ... */ };
const renderPaymentSplits = (orderSnapshot) => { /* ... (lógica placeholder mantida) ... */ };

export const renderPaymentSummary = (tableId, orderSnapshot) => { /* ... (lógica mantida) ... */ };

// --- LÓGICAS DE AÇÃO EM MASSA E TRANSFERÊNCIA ---
export function activateItemSelection(action) { /* ... (lógica mantida) ... */ };
export const handleMassActionRequest = (action) => { /* ... (lógica mantida) ... */ };
export const handleMassDeleteConfirmed = async (selectedGroups) => { /* ... (lógica mantida) ... */ };
export function openTableTransferModal(items) { /* ... (lógica mantida) ... */ };
export function handleConfirmTableTransfer() { /* ... (lógica mantida) ... */ };

// Placeholders
export const handleAddSplitAccount = async () => { alert("Divisão de conta em desenvolvimento."); };
const openPaymentModalForSplit = (splitKey) => { alert(`Pagar Conta ${splitKey} (DEV)`); };
const moveItemsToMainAccount = (splitKey) => { alert(`Desfazer Conta ${splitKey} (DEV)`); };
const openSplitTransferModal = (targetKey, mode) => { alert(`Mover itens para/de ${targetKey} (DEV)`); };
export const handleFinalizeOrder = () => { alert("Finalizar Conta (DEV)"); };

// --- INICIALIZAÇÃO DO CONTROLLER ---
const attachReviewListListeners = () => { /* ... (lógica mantida) ... */ };

export const initPaymentController = () => {
    if(paymentInitialized) return;
    console.log("[PaymentController] Inicializando...");

    // **CRITICAL FIX:** Mapeia TODOS os elementos PRIMEIRO
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
    selectiveTransferModal = document.getElementById('selectiveTransferModal');
    targetTableInput = document.getElementById('targetTableInput');
    checkTargetTableBtn = document.getElementById('checkTargetTableBtn'); // Removido do HTML, mas mantido aqui para evitar erros se referenciado
    confirmTransferBtn = document.getElementById('confirmTransferBtn');
    transferStatus = document.getElementById('transferStatus');
    transferItemsList = document.getElementById('transferItemsList');
    tableTransferModal = document.getElementById('tableTransferModal');

    // Verifica se o elemento essencial foi encontrado
    if (!reviewItemsList) {
        console.error("[PaymentController] Erro Fatal: Elemento 'reviewItemsList' não encontrado no DOM. Inicialização interrompida.");
        // Opcional: Mostrar um erro para o usuário
        // document.body.innerHTML = '<h1 style="color: red;">Erro Crítico: Falha ao carregar a interface de pagamento. Recarregue a página.</h1>';
        return; // Interrompe a inicialização deste controller
    }


    // Adiciona Listeners Essenciais (agora que sabemos que os elementos existem ou foram verificados)
    if(toggleServiceTaxBtn) toggleServiceTaxBtn.addEventListener('click', async () => {
        if (!currentTableId || !currentOrderSnapshot) return;
        const currentStatus = currentOrderSnapshot.serviceTaxApplied === undefined ? true : currentOrderSnapshot.serviceTaxApplied;
        try {
            await updateDoc(getTableDocRef(currentTableId), { serviceTaxApplied: !currentStatus });
            console.log(`Taxa de serviço ${!currentStatus ? 'aplicada' : 'removida'}.`);
        } catch(e) { console.error("Erro ao alternar taxa:", e); }
    });

    if(dinersSplitInput) dinersSplitInput.addEventListener('input', () => renderPaymentSummary(currentTableId, currentOrderSnapshot));

    // if(addSplitAccountBtn) addSplitAccountBtn.addEventListener('click', handleAddSplitAccount); // Desabilitado

    if(paymentMethodButtonsContainer) paymentMethodButtonsContainer.addEventListener('click', (e) => {
        const btn = e.target.closest('.payment-method-btn');
        if (btn) {
            paymentMethodButtonsContainer.querySelectorAll('.payment-method-btn').forEach(b => b.classList.remove('active', 'bg-pumpkin', 'text-white'));
            btn.classList.add('active', 'bg-pumpkin', 'text-white');
            if(addPaymentBtn) {
                 const isClosed = remainingBalanceDisplay?.classList.contains('text-green-400') || remainingBalanceDisplay?.textContent === 'R$ 0,00';
                 addPaymentBtn.disabled = isClosed;
            }
        }
    });

    if(addPaymentBtn) addPaymentBtn.addEventListener('click', async () => {
         if (!currentTableId || !currentOrderSnapshot) return;
         const value = getNumericValueFromCurrency(paymentValueInput?.value || '0');
         const activeMethodBtn = paymentMethodButtonsContainer?.querySelector('.payment-method-btn.active');
         const method = activeMethodBtn ? activeMethodBtn.dataset.method : null;

         if (!method || value <= 0) { alert("Selecione método e valor válido."); return; }

         const newPayment = { method, value, timestamp: Date.now(), userId: window.userId || 'unknown' };
         try {
             await updateDoc(getTableDocRef(currentTableId), { payments: arrayUnion(newPayment) });
             if(paymentValueInput) paymentValueInput.value = 'R$ 0,00';
             activeMethodBtn?.classList.remove('active', 'bg-pumpkin', 'text-white');
             addPaymentBtn.disabled = true;
         } catch(e) { console.error("Erro ao adicionar pagamento:", e); alert("Falha ao registrar pagamento."); }
    });

    if(finalizeOrderBtn) finalizeOrderBtn.addEventListener('click', handleFinalizeOrder);
    // Listener do NFe está no app.js

    // Listeners da Calculadora
    if (openCalculatorBtn) openCalculatorBtn.addEventListener('click', () => { if(calculatorModal) calculatorModal.style.display = 'flex'; /* ... */ });
    if (closeCalcBtnX) closeCalcBtnX.addEventListener('click', () => { if (calculatorModal) calculatorModal.style.display = 'none'; });
    if (calcButtons) calcButtons.addEventListener('click', (e) => { /* ... (lógica mantida) ... */ });

     // Listeners do Modal de Transferência de Mesa
    const confirmTableTransferBtn = document.getElementById('confirmTableTransferBtn');
    if(confirmTableTransferBtn) {
        // Usa cloneNode para garantir que não haja listeners duplicados de execuções anteriores
        const newConfirmBtn = confirmTableTransferBtn.cloneNode(true);
        confirmTableTransferBtn.parentNode.replaceChild(newConfirmBtn, confirmTableTransferBtn);
        newConfirmBtn.addEventListener('click', handleConfirmTableTransfer);
    }


    if (targetTableInput) targetTableInput.addEventListener('input', async (e) => { /* ... (lógica mantida) ... */ });


    paymentInitialized = true;
    console.log("[PaymentController] Inicializado.");
};
