// --- CONTROLLERS/PAYMENTCONTROLLER.JS (Painel 3) ---
import { currentTableId, currentOrderSnapshot } from "/app.js";
import { formatCurrency, calculateItemsValue, getNumericValueFromCurrency } from "/utils.js";
import { getTableDocRef, getCustomersCollectionRef, db } from "/services/firebaseService.js"; // Importa db e collection ref
import { 
    updateDoc, arrayUnion, arrayRemove, writeBatch, getFirestore, getDoc, serverTimestamp, 
    collection, query, where, getDocs, addDoc, setDoc, doc // Funções Firestore adicionais
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

// --- CORREÇÃO: Variáveis do Modal Cliente ---
let customerRegModal, customerSearchCpfInput, searchCustomerByCpfBtn, customerSearchResultsDiv;
let customerNameInput, customerCpfInput, customerPhoneInput, customerEmailInput;
let closeCustomerRegModalBtn, saveCustomerBtn, linkCustomerToTableBtn;
let currentFoundCustomer = null; // Guarda o cliente encontrado/selecionado

// Estado local
let isMassSelectionActive = false;
let paymentInitialized = false;

const PAYMENT_METHODS = ['Dinheiro', 'Pix', 'Crédito', 'Débito', 'Ticket', 'Voucher'];


// --- FUNÇÕES DE CÁLCULO E UTILIDADE ---
const calculateTotal = (subtotal, applyServiceTax) => { /* ... (mantida) ... */ };
const updateText = (id, value) => { /* ... (mantida) ... */ };
const groupMainAccountItems = (orderSnapshot) => { /* ... (mantida) ... */ };

// --- FUNÇÕES DE AÇÃO ---
export const executeDeletePayment = async (timestamp) => { /* ... (mantida) ... */ };
export const deletePayment = async (timestamp) => { /* ... (mantida) ... */ };

// --- FUNÇÕES DE RENDERIZAÇÃO ---
const renderReviewItemsList = (orderSnapshot) => { /* ... (mantida) ... */ };
const renderRegisteredPayments = (payments) => { /* ... (mantida) ... */ };
const renderPaymentSplits = (orderSnapshot) => { /* ... (mantida) ... */ };
const renderPaymentMethodButtons = () => { /* ... (mantida) ... */ };
export const renderPaymentSummary = (tableId, orderSnapshot) => { /* ... (mantida) ... */ };

// --- LÓGICAS DE AÇÃO EM MASSA E TRANSFERÊNCIA ---
// window.activateItemSelection = (mode = null) => { /* ... (mantida) ... */ }; // Exposto no HTML/JS Global
export const handleMassActionRequest = (action) => { /* ... (mantida) ... */ };
export const handleMassDeleteConfirmed = async () => { /* ... (mantida) ... */ };
export function openTableTransferModal() { /* ... (mantida) ... */ };
export function handleConfirmTableTransfer() { /* ... (mantida) ... */ };

// Placeholders
export const handleAddSplitAccount = async () => { alert("Divisão de conta (DEV)."); };
export const openPaymentModalForSplit = (splitKey) => { alert(`Pagar Conta ${splitKey} (DEV)`); };
export const moveItemsToMainAccount = (splitKey) => { alert(`Desfazer Conta ${splitKey} (DEV)`); };
export const openSplitTransferModal = (targetKey, mode, itemsToTransfer = null) => { alert(`Mover itens para/de ${targetKey} (DEV)`); };
export const handleFinalizeOrder = () => { alert("Finalizar Conta (DEV)"); };

// ==============================================
//     NOVAS FUNÇÕES: GESTÃO DE CLIENTES
// ==============================================

// Abre e Limpa o Modal de Cliente
const openCustomerRegModal = () => {
    if (!customerRegModal) return;
    
    // Limpa campos
    if(customerSearchCpfInput) customerSearchCpfInput.value = '';
    if(customerNameInput) customerNameInput.value = '';
    if(customerCpfInput) customerCpfInput.value = '';
    if(customerPhoneInput) customerPhoneInput.value = '';
    if(customerEmailInput) customerEmailInput.value = '';
    if(customerSearchResultsDiv) customerSearchResultsDiv.innerHTML = '<p class="text-sm text-dark-placeholder italic">Digite um CPF para buscar.</p>';
    
    // Reseta estado
    currentFoundCustomer = null;
    if(saveCustomerBtn) saveCustomerBtn.disabled = true; // Desabilita salvar inicialmente
    if(linkCustomerToTableBtn) linkCustomerToTableBtn.disabled = true; // Desabilita associar inicialmente

    // Habilita/Desabilita campos conforme necessário (Ex: CPF só editável se não achou)
    if(customerCpfInput) customerCpfInput.readOnly = false; 

    customerRegModal.style.display = 'flex';
    if(customerSearchCpfInput) customerSearchCpfInput.focus();
};

// Placeholder para busca (será implementado)
const searchCustomer = async () => {
    alert("Função Buscar Cliente (DEV).");
    // Lógica futura: buscar no Firebase usando customerSearchCpfInput.value
    // Se encontrar: preencher campos, currentFoundCustomer = data, habilitar 'Associar'
    // Se não encontrar: limpar campos (exceto busca), habilitar 'Salvar'
};

// Placeholder para salvar (será implementado)
const saveCustomer = async () => {
     alert("Função Salvar Cliente (DEV).");
    // Lógica futura: pegar dados dos inputs, validar
    // Se currentFoundCustomer existe -> update no Firebase
    // Se não -> add no Firebase
    // Após salvar, currentFoundCustomer = data salva, habilitar 'Associar'
};

// Placeholder para associar (será implementado)
const linkCustomerToTable = async () => {
    if (!currentFoundCustomer || !currentTableId) {
        alert("Nenhum cliente selecionado ou mesa ativa.");
        return;
    }
     alert(`Função Associar Cliente ${currentFoundCustomer.name || currentFoundCustomer.id} à Mesa ${currentTableId} (DEV).`);
    // Lógica futura: update na mesa (Firebase) adicionando customerId e customerName
    // Atualizar UI (talvez mostrar nome do cliente no input #customerSearchInput?)
    // Fechar o modal
    if(customerRegModal) customerRegModal.style.display = 'none';
};

// ==============================================
//           FIM DAS NOVAS FUNÇÕES
// ==============================================


// --- INICIALIZAÇÃO DO CONTROLLER ---
const attachReviewListListeners = () => { /* ... (mantida) ... */ };

export const initPaymentController = () => {
    if(paymentInitialized) return;
    console.log("[PaymentController] Inicializando...");

    // Mapeia Elementos Principais
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
    paymentSummaryList = document.getElementById('paymentSummaryList');
    chargeInputs = document.getElementById('chargeInputs');
    openCustomerRegBtn = document.getElementById('openCustomerRegBtn'); // Botão que abre o modal cliente
    customerSearchInput = document.getElementById('customerSearchInput'); // Input principal (será atualizado?)
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
    
    // Mapeia Elementos do Modal Cliente
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
    if(selectiveTransferModal) {
        transferItemsList = selectiveTransferModal.querySelector('#transferItemsList');
    }

    if (!reviewItemsList) { console.error("[PaymentController] Erro Fatal: 'reviewItemsList' não encontrado."); return; }
    
    renderPaymentMethodButtons(); // Renderiza botões de pagamento

    // Adiciona Listeners Essenciais (Mantidos)
    if(toggleServiceTaxBtn) toggleServiceTaxBtn.addEventListener('click', async () => { /* ... */ });
    if(dinersSplitInput) dinersSplitInput.addEventListener('input', () => renderPaymentSummary(currentTableId, currentOrderSnapshot));
    if(paymentMethodButtonsContainer) paymentMethodButtonsContainer.addEventListener('click', (e) => { /* ... */ });
    if(paymentValueInput) paymentValueInput.addEventListener('input', (e) => { /* ... */ });
    if(addPaymentBtn) addPaymentBtn.addEventListener('click', async () => { /* ... */ });
    if(finalizeOrderBtn) finalizeOrderBtn.addEventListener('click', handleFinalizeOrder); // Placeholder
    if(openNfeModalBtn) openNfeModalBtn.addEventListener('click', window.openNfeModal); // Placeholder global
    if(addSplitAccountBtn) addSplitAccountBtn.addEventListener('click', handleAddSplitAccount); // Placeholder
    if (openCalculatorBtn) openCalculatorBtn.addEventListener('click', () => { if(calculatorModal) calculatorModal.style.display = 'flex'; });
    if (closeCalcBtnX) closeCalcBtnX.addEventListener('click', () => { if (calculatorModal) calculatorModal.style.display = 'none'; });
    if (calcButtons) calcButtons.addEventListener('click', (e) => { /* ... */ });
    if(confirmTransferBtn) { /* ... (listener mantido) ... */ }
    if (targetTableInput) { /* ... (listener mantido) ... */ }

    // --- CORREÇÃO: Listeners do Modal Cliente ---
    if (openCustomerRegBtn) {
        openCustomerRegBtn.addEventListener('click', openCustomerRegModal);
    } else {
        console.error("[PaymentController] Botão 'openCustomerRegBtn' não encontrado.");
    }
    if (closeCustomerRegModalBtn) {
        closeCustomerRegModalBtn.addEventListener('click', () => {
            if(customerRegModal) customerRegModal.style.display = 'none';
        });
    }
    if (searchCustomerByCpfBtn) {
        searchCustomerByCpfBtn.addEventListener('click', searchCustomer); // Placeholder
    }
    if (saveCustomerBtn) {
        saveCustomerBtn.addEventListener('click', saveCustomer); // Placeholder
    }
    if (linkCustomerToTableBtn) {
        linkCustomerToTableBtn.addEventListener('click', linkCustomerToTable); // Placeholder
    }
    // Adicionar listener aos inputs do form cliente para habilitar o botão Salvar
    [customerNameInput, customerCpfInput].forEach(input => {
        if (input) {
            input.addEventListener('input', () => {
                const nameValid = customerNameInput?.value.trim().length > 2;
                const cpfValid = customerCpfInput?.value.trim().length >= 11; // Validação básica
                if(saveCustomerBtn) saveCustomerBtn.disabled = !(nameValid && cpfValid);
            });
        }
    });
    // --- FIM DA CORREÇÃO ---


    paymentInitialized = true;
    console.log("[PaymentController] Inicializado.");
};
