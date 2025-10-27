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
const renderPaymentSplits = (orderSnapshot) => { /* ... (Função de divisão desativada) ... */ };
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


// --- CORREÇÃO: Início do bloco de funções de Ação em Massa ---
// As funções abaixo estavam vazias e foram implementadas.

// --- LÓGICAS DE AÇÃO EM MASSA E TRANSFERÊNCIA ---
window.activateItemSelection = (mode = null) => {
    const selectAllBox = document.getElementById('selectAllItems');
    const itemCheckboxes = document.querySelectorAll('#reviewItemsList .item-select-checkbox');
    const deleteBtn = document.getElementById('massDeleteBtn');
    const transferBtn = document.getElementById('massTransferBtn');
    const deleteCount = document.getElementById('deleteCount');
    const transferCount = document.getElementById('transferCount');

    if (!selectAllBox || !deleteBtn || !transferBtn || !deleteCount || !transferCount) {
        console.error("Elementos da barra de ação de revisão não encontrados.");
        return;
    }

    // Se 'Selecionar Todos' foi clicado
    if (mode === 'toggleAll') {
        const isChecked = selectAllBox.checked;
        itemCheckboxes.forEach(box => box.checked = isChecked);
    }

    // Contar selecionados
    let checkedCount = 0;
    let allChecked = true;
    itemCheckboxes.forEach(box => {
        if (box.checked) {
            checkedCount++;
        } else {
            allChecked = false;
        }
    });

    // Atualizar estado global
    isMassSelectionActive = checkedCount > 0;

    // Atualizar contadores
    deleteCount.textContent = checkedCount;
    transferCount.textContent = checkedCount;

    // Ativar/Desativar botões
    deleteBtn.disabled = !isMassSelectionActive;
    transferBtn.disabled = !isMassSelectionActive;
    deleteBtn.classList.toggle('opacity-50', !isMassSelectionActive);
    transferBtn.classList.toggle('opacity-50', !isMassSelectionActive);
    deleteBtn.classList.toggle('cursor-not-allowed', !isMassSelectionActive);
    transferBtn.classList.toggle('cursor-not-allowed', !isMassSelectionActive);

    // Atualizar 'Selecionar Todos'
    if (checkedCount === 0) {
        selectAllBox.checked = false;
        selectAllBox.indeterminate = false;
    } else if (allChecked && itemCheckboxes.length > 0) {
        selectAllBox.checked = true;
        selectAllBox.indeterminate = false;
    } else {
        selectAllBox.indeterminate = true;
    }
};

export const handleMassActionRequest = (action) => {
    if (!isMassSelectionActive) {
        alert("Nenhum item selecionado.");
        return;
    }

    if (action === 'delete') {
        const count = document.getElementById('deleteCount')?.textContent || 0;
        if (confirm(`Tem certeza que deseja EXCLUIR ${count} item(ns) da conta? Esta ação é irreversível.`)) {
            window.openManagerAuthModal('executeMassDelete');
        }
    } else if (action === 'transfer') {
        const count = document.getElementById('transferCount')?.textContent || 0;
        if (confirm(`Tem certeza que deseja TRANSFERIR ${count} item(ns) para outra mesa?`)) {
            // A ação 'executeMassTransfer' vai chamar openTableTransferModal
            window.openManagerAuthModal('executeMassTransfer');
        }
    }
};

export const handleMassDeleteConfirmed = async () => {
    const checkedBoxes = document.querySelectorAll('#reviewItemsList .item-select-checkbox:checked');
    if (checkedBoxes.length === 0 || !currentTableId || !currentOrderSnapshot) {
        alert("Erro: Nenhum item selecionado ou mesa não encontrada.");
        return;
    }

    const dbInstance = db; // Importado do firebaseService
    if (!dbInstance) {
        alert("Erro de conexão com o banco de dados.");
        return;
    }
    const batch = writeBatch(dbInstance);
    const tableRef = getTableDocRef(currentTableId);

    let totalValueToRemove = 0;
    let itemsToRemove = [];

    try {
        checkedBoxes.forEach(box => {
            const itemsData = JSON.parse(box.dataset.items);
            itemsData.forEach(item => {
                // Adiciona o item *exato* (com seu timestamp/id único) para remoção
                itemsToRemove.push(item); 
                totalValueToRemove += (item.price || 0);
            });
        });

        if (itemsToRemove.length === 0) throw new Error("Nenhum item válido encontrado para remoção.");

        // Remove cada item individualmente do array 'sentItems'
        itemsToRemove.forEach(item => {
            batch.update(tableRef, { sentItems: arrayRemove(item) });
        });

        // Atualiza o total
        const currentTotal = currentOrderSnapshot.total || 0;
        const newTotal = Math.max(0, currentTotal - totalValueToRemove);
        batch.update(tableRef, { total: newTotal });

        await batch.commit();
        alert(`${itemsToRemove.length} item(ns) foram excluídos da conta com sucesso.`);
        // A UI será atualizada pelo listener onSnapshot do app.js

    } catch (e) {
        console.error("Erro ao excluir itens em massa:", e);
        alert(`Falha ao excluir itens: ${e.message}`);
    }
};

export function openTableTransferModal() {
    if (!tableTransferModal) {
         console.error("Modal de transferência de mesa não encontrado!");
         alert("Erro: Modal de transferência não encontrado.");
         return;
    }
    
    // Reseta o modal
    const targetInput = document.getElementById('targetTableInput');
    const dinersInput = document.getElementById('newTableDiners');
    const sectorInput = document.getElementById('newTableSector');
    const dinersDiv = document.getElementById('newTableDinersInput');
    const confirmBtn = document.getElementById('confirmTableTransferBtn');

    if(targetInput) targetInput.value = '';
    if(dinersInput) dinersInput.value = '1';
    if(sectorInput) sectorInput.value = '';
    if(dinersDiv) dinersDiv.style.display = 'none';
    if(confirmBtn) confirmBtn.disabled = true;

    tableTransferModal.style.display = 'flex';
    if(targetInput) targetInput.focus();
};

export function handleConfirmTableTransfer() {
    const checkedBoxes = document.querySelectorAll('#reviewItemsList .item-select-checkbox:checked');
    if (checkedBoxes.length === 0 || !currentTableId) {
        alert("Nenhum item selecionado para transferir.");
        return;
    }

    const targetTableId = document.getElementById('targetTableInput')?.value;
    const newDiners = parseInt(document.getElementById('newTableDiners')?.value) || 0;
    const newSector = document.getElementById('newTableSector')?.value;

    if (!targetTableId) {
        alert("Insira o número da mesa de destino.");
        return;
    }
    if (targetTableId === currentTableId) {
        alert("A mesa de destino não pode ser a mesma da origem.");
        return;
    }

    let itemsToTransfer = [];
    try {
         checkedBoxes.forEach(box => {
            const itemsData = JSON.parse(box.dataset.items);
            itemsToTransfer.push(...itemsData);
         });

         if (itemsToTransfer.length === 0) throw new Error("Nenhum item válido encontrado para transferência.");

         // Chama a função GLOBAL do app.js que executa o batch
         window.handleTableTransferConfirmed(currentTableId, targetTableId, itemsToTransfer, newDiners, newSector);
         
         if(tableTransferModal) tableTransferModal.style.display = 'none';

    } catch (e) {
        console.error("Erro ao preparar transferência:", e);
        alert(`Falha ao preparar transferência: ${e.message}`);
    }
};
// --- FIM DA CORREÇÃO (Ações em Massa) ---


const handleAddSplitAccount = () => { alert("Funcionalidade de divisão desativada.")};
window.removeSplitAccount = (splitId) => { alert("Funcionalidade de divisão desativada.")};
window.openPaymentModalForSplit = (splitId) => { alert("Funcionalidade de divisão desativada.")};
window.openSplitTransferModal = (splitId, mode) => { alert("Funcionalidade de divisão desativada.")};

export const handleFinalizeOrder = async () => {
    if (!currentTableId || !currentOrderSnapshot) {
        alert("Nenhuma mesa ativa para finalizar.");
        return;
    }

    const { total, payments, sentItems } = currentOrderSnapshot;
    const subtotal = calculateItemsValue(sentItems);
    const applyServiceTax = currentOrderSnapshot.serviceTaxApplied ?? true;
    const totalCalculado = calculateTotal(subtotal, applyServiceTax);
    const totalPago = payments.reduce((sum, p) => sum + getNumericValueFromCurrency(p.value), 0);

    // Verifica se a conta está zerada (ou com pequena margem)
    if (Math.abs(totalCalculado - totalPago) > 0.01) {
        const restante = formatCurrency(totalCalculado - totalPago);
        if (!confirm(`A conta não está zerada (restante: ${restante}). Deseja finalizar mesmo assim?`)) {
            return;
        }
    }

    if (!confirm("Confirmar o fechamento desta conta? A mesa será liberada.")) return;

    if (finalizeOrderBtn) {
        finalizeOrderBtn.disabled = true;
        finalizeOrderBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Finalizando...';
    }

    try {
        // 1. (Opcional) Envia o pedido para o WooCommerce
        if (sentItems && sentItems.length > 0) {
            console.log("[Payment] Tentando registrar pedido no WooCommerce...");
            try {
                await createWooCommerceOrder(currentOrderSnapshot);
                console.log("[Payment] Pedido registrado no WooCommerce com sucesso.");
            } catch (wooError) {
                console.warn("[Payment] Falha ao registrar pedido no WooCommerce:", wooError.message);
                // Não impede o fechamento local, mas avisa o usuário
                alert(`Aviso: A conta foi fechada localmente, mas falhou ao registrar no WooCommerce: ${wooError.message}`);
            }
        } else {
            console.log("[Payment] Nenhum item enviado (sentItems), pulando registro WooCommerce.");
        }

        // 2. Fecha a mesa no Firebase (move para 'closed' ou deleta)
        // Por enquanto, vamos apenas deletar a mesa
        const tableRef = getTableDocRef(currentTableId);
        
        // **Alternativa: Mover para 'closed' (Mais seguro para histórico)**
        // Vou mudar para "fechar" em vez de "deletar"
        const closedTableData = {
            ...currentOrderSnapshot,
            status: 'closed',
            closedAt: serverTimestamp(),
            closedBy: userId || 'unknown'
        };

        // Salva os dados da mesa fechada em outra coleção (para histórico)
        const closedTablesRef = collection(db, 'artifacts', db.app.options.appId, 'public', 'data', 'closed_tables');
        await setDoc(doc(closedTablesRef, `${currentTableId}_${Date.now()}`), closedTableData);
        
        // Remove a mesa ativa
        const batch = writeBatch(db);
        batch.delete(tableRef);
        await batch.commit();


        console.log(`[Payment] Mesa ${currentTableId} fechada e movida para o histórico.`);

        // 3. Redireciona para o painel
        alert(`Mesa ${currentTableId} finalizada com sucesso!`);
        window.goToScreen('panelScreen'); // Usa a função global

    } catch (e) {
        console.error("Erro CRÍTICO ao finalizar a conta:", e);
        alert(`Falha grave ao finalizar a conta: ${e.message}`);
        if (finalizeOrderBtn) {
            finalizeOrderBtn.disabled = false;
            finalizeOrderBtn.innerHTML = '<i class="fas fa-check-circle"></i> FINALIZAR CONTA';
        }
    }
};


// --- FUNÇÕES GESTÃO DE CLIENTES ---
const openCustomerRegModal = () => {
    if (!customerRegModal) {
        console.error("[Payment] Modal de Registro de Cliente (customerRegModal) não encontrado.");
        alert("Erro: Modal de cliente não encontrado.");
        return;
    }
    // Reseta o modal para um estado limpo
    currentFoundCustomer = null;
    if (customerSearchCpfInput) customerSearchCpfInput.value = '';
    if (customerSearchResultsDiv) customerSearchResultsDiv.innerHTML = '<p class="text-sm text-dark-placeholder italic">Digite um CPF ou CNPJ para buscar.</p>';
    if (customerNameInput) customerNameInput.value = '';
    if (customerCpfInput) customerCpfInput.value = '';
    if (customerPhoneInput) customerPhoneInput.value = '';
    if (customerEmailInput) customerEmailInput.value = '';
    // Garante que os botões de ação estejam no estado inicial (desabilitados)
    if (saveCustomerBtn) {
        saveCustomerBtn.disabled = true;
        saveCustomerBtn.classList.add('opacity-50', 'cursor-not-allowed');
    }
    if (linkCustomerToTableBtn) {
        linkCustomerToTableBtn.disabled = true;
        linkCustomerToTableBtn.classList.add('opacity-50', 'cursor-not-allowed');
    }
    // Exibe o modal
    customerRegModal.style.display = 'flex';
    if (customerSearchCpfInput) customerSearchCpfInput.focus();
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
            // Habilita o botão salvar se os campos obrigatórios forem preenchidos
            enableSaveButtonCheck();
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
const saveCustomer = async () => {
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
const linkCustomerToTable = async () => {
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

const handlePrintSummary = () => {
    console.log("[Payment] Acionando impressão do resumo...");
    window.print();
};

// --- INICIALIZAÇÃO DO CONTROLLER ---

// --- CORREÇÃO: Implementação da função attachReviewListListeners ---
// Esta função anexa os listeners corretos aos botões de delete/transfer
// e é chamada toda vez que 'renderReviewItemsList' é executada.
const attachReviewListListeners = () => {
    const deleteBtn = document.getElementById('massDeleteBtn');
    const transferBtn = document.getElementById('massTransferBtn');

    if (deleteBtn) {
        // Remove listener antigo para evitar duplicatas (clonando o nó)
        const newDeleteBtn = deleteBtn.cloneNode(true);
        deleteBtn.parentNode.replaceChild(newDeleteBtn, deleteBtn);
        // Adiciona novo listener
        newDeleteBtn.addEventListener('click', () => handleMassActionRequest('delete'));
    }
    
    if (transferBtn) {
        // Remove listener antigo
        const newTransferBtn = transferBtn.cloneNode(true);
        transferBtn.parentNode.replaceChild(newTransferBtn, transferBtn);
        // Adiciona novo listener
        newTransferBtn.addEventListener('click', () => handleMassActionRequest('transfer'));
    }
};
// --- FIM DA CORREÇÃO ---


export const initPaymentController = () => {
    if(paymentInitialized) return;
    console.log("[PaymentController] Inicializando...");

    // --- Mapeamento dos Elementos ---
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
    targetTableInput = document.getElementById('targetTableInput');
    confirmTransferBtn = document.getElementById('confirmTableTransferBtn');
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
    // --- ADICIONA LISTENERS ESSENCIAIS (PAGAMENTO) ---
    // ==========================================================
    if (toggleServiceTaxBtn) {
        toggleServiceTaxBtn.addEventListener('click', async () => {
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
    } else { console.error("[PaymentController] Botão 'toggleServiceTaxBtn' não encontrado."); }

    if (decreaseDinersBtn && dinersSplitInput) {
        decreaseDinersBtn.addEventListener('click', () => {
            let currentDiners = parseInt(dinersSplitInput.value) || 1;
            if (currentDiners > 1) {
                currentDiners--;
                dinersSplitInput.value = currentDiners;
                renderPaymentSummary(currentTableId, currentOrderSnapshot);
            }
        });
    } else { console.error("[PaymentController] Botão 'decreaseDinersBtn' ou Input 'dinersSplitInput' não encontrado."); }

    if (increaseDinersBtn && dinersSplitInput) {
        increaseDinersBtn.addEventListener('click', () => {
            let currentDiners = parseInt(dinersSplitInput.value) || 1;
            currentDiners++;
            dinersSplitInput.value = currentDiners;
            renderPaymentSummary(currentTableId, currentOrderSnapshot);
        });
    } else { console.error("[PaymentController] Botão 'increaseDinersBtn' ou Input 'dinersSplitInput' não encontrado."); }

    if (paymentMethodButtonsContainer) {
        paymentMethodButtonsContainer.addEventListener('click', (e) => {
            const btn = e.target.closest('.payment-method-btn');
            if (btn) {
                paymentMethodButtonsContainer.querySelectorAll('.payment-method-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                if (remainingBalanceDisplay && paymentValueInput) {
                    const remaining = getNumericValueFromCurrency(remainingBalanceDisplay.textContent);
                    if (btn.dataset.method === 'Dinheiro' && remaining > 0) {
                        paymentValueInput.value = remaining.toFixed(2).replace('.', ',');
                    }
                }
                _validatePaymentInputs();
            }
        });
    } else { console.error("[PaymentController] Container 'paymentMethodButtons' não encontrado."); }

    if (paymentValueInput) {
        paymentValueInput.addEventListener('input', (e) => {
            let value = e.target.value.replace(/[^0-9,]/g, '');
            const commaIndex = value.indexOf(',');
            if (commaIndex !== -1) {
                value = value.substring(0, commaIndex + 1) + value.substring(commaIndex + 1).replace(/,/g, '');
            }
            if (commaIndex !== -1 && value.length > commaIndex + 3) {
                value = value.substring(0, commaIndex + 3);
            }
            e.target.value = value;
            _validatePaymentInputs();
        });
    } else { console.error("[PaymentController] Input 'paymentValueInput' não encontrado."); }

    if (addPaymentBtn) {
        addPaymentBtn.addEventListener('click', async () => {
            if (!currentTableId) return;

            const selectedMethodBtn = paymentMethodButtonsContainer?.querySelector('.payment-method-btn.active');
            const method = selectedMethodBtn?.dataset.method;
            const numericValue = getNumericValueFromCurrency(paymentValueInput?.value || '0');
            const remainingBalance = getNumericValueFromCurrency(remainingBalanceDisplay?.textContent || '0');

            if (!method || numericValue <= 0) {
                alert("Selecione um método de pagamento e insira um valor válido.");
                return;
            }

            if (numericValue > (remainingBalance + 0.01)) {
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

                if (paymentValueInput) paymentValueInput.value = '';
                selectedMethodBtn?.classList.remove('active');
                _validatePaymentInputs();

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
    } else if (tableTransferModal) {
        console.error("[PaymentController] Botão 'confirmTableTransferBtn' não encontrado dentro do modal de transferência.");
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
    } else if (tableTransferModal){
         console.error("[PaymentController] Input 'targetTableInput' não encontrado dentro do modal de transferência.");
    }

    if(printSummaryBtn) {
        printSummaryBtn.addEventListener('click', handlePrintSummary);
    } else { console.warn("[PaymentController] Botão 'printSummaryBtn' não encontrado."); }
    // ==========================================================
    // --- FIM DOS LISTENERS ESSENCIAIS (PAGAMENTO) ---
    // ==========================================================


    // --- ADICIONA LISTENERS CALCULADORA ---
    let calculatorState = { displayValue: '0', firstOperand: null, waitingForSecondOperand: false, operator: null };
    function updateDisplay() {
        if(calcDisplay) calcDisplay.value = calculatorState.displayValue.replace('.', ',');
    }
    function inputDigit(digit) {
        const { displayValue, waitingForSecondOperand } = calculatorState;
        if (waitingForSecondOperand) {
            calculatorState.displayValue = digit;
            calculatorState.waitingForSecondOperand = false;
        } else {
            calculatorState.displayValue = displayValue === '0' ? digit : displayValue + digit;
        }
    }
    function inputDecimal(dot) {
        if (calculatorState.waitingForSecondOperand) {
            calculatorState.displayValue = '0.';
            calculatorState.waitingForSecondOperand = false;
            return;
        }
        if (!calculatorState.displayValue.includes(dot)) {
            calculatorState.displayValue += dot;
        }
    }
    function handleOperator(nextOperator) {
        const { firstOperand, displayValue, operator } = calculatorState;
        const inputValue = parseFloat(displayValue);

        if (operator && calculatorState.waitingForSecondOperand) {
            calculatorState.operator = nextOperator;
            return;
        }
        if (firstOperand == null && !isNaN(inputValue)) {
            calculatorState.firstOperand = inputValue;
        } else if (operator) {
            const result = performCalculation[operator](firstOperand, inputValue);
            calculatorState.displayValue = `${parseFloat(result.toFixed(7))}`;
            calculatorState.firstOperand = result;
        }
        calculatorState.waitingForSecondOperand = true;
        calculatorState.operator = nextOperator;
    }
    const performCalculation = {
        '/': (first, second) => first / second,
        '*': (first, second) => first * second,
        '+': (first, second) => first + second,
        '-': (first, second) => first - second,
        '%': (first, second) => first * (second / 100),
        '=': (first, second) => second,
    };
    function resetCalculator() {
        calculatorState.displayValue = '0';
        calculatorState.firstOperand = null;
        calculatorState.waitingForSecondOperand = false;
        calculatorState.operator = null;
    }
    function backspace() {
         let { displayValue } = calculatorState;
         calculatorState.displayValue = displayValue.length > 1 ? displayValue.slice(0, -1) : '0';
    }

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
        confirmCalcBtn.addEventListener('click', () => {
            if (paymentValueInput && calcDisplay) {
                const calcValueFormatted = calcDisplay.value;
                paymentValueInput.value = calcValueFormatted;
                paymentValueInput.dispatchEvent(new Event('input'));
            }
            if (calculatorModal) calculatorModal.style.display = 'none';
            resetCalculator();
            updateDisplay();
        });
    } else { console.error("[PaymentController] Botão 'confirmCalcBtn' não encontrado."); }

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
    } else { console.error("[PaymentController] Botão 'openCalculatorBtn' não encontrado."); }

    if (closeCalcBtnX) {
        closeCalcBtnX.addEventListener('click', () => {
            if (calculatorModal) calculatorModal.style.display = 'none';
            resetCalculator();
            updateDisplay();
        });
    } else { console.warn("[PaymentController] Botão 'closeCalcBtnX' da calculadora não encontrado."); }
    // --- FIM LISTENERS CALCULADORA ---


    // --- LISTENERS DO MODAL DE CLIENTE ---
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
        saveCustomerBtn.classList.toggle('cursor-not-allowed', !shouldEnable);
    };

    if (customerNameInput) customerNameInput.addEventListener('input', enableSaveButtonCheck);
    else console.error("[PaymentController] Input 'customerNameInput' não encontrado para listener.");

    if (customerCpfInput) customerCpfInput.addEventListener('input', enableSaveButtonCheck);
    else console.error("[PaymentController] Input 'customerCpfInput' não encontrado para listener.");
    // --- FIM LISTENERS MODAL CLIENTE ---


    paymentInitialized = true;
    console.log("[PaymentController] Inicializado.");
}; // Fim de initPaymentController
