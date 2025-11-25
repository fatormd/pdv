// --- CONTROLLERS/CASHIERCONTROLLER.JS (VERSÃO FINAL COMPLETA E OTIMIZADA) ---
import { db, appId, auth } from "/services/firebaseService.js";
import { collection, query, where, limit, addDoc, updateDoc, doc, onSnapshot, serverTimestamp, arrayUnion, getDocs, Timestamp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { formatCurrency, toggleLoading } from "/utils.js";
import { showToast, userId } from "/app.js";

let cashierModal, openScreen, statusScreen, sangriaModal;
let currentShift = null;
let unsubscribeShift = null;
let isInitialized = false;

// Elementos de Display
let elSalesMoney, elSalesDigital, elSalesTotal, elSalesProducts, elSalesService;
let elTotalSangria, elExpectedMoney, elDifferenceValue, elDifferenceContainer, elJustificationContainer;
let elTransactionsList;

export const initCashierController = () => {
    if (isInitialized) return;
    console.log("[Cashier] Inicializando Controller Avançado...");
    
    cashierModal = document.getElementById('cashierModal');
    sangriaModal = document.getElementById('sangriaModal');
    openScreen = document.getElementById('cashierOpenScreen');
    statusScreen = document.getElementById('cashierStatusScreen');

    // Mapeamento de Elementos de UI
    elSalesMoney = document.getElementById('cashierSalesMoney');
    elSalesDigital = document.getElementById('cashierSalesDigital');
    elSalesTotal = document.getElementById('cashierSalesTotal');
    elSalesProducts = document.getElementById('cashierTotalProducts');
    elSalesService = document.getElementById('cashierTotalService');
    elTotalSangria = document.getElementById('cashierTotalSangria');
    elExpectedMoney = document.getElementById('cashierExpectedMoney');
    elDifferenceValue = document.getElementById('cashierDifferenceValue');
    elDifferenceContainer = document.getElementById('cashierDifferenceContainer');
    elJustificationContainer = document.getElementById('cashierJustificationContainer');
    elTransactionsList = document.getElementById('cashierTransactionsList');

    // Listeners Principais
    document.getElementById('openCashierBtn')?.addEventListener('click', openCashierUI);
    document.getElementById('confirmOpenCashierBtn')?.addEventListener('click', handleOpenShift);
    document.getElementById('confirmCloseCashierBtn')?.addEventListener('click', handleCloseShift);
    
    document.getElementById('openSangriaModalBtn')?.addEventListener('click', () => {
        document.getElementById('sangriaValueInput').value = '';
        document.getElementById('sangriaReasonInput').value = '';
        if(sangriaModal) sangriaModal.style.display = 'flex';
        document.getElementById('sangriaValueInput').focus();
    });
    
    document.getElementById('confirmSangriaBtn')?.addEventListener('click', handleRegisterSangria);
    
    // Listener para cálculo em tempo real no fechamento
    const endFloatInput = document.getElementById('cashierEndFloat');
    if (endFloatInput) endFloatInput.addEventListener('input', calculateDifference);

    isInitialized = true;
};

const openCashierUI = async () => {
    if (!auth.currentUser) {
        showToast("Você precisa estar logado.", true);
        return;
    }
    if(cashierModal) cashierModal.style.display = 'flex';
    subscribeToCurrentShift(); 
};

const subscribeToCurrentShift = () => {
    if (unsubscribeShift) unsubscribeShift(); 
    const userEmail = auth.currentUser.email;
    const shiftsRef = collection(db, 'artifacts', appId, 'public', 'data', 'shifts');
    
    // Busca o turno ABERTO do usuário logado
    const q = query(shiftsRef, where('userId', '==', userEmail), where('status', '==', 'open'), limit(1));

    unsubscribeShift = onSnapshot(q, (snapshot) => {
        if (!snapshot.empty) {
            const docData = snapshot.docs[0];
            currentShift = { id: docData.id, ...docData.data() };
            renderStatusScreen();
        } else {
            currentShift = null;
            renderOpenScreen();
        }
    });
};

const renderOpenScreen = () => {
    if(openScreen) openScreen.style.display = 'block';
    if(statusScreen) statusScreen.style.display = 'none';
    const startInput = document.getElementById('cashierStartFloat');
    if(startInput) startInput.value = '';
};

const renderStatusScreen = async () => {
    if(openScreen) openScreen.style.display = 'none';
    if(statusScreen) statusScreen.style.display = 'block';
    
    if (!currentShift) return;

    const openDate = currentShift.openedAt?.toDate ? currentShift.openedAt.toDate() : new Date();
    document.getElementById('cashierOpenedAtDisplay').textContent = openDate.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
    document.getElementById('cashierStartFloatDisplay').textContent = formatCurrency(currentShift.initialBalance || 0);

    // --- CÁLCULO DE VENDAS (PARTE CRÍTICA RESTAURADA) ---
    const { stats, transactions } = await fetchSalesForShift(currentShift);
    
    if(elSalesMoney) elSalesMoney.textContent = formatCurrency(stats.totalMoney);
    if(elSalesDigital) elSalesDigital.textContent = formatCurrency(stats.totalDigital);
    if(elSalesTotal) elSalesTotal.textContent = formatCurrency(stats.totalMoney + stats.totalDigital);
    if(elSalesProducts) elSalesProducts.textContent = formatCurrency(stats.totalProducts);
    if(elSalesService) elSalesService.textContent = formatCurrency(stats.totalServiceTax);

    if (elTransactionsList) {
        if (transactions.length === 0) {
            elTransactionsList.innerHTML = '<p class="text-center text-xs text-gray-600 italic p-2">Nenhuma venda neste turno.</p>';
        } else {
            elTransactionsList.innerHTML = transactions.map(t => `
                <div class="flex justify-between items-center py-1 border-b border-gray-800 last:border-b-0 text-xs">
                    <div class="flex flex-col">
                        <span class="text-gray-300 font-bold">Mesa ${t.table}</span>
                        <span class="text-gray-500">${t.time} - ${t.methods.join(', ')}</span>
                    </div>
                    <span class="font-bold text-white">${formatCurrency(t.total)}</span>
                </div>
            `).join('');
        }
    }

    const sangrias = currentShift.sangrias || [];
    const totalSangria = sangrias.reduce((sum, s) => sum + (s.value || 0), 0);
    if(elTotalSangria) elTotalSangria.textContent = formatCurrency(totalSangria);
    
    const sangriaListEl = document.getElementById('sangriaList');
    if (sangriaListEl) {
        if (sangrias.length > 0) {
            sangriaListEl.innerHTML = sangrias.map(s => `
                <div class="flex justify-between border-b border-gray-800 pb-1 mb-1 text-xs">
                    <span class="text-gray-400">${s.reason}</span>
                    <span class="text-red-400 font-mono">-${formatCurrency(s.value)}</span>
                </div>`).join('');
        } else {
            sangriaListEl.innerHTML = '<p class="italic opacity-50 text-xs">Nenhuma sangria.</p>';
        }
    }

    // Dinheiro Esperado = Fundo Inicial + Vendas em Dinheiro - Sangrias
    const expectedMoney = (currentShift.initialBalance || 0) + stats.totalMoney - totalSangria;
    if(elExpectedMoney) {
        elExpectedMoney.dataset.value = expectedMoney;
        elExpectedMoney.textContent = formatCurrency(expectedMoney);
    }

    calculateDifference(); 
};

// --- BUSCA DE VENDAS DO TURNO ---
const fetchSalesForShift = async (shift) => {
    const tablesRef = collection(db, 'artifacts', appId, 'public', 'data', 'tables'); // Usar coleção de histórico se houver, ou tables
    
    // O ideal é buscar na coleção de mesas FECHADAS (ex: tables_history ou manter em tables com status closed)
    // Assumindo que as mesas fechadas permanecem na coleção 'tables' ou vão para 'tables_history'
    // No paymentController, nós salvamos o histórico em `tables` com status `closed`.
    
    const shiftStartDate = shift.openedAt?.toDate ? shift.openedAt.toDate() : new Date();
    const shiftStartTimestamp = Timestamp.fromDate(shiftStartDate);

    // Query: Mesas fechadas por MIM, depois que abri o caixa
    const q = query(
        tablesRef,
        where('status', '==', 'closed'),
        where('closedBy', '==', auth.currentUser.email),
        where('closedAt', '>=', shiftStartTimestamp) 
    );

    let snapshot;
    try {
        snapshot = await getDocs(q);
    } catch (e) {
        console.error("Erro ao buscar vendas (Índice pode ser necessário):", e);
        return { stats: { totalMoney: 0, totalDigital: 0, totalProducts: 0, totalServiceTax: 0 }, transactions: [] };
    }

    let stats = { totalMoney: 0, totalDigital: 0, totalProducts: 0, totalServiceTax: 0 };
    let transactions = [];

    snapshot.forEach(doc => {
        const table = doc.data();
        const closedAt = table.closedAt?.toDate ? table.closedAt.toDate() : new Date();
        
        const payments = table.payments || [];
        let tablePaidTotal = 0;
        let paymentMethods = [];
        
        payments.forEach(pay => {
            const val = typeof pay.value === 'string' 
                ? parseFloat(pay.value.replace(/[^\d,.-]/g, '').replace(',', '.')) 
                : pay.value;

            if (!isNaN(val)) {
                tablePaidTotal += val;
                if (!paymentMethods.includes(pay.method)) paymentMethods.push(pay.method);
                
                if (pay.method.toLowerCase().includes('dinheiro')) {
                    stats.totalMoney += val;
                } else {
                    stats.totalDigital += val;
                }
            }
        });

        // Estimativa simples de serviço (se aplicado)
        let serviceVal = 0;
        let productsVal = tablePaidTotal;
        if (table.serviceTaxApplied) {
            productsVal = tablePaidTotal / 1.1;
            serviceVal = tablePaidTotal - productsVal;
        }
        stats.totalProducts += productsVal;
        stats.totalServiceTax += serviceVal;

        transactions.push({
            table: table.tableNumber,
            total: tablePaidTotal,
            time: closedAt.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}),
            methods: paymentMethods,
            timestamp: closedAt.getTime()
        });
    });

    transactions.sort((a, b) => b.timestamp - a.timestamp);
    return { stats, transactions };
};

const handleRegisterSangria = async () => {
    const valInput = document.getElementById('sangriaValueInput');
    const reasonInput = document.getElementById('sangriaReasonInput');
    const btn = document.getElementById('confirmSangriaBtn');
    
    const amount = parseFloat(valInput.value);
    const reason = reasonInput.value.trim();

    if (isNaN(amount) || amount <= 0) { showToast("Valor inválido.", true); return; }
    if (!reason) { showToast("Informe o motivo.", true); return; }

    toggleLoading(btn, true, 'Salvando...');

    try {
        // Pega referência da coleção de shifts
        const shiftsRef = collection(db, 'artifacts', appId, 'public', 'data', 'shifts');
        const shiftDocRef = doc(shiftsRef, currentShift.id);

        await updateDoc(shiftDocRef, {
            sangrias: arrayUnion({ value: amount, reason: reason, timestamp: new Date().toISOString() })
        });
        
        if(sangriaModal) sangriaModal.style.display = 'none';
        showToast("Sangria registrada!", false);
        valInput.value = ''; 
        reasonInput.value = '';

    } catch (e) { 
        console.error("Erro sangria:", e); 
        showToast("Erro ao salvar sangria.", true); 
    } finally {
        toggleLoading(btn, false);
    }
};

const calculateDifference = () => {
    if (!elExpectedMoney || !elDifferenceValue) return;
    
    const expected = parseFloat(elExpectedMoney.dataset.value || 0);
    const inputVal = document.getElementById('cashierEndFloat').value;
    const actual = parseFloat(inputVal);

    if (isNaN(actual)) {
        elDifferenceContainer.classList.add('hidden');
        elJustificationContainer.classList.add('hidden');
        return;
    }

    const diff = actual - expected;
    elDifferenceValue.textContent = formatCurrency(diff);
    elDifferenceContainer.classList.remove('hidden');

    if (diff > 0.10) { 
        elDifferenceContainer.className = "mb-3 p-2 rounded text-center text-sm bg-blue-900/50 text-blue-300 border border-blue-500";
        elJustificationContainer.classList.remove('hidden');
    } else if (diff < -0.10) { 
        elDifferenceContainer.className = "mb-3 p-2 rounded text-center text-sm bg-red-900/50 text-red-300 border border-red-500";
        elJustificationContainer.classList.remove('hidden');
    } else { 
        elDifferenceContainer.className = "mb-3 p-2 rounded text-center text-sm bg-green-900/50 text-green-300 border border-green-500";
        elJustificationContainer.classList.add('hidden');
    }
};

const handleOpenShift = async () => {
    const initialValInput = document.getElementById('cashierStartFloat');
    const btn = document.getElementById('confirmOpenCashierBtn');
    const initialBalance = parseFloat(initialValInput.value);
    
    if (isNaN(initialBalance)) { showToast("Valor inválido.", true); return; }

    toggleLoading(btn, true, 'Abrindo...');

    const user = auth.currentUser;
    const newShift = {
        userId: user.email,
        userName: user.displayName || "Staff",
        openedAt: serverTimestamp(),
        initialBalance: initialBalance,
        status: 'open',
        sangrias: [] 
    };

    try {
        const shiftsRef = collection(db, 'artifacts', appId, 'public', 'data', 'shifts');
        await addDoc(shiftsRef, newShift);
        showToast("Caixa aberto com sucesso!", false);
    } catch (e) { 
        console.error(e); 
        showToast("Erro ao abrir caixa.", true); 
    } finally {
        toggleLoading(btn, false);
    }
};

const handleCloseShift = async () => {
    const finalValInput = document.getElementById('cashierEndFloat');
    const btn = document.getElementById('confirmCloseCashierBtn');
    const finalCashBalance = parseFloat(finalValInput.value);
    const expected = parseFloat(elExpectedMoney.dataset.value || 0);
    
    if (isNaN(finalCashBalance)) { showToast("Informe a contagem final.", true); return; }

    const diff = finalCashBalance - expected;
    const justification = document.getElementById('cashierClosingNote').value.trim();

    if (Math.abs(diff) > 0.10 && !justification) {
        showToast("Diferença detectada. Justifique.", true);
        return;
    }
    
    if (!confirm("Tem certeza que deseja fechar o caixa?")) return;

    toggleLoading(btn, true, 'Fechando...');

    try {
        const shiftsRef = collection(db, 'artifacts', appId, 'public', 'data', 'shifts');
        const shiftRef = doc(shiftsRef, currentShift.id);
        
        await updateDoc(shiftRef, {
            status: 'closed',
            closedAt: serverTimestamp(),
            finalCashInDrawer: finalCashBalance,
            expectedCash: expected,
            difference: diff,
            justification: justification || null,
            // Salva snapshot dos totais calculados para relatório estático
            reportSalesMoney: parseFloat(elSalesMoney.textContent.replace(/[^\d,]/g,'').replace(',','.')),
            reportSalesDigital: parseFloat(elSalesDigital.textContent.replace(/[^\d,]/g,'').replace(',','.'))
        });
        
        if(unsubscribeShift) unsubscribeShift();
        currentShift = null;
        if(cashierModal) cashierModal.style.display = 'none';
        showToast("Turno encerrado com sucesso!", false);
        finalValInput.value = '';

    } catch (e) { 
        console.error(e); 
        showToast("Erro ao fechar caixa.", true); 
    } finally {
        toggleLoading(btn, false);
    }
};