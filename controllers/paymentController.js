// --- CONTROLLERS/PAYMENTCONTROLLER.JS (VERSÃO OTIMIZADA & CENTRALIZADA) ---
import { currentTableId, currentOrderSnapshot, userId, goToScreen, showToast } from "/app.js"; 
// AQUI: Importamos toggleLoading do utils.js
import { formatCurrency, calculateItemsValue, getNumericValueFromCurrency, toggleLoading } from "/utils.js"; 
import { getTableDocRef, getCustomersCollectionRef, db, getTablesCollectionRef } from "/services/firebaseService.js"; 
import {
    updateDoc, arrayUnion, arrayRemove, writeBatch, getDoc, serverTimestamp,
    setDoc, doc, increment, query, where, getDocs
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { createWooCommerceOrder } from "/services/wooCommerceService.js"; 

// --- VARIÁVEIS DE ELEMENTOS ---
let reviewItemsList;
let orderSubtotalDisplay, orderServiceTaxDisplay, orderTotalDisplay, valuePerDinerDisplay, remainingBalanceDisplay;
let toggleServiceTaxBtn, dinersSplitInput;
let paymentSummaryList, chargeInputs, openCustomerRegBtn, customerSearchInput, paymentMethodButtonsContainer, paymentValueInput, openCalculatorBtn, addPaymentBtn;
let finalizeOrderBtn, openNfeModalBtn;
let calculatorModal, calcDisplay, calcButtonsContainer, closeCalcBtnX, confirmCalcBtn; 
let tableTransferModal, targetTableInput, confirmTransferBtn;
let printSummaryBtn;
let customerRegModal, customerSearchCpfInput, searchCustomerByCpfBtn, customerSearchResultsDiv;
let customerNameInput, customerCpfInput, customerPhoneInput, customerEmailInput;
let closeCustomerRegModalBtn, saveCustomerBtn, linkCustomerToTableBtn, callMotoboyBtn;
let currentFoundCustomer = null;
let decreaseDinersBtn, increaseDinersBtn;

// Estado local
let isMassSelectionActive = false;
let paymentInitialized = false;
let itemsToTransfer = []; 

const PAYMENT_METHODS = ['Dinheiro', 'Pix', 'Crédito', 'Débito', 'Ticket', 'Voucher'];

// --- HELPERS (Calculadora e Updates Simples) ---
const updateText = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
};

// ==========================================================
// --- MOTOR DA CALCULADORA ---
// ==========================================================
let calculatorState = { displayValue: '0', firstOperand: null, waitingForSecondOperand: false, operator: null };

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
    calculatorState = { displayValue: '0', firstOperand: null, waitingForSecondOperand: false, operator: null };
}

function backspace() {
     let { displayValue } = calculatorState;
     calculatorState.displayValue = displayValue.length > 1 ? displayValue.slice(0, -1) : '0';
}

// --- FUNÇÕES DE AÇÃO ---

const executeDeletePayment = async (timestamp, btnElement) => {
    if (!currentTableId || !timestamp) return;
    
    if (!(await window.showConfirm("Tem certeza que deseja excluir este pagamento?", "Confirmar Exclusão"))) return;

    // Proteção Visual no Botão de Lixeira
    if (btnElement) {
        btnElement.classList.add('text-gray-500', 'cursor-not-allowed');
        btnElement.disabled = true;
    }

    const tableRef = getTableDocRef(currentTableId);
    const paymentToDelete = currentOrderSnapshot?.payments.find(p => p.timestamp == timestamp); 
    
    try {
        if (paymentToDelete) {
            await updateDoc(tableRef, { payments: arrayRemove(paymentToDelete) });
        } else {
            const freshSnap = await getDoc(tableRef);
            const freshPayments = freshSnap.data()?.payments || [];
            const freshPaymentToDelete = freshPayments.find(p => p.timestamp == timestamp);
            if (freshPaymentToDelete) {
                await updateDoc(tableRef, { payments: arrayRemove(freshPaymentToDelete) });
            }
        }
        showToast("Pagamento removido com sucesso.", false);
    } catch (e) {
        console.error("Erro ao remover pagamento:", e);
        showToast("Falha ao remover pagamento.", true);
        // Restaura botão em caso de erro
        if (btnElement) {
            btnElement.classList.remove('text-gray-500', 'cursor-not-allowed');
            btnElement.disabled = false;
        }
    }
};

const _validatePaymentInputs = () => {
    if (!addPaymentBtn) return;
    const selectedMethod = paymentMethodButtonsContainer?.querySelector('.active');
    const numericValue = getNumericValueFromCurrency(paymentValueInput?.value || '0'); 
    const isValid = selectedMethod && numericValue > 0;
    addPaymentBtn.disabled = !isValid;
    addPaymentBtn.classList.toggle('opacity-50', !isValid);
    addPaymentBtn.classList.toggle('cursor-not-allowed', !isValid); 
};

// --- RENDERIZAÇÃO ---

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
                <button class="p-2 text-red-500 hover:text-red-400 transition print-hide btn-delete-payment" 
                        title="Excluir Pagamento"
                        data-timestamp="${p.timestamp}">
                    <i class="fas fa-trash-alt pointer-events-none"></i>
                </button>
            </div>
        </div>
        `;
    }).join('');
};

const renderPaymentMethodButtons = () => {
    if (!paymentMethodButtonsContainer) return;
    paymentMethodButtonsContainer.innerHTML = PAYMENT_METHODS.map(method => `
        <button class="payment-method-btn" data-method="${method}">${method}</button>
    `).join('');
};

export const renderPaymentSummary = (tableId, orderSnapshot) => {
    if (!paymentInitialized || !orderSnapshot) return; 

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
    updateText('remainingBalanceDisplay', formatCurrency(Math.max(0, remainingBalancePrincipal)));
    updateText('valuePerDinerDisplayPrint', formatCurrency(valuePerDiner));

    if (toggleServiceTaxBtn) {
        toggleServiceTaxBtn.textContent = applyServiceTax ? 'Remover' : 'Aplicar';
        toggleServiceTaxBtn.classList.toggle('bg-red-600', applyServiceTax);
        toggleServiceTaxBtn.classList.toggle('bg-green-600', !applyServiceTax);
        toggleServiceTaxBtn.disabled = false;
    }
    
    if (finalizeOrderBtn) {
        const canFinalize = remainingBalancePrincipal <= 0.01;
        if (!finalizeOrderBtn.innerHTML.includes('fa-spinner')) {
            finalizeOrderBtn.disabled = !canFinalize;
            finalizeOrderBtn.classList.toggle('opacity-50', !canFinalize);
            finalizeOrderBtn.classList.toggle('cursor-not-allowed', !canFinalize);
        }
    }
    
    renderReviewItemsList(orderSnapshot);
    renderRegisteredPayments(payments); 
    
    if (customerSearchInput) {
        if (orderSnapshot?.clientName) {
            customerSearchInput.value = orderSnapshot.clientName;
            customerSearchInput.disabled = true;
        } else {
            customerSearchInput.value = '';
            customerSearchInput.disabled = false;
        }
    }
};

const renderReviewItemsList = (orderSnapshot) => { 
    if (!reviewItemsList) return;
    const items = orderSnapshot?.sentItems || [];
    
    if (items.length === 0) {
        reviewItemsList.innerHTML = `<div class="text-sm text-dark-placeholder italic p-2">Nenhum item na conta principal.</div>`;
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
                       data-action="toggle-select"
                       data-items='${itemData}'>
                <div class="flex flex-col min-w-0">
                    <span class="font-semibold text-dark-text truncate">${group.name} (${group.count}x)</span>
                    <span class="text-xs text-dark-placeholder">${group.note || 'Sem observações'}</span>
                </div>
            </div>
             <div class="flex flex-col min-w-0 mr-2 hidden print:block">
                 <span class="font-semibold text-dark-text truncate">${group.name} (${group.count}x)</span>
             </div>
            <span class="font-bold text-pumpkin flex-shrink-0">${formatCurrency(group.price * group.count)}</span>
        </div>`;
     }).join('');

    const actionBarHtml = `
        <div id="reviewActionBar" class="flex justify-between items-center p-2 mt-4 bg-dark-input rounded-lg sticky bottom-0 print-hide">
            <div class="flex items-center">
                <input type="checkbox" id="selectAllItems" class="mr-2 h-4 w-4" data-action="toggle-all">
                <label for="selectAllItems" class="text-sm font-semibold cursor-pointer">Todos</label>
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
};

// --- AÇÕES EM MASSA ---
const activateItemSelection = (mode = null) => { 
    const allCheckboxes = document.querySelectorAll('#reviewItemsList input[type="checkbox"].item-select-checkbox');
    const selectAllBox = document.getElementById('selectAllItems');
    const deleteBtn = document.getElementById('massDeleteBtn');
    const transferBtn = document.getElementById('massTransferBtn');

    if (!deleteBtn || !transferBtn || !selectAllBox) return;

    if (mode === 'toggleAll') {
        allCheckboxes.forEach(box => box.checked = selectAllBox.checked);
    }

    const selectedCheckboxes = document.querySelectorAll('#reviewItemsList input[type="checkbox"].item-select-checkbox:checked');
    const count = selectedCheckboxes.length;
    isMassSelectionActive = count > 0;

    updateText('deleteCount', count);
    updateText('transferCount', count);

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

    itemsToTransfer = []; 
    selectedCheckboxes.forEach(box => {
        try {
            itemsToTransfer.push(...JSON.parse(box.dataset.items.replace(/&#39;/g, "'")));
        } catch(e) { console.error("Erro ao ler dados de item para seleção:", e); }
    });
    
    window.itemsToTransfer = itemsToTransfer; 
};

// Listener global de ações em massa para Managers
window.executeMassDelete = handleMassDeleteConfirmed; 
window.executeMassTransfer = openTableTransferModal;

export const handleMassActionRequest = (action) => {
    if (!itemsToTransfer || itemsToTransfer.length === 0) { 
        showToast("Nenhum item selecionado.", true);
        return;
    }
    if (action === 'delete') {
        window.openManagerAuthModal('executeMassDelete', null);
    } else if (action === 'transfer') {
        window.openManagerAuthModal('executeMassTransfer', null);
    }
};

async function handleMassDeleteConfirmed() {
    if (!currentTableId || !itemsToTransfer || itemsToTransfer.length === 0) {
        showToast("Nenhum item selecionado para exclusão.", true);
        return;
    }

    const deleteBtn = document.getElementById('massDeleteBtn');
    toggleLoading(deleteBtn, true, '');

    const batch = writeBatch(db);
    const tableRef = getTableDocRef(currentTableId);

    try {
        const docSnap = await getDoc(tableRef);
        if (!docSnap.exists()) {
            console.warn(`Mesa ${currentTableId} não encontrada.`);
            if (window.goToScreen) window.goToScreen('panelScreen');
            return;
        }

        const valueToDecrease = itemsToTransfer.reduce((sum, item) => sum + (item.price || 0), 0);
        const currentTotal = currentOrderSnapshot?.total || 0;
        const newTotal = Math.max(0, currentTotal - valueToDecrease); 

        itemsToTransfer.forEach(item => {
            batch.update(tableRef, { sentItems: arrayRemove(item) });
        });

        batch.update(tableRef, { total: newTotal });

        await batch.commit();
        showToast(`${itemsToTransfer.length} item(ns) removidos.`, false);
        itemsToTransfer = []; 
        window.itemsToTransfer = [];

    } catch (e) {
        console.error("Erro mass delete:", e);
        showToast("Erro ao excluir itens: " + e.message, true);
    } finally {
        toggleLoading(deleteBtn, false);
    }
}

function openTableTransferModal() {
    if (!tableTransferModal) {
        showToast("Erro: Modal de transferência não inicializado.", true);
        return;
    }

    if (targetTableInput) targetTableInput.value = '';
    
    const newTableDinersDiv = document.getElementById('newTableDinersInput');
    const newTableDinersInput = document.getElementById('newTableDiners');
    const newTableSectorInput = document.getElementById('newTableSector');
    
    if (newTableDinersDiv) newTableDinersDiv.style.display = 'none'; 
    if (newTableDinersInput) newTableDinersInput.value = '1';
    if (newTableSectorInput) newTableSectorInput.value = '';
    
    if (confirmTransferBtn) confirmTransferBtn.disabled = true; 

    tableTransferModal.style.display = 'flex';
    if (targetTableInput) targetTableInput.focus(); 
}

function handleConfirmTableTransfer() {
    const targetTableId = targetTableInput?.value;
    const newDinersInput = document.getElementById('newTableDiners');
    const newSectorInput = document.getElementById('newTableSector');
    const newTableDinersDiv = document.getElementById('newTableDinersInput');

    if (!targetTableId || !itemsToTransfer || itemsToTransfer.length === 0) {
        showToast("Destino ou itens inválidos.", true);
        return;
    }

    let newDiners = 0;
    let newSector = '';

    if (newTableDinersDiv && newTableDinersDiv.style.display !== 'none') {
        newDiners = parseInt(newDinersInput?.value) || 0;
        newSector = newSectorInput?.value || '';
        if (newDiners <= 0 || !newSector) {
            showToast("Para nova mesa, Pessoas e Setor são obrigatórios.", true);
            return;
        }
    }

    toggleLoading(confirmTransferBtn, true, 'Transferindo...');

    if(window.handleTableTransferConfirmed) {
        window.handleTableTransferConfirmed(currentTableId, targetTableId, itemsToTransfer, newDiners, newSector)
            .then(() => {
                if (tableTransferModal) tableTransferModal.style.display = 'none';
                showToast("Transferência realizada!", false);
            })
            .catch((e) => {
                showToast("Erro na transferência.", true);
            })
            .finally(() => {
                toggleLoading(confirmTransferBtn, false);
            });
    } else {
        console.error("Função handleTableTransferConfirmed não encontrada.");
        toggleLoading(confirmTransferBtn, false);
    }
}

// ==================================================================
//           FUNÇÃO DE FECHAMENTO
// ==================================================================
export const handleFinalizeOrder = async () => {
    if (!currentTableId || !currentOrderSnapshot) return;
    
    const totalDaConta = currentOrderSnapshot.total || 0; 
    const payments = currentOrderSnapshot.payments || [];
    const totalPago = payments.reduce((sum, p) => sum + getNumericValueFromCurrency(p.value), 0);
    const remainingBalance = totalDaConta - totalPago;
    const sentItems = currentOrderSnapshot.sentItems || [];

    if (sentItems.length === 0) {
        if (!(await window.showConfirm(`Esta mesa não tem itens registrados. Deseja forçar o fechamento e limpar a mesa?`, "Mesa Vazia"))) return;
        
        toggleLoading(finalizeOrderBtn, true, 'Limpando...');
        
        try {
            const batch = writeBatch(db);
            const historyRef = doc(getTablesCollectionRef(), `${currentTableId}_forced_close_${Date.now()}`);
            batch.set(historyRef, { 
                ...currentOrderSnapshot, 
                status: 'forced_close', 
                closedAt: serverTimestamp(), 
                closedBy: userId || 'Staff',
                note: 'Fechamento manual de mesa vazia/orfã'
            });
            batch.delete(getTableDocRef(currentTableId));
            await batch.commit();
            showToast("Mesa limpa com sucesso.", false);
            goToScreen('panelScreen');
            return;

        } catch (e) {
            console.error("Erro ao limpar mesa:", e);
            showToast(`Erro ao limpar: ${e.message}`, true);
            toggleLoading(finalizeOrderBtn, false);
            return;
        }
    }

    if (remainingBalance > 0.01) {
         window.showAlert(`Ainda resta ${formatCurrency(remainingBalance)} a pagar.`);
         return;
    }

    if (!(await window.showConfirm(`Tem certeza que deseja fechar a Mesa ${currentTableId}?`, "Fechar Conta"))) return;

    toggleLoading(finalizeOrderBtn, true, 'Fechando...');

    try {
        const wooOrder = await createWooCommerceOrder(currentOrderSnapshot);
        const tableRef = getTableDocRef(currentTableId);
        const clientId = currentOrderSnapshot.clientId; 
        const pointsEarned = Math.floor(totalDaConta); 
        
        const batch = writeBatch(db);
        const historyId = `${currentTableId}_closed_${Date.now()}`;
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
        batch.delete(tableRef); 

        const mergedTablesQuery = query(
            getTablesCollectionRef(), 
            where('masterTable', '==', parseInt(currentTableId)), 
            where('status', '==', 'merged')
        );
        const mergedSnap = await getDocs(mergedTablesQuery);
        mergedSnap.forEach(doc => { batch.delete(doc.ref); });
        
        if (clientId) {
            const customerRef = doc(getCustomersCollectionRef(), clientId);
            batch.update(customerRef, {
                points: increment(pointsEarned), 
                lastVisit: serverTimestamp(),
                orderHistory: arrayUnion({ orderId: wooOrder.id, total: totalDaConta, points: pointsEarned, date: Date.now() })
            });
        }
        
        await batch.commit();
        const successMessage = clientId 
            ? `Sucesso! Pedido Woo: #${wooOrder.id}. +${pointsEarned} pontos.`
            : `Sucesso! Pedido Woo: #${wooOrder.id}. Mesa arquivada.`;
            
        showToast(successMessage, false);
        window.goToScreen('panelScreen'); 
    
    } catch (e) {
        console.error("Erro ao finalizar:", e);
        showToast(`FALHA: ${e.message}`, true);
    } finally {
        toggleLoading(finalizeOrderBtn, false, 'FINALIZAR CONTA');
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
        showToast("Nome e Documento obrigatórios.", true);
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
        showToast("Cliente salvo!", false);
    } catch (e) {
        console.error("Erro ao salvar:", e);
        showToast("Falha ao salvar cliente.", true);
    }
};

const linkCustomerToTable = async () => {
    if (!currentFoundCustomer || !currentTableId) {
        showToast("Selecione cliente e mesa.", true);
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
        showToast("Cliente associado.", false);
    } catch (e) {
        console.error("Erro ao associar:", e);
        showToast("Falha ao associar cliente.", true);
    }
};

const handlePrintSummary = () => {
    const valuePerDinerText = valuePerDinerDisplay ? valuePerDinerDisplay.textContent : 'R$ 0,00';
    updateText('valuePerDinerDisplayPrint', valuePerDinerText);
    window.print();
};

// --- CONFIGURAÇÃO DE EVENTOS DE LISTA ---
const setupPaymentEventListeners = () => {
    // 1. Delegação de Eventos na Lista de Pagamentos (Excluir)
    if (paymentSummaryList) {
        paymentSummaryList.addEventListener('click', (e) => {
            const deleteBtn = e.target.closest('.btn-delete-payment');
            if (deleteBtn) {
                // Passamos o botão como argumento para desabilitá-lo durante o processo
                executeDeletePayment(deleteBtn.dataset.timestamp, deleteBtn);
            }
        });
    }

    // 2. Delegação de Eventos na Lista de Itens (Checkboxes)
    if (reviewItemsList) {
        reviewItemsList.addEventListener('click', (e) => {
            const target = e.target;
            
            // Checkbox individual
            if (target.matches('input[data-action="toggle-select"]')) {
                activateItemSelection();
            }
            
            // Checkbox "Selecionar Todos"
            if (target.matches('input[data-action="toggle-all"]')) {
                activateItemSelection('toggleAll');
            }

            // Botão Excluir em Massa
            const deleteBtn = target.closest('#massDeleteBtn');
            if (deleteBtn) {
                handleMassActionRequest('delete');
            }

            // Botão Transferir em Massa
            const transferBtn = target.closest('#massTransferBtn');
            if (transferBtn) {
                handleMassActionRequest('transfer');
            }
        });
    }
};

// --- INICIALIZAÇÃO DO CONTROLLER ---
export const initPaymentController = () => {
    if(paymentInitialized) return;
    console.log("[PaymentController] Inicializando...");

    const splitContainer = document.getElementById('paymentSplitsContainer');
    if (splitContainer) splitContainer.style.display = 'none';
    const splitBtn = document.getElementById('addSplitAccountBtn');
    if (splitBtn) splitBtn.style.display = 'none';

    reviewItemsList = document.getElementById('reviewItemsList');
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
    callMotoboyBtn = document.getElementById('callMotoboyBtn');

    if (!reviewItemsList || !calculatorModal) return;

    renderPaymentMethodButtons();
    setupPaymentEventListeners(); // <--- Inicia a delegação de eventos

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
        const numericValue = getNumericValueFromCurrency(paymentValueInput?.value || '0');

        if (!selectedMethod || numericValue <= 0 || !currentTableId) {
            showToast("Selecione método e valor.", true);
            return;
        }

        toggleLoading(addPaymentBtn, true, '');

        try {
            const tableRef = getTableDocRef(currentTableId);
            const paymentData = {
                method: selectedMethod,
                value: formatCurrency(numericValue), 
                timestamp: Date.now(),
                byUser: userId || 'PDV Staff' 
            };

            await updateDoc(tableRef, { payments: arrayUnion(paymentData) });
            
            paymentValueInput.value = ''; 
            paymentMethodButtonsContainer.querySelectorAll('.payment-method-btn').forEach(b => b.classList.remove('active'));
            _validatePaymentInputs();
            
            showToast("Pagamento registrado!", false);
        } catch (e) {
            console.error("Erro pagamento:", e);
            showToast("Falha ao registrar pagamento.", true);
        } finally {
            toggleLoading(addPaymentBtn, false);
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
    
    if (callMotoboyBtn) {
        callMotoboyBtn.addEventListener('click', () => {
            if (window.renderExternalRecruitmentModal) {
                window.renderExternalRecruitmentModal('motoboy');
            } else {
                showToast("Módulo de RH não disponível.", true);
            }
        });
    }

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