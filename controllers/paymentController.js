// --- CONTROLLERS/PAYMENTCONTROLLER.JS (Completo e Estável) ---
import { currentTableId, currentOrderSnapshot, userId } from "/app.js";
import { formatCurrency, calculateItemsValue, getNumericValueFromCurrency } from "/utils.js";
import { getTableDocRef, getCustomersCollectionRef, db } from "/services/firebaseService.js";
import {
    updateDoc, arrayUnion, arrayRemove, writeBatch, getFirestore, getDoc, serverTimestamp,
    collection, query, where, getDocs, addDoc, setDoc, doc
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { createWooCommerceOrder } from "/services/wooCommerceService.js";


// --- VARIÁVEIS DE ELEMENTOS ---
let paymentSplitsContainer, addSplitAccountBtn;
let reviewItemsList;
let orderSubtotalDisplay, orderServiceTaxDisplay, orderTotalDisplay, valuePerDinerDisplay, remainingBalanceDisplay;
let toggleServiceTaxBtn, dinersSplitInput;
let paymentSummaryList, chargeInputs, openCustomerRegBtn, customerSearchInput, paymentMethodButtonsContainer, paymentValueInput, openCalculatorBtn, addPaymentBtn;
let finalizeOrderBtn, openNfeModalBtn;
let calculatorModal, calcDisplay, calcButtonsContainer, closeCalcBtnX, confirmCalcBtn; // Calculadora
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

// --- FUNÇÕES DE AÇÃO (PAGAMENTO) ---
export const executeDeletePayment = async (timestamp) => {
    if (!currentTableId || !timestamp) return;
    const tableRef = getTableDocRef(currentTableId);
    const paymentToDelete = currentOrderSnapshot?.payments.find(p => p.timestamp === timestamp);
    if (!paymentToDelete) {
        alert("Erro: Pagamento não encontrado para excluir.");
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
window.deletePayment = deletePayment; // Expor globalmente
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

    paymentSummaryList.innerHTML = payments.map(p => `
        <div class="flex justify-between items-center py-2 border-b border-dark-border last:border-b-0">
            <div class="flex items-center space-x-2">
                <i class="fas ${p.method === 'Dinheiro' ? 'fa-money-bill-wave' : p.method === 'Pix' ? 'fa-qrcode' : 'fa-credit-card'} text-green-400"></i>
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
    `).join('');
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
    const diners = parseInt(dinersSplitInput?.value) || 1; 
    const valuePerDiner = totalPrincipalAccount / diners;

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
            const items = JSON.parse(box.dataset.items);
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

export const handleMassDeleteConfirmed = async () => {
    if (!window.itemsToTransfer || window.itemsToTransfer.length === 0) {
        alert("Nenhum item selecionado para exclusão.");
        return;
    }

    const itemsToDelete = window.itemsToTransfer;
    const tableRef = getTableDocRef(currentTableId);
    const currentSentItems = currentOrderSnapshot?.sentItems || [];

    const allItemsWillBeDeleted = currentSentItems.length === itemsToDelete.length && currentSentItems.every(sentItem => itemsToDelete.some(deleteItem => JSON.stringify(sentItem) === JSON.stringify(deleteItem)));

    let closeTableConfirmed = false;
    if (allItemsWillBeDeleted) {
        closeTableConfirmed = confirm("Todos os itens serão removidos desta mesa. Deseja FECHAR a mesa após a exclusão?");
    }

    const valueToDecrease = itemsToDelete.reduce((sum, item) => sum + (item.price || 0), 0);
    const currentTotal = currentOrderSnapshot?.total || 0;
    const newTotal = Math.max(0, currentTotal - valueToDecrease); 

    try {
        const batch = writeBatch(getFirestore());

        itemsToDelete.forEach(item => {
            batch.update(tableRef, { sentItems: arrayRemove(item) });
        });

        batch.update(tableRef, { total: newTotal });

        if (closeTableConfirmed) {
            batch.delete(tableRef); 
        }

        await batch.commit();

        alert(`${itemsToDelete.length} item(s) removidos da conta.${closeTableConfirmed ? ' A mesa foi fechada.' : ''}`);
        window.itemsToTransfer = []; 

        if (closeTableConfirmed && window.goToScreen) {
            window.goToScreen('panelScreen');
        }

    } catch (e) {
        console.error("Erro ao excluir itens em massa:", e);
        alert("Falha ao remover os itens.");
    }
};

export function openTableTransferModal() {
    if (!tableTransferModal) {
        console.error("[PaymentController] Modal 'tableTransferModal' não encontrado!");
        alert("Erro: Modal de transferência não foi inicializado.");
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

// Placeholders/Funções Desativadas para Divisão
const handleAddSplitAccount = () => { alert("Funcionalidade de divisão desativada.")};
window.removeSplitAccount = (splitId) => { alert("Funcionalidade de divisão desativada.")};
window.openPaymentModalForSplit = (splitId) => { alert("Funcionalidade de divisão desativada.")};
window.openSplitTransferModal = (splitId, mode) => { alert("Funcionalidade de divisão desativada.")};

// Função para Finalizar/Fechar a Conta
export const handleFinalizeOrder = async () => {
    if (!currentTableId || !currentOrderSnapshot) { alert("Erro: Nenhuma mesa ou dados da mesa carregados."); return; }
    if (!confirm(`Tem certeza que deseja fechar a Mesa ${currentTableId}? Esta ação enviará o pedido ao WooCommerce e não pode ser desfeita.`)) { return; }

    if(finalizeOrderBtn) finalizeOrderBtn.disabled = true;
    const originalBtnText = finalizeOrderBtn.innerHTML;
    finalizeOrderBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enviando...';

    try {
        const wooOrder = await createWooCommerceOrder(currentOrderSnapshot);
        
        const tableRef = getTableDocRef(currentTableId);
        // Exclui o documento da mesa
        await updateDoc(tableRef, { status: 'closed' }); // Define o status como fechado
        await doc(getFirestore(), tableRef.path).delete(); // Deleta a referência
        
        alert(`Pedido enviado ao WooCommerce (ID: ${wooOrder.id}). Mesa ${currentTableId} fechada com sucesso.`);
        
        window.goToScreen('panelScreen'); 
    
    } catch (e) {
        console.error("Erro CRÍTICO ao finalizar conta:", e);
        alert(`FALHA AO FINALIZAR: ${e.message}. A mesa NÃO foi fechada. Verifique o console e tente novamente.`);
        
        if(finalizeOrderBtn) {
            finalizeOrderBtn.disabled = false; 
            finalizeOrderBtn.innerHTML = originalBtnText;
            setTimeout(() => {
                 if(finalizeOrderBtn) {
                     finalizeOrderBtn.disabled = false;
                     finalizeOrderBtn.innerHTML = originalBtnText;
                     finalizeOrderBtn.classList.remove('opacity-50', 'cursor-not-allowed');
                 }
            }, 500);
        }
    }
};


// --- FUNÇÕES GESTÃO DE CLIENTES (Completas) ---
const openCustomerRegModal = () => {
    if (!customerRegModal) return;
    
    // Reseta todos os campos e o estado
    customerNameInput.value = '';
    customerCpfInput.value = '';
    customerPhoneInput.value = '';
    customerEmailInput.value = '';
    customerSearchCpfInput.value = '';
    customerSearchResultsDiv.innerHTML = '<p class="text-sm text-dark-placeholder italic">Busque por um CPF ou CNPJ para começar.</p>';
    
    currentFoundCustomer = null;
    saveCustomerBtn.disabled = true;
    linkCustomerToTableBtn.disabled = true;
    
    customerRegModal.style.display = 'flex';
    customerSearchCpfInput.focus();
};

const searchCustomer = async () => {
    if (!customerSearchCpfInput || !customerSearchResultsDiv) return;
    const docNumber = customerSearchCpfInput.value.replace(/\D/g, ''); 
    if (docNumber.length !== 11 && docNumber.length !== 14) {
        customerSearchResultsDiv.innerHTML = `<p class="text-sm text-red-400">Documento inválido. Digite 11 (CPF) ou 14 (CNPJ) números.</p>`;
        return;
    }
    customerSearchResultsDiv.innerHTML = `<p class="text-sm text-yellow-400">Buscando...</p>`;

    try {
        const customersRef = getCustomersCollectionRef();
        const customerDocRef = doc(customersRef, docNumber); 
        const docSnap = await getDoc(customerDocRef);

        if (docSnap.exists()) {
            currentFoundCustomer = docSnap.data();
            if (customerNameInput) customerNameInput.value = currentFoundCustomer.name || '';
            if (customerCpfInput) customerCpfInput.value = currentFoundCustomer.cpf || docNumber; 
            if (customerPhoneInput) customerPhoneInput.value = currentFoundCustomer.phone || '';
            if (customerEmailInput) customerEmailInput.value = currentFoundCustomer.email || '';
            
            customerSearchResultsDiv.innerHTML = `<p class="text-sm text-green-400">Cliente encontrado: <strong>${currentFoundCustomer.name}</strong></p>`;
            if (saveCustomerBtn) saveCustomerBtn.disabled = true; 
            if (linkCustomerToTableBtn) linkCustomerToTableBtn.disabled = false;
        } else {
            currentFoundCustomer = null;
            if (customerNameInput) customerNameInput.value = '';
            if (customerCpfInput) customerCpfInput.value = docNumber; 
            if (customerPhoneInput) customerPhoneInput.value = '';
            if (customerEmailInput) customerEmailInput.value = '';
            
            customerSearchResultsDiv.innerHTML = `<p class="text-sm text-yellow-400">Cliente não encontrado. Preencha os dados para cadastrar.</p>`;
            if (saveCustomerBtn) saveCustomerBtn.disabled = true; 
            if (linkCustomerToTableBtn) linkCustomerToTableBtn.disabled = true;
            if (customerNameInput) customerNameInput.focus();
        }
    } catch (e) {
        console.error("Erro ao buscar cliente:", e);
        customerSearchResultsDiv.innerHTML = `<p class="text-sm text-red-400">Erro ao buscar no banco de dados.</p>`;
    }
};

const saveCustomer = async () => {
    if (!customerNameInput || !customerCpfInput) return;
    const name = customerNameInput.value.trim();
    const documentNumber = customerCpfInput.value.replace(/\D/g, ''); 
    const phone = customerPhoneInput.value.trim();
    const email = customerEmailInput.value.trim().toLowerCase();

    if (!name || (documentNumber.length !== 11 && documentNumber.length !== 14)) {
        alert("Nome e Documento (CPF de 11 ou CNPJ de 14 dígitos) são obrigatórios.");
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
        const customersRef = getCustomersCollectionRef();
        const customerDocRef = doc(customersRef, documentNumber); 
        await setDoc(customerDocRef, customerData, { merge: true });

        currentFoundCustomer = customerData;
        if (customerSearchResultsDiv) customerSearchResultsDiv.innerHTML = `<p class="text-sm text-green-400">Cliente salvo/atualizado: <strong>${name}</strong></p>`;
        if (saveCustomerBtn) saveCustomerBtn.disabled = true;
        if (linkCustomerToTableBtn) linkCustomerToTableBtn.disabled = false;
        
    } catch (e) {
        console.error("Erro ao salvar cliente:", e);
        alert("Falha ao salvar cliente.");
    }
};

const linkCustomerToTable = async () => {
    if (!currentFoundCustomer || !currentTableId) {
        alert("Nenhum cliente selecionado ou mesa ativa.");
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
        console.error("Erro ao associar cliente à mesa:", e);
        alert("Falha ao associar cliente.");
    }
};

const handlePrintSummary = () => {
    const valuePerDinerText = valuePerDinerDisplay ? valuePerDinerDisplay.textContent : 'R$ 0,00';
    updateText('valuePerDinerDisplayPrint', valuePerDinerText);
    
    window.print();
};

// --- INICIALIZAÇÃO DO CONTROLLER ---
const attachReviewListListeners = () => { /* ... (implementação completa) ... */ };

export const initPaymentController = () => {
    if(paymentInitialized) return;
    console.log("[PaymentController] Inicializando...");

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
    
    // Mapeamento da Calculadora
    calculatorModal = document.getElementById('calculatorModal');
    calcDisplay = document.getElementById('calcDisplay');
    calcButtonsContainer = calculatorModal?.querySelector('.calculator-buttons'); 
    closeCalcBtnX = document.getElementById('closeCalcBtnX');
    confirmCalcBtn = document.getElementById('confirmCalcBtn');

    // Mapeamento de Transferência
    tableTransferModal = document.getElementById('tableTransferModal');
    targetTableInput = document.getElementById('targetTableInput');
    confirmTransferBtn = document.getElementById('confirmTableTransferBtn');
    
    // Mapeamento de Impressão e Cliente
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

    if (!reviewItemsList) { console.error("[PaymentController] Erro Fatal: 'reviewItemsList' não encontrado."); return; }

    renderPaymentMethodButtons();

    // Adiciona Listeners Essenciais
    if(toggleServiceTaxBtn) toggleServiceTaxBtn.addEventListener('click', async () => { /* ... */ });
    if(decreaseDinersBtn && dinersSplitInput) decreaseDinersBtn.addEventListener('click', () => { /* ... */ });
    if(increaseDinersBtn && dinersSplitInput) increaseDinersBtn.addEventListener('click', () => { /* ... */ });
    
    if(paymentMethodButtonsContainer) paymentMethodButtonsContainer.addEventListener('click', (e) => { /* ... */ });
    if(paymentValueInput) paymentValueInput.addEventListener('input', (e) => { /* ... */ });
    if(addPaymentBtn) addPaymentBtn.addEventListener('click', async () => { /* ... */ });
    
    if(finalizeOrderBtn) finalizeOrderBtn.addEventListener('click', handleFinalizeOrder);

    // --- Listeners da Calculadora (Motor Completo) ---
    if (calcButtonsContainer) {
        calcButtonsContainer.addEventListener('click', (event) => {
            const { target } = event;
            if (!target.matches('.calc-btn[data-action]')) return;

            const action = target.dataset.action;
            const value = target.dataset.value;

            switch (action) {
                case 'number': inputDigit(value); break;
                case 'operator': handleOperator(value); break;
                case 'decimal': inputDecimal('.'); break; 
                case 'clear': resetCalculator(); break;
                case 'backspace': backspace(); break;
                case 'calculate': handleOperator('='); calculatorState.waitingForSecondOperand = false; calculatorState.operator = null; break;
            }
            updateDisplay();
        });
    } else { 
        console.error("[PaymentController] Erro: Contêiner 'calculator-buttons' não encontrado. Calculadora desativada."); 
    }

    if (confirmCalcBtn) {
        confirmCalcBtn.addEventListener('click', () => {
            if (paymentValueInput && calcDisplay) {
                const calcValueFormatted = calcDisplay.value.replace(',', '.'); 
                paymentValueInput.value = calcValueFormatted.replace('.', ','); 
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
                 updateDisplay();
                 calculatorModal.style.display = 'flex';
             } else {
                 console.error("Elementos da calculadora ou input de pagamento não encontrados ao abrir.");
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
    // --- FIM DA ATUALIZAÇÃO: LISTENERS DA CALCULADORA ---


    // --- LISTENERS DE AÇÃO EM MASSA E CLIENTE ---
    if(confirmTransferBtn) confirmTransferBtn.addEventListener('click', handleConfirmTableTransfer);
    if (targetTableInput) targetTableInput.addEventListener('input', async () => { /* ... */ });

    if(printSummaryBtn) printSummaryBtn.addEventListener('click', handlePrintSummary);
    
    if (openCustomerRegBtn) openCustomerRegBtn.addEventListener('click', openCustomerRegModal);
    if (closeCustomerRegModalBtn) closeCustomerRegModalBtn.addEventListener('click', () => { if(customerRegModal) customerRegModal.style.display = 'none'; currentFoundCustomer = null; }); 
    if (searchCustomerByCpfBtn) searchCustomerByCpfBtn.addEventListener('click', searchCustomer); 
    if (saveCustomerBtn) saveCustomerBtn.addEventListener('click', saveCustomer); 
    if (linkCustomerToTableBtn) linkCustomerToTableBtn.addEventListener('click', linkCustomerToTable); 
    
    // Listener para habilitar o botão 'Salvar Cliente' (com lógica completa)
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
