// --- CONTROLLERS/PAYMENTCONTROLLER.JS (Painel 3) ---
import { currentTableId, currentOrderSnapshot } from "/app.js";
import { formatCurrency, calculateItemsValue, getNumericValueFromCurrency } from "/utils.js";
import { getTableDocRef, getCustomersCollectionRef, db } from "/services/firebaseService.js";
import {
    updateDoc, arrayUnion, arrayRemove, writeBatch, getFirestore, getDoc, serverTimestamp,
    collection, query, where, getDocs, addDoc, setDoc, doc
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// --- VARIÁVEIS DE ELEMENTOS ---
// (Mantidas)
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

// Referências aos listeners (Mantidas como null inicialmente)
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
let customerFormInputListeners = [];
let toggleTaxListenerRef = null; // Renomeado para evitar conflito

const PAYMENT_METHODS = ['Dinheiro', 'Pix', 'Crédito', 'Débito', 'Ticket', 'Voucher'];

// --- FUNÇÕES DE CÁLCULO E UTILIDADE ---
const calculateTotal = (subtotal, applyServiceTax) => { /* ... */ };
const updateText = (elementId, value) => { /* ... */ };

// --- FUNÇÕES DE AÇÃO ---
export const executeDeletePayment = async (timestamp) => { /* ... */ };
export const deletePayment = async (timestamp) => { /* ... */ };

// --- FUNÇÕES DE RENDERIZAÇÃO ---
const renderReviewItemsList = (orderSnapshot) => { /* ... (Mantida) ... */ };
const renderRegisteredPayments = (payments) => { /* ... (Mantida) ... */ };
const renderPaymentSplits = (orderSnapshot) => { /* ... (Mantida - vazia/comentada) ... */ };
const renderPaymentMethodButtons = () => { /* ... (Mantida) ... */ };
export const renderPaymentSummary = (tableId, orderSnapshot) => { /* ... (Mantida com logs) ... */ };

// --- LÓGICAS DE AÇÃO EM MASSA E TRANSFERÊNCIA ---
window.activateItemSelection = (mode = null) => { /* ... (Mantida) ... */ };
export const handleMassActionRequest = (action) => { /* ... (Mantida com logs) ... */ };
export const handleMassDeleteConfirmed = async () => { /* ... (Mantida com logs e confirmação de fechar) ... */ };
export function openTableTransferModal() { /* ... (Mantida) ... */ };
export function handleConfirmTableTransfer() { /* ... (Mantida) ... */ };

// Placeholders/Funções Desativadas
const handleAddSplitAccount = () => { alert("Divisão desativada.")};
window.removeSplitAccount = (splitId) => { alert("Divisão desativada.")};
window.openPaymentModalForSplit = (splitId) => { alert("Divisão desativada.")};
window.openSplitTransferModal = (splitId, mode) => { alert("Divisão desativada.")};
export const handleFinalizeOrder = () => { alert("Finalizar Conta (DEV)"); };

// --- FUNÇÕES GESTÃO DE CLIENTES ---
const openCustomerRegModal = () => { /* ... */ };
const searchCustomer = async () => { /* ... */ };
const saveCustomer = async () => { /* ... */ };
const linkCustomerToTable = async () => { /* ... */ };

// --- INICIALIZAÇÃO DO CONTROLLER ---
const attachReviewListListeners = () => { /* ... (Mantida) ... */ };

// Função para remover listeners (Mantida, mas não chamada no início de init)
const removeAllListeners = () => {
    console.log("[PaymentController] Attempting to remove existing listeners...");
    const removeListener = (element, event, listenerVar) => { /* ... (lógica mantida) ... */ };

    toggleTaxListenerRef = removeListener(toggleServiceTaxBtn, 'click', toggleTaxListenerRef);
    dinersDecreaseListener = removeListener(decreaseDinersBtn, 'click', dinersDecreaseListener);
    dinersIncreaseListener = removeListener(increaseDinersBtn, 'click', dinersIncreaseListener);
    paymentMethodListener = removeListener(paymentMethodButtonsContainer, 'click', paymentMethodListener);
    paymentValueListener = removeListener(paymentValueInput, 'input', paymentValueListener);
    addPaymentListener = removeListener(addPaymentBtn, 'click', addPaymentListener);
    finalizeOrderListener = removeListener(finalizeOrderBtn, 'click', finalizeOrderListener);
    openNfeListener = removeListener(openNfeModalBtn, 'click', openNfeListener);
    addSplitListener = removeListener(addSplitAccountBtn, 'click', addSplitListener);
    openCalcListener = removeListener(openCalculatorBtn, 'click', openCalcListener);
    closeCalcListener = removeListener(closeCalcBtnX, 'click', closeCalcListener);
    calcButtonsListener = removeListener(calcButtons, 'click', calcButtonsListener);
    confirmTransferListener = removeListener(confirmTransferBtn, 'click', confirmTransferListener);
    targetTableListener = removeListener(targetTableInput, 'input', targetTableListener);
    openCustomerListener = removeListener(openCustomerRegBtn, 'click', openCustomerListener);
    closeCustomerListener = removeListener(closeCustomerRegModalBtn, 'click', closeCustomerListener);
    searchCustomerListener = removeListener(searchCustomerByCpfBtn, 'click', searchCustomerListener);
    saveCustomerListener = removeListener(saveCustomerBtn, 'click', saveCustomerListener);
    linkCustomerListener = removeListener(linkCustomerToTableBtn, 'click', linkCustomerListener);

    customerFormInputListeners.forEach(({ element, listener }) => {
        if(element && typeof listener === 'function') element.removeEventListener('input', listener);
    });
    customerFormInputListeners = [];
    console.log("[PaymentController] Finished removing listeners.");
};


export const initPaymentController = () => {
    if(paymentInitialized) {
        console.log("[PaymentController] Already initialized. Skipping.");
        return;
    }
    console.log("[PaymentController] Initializing...");

    // --- CORREÇÃO: Chamada removida daqui ---
    // removeAllListeners();
    // --- FIM DA CORREÇÃO ---


    // Mapeia Elementos Principais e Modais (Mantido)
    reviewItemsList=document.getElementById('reviewItemsList'); /*...*/ paymentSplitsContainer=document.getElementById('paymentSplitsContainer'); /*...*/ addSplitAccountBtn=document.getElementById('addSplitAccountBtn'); /*...*/ orderSubtotalDisplay=document.getElementById('orderSubtotalDisplayPayment'); /*...*/ orderServiceTaxDisplay=document.getElementById('orderServiceTaxDisplayPayment'); /*...*/ orderTotalDisplay=document.getElementById('orderTotalDisplayPayment'); /*...*/ valuePerDinerDisplay=document.getElementById('valuePerDinerDisplay'); /*...*/ remainingBalanceDisplay=document.getElementById('remainingBalanceDisplay'); /*...*/ toggleServiceTaxBtn=document.getElementById('toggleServiceTaxBtn'); /*...*/ dinersSplitInput=document.getElementById('dinersSplitInput'); /*...*/ decreaseDinersBtn=document.getElementById('decreaseDinersBtn'); /*...*/ increaseDinersBtn=document.getElementById('increaseDinersBtn'); /*...*/ paymentSummaryList=document.getElementById('paymentSummaryList'); /*...*/ chargeInputs=document.getElementById('chargeInputs'); /*...*/ openCustomerRegBtn=document.getElementById('openCustomerRegBtn'); /*...*/ customerSearchInput=document.getElementById('customerSearchInput'); /*...*/ paymentMethodButtonsContainer=document.getElementById('paymentMethodButtons'); /*...*/ paymentValueInput=document.getElementById('paymentValueInput'); /*...*/ openCalculatorBtn=document.getElementById('openCalculatorBtn'); /*...*/ addPaymentBtn=document.getElementById('addPaymentBtn'); /*...*/ finalizeOrderBtn=document.getElementById('finalizeOrderBtn'); /*...*/ openNfeModalBtn=document.getElementById('openNfeModalBtn'); /*...*/ calculatorModal=document.getElementById('calculatorModal'); /*...*/ calcDisplay=document.getElementById('calcDisplay'); /*...*/ calcButtons=calculatorModal?.querySelector('.grid'); /*...*/ closeCalcBtnX=document.getElementById('closeCalcBtnX'); /*...*/ tableTransferModal=document.getElementById('tableTransferModal'); /*...*/ customerRegModal=document.getElementById('customerRegModal'); /*...*/ customerSearchCpfInput=document.getElementById('customerSearchCpf'); /*...*/ searchCustomerByCpfBtn=document.getElementById('searchCustomerByCpfBtn'); /*...*/ customerSearchResultsDiv=document.getElementById('customerSearchResults'); /*...*/ customerNameInput=document.getElementById('customerName'); /*...*/ customerCpfInput=document.getElementById('customerCpf'); /*...*/ customerPhoneInput=document.getElementById('customerPhone'); /*...*/ customerEmailInput=document.getElementById('customerEmail'); /*...*/ closeCustomerRegModalBtn=document.getElementById('closeCustomerRegModalBtn'); /*...*/ saveCustomerBtn=document.getElementById('saveCustomerBtn'); /*...*/ linkCustomerToTableBtn=document.getElementById('linkCustomerToTableBtn');
    if(tableTransferModal){ targetTableInput=tableTransferModal.querySelector('#targetTableInput'); confirmTransferBtn=tableTransferModal.querySelector('#confirmTableTransferBtn'); transferStatus=tableTransferModal.querySelector('#transferStatus'); }
    selectiveTransferModal=document.getElementById('selectiveTransferModal'); if(selectiveTransferModal){/*...*/}

    // Verifica elementos essenciais (Mantido)
    const essentialElementsMap = { reviewItemsList, toggleServiceTaxBtn, dinersSplitInput, decreaseDinersBtn, increaseDinersBtn, paymentMethodButtonsContainer, paymentValueInput, addPaymentBtn, finalizeOrderBtn, openNfeModalBtn, openCustomerRegBtn, calculatorModal, closeCalcBtnX, tableTransferModal, customerRegModal, confirmTransferBtn, targetTableInput };
    const missingElements = Object.entries(essentialElementsMap).filter(([_, el]) => !el).map(([name]) => name);
    if (missingElements.length > 0) { console.error("[PaymentController] Erro Fatal: Elementos faltando:", missingElements); alert(`Erro Fatal: Interface (${missingElements.join(', ')}) não encontrada.`); return; }
    console.log("[PaymentController] All essential elements mapped.");

    // Renderiza botões de método
    renderPaymentMethodButtons();
    console.log("[PaymentController] Payment method buttons rendered.");

    // --- Adiciona Listeners ---
    // (As definições das funções listener foram movidas para o escopo do módulo)

    // Listener Botão Taxa
    toggleTaxListenerRef = async () => { /* ... (lógica mantida) ... */ };
    toggleServiceTaxBtn.addEventListener('click', toggleTaxListenerRef);

    // Listeners Botões +/- Diners
    dinersDecreaseListener = () => { /* ... (lógica mantida) ... */ };
    decreaseDinersBtn.addEventListener('click', dinersDecreaseListener);
    dinersIncreaseListener = () => { /* ... (lógica mantida) ... */ };
    increaseDinersBtn.addEventListener('click', dinersIncreaseListener);

    // Listener Botões Método Pagamento
    paymentMethodListener = (e) => { /* ... (lógica mantida) ... */ };
    paymentMethodButtonsContainer.addEventListener('click', paymentMethodListener);

    // Listener Input Valor Pagamento
    paymentValueListener = (e) => { /* ... (lógica mantida) ... */ };
    paymentValueInput.addEventListener('input', paymentValueListener);

    // Listener Botão Adicionar Pagamento
    addPaymentListener = async () => { /* ... (lógica mantida) ... */ };
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
        // Remove listener antigo ANTES de adicionar novo para garantir
        const newConfirmBtn = confirmTransferBtn.cloneNode(true);
        confirmTransferBtn.parentNode.replaceChild(newConfirmBtn, confirmTransferBtn);
        confirmTransferBtn = newConfirmBtn; // Atualiza referência

        confirmTransferListener = () => handleConfirmTableTransfer();
        confirmTransferBtn.addEventListener('click', confirmTransferListener);
        console.log("[PaymentController] Listener attached to confirmTransferBtn.");
    } else {
         console.error("[PaymentController] CRITICAL: confirmTransferBtn not found even after mapping!");
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
