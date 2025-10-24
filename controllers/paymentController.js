// --- CONTROLLERS/PAYMENTCONTROLLER.JS (Painel 3) ---
import { currentTableId, currentOrderSnapshot } from "/app.js"; // Apenas estados globais necessários
import { formatCurrency, calculateItemsValue, getNumericValueFromCurrency } from "/utils.js";
import { getTableDocRef } from "/services/firebaseService.js";
import { updateDoc, arrayUnion, arrayRemove, writeBatch } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { openManagerAuthModal } from "./managerController.js";
// CORRIGIDO: Importa a função diretamente (ela já está exportada no panelController)
import { handleTableTransferConfirmed } from "./panelController.js";

// --- VARIÁVEIS DE ELEMENTOS (Definidas na função init) ---
let paymentSplitsContainer, addSplitAccountBtn;
let reviewItemsList;
let orderSubtotalDisplay, orderServiceTaxDisplay, orderTotalDisplay, valuePerDinerDisplay, remainingBalanceDisplay;
let toggleServiceTaxBtn, dinersSplitInput;
let paymentSummaryList, chargeInputs, openCustomerRegBtn, customerSearchInput, paymentMethodButtonsContainer, paymentValueInput, openCalculatorBtn, addPaymentBtn;
let finalizeOrderBtn, openNfeModalBtn;
let calculatorModal, calcDisplay, calcButtons, closeCalcBtnX; // Elementos da Calculadora
let selectiveTransferModal, targetTableInput, checkTargetTableBtn, confirmTransferBtn, transferStatus, transferItemsList; // Elementos Transferência
let tableTransferModal; // Elementos Transferência de Mesa

// Estado local
let isMassSelectionActive = false;
let paymentInitialized = false;


// --- FUNÇÕES DE CÁLCULO E UTILIDADE ---
const calculateTotal = (subtotal, applyServiceTax) => {
    const taxRate = applyServiceTax ? 0.10 : 0;
    const serviceValue = subtotal * taxRate;
    const total = subtotal + serviceValue;
    return { total, serviceValue };
};
const updateText = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
};
const groupMainAccountItems = (orderSnapshot) => {
    if (!orderSnapshot || !orderSnapshot.sentItems) return {}; // Retorna objeto vazio se não houver dados
    const sentItems = orderSnapshot.sentItems || [];

    const itemsInSplits = Object.values(orderSnapshot.splits || {})
                                .flatMap(split => split.items.map(item => item.orderId + item.sentAt));

    const mainAccountItems = sentItems.filter(item => {
        const key = item.orderId + item.sentAt;
        return !itemsInSplits.includes(key);
    });

    // Agrupamento
    return mainAccountItems.reduce((acc, item) => {
        const groupKey = `${item.name}-${item.note || ''}`;
        if (!acc[groupKey]) {
            acc[groupKey] = { items: [], totalCount: 0, totalValue: 0, groupKey: groupKey };
        }
        acc[groupKey].items.push(item);
        acc[groupKey].totalCount++;
        acc[groupKey].totalValue += (item.price || 0); // Garante que price exista
        return acc;
    }, {});
};

// --- FUNÇÕES DE RENDERIZAÇÃO ---

// Renderiza Itens no Resumo da Conta (com checkboxes)
const renderReviewItemsList = (orderSnapshot) => {
    if (!reviewItemsList) return;
    const groupedItems = groupMainAccountItems(orderSnapshot);
    const mainAccountItemsCount = Object.values(groupedItems).reduce((sum, group) => sum + group.totalCount, 0);

    // Atualiza ícones de ação em massa
    const transferBtn = document.getElementById('itemMassTransferBtn');
    const deleteBtn = document.getElementById('itemMassDeleteBtn');
    if(transferBtn) transferBtn.classList.toggle('text-yellow-400', isMassSelectionActive);
    if(deleteBtn) deleteBtn.classList.toggle('text-red-400', isMassSelectionActive);
    if(transferBtn) transferBtn.classList.toggle('text-gray-400', !isMassSelectionActive);
    if(deleteBtn) deleteBtn.classList.toggle('text-gray-400', !isMassSelectionActive);

    if (mainAccountItemsCount === 0) {
        reviewItemsList.innerHTML = `<div class="text-sm text-dark-placeholder italic p-2">Nenhum item na conta principal.</div>`;
        // Garante que botões de ação fiquem desabilitados se não houver itens
         if (transferBtn) transferBtn.disabled = true;
         if (deleteBtn) deleteBtn.disabled = true;
         const selectAll = document.getElementById('selectAllItems');
         if(selectAll) selectAll.disabled = true;
        return;
    } else {
        // Habilita botões se houver itens (o estado checked controla o clique)
        if (transferBtn) transferBtn.disabled = false;
        if (deleteBtn) deleteBtn.disabled = false;
        const selectAll = document.getElementById('selectAllItems');
        if(selectAll) selectAll.disabled = false;
    }

    const listHtml = Object.values(groupedItems).map(group => {
        const firstItem = group.items[0];
        const groupKey = group.groupKey;
        const massItemKeys = group.items.map(item => `${item.orderId}_${item.sentAt}`).join(',');
        const disabledAttr = isMassSelectionActive ? '' : 'disabled';
        // Verifica se o checkbox para este grupo específico estava marcado antes de re-renderizar
        const existingCheckbox = document.querySelector(`.item-select-checkbox[data-group-key="${groupKey}"]`);
        const checkedAttr = (existingCheckbox && existingCheckbox.checked) ? 'checked' : '';


        return `
            <div class="flex items-start justify-between py-1 border-b border-gray-600 hover:bg-gray-700 transition">
                <input type="checkbox" class="item-select-checkbox mt-1.5 ml-1 mr-2 h-4 w-4 rounded bg-dark-input border-gray-500 text-pumpkin focus:ring-pumpkin"
                       data-group-key="${groupKey}" data-item-keys="${massItemKeys}"
                       ${disabledAttr} ${checkedAttr}>
                <div class="flex flex-col flex-grow min-w-0 pr-2">
                    <span class="text-sm font-semibold text-dark-text">${firstItem.name} (${group.totalCount}x)</span>
                    ${firstItem.note ? `<span class="text-xs text-dark-placeholder truncate">(${firstItem.note})</span>` : ''}
                </div>
                <span class="text-sm font-bold text-pumpkin flex-shrink-0">${formatCurrency(group.totalValue)}</span>
            </div>
        `;
    }).join('');

    // Cabeçalho com botões de ação
    reviewItemsList.innerHTML = `
        <div class="flex justify-between items-center pb-2 border-b border-gray-600 mb-2">
            <label class="flex items-center space-x-2 text-sm font-semibold text-dark-text">
                <input type="checkbox" id="selectAllItems" class="h-4 w-4 rounded bg-dark-input border-gray-500 text-pumpkin focus:ring-pumpkin">
                <span>Todos</span>
            </label>
            <div class="flex space-x-2">
                 <button id="massTransferBtn" class="px-2 py-1 text-xs bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition disabled:opacity-50" title="Transferir (Gerente)">T (<span id="selectedItemsCount">0</span>)</button>
                 <button id="massDeleteBtn" class="px-2 py-1 text-xs bg-red-600 text-white rounded-lg hover:bg-red-700 transition disabled:opacity-50" title="Excluir (Gerente)">X (<span id="selectedItemsCountDelete">0</span>)</button>
            </div>
        </div>
        <div class="border border-gray-600 p-2 rounded-lg bg-dark-bg max-h-48 overflow-y-auto">
            ${listHtml}
        </div>
        {/* <p class="text-sm text-dark-placeholder italic p-2 mt-2">Total de ${mainAccountItemsCount} itens na conta principal.</p> */}
    `;

    // Reanexa listeners após renderizar
    attachReviewListListeners();
};

// Renderiza Pagamentos Registrados
const renderRegisteredPayments = (payments) => {
    if (!paymentSummaryList) return;
    paymentSummaryList.innerHTML = '';
    if (!payments || payments.length === 0) {
        paymentSummaryList.innerHTML = `<p class="text-xs text-dark-placeholder italic p-2">Nenhum pagamento registrado.</p>`;
    } else {
        payments.forEach(p => {
            paymentSummaryList.innerHTML += `
                <div class="flex justify-between items-center py-1 border-b border-gray-700">
                    <div class="flex flex-col">
                        <span class="text-xs text-gray-400">${p.method}</span>
                        <span class="font-semibold text-sm text-dark-text">${formatCurrency(p.value)}</span>
                    </div>
                    <button class="text-red-500 hover:text-red-400 transition" onclick="deletePayment(${p.timestamp})" title="Excluir Pagamento (Gerente)">
                        <i class="fas fa-trash text-sm"></i>
                    </button>
                </div>
            `;
        });
    }
};

// Renderiza Contas Divididas (Placeholder)
const renderPaymentSplits = (orderSnapshot) => {
     if (!paymentSplitsContainer) return;
     // Lógica placeholder por enquanto
     paymentSplitsContainer.innerHTML = `<div class="text-sm text-dark-placeholder italic p-2">Funcionalidade de divisão de contas em desenvolvimento.</div>`;
     if(addSplitAccountBtn) addSplitAccountBtn.disabled = true; // Desabilita botão por hora
};

// Renderiza o Resumo Financeiro Total
export const renderPaymentSummary = (tableId, orderSnapshot) => {
    if (!orderSnapshot || !paymentInitialized) return; // Só renderiza se o controller estiver init

    const subtotal = orderSnapshot.total || 0;
    const payments = orderSnapshot.payments || [];
    const currentPaymentsTotal = payments.reduce((sum, p) => sum + (p.value || 0), 0);
    const serviceTaxApplied = orderSnapshot.serviceTaxApplied === undefined ? true : orderSnapshot.serviceTaxApplied; // Default true
    const { total: generalTotal, serviceValue } = calculateTotal(subtotal, serviceTaxApplied);
    const diners = parseInt(dinersSplitInput?.value) || 1;
    const valuePerDiner = diners > 0 ? generalTotal / diners : 0;
    const remainingBalance = generalTotal - currentPaymentsTotal;
    const isClosed = remainingBalance <= 0.01; // Considera pequena margem para float
    const displayBalance = Math.abs(remainingBalance);

    // Atualiza textos
    const paymentTableNumberEl = document.getElementById('payment-table-number');
    if(paymentTableNumberEl) paymentTableNumberEl.textContent = `Mesa ${tableId}`;

    updateText('orderSubtotalDisplayPayment', formatCurrency(subtotal));
    updateText('orderServiceTaxDisplayPayment', formatCurrency(serviceValue));
    updateText('orderTotalDisplayPayment', formatCurrency(generalTotal));
    updateText('valuePerDinerDisplay', formatCurrency(valuePerDiner));

    // Atualiza Valor Restante/Troco
    if (remainingBalanceDisplay) {
        remainingBalanceDisplay.textContent = formatCurrency(displayBalance);
        const label = remainingBalanceDisplay.previousElementSibling; // Pega o <span> antes
        remainingBalanceDisplay.classList.remove('text-red-400', 'text-green-400', 'text-dark-text');
        if (!isClosed) {
            remainingBalanceDisplay.classList.add('text-red-400');
            if(label) label.textContent = 'VALOR RESTANTE:';
        } else if (remainingBalance < -0.01) {
            remainingBalanceDisplay.classList.add('text-green-400');
            if(label) label.textContent = 'TROCO:';
        } else {
            remainingBalanceDisplay.classList.add('text-dark-text'); // Ou green se preferir indicar pago
            if(label) label.textContent = 'VALOR RESTANTE:';
        }
    }

    // Botão Taxa
    if (toggleServiceTaxBtn) {
        toggleServiceTaxBtn.textContent = serviceTaxApplied ? 'Remover' : 'Aplicar';
        toggleServiceTaxBtn.classList.toggle('bg-green-600', serviceTaxApplied);
        toggleServiceTaxBtn.classList.toggle('hover:bg-green-700', serviceTaxApplied);
        toggleServiceTaxBtn.classList.toggle('bg-red-600', !serviceTaxApplied);
        toggleServiceTaxBtn.classList.toggle('hover:bg-red-700', !serviceTaxApplied);
    }

    // Botões Finalizar/NFe/Add Pagamento
    if (finalizeOrderBtn) finalizeOrderBtn.disabled = !isClosed;
    if (openNfeModalBtn) openNfeModalBtn.disabled = !isClosed;
    if (addPaymentBtn) addPaymentBtn.disabled = isClosed;

    // Renderiza sub-componentes
    renderReviewItemsList(orderSnapshot);
    renderRegisteredPayments(payments);
    renderPaymentSplits(orderSnapshot);
};


// --- LÓGICAS DE AÇÃO ---

// Ativa/Desativa modo de seleção em massa
export function activateItemSelection(action) {
    const checkboxes = document.querySelectorAll('.item-select-checkbox');
    if (!checkboxes.length && !isMassSelectionActive) { alert("Não há itens para selecionar."); return; }

    if (!isMassSelectionActive) {
        isMassSelectionActive = true;
        checkboxes.forEach(cb => { cb.disabled = false; cb.checked = false; });
        alert(`SELEÇÃO ATIVA para ${action.toUpperCase()}. Clique no ícone novamente para executar.`);
    } else {
        isMassSelectionActive = false;
        const selectedGroups = Array.from(checkboxes).filter(cb => cb.checked).map(cb => ({ groupKey: cb.dataset.groupKey, itemKeys: cb.dataset.itemKeys.split(',') }));
        checkboxes.forEach(cb => { cb.disabled = true; cb.checked = false; }); // Desabilita e desmarca

        if (selectedGroups.length === 0) {
            alert("Nenhum item selecionado. Modo desativado.");
        } else if (action === 'transfer') {
            const allItemKeys = selectedGroups.flatMap(group => group.itemKeys);
            const itemsToTransferPayload = allItemKeys.map(key => {
                const [orderId, sentAt] = key.split('_');
                // Usa o snapshot mais recente para garantir dados corretos
                return currentOrderSnapshot?.sentItems?.find(item => item.orderId === orderId && String(item.sentAt) === sentAt);
            }).filter(Boolean); // Filtra itens não encontrados (segurança)
            if (itemsToTransferPayload.length > 0) {
                openTableTransferModal(itemsToTransferPayload);
            } else {
                alert("Erro ao encontrar itens selecionados para transferência.");
            }
        } else if (action === 'delete') {
            handleMassDeleteConfirmed(selectedGroups);
        }
    }
    renderReviewItemsList(currentOrderSnapshot); // Re-renderiza para atualizar UI (ícones e checkboxes)
}
// Expor globalmente se necessário (já exposto no app.js)
// window.activateItemSelection = activateItemSelection;

// Ponto de entrada para ações em massa (chamado pelo HTML)
export const handleMassActionRequest = (action) => {
    if (isMassSelectionActive) {
        activateItemSelection(action); // Executa se já ativo
    } else {
        // Pede senha para ativar
        openManagerAuthModal(action === 'delete' ? 'openMassDelete' : 'openMassTransfer', action);
    }
};
// Expor globalmente (já exposto no app.js)
// window.handleMassActionRequest = handleMassActionRequest;


// Confirmação Exclusão em Massa
export const handleMassDeleteConfirmed = async (selectedGroups) => {
     if (!currentTableId || !currentOrderSnapshot || selectedGroups.length === 0) return;

    try {
        const tableRef = getTableDocRef(currentTableId);

        let valueRemoved = 0;
        const groupKeysToRemove = selectedGroups.map(g => g.groupKey);

        // Filtra os sentItems para obter a nova lista e calcular valor removido
        const sentItemsAfterRemoval = currentOrderSnapshot.sentItems.filter(item => {
             const itemGroupKey = `${item.name}-${item.note || ''}`;
             if (groupKeysToRemove.includes(itemGroupKey)) {
                 valueRemoved += (item.price || 0);
                 return false; // Não inclui este item na nova lista
             }
             return true; // Mantém este item
        });

        const newTotal = Math.max(0, (currentOrderSnapshot.total || 0) - valueRemoved);

        // Atualiza o Firebase em uma única operação
        await updateDoc(tableRef, {
            sentItems: sentItemsAfterRemoval,
            total: newTotal
        });

        alert(`Total de ${selectedGroups.length} grupos (${groupKeysToRemove.length} itens únicos, pode haver mais instâncias) removidos. Valor: ${formatCurrency(valueRemoved)}.`);

    } catch (e) {
        console.error("Erro ao remover itens em massa:", e);
        alert("Falha ao remover itens em massa da conta.");
    }
 };
// Expor globalmente se necessário (já exposto no app.js)
// window.handleMassDeleteConfirmed = handleMassDeleteConfirmed;


// Abre Modal de Transferência de Mesa
export function openTableTransferModal(items) {
     window.itemsToTransfer = items; // Armazena payload
     const itemCount = items.length;
     const modal = document.getElementById('tableTransferModal');
     if (!modal) return;

     const title = document.getElementById('transferModalTitle');
     const origin = document.getElementById('transferOriginTable');
     const targetInput = document.getElementById('targetTableInput');
     const dinersContainer = document.getElementById('newTableDinersInput');
     const confirmBtn = document.getElementById('confirmTableTransferBtn');

     if(title) title.textContent = `Transferir ${itemCount} Item(s)`;
     if(origin) origin.textContent = `Mesa ${currentTableId}`;
     if(targetInput) targetInput.value = '';
     if(dinersContainer) dinersContainer.classList.add('hidden');
     if(confirmBtn) {
         confirmBtn.textContent = 'Prosseguir';
         confirmBtn.disabled = true; // Desabilita até verificar mesa
     }

     modal.style.display = 'flex';
 };
// Expor globalmente (já exposto no app.js)
// window.openTableTransferModal = openTableTransferModal;


// Confirma Transferência de Mesa (Função que *chama* a lógica do panelController)
export function handleConfirmTableTransfer() {
     const targetTableInput = document.getElementById('targetTableInput');
     const targetTableNumber = targetTableInput?.value.trim();

     if (!targetTableNumber || parseInt(targetTableNumber) <= 0 || targetTableNumber === currentTableId) {
         alert("Insira um número de mesa de destino válido e diferente.");
         return;
     }

     const items = window.itemsToTransfer || [];
     if(items.length === 0) {
         alert("Erro: Nenhum item selecionado para transferência.");
         return;
     }

     const dinersInput = document.getElementById('newTableDiners');
     const sectorInput = document.getElementById('newTableSector');
     const dinersContainer = document.getElementById('newTableDinersInput');

     let diners = 0;
     let sector = '';

     if (dinersContainer && !dinersContainer.classList.contains('hidden')) {
         diners = parseInt(dinersInput?.value);
         sector = sectorInput?.value;
         if (!diners || !sector) {
             alert('Preencha pessoas e setor para abrir a nova mesa.');
             return;
         }
     }

     const confirmBtn = document.getElementById('confirmTableTransferBtn');
     if(confirmBtn) confirmBtn.disabled = true;

     // Chama a função importada do panelController
     handleTableTransferConfirmed(currentTableId, targetTableNumber, items, diners, sector);

     const modal = document.getElementById('tableTransferModal');
     if(modal) modal.style.display = 'none';
     window.itemsToTransfer = []; // Limpa payload
 };
// Expor globalmente (já exposto no app.js)
// window.handleConfirmTableTransfer = handleConfirmTableTransfer;


// Adiciona Conta Dividida (Placeholder)
export const handleAddSplitAccount = async () => { alert("Divisão de conta em desenvolvimento."); };
// Expor globalmente (já exposto no app.js)
// window.handleAddSplitAccount = handleAddSplitAccount;


// Placeholders para ações de split
const openPaymentModalForSplit = (splitKey) => { alert(`Pagar Conta ${splitKey} (DEV)`); };
window.openPaymentModalForSplit = openPaymentModalForSplit;
const moveItemsToMainAccount = (splitKey) => { alert(`Desfazer Conta ${splitKey} (DEV)`); };
window.moveItemsToMainAccount = moveItemsToMainAccount;
const openSplitTransferModal = (targetKey, mode) => { alert(`Mover itens para/de ${targetKey} (DEV)`); };
window.openSplitTransferModal = openSplitTransferModal;


// Finaliza Conta (Placeholder)
export const handleFinalizeOrder = () => { alert("Finalizar Conta (DEV)"); };


// --- INICIALIZAÇÃO DO CONTROLLER ---

// Anexa listeners aos checkboxes e botões de ação em massa (chamado após renderReviewItemsList)
const attachReviewListListeners = () => {
    const selectAllItems = document.getElementById('selectAllItems');
    const itemCheckboxes = reviewItemsList?.querySelectorAll('.item-checkbox'); // Garante que reviewItemsList exista
    const massDeleteBtn = document.getElementById('massDeleteBtn');
    const massTransferBtn = document.getElementById('massTransferBtn');
    const selectedCountSpan = document.getElementById('selectedItemsCount');
    const selectedCountDeleteSpan = document.getElementById('selectedItemsCountDelete');

    const updateMassActionButtons = () => {
        const checkedCount = reviewItemsList?.querySelectorAll('.item-checkbox:checked').length || 0; // Garante que reviewItemsList exista
        if (massDeleteBtn) massDeleteBtn.disabled = checkedCount === 0;
        if (massTransferBtn) massTransferBtn.disabled = checkedCount === 0;
        if (selectedCountSpan) selectedCountSpan.textContent = checkedCount;
        if (selectedCountDeleteSpan) selectedCountDeleteSpan.textContent = checkedCount;
        if (selectAllItems) {
            // Garante que itemCheckboxes seja um array antes de verificar length
            selectAllItems.checked = Array.isArray(itemCheckboxes) && checkedCount === itemCheckboxes.length && itemCheckboxes.length > 0;
        }
    };

    if (selectAllItems) {
        // Usa cloneNode para limpar listeners antigos antes de adicionar novo
        const newSelectAll = selectAllItems.cloneNode(true);
        selectAllItems.parentNode.replaceChild(newSelectAll, selectAllItems);
        newSelectAll.addEventListener('change', (e) => {
            itemCheckboxes?.forEach(cb => cb.checked = e.target.checked); // Garante que itemCheckboxes exista
            updateMassActionButtons();
        });
    }

    if(itemCheckboxes && reviewItemsList) { // Garante que ambos existam
        itemCheckboxes.forEach(cb => {
            // Usa cloneNode para limpar listeners
            const newCb = cb.cloneNode(true);
            cb.parentNode.replaceChild(newCb, cb);
            newCb.addEventListener('change', updateMassActionButtons);
        });
    }


    // Reanexa listeners aos botões de ação em massa
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

    updateMassActionButtons(); // Atualiza estado inicial
};

export const initPaymentController = () => {
    if(paymentInitialized) return;
    console.log("[PaymentController] Inicializando...");

    // Mapeia Elementos
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
    selectiveTransferModal = document.getElementById('selectiveTransferModal');
    targetTableInput = document.getElementById('targetTableInput');
    checkTargetTableBtn = document.getElementById('checkTargetTableBtn'); // Este não existe mais, a lógica está no input
    confirmTransferBtn = document.getElementById('confirmTransferBtn');
    transferStatus = document.getElementById('transferStatus');
    transferItemsList = document.getElementById('transferItemsList');
    tableTransferModal = document.getElementById('tableTransferModal');


    // Adiciona Listeners Essenciais
    if(toggleServiceTaxBtn) toggleServiceTaxBtn.addEventListener('click', async () => {
        if (!currentTableId || !currentOrderSnapshot) return;
        const currentStatus = currentOrderSnapshot.serviceTaxApplied === undefined ? true : currentOrderSnapshot.serviceTaxApplied;
        try {
            await updateDoc(getTableDocRef(currentTableId), { serviceTaxApplied: !currentStatus });
            console.log(`Taxa de serviço ${!currentStatus ? 'aplicada' : 'removida'}.`);
        } catch(e) { console.error("Erro ao alternar taxa:", e); }
    });

    if(dinersSplitInput) dinersSplitInput.addEventListener('input', () => renderPaymentSummary(currentTableId, currentOrderSnapshot));

    // if(addSplitAccountBtn) addSplitAccountBtn.addEventListener('click', handleAddSplitAccount); // Desabilitado por hora

    if(paymentMethodButtonsContainer) paymentMethodButtonsContainer.addEventListener('click', (e) => {
        const btn = e.target.closest('.payment-method-btn');
        if (btn) {
            paymentMethodButtonsContainer.querySelectorAll('.payment-method-btn').forEach(b => b.classList.remove('active', 'bg-pumpkin', 'text-white'));
            btn.classList.add('active', 'bg-pumpkin', 'text-white');
            if(addPaymentBtn) addPaymentBtn.disabled = (remainingBalanceDisplay.classList.contains('text-green-400') || remainingBalanceDisplay.textContent === 'R$ 0,00'); // Re-habilita se não estiver pago
        }
    });

    if(addPaymentBtn) addPaymentBtn.addEventListener('click', async () => {
         if (!currentTableId || !currentOrderSnapshot) return;
         const value = getNumericValueFromCurrency(paymentValueInput.value);
         const activeMethodBtn = paymentMethodButtonsContainer?.querySelector('.payment-method-btn.active');
         const method = activeMethodBtn ? activeMethodBtn.dataset.method : null;

         if (!method || value <= 0) { alert("Selecione um método e insira um valor válido."); return; }

         const newPayment = { method, value, timestamp: Date.now(), userId: window.userId || 'unknown' };
         try {
             await updateDoc(getTableDocRef(currentTableId), { payments: arrayUnion(newPayment) });
             paymentValueInput.value = 'R$ 0,00';
             activeMethodBtn?.classList.remove('active', 'bg-pumpkin', 'text-white');
             addPaymentBtn.disabled = true; // Desabilita após adicionar
         } catch(e) { console.error("Erro ao adicionar pagamento:", e); alert("Falha ao registrar pagamento."); }
    });

    if(finalizeOrderBtn) finalizeOrderBtn.addEventListener('click', handleFinalizeOrder);
    // Listener do NFe está no app.js

    // Listeners da Calculadora
    if (openCalculatorBtn) openCalculatorBtn.addEventListener('click', () => { if(calculatorModal) calculatorModal.style.display = 'flex'; /* Resto da lógica mantida */ });
    if (closeCalcBtnX) closeCalcBtnX.addEventListener('click', () => { if (calculatorModal) calculatorModal.style.display = 'none'; });
    if (calcButtons) calcButtons.addEventListener('click', (e) => { /* ... (lógica mantida) ... */ });

     // Listener do Modal de Transferência de Mesa (confirmação)
    const confirmTableTransferBtn = document.getElementById('confirmTableTransferBtn');
    if(confirmTableTransferBtn) confirmTableTransferBtn.addEventListener('click', handleConfirmTableTransfer);

    // Listener para input da mesa de destino (verificação)
    if (targetTableInput) targetTableInput.addEventListener('input', async (e) => {
        const tableNumber = e.target.value.trim();
        const confirmBtn = document.getElementById('confirmTableTransferBtn');
        const newTableDinersInputEl = document.getElementById('newTableDinersInput'); // Elemento container
        const transferStatusEl = document.getElementById('transferStatus'); // Para feedback

        // Reseta estado
        if(confirmBtn) confirmBtn.disabled = true;
        if(newTableDinersInputEl) newTableDinersInputEl.classList.add('hidden');
        if(confirmBtn) confirmBtn.textContent = 'Verificando...';
        if(transferStatusEl) transferStatusEl.classList.add('hidden');

        if (tableNumber && tableNumber !== currentTableId) {
             try {
                const targetRef = getTableDocRef(tableNumber);
                const targetSnap = await getDoc(targetRef);
                if (targetSnap.exists() && targetSnap.data().status?.toLowerCase() === 'open') {
                     if(confirmBtn) { confirmBtn.textContent = `Transferir para Mesa ${tableNumber}`; confirmBtn.disabled = false; }
                     if(transferStatusEl) { transferStatusEl.textContent = `Mesa ${tableNumber} está aberta.`; transferStatusEl.classList.remove('hidden', 'text-red-500'); transferStatusEl.classList.add('text-green-500'); }
                } else {
                     if(newTableDinersInputEl) newTableDinersInputEl.classList.remove('hidden');
                     if(confirmBtn) { confirmBtn.textContent = `Abrir Mesa ${tableNumber} e Transferir`; confirmBtn.disabled = false; }
                     if(transferStatusEl) { transferStatusEl.textContent = `Mesa ${tableNumber} está fechada. Será aberta ao transferir.`; transferStatusEl.classList.remove('hidden', 'text-green-500'); transferStatusEl.classList.add('text-yellow-500'); }
                }
             } catch (error) {
                 console.error("Erro ao verificar mesa de destino:", error);
                 if(confirmBtn) confirmBtn.textContent = 'Erro ao verificar';
                 if(transferStatusEl) { transferStatusEl.textContent = 'Erro ao verificar mesa.'; transferStatusEl.classList.remove('hidden', 'text-green-500'); transferStatusEl.classList.add('text-red-500'); }
             }
        } else if (tableNumber === currentTableId) {
             if(confirmBtn) confirmBtn.textContent = 'Mesa igual à atual';
             if(transferStatusEl) { transferStatusEl.textContent = 'Não pode transferir para a mesma mesa.'; transferStatusEl.classList.remove('hidden', 'text-green-500'); transferStatusEl.classList.add('text-red-500'); }
        } else {
             if(confirmBtn) confirmBtn.textContent = 'Prosseguir'; // Estado inicial se vazio
        }
   });


    paymentInitialized = true;
    console.log("[PaymentController] Inicializado.");
};
