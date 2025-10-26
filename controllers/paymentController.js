// --- CONTROLLERS/PAYMENTCONTROLLER.JS (Painel 3) ---
import { currentTableId, currentOrderSnapshot } from "/app.js";
import { formatCurrency, calculateItemsValue, getNumericValueFromCurrency } from "/utils.js";
import { getTableDocRef, getCustomersCollectionRef, db } from "/services/firebaseService.js";
import {
    updateDoc, arrayUnion, arrayRemove, writeBatch, getFirestore, getDoc, serverTimestamp,
    collection, query, where, getDocs, addDoc, setDoc, doc
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

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
let customerRegModal, customerSearchCpfInput, searchCustomerByCpfBtn, customerSearchResultsDiv;
let customerNameInput, customerCpfInput, customerPhoneInput, customerEmailInput;
let closeCustomerRegModalBtn, saveCustomerBtn, linkCustomerToTableBtn;
let currentFoundCustomer = null;
let decreaseDinersBtn, increaseDinersBtn;

// Estado local
let isMassSelectionActive = false;
let paymentInitialized = false; // Flag para garantir que init rode só uma vez

const PAYMENT_METHODS = ['Dinheiro', 'Pix', 'Crédito', 'Débito', 'Ticket', 'Voucher'];

// --- FUNÇÕES DE CÁLCULO E UTILIDADE ---
const calculateTotal = (subtotal, applyServiceTax) => {
    return applyServiceTax ? subtotal * 1.10 : subtotal;
};
const updateText = (elementId, value) => {
    const el = document.getElementById(elementId);
    // console.log(`Updating ${elementId}: found=${!!el}, value=${value}`); // Debug extra
    if (el) {
        el.textContent = value;
    } else {
        console.warn(`Element with ID ${elementId} not found in updateText.`);
    }
};

// --- FUNÇÕES DE AÇÃO ---
export const executeDeletePayment = async (timestamp) => {
    if (!currentTableId || !timestamp) return;
    const tableRef = getTableDocRef(currentTableId);
    const paymentToRemove = currentOrderSnapshot?.payments.find(p => p.timestamp === timestamp);
    if (!paymentToRemove) {
        alert("Erro: Pagamento não encontrado para exclusão.");
        return;
    }
    console.log("[Payment] Attempting to delete payment:", paymentToRemove);
    try {
        await updateDoc(tableRef, { payments: arrayRemove(paymentToRemove) });
        console.log(`[Payment] Payment ${timestamp} removed successfully.`);
        // O listener do app.js vai atualizar a UI
    } catch (e) {
        console.error("Erro ao excluir pagamento:", e);
        alert(`Erro ao excluir pagamento: ${e.message}`);
    }
};
export const deletePayment = async (timestamp) => {
    console.log("[Payment] Requesting manager auth for deletePayment:", timestamp);
    window.openManagerAuthModal('deletePayment', timestamp);
};

// --- FUNÇÕES DE RENDERIZAÇÃO ---
const renderReviewItemsList = (orderSnapshot) => {
    if (!reviewItemsList) {
         // console.warn("renderReviewItemsList: reviewItemsList element not found.");
         return;
    }
    const items = orderSnapshot?.sentItems || [];
    const oldActionBar = document.getElementById('reviewActionBar');
    if (oldActionBar) oldActionBar.remove(); // Remove a barra antiga

    if (items.length === 0) {
        reviewItemsList.innerHTML = `<div class="text-sm text-dark-placeholder italic p-2">Nenhum item na conta principal para revisão.</div>`;
        return;
    }
    const groupedItems = items.reduce((acc, item) => {
        const key = `${item.id}-${item.note || ''}`;
        if (!acc[key]) { acc[key] = { ...item, count: 0, originalItems: [] }; }
        acc[key].count++;
        acc[key].originalItems.push(item);
        return acc;
     }, {});
    let itemsHtml = Object.values(groupedItems).map(group => {
        const itemData = JSON.stringify(group.originalItems).replace(/'/g, '&#39;');
        return `
        <div class="flex justify-between items-center py-2 border-b border-dark-border hover:bg-dark-input p-2 rounded-lg">
            <div class="flex items-center flex-grow min-w-0 mr-2">
                <input type="checkbox"
                       class="item-select-checkbox mr-3 h-5 w-5 bg-dark-input border-gray-600 rounded text-pumpkin focus:ring-pumpkin"
                       data-items='${itemData}'
                       onchange="window.activateItemSelection()">
                <div class="flex flex-col min-w-0">
                    <span class="font-semibold text-dark-text truncate">${group.name} (${group.count}x)</span>
                    <span class="text-xs text-dark-placeholder">${group.note || 'Sem observações'}</span>
                </div>
            </div>
            <span class="font-bold text-pumpkin flex-shrink-0">${formatCurrency(group.price * group.count)}</span>
        </div>`;
     }).join('');
    const actionBarHtml = `
        <div id="reviewActionBar" class="flex justify-between items-center p-2 mt-4 bg-dark-input rounded-lg sticky bottom-0 z-10">
            <div class="flex items-center">
                <input type="checkbox" id="selectAllItems" class="mr-2 h-4 w-4 bg-dark-input border-gray-600 rounded text-pumpkin focus:ring-pumpkin"
                       onchange="window.activateItemSelection('toggleAll')">
                <label for="selectAllItems" class="text-sm font-semibold">Selecionar Todos</label>
            </div>
            <div class="flex space-x-2">
                <button id="massDeleteBtn" class="px-3 py-1 bg-red-600 text-white rounded-lg hover:bg-red-700 transition text-sm font-bold opacity-50 cursor-not-allowed" disabled>
                    <i class="fas fa-trash"></i> (<span id="deleteCount">0</span>)
                </button>
                <button id="massTransferBtn" class="px-3 py-1 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition text-sm font-bold opacity-50 cursor-not-allowed" disabled>
                    <i class="fas fa-arrow-right"></i> (<span id="transferCount">0</span>)
                </button>
            </div>
        </div>`;

    reviewItemsList.innerHTML = itemsHtml + actionBarHtml; // Adiciona barra ao final
    attachReviewListListeners(); // Reanexa listeners aos botões da barra
};

const renderRegisteredPayments = (payments) => {
    if (!paymentSummaryList) return;
    if (!payments || payments.length === 0) {
        paymentSummaryList.innerHTML = `<p class="text-sm text-dark-placeholder italic">Nenhum pagamento registrado.</p>`;
        return;
    }
    paymentSummaryList.innerHTML = payments.map(p => `
        <div class="flex justify-between items-center py-1 border-b border-dark-border last:border-b-0">
            <div class="flex items-center space-x-2">
                <button class="text-red-500 hover:text-red-400 p-1" title="Excluir Pagamento" onclick="window.deletePayment(${p.timestamp})">
                    <i class="fas fa-times-circle"></i>
                </button>
                <span class="font-semibold">${p.method}</span>
            </div>
            <span class="text-gray-400">${p.value}</span>
        </div>`).join('');
};

const renderPaymentSplits = (orderSnapshot) => {
    if(!paymentSplitsContainer) return;
    // paymentSplitsContainer.innerHTML = '<p class="text-sm text-dark-placeholder italic">Divisão desativada.</p>';
};

const renderPaymentMethodButtons = () => {
    if (!paymentMethodButtonsContainer) return;
    paymentMethodButtonsContainer.innerHTML = PAYMENT_METHODS.map(method => `
        <button class="payment-method-btn" data-method="${method}">${method}</button>
    `).join('');
};

export const renderPaymentSummary = (tableId, orderSnapshot) => {
    // console.log("renderPaymentSummary called. Initialized:", paymentInitialized); // Debug
    if (!orderSnapshot || !paymentInitialized) return;

    // console.log("Snapshot received in renderPaymentSummary:", orderSnapshot); // Debug

    const payments = orderSnapshot.payments || [];
    const sentItems = orderSnapshot.sentItems || [];
    const subtotal = calculateItemsValue(sentItems);
    const applyServiceTax = orderSnapshot.serviceTaxApplied ?? true;
    const serviceTax = applyServiceTax ? subtotal * 0.10 : 0;
    const totalPrincipalAccount = subtotal + serviceTax;
    const totalPaidPrincipal = payments.reduce((sum, p) => sum + getNumericValueFromCurrency(p.value), 0);
    const remainingBalancePrincipal = totalPrincipalAccount - totalPaidPrincipal;
    const diners = parseInt(dinersSplitInput?.value) || 1;
    const valuePerDiner = totalPrincipalAccount > 0 ? totalPrincipalAccount / diners : 0; // Evita divisão por zero ou NaN

    // --- Debug Log dos Valores Calculados ---
    console.log(`[renderPaymentSummary] Calculations:
      Subtotal: ${subtotal}
      Service Tax: ${serviceTax}
      Total Principal: ${totalPrincipalAccount}
      Total Paid: ${totalPaidPrincipal}
      Remaining: ${remainingBalancePrincipal}
      Diners: ${diners}
      Value per Diner: ${valuePerDiner}`);
    // --- Fim Debug Log ---

    // Atualiza a UI
    updateText('orderSubtotalDisplayPayment', formatCurrency(subtotal));
    updateText('orderServiceTaxDisplayPayment', formatCurrency(serviceTax));
    updateText('orderTotalDisplayPayment', formatCurrency(totalPrincipalAccount));
    updateText('valuePerDinerDisplay', formatCurrency(valuePerDiner));
    updateText('remainingBalanceDisplay', formatCurrency(remainingBalancePrincipal > 0 ? remainingBalancePrincipal : 0));

    if (toggleServiceTaxBtn) {
        toggleServiceTaxBtn.textContent = applyServiceTax ? 'Remover' : 'Aplicar';
        toggleServiceTaxBtn.classList.toggle('bg-red-600', applyServiceTax);
        toggleServiceTaxBtn.classList.toggle('bg-green-600', !applyServiceTax);
        toggleServiceTaxBtn.disabled = false;
        toggleServiceTaxBtn.style.opacity = '1';
    }

    if (finalizeOrderBtn) {
        const totalRemaining = remainingBalancePrincipal;
        const canFinalize = sentItems.length === 0 && totalRemaining <= 0.01;
        finalizeOrderBtn.disabled = !canFinalize;
        finalizeOrderBtn.classList.toggle('opacity-50', !canFinalize);
        finalizeOrderBtn.classList.toggle('cursor-not-allowed', !canFinalize);
    }

    // Chama as funções de renderização filhas
    renderReviewItemsList(orderSnapshot);
    renderRegisteredPayments(payments);
    renderPaymentSplits(orderSnapshot);

    // Atualiza o input principal se houver cliente associado
    if (customerSearchInput && orderSnapshot?.clientName) {
        customerSearchInput.value = orderSnapshot.clientName;
        customerSearchInput.disabled = true;
    } else if (customerSearchInput) {
        customerSearchInput.value = '';
        customerSearchInput.disabled = false;
    }
};


// --- LÓGICAS DE AÇÃO EM MASSA E TRANSFERÊNCIA ---
window.activateItemSelection = (mode = null) => {
    const allCheckboxes = document.querySelectorAll('#reviewItemsList input[type="checkbox"].item-select-checkbox');
    const selectAllBox = document.getElementById('selectAllItems');
    const deleteBtn = document.getElementById('massDeleteBtn');
    const transferBtn = document.getElementById('massTransferBtn');

    if (!deleteBtn || !transferBtn || !selectAllBox) { return; }

    if (mode === 'toggleAll') {
        allCheckboxes.forEach(box => box.checked = selectAllBox.checked);
    }

    const selectedCheckboxes = document.querySelectorAll('#reviewItemsList input[type="checkbox"].item-select-checkbox:checked');
    const count = selectedCheckboxes.length;
    isMassSelectionActive = count > 0;

    const deleteCountSpan = document.getElementById('deleteCount');
    const transferCountSpan = document.getElementById('transferCount');
    if (deleteCountSpan) deleteCountSpan.textContent = count;
    if (transferCountSpan) transferCountSpan.textContent = count;

    [deleteBtn, transferBtn].forEach(btn => {
        if(btn){
            btn.disabled = !isMassSelectionActive;
            btn.classList.toggle('opacity-50', !isMassSelectionActive);
            btn.classList.toggle('cursor-not-allowed', !isMassSelectionActive);
        }
    });

    selectAllBox.checked = count === allCheckboxes.length && allCheckboxes.length > 0;

    window.itemsToTransfer = [];
    selectedCheckboxes.forEach(box => {
        try {
            const items = JSON.parse(box.dataset.items);
            window.itemsToTransfer.push(...items);
        } catch(e) { console.error("Erro ao ler dados de item para seleção:", e); }
    });
    // console.log("Itens selecionados:", window.itemsToTransfer); // Debug
};

export const handleMassActionRequest = (action) => {
    console.log(`handleMassActionRequest called with action: ${action}`); // Debug
    if (!window.itemsToTransfer || window.itemsToTransfer.length === 0) {
        alert("Nenhum item selecionado.");
        return;
    }
    console.log("Requesting manager auth for:", action); // Debug
    if (action === 'delete') {
        window.openManagerAuthModal('executeMassDelete', null);
    } else if (action === 'transfer') {
        window.openManagerAuthModal('executeMassTransfer', null);
    }
};

export const handleMassDeleteConfirmed = async () => {
    console.log("[Payment] handleMassDeleteConfirmed initiated."); // Debug
    if (!window.itemsToTransfer || window.itemsToTransfer.length === 0) {
        alert("Nenhum item selecionado para exclusão (handleMassDeleteConfirmed).");
        return;
    }

    const itemsToDelete = window.itemsToTransfer;
    const tableRef = getTableDocRef(currentTableId);
    const currentSentItems = currentOrderSnapshot?.sentItems || [];
    const allItemsWillBeDeleted = currentSentItems.length === itemsToDelete.length /* && Lógica de comparação mais robusta se necessário */;

    let closeTableConfirmed = false;
    if (allItemsWillBeDeleted) {
        closeTableConfirmed = confirm("Todos os itens serão removidos desta mesa. Deseja FECHAR a mesa após a exclusão?");
        console.log("[Payment] Close table confirmation:", closeTableConfirmed); // Debug
    }

    const valueToDecrease = itemsToDelete.reduce((sum, item) => sum + (item.price || 0), 0);
    const currentTotal = currentOrderSnapshot?.total || 0;
    const newTotal = Math.max(0, currentTotal - valueToDecrease);
    console.log(`[Payment] Deleting ${itemsToDelete.length} items. Value decrease: ${valueToDecrease}. New total: ${newTotal}. Close table: ${closeTableConfirmed}`); // Debug

    const dbInstance = getFirestore(); // Garante que temos a instância do DB
    const batch = writeBatch(dbInstance);

    itemsToDelete.forEach(item => {
        batch.update(tableRef, { sentItems: arrayRemove(item) });
    });
    batch.update(tableRef, { total: newTotal });
    if (closeTableConfirmed) {
        batch.update(tableRef, { status: 'closed' });
    }

    try {
        console.log("[Payment] Committing delete batch..."); // Debug
        await batch.commit();
        console.log("[Payment] Delete batch committed successfully."); // Debug

        alert(`${itemsToDelete.length} item(s) removidos da conta.${closeTableConfirmed ? ' A mesa foi fechada.' : ''}`);
        window.itemsToTransfer = []; // Limpa seleção global

        if (closeTableConfirmed) {
            console.log("[Payment] Navigating to panelScreen after closing table."); // Debug
            if (window.goToScreen) {
                 window.goToScreen('panelScreen');
            } else {
                 console.error("goToScreen function not found on window object");
            }
        }
    } catch (e) {
        console.error("Erro CRÍTICO ao excluir itens em massa:", e); // Log mais detalhado
        alert(`Falha CRÍTICA ao remover os itens: ${e.message}. Verifique o console.`);
    }
};

export function openTableTransferModal() {
    console.log("[Payment] openTableTransferModal called."); // Debug
    if (!window.itemsToTransfer || window.itemsToTransfer.length === 0) {
        alert("Nenhum item selecionado para transferência (openTableTransferModal).");
        return;
    }
    if(targetTableInput) targetTableInput.value = '';
    const newTableDinersInputEl = document.getElementById('newTableDinersInput');
    if(newTableDinersInputEl) newTableDinersInputEl.classList.add('hidden');
    const confirmBtn = document.getElementById('confirmTableTransferBtn');
    if(confirmBtn) {
        confirmBtn.disabled = true;
        confirmBtn.textContent = 'Prosseguir';
    }
    if (tableTransferModal) {
        tableTransferModal.style.display = 'flex';
    } else { alert("Erro: Modal de transferência não encontrado."); }
};
export function handleConfirmTableTransfer() {
     console.log("[Payment] handleConfirmTableTransfer called."); // Debug
     const targetTableInputEl = document.getElementById('targetTableInput'); // Renomeado para evitar conflito
     const targetTableNumber = targetTableInputEl?.value.trim();
     if (!targetTableNumber || parseInt(targetTableNumber) <= 0 || targetTableNumber === currentTableId) { /* ... */ return; }
     const items = window.itemsToTransfer || [];
     if(items.length === 0) { /* ... */ return; }
     const dinersInputEl = document.getElementById('newTableDiners'); // Renomeado
     const sectorInputEl = document.getElementById('newTableSector'); // Renomeado
     const dinersContainer = document.getElementById('newTableDinersInput');
     let diners = 0; let sector = '';
     if (dinersContainer && !dinersContainer.classList.contains('hidden')) {
         diners = parseInt(dinersInputEl?.value);
         sector = sectorInputEl?.value;
         if (!diners || !sector) { alert('Mesa destino fechada. Preencha pessoas e setor.'); return; }
     }
     const confirmBtn = document.getElementById('confirmTableTransferBtn');
     if(confirmBtn) confirmBtn.disabled = true;
     console.log(`[Payment] Calling global handleTableTransferConfirmed with: origin=${currentTableId}, target=${targetTableNumber}, items=${items.length}, diners=${diners}, sector=${sector}`); // Debug
     window.handleTableTransferConfirmed(currentTableId, targetTableNumber, items, diners, sector);
     const modal = document.getElementById('tableTransferModal');
     if(modal) modal.style.display = 'none';
     window.itemsToTransfer = [];
 };

// Placeholders/Funções Desativadas para Divisão
const handleAddSplitAccount = () => { alert("Funcionalidade de divisão desativada.")};
window.removeSplitAccount = (splitId) => { alert("Funcionalidade de divisão desativada.")};
window.openPaymentModalForSplit = (splitId) => { alert("Funcionalidade de divisão desativada.")};
window.openSplitTransferModal = (splitId, mode) => { alert("Funcionalidade de divisão desativada.")};

// Placeholder para Finalizar
export const handleFinalizeOrder = () => { alert("Finalizar Conta (DEV)"); };

// --- FUNÇÕES GESTÃO DE CLIENTES (Implementadas) ---
const openCustomerRegModal = () => { /* ... (mantida) ... */ };
const searchCustomer = async () => { /* ... (mantida) ... */ };
const saveCustomer = async () => { /* ... (mantida) ... */ };
const linkCustomerToTable = async () => { /* ... (mantida) ... */ };

// --- INICIALIZAÇÃO DO CONTROLLER ---
const attachReviewListListeners = () => { // Anexa listeners aos botões da barra de ação
    const massDeleteBtnEl = document.getElementById('massDeleteBtn'); // Renomeado
    const massTransferBtnEl = document.getElementById('massTransferBtn'); // Renomeado

    if (massDeleteBtnEl) {
         // Clona para remover listeners antigos e evitar duplicação
         const newDeleteBtn = massDeleteBtnEl.cloneNode(true);
         massDeleteBtnEl.parentNode.replaceChild(newDeleteBtn, massDeleteBtnEl);
         newDeleteBtn.addEventListener('click', () => handleMassActionRequest('delete'));
         // console.log("Listener attached to massDeleteBtn"); // Debug
    } else {
        // console.warn("massDeleteBtn not found in attachReviewListListeners"); // Debug
    }
     if (massTransferBtnEl) {
         // Clona para remover listeners antigos e evitar duplicação
         const newTransferBtn = massTransferBtnEl.cloneNode(true);
         massTransferBtnEl.parentNode.replaceChild(newTransferBtn, massTransferBtnEl);
         newTransferBtn.addEventListener('click', () => handleMassActionRequest('transfer'));
         // console.log("Listener attached to massTransferBtn"); // Debug
    } else {
         // console.warn("massTransferBtn not found in attachReviewListListeners"); // Debug
    }
};

// Guarda referências aos listeners para removê-los se initPaymentController for chamado novamente
let dinersDecreaseListener = null;
let dinersIncreaseListener = null;
let paymentMethodListener = null;
let paymentValueListener = null;
let addPaymentListener = null;
let finalizeOrderListener = null;
let openNfeListener = null;
let addSplitListener = null;
let openCalcListener = null;
let closeCalcListener = null;
let calcButtonsListener = null;
let confirmTransferListener = null;
let targetTableListener = null;
let openCustomerListener = null;
let closeCustomerListener = null;
let searchCustomerListener = null;
let saveCustomerListener = null;
let linkCustomerListener = null;
let customerFormInputListeners = []; // Array para listeners de input

export const initPaymentController = () => {
    if(paymentInitialized) {
        console.log("[PaymentController] Already initialized.");
        return; // Previne reinicialização
    }
    console.log("[PaymentController] Initializing...");

    // Mapeia Elementos Principais e Modais
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
    decreaseDinersBtn = document.getElementById('decreaseDinersBtn');
    increaseDinersBtn = document.getElementById('increaseDinersBtn');
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
    customerRegModal = document.getElementById('customerRegModal');
    customerSearchCpfInput = document.getElementById('customerSearchCpf');
    searchCustomerByCpfBtn = document.getElementById('searchCustomerByCpfBtn');
    customerSearchResultsDiv = document.getElementById('customerSearchResults');
    customerNameInput = document.getElementById('customerName');
    customerCpfInput = document.getElementById('customerCpf');
    customerPhoneInput = document.getElementById('customerPhone');
    customerEmailInput = document.getElementById('customerEmail');
    closeCustomerRegModalBtn = document.getElementById('closeCustomerRegModalBtn');
    saveCustomerBtn = document.getElementById('saveCustomerBtn');
    linkCustomerToTableBtn = document.getElementById('linkCustomerToTableBtn');
    if (tableTransferModal) {
        targetTableInput = tableTransferModal.querySelector('#targetTableInput');
        confirmTransferBtn = tableTransferModal.querySelector('#confirmTableTransferBtn');
        transferStatus = tableTransferModal.querySelector('#transferStatus');
    }
    selectiveTransferModal = document.getElementById('selectiveTransferModal');
    if(selectiveTransferModal) { /* ... (mapeamento mantido) ... */ }

    // Verifica elementos essenciais
    if (!reviewItemsList || !toggleServiceTaxBtn || !dinersSplitInput || !decreaseDinersBtn || !increaseDinersBtn || !paymentMethodButtonsContainer || !paymentValueInput || !addPaymentBtn || !finalizeOrderBtn || !openNfeModalBtn || !openCustomerRegBtn) {
        console.error("[PaymentController] Erro Fatal: Um ou mais elementos essenciais não foram encontrados no DOM. Abortando inicialização.");
        return;
    }

    renderPaymentMethodButtons();

    // --- Adiciona Listeners ---
    // Remove listeners antigos (caso haja re-inicialização acidental)
    // (Opcional, mas boa prática se houver risco de chamar init mais de uma vez)

    toggleServiceTaxBtn.addEventListener('click', async () => {
        if (!currentTableId) return;
        const newState = !currentOrderSnapshot?.serviceTaxApplied;
        console.log("[Payment] Toggling service tax to:", newState); // Debug
        try {
            await updateDoc(getTableDocRef(currentTableId), { serviceTaxApplied: newState });
            // UI será atualizada pelo listener
        } catch(e) { console.error("Erro ao atualizar taxa de serviço:", e); }
     });

    dinersDecreaseListener = () => {
        let currentValue = parseInt(dinersSplitInput.value) || 1;
        if (currentValue > 1) {
            dinersSplitInput.value = currentValue - 1;
            renderPaymentSummary(currentTableId, currentOrderSnapshot);
            console.log("Decreased diners to:", dinersSplitInput.value); // Debug
        }
    };
    decreaseDinersBtn.addEventListener('click', dinersDecreaseListener);

     dinersIncreaseListener = () => {
         let currentValue = parseInt(dinersSplitInput.value) || 1;
         dinersSplitInput.value = currentValue + 1;
         renderPaymentSummary(currentTableId, currentOrderSnapshot);
         console.log("Increased diners to:", dinersSplitInput.value); // Debug
    };
    increaseDinersBtn.addEventListener('click', dinersIncreaseListener);

    paymentMethodListener = (e) => {
        const btn = e.target.closest('.payment-method-btn');
        if (btn) {
            paymentMethodButtonsContainer.querySelectorAll('.payment-method-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            addPaymentBtn.disabled = !paymentValueInput.value; // Habilita/desabilita Adicionar Pagamento
            console.log("Payment method selected:", btn.dataset.method); // Debug
        }
    };
    paymentMethodButtonsContainer.addEventListener('click', paymentMethodListener);

    paymentValueListener = (e) => {
        const activeMethod = paymentMethodButtonsContainer.querySelector('.payment-method-btn.active');
        addPaymentBtn.disabled = !e.target.value || !activeMethod; // Habilita/desabilita Adicionar Pagamento
    };
    paymentValueInput.addEventListener('input', paymentValueListener);

    addPaymentListener = async () => {
        console.log("[Payment] Add Payment button clicked."); // Debug
        const activeMethodBtn = paymentMethodButtonsContainer.querySelector('.payment-method-btn.active');
        const method = activeMethodBtn?.dataset.method;
        let value = paymentValueInput.value.trim().replace(',', '.');

        if (!method || !value) { alert("Selecione um método e insira um valor."); return; }
        const numericValue = parseFloat(value);
        if (isNaN(numericValue) || numericValue <= 0) { alert("Valor inválido."); return; }

        const newPayment = { method: method, value: formatCurrency(numericValue), timestamp: Date.now() };
        console.log("[Payment] Attempting to add payment:", newPayment); // Debug
        try {
            await updateDoc(getTableDocRef(currentTableId), { payments: arrayUnion(newPayment) });
            paymentValueInput.value = '';
            activeMethodBtn.classList.remove('active');
            addPaymentBtn.disabled = true;
            console.log("[Payment] Payment added successfully."); // Debug
        } catch (e) {
            console.error("Erro ao adicionar pagamento:", e);
            alert(`Erro ao salvar pagamento: ${e.message}`);
        }
    };
    addPaymentBtn.addEventListener('click', addPaymentListener);

    finalizeOrderListener = () => handleFinalizeOrder(); // Chama placeholder
    finalizeOrderBtn.addEventListener('click', finalizeOrderListener);

    openNfeListener = () => window.openNfeModal(); // Chama placeholder global
    openNfeModalBtn.addEventListener('click', openNfeListener);

    if(addSplitAccountBtn) {
        addSplitListener = () => handleAddSplitAccount(); // Chama placeholder
        addSplitAccountBtn.addEventListener('click', addSplitListener);
    }

    openCalcListener = () => { if(calculatorModal) calculatorModal.style.display = 'flex'; };
    openCalculatorBtn.addEventListener('click', openCalcListener);

    closeCalcListener = () => { if (calculatorModal) calculatorModal.style.display = 'none'; };
    closeCalcBtnX.addEventListener('click', closeCalcListener);

    calcButtonsListener = (e) => { /* ... (lógica da calculadora mantida) ... */ };
    if (calcButtons) calcButtons.addEventListener('click', calcButtonsListener);

    if (confirmTransferBtn) {
        // Remove listener antigo ANTES de adicionar novo
        const newConfirmBtn = confirmTransferBtn.cloneNode(true);
        confirmTransferBtn.parentNode.replaceChild(newConfirmBtn, confirmTransferBtn);
        confirmTransferBtn = newConfirmBtn; // Atualiza a referência da variável global
        confirmTransferListener = () => handleConfirmTableTransfer();
        confirmTransferBtn.addEventListener('click', confirmTransferListener);
    }

    if (targetTableInput) {
        targetTableListener = async (e) => { /* ... (lógica de verificar mesa destino mantida) ... */ };
        targetTableInput.addEventListener('input', targetTableListener);
    }

    // Listeners do Modal Cliente
    openCustomerListener = () => openCustomerRegModal();
    openCustomerRegBtn.addEventListener('click', openCustomerListener);

    closeCustomerListener = () => { if(customerRegModal) customerRegModal.style.display = 'none'; };
    closeCustomerRegModalBtn.addEventListener('click', closeCustomerListener);

    searchCustomerListener = () => searchCustomer();
    searchCustomerByCpfBtn.addEventListener('click', searchCustomerListener);

    saveCustomerListener = () => saveCustomer();
    saveCustomerBtn.addEventListener('click', saveCustomerListener);

    linkCustomerListener = () => linkCustomerToTable();
    linkCustomerToTableBtn.addEventListener('click', linkCustomerListener);

    // Limpa listeners antigos dos inputs do formulário do cliente
    customerFormInputListeners.forEach(({ element, listener }) => element.removeEventListener('input', listener));
    customerFormInputListeners = []; // Limpa o array

    [customerNameInput, customerCpfInput].forEach(input => {
        if (input) {
            const listener = () => {
                const nameValid = customerNameInput?.value.trim().length > 2;
                const cpfRaw = customerCpfInput?.value.trim().replace(/\D/g,'');
                const cpfValid = cpfRaw.length === 11;
                if(saveCustomerBtn) saveCustomerBtn.disabled = !(nameValid && cpfValid);
            };
            input.addEventListener('input', listener);
            customerFormInputListeners.push({ element: input, listener: listener }); // Guarda referência
        }
    });

    paymentInitialized = true;
    console.log("[PaymentController] Initialized successfully.");
};
