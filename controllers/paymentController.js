// --- CONTROLLERS/PAYMENTCONTROLLER.JS (Painel 3) ---
import { currentTableId, currentOrderSnapshot } from "/app.js";
import { formatCurrency, calculateItemsValue, getNumericValueFromCurrency } from "/utils.js";
import { getTableDocRef } from "/services/firebaseService.js";
import { updateDoc, arrayUnion, arrayRemove, writeBatch, getFirestore, getDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
// REMOVIDO: import { openManagerAuthModal } from "./managerController.js"; // <-- ESTA LINHA CAUSOU O ERRO
import { handleTableTransferConfirmed } from "./panelController.js"; // Importa função de transferência

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
const calculateTotal = (subtotal, applyServiceTax) => {
    const taxRate = applyServiceTax ? 0.10 : 0;
    const serviceValue = subtotal * taxRate;
    const total = subtotal + serviceValue;
    return { total, serviceValue };
};
const updateText = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
};
const groupMainAccountItems = (orderSnapshot) => {
    if (!orderSnapshot || !orderSnapshot.sentItems) return {};
    const sentItems = orderSnapshot.sentItems || [];
    
    // Agrupa diretamente os sentItems (lógica de splits removida por hora)
    return sentItems.reduce((acc, item) => {
        const groupKey = `${item.name}-${item.note || ''}`;
        if (!acc[groupKey]) {
            acc[groupKey] = { items: [], totalCount: 0, totalValue: 0, groupKey: groupKey };
        }
        acc[groupKey].items.push(item);
        acc[groupKey].totalCount++;
        acc[groupKey].totalValue += (item.price || 0);
        return acc;
    }, {});
};

// --- FUNÇÕES DE AÇÃO ---
// AÇÃO REAL (chamada pelo app.js após a senha)
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
// window.deletePayment = deletePayment; // Exposição global movida para app.js

// --- FUNÇÕES DE RENDERIZAÇÃO ---
const renderReviewItemsList = (orderSnapshot) => {
    if (!reviewItemsList) return;
    const groupedItems = groupMainAccountItems(orderSnapshot);
    const mainAccountItemsCount = Object.values(groupedItems).reduce((sum, group) => sum + group.totalCount, 0);

    const transferBtn = document.getElementById('itemMassTransferBtn');
    const deleteBtn = document.getElementById('itemMassDeleteBtn');
    
    if(transferBtn) transferBtn.classList.toggle('text-yellow-400', isMassSelectionActive);
    if(deleteBtn) deleteBtn.classList.toggle('text-red-400', isMassSelectionActive);
    if(transferBtn) transferBtn.classList.toggle('text-gray-400', !isMassSelectionActive);
    if(deleteBtn) deleteBtn.classList.toggle('text-gray-400', !isMassSelectionActive);

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

    const listHtml = Object.values(groupedItems).map(group => {
        const firstItem = group.items[0];
        const groupKey = group.groupKey;
        const massItemKeys = group.items.map(item => `${item.orderId}_${item.sentAt}`).join(',');
        const disabledAttr = isMassSelectionActive ? '' : 'disabled';
        const existingCheckbox = document.querySelector(`.item-select-checkbox[data-group-key="${groupKey}"]`);
        const checkedAttr = (existingCheckbox && existingCheckbox.checked) ? 'checked' : '';

        return `
            <div class="flex items-start justify-between py-1 border-b border-gray-600 hover:bg-gray-700 transition">
                <input type="checkbox" class="item-select-checkbox mt-1.5 ml-1 mr-2 h-4 w-4 rounded bg-dark-input border-gray-500 text-pumpkin focus:ring-pumpkin"
                       data-group-key="${groupKey}" data-item-keys="${massItemKeys}"
                       ${disabledAttr} ${checkedAttr}>
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
                // Chama a função global (definida no app.js)
                deleteBtn.onclick = () => window.deletePayment(p.timestamp);
            }
            paymentSummaryList.appendChild(paymentDiv);
        });
    }
};
const renderPaymentSplits = (orderSnapshot) => {
     if (!paymentSplitsContainer) return;
     paymentSplitsContainer.innerHTML = `<div class="text-sm text-dark-placeholder italic p-2">Divisão de contas (Em desenvolvimento).</div>`;
     if(addSplitAccountBtn) addSplitAccountBtn.disabled = true;
};
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
export const renderPaymentSummary = (tableId, orderSnapshot) => {
    if (!orderSnapshot || !paymentInitialized) return;

    const tableData = orderSnapshot;
    const subtotal = tableData.total || 0;
    const payments = tableData.payments || [];
    const currentPaymentsTotal = payments.reduce((sum, p) => sum + (p.value || 0), 0);
    const serviceTaxApplied = orderSnapshot.serviceTaxApplied === undefined ? true : orderSnapshot.serviceTaxApplied;
    const { total: generalTotal, serviceValue } = calculateTotal(subtotal, serviceTaxApplied);
    const diners = parseInt(dinersSplitInput?.value) || 1;
    const valuePerDiner = diners > 0 ? generalTotal / diners : 0;
    const remainingBalance = generalTotal - currentPaymentsTotal;
    const isClosed = remainingBalance <= 0.01;
    const displayBalance = Math.abs(remainingBalance);

    const paymentTableNumberEl = document.getElementById('payment-table-number');
    if (paymentTableNumberEl) paymentTableNumberEl.textContent = `Mesa ${tableId}`;
    updateText('orderSubtotalDisplayPayment', formatCurrency(subtotal));
    updateText('orderServiceTaxDisplayPayment', formatCurrency(serviceValue));
    updateText('orderTotalDisplayPayment', formatCurrency(generalTotal));
    updateText('valuePerDinerDisplay', formatCurrency(valuePerDiner));

    if (remainingBalanceDisplay) {
        remainingBalanceDisplay.textContent = formatCurrency(displayBalance);
        const label = remainingBalanceDisplay.previousElementSibling;
        remainingBalanceDisplay.classList.remove('text-red-400', 'text-green-400', 'text-dark-text');
        if (!isClosed) {
            remainingBalanceDisplay.classList.add('text-red-400');
            if(label) label.textContent = 'VALOR RESTANTE:';
        } else if (remainingBalance < -0.01) {
            remainingBalanceDisplay.classList.add('text-green-400');
            if(label) label.textContent = 'TROCO:';
        } else {
            remainingBalanceDisplay.classList.add('text-dark-text');
            if(label) label.textContent = 'VALOR RESTANTE:';
        }
    }

    if (toggleServiceTaxBtn) {
        toggleServiceTaxBtn.textContent = serviceTaxApplied ? 'Remover' : 'Aplicar';
        toggleServiceTaxBtn.classList.toggle('bg-green-600', serviceTaxApplied);
        toggleServiceTaxBtn.classList.toggle('hover:bg-green-700', serviceTaxApplied);
        toggleServiceTaxBtn.classList.toggle('bg-red-600', !serviceTaxApplied);
        toggleServiceTaxBtn.classList.toggle('hover:bg-red-700', !serviceTaxApplied);
    }

    if (finalizeOrderBtn) finalizeOrderBtn.disabled = !isClosed;
    if (openNfeModalBtn) openNfeModalBtn.disabled = !isClosed;
    if (addPaymentBtn) addPaymentBtn.disabled = isClosed;

    renderReviewItemsList(orderSnapshot);
    renderRegisteredPayments(payments);
    renderPaymentSplits(orderSnapshot);
};


// --- LÓGICAS DE AÇÃO EM MASSA E TRANSFERÊNCIA ---
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
};

export const handleMassActionRequest = (action) => {
    if (isMassSelectionActive) {
        activateItemSelection(action); // Executa
    } else {
        // Chama a função GLOBAL do app.js
        window.openManagerAuthModal(action === 'delete' ? 'openMassDelete' : 'openMassTransfer', action);
    }
};

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

export function openTableTransferModal(items) {
     window.itemsToTransfer = items; // Armazena payload
     const itemCount = items.length;
     const modal = document.getElementById('tableTransferModal');
     if (!modal) return;

     const title = modal.querySelector('#transferModalTitle'); // Busca dentro do modal
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
         confirmBtn.disabled = true; // Desabilita até verificar mesa
     }
     modal.style.display = 'flex';
};
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
     // Chama a função importada do panelController
     handleTableTransferConfirmed(currentTableId, targetTableNumber, items, diners, sector);
     const modal = document.getElementById('tableTransferModal');
     if(modal) modal.style.display = 'none';
     window.itemsToTransfer = [];
 };
// Expor globalmente
window.handleConfirmTableTransfer = handleConfirmTableTransfer;

// Placeholders (Exportados)
export const handleAddSplitAccount = async () => { alert("Divisão de conta (DEV)."); };
export const openPaymentModalForSplit = (splitKey) => { alert(`Pagar Conta ${splitKey} (DEV)`); };
export const moveItemsToMainAccount = (splitKey) => { alert(`Desfazer Conta ${splitKey} (DEV)`); };
export const openSplitTransferModal = (targetKey, mode, itemsToTransfer = null) => { alert(`Mover itens para/de ${targetKey} (DEV)`); };
export const handleFinalizeOrder = () => { alert("Finalizar Conta (DEV)"); };

// --- INICIALIZAÇÃO DO CONTROLLER ---
const attachReviewListListeners = () => {
    // Esta função é chamada após renderReviewItemsList
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

    updateMassActionButtons();
};

export const initPaymentController = () => {
    if(paymentInitialized) return;
    console.log("[PaymentController] Inicializando...");

    // **CORREÇÃO:** Mapeia TODOS os elementos PRIMEIRO
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
    // Fim do bloco de mapeamento

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
            const transferStatusEl = document.getElementById('transferStatus');
            
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
