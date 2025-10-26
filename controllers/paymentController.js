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

// Referências aos listeners para remoção
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
let toggleTaxListenerRef = null; // Renomeado para evitar conflito com elemento

const PAYMENT_METHODS = ['Dinheiro', 'Pix', 'Crédito', 'Débito', 'Ticket', 'Voucher'];

// --- FUNÇÕES DE CÁLCULO E UTILIDADE ---
const calculateTotal = (subtotal, applyServiceTax) => { /* ... (mantida) ... */ };
const updateText = (elementId, value) => { /* ... (mantida) ... */ };

// --- FUNÇÕES DE AÇÃO ---
export const executeDeletePayment = async (timestamp) => { /* ... (mantida) ... */ };
export const deletePayment = async (timestamp) => { /* ... (mantida) ... */ };

// --- FUNÇÕES DE RENDERIZAÇÃO ---
const renderReviewItemsList = (orderSnapshot) => { /* ... (mantida) ... */ };
const renderRegisteredPayments = (payments) => { /* ... (mantida) ... */ };
const renderPaymentSplits = (orderSnapshot) => { /* ... (mantida - vazia/comentada) ... */ };
const renderPaymentMethodButtons = () => { /* ... (mantida) ... */ };
export const renderPaymentSummary = (tableId, orderSnapshot) => { /* ... (mantida com logs) ... */
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

    console.log(`[renderPaymentSummary] Calculations: Subtotal=${subtotal}, ServiceTax=${serviceTax}, TotalPrincipal=${totalPrincipalAccount}, Paid=${totalPaidPrincipal}, Remaining=${remainingBalancePrincipal}, Diners=${diners}, ValuePerDiner=${valuePerDiner}`);

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
    renderReviewItemsList(orderSnapshot);
    renderRegisteredPayments(payments);
    renderPaymentSplits(orderSnapshot);
    if (customerSearchInput && orderSnapshot?.clientName) { /* ... */ }
    else if (customerSearchInput) { /* ... */ }
     // console.log("[renderPaymentSummary] Finished."); // Debug
};


// --- LÓGICAS DE AÇÃO EM MASSA E TRANSFERÊNCIA ---
window.activateItemSelection = (mode = null) => { /* ... (mantida) ... */ };
export const handleMassActionRequest = (action) => { /* ... (mantida) ... */ };
export const handleMassDeleteConfirmed = async () => { /* ... (mantida com logs e correção na navegação) ... */ };
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
const attachReviewListListeners = () => { /* ... (mantida) ... */ };

// ==============================================
//     FUNÇÃO ATUALIZADA: removeAllListeners
// ==============================================
// Remove todos os listeners anexados por esta instância do controller
const removeAllListeners = () => {
    // Verifica se a variável do listener existe E se é uma função antes de tentar remover
    if (toggleServiceTaxBtn && typeof toggleTaxListenerRef === 'function') toggleServiceTaxBtn.removeEventListener('click', toggleTaxListenerRef);
    if (decreaseDinersBtn && typeof dinersDecreaseListener === 'function') decreaseDinersBtn.removeEventListener('click', dinersDecreaseListener);
    if (increaseDinersBtn && typeof dinersIncreaseListener === 'function') increaseDinersBtn.removeEventListener('click', dinersIncreaseListener);
    if (paymentMethodButtonsContainer && typeof paymentMethodListener === 'function') paymentMethodButtonsContainer.removeEventListener('click', paymentMethodListener);
    if (paymentValueInput && typeof paymentValueListener === 'function') paymentValueInput.removeEventListener('input', paymentValueListener);
    if (addPaymentBtn && typeof addPaymentListener === 'function') addPaymentBtn.removeEventListener('click', addPaymentListener);
    if (finalizeOrderBtn && typeof finalizeOrderListener === 'function') finalizeOrderBtn.removeEventListener('click', finalizeOrderListener);
    if (openNfeModalBtn && typeof openNfeListener === 'function') openNfeModalBtn.removeEventListener('click', openNfeListener);
    if (addSplitAccountBtn && typeof addSplitListener === 'function') addSplitAccountBtn.removeEventListener('click', addSplitListener);
    if (openCalculatorBtn && typeof openCalcListener === 'function') openCalculatorBtn.removeEventListener('click', openCalcListener);
    if (closeCalcBtnX && typeof closeCalcListener === 'function') closeCalcBtnX.removeEventListener('click', closeCalcListener);
    if (calcButtons && typeof calcButtonsListener === 'function') calcButtons.removeEventListener('click', calcButtonsListener);
    if (confirmTransferBtn && typeof confirmTransferListener === 'function') confirmTransferBtn.removeEventListener('click', confirmTransferListener);
    if (targetTableInput && typeof targetTableListener === 'function') targetTableInput.removeEventListener('input', targetTableListener);
    if (openCustomerRegBtn && typeof openCustomerListener === 'function') openCustomerRegBtn.removeEventListener('click', openCustomerListener);
    if (closeCustomerRegModalBtn && typeof closeCustomerListener === 'function') closeCustomerRegModalBtn.removeEventListener('click', closeCustomerListener);
    if (searchCustomerByCpfBtn && typeof searchCustomerListener === 'function') searchCustomerByCpfBtn.removeEventListener('click', searchCustomerListener);
    if (saveCustomerBtn && typeof saveCustomerListener === 'function') saveCustomerBtn.removeEventListener('click', saveCustomerListener);
    if (linkCustomerToTableBtn && typeof linkCustomerListener === 'function') linkCustomerToTableBtn.removeEventListener('click', linkCustomerListener);
    customerFormInputListeners.forEach(({ element, listener }) => {
        if(element && typeof listener === 'function') element.removeEventListener('input', listener);
    });
    customerFormInputListeners = []; // Limpa o array após remover
    console.log("[PaymentController] Existing listeners removed (if any)."); // Debug
};
// ==============================================
//           FIM DA FUNÇÃO ATUALIZADA
// ==============================================


export const initPaymentController = () => {
    // Remove listeners antigos ANTES de verificar 'paymentInitialized'
    // Isso garante limpeza mesmo se a flag falhar por algum motivo
    // removeAllListeners(); // MOVIDO para DENTRO da verificação

    if(paymentInitialized) {
        console.log("[PaymentController] Already initialized. Skipping extensive setup.");
        // Se já inicializado, talvez só precise re-renderizar algo? Ou confiar no listener?
        // Por segurança, vamos apenas sair. O listener do app.js deve chamar renderPaymentSummary.
        return;
    }
    console.log("[PaymentController] Initializing...");

    // Remove listeners antigos AGORA, apenas na primeira inicialização real
    removeAllListeners();


    // Mapeia Elementos Principais e Modais (Mantido)
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

    // Mapeia elementos de transferência DENTRO da verificação do modal
    if (tableTransferModal) {
        targetTableInput = tableTransferModal.querySelector('#targetTableInput');
        confirmTransferBtn = tableTransferModal.querySelector('#confirmTableTransferBtn'); // Mapeia aqui
        transferStatus = tableTransferModal.querySelector('#transferStatus');
    }
    selectiveTransferModal = document.getElementById('selectiveTransferModal');
    if(selectiveTransferModal) { /* ... */ }

    // Verifica elementos essenciais
    const essentialElements = [reviewItemsList, toggleServiceTaxBtn, dinersSplitInput, decreaseDinersBtn, increaseDinersBtn, paymentMethodButtonsContainer, paymentValueInput, addPaymentBtn, finalizeOrderBtn, openNfeModalBtn, openCustomerRegBtn, calculatorModal, closeCalcBtnX, tableTransferModal, customerRegModal];
    if (essentialElements.some(el => !el)) {
        const missing = ['reviewItemsList', 'toggleServiceTaxBtn', 'dinersSplitInput', 'decreaseDinersBtn', 'increaseDinersBtn', 'paymentMethodButtonsContainer', 'paymentValueInput', 'addPaymentBtn', 'finalizeOrderBtn', 'openNfeModalBtn', 'openCustomerRegBtn', 'calculatorModal', 'closeCalcBtnX', 'tableTransferModal', 'customerRegModal']
            .filter((id, index) => !essentialElements[index]);
        console.error("[PaymentController] Erro Fatal: Elementos faltando:", missing, ". Abortando inicialização.");
        return; // Não continua se elementos cruciais faltarem
    }

    // Renderiza botões de pagamento (só precisa rodar uma vez na inicialização)
    renderPaymentMethodButtons();
    console.log("[PaymentController] Payment method buttons rendered.");

    // --- Adiciona Listeners ---
    // (As definições das funções listener foram movidas para o escopo global do módulo)

    toggleTaxListenerRef = async () => { /* ... (lógica mantida) ... */ };
    toggleServiceTaxBtn.addEventListener('click', toggleTaxListenerRef);

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
    } else {
        console.warn("[PaymentController] Botão 'confirmTableTransferBtn' não encontrado no modal de transferência durante init.");
    }


    if (targetTableInput) {
        targetTableListener = async (e) => { /* ... (lógica de verificar mesa destino mantida) ... */ };
        targetTableInput.addEventListener('input', targetTableListener);
    } else {
         console.warn("[PaymentController] Input 'targetTableInput' não encontrado no modal de transferência durante init.");
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

    // Limpa listeners antigos dos inputs ANTES de adicionar novos
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
