// --- CONTROLLERS/PAYMENTCONTROLLER.JS (Painel 3) ---
import { currentTableId, currentOrderSnapshot } from "/app.js";
import { formatCurrency, calculateItemsValue, getNumericValueFromCurrency } from "/utils.js";
import { getTableDocRef } from "/services/firebaseService.js";
import { updateDoc, arrayUnion, arrayRemove, writeBatch, getFirestore, getDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
// REMOVIDO: import { openManagerAuthModal } from "./managerController.js";
// REMOVIDO: import { handleTableTransferConfirmed } from "./panelController.js";

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

// INICIA o fluxo de senha (chamada pelo HTML)
export const deletePayment = async (timestamp) => {
    // Chama a função GLOBAL do app.js
    window.openManagerAuthModal('deletePayment', timestamp);
}
// window.deletePayment = deletePayment; // Exposto globalmente no app.js


// --- FUNÇÕES DE RENDERIZAÇÃO ---
const renderReviewItemsList = (orderSnapshot) => {
    if (!reviewItemsList) return;
    const groupedItems = groupMainAccountItems(orderSnapshot);
    const mainAccountItemsCount = Object.values(groupedItems).reduce((sum, group) => sum + group.totalCount, 0);

    // REMOVIDO: Botões do título
    // const transferBtn = document.getElementById('itemMassTransferBtn');
    // const deleteBtn = document.getElementById('itemMassDeleteBtn');
    
    if (mainAccountItemsCount === 0) {
        reviewItemsList.innerHTML = `<div class="text-sm text-dark-placeholder italic p-2">Nenhum item enviado para a conta ainda.</div>`;
        const selectAll = document.getElementById('selectAllItems');
        if(selectAll) selectAll.disabled = true;
        const massTransferBtn = document.getElementById('massTransferBtn');
        if(massTransferBtn) massTransferBtn.disabled = true;
        const massDeleteBtn = document.getElementById('massDeleteBtn');
        if(massDeleteBtn) massDeleteBtn.disabled = true;
        return;
    } else {
        const selectAll = document.getElementById('selectAllItems');
        if(selectAll) selectAll.disabled = false;
    }

    const listHtml = Object.values(groupedItems).map(group => {
        const firstItem = group.items[0];
        const groupKey = group.groupKey;
        const massItemKeys = group.items.map(item => `${item.orderId}_${item.sentAt}`).join(',');
        const existingCheckbox = document.querySelector(`.item-select-checkbox[data-group-key="${groupKey}"]`);
        const checkedAttr = (existingCheckbox && existingCheckbox.checked) ? 'checked' : '';

        return `
            <div class="flex items-start justify-between py-1 border-b border-gray-600 hover:bg-gray-700 transition">
                {/* Checkbox sempre habilitado */}
                <input type="checkbox" class="item-select-checkbox mt-1.5 ml-1 mr-2 h-4 w-4 rounded bg-dark-input border-gray-500 text-pumpkin focus:ring-pumpkin"
                       data-group-key="${groupKey}" data-item-keys="${massItemKeys}" ${checkedAttr}>
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

// REMOVIDO: activateItemSelection (agora é fluxo direto)

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
export const handleMassDeleteConfirmed = async () => {
    const selectedCheckboxes = document.querySelectorAll('#reviewItemsList input[type="checkbox"].item-select-checkbox:checked');
    if (selectedCheckboxes.length === 0) { alert("Nenhum item selecionado."); return; }
    const selectedGroups = Array.from(selectedCheckboxes).map(cb => ({ groupKey: cb.dataset.groupKey }));
    
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
    const selectedCheckboxes = document.querySelectorAll('#reviewItemsList input[type="checkbox"].item-select-checkbox:checked');
    if (selectedCheckboxes.length === 0) { alert("Nenhum item selecionado."); return; }
    const selectedGroups = Array.from(selectedCheckboxes).map(cb => ({ groupKey: cb.dataset.groupKey, itemKeys: cb.dataset.itemKeys.split(',') }));

    const allItemKeys = selectedGroups.flatMap(group => group.itemKeys);
    const itemsToTransferPayload = allItemKeys.map(key => {
        const [orderId, sentAt] = key.split('_');
        return currentOrderSnapshot?.sentItems?.find(item => item.orderId === orderId && String(item.sentAt) === sentAt);
    }).filter(Boolean);

    if (itemsToTransferPayload.length === 0) { alert("Erro ao encontrar itens selecionados."); return; }

     window.itemsToTransfer = itemsToTransferPayload; // Armazena payload
     const itemCount = itemsToTransferPayload.length;
     const modal = document.getElementById('tableTransferModal');
     if (!modal) return;

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

export function handleConfirmTableTransfer() {
     const targetTableInput = document.getElementById('targetTableInput');
     const targetTableNumber = targetTableInput?.value.trim();
     if (!targetTableNumber || parseInt(targetTableNumber) <= 0 || targetTableNumber === currentTableId) { alert("Insira um número de mesa de destino válido e diferente."); return; }
     const items = window.itemsToTransfer || [];
     if(items.length === 0) { alert("Erro: Nenhum item selecionado para transferência."); return; }
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
    const selectAllItems = document.getElementById('selectAllItems');
    const itemCheckboxes = reviewItemsList?.querySelectorAll('.item-checkbox');
    const massDeleteBtn = document.getElementById('massDeleteBtn');
    const massTransferBtn = document.getElementById('massTransferBtn');
    const selectedCountSpan = document.getElementById('selectedItemsCount');
    const selectedCountDeleteSpan = document.getElementById('selectedItemsCountDelete');

    const updateMassActionButtons = () => {
        const checkedCount = reviewItemsList?.querySelectorAll('.item-checkbox:checked').length || 0;
        if (massDeleteBtn) massDeleteBtn.disabled = checkedCount === 0;
        if (massTransferBtn) massTransferBtn.disabled = checkedCount === 0;
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

    // **CORREÇÃO:** Altera listeners para chamar handleMassActionRequest (que chama o modal)
    if (massDeleteBtn) {
         const newDeleteBtn = massDeleteBtn.cloneNode(true);
         massDeleteBtn.parentNode.replaceChild(newDeleteBtn, massDeleteBtn);
         newDeleteBtn.addEventListener('click', () => handleMassActionRequest('delete'));
    }
     if (massTransferBtn) {
         const newTransferBtn = massTransferBtn.cloneNode(true);
         massTransferBtn.parentNode.replaceChild(newTransferBtn, massTransferBtn);
         newTransferBtn.addEventListener('click', () => handleMassActionRequest('transfer'));
    }

    updateMassActionButtons();
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
    if(toggleServiceTaxBtn) toggleServiceTaxBtn.addEventListener('click', async () => {
        if (!currentTableId || !currentOrderSnapshot) return;
        const currentStatus = currentOrderSnapshot.serviceTaxApplied === undefined ? true : currentOrderSnapshot.serviceTaxApplied;
        try {
            await updateDoc(getTableDocRef(currentTableId), { serviceTaxApplied: !currentStatus });
            console.log(`Taxa de serviço ${!currentStatus ? 'aplicada' : 'removida'}.`);
        } catch(e) { console.error("Erro ao alternar taxa:", e); }
    });
    
    if(dinersSplitInput) dinersSplitInput.addEventListener('input', () => {
        if (currentOrderSnapshot) renderPaymentSummary(currentTableId, currentOrderSnapshot);
    });
    
    if(paymentMethodButtonsContainer) paymentMethodButtonsContainer.addEventListener('click', (e) => {
        const btn = e.target.closest('.payment-method-btn');
        if (btn) {
            paymentMethodButtonsContainer.querySelectorAll('.payment-method-btn').forEach(b => b.classList.remove('active', 'bg-pumpkin', 'text-white'));
            btn.classList.add('active', 'bg-pumpkin', 'text-white');
            if(addPaymentBtn && remainingBalanceDisplay) {
                 const isClosed = remainingBalanceDisplay.classList.contains('text-green-400') || (getNumericValueFromCurrency(remainingBalanceDisplay.textContent || 'R$ 0,00') === 0 && (currentOrderSnapshot?.payments?.length || 0) > 0);
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
