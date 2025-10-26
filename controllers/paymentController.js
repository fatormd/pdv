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
let paymentInitialized = false;

const PAYMENT_METHODS = ['Dinheiro', 'Pix', 'Crédito', 'Débito', 'Ticket', 'Voucher'];


// --- FUNÇÕES DE CÁLCULO E UTILIDADE ---
const calculateTotal = (subtotal, applyServiceTax) => {
    return applyServiceTax ? subtotal * 1.10 : subtotal;
};
const updateText = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
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
    try {
        await updateDoc(tableRef, { payments: arrayRemove(paymentToRemove) });
        console.log(`[Payment] Pagamento ${timestamp} removido.`);
    } catch (e) {
        console.error("Erro ao excluir pagamento:", e);
        alert("Erro ao excluir pagamento.");
    }
};
export const deletePayment = async (timestamp) => {
    window.openManagerAuthModal('deletePayment', timestamp);
};

// --- FUNÇÕES DE RENDERIZAÇÃO ---

// ==============================================
//     FUNÇÃO ATUALIZADA: renderReviewItemsList
// ==============================================
const renderReviewItemsList = (orderSnapshot) => {
    if (!reviewItemsList) return;

    const items = orderSnapshot?.sentItems || []; // Itens enviados que estão na conta principal

    // Limpa a barra de ação antiga antes de redesenhar
    const oldActionBar = document.getElementById('reviewActionBar');
    if (oldActionBar) oldActionBar.remove();

    if (items.length === 0) {
        reviewItemsList.innerHTML = `<div class="text-sm text-dark-placeholder italic p-2">Nenhum item na conta principal para revisão.</div>`;
        return;
    }

    // Agrupa os itens
    const groupedItems = items.reduce((acc, item) => {
        const key = `${item.id}-${item.note || ''}`;
        if (!acc[key]) {
            acc[key] = { ...item, count: 0, originalItems: [] };
        }
        acc[key].count++;
        acc[key].originalItems.push(item); // Guarda original para transferência/exclusão
        return acc;
    }, {});

    // Gera o HTML para cada item agrupado
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
        </div>
        `;
    }).join('');

    // Gera a Barra de Ação
    const actionBarHtml = `
        <div id="reviewActionBar" class="flex justify-between items-center p-2 mt-4 bg-dark-input rounded-lg sticky bottom-0">
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

    // Insere o HTML na div
    reviewItemsList.innerHTML = itemsHtml + actionBarHtml;

    // Adiciona listeners aos botões da barra de ação
    attachReviewListListeners();
};
// ==============================================
//           FIM DA FUNÇÃO ATUALIZADA
// ==============================================


const renderRegisteredPayments = (payments) => {
    if (!paymentSummaryList) return;
    if (!payments || payments.length === 0) {
        paymentSummaryList.innerHTML = `<p class="text-sm text-dark-placeholder italic">Nenhum pagamento registrado.</p>`;
        return;
    }
    paymentSummaryList.innerHTML = payments.map(p => `
        <div class="flex justify-between items-center py-1 border-b border-dark-border">
            <div class="flex items-center space-x-2">
                <button class="text-red-500 hover:text-red-400" title="Excluir Pagamento" onclick="window.deletePayment(${p.timestamp})">
                    <i class="fas fa-times-circle"></i>
                </button>
                <span class="font-semibold">${p.method}</span>
            </div>
            <span class="text-gray-400">${p.value}</span>
        </div>
    `).join('');
};

const renderPaymentSplits = (orderSnapshot) => {
    if(!paymentSplitsContainer) return; // Se o container está escondido ou não existe, não faz nada
    // A lógica de renderização foi removida/comentada pois a seção está escondida
    // paymentSplitsContainer.innerHTML = '<p class="text-sm text-dark-placeholder italic">Divisão desativada.</p>';
};

const renderPaymentMethodButtons = () => {
    if (!paymentMethodButtonsContainer) return;
    paymentMethodButtonsContainer.innerHTML = PAYMENT_METHODS.map(method => `
        <button class="payment-method-btn" data-method="${method}">
            ${method}
        </button>
    `).join('');
};

export const renderPaymentSummary = (tableId, orderSnapshot) => {
    if (!orderSnapshot || !paymentInitialized) return;

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
        const totalRemaining = remainingBalancePrincipal; // Simplificado
        const canFinalize = sentItems.length === 0 && totalRemaining <= 0.01;
        finalizeOrderBtn.disabled = !canFinalize;
        finalizeOrderBtn.classList.toggle('opacity-50', !canFinalize);
        finalizeOrderBtn.classList.toggle('cursor-not-allowed', !canFinalize);
    }

    // Chama as funções de renderização filhas
    renderReviewItemsList(orderSnapshot); // <--- ESTA FUNÇÃO AGORA ESTÁ COMPLETA
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

    if (!deleteBtn || !transferBtn || !selectAllBox) return;

    if (mode === 'toggleAll') {
        allCheckboxes.forEach(box => box.checked = selectAllBox.checked);
    }

    const selectedCheckboxes = document.querySelectorAll('#reviewItemsList input[type="checkbox"].item-select-checkbox:checked');
    const count = selectedCheckboxes.length;

    isMassSelectionActive = count > 0;

    // Atualiza contadores
    const deleteCountSpan = document.getElementById('deleteCount');
    const transferCountSpan = document.getElementById('transferCount');
    if (deleteCountSpan) deleteCountSpan.textContent = count;
    if (transferCountSpan) transferCountSpan.textContent = count;


    // Habilita/Desabilita botões
    [deleteBtn, transferBtn].forEach(btn => {
        if(btn){ // Verifica se o botão existe antes de tentar modificar
            btn.disabled = !isMassSelectionActive;
            btn.classList.toggle('opacity-50', !isMassSelectionActive);
            btn.classList.toggle('cursor-not-allowed', !isMassSelectionActive);
        }
    });

    // Atualiza "Selecionar Todos"
    if (count === allCheckboxes.length && allCheckboxes.length > 0) {
        selectAllBox.checked = true;
    } else {
        selectAllBox.checked = false;
    }

    // Coleta itens para transferência
    window.itemsToTransfer = [];
    selectedCheckboxes.forEach(box => {
        try {
            const items = JSON.parse(box.dataset.items);
            window.itemsToTransfer.push(...items);
        } catch(e) { console.error("Erro ao ler dados de item para transferência:", e); }
    });
};
export const handleMassActionRequest = (action) => { /* ... (mantida) ... */ };
export const handleMassDeleteConfirmed = async () => { /* ... (mantida) ... */ };
export function openTableTransferModal() { /* ... (mantida) ... */ };
export function handleConfirmTableTransfer() { /* ... (mantida) ... */ };

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
const attachReviewListListeners = () => {
    const massDeleteBtn = document.getElementById('massDeleteBtn');
    const massTransferBtn = document.getElementById('massTransferBtn');

    if (massDeleteBtn) {
         const newDeleteBtn = massDeleteBtn.cloneNode(true);
         massDeleteBtn.parentNode.replaceChild(newDeleteBtn, massDeleteBtn);
         newDeleteBtn.addEventListener('click', () => window.handleMassActionRequest('delete'));
    }
     if (massTransferBtn) {
         const newTransferBtn = massTransferBtn.cloneNode(true);
         massTransferBtn.parentNode.replaceChild(newTransferBtn, massTransferBtn);
         newTransferBtn.addEventListener('click', () => window.handleMassActionRequest('transfer'));
    }
};

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
    decreaseDinersBtn = document.getElementById('decreaseDinersBtn'); // Botão -
    increaseDinersBtn = document.getElementById('increaseDinersBtn'); // Botão +
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
    // ... mapeamentos do modal cliente ...
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

    if (tableTransferModal) { /* ... (mapeamento mantido) ... */ }
    if(selectiveTransferModal) { /* ... (mapeamento mantido) ... */ }

    if (!reviewItemsList) { console.error("[PaymentController] Erro Fatal: 'reviewItemsList' não encontrado."); return; }

    renderPaymentMethodButtons(); // Renderiza botões de pagamento

    // Adiciona Listeners Essenciais
    if(toggleServiceTaxBtn) toggleServiceTaxBtn.addEventListener('click', async () => { /* ... */ });
    if(decreaseDinersBtn && dinersSplitInput) { /* ... (listener mantido) ... */ }
    if(increaseDinersBtn && dinersSplitInput) { /* ... (listener mantido) ... */ }
    if(paymentMethodButtonsContainer) paymentMethodButtonsContainer.addEventListener('click', (e) => { /* ... */ });
    if(paymentValueInput) paymentValueInput.addEventListener('input', (e) => { /* ... */ });
    if(addPaymentBtn) addPaymentBtn.addEventListener('click', async () => { /* ... */ });
    if(finalizeOrderBtn) finalizeOrderBtn.addEventListener('click', handleFinalizeOrder); // Placeholder
    if(openNfeModalBtn) openNfeModalBtn.addEventListener('click', window.openNfeModal); // Placeholder global
    if(addSplitAccountBtn) { addSplitAccountBtn.addEventListener('click', handleAddSplitAccount); } // Chama placeholder
    else { console.warn("[PaymentController] Botão 'addSplitAccountBtn' (divisão) não encontrado ou desativado."); }
    if (openCalculatorBtn) openCalculatorBtn.addEventListener('click', () => { if(calculatorModal) calculatorModal.style.display = 'flex'; });
    if (closeCalcBtnX) closeCalcBtnX.addEventListener('click', () => { if (calculatorModal) calculatorModal.style.display = 'none'; });
    if (calcButtons) calcButtons.addEventListener('click', (e) => { /* ... */ });
    if(confirmTransferBtn) { /* ... (listener mantido) ... */ }
    if (targetTableInput) { /* ... (listener mantido) ... */ }

    // Listeners do Modal Cliente (Mantidos)
    if (openCustomerRegBtn) { openCustomerRegBtn.addEventListener('click', openCustomerRegModal); }
    else { console.error("[PaymentController] Botão 'openCustomerRegBtn' não encontrado."); }
    if (closeCustomerRegModalBtn) { closeCustomerRegModalBtn.addEventListener('click', () => { /* ... */ }); }
    if (searchCustomerByCpfBtn) { searchCustomerByCpfBtn.addEventListener('click', searchCustomer); }
    if (saveCustomerBtn) { saveCustomerBtn.addEventListener('click', saveCustomer); }
    if (linkCustomerToTableBtn) { linkCustomerToTableBtn.addEventListener('click', linkCustomerToTable); }
    [customerNameInput, customerCpfInput].forEach(input => { /* ... (listener mantido) ... */ });

    paymentInitialized = true;
    console.log("[PaymentController] Inicializado.");
};
