// --- CONTROLLERS/PAYMENTCONTROLLER.JS (Painel 3) ---
import { currentTableId, currentOrderSnapshot } from "/app.js";
import { formatCurrency, calculateItemsValue, getNumericValueFromCurrency } from "/utils.js";
import { getTableDocRef, getCustomersCollectionRef, db } from "/services/firebaseService.js";
import {
    updateDoc, arrayUnion, arrayRemove, writeBatch, getFirestore, getDoc, serverTimestamp,
    collection, query, where, getDocs, addDoc, setDoc, doc
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// --- VARIÁVEIS DE ELEMENTOS ---
// (Redeclaradas para garantir escopo)
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
    // console.log(`[updateText] Attempting to update ${elementId} with value: ${value}`); // Debug
    if (el) {
        el.textContent = value;
        // console.log(`[updateText] Successfully updated ${elementId}`); // Debug
    } else {
        console.warn(`[updateText] Element with ID ${elementId} not found.`); // Aviso se o elemento não existir
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
        // O listener do app.js chamará renderPaymentSummary para atualizar a UI
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
    // console.log("[renderReviewItemsList] Called."); // Debug
    if (!reviewItemsList) {
         // console.warn("[renderReviewItemsList] reviewItemsList element not found.");
         return;
    }
    const items = orderSnapshot?.sentItems || [];
    const oldActionBar = document.getElementById('reviewActionBar');
    if (oldActionBar) oldActionBar.remove();

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

    reviewItemsList.innerHTML = itemsHtml + actionBarHtml;
    attachReviewListListeners(); // Reanexa listeners
    // console.log("[renderReviewItemsList] Finished rendering list and action bar."); // Debug
};

const renderRegisteredPayments = (payments) => {
    // console.log("[renderRegisteredPayments] Called."); // Debug
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
    // console.log("[renderPaymentMethodButtons] Called."); // Debug
    if (!paymentMethodButtonsContainer) return;
    paymentMethodButtonsContainer.innerHTML = PAYMENT_METHODS.map(method => `
        <button class="payment-method-btn" data-method="${method}">${method}</button>
    `).join('');
};

export const renderPaymentSummary = (tableId, orderSnapshot) => {
    // console.log("[renderPaymentSummary] Called. Initialized:", paymentInitialized); // Debug
    if (!orderSnapshot || !paymentInitialized) {
        // console.log("[renderPaymentSummary] Aborted: Snapshot missing or not initialized."); // Debug
        return;
    }

    // console.log("[renderPaymentSummary] Snapshot received:", orderSnapshot); // Debug

    const payments = orderSnapshot.payments || [];
    const sentItems = orderSnapshot.sentItems || [];
    const subtotal = calculateItemsValue(sentItems);
    const applyServiceTax = orderSnapshot.serviceTaxApplied ?? true;
    const serviceTax = applyServiceTax ? subtotal * 0.10 : 0;
    const totalPrincipalAccount = subtotal + serviceTax;
    const totalPaidPrincipal = payments.reduce((sum, p) => sum + getNumericValueFromCurrency(p.value), 0);
    const remainingBalancePrincipal = totalPrincipalAccount - totalPaidPrincipal;
    const diners = parseInt(dinersSplitInput?.value) || 1;
    const valuePerDiner = totalPrincipalAccount > 0 ? totalPrincipalAccount / diners : 0;

    // --- Debug Log dos Valores Calculados ---
    console.log(`[renderPaymentSummary] Calculations: Subtotal=${subtotal}, ServiceTax=${serviceTax}, TotalPrincipal=${totalPrincipalAccount}, Paid=${totalPaidPrincipal}, Remaining=${remainingBalancePrincipal}, Diners=${diners}, ValuePerDiner=${valuePerDiner}`);
    // --- Fim Debug Log ---

    // Atualiza a UI - Chamadas mantidas
    updateText('orderSubtotalDisplayPayment', formatCurrency(subtotal));
    updateText('orderServiceTaxDisplayPayment', formatCurrency(serviceTax));
    updateText('orderTotalDisplayPayment', formatCurrency(totalPrincipalAccount));
    updateText('valuePerDinerDisplay', formatCurrency(valuePerDiner));
    updateText('remainingBalanceDisplay', formatCurrency(remainingBalancePrincipal > 0 ? remainingBalancePrincipal : 0));

    // Atualiza Botão Taxa (Mantido)
    if (toggleServiceTaxBtn) {
        toggleServiceTaxBtn.textContent = applyServiceTax ? 'Remover' : 'Aplicar';
        toggleServiceTaxBtn.classList.toggle('bg-red-600', applyServiceTax);
        toggleServiceTaxBtn.classList.toggle('bg-green-600', !applyServiceTax);
        toggleServiceTaxBtn.disabled = false;
        toggleServiceTaxBtn.style.opacity = '1';
    }

    // Atualiza Botão Finalizar (Mantido)
    if (finalizeOrderBtn) {
        const totalRemaining = remainingBalancePrincipal;
        const canFinalize = sentItems.length === 0 && totalRemaining <= 0.01;
        finalizeOrderBtn.disabled = !canFinalize;
        finalizeOrderBtn.classList.toggle('opacity-50', !canFinalize);
        finalizeOrderBtn.classList.toggle('cursor-not-allowed', !canFinalize);
    }

    // Chama as funções de renderização filhas - CHAMADAS MANTIDAS
    renderReviewItemsList(orderSnapshot);
    renderRegisteredPayments(payments);
    renderPaymentSplits(orderSnapshot);

    // Atualiza Input Cliente (Mantido)
    if (customerSearchInput && orderSnapshot?.clientName) { /* ... */ }
    else if (customerSearchInput) { /* ... */ }

    // console.log("[renderPaymentSummary] Finished."); // Debug
};


// --- LÓGICAS DE AÇÃO EM MASSA E TRANSFERÊNCIA ---
window.activateItemSelection = (mode = null) => {
    // console.log(`[activateItemSelection] Called with mode: ${mode}`); // Debug
    const allCheckboxes = document.querySelectorAll('#reviewItemsList input[type="checkbox"].item-select-checkbox');
    const selectAllBox = document.getElementById('selectAllItems');
    const deleteBtn = document.getElementById('massDeleteBtn');
    const transferBtn = document.getElementById('massTransferBtn');

    if (!deleteBtn || !transferBtn || !selectAllBox) {
        // console.warn("[activateItemSelection] Action bar elements not found."); // Debug
        return;
    }

    if (mode === 'toggleAll') {
        // console.log("[activateItemSelection] Toggling all checkboxes to:", selectAllBox.checked); // Debug
        allCheckboxes.forEach(box => box.checked = selectAllBox.checked);
    }

    const selectedCheckboxes = document.querySelectorAll('#reviewItemsList input[type="checkbox"].item-select-checkbox:checked');
    const count = selectedCheckboxes.length;
    isMassSelectionActive = count > 0;
    // console.log(`[activateItemSelection] Selected count: ${count}, Active: ${isMassSelectionActive}`); // Debug

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
    // console.log("[activateItemSelection] Updated window.itemsToTransfer:", window.itemsToTransfer); // Debug
};

export const handleMassActionRequest = (action) => {
    console.log(`[handleMassActionRequest] Called with action: ${action}`); // Debug
    // Verifica se window.itemsToTransfer existe e tem itens ANTES de chamar o modal
    if (!window.itemsToTransfer || window.itemsToTransfer.length === 0) {
        // Tenta recalcular caso a seleção tenha ocorrido mas a variável não foi atualizada
        window.activateItemSelection();
        if (!window.itemsToTransfer || window.itemsToTransfer.length === 0) {
             alert("Nenhum item selecionado. Clique nas caixas de seleção ao lado dos itens.");
             return;
        }
    }
    console.log(`[handleMassActionRequest] Requesting manager auth for ${action} with ${window.itemsToTransfer.length} items.`); // Debug
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

    // Comparação mais robusta para verificar se todos os itens serão excluídos
    let allItemsWillBeDeleted = false;
    if (currentSentItems.length > 0 && currentSentItems.length === itemsToDelete.length) {
         const currentSentItemsStr = currentSentItems.map(JSON.stringify).sort();
         const itemsToDeleteStr = itemsToDelete.map(JSON.stringify).sort();
         allItemsWillBeDeleted = JSON.stringify(currentSentItemsStr) === JSON.stringify(itemsToDeleteStr);
    }
    console.log("[Payment] All items will be deleted check:", allItemsWillBeDeleted); // Debug

    let closeTableConfirmed = false;
    if (allItemsWillBeDeleted) {
        closeTableConfirmed = confirm("Todos os itens serão removidos desta mesa. Deseja FECHAR a mesa após a exclusão?");
        console.log("[Payment] Close table confirmation result:", closeTableConfirmed); // Debug
    }

    const valueToDecrease = itemsToDelete.reduce((sum, item) => sum + (item.price || 0), 0);
    const currentTotal = currentOrderSnapshot?.total || 0;
    const newTotal = Math.max(0, currentTotal - valueToDecrease);
    console.log(`[Payment] Deleting ${itemsToDelete.length} items. Value decrease: ${valueToDecrease}. New total: ${newTotal}. Close table: ${closeTableConfirmed}`); // Debug

    const dbInstance = getFirestore();
    const batch = writeBatch(dbInstance);

    itemsToDelete.forEach(item => { batch.update(tableRef, { sentItems: arrayRemove(item) }); });
    batch.update(tableRef, { total: newTotal });
    if (closeTableConfirmed) { batch.update(tableRef, { status: 'closed' }); }

    try {
        console.log("[Payment] Committing delete batch..."); // Debug
        await batch.commit();
        console.log("[Payment] Delete batch committed successfully."); // Debug

        alert(`${itemsToDelete.length} item(s) removidos da conta.${closeTableConfirmed ? ' A mesa foi fechada.' : ''}`);
        window.itemsToTransfer = []; // Limpa seleção global

        if (closeTableConfirmed) {
            console.log("[Payment] Navigating to panelScreen after closing table."); // Debug
            // A navegação agora é feita pelo listener do app.js que detecta a mudança de status
            // window.goToScreen('panelScreen'); // REMOVIDO - Deixa o listener tratar
        }
        // Se não fechou, o listener do app.js vai atualizar a UI da mesa atual
    } catch (e) {
        console.error("Erro CRÍTICO ao excluir itens em massa:", e);
        alert(`Falha CRÍTICA ao remover os itens: ${e.message}. Verifique o console.`);
    }
};

export function openTableTransferModal() { /* ... (mantida) ... */ };
export function handleConfirmTableTransfer() { /* ... (mantida) ... */ };

// Placeholders/Funções Desativadas para Divisão
const handleAddSplitAccount = () => { alert("Funcionalidade de divisão desativada.")};
window.removeSplitAccount = (splitId) => { alert("Funcionalidade de divisão desativada.")};
window.openPaymentModalForSplit = (splitId) => { alert("Funcionalidade de divisão desativada.")};
window.openSplitTransferModal = (splitId, mode) => { alert("Funcionalidade de divisão desativada.")};

// Placeholder para Finalizar
export const handleFinalizeOrder = () => { alert("Finalizar Conta (DEV)"); };


// --- FUNÇÕES GESTÃO DE CLIENTES (Implementadas - mantidas) ---
const openCustomerRegModal = () => { /* ... */ };
const searchCustomer = async () => { /* ... */ };
const saveCustomer = async () => { /* ... */ };
const linkCustomerToTable = async () => { /* ... */ };


// --- INICIALIZAÇÃO DO CONTROLLER ---
// Função separada para anexo de listeners, garantindo que não sejam duplicados
const attachReviewListListeners = () => {
    // console.log("[attachReviewListListeners] Attaching listeners to action bar buttons..."); // Debug
    const massDeleteBtnEl = document.getElementById('massDeleteBtn');
    const massTransferBtnEl = document.getElementById('massTransferBtn');

    if (massDeleteBtnEl) {
         // Clona para remover listeners antigos
         const newDeleteBtn = massDeleteBtnEl.cloneNode(true);
         massDeleteBtnEl.parentNode.replaceChild(newDeleteBtn, massDeleteBtnEl);
         newDeleteBtn.addEventListener('click', () => handleMassActionRequest('delete'));
         // console.log("[attachReviewListListeners] Listener attached to massDeleteBtn"); // Debug
    } else {
         // console.warn("[attachReviewListListeners] massDeleteBtn not found"); // Debug
    }
     if (massTransferBtnEl) {
         // Clona para remover listeners antigos
         const newTransferBtn = massTransferBtnEl.cloneNode(true);
         massTransferBtnEl.parentNode.replaceChild(newTransferBtn, massTransferBtnEl);
         newTransferBtn.addEventListener('click', () => handleMassActionRequest('transfer'));
         // console.log("[attachReviewListListeners] Listener attached to massTransferBtn"); // Debug
    } else {
         // console.warn("[attachReviewListListeners] massTransferBtn not found"); // Debug
    }
};

// Remove todos os listeners anexados por esta instância do controller
// (Chamada se initPaymentController for executado novamente - prevenção)
const removeAllListeners = () => {
    console.warn("[PaymentController] Removing existing listeners before re-initialization.");
    if (toggleServiceTaxBtn && toggleServiceTaxBtn._listener) toggleServiceTaxBtn.removeEventListener('click', toggleServiceTaxBtn._listener);
    if (decreaseDinersBtn && dinersDecreaseListener) decreaseDinersBtn.removeEventListener('click', dinersDecreaseListener);
    if (increaseDinersBtn && dinersIncreaseListener) increaseDinersBtn.removeEventListener('click', dinersIncreaseListener);
    if (paymentMethodButtonsContainer && paymentMethodListener) paymentMethodButtonsContainer.removeEventListener('click', paymentMethodListener);
    if (paymentValueInput && paymentValueListener) paymentValueInput.removeEventListener('input', paymentValueListener);
    if (addPaymentBtn && addPaymentListener) addPaymentBtn.removeEventListener('click', addPaymentListener);
    if (finalizeOrderBtn && finalizeOrderListener) finalizeOrderBtn.removeEventListener('click', finalizeOrderListener);
    if (openNfeModalBtn && openNfeListener) openNfeModalBtn.removeEventListener('click', openNfeListener);
    if (addSplitAccountBtn && addSplitListener) addSplitAccountBtn.removeEventListener('click', addSplitListener);
    if (openCalculatorBtn && openCalcListener) openCalculatorBtn.removeEventListener('click', openCalcListener);
    if (closeCalcBtnX && closeCalcListener) closeCalcBtnX.removeEventListener('click', closeCalcListener);
    if (calcButtons && calcButtonsListener) calcButtons.removeEventListener('click', calcButtonsListener);
    if (confirmTransferBtn && confirmTransferListener) confirmTransferBtn.removeEventListener('click', confirmTransferListener);
    if (targetTableInput && targetTableListener) targetTableInput.removeEventListener('input', targetTableListener);
    if (openCustomerRegBtn && openCustomerListener) openCustomerRegBtn.removeEventListener('click', openCustomerListener);
    if (closeCustomerRegModalBtn && closeCustomerListener) closeCustomerRegModalBtn.removeEventListener('click', closeCustomerListener);
    if (searchCustomerByCpfBtn && searchCustomerListener) searchCustomerByCpfBtn.removeEventListener('click', searchCustomerListener);
    if (saveCustomerBtn && saveCustomerListener) saveCustomerBtn.removeEventListener('click', saveCustomerListener);
    if (linkCustomerToTableBtn && linkCustomerListener) linkCustomerToTableBtn.removeEventListener('click', linkCustomerListener);
    customerFormInputListeners.forEach(({ element, listener }) => element.removeEventListener('input', listener));
    customerFormInputListeners = [];
};


export const initPaymentController = () => {
    if(paymentInitialized) {
        console.log("[PaymentController] Already initialized. Skipping.");
        // Considerar se alguma atualização é necessária mesmo se já inicializado
        return;
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
    if(selectiveTransferModal) { /* ... */ }

    // Verifica elementos essenciais ANTES de anexar listeners
    const essentialElements = [reviewItemsList, toggleServiceTaxBtn, dinersSplitInput, decreaseDinersBtn, increaseDinersBtn, paymentMethodButtonsContainer, paymentValueInput, addPaymentBtn, finalizeOrderBtn, openNfeModalBtn, openCustomerRegBtn, calculatorModal, closeCalcBtnX, tableTransferModal, customerRegModal];
    if (essentialElements.some(el => !el)) {
        console.error("[PaymentController] Erro Fatal: Um ou mais elementos essenciais não foram encontrados no DOM durante o mapeamento. Abortando inicialização.");
        // Encontra qual elemento está faltando
        const missing = ['reviewItemsList', 'toggleServiceTaxBtn', 'dinersSplitInput', 'decreaseDinersBtn', 'increaseDinersBtn', 'paymentMethodButtonsContainer', 'paymentValueInput', 'addPaymentBtn', 'finalizeOrderBtn', 'openNfeModalBtn', 'openCustomerRegBtn', 'calculatorModal', 'closeCalcBtnX', 'tableTransferModal', 'customerRegModal']
            .filter((id, index) => !essentialElements[index]);
        console.error("Elementos faltando:", missing);
        return;
    }

    // Renderiza botões de pagamento (só precisa rodar uma vez)
    renderPaymentMethodButtons();
    console.log("[PaymentController] Payment method buttons rendered.");

    // --- Adiciona Listeners ---
    // Remove listeners antigos para evitar duplicação (mais seguro)
    removeAllListeners();

    // Define e anexa listeners
    const toggleTaxListener = async () => { /* ... (lógica mantida) ... */ };
    toggleServiceTaxBtn.addEventListener('click', toggleTaxListener);
    toggleServiceTaxBtn._listener = toggleTaxListener; // Guarda referência para remover depois

    dinersDecreaseListener = () => { /* ... (lógica mantida) ... */ };
    decreaseDinersBtn.addEventListener('click', dinersDecreaseListener);

    dinersIncreaseListener = () => { /* ... (lógica mantida) ... */ };
    increaseDinersBtn.addEventListener('click', dinersIncreaseListener);

    paymentMethodListener = (e) => { /* ... (lógica mantida) ... */ };
    paymentMethodButtonsContainer.addEventListener('click', paymentMethodListener);

    paymentValueListener = (e) => { /* ... (lógica mantida) ... */ };
    paymentValueInput.addEventListener('input', paymentValueListener);

    addPaymentListener = async () => { /* ... (lógica mantida) ... */ };
    addPaymentBtn.addEventListener('click', addPaymentListener);

    finalizeOrderListener = () => handleFinalizeOrder();
    finalizeOrderBtn.addEventListener('click', finalizeOrderListener);

    openNfeListener = () => window.openNfeModal();
    openNfeModalBtn.addEventListener('click', openNfeListener);

    if(addSplitAccountBtn) {
        addSplitListener = () => handleAddSplitAccount();
        addSplitAccountBtn.addEventListener('click', addSplitListener);
    }

    openCalcListener = () => { if(calculatorModal) calculatorModal.style.display = 'flex'; };
    openCalculatorBtn.addEventListener('click', openCalcListener);

    closeCalcListener = () => { if (calculatorModal) calculatorModal.style.display = 'none'; };
    closeCalcBtnX.addEventListener('click', closeCalcListener);

    calcButtonsListener = (e) => { /* ... (lógica da calculadora mantida) ... */ };
    if (calcButtons) calcButtons.addEventListener('click', calcButtonsListener);

    if (confirmTransferBtn) {
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

    // Limpa listeners antigos dos inputs do formulário antes de adicionar novos
    customerFormInputListeners.forEach(({ element, listener }) => element.removeEventListener('input', listener));
    customerFormInputListeners = [];

    [customerNameInput, customerCpfInput].forEach(input => {
        if (input) {
            const listener = () => { /* ... (lógica de validação mantida) ... */ };
            input.addEventListener('input', listener);
            customerFormInputListeners.push({ element: input, listener: listener });
        }
    });

    paymentInitialized = true; // Marca como inicializado NO FINAL
    console.log("[PaymentController] Initialized successfully and listeners attached.");
};
