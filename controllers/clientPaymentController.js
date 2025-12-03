// --- CONTROLLERS/CLIENTPAYMENTCONTROLLER.JS (CORRIGIDO: ABAS CRM E SEM REDIRECT) ---

import { db, auth, getTableDocRef, appId, getCustomersCollectionRef, getVouchersCollectionRef } from "/services/firebaseService.js";
import { formatCurrency, showToast, toggleLoading } from "/utils.js";
import { onSnapshot, doc, updateDoc, arrayUnion, serverTimestamp, writeBatch, increment, getDocs, query, orderBy } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";

// --- Variáveis de Estado ---
let currentClientUser = null;
let unsubscribeTable = null;    // Listener da Mesa (para conta em tempo real)
let unsubscribeCustomer = null; // Listener do Cliente (para pontos/CRM)
let paymentInitialized = false;
let VOUCHER_RULES_CACHE = [];   // Cache para regras de voucher

// --- Elementos da DOM ---
let reviewItemsList, crmClientSection;
let orderSubtotalDisplay, orderServiceTaxDisplay, orderTotalDisplayPayment;
let paymentTableNumber, requestBillBtn;
let clientCrmName, clientCrmPoints, clientCrmLastVisit, clientCrmPhoto;

/**
 * Inicializa o controlador da tela de pagamento do cliente.
 */
export const initClientPaymentController = () => {
    if (paymentInitialized) return;
    console.log("[ClientPayment] Inicializando...");

    // 1. Mapeamento de Elementos da Interface
    reviewItemsList = document.getElementById('reviewItemsList');
    crmClientSection = document.getElementById('crmClientSection');
    paymentTableNumber = document.getElementById('payment-table-number');
    
    // Displays de totais financeiros
    orderSubtotalDisplay = document.getElementById('orderSubtotalDisplayPayment');
    orderServiceTaxDisplay = document.getElementById('orderServiceTaxDisplayPayment');
    orderTotalDisplayPayment = document.getElementById('orderTotalDisplayPayment');

    // Botão de Pedir Conta
    requestBillBtn = document.getElementById('requestBillBtn');
    if (requestBillBtn) {
        requestBillBtn.addEventListener('click', handleRequestBill);
    }

    // Elementos do Cabeçalho CRM
    clientCrmName = document.getElementById('clientCrmName');
    clientCrmPoints = document.getElementById('crm-points-balance'); 
    clientCrmLastVisit = document.getElementById('clientCrmLastVisit');
    clientCrmPhoto = document.getElementById('clientCrmPhoto');

    // 2. Configuração das Abas do CRM (CORRIGIDO)
    const tabButtons = document.querySelectorAll('.crm-tab-btn');
    const tabContents = document.querySelectorAll('.crm-tab-content');

    if (tabButtons.length > 0) {
        tabButtons.forEach(button => {
            button.addEventListener('click', () => {
                // Remove o estado ativo de TODOS os botões
                tabButtons.forEach(btn => {
                    btn.classList.remove('active', 'border-pumpkin', 'text-pumpkin');
                    btn.classList.add('border-transparent', 'text-gray-400');
                });
                
                // Esconde TODOS os conteúdos (usando a classe do CSS)
                tabContents.forEach(content => {
                    content.classList.remove('active'); // Remove a classe que faz display: block
                    content.style.display = ''; // Limpa styles inline se houver
                });

                // Ativa o botão CLICADO
                button.classList.add('active', 'border-pumpkin', 'text-pumpkin');
                button.classList.remove('border-transparent', 'text-gray-400');
                
                // Mostra o conteúdo correspondente
                const tabId = button.dataset.tab;
                const content = document.getElementById(tabId);
                if(content) {
                    content.classList.add('active'); // Adiciona a classe que faz display: block
                }
            });
        });
    }

    // 3. Listeners de Navegação
    window.addEventListener('screenChanged', (e) => {
        if (e.detail.screenId === 'clientPaymentScreen') {
            console.log("[ClientPayment] Tela de pagamento ativada. Iniciando listeners...");
            startListeners(); // Inicia listeners
        } else {
            stopListeners(); // Para listeners
        }
    });

    // 4. Detecção de Autenticação
    onAuthStateChanged(auth, (user) => {
        if (user && !user.isAnonymous) {
            currentClientUser = user;
            if(crmClientSection) crmClientSection.style.display = 'block'; 
            // Verifica se o elemento da tela existe e está visível (offsetParent != null)
            const screen = document.getElementById('clientPaymentScreen');
            if (screen && screen.offsetParent !== null) {
                startListeners();
            }
        } else {
            currentClientUser = null;
            if(crmClientSection) crmClientSection.style.display = 'none';
            const screen = document.getElementById('clientPaymentScreen');
            if (screen && screen.offsetParent !== null) {
                startListeners();
            }
        }
    });

    paymentInitialized = true;
};

/**
 * Para os listeners do Firebase.
 */
function stopListeners() {
    if (unsubscribeTable) {
        console.log("[ClientPayment] Parando listener da mesa.");
        unsubscribeTable();
        unsubscribeTable = null;
    }
    if (unsubscribeCustomer) {
        console.log("[ClientPayment] Parando listener do cliente.");
        unsubscribeCustomer();
        unsubscribeCustomer = null;
    }
}

/**
 * Busca regras de voucher.
 */
async function fetchVoucherRules() {
    try {
        const q = query(getVouchersCollectionRef(), orderBy('points', 'asc'));
        const snapshot = await getDocs(q);
        VOUCHER_RULES_CACHE = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        return VOUCHER_RULES_CACHE;
    } catch (e) {
        console.error("Erro ao buscar regras de vouchers:", e);
        return [];
    }
}

/**
 * Inicia os listeners. 
 */
function startListeners() {
    stopListeners();

    // ID da mesa global
    const activeTableId = window.currentTableId;

    // 1. Listener do Cliente (CRM)
    if (currentClientUser) {
        console.log("[ClientPayment] Buscando dados CRM para:", currentClientUser.uid);
        const customerRef = doc(getCustomersCollectionRef(), currentClientUser.uid);
        
        unsubscribeCustomer = onSnapshot(customerRef, (docSnap) => {
            if (docSnap.exists()) {
                fetchVoucherRules().then(() => renderCrmData(docSnap.data()));
            } else {
                fetchVoucherRules().then(() => renderCrmData({ 
                    points: 0, 
                    name: currentClientUser.displayName, 
                    photoURL: currentClientUser.photoURL 
                }));
            }
        }, (error) => console.error("[ClientPayment] Erro CRM:", error));
    }

    // 2. Listener da Mesa (Itens e Total)
    if (activeTableId) { 
        console.log("[ClientPayment] Iniciando listener para Mesa:", activeTableId);
        const tableRef = getTableDocRef(activeTableId);
        
        unsubscribeTable = onSnapshot(tableRef, (docSnap) => {
            if (docSnap.exists()) {
                const tableData = docSnap.data();
                
                // Se a mesa fechou, volta para o menu
                if (tableData.status === 'closed') {
                    showToast("Sua conta foi encerrada.", false);
                    if(window.goToScreen) window.goToScreen('clientOrderScreen');
                    return;
                }

                renderSentItems(tableData.sentItems || []);
                renderTotals(tableData);
                updateBillButtonState(tableData);
                if(paymentTableNumber) paymentTableNumber.textContent = `Mesa ${tableData.tableNumber}`;

            } else {
                console.warn("[ClientPayment] Mesa não encontrada (fechada?).");
                if(window.goToScreen) window.goToScreen('clientOrderScreen');
            }
        }, (error) => {
             console.error("[ClientPayment] Erro listener mesa:", error);
             if (error.code === 'permission-denied') {
                 if(window.goToScreen) window.goToScreen('clientOrderScreen');
             }
        });
    } else {
        // Se não há mesa, NÃO REDIRECIONA. Apenas limpa a view da conta.
        console.log("[ClientPayment] Nenhuma mesa ativa. Mostrando apenas CRM.");
        renderSentItems([]);
        renderTotals({});
        if(paymentTableNumber) paymentTableNumber.textContent = "Nenhuma Mesa";
        
        if (requestBillBtn) {
            requestBillBtn.innerHTML = 'Associe uma mesa para pedir';
            requestBillBtn.disabled = true;
            requestBillBtn.className = "w-full py-4 rounded-xl font-bold text-gray-400 bg-gray-700 cursor-not-allowed";
        }
    }
}

/**
 * Renderiza itens confirmados.
 */
function renderSentItems(sentItems) {
    if (!reviewItemsList) return;

    if (!sentItems || sentItems.length === 0) {
        reviewItemsList.innerHTML = `<div class="text-center text-gray-500 py-8 italic"><i class="fas fa-utensils text-2xl mb-2 opacity-50"></i><br>Nenhum pedido confirmado ainda.</div>`;
        return;
    }

    const groupedItems = sentItems.reduce((acc, item) => {
        const key = `${item.id}-${item.name}-${item.note || ''}`;
        if (!acc[key]) acc[key] = { ...item, count: 0, totalPrice: 0 };
        acc[key].count++;
        acc[key].totalPrice += (item.price || 0);
        return acc;
    }, {});

    reviewItemsList.innerHTML = Object.values(groupedItems).map(item => `
        <div class="flex justify-between items-center bg-dark-input p-3 mb-2 rounded-lg border border-gray-700 shadow-sm">
            <div class="flex flex-col flex-grow min-w-0 mr-2">
                <span class="font-semibold text-gray-200 text-sm md:text-base">${item.count}x ${item.name}</span>
                ${item.note ? `<span class="text-xs text-yellow-500 italic truncate max-w-[200px]"><i class="fas fa-comment-alt mr-1"></i>${item.note}</span>` : ''}
            </div>
            <span class="text-sm md:text-base font-bold text-indigo-400 whitespace-nowrap">${formatCurrency(item.totalPrice)}</span>
        </div>
    `).join('');
}

function renderTotals(tableData) {
    const sentItems = tableData.sentItems || [];
    const subtotal = sentItems.reduce((sum, item) => sum + (item.price || 0), 0);
    const serviceTax = (tableData.serviceTaxApplied) ? subtotal * 0.1 : 0;
    const total = subtotal + serviceTax;

    if (orderSubtotalDisplay) orderSubtotalDisplay.textContent = formatCurrency(subtotal);
    if (orderServiceTaxDisplay) orderServiceTaxDisplay.textContent = formatCurrency(serviceTax);
    if (orderTotalDisplayPayment) orderTotalDisplayPayment.textContent = formatCurrency(total);
    
    // Atualiza o "Valor por Pessoa" se os elementos existirem
    const diners = tableData.diners || 1;
    const dinersInput = document.getElementById('dinersSplitInput');
    const valuePerDinerEl = document.getElementById('valuePerDinerDisplay');
    if (dinersInput) dinersInput.value = diners;
    if (valuePerDinerEl) valuePerDinerEl.textContent = formatCurrency(total / diners);
}

function updateBillButtonState(tableData) {
    if (!requestBillBtn) return;
    if (tableData.billRequested) {
        requestBillBtn.innerHTML = '<i class="fas fa-check-circle mr-2"></i> Conta Solicitada';
        requestBillBtn.className = "w-full py-4 rounded-xl font-bold text-white shadow-lg transition bg-gray-600 cursor-not-allowed opacity-80";
        requestBillBtn.disabled = true;
    } else {
        requestBillBtn.innerHTML = '<i class="fas fa-file-invoice-dollar mr-2"></i> Solicitar Fechamento';
        requestBillBtn.className = "w-full py-4 rounded-xl font-bold text-white shadow-lg transition bg-green-600 hover:bg-green-700";
        requestBillBtn.disabled = false;
    }
}

/**
 * Renderiza dados do CRM.
 */
function renderCrmData(customerData) {
    const pointsBalanceEl = document.getElementById('crm-points-balance');
    if (pointsBalanceEl) pointsBalanceEl.textContent = customerData.points || 0;

    if(clientCrmName) clientCrmName.textContent = customerData.name || 'Cliente';
    if(clientCrmPhoto && customerData.photoURL) clientCrmPhoto.src = customerData.photoURL;
    if(clientCrmLastVisit) {
        if (customerData.lastVisit) {
            const date = customerData.lastVisit.toDate ? customerData.lastVisit.toDate() : new Date(customerData.lastVisit);
            clientCrmLastVisit.textContent = date.toLocaleDateString('pt-BR');
        } else {
            clientCrmLastVisit.textContent = 'Hoje';
        }
    }

    const vouchersDisponiveisEl = document.getElementById('crm-vouchers-disponiveis');
    if (vouchersDisponiveisEl) {
        const userPoints = customerData.points || 0;
        const availableVouchers = VOUCHER_RULES_CACHE; 

        if (availableVouchers.length > 0) {
            vouchersDisponiveisEl.innerHTML = availableVouchers.map(v => {
                const canAfford = userPoints >= v.points;
                const btnClass = canAfford ? 'bg-pumpkin hover:bg-pumpkin-dark text-white' : 'bg-gray-700 text-gray-400 cursor-not-allowed';
                const btnText = canAfford ? 'Resgatar' : `Faltam ${v.points - userPoints} pts`;

                return `
                <div class="flex items-center justify-between p-3 bg-dark-input border border-gray-700 rounded-lg mb-2">
                    <div>
                        <p class="font-bold text-white text-sm">${v.name}</p>
                        <p class="text-xs text-indigo-300 font-semibold">${v.points} Pontos</p>
                    </div>
                    <button class="resgate-voucher-btn px-3 py-1.5 rounded text-xs font-bold transition shadow-sm ${btnClass}" 
                            data-voucher-id="${v.id}" data-points-cost="${v.points}" 
                            data-discount-value="${v.value}" data-voucher-name="${v.name}"
                            ${!canAfford ? 'disabled' : ''}>${btnText}</button>
                </div>`;
            }).join('');
            _attachCrmListeners(); 
        } else {
             vouchersDisponiveisEl.innerHTML = `<p class="text-center text-sm text-gray-500 py-4">Nenhum voucher disponível.</p>`;
        }
    }
    
    // Aba: Histórico
    const orderHistoryEl = document.getElementById('crm-order-history');
    if (orderHistoryEl) {
        const history = customerData.orderHistory || [];
        if (history.length > 0) {
            history.sort((a, b) => (b.date || 0) - (a.date || 0));
            orderHistoryEl.innerHTML = history.map(order => {
                const dateVal = order.date ? new Date(order.date) : new Date();
                return `
                    <div class="flex justify-between items-center border-b border-gray-700 py-2">
                        <div>
                            <p class="text-white text-sm font-medium">Consumo</p>
                            <p class="text-xs text-gray-500">${dateVal.toLocaleDateString('pt-BR')}</p>
                        </div>
                        <div class="text-right">
                            <p class="text-indigo-400 text-sm font-bold">${formatCurrency(order.total || 0)}</p>
                            <p class="text-xs text-green-500 font-semibold">+${order.points || 0} pts</p>
                        </div>
                    </div>`;
            }).join('');
        } else {
             orderHistoryEl.innerHTML = `<p class="text-center text-sm text-gray-500 py-4">Nenhum histórico recente.</p>`;
        }
    }
}

async function handleVoucherResgate(e) {
    const btn = e.target.closest('.resgate-voucher-btn');
    if (!btn || btn.disabled) return;

    const voucherId = btn.dataset.voucherId;
    const POINTS_DEBIT = parseInt(btn.dataset.pointsCost);
    const DISCOUNT_VALUE = parseFloat(btn.dataset.discountValue);
    const voucherName = btn.dataset.voucherName;

    if (!currentClientUser) { showToast("Erro de autenticação.", true); return; }
    if (!window.currentTableId) { showToast("Nenhuma mesa vinculada para aplicar o desconto.", true); return; }

    if (!confirm(`Confirmar resgate: "${voucherName}"?\nSerão debitados ${POINTS_DEBIT} pontos e aplicado desconto de ${formatCurrency(DISCOUNT_VALUE)} na conta.`)) return;
    
    toggleLoading(btn, true, '...');

    try {
        const batch = writeBatch(db); 
        const customerRef = doc(getCustomersCollectionRef(), currentClientUser.uid);
        const tableRef = getTableDocRef(window.currentTableId);

        batch.update(customerRef, {
            points: increment(-POINTS_DEBIT),
            vouchersUsed: arrayUnion({
                voucherId: voucherId, name: voucherName, value: DISCOUNT_VALUE,
                pointsDebited: POINTS_DEBIT, date: Date.now()
            })
        });

        const paymentData = {
            id: `vouch_${Date.now()}`, method: 'Voucher', value: DISCOUNT_VALUE,
            timestamp: Date.now(), byUser: currentClientUser.displayName || 'App Cliente', isDiscount: true
        };
        
        batch.update(tableRef, { payments: arrayUnion(paymentData) });

        await batch.commit();
        showToast("Voucher resgatado com sucesso!", false);

    } catch (e) {
        console.error("Erro voucher:", e);
        showToast("Falha ao resgatar voucher.", true);
    } finally {
        toggleLoading(btn, false, 'Resgatar');
    }
}

function _attachCrmListeners() {
    document.querySelectorAll('.resgate-voucher-btn').forEach(btn => {
        const newBtn = btn.cloneNode(true);
        btn.parentNode.replaceChild(newBtn, btn);
        newBtn.addEventListener('click', handleVoucherResgate);
    });
}

async function handleRequestBill() {
    const btn = document.getElementById('requestBillBtn');
    const tableId = window.currentTableId;
    
    if (!tableId) { showToast("Erro: Nenhuma mesa vinculada.", true); return; }
    if (!confirm("Chamar o garçom para fechar a conta?")) return;

    const originalContent = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enviando...';

    try {
        const tableRef = getTableDocRef(tableId);
        await updateDoc(tableRef, {
            waiterNotification: "Pediu a Conta (App)",
            billRequested: true,
            clientOrderPending: false
        });
        showToast("Solicitação enviada!");
    } catch (e) {
        console.error("Erro ao pedir conta:", e);
        showToast("Erro ao enviar solicitação.", true);
        btn.disabled = false;
        btn.innerHTML = originalContent;
    }
}