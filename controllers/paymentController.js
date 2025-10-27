// --- CONTROLLERS/PAYMENTCONTROLLER.JS (Painel 3) ---
import { currentTableId, currentOrderSnapshot } from "/app.js";
// --- CORREÇÃO: Importa updateText de utils ---
import { formatCurrency, calculateItemsValue, getNumericValueFromCurrency, updateText } from "/utils.js";
import { getTableDocRef, getCustomersCollectionRef, db } from "/services/firebaseService.js";
import {
    updateDoc, arrayUnion, arrayRemove, writeBatch, getFirestore, getDoc, serverTimestamp,
    collection, query, where, getDocs, addDoc, setDoc, doc
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// --- VARIÁVEIS DE ELEMENTOS (Declaradas no escopo do módulo) ---
// ... (Declarações mantidas como antes) ...
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

// Referências aos listeners (Declaradas como null)
let listenersAttached = {}; // Usaremos este objeto para gerenciar listeners

const PAYMENT_METHODS = ['Dinheiro', 'Pix', 'Crédito', 'Débito', 'Ticket', 'Voucher'];

// --- FUNÇÕES DE CÁLCULO E UTILIDADE ---
// Nenhuma mudança aqui, cálculo de total é direto no render. updateText vem de utils.

// --- FUNÇÕES DE AÇÃO ---
export const executeDeletePayment = async (timestamp) => { /* ... (Mantida) ... */ };
export const deletePayment = async (timestamp) => { /* ... (Mantida) ... */ };

// --- FUNÇÕES DE RENDERIZAÇÃO ---
// Desenha a lista de itens enviados (com checkboxes e barra de ação) - MANTIDA
const renderReviewItemsList = (orderSnapshot) => { /* ... (Mantida como na última versão funcional) ... */ };
// Desenha a lista de pagamentos registrados - MANTIDA
const renderRegisteredPayments = (payments) => { /* ... (Mantida como na última versão funcional) ... */ };
// Renderiza a seção de divisão (vazia/escondida) - MANTIDA
const renderPaymentSplits = (orderSnapshot) => { /* ... */ };
// Renderiza os botões de método de pagamento - MANTIDA
const renderPaymentMethodButtons = () => { /* ... */ };

// Função principal que calcula e atualiza toda a tela de pagamento - MANTIDA (USA updateText importado)
export const renderPaymentSummary = (tableId, orderSnapshot) => {
    // console.log("[renderPaymentSummary] Rendering..."); // Habilitar para debug
    if (!orderSnapshot || !paymentInitialized) return;

    const payments = orderSnapshot.payments || [];
    const sentItems = orderSnapshot.sentItems || [];
    const subtotal = calculateItemsValue(sentItems); // Usa calculateItemsValue
    const applyServiceTax = orderSnapshot.serviceTaxApplied ?? true;
    const serviceTax = applyServiceTax ? subtotal * 0.10 : 0;
    const totalPrincipalAccount = subtotal + serviceTax;
    const totalPaidPrincipal = payments.reduce((sum, p) => sum + getNumericValueFromCurrency(p.value), 0);
    const remainingBalancePrincipal = totalPrincipalAccount - totalPaidPrincipal;
    const diners = parseInt(dinersSplitInput?.value) || 1;
    const valuePerDiner = totalPrincipalAccount > 0 ? totalPrincipalAccount / diners : 0;

    // Log para verificar cálculos
    // console.log(`[renderPaymentSummary] Calculations: Subtotal=${subtotal}, Tax=${serviceTax}, Total=${totalPrincipalAccount}, Paid=${totalPaidPrincipal}, Remaining=${remainingBalancePrincipal}, Diners=${diners}, Val/Diner=${valuePerDiner}`);

    // Atualiza a UI usando a função updateText importada
    updateText('orderSubtotalDisplayPayment', formatCurrency(subtotal));
    updateText('orderServiceTaxDisplayPayment', formatCurrency(serviceTax));
    updateText('orderTotalDisplayPayment', formatCurrency(totalPrincipalAccount));
    updateText('valuePerDinerDisplay', formatCurrency(valuePerDiner));
    updateText('remainingBalanceDisplay', formatCurrency(remainingBalancePrincipal > 0 ? remainingBalancePrincipal : 0));

    // Atualiza estado do botão de taxa (Mantido)
    if (toggleServiceTaxBtn) { /* ... */ }

    // Atualiza estado do botão Finalizar (Mantido)
    if (finalizeOrderBtn) { /* ... */ }

    // Renderiza as listas (Mantido)
    renderReviewItemsList(orderSnapshot);
    renderRegisteredPayments(payments);
    renderPaymentSplits(orderSnapshot);

    // Atualiza input/status do cliente (Mantido)
    if (customerSearchInput) { /* ... */ }
};


// --- LÓGICAS DE AÇÃO EM MASSA E TRANSFERÊNCIA ---
// Função global para lidar com cliques nos checkboxes - MANTIDA
window.activateItemSelection = (mode = null) => { /* ... (Mantida como na última versão funcional) ... */ };

// Chamada quando os botões Lixeira ou Transferir (da barra de ação) são clicados - MANTIDA
export const handleMassActionRequest = (action) => { /* ... (Mantida como na última versão funcional) ... */ };

// --- CORREÇÃO: Garante que commit e navegação ocorram ---
// Executa a exclusão em massa após autenticação
export const handleMassDeleteConfirmed = async () => {
    console.log("[Payment] handleMassDeleteConfirmed initiated.");
    if (!window.itemsToTransfer || window.itemsToTransfer.length === 0) { alert("Nenhum item selecionado para exclusão."); return; }

    const itemsToDelete = window.itemsToTransfer;
    const tableRef = getTableDocRef(currentTableId);
    const currentSentItems = currentOrderSnapshot?.sentItems || [];
    let allItemsWillBeDeleted = false;
    if (currentSentItems.length > 0 && currentSentItems.length === itemsToDelete.length) { /* ... (comparação) ... */ }

    let closeTableConfirmed = false;
    if (allItemsWillBeDeleted) { closeTableConfirmed = confirm("Todos os itens serão removidos. Deseja FECHAR a mesa?"); }

    const valueToDecrease = itemsToDelete.reduce((sum, item) => sum + (item.price || 0), 0);
    const currentTotal = currentOrderSnapshot?.total || 0;
    const newTotal = Math.max(0, currentTotal - valueToDecrease);

    const dbInstance = getFirestore();
    const batch = writeBatch(dbInstance);
    itemsToDelete.forEach(item => { batch.update(tableRef, { sentItems: arrayRemove(item) }); });
    batch.update(tableRef, { total: newTotal });
    if (closeTableConfirmed) { batch.update(tableRef, { status: 'closed' }); }

    try {
        console.log("[Payment] Committing delete batch...");
        await batch.commit(); // <<< COMMIT
        console.log("[Payment] Delete batch committed successfully.");
        alert(`${itemsToDelete.length} item(s) removidos.${closeTableConfirmed ? ' A mesa foi fechada.' : ''}`);
        window.itemsToTransfer = [];

        // --- NAVEGAÇÃO APÓS COMMIT (se necessário) ---
        // Se a mesa foi fechada, o listener do app.js deve detectar e navegar.
        // Não precisamos chamar goToScreen aqui explicitamente para fechamento.
        // Se *não* fechou, apenas a UI da mesa atual será atualizada pelo listener.

    } catch (e) {
        console.error("Erro CRÍTICO ao excluir itens:", e);
        alert(`Falha CRÍTICA ao remover: ${e.message}.`);
    }
};

// Abre o modal de transferência - MANTIDA
export function openTableTransferModal() { /* ... */ };
// Confirma transferência (chama app.js) - MANTIDA
export function handleConfirmTableTransfer() { /* ... */ };


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
// Anexa listeners à barra de ação (Excluir/Transferir) - MANTIDA
const attachReviewListListeners = () => { /* ... */ };

// Remove listeners para evitar duplicação - MANTIDA
const removeAllListeners = () => { /* ... */ };

// ==============================================
//     FUNÇÃO ATUALIZADA: initPaymentController (com todos os listeners)
// ==============================================
export const initPaymentController = () => {
    if(paymentInitialized) { console.log("[PaymentController] Already initialized."); return; }
    console.log("[PaymentController] Initializing...");

    // Remove listeners antigos PRIMEIRO
    removeAllListeners();

    // Mapeia TODOS os elementos necessários (Mantido)
    // ... (Mapeamento completo como na versão anterior) ...
    reviewItemsList=document.getElementById('reviewItemsList'); paymentSplitsContainer=document.getElementById('paymentSplitsContainer'); addSplitAccountBtn=document.getElementById('addSplitAccountBtn'); orderSubtotalDisplay=document.getElementById('orderSubtotalDisplayPayment'); orderServiceTaxDisplay=document.getElementById('orderServiceTaxDisplayPayment'); orderTotalDisplay=document.getElementById('orderTotalDisplayPayment'); valuePerDinerDisplay=document.getElementById('valuePerDinerDisplay'); remainingBalanceDisplay=document.getElementById('remainingBalanceDisplay'); toggleServiceTaxBtn=document.getElementById('toggleServiceTaxBtn'); dinersSplitInput=document.getElementById('dinersSplitInput'); decreaseDinersBtn=document.getElementById('decreaseDinersBtn'); increaseDinersBtn=document.getElementById('increaseDinersBtn'); paymentSummaryList=document.getElementById('paymentSummaryList'); chargeInputs=document.getElementById('chargeInputs'); openCustomerRegBtn=document.getElementById('openCustomerRegBtn'); customerSearchInput=document.getElementById('customerSearchInput'); paymentMethodButtonsContainer=document.getElementById('paymentMethodButtons'); paymentValueInput=document.getElementById('paymentValueInput'); openCalculatorBtn=document.getElementById('openCalculatorBtn'); addPaymentBtn=document.getElementById('addPaymentBtn'); finalizeOrderBtn=document.getElementById('finalizeOrderBtn'); openNfeModalBtn=document.getElementById('openNfeModalBtn'); calculatorModal=document.getElementById('calculatorModal'); calcDisplay=document.getElementById('calcDisplay'); calcButtons=calculatorModal?.querySelector('.grid'); closeCalcBtnX=document.getElementById('closeCalcBtnX'); tableTransferModal=document.getElementById('tableTransferModal'); customerRegModal=document.getElementById('customerRegModal'); customerSearchCpfInput=document.getElementById('customerSearchCpf'); searchCustomerByCpfBtn=document.getElementById('searchCustomerByCpfBtn'); customerSearchResultsDiv=document.getElementById('customerSearchResults'); customerNameInput=document.getElementById('customerName'); customerCpfInput=document.getElementById('customerCpf'); customerPhoneInput=document.getElementById('customerPhone'); customerEmailInput=document.getElementById('customerEmail'); closeCustomerRegModalBtn=document.getElementById('closeCustomerRegModalBtn'); saveCustomerBtn=document.getElementById('saveCustomerBtn'); linkCustomerToTableBtn=document.getElementById('linkCustomerToTableBtn');
    if(tableTransferModal){ targetTableInput=tableTransferModal.querySelector('#targetTableInput'); confirmTransferBtn=tableTransferModal.querySelector('#confirmTableTransferBtn'); transferStatus=tableTransferModal.querySelector('#transferStatus'); }
    selectiveTransferModal=document.getElementById('selectiveTransferModal'); if(selectiveTransferModal){/*...*/}


    // Verifica elementos essenciais (Mantido)
    const essentialElementsMap = { reviewItemsList, toggleServiceTaxBtn, dinersSplitInput, decreaseDinersBtn, increaseDinersBtn, paymentMethodButtonsContainer, paymentValueInput, addPaymentBtn, finalizeOrderBtn, openNfeModalBtn, openCustomerRegBtn, calculatorModal, closeCalcBtnX, tableTransferModal, customerRegModal, confirmTransferBtn, targetTableInput };
    const missingElements = Object.entries(essentialElementsMap).filter(([_, el]) => !el).map(([name]) => name);
    if (missingElements.length > 0) { console.error("[PaymentController] Erro Fatal: Elementos faltando:", missingElements); return; }
    console.log("[PaymentController] All essential elements mapped.");

    // Renderiza botões de método
    renderPaymentMethodButtons();

    // --- Adiciona Listeners --- (Revisado para garantir que todos estão aqui)

    // Listener Botão Taxa
    listenersAttached.toggleTax = async () => {
        if (!currentTableId) return;
        const newState = !currentOrderSnapshot?.serviceTaxApplied;
        try { await updateDoc(getTableDocRef(currentTableId), { serviceTaxApplied: newState }); }
        catch(e) { console.error("Erro ao atualizar taxa:", e); }
    };
    toggleServiceTaxBtn.addEventListener('click', listenersAttached.toggleTax);

    // Listeners Botões +/- Diners
    listenersAttached.dinersDecrease = () => {
        let currentVal = parseInt(dinersSplitInput.value) || 1;
        if (currentVal > 1) { dinersSplitInput.value = currentVal - 1; renderPaymentSummary(currentTableId, currentOrderSnapshot); }
    };
    decreaseDinersBtn.addEventListener('click', listenersAttached.dinersDecrease);
    listenersAttached.dinersIncrease = () => {
         let currentVal = parseInt(dinersSplitInput.value) || 1;
         dinersSplitInput.value = currentVal + 1; renderPaymentSummary(currentTableId, currentOrderSnapshot);
    };
    increaseDinersBtn.addEventListener('click', listenersAttached.dinersIncrease);

    // Listener Botões Método Pagamento (Delegação)
    listenersAttached.paymentMethod = (e) => {
        const btn = e.target.closest('.payment-method-btn');
        if (btn) {
            paymentMethodButtonsContainer.querySelectorAll('.payment-method-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            addPaymentBtn.disabled = !paymentValueInput.value; // Habilita/desabilita Adicionar
        }
    };
    paymentMethodButtonsContainer.addEventListener('click', listenersAttached.paymentMethod);

    // Listener Input Valor Pagamento
    listenersAttached.paymentValue = (e) => {
        const activeMethod = paymentMethodButtonsContainer.querySelector('.payment-method-btn.active');
        addPaymentBtn.disabled = !e.target.value || !activeMethod; // Habilita/desabilita Adicionar
    };
    paymentValueInput.addEventListener('input', listenersAttached.paymentValue);

    // Listener Botão Adicionar Pagamento
    listenersAttached.addPayment = async () => {
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
            // O listener do app.js chamará renderPaymentSummary
        } catch (e) { console.error("Erro ao adicionar pagamento:", e); alert(`Erro: ${e.message}`); }
    };
    addPaymentBtn.addEventListener('click', listenersAttached.addPayment);

    // Listener Botão Finalizar (Placeholder)
    listenersAttached.finalizeOrder = () => handleFinalizeOrder();
    finalizeOrderBtn.addEventListener('click', listenersAttached.finalizeOrder);

    // Listener Botão NF-e (Placeholder)
    listenersAttached.openNfe = () => window.openNfeModal(); // Chama global
    openNfeModalBtn.addEventListener('click', listenersAttached.openNfe);

    // Listener Botão Add Split (Placeholder)
    if(addSplitAccountBtn) {
        listenersAttached.addSplit = () => handleAddSplitAccount();
        addSplitAccountBtn.addEventListener('click', listenersAttached.addSplit);
    }

    // Listeners Calculadora
    listenersAttached.openCalc = () => { if(calculatorModal) calculatorModal.style.display = 'flex'; };
    openCalculatorBtn.addEventListener('click', listenersAttached.openCalc);
    listenersAttached.closeCalc = () => { if (calculatorModal) calculatorModal.style.display = 'none'; };
    closeCalcBtnX.addEventListener('click', listenersAttached.closeCalc);
    listenersAttached.calcButtons = (e) => { /* ... (lógica calc mantida) ... */ };
    if (calcButtons) calcButtons.addEventListener('click', listenersAttached.calcButtons);

    // Listener Botão Confirmar Transferência (Modal)
    if (confirmTransferBtn) {
        listenersAttached.confirmTransfer = () => handleConfirmTableTransfer(); // Chama a função local
        confirmTransferBtn.addEventListener('click', listenersAttached.confirmTransfer);
    }

    // Listener Input Mesa Destino (Modal)
    if (targetTableInput) {
        listenersAttached.targetTable = async (e) => { /* ... (lógica verificar mantida) ... */ };
        targetTableInput.addEventListener('input', listenersAttached.targetTable);
    }

    // Listeners Modal Cliente
    listenersAttached.openCustomer = () => openCustomerRegModal();
    openCustomerRegBtn.addEventListener('click', listenersAttached.openCustomer);
    listenersAttached.closeCustomer = () => { if(customerRegModal) customerRegModal.style.display = 'none'; };
    closeCustomerRegModalBtn.addEventListener('click', listenersAttached.closeCustomer);
    listenersAttached.searchCustomer = () => searchCustomer();
    searchCustomerByCpfBtn.addEventListener('click', listenersAttached.searchCustomer);
    listenersAttached.saveCustomer = () => saveCustomer();
    saveCustomerBtn.addEventListener('click', listenersAttached.saveCustomer);
    listenersAttached.linkCustomer = () => linkCustomerToTable();
    linkCustomerToTableBtn.addEventListener('click', listenersAttached.linkCustomer);

    // Listeners inputs form cliente (para habilitar salvar)
    customerFormInputListeners = []; // Limpa array antes
    [customerNameInput, customerCpfInput].forEach(input => {
        if (input) {
            const listener = () => { /* ... (lógica validação mantida) ... */ };
            input.addEventListener('input', listener);
            customerFormInputListeners.push({ element: input, listener: listener }); // Guarda referência
        }
    });

    paymentInitialized = true; // Marca como inicializado NO FINAL
    console.log("[PaymentController] Initialized successfully and all listeners attached.");
};
