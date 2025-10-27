// --- CONTROLLERS/PAYMENTCONTROLLER.JS (Painel 3) ---
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
    addPaymentBtn.classList.toggle('cursor-not-allowed', !isValid); // Garante estilo desabilitado
};

// --- FUNÇÕES DE RENDERIZAÇÃO (PAGAMENTO) ---
const renderRegisteredPayments = (payments) => { /* ... (código mantido igual) ... */
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
const renderPaymentMethodButtons = () => { /* ... (código mantido igual) ... */
     if (!paymentMethodButtonsContainer) return;
    paymentMethodButtonsContainer.innerHTML = PAYMENT_METHODS.map(method => `
        <button class="payment-method-btn" data-method="${method}">
            ${method}
        </button>
    `).join('');
};
const renderPaymentSplits = (orderSnapshot) => { /* ... (código mantido igual) ... */ };
export const renderPaymentSummary = (tableId, orderSnapshot) => { /* ... (código mantido igual, incluindo correção do botão finalizar) ... */
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
    const valuePerDiner = diners > 0 ? totalPrincipalAccount / diners : 0;

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
        if (!finalizeOrderBtn.innerHTML.includes('fa-spinner')) {
            finalizeOrderBtn.innerHTML = '<i class="fas fa-check-circle"></i> FINALIZAR CONTA';
            finalizeOrderBtn.disabled = true;
            finalizeOrderBtn.classList.add('opacity-50', 'cursor-not-allowed');
        }

        const canFinalize = remainingBalancePrincipal <= 0.01;
        if (!finalizeOrderBtn.innerHTML.includes('fa-spinner')) {
             finalizeOrderBtn.disabled = !canFinalize;
             finalizeOrderBtn.classList.toggle('opacity-50', !canFinalize);
             finalizeOrderBtn.classList.toggle('cursor-not-allowed', !canFinalize);
        }
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
const renderReviewItemsList = (orderSnapshot) => { /* ... (código mantido igual) ... */
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
window.activateItemSelection = (mode = null) => { /* ... (código mantido igual) ... */ };
export const handleMassActionRequest = (action) => { /* ... (código mantido igual) ... */ };
export const handleMassDeleteConfirmed = async () => { /* ... (código mantido igual) ... */ };
export function openTableTransferModal() { /* ... (código mantido igual) ... */ };
export function handleConfirmTableTransfer() { /* ... (código mantido igual) ... */ };
const handleAddSplitAccount = () => { alert("Funcionalidade de divisão desativada.")};
window.removeSplitAccount = (splitId) => { alert("Funcionalidade de divisão desativada.")};
window.openPaymentModalForSplit = (splitId) => { alert("Funcionalidade de divisão desativada.")};
window.openSplitTransferModal = (splitId, mode) => { alert("Funcionalidade de divisão desativada.")};

export const handleFinalizeOrder = async () => { /* ... (código mantido igual) ... */ };


// --- FUNÇÕES GESTÃO DE CLIENTES ---
const openCustomerRegModal = () => { /* ... (código mantido igual) ... */ };
const searchCustomer = async () => { /* ... (código mantido igual, incluindo classes opacity) ... */
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
            if (saveCustomerBtn) {
                 saveCustomerBtn.disabled = true;
                 saveCustomerBtn.classList.add('opacity-50');
            }
            if (linkCustomerToTableBtn) {
                linkCustomerToTableBtn.disabled = false;
                linkCustomerToTableBtn.classList.remove('opacity-50');
            }
        } else {
            currentFoundCustomer = null;
            if (customerNameInput) customerNameInput.value = '';
            if (customerCpfInput) customerCpfInput.value = docNumber;
            if (customerPhoneInput) customerPhoneInput.value = '';
            if (customerEmailInput) customerEmailInput.value = '';

            customerSearchResultsDiv.innerHTML = `<p class="text-sm text-yellow-400">Cliente não encontrado. Preencha os dados para cadastrar.</p>`;
            if (saveCustomerBtn) {
                 saveCustomerBtn.disabled = true;
                 saveCustomerBtn.classList.add('opacity-50');
            }
            if (linkCustomerToTableBtn) {
                linkCustomerToTableBtn.disabled = true;
                linkCustomerToTableBtn.classList.add('opacity-50');
            }
            if (customerNameInput) customerNameInput.focus();
        }
    } catch (e) {
        console.error("Erro ao buscar cliente:", e);
        customerSearchResultsDiv.innerHTML = `<p class="text-sm text-red-400">Erro ao buscar no banco de dados.</p>`;
    }
};
const saveCustomer = async () => { /* ... (código mantido igual, incluindo classes opacity) ... */
     if (!customerNameInput || !customerCpfInput) return;

    const name = customerNameInput.value.trim();
    const documentNumber = customerCpfInput.value.replace(/\D/g, '');
    const phone = customerPhoneInput?.value.trim() || '';
    const email = customerEmailInput?.value.trim().toLowerCase() || '';

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
        if (saveCustomerBtn) {
            saveCustomerBtn.disabled = true;
            saveCustomerBtn.classList.add('opacity-50');
        }
        if (linkCustomerToTableBtn) {
            linkCustomerToTableBtn.disabled = false;
            linkCustomerToTableBtn.classList.remove('opacity-50');
        }

    } catch (e) {
        console.error("Erro ao salvar cliente:", e);
        alert("Falha ao salvar cliente.");
    }
};
const linkCustomerToTable = async () => { /* ... (código mantido igual, com correção docType) ... */
    if (!currentFoundCustomer || !currentTableId) {
        alert("Nenhum cliente selecionado ou mesa ativa.");
        return;
    }

    const docType = currentFoundCustomer.documentType ||
                    (currentFoundCustomer.cpf?.length === 11 ? 'cpf' : currentFoundCustomer.cpf?.length === 14 ? 'cnpj' : 'desconhecido');

    const tableRef = getTableDocRef(currentTableId);
    try {
        await updateDoc(tableRef, {
            clientId: currentFoundCustomer.cpf,
            clientName: currentFoundCustomer.name,
            clientDocType: docType
        });

        if (customerSearchInput) {
            customerSearchInput.value = currentFoundCustomer.name;
            customerSearchInput.disabled = true;
        }
        if(customerRegModal) customerRegModal.style.display = 'none';
        currentFoundCustomer = null;

    } catch (e) {
        console.error("Erro ao associar cliente à mesa:", e);
        alert("Falha ao associar cliente.");
    }
};

const handlePrintSummary = () => { /* ... (código mantido igual) ... */ };

// --- INICIALIZAÇÃO DO CONTROLLER ---
const attachReviewListListeners = () => { /* ... (código mantido igual) ... */ };

export const initPaymentController = () => {
    if(paymentInitialized) return;
    console.log("[PaymentController] Inicializando...");

    // --- Mapeamento dos Elementos ---
    // (Código de mapeamento mantido igual)
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
    tableTransferModal = document.getElementById('tableTransferModal');
    printSummaryBtn = document.getElementById('printSummaryBtn');
    calculatorModal = document.getElementById('calculatorModal');
    calcDisplay = document.getElementById('calcDisplay');
    calcButtonsContainer = calculatorModal?.querySelector('.calculator-buttons');
    closeCalcBtnX = document.getElementById('closeCalcBtnX');
    confirmCalcBtn = document.getElementById('confirmCalcBtn');
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
    if (tableTransferModal) { /* ... */ }
    if (!reviewItemsList) { console.error("[PaymentController] Erro Fatal: 'reviewItemsList' não encontrado."); return; }

    renderPaymentMethodButtons();

    // ==========================================================
    // --- ADICIONA LISTENERS ESSENCIAIS (PAGAMENTO) - CORRIGIDO ---
    // ==========================================================
    if (toggleServiceTaxBtn) {
        toggleServiceTaxBtn.addEventListener('click', async () => {
            if (!currentTableId) return;
            const tableRef = getTableDocRef(currentTableId);
            // Lê o estado ATUAL do snapshot antes de tentar inverter
            const currentStatus = currentOrderSnapshot?.serviceTaxApplied ?? true;
            try {
                await updateDoc(tableRef, {
                    serviceTaxApplied: !currentStatus // Inverte o estado atual
                });
                console.log(`[Payment] Taxa de serviço alterada para: ${!currentStatus}`);
                // O listener onSnapshot no app.js deve chamar renderPaymentSummary para atualizar a UI
            } catch (e) {
                console.error("Erro ao atualizar taxa de serviço:", e);
                alert("Falha ao atualizar taxa de serviço.");
            }
        });
    } else { console.error("[PaymentController] Botão 'toggleServiceTaxBtn' não encontrado."); }

    if (decreaseDinersBtn && dinersSplitInput) {
        decreaseDinersBtn.addEventListener('click', () => {
            let currentDiners = parseInt(dinersSplitInput.value) || 1;
            if (currentDiners > 1) {
                currentDiners--;
                dinersSplitInput.value = currentDiners;
                renderPaymentSummary(currentTableId, currentOrderSnapshot); // Re-renderiza para atualizar valor por pessoa
            }
        });
    } else { console.error("[PaymentController] Botão 'decreaseDinersBtn' ou Input 'dinersSplitInput' não encontrado."); }

    if (increaseDinersBtn && dinersSplitInput) {
        increaseDinersBtn.addEventListener('click', () => {
            let currentDiners = parseInt(dinersSplitInput.value) || 1;
            currentDiners++;
            dinersSplitInput.value = currentDiners;
            renderPaymentSummary(currentTableId, currentOrderSnapshot); // Re-renderiza para atualizar valor por pessoa
        });
    } else { console.error("[PaymentController] Botão 'increaseDinersBtn' ou Input 'dinersSplitInput' não encontrado."); }

    if (paymentMethodButtonsContainer) {
        paymentMethodButtonsContainer.addEventListener('click', (e) => {
            const btn = e.target.closest('.payment-method-btn');
            if (btn) {
                paymentMethodButtonsContainer.querySelectorAll('.payment-method-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                // Auto-preenche valor se for Dinheiro e houver saldo
                if (remainingBalanceDisplay && paymentValueInput) {
                    const remaining = getNumericValueFromCurrency(remainingBalanceDisplay.textContent);
                    if (btn.dataset.method === 'Dinheiro' && remaining > 0) {
                        paymentValueInput.value = remaining.toFixed(2).replace('.', ',');
                    }
                }
                _validatePaymentInputs(); // Revalida botão Adicionar
            }
        });
    } else { console.error("[PaymentController] Container 'paymentMethodButtons' não encontrado."); }

    if (paymentValueInput) {
        paymentValueInput.addEventListener('input', (e) => {
            // Permite apenas números e vírgula, garante uma vírgula
            let value = e.target.value.replace(/[^0-9,]/g, '');
            const commaIndex = value.indexOf(',');
            if (commaIndex !== -1) {
                value = value.substring(0, commaIndex + 1) + value.substring(commaIndex + 1).replace(/,/g, '');
            }
             // Limita a duas casas decimais após a vírgula
            if (commaIndex !== -1 && value.length > commaIndex + 3) {
                value = value.substring(0, commaIndex + 3);
            }
            e.target.value = value;
            _validatePaymentInputs(); // Revalida botão Adicionar
        });
    } else { console.error("[PaymentController] Input 'paymentValueInput' não encontrado."); }

    if (addPaymentBtn) {
        addPaymentBtn.addEventListener('click', async () => {
            if (!currentTableId) return;

            const selectedMethodBtn = paymentMethodButtonsContainer?.querySelector('.payment-method-btn.active');
            const method = selectedMethodBtn?.dataset.method;
            const numericValue = getNumericValueFromCurrency(paymentValueInput?.value || '0'); // Garante que value existe
            const remainingBalance = getNumericValueFromCurrency(remainingBalanceDisplay?.textContent || '0'); // Garante que display existe

            if (!method || numericValue <= 0) {
                alert("Selecione um método de pagamento e insira um valor válido.");
                return;
            }

            // Verifica se o valor excede o restante (com margem para float)
            if (numericValue > (remainingBalance + 0.01)) {
                const formattedValue = formatCurrency(numericValue);
                const formattedRemaining = formatCurrency(remainingBalance);
                if (!confirm(`O valor ${formattedValue} é MAIOR que o restante (${formattedRemaining}). Deseja registrar mesmo assim (para troco)?`)) {
                    return;
                }
            }

            const paymentObject = {
                method: method,
                value: formatCurrency(numericValue), // Salva formatado
                timestamp: Date.now(),
                userId: userId || 'unknown'
            };

            const tableRef = getTableDocRef(currentTableId);
            try {
                await updateDoc(tableRef, {
                    payments: arrayUnion(paymentObject)
                });

                // Limpa após sucesso
                if (paymentValueInput) paymentValueInput.value = '';
                selectedMethodBtn?.classList.remove('active'); // Remove 'active' se o botão existir
                _validatePaymentInputs(); // Desabilita o botão Add

            } catch (e) {
                console.error("Erro ao adicionar pagamento:", e);
                alert("Falha ao registrar o pagamento.");
            }
        });
    } else { console.error("[PaymentController] Botão 'addPaymentBtn' não encontrado."); }

    if(finalizeOrderBtn) {
        finalizeOrderBtn.addEventListener('click', handleFinalizeOrder);
    } else { console.error("[PaymentController] Botão 'finalizeOrderBtn' não encontrado."); }

    if(openNfeModalBtn) {
        openNfeModalBtn.addEventListener('click', window.openNfeModal);
    } else { console.warn("[PaymentController] Botão 'openNfeModalBtn' não encontrado."); }

    if(addSplitAccountBtn) {
         addSplitAccountBtn.addEventListener('click', handleAddSplitAccount);
    } else { console.warn("[PaymentController] Botão 'addSplitAccountBtn' (divisão) não encontrado ou desativado."); }

    if (confirmTransferBtn && tableTransferModal) {
        confirmTransferBtn.addEventListener('click', handleConfirmTableTransfer);
    } else if (tableTransferModal) { // Só loga erro se o modal existe mas o botão não
        console.error("[PaymentController] Botão 'confirmTransferBtn' não encontrado dentro do modal de transferência.");
    }

    if (targetTableInput && tableTransferModal) {
        targetTableInput.addEventListener('input', async () => {
             const targetTableId = targetTableInput.value.trim();
             const newTableDinersDiv = document.getElementById('newTableDinersInput');
             const confirmBtn = document.getElementById('confirmTableTransferBtn');

             if (!targetTableId || targetTableId === currentTableId) {
                 if (confirmBtn) confirmBtn.disabled = true;
                 if (newTableDinersDiv) newTableDinersDiv.style.display = 'none';
                 return;
             }

             try {
                 const tableRef = getTableDocRef(targetTableId);
                 const docSnap = await getDoc(tableRef);

                 if (docSnap.exists() && docSnap.data().status?.toLowerCase() === 'open') {
                     if (newTableDinersDiv) newTableDinersDiv.style.display = 'none';
                     if (confirmBtn) confirmBtn.disabled = false;
                 } else {
                     if (newTableDinersDiv) newTableDinersDiv.style.display = 'block';
                     if (confirmBtn) confirmBtn.disabled = false;
                 }
             } catch (e) {
                 console.error("Erro ao verificar mesa de destino:", e);
                 if (confirmBtn) confirmBtn.disabled = true;
             }
        });
    } else if (tableTransferModal){ // Só loga erro se o modal existe mas o input não
         console.error("[PaymentController] Input 'targetTableInput' não encontrado dentro do modal de transferência.");
    }

    if(printSummaryBtn) {
        printSummaryBtn.addEventListener('click', handlePrintSummary);
    } else { console.warn("[PaymentController] Botão 'printSummaryBtn' não encontrado."); }
    // ==========================================================
    // --- FIM DOS LISTENERS ESSENCIAIS (PAGAMENTO) ---
    // ==========================================================


    // --- ADICIONA LISTENERS CALCULADORA ---
    let calculatorState = { /* ... (estado mantido) ... */ };
    function updateDisplay() { /* ... */ }
    function inputDigit(digit) { /* ... */ }
    function inputDecimal(dot) { /* ... */ }
    function handleOperator(nextOperator) { /* ... */ }
    const performCalculation = { /* ... */ };
    function resetCalculator() { /* ... */ }
    function backspace() { /* ... */ }

    if (calcButtonsContainer) {
        calcButtonsContainer.addEventListener('click', (event) => { /* ... (lógica mantida) ... */
             const { target } = event;
            // Garante que clicou num botão com data-action
            if (!target.matches('.calc-btn[data-action]')) return;

            const action = target.dataset.action;
            const value = target.dataset.value;

            switch (action) {
                case 'number': inputDigit(value); break;
                case 'operator': handleOperator(value); break;
                case 'decimal': inputDecimal('.'); break; // Usa ponto internamente
                case 'clear': resetCalculator(); break;
                case 'backspace': backspace(); break;
                case 'calculate':
                    handleOperator('=');
                    calculatorState.waitingForSecondOperand = false;
                    calculatorState.operator = null;
                    break;
            }
            updateDisplay();
        });
    } else { console.error("[PaymentController] Container 'calculator-buttons' não encontrado."); }

    if (confirmCalcBtn) {
        confirmCalcBtn.addEventListener('click', () => { /* ... (lógica mantida) ... */
            if (paymentValueInput && calcDisplay) {
                const calcValueFormatted = calcDisplay.value; // Já está com vírgula
                paymentValueInput.value = calcValueFormatted;
                paymentValueInput.dispatchEvent(new Event('input')); // Dispara evento
            }
            if (calculatorModal) calculatorModal.style.display = 'none';
            resetCalculator();
            updateDisplay();
        });
    } else { console.error("[PaymentController] Botão 'confirmCalcBtn' não encontrado."); }

    if (openCalculatorBtn) {
        openCalculatorBtn.addEventListener('click', () => { /* ... (lógica mantida) ... */
             if (calculatorModal && calcDisplay && paymentValueInput) {
                 const currentPaymentValue = paymentValueInput.value.replace(',', '.'); // Usa ponto
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
    } else { console.error("[PaymentController] Botão 'openCalculatorBtn' não encontrado."); }

    if (closeCalcBtnX) {
        closeCalcBtnX.addEventListener('click', () => { /* ... (lógica mantida) ... */
            if (calculatorModal) calculatorModal.style.display = 'none';
            resetCalculator();
            updateDisplay();
        });
    } else { console.warn("[PaymentController] Botão 'closeCalcBtnX' da calculadora não encontrado."); }
    // --- FIM LISTENERS CALCULADORA ---


    // --- LISTENERS DO MODAL DE CLIENTE ---
    // (Código mantido igual, com verificações e adição/remoção de classes opacity)
    if (openCustomerRegBtn) openCustomerRegBtn.addEventListener('click', openCustomerRegModal);
    else console.error("[PaymentController] Botão 'openCustomerRegBtn' não encontrado.");

    if (closeCustomerRegModalBtn) {
        closeCustomerRegModalBtn.addEventListener('click', () => {
            if (customerRegModal) {
                customerRegModal.style.display = 'none';
                currentFoundCustomer = null;
            } else {
                console.error("Tentativa de fechar modal de cliente não encontrado.");
            }
        });
    } else { console.error("[PaymentController] Botão 'closeCustomerRegModalBtn' não encontrado."); }

    if (searchCustomerByCpfBtn) searchCustomerByCpfBtn.addEventListener('click', searchCustomer);
    else console.error("[PaymentController] Botão 'searchCustomerByCpfBtn' não encontrado.");

    if (saveCustomerBtn) saveCustomerBtn.addEventListener('click', saveCustomer);
    else console.error("[PaymentController] Botão 'saveCustomerBtn' não encontrado.");

    if (linkCustomerToTableBtn) linkCustomerToTableBtn.addEventListener('click', linkCustomerToTable);
    else console.error("[PaymentController] Botão 'linkCustomerToTableBtn' não encontrado.");

    const enableSaveButtonCheck = () => {
        if (!saveCustomerBtn || !customerNameInput || !customerCpfInput) return;
        const name = customerNameInput.value.trim();
        const doc = customerCpfInput.value.replace(/\D/g, '');
        const shouldEnable = !currentFoundCustomer && name && (doc.length === 11 || doc.length === 14);
        saveCustomerBtn.disabled = !shouldEnable;
        saveCustomerBtn.classList.toggle('opacity-50', !shouldEnable);
        saveCustomerBtn.classList.toggle('cursor-not-allowed', !shouldEnable); // Garante estilo
    };

    if (customerNameInput) customerNameInput.addEventListener('input', enableSaveButtonCheck);
    else console.error("[PaymentController] Input 'customerNameInput' não encontrado para listener.");

    if (customerCpfInput) customerCpfInput.addEventListener('input', enableSaveButtonCheck);
    else console.error("[PaymentController] Input 'customerCpfInput' não encontrado para listener.");
    // --- FIM LISTENERS MODAL CLIENTE ---


    paymentInitialized = true;
    console.log("[PaymentController] Inicializado.");
}; // Fim de initPaymentController
