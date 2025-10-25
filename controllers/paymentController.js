// --- CONTROLLERS/PAYMENTCONTROLLER.JS (Painel 3) ---
import { currentTableId, currentOrderSnapshot } from "/app.js";
import { formatCurrency, calculateItemsValue, getNumericValueFromCurrency } from "/utils.js";
import { getTableDocRef } from "/services/firebaseService.js";
import { updateDoc, arrayUnion, arrayRemove, writeBatch, getFirestore, getDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
// REMOVIDO: import { openManagerAuthModal } from "./managerController.js"; // Ciclo quebrado
import { handleTableTransferConfirmed } from "./panelController.js";

// --- VARIÁVEIS DE ELEMENTOS ---
let reviewItemsList;
let orderSubtotalDisplay, orderServiceTaxDisplay, orderTotalDisplay, valuePerDinerDisplay, remainingBalanceDisplay;
let toggleServiceTaxBtn, dinersSplitInput;
let paymentSummaryList, paymentMethodButtonsContainer, paymentValueInput, addPaymentBtn;
let finalizeOrderBtn, openNfeModalBtn;
// ... (outros elementos)

// REMOVIDO: let isMassSelectionActive = false;
let paymentInitialized = false;

const PAYMENT_METHODS = ['Dinheiro', 'Pix', 'Crédito', 'Débito', 'Ticket', 'Voucher'];


// --- FUNÇÕES DE CÁLCULO E UTILIDADE ---
const calculateTotal = (subtotal, applyServiceTax) => { /* ... (mantida) ... */ };
const updateText = (id, value) => { /* ... (mantida) ... */ };
const groupMainAccountItems = (orderSnapshot) => { /* ... (mantida) ... */ };

// --- FUNÇÕES DE AÇÃO ---
export const executeDeletePayment = async (timestamp) => { /* ... (mantida) ... */ };
export const deletePayment = async (timestamp) => {
    // Chama a função GLOBAL do app.js
    window.openManagerAuthModal('deletePayment', timestamp);
}
// window.deletePayment = deletePayment; // Exposto no app.js

// --- FUNÇÕES DE RENDERIZAÇÃO ---
const renderReviewItemsList = (orderSnapshot) => {
    if (!reviewItemsList) return;
    const groupedItems = groupMainAccountItems(orderSnapshot);
    const mainAccountItemsCount = Object.values(groupedItems).reduce((sum, group) => sum + group.totalCount, 0);

    // REMOVIDO: Lógica dos ícones do título
    // const transferBtn = document.getElementById('itemMassTransferBtn');
    // const deleteBtn = document.getElementById('itemMassDeleteBtn');
    // ...

    if (mainAccountItemsCount === 0) {
        reviewItemsList.innerHTML = `<div class="text-sm text-dark-placeholder italic p-2">Nenhum item enviado para a conta ainda.</div>`;
        // Não precisa mais desabilitar botões que não existem
        return;
    }
    // ...

    const listHtml = Object.values(groupedItems).map(group => {
        const firstItem = group.items[0];
        const groupKey = group.groupKey;
        const massItemKeys = group.items.map(item => `${item.orderId}_${item.sentAt}`).join(',');
        
        // **CORREÇÃO:** Checkboxes agora estão sempre habilitados (sem 'disabledAttr')
        const existingCheckbox = document.querySelector(`.item-select-checkbox[data-group-key="${groupKey}"]`);
        const checkedAttr = (existingCheckbox && existingCheckbox.checked) ? 'checked' : '';

        return `
            <div class="flex items-start justify-between py-1 border-b border-gray-600 hover:bg-gray-700 transition">
                <input type="checkbox" class="item-select-checkbox mt-1.5 ml-1 mr-2 h-4 w-4 rounded bg-dark-input border-gray-500 text-pumpkin focus:ring-pumpkin"
                       data-group-key="${groupKey}" data-item-keys="${massItemKeys}" ${checkedAttr}>
                {/* ... (resto do HTML do item) ... */}
                <div class="flex flex-col flex-grow min-w-0 pr-2">
                    <span class="text-sm font-semibold text-dark-text">${firstItem.name} (${group.totalCount}x)</span>
                    ${firstItem.note ? `<span class="text-xs text-dark-placeholder truncate">(${firstItem.note})</span>` : ''}
                </div>
                <span class="text-sm font-bold text-pumpkin flex-shrink-0">${formatCurrency(group.totalValue)}</span>
            </div>
        `;
    }).join('');

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
    attachReviewListListeners();
};

const renderRegisteredPayments = (payments) => { /* ... (lógica mantida, usa window.deletePayment) ... */ };
const renderPaymentSplits = (orderSnapshot) => { /* ... (lógica placeholder mantida) ... */ };
const renderPaymentMethodButtons = () => { /* ... (lógica mantida) ... */ };
export const renderPaymentSummary = (tableId, orderSnapshot) => { /* ... (lógica mantida) ... */ };

// --- LÓGICAS DE AÇÃO EM MASSA E TRANSFERÊNCIA ---

// REMOVIDO: export function activateItemSelection(action) { ... };
// REMOVIDO: export const handleMassActionRequest = (action) => { ... };

// NOVO: Helper para pegar itens selecionados no DOM
const getSelectedItemsFromDOM = () => {
    const selectedCheckboxes = document.querySelectorAll('#reviewItemsList input[type="checkbox"].item-select-checkbox:checked');
    if (selectedCheckboxes.length === 0) {
        alert("Nenhum item selecionado.");
        return null;
    }

    const selectedGroups = Array.from(selectedCheckboxes).map(cb => ({
        groupKey: cb.dataset.groupKey,
        itemKeys: cb.dataset.itemKeys.split(',')
    }));

    return selectedGroups;
}

// AÇÃO REAL (chamada pelo app.js)
export const handleMassDeleteConfirmed = async () => {
    const selectedGroups = getSelectedItemsFromDOM();
    if (!selectedGroups) return; // Alerta já foi mostrado

    if (!currentTableId || !currentOrderSnapshot) return;
    if (!confirm(`Tem certeza que deseja EXCLUIR ${selectedGroups.length} grupo(s) de item(s) da conta?`)) return;

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
        alert(`Grupos de itens removidos. Valor: ${formatCurrency(valueRemoved)}.`);
    } catch (e) {
        console.error("Erro ao remover itens:", e);
        alert("Falha ao remover itens.");
    }
};

// AÇÃO REAL (chamada pelo app.js)
export function openTableTransferModal() {
    const selectedGroups = getSelectedItemsFromDOM();
    if (!selectedGroups) return; // Alerta já foi mostrado

    const allItemKeys = selectedGroups.flatMap(group => group.itemKeys);
    const itemsToTransferPayload = allItemKeys.map(key => {
        const [orderId, sentAt] = key.split('_');
        return currentOrderSnapshot?.sentItems?.find(item => item.orderId === orderId && String(item.sentAt) === sentAt);
    }).filter(Boolean);

    if (itemsToTransferPayload.length === 0) {
        alert("Erro ao encontrar itens selecionados.");
        return;
    }
     
    window.itemsToTransfer = itemsToTransferPayload; // Armazena payload
    const itemCount = itemsToTransferPayload.length;
    const modal = document.getElementById('tableTransferModal');
    if (!modal) return;

    // Preenche o modal
    const title = modal.querySelector('#transferModalTitle');
    const origin = modal.querySelector('#transferOriginTable');
    const targetInput = modal.querySelector('#targetTableInput');
    const dinersContainer = modal.querySelector('#newTableDinersInput');
    const confirmBtn = modal.querySelector('#confirmTableTransferBtn');

    if(title) title.textContent = `Transferir ${itemCount} Item(s)`;
    if(origin) origin.textContent = `Mesa ${currentTableId}`;
    if(targetInput) targetInput.value = '';
    if(dinersContainer) dinersContainer.classList.add('hidden');
    if(confirmBtn) {
         confirmBtn.textContent = 'Prosseguir';
         confirmBtn.disabled = true;
    }
    modal.style.display = 'flex';
};
// window.openTableTransferModal = openTableTransferModal; // Exposto no app.js

export function handleConfirmTableTransfer() { /* ... (lógica mantida) ... */ };
window.handleConfirmTableTransfer = handleConfirmTableTransfer;

// Placeholders (Exportados)
export const handleAddSplitAccount = async () => { alert("Divisão de conta (DEV)."); };
export const openPaymentModalForSplit = (splitKey) => { alert(`Pagar Conta ${splitKey} (DEV)`); };
export const moveItemsToMainAccount = (splitKey) => { alert(`Desfazer Conta ${splitKey} (DEV)`); };
export const openSplitTransferModal = (targetKey, mode, itemsToTransfer = null) => { alert(`Mover itens para/de ${targetKey} (DEV)`); };
export const handleFinalizeOrder = () => { alert("Finalizar Conta (DEV)"); };

// --- INICIALIZAÇÃO DO CONTROLLER ---
const attachReviewListListeners = () => {
    const selectAllItems = document.getElementById('selectAllItems');
    const itemCheckboxes = reviewItemsList?.querySelectorAll('.item-checkbox');
    const massDeleteBtn = document.getElementById('massDeleteBtn');
    const massTransferBtn = document.getElementById('massTransferBtn');
    const selectedCountSpan = document.getElementById('selectedItemsCount');
    const selectedCountDeleteSpan = document.getElementById('selectedItemsCountDelete');

    const updateMassActionButtons = () => {
        const checkedCount = reviewItemsList?.querySelectorAll('.item-checkbox:checked').length || 0;
        // Habilita/desabilita botões baseado na seleção
        if (massDeleteBtn) massDeleteBtn.disabled = checkedCount === 0;
        if (massTransferBtn) massTransferBtn.disabled = checkedCount === 0;
        // Atualiza contadores
        if (selectedCountSpan) selectedCountSpan.textContent = checkedCount;
        if (selectedCountDeleteSpan) selectedCountDeleteSpan.textContent = checkedCount;
        if (selectAllItems) {
            selectAllItems.checked = (itemCheckboxes && itemCheckboxes.length > 0) && (checkedCount === itemCheckboxes.length);
        }
    };

    if (selectAllItems) {
        const newSelectAll = selectAllItems.cloneNode(true);
        selectAllItems.parentNode.replaceChild(newSelectAll, selectAllItems);
        newSelectAll.addEventListener('change', (e) => {
            itemCheckboxes?.forEach(cb => cb.checked = e.target.checked);
            updateMassActionButtons();
        });
    }

    if(itemCheckboxes && reviewItemsList) {
        itemCheckboxes.forEach(cb => {
            const newCb = cb.cloneNode(true);
            cb.parentNode.replaceChild(newCb, cb);
            newCb.addEventListener('change', updateMassActionButtons);
        });
    }

    // **CORREÇÃO:** Altera listeners para chamar o modal de senha
    if (massDeleteBtn) {
         const newDeleteBtn = massDeleteBtn.cloneNode(true);
         massDeleteBtn.parentNode.replaceChild(newDeleteBtn, massDeleteBtn);
         // Chama o modal de senha com a AÇÃO DE EXECUÇÃO
         newDeleteBtn.addEventListener('click', () => window.openManagerAuthModal('executeMassDelete', null));
    }
     if (massTransferBtn) {
         const newTransferBtn = massTransferBtn.cloneNode(true);
         massTransferBtn.parentNode.replaceChild(newTransferBtn, massTransferBtn);
         // Chama o modal de senha com a AÇÃO DE EXECUÇÃO
         newTransferBtn.addEventListener('click', () => window.openManagerAuthModal('executeMassTransfer', null));
    }

    updateMassActionButtons(); // Atualiza estado inicial (deve ser 0)
};

export const initPaymentController = () => {
    if(paymentInitialized) return;
    console.log("[PaymentController] Inicializando...");

    // Mapeia Elementos (bloco mantido)
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
    // Fim Mapeamento

    if (!reviewItemsList) { console.error("[PaymentController] Erro Fatal: 'reviewItemsList' não encontrado."); return; }
    
    renderPaymentMethodButtons(); // Renderiza botões de pagamento

    // Adiciona Listeners Essenciais (bloco mantido)
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

    if (targetTableInput) { targetTableInput.addEventListener('input', async (e) => { /* ... (lógica mantida) ... */ }); }
    else { console.warn("[PaymentController] Input 'targetTableInput' (do modal de transferência) não encontrado."); }

    paymentInitialized = true;
    console.log("[PaymentController] Inicializado.");
};
