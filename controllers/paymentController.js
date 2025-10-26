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

// --- CORREÇÃO: Botões +/- para Diners ---
let decreaseDinersBtn, increaseDinersBtn; 

// Estado local
let isMassSelectionActive = false;
let paymentInitialized = false;

const PAYMENT_METHODS = ['Dinheiro', 'Pix', 'Crédito', 'Débito', 'Ticket', 'Voucher'];


// --- FUNÇÕES DE CÁLCULO E UTILIDADE ---
const calculateTotal = (subtotal, applyServiceTax) => { /* ... (mantida) ... */ };
const updateText = (id, value) => { /* ... (mantida) ... */ };

// --- FUNÇÕES DE AÇÃO ---
export const executeDeletePayment = async (timestamp) => { /* ... (mantida) ... */ };
export const deletePayment = async (timestamp) => { /* ... (mantida) ... */ };

// --- FUNÇÕES DE RENDERIZAÇÃO ---
const renderReviewItemsList = (orderSnapshot) => { /* ... (mantida) ... */ };
const renderRegisteredPayments = (payments) => { /* ... (mantida) ... */ };

// --- CORREÇÃO: Função renderPaymentSplits agora apenas verifica se o container existe ---
const renderPaymentSplits = (orderSnapshot) => { 
    if(!paymentSplitsContainer) return; // Se o container está escondido ou não existe, não faz nada
    // A lógica de renderização foi removida/comentada pois a seção está escondida
    // paymentSplitsContainer.innerHTML = '<p class="text-sm text-dark-placeholder italic">Divisão desativada.</p>';
};

const renderPaymentMethodButtons = () => { /* ... (mantida) ... */ };

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
    
    // --- CORREÇÃO: Usa o valor do input (que agora é controlado pelos botões) ---
    const diners = parseInt(dinersSplitInput?.value) || 1; // Pega o valor atual do input
    const valuePerDiner = totalPrincipalAccount / diners; 

    // Atualiza a UI
    updateText('orderSubtotalDisplayPayment', formatCurrency(subtotal));
    updateText('orderServiceTaxDisplayPayment', formatCurrency(serviceTax));
    updateText('orderTotalDisplayPayment', formatCurrency(totalPrincipalAccount));
    updateText('valuePerDinerDisplay', formatCurrency(valuePerDiner)); // Atualiza com base no input
    updateText('remainingBalanceDisplay', formatCurrency(remainingBalancePrincipal > 0 ? remainingBalancePrincipal : 0)); 
    
    if (toggleServiceTaxBtn) { /* ... (lógica mantida) ... */ }
    
    // O input dinersSplitInput agora é readonly, não precisa mais desabilitar/habilitar
    // if (dinersSplitInput) dinersSplitInput.readOnly = false; // Linha removida
    
    // Lógica para habilitar Finalizar (considerando splits comentada)
    if (finalizeOrderBtn) {
        // const totalSplitsRemaining = 0; // Ignora splits por enquanto
        const totalRemaining = remainingBalancePrincipal; //+ totalSplitsRemaining;
        const canFinalize = sentItems.length === 0 && totalRemaining <= 0.01; // Simplificado: só finaliza se conta principal zerada e sem itens
        finalizeOrderBtn.disabled = !canFinalize;
        finalizeOrderBtn.classList.toggle('opacity-50', !canFinalize);
        finalizeOrderBtn.classList.toggle('cursor-not-allowed', !canFinalize);
    }

    // Chama as funções de renderização filhas
    renderReviewItemsList(orderSnapshot);
    renderRegisteredPayments(payments); 
    renderPaymentSplits(orderSnapshot); // Chama, mas não fará nada se container escondido
    
    // Atualiza o input principal se houver cliente associado
    if (customerSearchInput && orderSnapshot?.clientName) { /* ... (mantida) ... */ } 
    else if (customerSearchInput) { /* ... (mantida) ... */ }
};


// --- LÓGICAS DE AÇÃO EM MASSA E TRANSFERÊNCIA ---
// window.activateItemSelection = (mode = null) => { /* ... (mantida) ... */ }; 
export const handleMassActionRequest = (action) => { /* ... (mantida) ... */ };
export const handleMassDeleteConfirmed = async () => { /* ... (mantida) ... */ };
export function openTableTransferModal() { /* ... (mantida) ... */ };
export function handleConfirmTableTransfer() { /* ... (mantida) ... */ };


// --- CORREÇÃO: Função handleAddSplitAccount comentada/placeholder ---
// export const handleAddSplitAccount = async () => { /* Lógica removida */ };
const handleAddSplitAccount = () => { alert("Funcionalidade de divisão desativada.")}; // Placeholder simples

// Placeholders para funções globais da divisão (mantidos vazios)
window.removeSplitAccount = (splitId) => { alert("Funcionalidade de divisão desativada.")};
window.openPaymentModalForSplit = (splitId) => { alert("Funcionalidade de divisão desativada.")};
window.openSplitTransferModal = (splitId, mode) => { alert("Funcionalidade de divisão desativada.")};


export const handleFinalizeOrder = () => { alert("Finalizar Conta (DEV)"); };


// --- FUNÇÕES GESTÃO DE CLIENTES (Implementadas) ---
const openCustomerRegModal = () => { /* ... (mantida) ... */ };
const searchCustomer = async () => { /* ... (mantida) ... */ };
const saveCustomer = async () => { /* ... (mantida) ... */ };
const linkCustomerToTable = async () => { /* ... (mantida) ... */ };


// --- INICIALIZAÇÃO DO CONTROLLER ---
const attachReviewListListeners = () => { /* ... (mantida) ... */ };

export const initPaymentController = () => {
    if(paymentInitialized) return;
    console.log("[PaymentController] Inicializando...");

    // Mapeia Elementos Principais e Modais (Mantido e Adicionado)
    reviewItemsList = document.getElementById('reviewItemsList');
    paymentSplitsContainer = document.getElementById('paymentSplitsContainer'); // Mapeia mesmo escondido
    addSplitAccountBtn = document.getElementById('addSplitAccountBtn'); 
    orderSubtotalDisplay = document.getElementById('orderSubtotalDisplayPayment');
    orderServiceTaxDisplay = document.getElementById('orderServiceTaxDisplayPayment');
    orderTotalDisplay = document.getElementById('orderTotalDisplayPayment');
    valuePerDinerDisplay = document.getElementById('valuePerDinerDisplay');
    remainingBalanceDisplay = document.getElementById('remainingBalanceDisplay');
    toggleServiceTaxBtn = document.getElementById('toggleServiceTaxBtn');
    dinersSplitInput = document.getElementById('dinersSplitInput'); // Input
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
    
    // --- CORREÇÃO: Mapeia botões +/- ---
    decreaseDinersBtn = document.getElementById('decreaseDinersBtn');
    increaseDinersBtn = document.getElementById('increaseDinersBtn');

    if (tableTransferModal) { /* ... (mapeamento mantido) ... */ }
    if(selectiveTransferModal) { /* ... (mapeamento mantido) ... */ }

    if (!reviewItemsList) { console.error("[PaymentController] Erro Fatal: 'reviewItemsList' não encontrado."); return; }
    
    renderPaymentMethodButtons(); // Renderiza botões de pagamento

    // Adiciona Listeners Essenciais (Mantidos e Adicionados)
    if(toggleServiceTaxBtn) toggleServiceTaxBtn.addEventListener('click', async () => { /* ... */ });
    
    // --- CORREÇÃO: Listener do input dinersSplitInput removido (agora é readonly) ---
    // if(dinersSplitInput) dinersSplitInput.addEventListener('input', () => renderPaymentSummary(currentTableId, currentOrderSnapshot)); // REMOVIDO
    
    // --- CORREÇÃO: Listeners para botões +/- ---
    if(decreaseDinersBtn && dinersSplitInput) {
        decreaseDinersBtn.addEventListener('click', () => {
            let currentValue = parseInt(dinersSplitInput.value) || 1;
            if (currentValue > 1) {
                dinersSplitInput.value = currentValue - 1;
                renderPaymentSummary(currentTableId, currentOrderSnapshot); // Recalcula
            }
        });
    }
    if(increaseDinersBtn && dinersSplitInput) {
        increaseDinersBtn.addEventListener('click', () => {
             let currentValue = parseInt(dinersSplitInput.value) || 1;
             dinersSplitInput.value = currentValue + 1;
             renderPaymentSummary(currentTableId, currentOrderSnapshot); // Recalcula
        });
    }
    // --- FIM DA CORREÇÃO ---
    
    if(paymentMethodButtonsContainer) paymentMethodButtonsContainer.addEventListener('click', (e) => { /* ... */ });
    if(paymentValueInput) paymentValueInput.addEventListener('input', (e) => { /* ... */ });
    if(addPaymentBtn) addPaymentBtn.addEventListener('click', async () => { /* ... */ });
    if(finalizeOrderBtn) finalizeOrderBtn.addEventListener('click', handleFinalizeOrder); // Placeholder
    if(openNfeModalBtn) openNfeModalBtn.addEventListener('click', window.openNfeModal); // Placeholder global
    
    // --- CORREÇÃO: Listener addSplitAccountBtn agora chama placeholder ---
    if(addSplitAccountBtn) {
        addSplitAccountBtn.addEventListener('click', handleAddSplitAccount); // Chama placeholder
    } else {
         console.warn("[PaymentController] Botão 'addSplitAccountBtn' (divisão) não encontrado ou desativado.");
    }
    // --- FIM DA CORREÇÃO ---

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
