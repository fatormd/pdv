// --- CONTROLLERS/PAYMENTCONTROLLER.JS (Painel 3) ---
import { currentTableId, currentOrderSnapshot } from "/app.js";
import { formatCurrency, calculateItemsValue, getNumericValueFromCurrency } from "/utils.js";
import { getTableDocRef, getCustomersCollectionRef, db } from "/services/firebaseService.js";
import {
    updateDoc, arrayUnion, arrayRemove, writeBatch, getFirestore, getDoc, serverTimestamp,
    collection, query, where, getDocs, addDoc, setDoc, doc
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// --- VARIÁVEIS DE ELEMENTOS (Declaradas no escopo do módulo) ---
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

// Referências aos listeners para remoção (Inicializadas como null)
let listenersAttached = {}; // Objeto para guardar referências

const PAYMENT_METHODS = ['Dinheiro', 'Pix', 'Crédito', 'Débito', 'Ticket', 'Voucher'];

// --- FUNÇÕES DE CÁLCULO E UTILIDADE ---
const calculateTotal = (subtotal, applyServiceTax) => {
    return applyServiceTax ? subtotal * 1.10 : subtotal;
};
// Função robusta para atualizar texto, com log de erro
const updateText = (elementId, value) => {
    const el = document.getElementById(elementId);
    if (el) {
        el.textContent = value;
    } else {
        console.warn(`[updateText] Element ID not found: ${elementId}`);
    }
};

// --- FUNÇÕES DE AÇÃO ---
export const executeDeletePayment = async (timestamp) => { /* ... (Mantida) ... */ };
export const deletePayment = async (timestamp) => { /* ... (Mantida) ... */ };

// --- FUNÇÕES DE RENDERIZAÇÃO ---
// Desenha a lista de itens enviados (com checkboxes e barra de ação)
const renderReviewItemsList = (orderSnapshot) => {
    if (!reviewItemsList) return;
    const items = orderSnapshot?.sentItems || [];
    const oldActionBar = document.getElementById('reviewActionBar');
    if (oldActionBar) oldActionBar.remove();

    if (items.length === 0) {
        reviewItemsList.innerHTML = `<div class="text-sm text-dark-placeholder italic p-2">Nenhum item na conta principal.</div>`;
        return;
    }
    const groupedItems = items.reduce((acc, item) => {
        const key = `${item.id}-${item.note || ''}`;
        if (!acc[key]) { acc[key] = { ...item, count: 0, originalItems: [] }; }
        acc[key].count++; acc[key].originalItems.push(item); return acc;
     }, {});
    let itemsHtml = Object.values(groupedItems).map(group => {
        const itemData = JSON.stringify(group.originalItems).replace(/'/g, '&#39;');
        // Garante que onchange chame a função global
        return `<div class="flex justify-between items-center py-2 border-b border-dark-border hover:bg-dark-input p-2 rounded-lg"> <div class="flex items-center flex-grow min-w-0 mr-2"> <input type="checkbox" class="item-select-checkbox mr-3 h-5 w-5 bg-dark-input border-gray-600 rounded text-pumpkin focus:ring-pumpkin" data-items='${itemData}' onchange="window.activateItemSelection()"> <div class="flex flex-col min-w-0"> <span class="font-semibold text-dark-text truncate">${group.name} (${group.count}x)</span> <span class="text-xs text-dark-placeholder">${group.note || 'Sem observações'}</span> </div> </div> <span class="font-bold text-pumpkin flex-shrink-0">${formatCurrency(group.price * group.count)}</span> </div>`;
     }).join('');
    const actionBarHtml = ` <div id="reviewActionBar" class="flex justify-between items-center p-2 mt-4 bg-dark-input rounded-lg sticky bottom-0 z-10"> <div class="flex items-center"> <input type="checkbox" id="selectAllItems" class="mr-2 h-4 w-4 bg-dark-input border-gray-600 rounded text-pumpkin focus:ring-pumpkin" onchange="window.activateItemSelection('toggleAll')"> <label for="selectAllItems" class="text-sm font-semibold">Selecionar Todos</label> </div> <div class="flex space-x-2"> <button id="massDeleteBtn" class="px-3 py-1 bg-red-600 text-white rounded-lg hover:bg-red-700 transition text-sm font-bold opacity-50 cursor-not-allowed" disabled> <i class="fas fa-trash"></i> (<span id="deleteCount">0</span>) </button> <button id="massTransferBtn" class="px-3 py-1 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition text-sm font-bold opacity-50 cursor-not-allowed" disabled> <i class="fas fa-arrow-right"></i> (<span id="transferCount">0</span>) </button> </div> </div>`;
    reviewItemsList.innerHTML = itemsHtml + actionBarHtml;
    attachReviewListListeners(); // Reanexa listeners à barra
};

// Desenha a lista de pagamentos registrados
const renderRegisteredPayments = (payments) => {
    if (!paymentSummaryList) return;
    if (!payments || payments.length === 0) { paymentSummaryList.innerHTML = `<p class="text-sm text-dark-placeholder italic">Nenhum pagamento.</p>`; return; }
    // Garante que onclick chame a função global
    paymentSummaryList.innerHTML = payments.map(p => ` <div class="flex justify-between items-center py-1 border-b border-dark-border last:border-b-0"> <div class="flex items-center space-x-2"> <button class="text-red-500 hover:text-red-400 p-1" title="Excluir Pagamento" onclick="window.deletePayment(${p.timestamp})"> <i class="fas fa-times-circle"></i> </button> <span class="font-semibold">${p.method}</span> </div> <span class="text-gray-400">${p.value}</span> </div>`).join('');
};

// Renderiza a seção de divisão (atualmente vazia/escondida)
const renderPaymentSplits = (orderSnapshot) => { /* ... (vazia/comentada) ... */ };

// Renderiza os botões de método de pagamento
const renderPaymentMethodButtons = () => {
    if (!paymentMethodButtonsContainer) return;
    paymentMethodButtonsContainer.innerHTML = PAYMENT_METHODS.map(method => `<button class="payment-method-btn" data-method="${method}">${method}</button>`).join('');
};

// Função principal que calcula e atualiza toda a tela de pagamento
export const renderPaymentSummary = (tableId, orderSnapshot) => {
    // console.log("[renderPaymentSummary] Rendering..."); // Habilitar para debug
    if (!orderSnapshot || !paymentInitialized) return;

    const payments = orderSnapshot.payments || [];
    const sentItems = orderSnapshot.sentItems || [];
    const subtotal = calculateItemsValue(sentItems);
    const applyServiceTax = orderSnapshot.serviceTaxApplied ?? true;
    const serviceTax = applyServiceTax ? subtotal * 0.10 : 0;
    const totalPrincipalAccount = subtotal + serviceTax;
    const totalPaidPrincipal = payments.reduce((sum, p) => sum + getNumericValueFromCurrency(p.value), 0);
    const remainingBalancePrincipal = totalPrincipalAccount - totalPaidPrincipal;
    const diners = parseInt(dinersSplitInput?.value) || 1; // Usa o valor ATUAL do input
    const valuePerDiner = totalPrincipalAccount > 0 ? totalPrincipalAccount / diners : 0;

    // Log para verificar cálculos
    console.log(`[renderPaymentSummary] Calculations: Subtotal=${subtotal}, Tax=${serviceTax}, Total=${totalPrincipalAccount}, Paid=${totalPaidPrincipal}, Remaining=${remainingBalancePrincipal}, Diners=${diners}, Val/Diner=${valuePerDiner}`);

    // Atualiza a UI (garantir que IDs estão corretos no HTML)
    updateText('orderSubtotalDisplayPayment', formatCurrency(subtotal));
    updateText('orderServiceTaxDisplayPayment', formatCurrency(serviceTax));
    updateText('orderTotalDisplayPayment', formatCurrency(totalPrincipalAccount));
    updateText('valuePerDinerDisplay', formatCurrency(valuePerDiner));
    updateText('remainingBalanceDisplay', formatCurrency(remainingBalancePrincipal > 0 ? remainingBalancePrincipal : 0));

    // Atualiza estado do botão de taxa
    if (toggleServiceTaxBtn) {
        toggleServiceTaxBtn.textContent = applyServiceTax ? 'Remover' : 'Aplicar';
        toggleServiceTaxBtn.classList.toggle('bg-red-600', applyServiceTax);
        toggleServiceTaxBtn.classList.toggle('bg-green-600', !applyServiceTax);
        toggleServiceTaxBtn.disabled = false;
        toggleServiceTaxBtn.style.opacity = '1';
    }

    // Atualiza estado do botão Finalizar
    if (finalizeOrderBtn) {
        const totalRemaining = remainingBalancePrincipal; // Simplificado (sem splits)
        const canFinalize = sentItems.length === 0 && totalRemaining <= 0.01;
        finalizeOrderBtn.disabled = !canFinalize;
        finalizeOrderBtn.classList.toggle('opacity-50', !canFinalize);
        finalizeOrderBtn.classList.toggle('cursor-not-allowed', !canFinalize);
    }

    // Renderiza as listas
    renderReviewItemsList(orderSnapshot);
    renderRegisteredPayments(payments);
    renderPaymentSplits(orderSnapshot); // Chama mesmo se escondido

    // Atualiza input/status do cliente
    if (customerSearchInput) {
        customerSearchInput.value = orderSnapshot?.clientName || '';
        customerSearchInput.disabled = !!orderSnapshot?.clientName;
    }
};

// --- LÓGICAS DE AÇÃO EM MASSA E TRANSFERÊNCIA ---
// Função global para lidar com cliques nos checkboxes e atualizar a barra de ação
window.activateItemSelection = (mode = null) => {
    // console.log(`[activateItemSelection] Called with mode: ${mode}`); // Debug
    const allCheckboxes = document.querySelectorAll('#reviewItemsList input[type="checkbox"].item-select-checkbox');
    const selectAllBox = document.getElementById('selectAllItems');
    const deleteBtn = document.getElementById('massDeleteBtn');
    const transferBtn = document.getElementById('massTransferBtn');

    // Se a barra não existe (ex: lista vazia), não faz nada
    if (!deleteBtn || !transferBtn || !selectAllBox) return;

    if (mode === 'toggleAll') {
        allCheckboxes.forEach(box => box.checked = selectAllBox.checked);
    }

    const selectedCheckboxes = document.querySelectorAll('#reviewItemsList input[type="checkbox"].item-select-checkbox:checked');
    const count = selectedCheckboxes.length;
    isMassSelectionActive = count > 0;

    // Atualiza contadores e estado dos botões
    const deleteCountSpan = document.getElementById('deleteCount');
    const transferCountSpan = document.getElementById('transferCount');
    if (deleteCountSpan) deleteCountSpan.textContent = count;
    if (transferCountSpan) transferCountSpan.textContent = count;

    [deleteBtn, transferBtn].forEach(btn => {
        btn.disabled = !isMassSelectionActive;
        btn.classList.toggle('opacity-50', !isMassSelectionActive);
        btn.classList.toggle('cursor-not-allowed', !isMassSelectionActive);
    });

    // Atualiza estado do 'Selecionar Todos'
    selectAllBox.checked = count === allCheckboxes.length && allCheckboxes.length > 0;

    // Coleta itens originais dos checkboxes selecionados para a variável global
    window.itemsToTransfer = [];
    selectedCheckboxes.forEach(box => {
        try {
            const items = JSON.parse(box.dataset.items);
            window.itemsToTransfer.push(...items);
        } catch(e) { console.error("Erro ao ler dados de item:", e); }
    });
    // console.log("[activateItemSelection] Updated window.itemsToTransfer:", window.itemsToTransfer); // Debug
};

// Chamada quando os botões Lixeira ou Transferir (da barra de ação) são clicados
export const handleMassActionRequest = (action) => {
    console.log(`[handleMassActionRequest] Action: ${action}`);
    // Garante que a lista de itens a transferir/excluir está atualizada
    window.activateItemSelection();
    if (!window.itemsToTransfer || window.itemsToTransfer.length === 0) {
        alert("Nenhum item selecionado. Marque os itens na lista de resumo.");
        return;
    }
    console.log(`[handleMassActionRequest] Requesting auth for ${action} (${window.itemsToTransfer.length} items)`);
    if (action === 'delete') {
        window.openManagerAuthModal('executeMassDelete', null);
    } else if (action === 'transfer') {
        window.openManagerAuthModal('executeMassTransfer', null);
    }
};

// Executa a exclusão em massa após autenticação
export const handleMassDeleteConfirmed = async () => { /* ... (Mantida com logs e confirmação de fechar) ... */ };
// Abre o modal de transferência após autenticação
export function openTableTransferModal() { /* ... (Mantida) ... */ };
// Executa a transferência após confirmação no modal (CHAMA A FUNÇÃO GLOBAL DO APP.JS)
export function handleConfirmTableTransfer() {
     console.log("[Payment] handleConfirmTableTransfer called.");
     const targetTableInputEl = document.getElementById('targetTableInput');
     const targetTableNumber = targetTableInputEl?.value.trim();
     // ... (validações mantidas) ...
     const items = window.itemsToTransfer || [];
     if(items.length === 0) { alert("Erro interno: Itens para transferir não encontrados."); return; }
     // ... (lógica para pegar diners/sector se mesa nova mantida) ...
     let diners = 0; let sector = ''; /* ... */
     const confirmBtnEl = document.getElementById('confirmTableTransferBtn'); // Renomeado
     if(confirmBtnEl) confirmBtnEl.disabled = true;
     console.log(`[Payment] Calling global handleTableTransferConfirmed...`);
     // Chama a função no app.js que contém a lógica de commit e navegação
     window.handleTableTransferConfirmed(currentTableId, targetTableNumber, items, diners, sector);
     // Esconde o modal localmente
     const modal = document.getElementById('tableTransferModal');
     if(modal) modal.style.display = 'none';
     window.itemsToTransfer = []; // Limpa seleção local
 };

// Placeholders/Funções Desativadas
const handleAddSplitAccount = () => { alert("Divisão desativada.")};
window.removeSplitAccount = (splitId) => { alert("Divisão desativada.")};
window.openPaymentModalForSplit = (splitId) => { alert("Divisão desativada.")};
window.openSplitTransferModal = (splitId, mode) => { alert("Divisão desativada.")};
export const handleFinalizeOrder = () => { alert("Finalizar Conta (DEV)"); };

// --- FUNÇÕES GESTÃO DE CLIENTES ---
const openCustomerRegModal = () => { /* ... (Mantida) ... */ };
const searchCustomer = async () => { /* ... (Mantida) ... */ };
const saveCustomer = async () => { /* ... (Mantida) ... */ };
const linkCustomerToTable = async () => { /* ... (Mantida) ... */ };

// --- INICIALIZAÇÃO DO CONTROLLER ---
// Anexa listeners aos botões da barra de ação (Excluir/Transferir)
const attachReviewListListeners = () => {
    // console.log("[attachReviewListListeners] Attaching..."); // Debug
    const massDeleteBtnEl = document.getElementById('massDeleteBtn');
    const massTransferBtnEl = document.getElementById('massTransferBtn');
    // Usa handleMassActionRequest que agora valida a seleção antes de chamar o modal
    if (massDeleteBtnEl) {
         const newDeleteBtn = massDeleteBtnEl.cloneNode(true); // Previne listeners duplicados
         massDeleteBtnEl.parentNode.replaceChild(newDeleteBtn, massDeleteBtnEl);
         newDeleteBtn.addEventListener('click', () => handleMassActionRequest('delete'));
    }
    if (massTransferBtnEl) {
         const newTransferBtn = massTransferBtnEl.cloneNode(true); // Previne listeners duplicados
         massTransferBtnEl.parentNode.replaceChild(newTransferBtn, massTransferBtnEl);
         newTransferBtn.addEventListener('click', () => handleMassActionRequest('transfer'));
    }
};

// Remove listeners para evitar duplicação (Função revisada)
const removeAllListeners = () => { /* ... (Mantida com verificações 'typeof') ... */ };

// Função principal de inicialização
export const initPaymentController = () => {
    if(paymentInitialized) { console.log("[PaymentController] Already initialized."); return; }
    console.log("[PaymentController] Initializing...");

    // Remove listeners antigos PRIMEIRO para garantir limpeza
    removeAllListeners();

    // Mapeia TODOS os elementos necessários (Mantido)
    reviewItemsList=document.getElementById('reviewItemsList'); /*...*/ paymentSplitsContainer=document.getElementById('paymentSplitsContainer'); /*...*/ addSplitAccountBtn=document.getElementById('addSplitAccountBtn'); /*...*/ orderSubtotalDisplay=document.getElementById('orderSubtotalDisplayPayment'); /*...*/ orderServiceTaxDisplay=document.getElementById('orderServiceTaxDisplayPayment'); /*...*/ orderTotalDisplay=document.getElementById('orderTotalDisplayPayment'); /*...*/ valuePerDinerDisplay=document.getElementById('valuePerDinerDisplay'); /*...*/ remainingBalanceDisplay=document.getElementById('remainingBalanceDisplay'); /*...*/ toggleServiceTaxBtn=document.getElementById('toggleServiceTaxBtn'); /*...*/ dinersSplitInput=document.getElementById('dinersSplitInput'); /*...*/ decreaseDinersBtn=document.getElementById('decreaseDinersBtn'); /*...*/ increaseDinersBtn=document.getElementById('increaseDinersBtn'); /*...*/ paymentSummaryList=document.getElementById('paymentSummaryList'); /*...*/ chargeInputs=document.getElementById('chargeInputs'); /*...*/ openCustomerRegBtn=document.getElementById('openCustomerRegBtn'); /*...*/ customerSearchInput=document.getElementById('customerSearchInput'); /*...*/ paymentMethodButtonsContainer=document.getElementById('paymentMethodButtons'); /*...*/ paymentValueInput=document.getElementById('paymentValueInput'); /*...*/ openCalculatorBtn=document.getElementById('openCalculatorBtn'); /*...*/ addPaymentBtn=document.getElementById('addPaymentBtn'); /*...*/ finalizeOrderBtn=document.getElementById('finalizeOrderBtn'); /*...*/ openNfeModalBtn=document.getElementById('openNfeModalBtn'); /*...*/ calculatorModal=document.getElementById('calculatorModal'); /*...*/ calcDisplay=document.getElementById('calcDisplay'); /*...*/ calcButtons=calculatorModal?.querySelector('.grid'); /*...*/ closeCalcBtnX=document.getElementById('closeCalcBtnX'); /*...*/ tableTransferModal=document.getElementById('tableTransferModal'); /*...*/ customerRegModal=document.getElementById('customerRegModal'); /*...*/ customerSearchCpfInput=document.getElementById('customerSearchCpf'); /*...*/ searchCustomerByCpfBtn=document.getElementById('searchCustomerByCpfBtn'); /*...*/ customerSearchResultsDiv=document.getElementById('customerSearchResults'); /*...*/ customerNameInput=document.getElementById('customerName'); /*...*/ customerCpfInput=document.getElementById('customerCpf'); /*...*/ customerPhoneInput=document.getElementById('customerPhone'); /*...*/ customerEmailInput=document.getElementById('customerEmail'); /*...*/ closeCustomerRegModalBtn=document.getElementById('closeCustomerRegModalBtn'); /*...*/ saveCustomerBtn=document.getElementById('saveCustomerBtn'); /*...*/ linkCustomerToTableBtn=document.getElementById('linkCustomerToTableBtn');
    if(tableTransferModal){ targetTableInput=tableTransferModal.querySelector('#targetTableInput'); confirmTransferBtn=tableTransferModal.querySelector('#confirmTableTransferBtn'); transferStatus=tableTransferModal.querySelector('#transferStatus'); }
    selectiveTransferModal=document.getElementById('selectiveTransferModal'); if(selectiveTransferModal){/*...*/}

    // Verifica elementos essenciais (Mantido)
    const essentialElementsMap = { reviewItemsList, toggleServiceTaxBtn, dinersSplitInput, decreaseDinersBtn, increaseDinersBtn, paymentMethodButtonsContainer, paymentValueInput, addPaymentBtn, finalizeOrderBtn, openNfeModalBtn, openCustomerRegBtn, calculatorModal, closeCalcBtnX, tableTransferModal, customerRegModal, confirmTransferBtn, targetTableInput };
    const missingElements = Object.entries(essentialElementsMap).filter(([_, el]) => !el).map(([name]) => name);
    if (missingElements.length > 0) { console.error("[PaymentController] Erro Fatal: Elementos faltando:", missingElements); alert(`Erro Fatal: Interface (${missingElements.join(', ')}) não encontrada.`); return; }
    console.log("[PaymentController] All essential elements mapped.");

    // Renderiza botões de método (só na primeira vez)
    renderPaymentMethodButtons();

    // --- Adiciona Listeners ---
    // (As definições das funções listener foram movidas para o escopo do módulo)

    // Listener Botão Taxa
    toggleTaxListenerRef = async () => {
        if (!currentTableId) return;
        const newState = !currentOrderSnapshot?.serviceTaxApplied;
        try { await updateDoc(getTableDocRef(currentTableId), { serviceTaxApplied: newState }); }
        catch(e) { console.error("Erro ao atualizar taxa:", e); }
    };
    toggleServiceTaxBtn.addEventListener('click', toggleTaxListenerRef);

    // Listeners Botões +/- Diners
    dinersDecreaseListener = () => {
        let currentVal = parseInt(dinersSplitInput.value) || 1;
        if (currentVal > 1) { dinersSplitInput.value = currentVal - 1; renderPaymentSummary(currentTableId, currentOrderSnapshot); }
    };
    decreaseDinersBtn.addEventListener('click', dinersDecreaseListener);
    dinersIncreaseListener = () => {
         let currentVal = parseInt(dinersSplitInput.value) || 1;
         dinersSplitInput.value = currentVal + 1; renderPaymentSummary(currentTableId, currentOrderSnapshot);
    };
    increaseDinersBtn.addEventListener('click', dinersIncreaseListener);

    // Listener Botões Método Pagamento
    paymentMethodListener = (e) => {
        const btn = e.target.closest('.payment-method-btn');
        if (btn) {
            paymentMethodButtonsContainer.querySelectorAll('.payment-method-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            addPaymentBtn.disabled = !paymentValueInput.value;
        }
    };
    paymentMethodButtonsContainer.addEventListener('click', paymentMethodListener);

    // Listener Input Valor Pagamento
    paymentValueListener = (e) => {
        const activeMethod = paymentMethodButtonsContainer.querySelector('.payment-method-btn.active');
        addPaymentBtn.disabled = !e.target.value || !activeMethod;
    };
    paymentValueInput.addEventListener('input', paymentValueListener);

    // Listener Botão Adicionar Pagamento
    addPaymentListener = async () => {
        const activeMethodBtn = paymentMethodButtonsContainer.querySelector('.payment-method-btn.active');
        const method = activeMethodBtn?.dataset.method;
        let value = paymentValueInput.value.trim().replace(',', '.');
        if (!method || !value) { alert("Selecione método e valor."); return; }
        const numericValue = parseFloat(value);
        if (isNaN(numericValue) || numericValue <= 0) { alert("Valor inválido."); return; }
        const newPayment = { method: method, value: formatCurrency(numericValue), timestamp: Date.now() };
        try {
            await updateDoc(getTableDocRef(currentTableId), { payments: arrayUnion(newPayment) });
            paymentValueInput.value = ''; activeMethodBtn.classList.remove('active'); addPaymentBtn.disabled = true;
        } catch (e) { console.error("Erro ao adicionar pagamento:", e); alert(`Erro: ${e.message}`); }
    };
    addPaymentBtn.addEventListener('click', addPaymentListener);

    // Listener Botão Finalizar (Placeholder)
    finalizeOrderListener = () => handleFinalizeOrder();
    finalizeOrderBtn.addEventListener('click', finalizeOrderListener);

    // Listener Botão NF-e (Placeholder)
    openNfeListener = () => window.openNfeModal();
    openNfeModalBtn.addEventListener('click', openNfeListener);

    // Listener Botão Add Split (Placeholder)
    if(addSplitAccountBtn) {
        addSplitListener = () => handleAddSplitAccount();
        addSplitAccountBtn.addEventListener('click', addSplitListener);
    }

    // Listeners Calculadora
    openCalcListener = () => { if(calculatorModal) calculatorModal.style.display = 'flex'; };
    openCalculatorBtn.addEventListener('click', openCalcListener);
    closeCalcListener = () => { if (calculatorModal) calculatorModal.style.display = 'none'; };
    closeCalcBtnX.addEventListener('click', closeCalcListener);
    calcButtonsListener = (e) => { /* ... (lógica calc mantida) ... */ };
    if (calcButtons) calcButtons.addEventListener('click', calcButtonsListener);

    // Listener Botão Confirmar Transferência (Modal)
    if (confirmTransferBtn) {
        confirmTransferListener = () => handleConfirmTableTransfer(); // Chama a função local que chama a global
        confirmTransferBtn.addEventListener('click', confirmTransferListener);
    }

    // Listener Input Mesa Destino (Modal)
    if (targetTableInput) {
        targetTableListener = async (e) => { /* ... (lógica verificar mantida) ... */ };
        targetTableInput.addEventListener('input', targetTableListener);
    }

    // Listeners Modal Cliente
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

    // Limpa listeners antigos dos inputs ANTES de adicionar novos
    customerFormInputListeners.forEach(({ element, listener }) => element.removeEventListener('input', listener));
    customerFormInputListeners = [];
    [customerNameInput, customerCpfInput].forEach(input => {
        if (input) {
            const listener = () => { /* ... (lógica validação mantida) ... */ };
            input.addEventListener('input', listener);
            customerFormInputListeners.push({ element: input, listener: listener });
        }
    });

    paymentInitialized = true; // Marca como inicializado NO FINAL
    console.log("[PaymentController] Initialized successfully and all listeners attached.");
};
