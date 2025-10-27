// --- CONTROLLERS/PAYMENTCONTROLLER.JS (Painel 3) ---
import { currentTableId, currentOrderSnapshot, userId } from "/app.js"; // Importa userId
import { formatCurrency, calculateItemsValue, getNumericValueFromCurrency } from "/utils.js";
import { getTableDocRef, getCustomersCollectionRef, db } from "/services/firebaseService.js";
import {
    updateDoc, arrayUnion, arrayRemove, writeBatch, getFirestore, getDoc, serverTimestamp,
    collection, query, where, getDocs, addDoc, setDoc, doc
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
// Import para integração com WooCommerce via Cloud Function
import { createWooCommerceOrder } from "/services/wooCommerceService.js";


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

// Esta função é chamada pelo auth modal (app.js) após a senha ser validada
export const executeDeletePayment = async (timestamp) => {
    if (!currentTableId || !timestamp) return;

    const tableRef = getTableDocRef(currentTableId);
    // Encontra o pagamento exato no snapshot atual para usar no arrayRemove
    const paymentToDelete = currentOrderSnapshot?.payments.find(p => p.timestamp === timestamp);

    if (!paymentToDelete) {
        alert("Erro: Pagamento não encontrado para excluir.");
        return;
    }

    try {
        await updateDoc(tableRef, {
            payments: arrayRemove(paymentToDelete)
        });
        alert("Pagamento removido com sucesso.");
        // O listener onSnapshot vai atualizar a UI
    } catch (e) {
        console.error("Erro ao remover pagamento:", e);
        alert("Falha ao remover pagamento.");
    }
};

// Esta função é chamada pelo 'onclick' do botão de lixeira
export const deletePayment = async (timestamp) => {
    // Chama o modal de autenticação ANTES de executar a exclusão
    window.openManagerAuthModal('deletePayment', timestamp);
};
// Disponibiliza no escopo global para o HTML
window.deletePayment = deletePayment;

// Validador interno para habilitar/desabilitar o botão de adicionar
const _validatePaymentInputs = () => {
    if (!addPaymentBtn) return;

    const selectedMethod = paymentMethodButtonsContainer?.querySelector('.active');
    const numericValue = getNumericValueFromCurrency(paymentValueInput?.value || '0');

    const isValid = selectedMethod && numericValue > 0;
    addPaymentBtn.disabled = !isValid;
};

// --- FUNÇÕES DE RENDERIZAÇÃO (PAGAMENTO) ---

// Renderiza a lista de pagamentos já efetuados
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

// Renderiza os botões de método de pagamento
const renderPaymentMethodButtons = () => {
    if (!paymentMethodButtonsContainer) return;

    paymentMethodButtonsContainer.innerHTML = PAYMENT_METHODS.map(method => `
        <button class="payment-method-btn" data-method="${method}">
            ${method}
        </button>
    `).join('');
};

// Função "vazia" para a divisão de contas (para evitar o erro)
const renderPaymentSplits = (orderSnapshot) => { /* ... (mantida - vazia/comentada) ... */ };

// Renderiza o Resumo da Conta (Subtotal, Taxa, Total, etc.)
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
    const valuePerDiner = diners > 0 ? totalPrincipalAccount / diners : 0; // Evita divisão por zero

    updateText('orderSubtotalDisplayPayment', formatCurrency(subtotal));
    updateText('orderServiceTaxDisplayPayment', formatCurrency(serviceTax));
    updateText('orderTotalDisplayPayment', formatCurrency(totalPrincipalAccount));
    updateText('valuePerDinerDisplay', formatCurrency(valuePerDiner));
    updateText('remainingBalanceDisplay', formatCurrency(remainingBalancePrincipal > 0 ? remainingBalancePrincipal : 0));
    // Atualiza também o span que só aparece na impressão
    updateText('valuePerDinerDisplayPrint', formatCurrency(valuePerDiner));


    if (toggleServiceTaxBtn) {
        toggleServiceTaxBtn.textContent = applyServiceTax ? 'Remover' : 'Aplicar';
        toggleServiceTaxBtn.classList.toggle('bg-red-600', applyServiceTax);
        toggleServiceTaxBtn.classList.toggle('bg-green-600', !applyServiceTax);
        toggleServiceTaxBtn.disabled = false;
        toggleServiceTaxBtn.style.opacity = '1';
    }

    // ==============================================
    //           INÍCIO DA CORREÇÃO (RESET DO BOTÃO)
    // ==============================================
    // Lógica para habilitar/desabilitar o botão Finalizar
    if (finalizeOrderBtn) {
        // --- ADICIONAR ESTAS LINHAS ---
        // Garante que o texto/ícone original seja restaurado
        // SE o botão não estiver JÁ no estado de "Enviando...".
        // Também garante que ele comece desabilitado por padrão a cada renderização.
        if (!finalizeOrderBtn.innerHTML.includes('fa-spinner')) {
            finalizeOrderBtn.innerHTML = '<i class="fas fa-check-circle"></i> FINALIZAR CONTA';
            finalizeOrderBtn.disabled = true; // Começa desabilitado por segurança
            finalizeOrderBtn.classList.add('opacity-50', 'cursor-not-allowed'); // Garante estilo desabilitado
        }
        // --- FIM DAS LINHAS ADICIONADAS ---

        // Lógica existente para habilitar baseado no saldo (MANTIDA):
        const canFinalize = remainingBalancePrincipal <= 0.01;

        // Só reabilita/desabilita se NÃO estiver em estado de loading
        if (!finalizeOrderBtn.innerHTML.includes('fa-spinner')) {
             finalizeOrderBtn.disabled = !canFinalize;
             finalizeOrderBtn.classList.toggle('opacity-50', !canFinalize);
             finalizeOrderBtn.classList.toggle('cursor-not-allowed', !canFinalize);
        }
    }
    // ==============================================
    //           FIM DA CORREÇÃO
    // ==============================================

    renderReviewItemsList(orderSnapshot);
    renderRegisteredPayments(payments);
    // renderPaymentSplits(orderSnapshot); // (Comentado para evitar erro)

    if (customerSearchInput && orderSnapshot?.clientName) {
        customerSearchInput.value = orderSnapshot.clientName;
        customerSearchInput.disabled = true;
    } else if (customerSearchInput) {
        customerSearchInput.value = '';
        customerSearchInput.disabled = false;
    }
};

// Renderiza a lista de itens para revisão (com checkboxes)
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
     console.log("Itens selecionados para ação:", window.itemsToTransfer);
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
        const batch = writeBatch(getFirestore()); // Usa getFirestore() para obter a instância DB

        itemsToDelete.forEach(item => {
            batch.update(tableRef, { sentItems: arrayRemove(item) });
        });

        batch.update(tableRef, { total: newTotal });

        if (closeTableConfirmed) {
            batch.update(tableRef, { status: 'closed' });
            console.log("[Payment] Mesa será fechada após exclusão de todos os itens.");
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

// Função para Finalizar/Fechar a Conta (com integração WooCommerce)
export const handleFinalizeOrder = async () => {
    if (!currentTableId || !currentOrderSnapshot) {
        alert("Erro: Nenhuma mesa ou dados da mesa carregados.");
        return;
    }

    // Confirmação dupla
    if (!confirm(`Tem certeza que deseja fechar a Mesa ${currentTableId}? Esta ação enviará o pedido ao WooCommerce e não pode ser desfeita.`)) {
        return;
    }

    // Desabilita o botão para evitar cliques duplos
    if(finalizeOrderBtn) finalizeOrderBtn.disabled = true;

    // Simulação de "loading"
    const originalBtnText = finalizeOrderBtn ? finalizeOrderBtn.innerHTML : '<i class="fas fa-check-circle"></i> FINALIZAR CONTA';
    if(finalizeOrderBtn) finalizeOrderBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enviando...';

    try {
        // 1. Tentar enviar ao WooCommerce PRIMEIRO
        // Passamos o snapshot global que foi atualizado pelo listener do app.js
        const wooOrder = await createWooCommerceOrder(currentOrderSnapshot);

        console.log(`[Payment] Pedido ${wooOrder.id} criado no WooCommerce.`);
        alert(`Pedido enviado ao WooCommerce (ID: ${wooOrder.id}). Fechando a mesa local...`);

        // 2. Se o envio ao Woo foi bem-sucedido, fechar a mesa no Firebase
        const tableRef = getTableDocRef(currentTableId);
        await updateDoc(tableRef, {
            status: 'closed',
            closedAt: serverTimestamp(), // Adiciona timestamp de fechamento
            wooCommerceOrderId: wooOrder.id // Salva o ID do Woo na mesa (opcional, mas bom)
        });

        alert(`Mesa ${currentTableId} fechada com sucesso.`);

        // 3. Navegar de volta ao painel
        window.goToScreen('panelScreen');

    } catch (e) {
        console.error("Erro CRÍTICO ao finalizar conta:", e);
        alert(`FALHA AO FINALIZAR: ${e.message}. A mesa NÃO foi fechada. Verifique o console e tente novamente.`);

        // Reabilita o botão e restaura o texto em caso de falha
        if(finalizeOrderBtn) {
            // A função renderPaymentSummary pode desabilitar o botão se o saldo não for 0.
            // Em caso de erro no envio, garantimos que ele seja reabilitado para nova tentativa.
            finalizeOrderBtn.disabled = false;
            finalizeOrderBtn.innerHTML = originalBtnText;
            finalizeOrderBtn.classList.remove('opacity-50', 'cursor-not-allowed');

            // Timeout para garantir que o estado seja restaurado mesmo após renderPaymentSummary rodar
             setTimeout(() => {
                 if(finalizeOrderBtn && finalizeOrderBtn.innerHTML.includes('fa-spinner')) { // Verifica se ainda está em loading
                     finalizeOrderBtn.disabled = false;
                     finalizeOrderBtn.innerHTML = originalBtnText;
                     finalizeOrderBtn.classList.remove('opacity-50', 'cursor-not-allowed');
                 }
             }, 500); // Meio segundo deve ser suficiente
        }
    }
};


// --- FUNÇÕES GESTÃO DE CLIENTES (Implementadas) ---
// (Código das funções openCustomerRegModal, searchCustomer, saveCustomer, linkCustomerToTable mantido igual)
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
    const docNumber = customerSearchCpfInput.value.replace(/\D/g, ''); // Remove máscara
    if (docNumber.length !== 11 && docNumber.length !== 14) {
        customerSearchResultsDiv.innerHTML = `<p class="text-sm text-red-400">Documento inválido. Digite 11 (CPF) ou 14 (CNPJ) números.</p>`;
        return;
    }
    customerSearchResultsDiv.innerHTML = `<p class="text-sm text-yellow-400">Buscando...</p>`;

    try {
        const customersRef = getCustomersCollectionRef();
        // Usamos o Documento (CPF ou CNPJ) como ID do documento
        const customerDocRef = doc(customersRef, docNumber);
        const docSnap = await getDoc(customerDocRef);

        if (docSnap.exists()) {
            // Cliente ENCONTRADO
            currentFoundCustomer = docSnap.data();
            customerNameInput.value = currentFoundCustomer.name || '';
            customerCpfInput.value = currentFoundCustomer.cpf || docNumber; // 'cpf' é o nome do campo no DB
            customerPhoneInput.value = currentFoundCustomer.phone || '';
            customerEmailInput.value = currentFoundCustomer.email || '';

            customerSearchResultsDiv.innerHTML = `<p class="text-sm text-green-400">Cliente encontrado: <strong>${currentFoundCustomer.name}</strong></p>`;
            saveCustomerBtn.disabled = true; // Já existe, não precisa salvar (a menos que edite)
            linkCustomerToTableBtn.disabled = false; // Habilita associação
        } else {
            // Cliente NÃO ENCONTRADO
            currentFoundCustomer = null;
            customerNameInput.value = '';
            customerCpfInput.value = docNumber; // Preenche o doc para facilitar o cadastro
            customerPhoneInput.value = '';
            customerEmailInput.value = '';

            customerSearchResultsDiv.innerHTML = `<p class="text-sm text-yellow-400">Cliente não encontrado. Preencha os dados para cadastrar.</p>`;
            saveCustomerBtn.disabled = true; // Desabilita até preencher o nome
            linkCustomerToTableBtn.disabled = true;
            customerNameInput.focus();
        }
    } catch (e) {
        console.error("Erro ao buscar cliente:", e);
        customerSearchResultsDiv.innerHTML = `<p class="text-sm text-red-400">Erro ao buscar no banco de dados.</p>`;
    }
};

const saveCustomer = async () => {
    const name = customerNameInput.value.trim();
    const documentNumber = customerCpfInput.value.replace(/\D/g, ''); // Campo 'customerCpf' agora aceita CNPJ
    const phone = customerPhoneInput.value.trim();
    const email = customerEmailInput.value.trim().toLowerCase();

    if (!name || (documentNumber.length !== 11 && documentNumber.length !== 14)) {
        alert("Nome e Documento (CPF de 11 ou CNPJ de 14 dígitos) são obrigatórios.");
        return;
    }

    // Prepara o objeto de dados do cliente
    const customerData = {
        name,
        cpf: documentNumber, // Mantemos o nome do campo 'cpf' para consistência, mas ele guarda o CNPJ
        documentType: documentNumber.length === 11 ? 'cpf' : 'cnpj', // Novo campo
        phone,
        email,
        createdAt: serverTimestamp(), // Adiciona data de criação
        lastVisit: serverTimestamp()  // Adiciona data de última visita
    };

    try {
        const customersRef = getCustomersCollectionRef();
        const customerDocRef = doc(customersRef, documentNumber); // CPF ou CNPJ como ID

        // Salva (ou sobrescreve/atualiza) o cliente usando o doc como ID
        await setDoc(customerDocRef, customerData, { merge: true }); // merge: true atualiza se já existir

        currentFoundCustomer = customerData; // Define o cliente salvo como o cliente atual
        customerSearchResultsDiv.innerHTML = `<p class="text-sm text-green-400">Cliente salvo/atualizado: <strong>${name}</strong></p>`;
        saveCustomerBtn.disabled = true; // Desabilita pois acabou de salvar
        linkCustomerToTableBtn.disabled = false; // Habilita para associar

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
        // Atualiza a mesa no Firebase com os dados do cliente
        await updateDoc(tableRef, {
            clientId: currentFoundCustomer.cpf, // O campo 'cpf' do cliente agora guarda o CPF ou CNPJ
            clientName: currentFoundCustomer.name,
            clientDocType: currentFoundCustomer.documentType // Salva o tipo na mesa
        });

        // Atualiza o input principal (fora do modal) e fecha o modal
        if (customerSearchInput) {
            customerSearchInput.value = currentFoundCustomer.name;
            customerSearchInput.disabled = true;
        }
        customerRegModal.style.display = 'none';
        currentFoundCustomer = null; // Limpa estado

    } catch (e) {
        console.error("Erro ao associar cliente à mesa:", e);
        alert("Falha ao associar cliente.");
    }
};

// Função para acionar a impressão
const handlePrintSummary = () => {
    // Atualiza o valor por pessoa (caso tenha mudado) antes de imprimir
    const valuePerDinerText = valuePerDinerDisplay ? valuePerDinerDisplay.textContent : 'R$ 0,00';
    updateText('valuePerDinerDisplayPrint', valuePerDinerText);

    window.print(); // Chama a função de impressão do navegador
};

// --- INICIALIZAÇÃO DO CONTROLLER ---
const attachReviewListListeners = () => { // Anexa listeners aos botões da barra de ação
    const massDeleteBtn = document.getElementById('massDeleteBtn');
    const massTransferBtn = document.getElementById('massTransferBtn');

    if (massDeleteBtn) {
         const newDeleteBtn = massDeleteBtn.cloneNode(true);
         massDeleteBtn.parentNode.replaceChild(newDeleteBtn, massDeleteBtn);
         newDeleteBtn.addEventListener('click', () => handleMassActionRequest('delete'));
    }
     if (massTransferBtn) {
         const newTransferBtn = massTransferBtn.cloneNode(true);
         massTransferBtn.parentNode.replaceChild(newTransferBtn, massTransferBtn);
         newTransferBtn.addEventListener('click', () => handleMassActionRequest('transfer'));
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
    printSummaryBtn = document.getElementById('printSummaryBtn'); // Mapeia o botão de imprimir

    // Mapeia os elementos do Modal de Cliente
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
        targetTableInput = document.getElementById('targetTableInput');
        confirmTransferBtn = document.getElementById('confirmTableTransferBtn');
        transferStatus = document.getElementById('transferStatus');
    }
    if(selectiveTransferModal) { /* ... (mapeamento mantido) ... */ }
    if (!reviewItemsList) { console.error("[PaymentController] Erro Fatal: 'reviewItemsList' não encontrado."); return; }

    renderPaymentMethodButtons();

    // Adiciona Listeners Essenciais
    // (Listeners para toggleServiceTaxBtn, decreaseDinersBtn, increaseDinersBtn,
    //  paymentMethodButtonsContainer, paymentValueInput, addPaymentBtn mantidos iguais)
    if(toggleServiceTaxBtn) toggleServiceTaxBtn.addEventListener('click', async () => {
        if (!currentTableId) return;
        const tableRef = getTableDocRef(currentTableId);
        const currentStatus = currentOrderSnapshot?.serviceTaxApplied ?? true;
        try {
            await updateDoc(tableRef, {
                serviceTaxApplied: !currentStatus
            });
            console.log(`[Payment] Taxa de serviço alterada para: ${!currentStatus}`);
        } catch (e) {
            console.error("Erro ao atualizar taxa de serviço:", e);
            alert("Falha ao atualizar taxa de serviço.");
        }
    });
    if(decreaseDinersBtn && dinersSplitInput) {
        decreaseDinersBtn.addEventListener('click', () => {
            let currentDiners = parseInt(dinersSplitInput.value) || 1;
            if (currentDiners > 1) {
                currentDiners--;
                dinersSplitInput.value = currentDiners;
                renderPaymentSummary(currentTableId, currentOrderSnapshot);
            }
        });
    }
    if(increaseDinersBtn && dinersSplitInput) {
        increaseDinersBtn.addEventListener('click', () => {
            let currentDiners = parseInt(dinersSplitInput.value) || 1;
            currentDiners++;
            dinersSplitInput.value = currentDiners;
            renderPaymentSummary(currentTableId, currentOrderSnapshot);
        });
    }

    if(paymentMethodButtonsContainer) paymentMethodButtonsContainer.addEventListener('click', (e) => {
        const btn = e.target.closest('.payment-method-btn');
        if (btn) {
            paymentMethodButtonsContainer.querySelectorAll('.payment-method-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            const remaining = getNumericValueFromCurrency(remainingBalanceDisplay.textContent);
            if (btn.dataset.method === 'Dinheiro' && remaining > 0) {
                 paymentValueInput.value = remaining.toFixed(2).replace('.', ',');
            }

            _validatePaymentInputs();
        }
    });

    if(paymentValueInput) paymentValueInput.addEventListener('input', (e) => {
        // Permite apenas números e vírgula, e garante apenas uma vírgula
        let value = e.target.value.replace(/[^0-9,]/g, '');
        const commaIndex = value.indexOf(',');
        if (commaIndex !== -1) {
            value = value.substring(0, commaIndex + 1) + value.substring(commaIndex + 1).replace(/,/g, '');
        }
        e.target.value = value;
        _validatePaymentInputs();
    });

    if(addPaymentBtn) addPaymentBtn.addEventListener('click', async () => {
        if (!currentTableId) return;

        const selectedMethodBtn = paymentMethodButtonsContainer.querySelector('.payment-method-btn.active');
        const method = selectedMethodBtn?.dataset.method;
        const numericValue = getNumericValueFromCurrency(paymentValueInput.value);
        const remainingBalance = getNumericValueFromCurrency(remainingBalanceDisplay.textContent);

        if (!method || numericValue <= 0) {
            alert("Selecione um método de pagamento e insira um valor válido.");
            return;
        }

        if (numericValue > (remainingBalance + 0.01)) { // Margem de 1 centavo para float
            const formattedValue = formatCurrency(numericValue);
            const formattedRemaining = formatCurrency(remainingBalance);
            if (!confirm(`O valor ${formattedValue} é MAIOR que o restante (${formattedRemaining}). Deseja registrar mesmo assim (para troco)?`)) {
                return;
            }
        }

        const paymentObject = {
            method: method,
            value: formatCurrency(numericValue),
            timestamp: Date.now(),
            userId: userId || 'unknown'
        };

        const tableRef = getTableDocRef(currentTableId);
        try {
            await updateDoc(tableRef, {
                payments: arrayUnion(paymentObject)
            });

            // Limpa após sucesso
            paymentValueInput.value = '';
            if (selectedMethodBtn) selectedMethodBtn.classList.remove('active');
            _validatePaymentInputs(); // Desabilita o botão Add

        } catch (e) {
            console.error("Erro ao adicionar pagamento:", e);
            alert("Falha ao registrar o pagamento.");
        }
    });

    // Listener para Finalizar Conta
    if(finalizeOrderBtn) finalizeOrderBtn.addEventListener('click', handleFinalizeOrder);

    // Outros listeners mantidos iguais
    if(openNfeModalBtn) openNfeModalBtn.addEventListener('click', window.openNfeModal);
    if(addSplitAccountBtn) { addSplitAccountBtn.addEventListener('click', handleAddSplitAccount); }
    else { console.warn("[PaymentController] Botão 'addSplitAccountBtn' (divisão) não encontrado ou desativado."); }
    if (openCalculatorBtn) openCalculatorBtn.addEventListener('click', () => { if(calculatorModal) calculatorModal.style.display = 'flex'; });
    if (closeCalcBtnX) closeCalcBtnX.addEventListener('click', () => { if (calculatorModal) calculatorModal.style.display = 'none'; });
    if (calcButtons) {
         // Lógica da calculadora (se existir) pode ser adicionada aqui
    }
    if(confirmTransferBtn) {
        confirmTransferBtn.addEventListener('click', handleConfirmTableTransfer);
    }
    if (targetTableInput) {
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
    }

    // --- Listeners do Modal de Cliente ---
    if (openCustomerRegBtn) { openCustomerRegBtn.addEventListener('click', openCustomerRegModal); }
    else { console.error("[PaymentController] Botão 'openCustomerRegBtn' não encontrado."); }

    if (closeCustomerRegModalBtn) {
        closeCustomerRegModalBtn.addEventListener('click', () => {
            if(customerRegModal) customerRegModal.style.display = 'none';
            currentFoundCustomer = null; // Limpa o estado
        });
    }
    if (searchCustomerByCpfBtn) { searchCustomerByCpfBtn.addEventListener('click', searchCustomer); }
    if (saveCustomerBtn) { saveCustomerBtn.addEventListener('click', saveCustomer); }
    if (linkCustomerToTableBtn) { linkCustomerToTableBtn.addEventListener('click', linkCustomerToTable); }

    // Listener para habilitar o botão 'Salvar Cliente'
    [customerNameInput, customerCpfInput].forEach(input => {
        input?.addEventListener('input', () => {
            const name = customerNameInput?.value.trim() || '';
            const doc = customerCpfInput?.value.replace(/\D/g, '') || '';
            // Só habilita salvar se o cliente não foi encontrado E os campos estão preenchidos
            if (!currentFoundCustomer && name && (doc.length === 11 || doc.length === 14)) {
                if(saveCustomerBtn) saveCustomerBtn.disabled = false;
            } else {
                 if(saveCustomerBtn) saveCustomerBtn.disabled = true;
            }
        });
    });

    // Listener para o botão de Imprimir Resumo
    if(printSummaryBtn) {
        printSummaryBtn.addEventListener('click', handlePrintSummary);
    } else {
        console.warn("[PaymentController] Botão 'printSummaryBtn' não encontrado.");
    }

    paymentInitialized = true;
    console.log("[PaymentController] Inicializado.");
};
