// --- CONTROLLERS/PAYMENTCONTROLLER.JS (VERSÃO FINAL - ARQUIVAMENTO E PROTEÇÃO) ---
import { currentTableId, currentOrderSnapshot, userId, goToScreen } from "/app.js";
import { formatCurrency, calculateItemsValue, getNumericValueFromCurrency } from "/utils.js";
import { getTableDocRef, getCustomersCollectionRef, db, getTablesCollectionRef } from "/services/firebaseService.js";
import {
    updateDoc, arrayUnion, arrayRemove, writeBatch, getFirestore, getDoc, serverTimestamp,
    collection, query, where, getDocs, addDoc, setDoc, doc, increment
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { createWooCommerceOrder } from "/services/wooCommerceService.js";


// --- VARIÁVEIS DE ELEMENTOS ---
let paymentSplitsContainer, addSplitAccountBtn;
let reviewItemsList;
let orderSubtotalDisplay, orderServiceTaxDisplay, orderTotalDisplay, valuePerDinerDisplay, remainingBalanceDisplay;
let toggleServiceTaxBtn, dinersSplitInput;
let paymentSummaryList, chargeInputs, openCustomerRegBtn, customerSearchInput, paymentMethodButtonsContainer, paymentValueInput, openCalculatorBtn, addPaymentBtn;
let finalizeOrderBtn, openNfeModalBtn;
let calculatorModal, calcDisplay, calcButtonsContainer, closeCalcBtnX, confirmCalcBtn; 
let selectiveTransferModal, targetTableInput, checkTargetTableBtn, confirmTransferBtn, transferStatus, transferItemsList;
let tableTransferModal;
let customerRegModal, customerSearchCpfInput, searchCustomerByCpfBtn, customerSearchResultsDiv;
let customerNameInput, customerCpfInput, customerPhoneInput, customerEmailInput;
let closeCustomerRegModalBtn, saveCustomerBtn, linkCustomerToTableBtn;
let currentFoundCustomer = null;
let decreaseDinersBtn, increaseDinersBtn;
let printSummaryBtn;

// Estado local
let isMassSelectionActive = false;
let paymentInitialized = false;

// Constante de métodos de pagamento
const PAYMENT_METHODS = ['Dinheiro', 'Pix', 'Crédito', 'Débito', 'Ticket', 'Voucher'];


// --- FUNÇÕES DE CÁLCULO E UTILIDADE ---
const calculateTotal = (subtotal, applyServiceTax) => {
    const serviceTax = applyServiceTax ? subtotal * 0.10 : 0;
    return subtotal + serviceTax;
};
const updateText = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
};

// ==========================================================
// --- MOTOR DA CALCULADORA ---
// ==========================================================
let calculatorState = { 
    displayValue: '0', 
    firstOperand: null, 
    waitingForSecondOperand: false, 
    operator: null 
};

function updateDisplay() {
    if(calcDisplay) {
        const formatted = calculatorState.displayValue.replace('.', ',');
        calcDisplay.value = formatted;
    }
}

function inputDigit(digit) {
    const { displayValue, waitingForSecondOperand } = calculatorState;
    if (waitingForSecondOperand) {
        calculatorState.displayValue = digit;
        calculatorState.waitingForSecondOperand = false;
    } else {
        if (displayValue.includes('.')) {
            const parts = displayValue.split('.');
            if (parts[1].length >= 2) return;
        }
        calculatorState.displayValue = displayValue === '0' ? digit : displayValue + digit;
    }
}

function inputDecimal(dot) {
    if (calculatorState.waitingForSecondOperand) {
        calculatorState.displayValue = '0.';
        calculatorState.waitingForSecondOperand = false;
        return;
    }
    if (!calculatorState.displayValue.includes('.')) {
        calculatorState.displayValue += '.';
    }
}

function handleOperator(nextOperator) {
    const { firstOperand, displayValue, operator } = calculatorState;
    const inputValue = parseFloat(displayValue);

    if (operator && calculatorState.waitingForSecondOperand) {
        calculatorState.operator = nextOperator;
        return;
    }

    if (firstOperand == null && !isNaN(inputValue)) {
        calculatorState.firstOperand = inputValue;
    } else if (operator) {
        const result = performCalculation[operator](firstOperand, inputValue);
        calculatorState.displayValue = `${parseFloat(result.toFixed(7))}`; 
        calculatorState.firstOperand = result;
    }

    calculatorState.waitingForSecondOperand = true;
    calculatorState.operator = nextOperator;
}

const performCalculation = {
    '/': (first, second) => first / second,
    '*': (first, second) => first * second,
    '+': (first, second) => first + second,
    '-': (first, second) => first - second,
    '%': (first, second) => first * (second / 100), 
    '=': (first, second) => second,
};

function resetCalculator() {
    calculatorState = { 
        displayValue: '0', 
        firstOperand: null, 
        waitingForSecondOperand: false, 
        operator: null 
    };
}

function backspace() {
     let { displayValue } = calculatorState;
     calculatorState.displayValue = displayValue.length > 1 ? displayValue.slice(0, -1) : '0';
}


// --- FUNÇÕES DE AÇÃO (PAGAMENTO) ---
export const executeDeletePayment = async (timestamp) => {
    if (!currentTableId || !timestamp) return;
    const tableRef = getTableDocRef(currentTableId);
    const paymentToDelete = currentOrderSnapshot?.payments.find(p => p.timestamp == timestamp); 
    
    if (!paymentToDelete) {
        const paymentsArray = currentOrderSnapshot?.payments || [];
        const paymentIndex = paymentsArray.findIndex(p => p.timestamp == timestamp);
        if (paymentIndex === -1) {
            alert("Erro: Pagamento não encontrado para exclusão.");
            return;
        }
        const paymentToRemove = paymentsArray[paymentIndex];

        try {
            await updateDoc(tableRef, { payments: arrayRemove(paymentToRemove) });
            alert("Pagamento removido com sucesso (via arrayRemove).");
        } catch (e) {
             console.error("Erro ao remover pagamento:", e);
             alert("Falha ao remover pagamento. Tente recarregar a mesa.");
        }
        return;
    }
    
    try {
        await updateDoc(tableRef, { payments: arrayRemove(paymentToDelete) });
        alert("Pagamento removido com sucesso.");
    } catch (e) {
        console.error("Erro ao remover pagamento:", e);
        alert("Falha ao remover pagamento.");
    }
};

export const deletePayment = async (timestamp) => {
    window.openManagerAuthModal('deletePayment', timestamp); 
};
window.deletePayment = deletePayment;

const _validatePaymentInputs = () => {
    if (!addPaymentBtn) return;
    const selectedMethod = paymentMethodButtonsContainer?.querySelector('.active');
    const numericValue = getNumericValueFromCurrency(paymentValueInput?.value || '0'); 
    const isValid = selectedMethod && numericValue > 0;
    addPaymentBtn.disabled = !isValid;
    addPaymentBtn.classList.toggle('opacity-50', !isValid);
    addPaymentBtn.classList.toggle('cursor-not-allowed', !isValid); 
};

// --- FUNÇÕES DE RENDERIZAÇÃO (PAGAMENTO) ---
const renderRegisteredPayments = (payments) => {
    if (!paymentSummaryList) return;
    if (!payments || payments.length === 0) {
        paymentSummaryList.innerHTML = `<p class="text-sm text-dark-placeholder italic p-1">Nenhum pagamento registrado.</p>`;
        return;
    }
    paymentSummaryList.innerHTML = payments.map(p => {
        return `
        <div class="flex justify-between items-center py-2 border-b border-dark-border last:border-b-0">
            <div class="flex items-center space-x-2">
                <i class="fas ${p.method === 'Dinheiro' ? 'fa-money-bill-wave' : p.method === 'Pix' ? 'fa-qrcode' : p.method === 'Voucher' ? 'fa-ticket-alt' : 'fa-credit-card'} text-green-400"></i>
                <span class="font-semibold text-dark-text">${p.method}</span>
            </div>
            <div class="flex items-center space-x-3">
                <span class="font-bold text-lg text-dark-text">${p.value}</span>
                <button class="p-2 text-red-500 hover:text-red-400 transition print-hide" 
                        title="Excluir Pagamento"
                        onclick="window.deletePayment(${p.timestamp})">
                    <i class="fas fa-trash-alt"></i>
                </button>
            </div>
        </div>
        `;
    }).join('');
};

const renderPaymentMethodButtons = () => {
    if (!paymentMethodButtonsContainer) return;
    
    paymentMethodButtonsContainer.innerHTML = PAYMENT_METHODS.map(method => `
        <button class="payment-method-btn" data-method="${method}">
            ${method}
        </button>
    `).join('');
};

const renderPaymentSplits = (orderSnapshot) => { /* Função desativada */ };

export const renderPaymentSummary = (tableId, orderSnapshot) => {
    if (!paymentInitialized) return; 
    if (!orderSnapshot) return; 

    const payments = orderSnapshot.payments || [];
    const sentItems = orderSnapshot.sentItems || [];
    
    const subtotal = calculateItemsValue(sentItems);
    const applyServiceTax = orderSnapshot.serviceTaxApplied ?? true; 
    const serviceTax = applyServiceTax ? subtotal * 0.10 : 0;
    const totalPrincipalAccount = subtotal + serviceTax;
    const totalPaidPrincipal = payments.reduce((sum, p) => sum + getNumericValueFromCurrency(p.value), 0);
    const remainingBalancePrincipal = totalPrincipalAccount - totalPaidPrincipal;
    const diners = parseInt(orderSnapshot.diners) || 1; 
    const valuePerDiner = totalPrincipalAccount / diners;

    if(dinersSplitInput) dinersSplitInput.value = diners;
    orderSnapshot.total = totalPrincipalAccount; 

    updateText('orderSubtotalDisplayPayment', formatCurrency(subtotal));
    updateText('orderServiceTaxDisplayPayment', formatCurrency(serviceTax));
    updateText('orderTotalDisplayPayment', formatCurrency(totalPrincipalAccount));
    updateText('valuePerDinerDisplay', formatCurrency(valuePerDiner));
    updateText('remainingBalanceDisplay', formatCurrency(remainingBalancePrincipal > 0 ? remainingBalancePrincipal : 0));
    updateText('valuePerDinerDisplayPrint', formatCurrency(valuePerDiner));


    if (toggleServiceTaxBtn) {
        toggleServiceTaxBtn.textContent = applyServiceTax ? 'Remover' : 'Aplicar';
        toggleServiceTaxBtn.classList.toggle('bg-red-600', applyServiceTax);
        toggleServiceTaxBtn.classList.toggle('bg-green-600', !applyServiceTax);
        toggleServiceTaxBtn.disabled = false;
        toggleServiceTaxBtn.style.opacity = '1';
    }
    
    if (finalizeOrderBtn) {
        const canFinalize = remainingBalancePrincipal <= 0.01;
        
        if (!finalizeOrderBtn.innerHTML.includes('fa-spinner')) {
            finalizeOrderBtn.disabled = !canFinalize;
        }
        
        finalizeOrderBtn.classList.toggle('opacity-50', !canFinalize);
        finalizeOrderBtn.classList.toggle('cursor-not-allowed', !canFinalize);
    }
    
    renderReviewItemsList(orderSnapshot);
    renderRegisteredPayments(payments); 
    
    if (customerSearchInput && orderSnapshot?.clientName) {
        customerSearchInput.value = orderSnapshot.clientName;
        customerSearchInput.disabled = true;
    } else if (customerSearchInput) {
        customerSearchInput.value = '';
        customerSearchInput.disabled = false;
    }
};

const renderReviewItemsList = (orderSnapshot) => { 
    if (!reviewItemsList) return;
    const items = orderSnapshot?.sentItems || [];
    const oldActionBar = document.getElementById('reviewActionBar');
    if (oldActionBar) oldActionBar.remove();
    if (items.length === 0) {
        reviewItemsList.innerHTML = `<div class="text-sm text-dark-placeholder italic p-2">Nenhum item na conta principal para revisão.</div>`;
        return;
    }
    const groupedItems = items.reduce((acc, item) => { 
        const key = `${item.id}-${item.note || ''}`;
        if (!acc[key]) {
            acc[key] = { ...item, count: 0, originalItems: [] };
        }
        acc[key].count++;
        acc[key].originalItems.push(item);
        return acc;
     }, {});
    let itemsHtml = Object.values(groupedItems).map(group => { 
        const itemData = JSON.stringify(group.originalItems).replace(/'/g, '&#39;');
        return `
        <div class="flex justify-between items-center py-2 border-b border-dark-border hover:bg-dark-input p-2 rounded-lg">
            <div class="flex items-center flex-grow min-w-0 mr-2 print-hide"> 
                <input type="checkbox"
                       class="item-select-checkbox mr-3 h-5 w-5 bg-dark-input border-gray-600 rounded text-pumpkin focus:ring-pumpkin"
                       data-items='${itemData}'
                       onchange="window.activateItemSelection()">
                <div class="flex flex-col min-w-0">
                    <span class="font-semibold text-dark-text truncate">${group.name} (${group.count}x)</span>
                    <span class="text-xs text-dark-placeholder">${group.note || 'Sem observações'}</span>
                </div>
            </div>
             <div class="flex flex-col min-w-0 mr-2 hidden print:block">
                 <span class="font-semibold text-dark-text truncate">${group.name} (${group.count}x)</span>
                 <span class="text-xs text-dark-placeholder">${group.note || ''}</span>
             </div>
            <span class="font-bold text-pumpkin flex-shrink-0">${formatCurrency(group.price * group.count)}</span>
        </div>
        `;
     }).join('');
    const actionBarHtml = `
        <div id="reviewActionBar" class="flex justify-between items-center p-2 mt-4 bg-dark-input rounded-lg sticky bottom-0 print-hide">
            <div class="flex items-center">
                <input type="checkbox" id="selectAllItems" class="mr-2 h-4 w-4"
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
        </div>
    `;
    reviewItemsList.innerHTML = itemsHtml + actionBarHtml;
    attachReviewListListeners();
};


// --- LÓGICAS DE AÇÃO EM MASSA E TRANSFERÊNCIA ---
window.activateItemSelection = (mode = null) => { 
    const allCheckboxes = document.querySelectorAll('#reviewItemsList input[type="checkbox"].item-select-checkbox');
    const selectAllBox = document.getElementById('selectAllItems');
    const deleteBtn = document.getElementById('massDeleteBtn');
    const transferBtn = document.getElementById('massTransferBtn');

    if (!deleteBtn || !transferBtn || !selectAllBox) {
        return;
    }

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
        btn.disabled = !isMassSelectionActive;
        btn.classList.toggle('opacity-50', !isMassSelectionActive);
        btn.classList.toggle('cursor-not-allowed', !isMassSelectionActive);
    });

    if (count === allCheckboxes.length && allCheckboxes.length > 0) {
        selectAllBox.checked = true;
    } else {
        selectAllBox.checked = false;
    }

    window.itemsToTransfer = []; 
    selectedCheckboxes.forEach(box => {
        try {
            const items = JSON.parse(box.dataset.items.replace(/&#39;/g, "'"));
            window.itemsToTransfer.push(...items); 
        } catch(e) { console.error("Erro ao ler dados de item para seleção:", e); }
    });
};

export const handleMassActionRequest = (action) => {
    if (!window.itemsToTransfer || window.itemsToTransfer.length === 0) { 
        alert("Nenhum item selecionado.");
        return;
    }
    if (action === 'delete') {
        window.openManagerAuthModal('executeMassDelete', null);
    } else if (action === 'transfer') {
        window.openManagerAuthModal('executeMassTransfer', null);
    }
};

// ===== FUNÇÃO PROTEGIDA CONTRA ERRO DE DOCUMENTO INEXISTENTE =====
export const handleMassDeleteConfirmed = async () => {
    if (!currentTableId) return; 

    if (!window.itemsToTransfer || window.itemsToTransfer.length === 0) {
        alert("Nenhum item selecionado para exclusão.");
        return;
    }

    // 1. BLOQUEIO DE UI (Previne clique duplo)
    const deleteBtn = document.getElementById('massDeleteBtn');
    if (deleteBtn) deleteBtn.disabled = true;

    const batch = writeBatch(db);
    const tableRef = getTableDocRef(currentTableId);

    // 2. VERIFICAÇÃO DE EXISTÊNCIA
    try {
        const docSnap = await getDoc(tableRef);
        if (!docSnap.exists()) {
            console.warn(`[MassDelete] Mesa ${currentTableId} não encontrada (já removida).`);
            if (window.goToScreen) window.goToScreen('panelScreen');
            return;
        }
    } catch (e) {
        console.error("Erro ao verificar mesa:", e);
        if (deleteBtn) deleteBtn.disabled = false; 
        return;
    }

    const itemsToDelete = window.itemsToTransfer;
    const currentSentItems = currentOrderSnapshot?.sentItems || [];

    const allItemsWillBeDeleted = currentSentItems.length === itemsToDelete.length && 
        currentSentItems.every(sentItem => itemsToDelete.some(deleteItem => JSON.stringify(sentItem) === JSON.stringify(deleteItem)));

    let closeTableConfirmed = false;
    if (allItemsWillBeDeleted) {
        closeTableConfirmed = confirm("Todos os itens serão removidos. Deseja FECHAR a mesa?");
        if (!closeTableConfirmed) {
             if (deleteBtn) deleteBtn.disabled = false; 
             return; 
        }
    }

    const valueToDecrease = itemsToDelete.reduce((sum, item) => sum + (item.price || 0), 0);
    const currentTotal = currentOrderSnapshot?.total || 0;
    const newTotal = Math.max(0, currentTotal - valueToDecrease); 

    try {
        itemsToDelete.forEach(item => {
            batch.update(tableRef, { sentItems: arrayRemove(item) });
        });

        batch.update(tableRef, { total: newTotal });

        if (closeTableConfirmed) {
            batch.delete(tableRef); 
        }

        await batch.commit();

        alert(`${itemsToDelete.length} item(ns) removidos.`);
        
        window.itemsToTransfer = []; 
        window.activateItemSelection(); 

        if (closeTableConfirmed && window.goToScreen) {
            window.goToScreen('panelScreen');
        } else {
            if (deleteBtn) deleteBtn.disabled = false;
        }

    } catch (e) {
        if (e.code === 'not-found' || e.message.includes("No document to update")) {
             console.warn("Conflito resolvido: Mesa já estava fechada.");
             if (window.goToScreen) window.goToScreen('panelScreen');
        } else {
             console.error("Erro real ao excluir:", e);
             alert("Erro: " + e.message);
             if (deleteBtn) deleteBtn.disabled = false;
        }
    }
};

export function openTableTransferModal() {
    if (!tableTransferModal) {
        alert("Erro: Modal de transferência não inicializado.");
        return;
    }

    const targetInput = document.getElementById('targetTableInput');
    const newTableDinersDiv = document.getElementById('newTableDinersInput');
    const newTableDinersInput = document.getElementById('newTableDiners');
    const newTableSectorInput = document.getElementById('newTableSector');
    const statusDiv = document.getElementById('transferStatus');
    const confirmBtn = document.getElementById('confirmTableTransferBtn');

    if (targetInput) targetInput.value = '';
    if (newTableDinersDiv) newTableDinersDiv.style.display = 'none'; 
    if (newTableDinersInput) newTableDinersInput.value = '1';
    if (newTableSectorInput) newTableSectorInput.value = '';
    if (statusDiv) {
        statusDiv.style.display = 'none';
        statusDiv.textContent = '';
    }
    if (confirmBtn) confirmBtn.disabled = true; 

    tableTransferModal.style.display = 'flex';
    if (targetInput) targetInput.focus(); 
};

export function handleConfirmTableTransfer() {
    const targetTableId = document.getElementById('targetTableInput')?.value;
    const newDinersInput = document.getElementById('newTableDiners');
    const newSectorInput = document.getElementById('newTableSector');
    const newTableDinersDiv = document.getElementById('newTableDinersInput');

    if (!targetTableId || !window.itemsToTransfer || window.itemsToTransfer.length === 0) {
        alert("Mesa de destino ou itens a transferir estão faltando.");
        return;
    }

    let newDiners = 0;
    let newSector = '';

    if (newTableDinersDiv && newTableDinersDiv.style.display !== 'none') {
        newDiners = parseInt(newDinersInput?.value) || 0;
        newSector = newSectorInput?.value || '';
        if (newDiners <= 0 || !newSector) {
            alert("Para abrir uma nova mesa, 'Pessoas' e 'Setor' são obrigatórios.");
            return;
        }
    }

    window.handleTableTransferConfirmed(currentTableId, targetTableId, window.itemsToTransfer, newDiners, newSector);

    if (tableTransferModal) tableTransferModal.style.display = 'none';
};

// Placeholders
const handleAddSplitAccount = () => { alert("Funcionalidade de divisão desativada.")};
window.removeSplitAccount = (splitId) => { alert("Funcionalidade de divisão desativada.")};
window.openPaymentModalForSplit = (splitId) => { alert("Funcionalidade de divisão desativada.")};
window.openSplitTransferModal = (splitId, mode) => { alert("Funcionalidade de divisão desativada.")};

// ==================================================================
//           FUNÇÃO DE FECHAMENTO COM ARQUIVAMENTO NO HISTÓRICO
// ==================================================================
export const handleFinalizeOrder = async () => {
    if (!currentTableId || !currentOrderSnapshot) { alert("Erro: Nenhuma mesa carregada."); return; }
    
    const totalDaConta = currentOrderSnapshot.total || 0; 
    const payments = currentOrderSnapshot.payments || [];
    const totalPago = payments.reduce((sum, p) => sum + getNumericValueFromCurrency(p.value), 0);
    const remainingBalance = totalDaConta - totalPago;

    if (remainingBalance > 0.01) {
         alert(`Ainda resta ${formatCurrency(remainingBalance)} a pagar.`);
         return;
    }

    if (!confirm(`Tem certeza que deseja fechar a Mesa ${currentTableId}? Esta ação enviará o pedido ao WooCommerce e ARQUIVARÁ a mesa.`)) { return; }

    if(finalizeOrderBtn) finalizeOrderBtn.disabled = true;
    const originalBtnText = finalizeOrderBtn.innerHTML;
    finalizeOrderBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processando...';

    try {
        const wooOrder = await createWooCommerceOrder(currentOrderSnapshot);
        
        const tableRef = getTableDocRef(currentTableId);
        const clientId = currentOrderSnapshot.clientId; 
        const pointsEarned = Math.floor(totalDaConta); 
        
        const batch = writeBatch(db);

        // 1. CRIA BACKUP (Histórico) - Essencial para Relatórios e Caixa
        const historyId = `${currentTableId}_closed_${Date.now()}`;
        // IMPORTANTE: Usa a referência da coleção TABLES para criar o histórico
        const historyRef = doc(getTablesCollectionRef(), historyId);

        const closingData = {
            ...currentOrderSnapshot,
            status: 'closed',          
            closedAt: serverTimestamp(), 
            finalTotal: totalDaConta,
            wooOrderId: wooOrder.id,
            closedBy: userId || 'Staff'
        };

        batch.set(historyRef, closingData);

        // 2. DELETA A MESA ORIGINAL (Libera para novo cliente)
        batch.delete(tableRef); 
        
        // 3. ATUALIZA CRM
        if (clientId) {
            const customerRef = doc(getCustomersCollectionRef(), clientId);
            batch.update(customerRef, {
                points: increment(pointsEarned), 
                lastVisit: serverTimestamp(),
                orderHistory: arrayUnion({ 
                    orderId: wooOrder.id,
                    total: totalDaConta,
                    points: pointsEarned,
                    date: Date.now()
                })
            });
        }
        
        await batch.commit();

        const successMessage = clientId 
            ? `Sucesso! Pedido Woo: #${wooOrder.id}. +${pointsEarned} pontos para o cliente.`
            : `Sucesso! Pedido Woo: #${wooOrder.id}. Mesa fechada e arquivada.`;
            
        alert(successMessage);
        window.goToScreen('panelScreen'); 
    
    } catch (e) {
        console.error("Erro ao finalizar:", e);
        alert(`FALHA: ${e.message}. A mesa NÃO foi fechada.`);
        
        if(finalizeOrderBtn) {
            finalizeOrderBtn.disabled = false; 
            finalizeOrderBtn.innerHTML = originalBtnText;
            finalizeOrderBtn.classList.remove('opacity-50', 'cursor-not-allowed');
        }
    }
};


// --- GESTÃO DE CLIENTES ---
const openCustomerRegModal = () => {
    if (!customerRegModal) return;
    customerNameInput.value = '';
    customerCpfInput.value = '';
    customerPhoneInput.value = '';
    customerEmailInput.value = '';
    customerSearchCpfInput.value = '';
    customerSearchResultsDiv.innerHTML = '<p class="text-sm text-dark-placeholder italic">Busque por CPF/CNPJ.</p>';
    currentFoundCustomer = null;
    saveCustomerBtn.disabled = true;
    linkCustomerToTableBtn.disabled = true;
    customerRegModal.style.display = 'flex';
    customerSearchCpfInput.focus();
};

const searchCustomer = async () => {
    if (!customerSearchCpfInput) return;
    const docNumber = customerSearchCpfInput.value.replace(/\D/g, ''); 
    if (docNumber.length !== 11 && docNumber.length !== 14) {
        customerSearchResultsDiv.innerHTML = `<p class="text-sm text-red-400">Documento inválido.</p>`;
        return;
    }
    customerSearchResultsDiv.innerHTML = `<p class="text-sm text-yellow-400">Buscando...</p>`;

    try {
        const customerDocRef = doc(getCustomersCollectionRef(), docNumber); 
        const docSnap = await getDoc(customerDocRef);

        if (docSnap.exists()) {
            currentFoundCustomer = docSnap.data();
            if (customerNameInput) customerNameInput.value = currentFoundCustomer.name || '';
            if (customerCpfInput) customerCpfInput.value = currentFoundCustomer.cpf || docNumber; 
            if (customerPhoneInput) customerPhoneInput.value = currentFoundCustomer.phone || '';
            if (customerEmailInput) customerEmailInput.value = currentFoundCustomer.email || '';

            customerSearchResultsDiv.innerHTML = `<p class="text-sm text-green-400">Encontrado: <strong>${currentFoundCustomer.name}</strong></p>`;
            if (saveCustomerBtn) saveCustomerBtn.disabled = true; 
            if (linkCustomerToTableBtn) linkCustomerToTableBtn.disabled = false;
        } else {
            currentFoundCustomer = null;
            if (customerNameInput) customerNameInput.value = '';
            if (customerCpfInput) customerCpfInput.value = docNumber; 
            customerSearchResultsDiv.innerHTML = `<p class="text-sm text-yellow-400">Não encontrado. Cadastre abaixo.</p>`;
            if (saveCustomerBtn) saveCustomerBtn.disabled = false;
            if (linkCustomerToTableBtn) linkCustomerToTableBtn.disabled = true;
            if (customerNameInput) customerNameInput.focus();
        }
    } catch (e) {
        console.error("Erro ao buscar cliente:", e);
        customerSearchResultsDiv.innerHTML = `<p class="text-sm text-red-400">Erro no banco.</p>`;
    }
};

const saveCustomer = async () => {
    if (!customerNameInput || !customerCpfInput) return;
    const name = customerNameInput.value.trim();
    const documentNumber = customerCpfInput.value.replace(/\D/g, ''); 
    const phone = customerPhoneInput.value.trim();
    const email = customerEmailInput.value.trim().toLowerCase();

    if (!name || (documentNumber.length !== 11 && documentNumber.length !== 14)) {
        alert("Nome e Documento obrigatórios.");
        return;
    }

    const customerData = { 
        name, 
        cpf: documentNumber, 
        documentType: documentNumber.length === 11 ? 'cpf' : 'cnpj',
        phone, 
        email, 
        createdAt: serverTimestamp(),
        lastVisit: serverTimestamp()
    };
    
    try {
        const customerDocRef = doc(getCustomersCollectionRef(), documentNumber); 
        await setDoc(customerDocRef, customerData, { merge: true });
        currentFoundCustomer = customerData;
        if (customerSearchResultsDiv) customerSearchResultsDiv.innerHTML = `<p class="text-sm text-green-400">Salvo: <strong>${name}</strong></p>`;
        if (saveCustomerBtn) saveCustomerBtn.disabled = true;
        if (linkCustomerToTableBtn) linkCustomerToTableBtn.disabled = false;
    } catch (e) {
        console.error("Erro ao salvar:", e);
        alert("Falha ao salvar cliente.");
    }
};

const linkCustomerToTable = async () => {
    if (!currentFoundCustomer || !currentTableId) {
        alert("Selecione cliente e mesa.");
        return;
    }
    const tableRef = getTableDocRef(currentTableId);
    try {
        await updateDoc(tableRef, {
            clientId: currentFoundCustomer.cpf, 
            clientName: currentFoundCustomer.name,
            clientDocType: currentFoundCustomer.documentType 
        });
        if (customerSearchInput) {
            customerSearchInput.value = currentFoundCustomer.name;
            customerSearchInput.disabled = true;
        }
        if (customerRegModal) customerRegModal.style.display = 'none';
        currentFoundCustomer = null; 
    } catch (e) {
        console.error("Erro ao associar:", e);
        alert("Falha ao associar cliente.");
    }
};

const handlePrintSummary = () => {
    const valuePerDinerText = valuePerDinerDisplay ? valuePerDinerDisplay.textContent : 'R$ 0,00';
    updateText('valuePerDinerDisplayPrint', valuePerDinerText);
    window.print();
};

// --- INICIALIZAÇÃO DO CONTROLLER ---
const attachReviewListListeners = () => {
    const massDeleteBtn = document.getElementById('massDeleteBtn');
    const massTransferBtn = document.getElementById('massTransferBtn');

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
    document.querySelectorAll('#reviewItemsList input[type="checkbox"].item-select-checkbox').forEach(box => {
         box.removeEventListener('change', window.activateItemSelection);
         box.addEventListener('change', window.activateItemSelection);
    });
};

export const initPaymentController = () => {
    if(paymentInitialized) return;
    console.log("[PaymentController] Inicializando...");

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
    calcButtonsContainer = calculatorModal?.querySelector('.calculator-buttons'); 
    closeCalcBtnX = document.getElementById('closeCalcBtnX');
    confirmCalcBtn = document.getElementById('confirmCalcBtn');

    tableTransferModal = document.getElementById('tableTransferModal');
    targetTableInput = document.getElementById('targetTableInput');
    confirmTransferBtn = document.getElementById('confirmTableTransferBtn');
    
    printSummaryBtn = document.getElementById('printSummaryBtn'); 
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

    if (!reviewItemsList || !calculatorModal) { console.error("[PaymentController] Erro Fatal: Elementos não encontrados."); return; }

    renderPaymentMethodButtons();

    if(toggleServiceTaxBtn) toggleServiceTaxBtn.addEventListener('click', async () => { 
        if (!currentTableId) return;
        const tableRef = getTableDocRef(currentTableId);
        const newState = !(currentOrderSnapshot?.serviceTaxApplied ?? true); 
        try {
            await updateDoc(tableRef, { serviceTaxApplied: newState });
        } catch (e) {
            console.error("Erro taxa serviço:", e);
        }
    });
    
    const updateDiners = async (delta) => {
        if (!currentTableId || !dinersSplitInput) return;
        const currentDiners = currentOrderSnapshot?.diners ? parseInt(currentOrderSnapshot.diners) : (parseInt(dinersSplitInput.value) || 1);
        const newDiners = Math.max(1, currentDiners + delta);
        if(newDiners !== currentDiners) {
            const tableRef = getTableDocRef(currentTableId);
             try { await updateDoc(tableRef, { diners: newDiners }); } catch (e) { console.error("Erro diners:", e); }
        }
    };
    if(decreaseDinersBtn) decreaseDinersBtn.addEventListener('click', () => updateDiners(-1));
    if(increaseDinersBtn) increaseDinersBtn.addEventListener('click', () => updateDiners(1));

    if(paymentMethodButtonsContainer) paymentMethodButtonsContainer.addEventListener('click', (e) => { 
        const btn = e.target.closest('.payment-method-btn');
        if (btn) {
            paymentMethodButtonsContainer.querySelectorAll('.payment-method-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            _validatePaymentInputs();
        }
    });

    if(paymentValueInput) paymentValueInput.addEventListener('input', (e) => { 
        e.target.value = e.target.value.replace(/[^0-9,\.]/g, ''); 
        _validatePaymentInputs();
    });

    if(addPaymentBtn) addPaymentBtn.addEventListener('click', async () => { 
        const selectedMethod = paymentMethodButtonsContainer?.querySelector('.active')?.dataset.method;
        const rawValue = paymentValueInput?.value || '0';
        const numericValue = getNumericValueFromCurrency(rawValue);

        if (!selectedMethod || numericValue <= 0 || !currentTableId) {
            alert("Selecione método e valor.");
            return;
        }

        const tableRef = getTableDocRef(currentTableId);
        const paymentData = {
            method: selectedMethod,
            value: formatCurrency(numericValue), 
            timestamp: Date.now(),
            byUser: userId || 'PDV Staff' 
        };

        try {
            await updateDoc(tableRef, { payments: arrayUnion(paymentData) });
            paymentValueInput.value = ''; 
            paymentMethodButtonsContainer.querySelectorAll('.payment-method-btn').forEach(b => b.classList.remove('active'));
            _validatePaymentInputs();
        } catch (e) {
            console.error("Erro pagamento:", e);
            alert("Falha ao registrar pagamento.");
        }
    });

    if(finalizeOrderBtn) finalizeOrderBtn.addEventListener('click', handleFinalizeOrder);

    if (calcButtonsContainer) {
        calcButtonsContainer.addEventListener('click', (event) => {
            const { target } = event;
            if (!target.matches('.calc-btn[data-action]')) return;
            const action = target.dataset.action;
            const value = target.dataset.value;
            const isOperator = action === 'operator' || action === 'calculate';
            if (isOperator) {
                calculatorState.displayValue = calculatorState.displayValue.replace(',', '.');
            }
            switch (action) {
                case 'number': inputDigit(value); break;
                case 'operator': handleOperator(value); break;
                case 'decimal': inputDecimal('.'); break; 
                case 'clear': resetCalculator(); break;
                case 'backspace': backspace(); break;
                case 'calculate': handleOperator('='); calculatorState.waitingForSecondOperand = false; calculatorState.operator = null; break;
            }
             if (!isOperator) {
                 calculatorState.displayValue = calculatorState.displayValue.replace('.', ',');
             }
            updateDisplay();
        });
    }

    if (confirmCalcBtn) {
        confirmCalcBtn.addEventListener('click', () => {
            if (paymentValueInput && calcDisplay) {
                const calcValueFormatted = calcDisplay.value; 
                paymentValueInput.value = calcValueFormatted; 
                paymentValueInput.dispatchEvent(new Event('input'));
            }
            if (calculatorModal) calculatorModal.style.display = 'none';
            resetCalculator();
            updateDisplay(); 
        });
    }

    if (openCalculatorBtn) {
        openCalculatorBtn.addEventListener('click', () => { 
             if (calculatorModal && calcDisplay && paymentValueInput) {
                 const currentPaymentValue = paymentValueInput.value.replace(',', '.');
                 calculatorState.displayValue = parseFloat(currentPaymentValue) > 0 ? currentPaymentValue : '0';
                 calculatorState.firstOperand = null;
                 calculatorState.waitingForSecondOperand = false;
                 calculatorState.operator = null;
                 calculatorState.displayValue = calculatorState.displayValue.replace('.', ',');
                 updateDisplay();
                 calculatorModal.style.display = 'flex';
             }
        });
    } 

    if (closeCalcBtnX) {
        closeCalcBtnX.addEventListener('click', () => { 
            if (calculatorModal) calculatorModal.style.display = 'none';
            resetCalculator();
            updateDisplay();
        });
    } 

    if(confirmTransferBtn) confirmTransferBtn.addEventListener('click', handleConfirmTableTransfer);
    if (targetTableInput) targetTableInput.addEventListener('input', async () => { });

    if(printSummaryBtn) printSummaryBtn.addEventListener('click', handlePrintSummary);
    
    if (openCustomerRegBtn) openCustomerRegBtn.addEventListener('click', openCustomerRegModal);
    if (closeCustomerRegModalBtn) closeCustomerRegModalBtn.addEventListener('click', () => { if(customerRegModal) customerRegModal.style.display = 'none'; currentFoundCustomer = null; }); 
    if (searchCustomerByCpfBtn) searchCustomerByCpfBtn.addEventListener('click', searchCustomer); 
    if (saveCustomerBtn) saveCustomerBtn.addEventListener('click', saveCustomer); 
    if (linkCustomerToTableBtn) linkCustomerToTableBtn.addEventListener('click', linkCustomerToTable); 
    
    const enableSaveButtonCheck = () => {
        if (!saveCustomerBtn || !customerNameInput || !customerCpfInput) return;
        const name = customerNameInput.value.trim();
        const doc = customerCpfInput.value.replace(/\D/g, '');
        const shouldEnable = !currentFoundCustomer && name && (doc.length === 11 || doc.length === 14);
        saveCustomerBtn.disabled = !shouldEnable;
    };
    [customerNameInput, customerCpfInput].forEach(input => {
        input?.addEventListener('input', enableSaveButtonCheck);
    });

    paymentInitialized = true;
    console.log("[PaymentController] Inicializado.");
};