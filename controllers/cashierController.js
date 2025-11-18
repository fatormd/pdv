import { db, auth, appId } from "/services/firebaseService.js";
import { collection, query, where, limit, getDocs, addDoc, updateDoc, doc, serverTimestamp, arrayUnion, onSnapshot, Timestamp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { formatCurrency } from "/utils.js";
import { showToast } from "/app.js";

let currentShift = null;
let cashierModal, openScreen, statusScreen, sangriaModal;
let unsubscribeShift = null;

// Elementos de Display
let elSalesMoney, elSalesDigital, elSalesTotal, elSalesProducts, elSalesService;
let elTotalSangria, elExpectedMoney, elDifferenceValue, elDifferenceContainer, elJustificationContainer;
let elTransactionsList;

export const initCashierController = () => {
    console.log("[Cashier] Inicializando Controller Avançado...");
    
    cashierModal = document.getElementById('cashierModal');
    sangriaModal = document.getElementById('sangriaModal');
    openScreen = document.getElementById('cashierOpenScreen');
    statusScreen = document.getElementById('cashierStatusScreen');

    // Mapeamento
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

    document.getElementById('openCashierBtn')?.addEventListener('click', openCashierUI);
    document.getElementById('confirmOpenCashierBtn')?.addEventListener('click', handleOpenShift);
    document.getElementById('confirmCloseCashierBtn')?.addEventListener('click', handleCloseShift);
    
    document.getElementById('openSangriaModalBtn')?.addEventListener('click', () => {
        document.getElementById('sangriaValueInput').value = '';
        document.getElementById('sangriaReasonInput').value = '';
        sangriaModal.style.display = 'flex';
        document.getElementById('sangriaValueInput').focus();
    });
    document.getElementById('confirmSangriaBtn')?.addEventListener('click', handleRegisterSangria);
    document.getElementById('cashierEndFloat')?.addEventListener('input', calculateDifference);
};

const getShiftsCollectionRef = () => collection(db, 'artifacts', appId, 'public', 'data', 'shifts');

const openCashierUI = async () => {
    if (!auth.currentUser) {
        showToast("Você precisa estar logado.", true);
        return;
    }
    cashierModal.style.display = 'flex';
    subscribeToCurrentShift(); 
};

const subscribeToCurrentShift = () => {
    if (unsubscribeShift) unsubscribeShift(); 
    const userEmail = auth.currentUser.email;
    const q = query(getShiftsCollectionRef(), where('userId', '==', userEmail), where('status', '==', 'open'), limit(1));

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
    openScreen.style.display = 'block';
    statusScreen.style.display = 'none';
    document.getElementById('cashierStartFloat').value = '';
    document.getElementById('cashierModalTitle').textContent = "Abertura de Caixa";
};

const renderStatusScreen = async () => {
    openScreen.style.display = 'none';
    statusScreen.style.display = 'block';
    document.getElementById('cashierModalTitle').textContent = "Gestão de Caixa (Aberto)";

    if (!currentShift) return;

    const openDate = currentShift.openedAt?.toDate ? currentShift.openedAt.toDate() : new Date();
    document.getElementById('cashierOpenedAtDisplay').textContent = openDate.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
    document.getElementById('cashierStartFloatDisplay').textContent = formatCurrency(currentShift.initialBalance || 0);

    // CÁLCULO DE VENDAS
    const { stats, transactions } = await fetchSalesForShift(currentShift);
    
    elSalesMoney.textContent = formatCurrency(stats.totalMoney);
    elSalesDigital.textContent = formatCurrency(stats.totalDigital);
    elSalesTotal.textContent = formatCurrency(stats.totalMoney + stats.totalDigital);
    elSalesProducts.textContent = formatCurrency(stats.totalProducts);
    elSalesService.textContent = formatCurrency(stats.totalServiceTax);

    if (elTransactionsList) {
        if (transactions.length === 0) {
            elTransactionsList.innerHTML = '<p class="text-center text-xs text-gray-600 italic p-2">Nenhuma movimentação neste turno.</p>';
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
    elTotalSangria.textContent = formatCurrency(totalSangria);
    
    const sangriaListEl = document.getElementById('sangriaList');
    if (sangrias.length > 0) {
        sangriaListEl.innerHTML = sangrias.map(s => `
            <div class="flex justify-between border-b border-gray-800 pb-1">
                <span>${s.reason}</span><span class="text-red-400">-${formatCurrency(s.value)}</span>
            </div>`).join('');
    } else {
        sangriaListEl.innerHTML = '<p class="italic opacity-50">Nenhuma sangria registrada.</p>';
    }

    const expectedMoney = (currentShift.initialBalance || 0) + stats.totalMoney - totalSangria;
    elExpectedMoney.dataset.value = expectedMoney;
    elExpectedMoney.textContent = formatCurrency(expectedMoney);

    calculateDifference(); 
};

// ==================================================================
// CORREÇÃO PRINCIPAL DA BUSCA DE VENDAS
// ==================================================================
const fetchSalesForShift = async (shift) => {
    const tablesRef = collection(db, 'artifacts', appId, 'public', 'data', 'tables');
    
    // Converter Timestamp do shift para objeto Date nativo se necessário
    const shiftStartDate = shift.openedAt?.toDate ? shift.openedAt.toDate() : new Date();
    const shiftStartTimestamp = Timestamp.fromDate(shiftStartDate);

    // QUERY CORRIGIDA:
    // 1. status == 'closed' (Mesas fechadas)
    // 2. closedBy == EU (Mesas que EU fechei/recebi) <--- MUDANÇA AQUI
    // 3. closedAt >= Abertura do Caixa (Mesas deste turno)
    const q = query(
        tablesRef,
        where('status', '==', 'closed'),
        where('closedBy', '==', auth.currentUser.email), // Alterado de waiterId para closedBy
        where('closedAt', '>=', shiftStartTimestamp) 
    );

    let snapshot;
    try {
        snapshot = await getDocs(q);
    } catch (e) {
        console.error("Erro ao buscar vendas do caixa (Provável falta de índice):", e);
        // Se der erro de índice, retorne vazio para não quebrar a tela, mas avise no console
        if(e.code === 'failed-precondition') {
             alert("O sistema está criando um índice interno. Tente novamente em 2 minutos.");
        }
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
            const val = parseFloat(pay.value.toString().replace(/[^\d,.-]/g, '').replace(',', '.'));
            if (!isNaN(val)) {
                tablePaidTotal += val;
                if (!paymentMethods.includes(pay.method)) paymentMethods.push(pay.method);
                if (pay.method.toLowerCase().includes('dinheiro')) stats.totalMoney += val;
                else stats.totalDigital += val;
            }
        });

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
    const amount = parseFloat(valInput.value);
    const reason = reasonInput.value.trim();

    if (isNaN(amount) || amount <= 0) { alert("Informe um valor válido."); return; }
    if (!reason) { alert("Informe o motivo."); return; }

    try {
        const shiftRef = doc(getShiftsCollectionRef(), currentShift.id);
        await updateDoc(shiftRef, {
            sangrias: arrayUnion({ value: amount, reason: reason, timestamp: new Date().toISOString() })
        });
        sangriaModal.style.display = 'none';
        showToast("Sangria registrada!");
    } catch (e) { console.error("Erro sangria:", e); alert("Erro ao salvar sangria."); }
};

const calculateDifference = () => {
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
    const initialValInput = document.getElementById('cashierStartFloat').value;
    const initialBalance = parseFloat(initialValInput);
    if (isNaN(initialBalance)) { alert("Valor inválido."); return; }

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
        await addDoc(getShiftsCollectionRef(), newShift);
        showToast("Caixa aberto com sucesso!");
    } catch (e) { console.error(e); alert("Erro ao abrir."); }
};

const handleCloseShift = async () => {
    const finalValInput = document.getElementById('cashierEndFloat').value;
    const finalCashBalance = parseFloat(finalValInput);
    const expected = parseFloat(elExpectedMoney.dataset.value || 0);
    
    if (isNaN(finalCashBalance)) { alert("Informe a contagem final."); return; }

    const diff = finalCashBalance - expected;
    const justification = document.getElementById('cashierClosingNote').value.trim();

    if (Math.abs(diff) > 0.10 && !justification) {
        alert("Diferença detectada. Preencha a justificativa.");
        return;
    }
    if (!confirm("Fechar caixa?")) return;

    try {
        const shiftRef = doc(getShiftsCollectionRef(), currentShift.id);
        await updateDoc(shiftRef, {
            status: 'closed',
            closedAt: serverTimestamp(),
            finalCashInDrawer: finalCashBalance,
            expectedCash: expected,
            difference: diff,
            justification: justification || null,
            reportSalesMoney: parseFloat(elSalesMoney.textContent.replace(/[^\d,]/g,'').replace(',','.')),
            reportSalesDigital: parseFloat(elSalesDigital.textContent.replace(/[^\d,]/g,'').replace(',','.'))
        });
        if(unsubscribeShift) unsubscribeShift();
        currentShift = null;
        cashierModal.style.display = 'none';
        showToast("Turno encerrado!");
    } catch (e) { console.error(e); alert("Erro ao fechar."); }
};