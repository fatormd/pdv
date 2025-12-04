// --- CONTROLLERS/CASHIERCONTROLLER.JS (ATUALIZADO COM SELEÇÃO DE SETOR) ---
import { db, appId, auth, getSectorsCollectionRef } from "/services/firebaseService.js";
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
let elTransactionsList, elSectorSelect;

export const initCashierController = () => {
    if (isInitialized) return;
    console.log("[Cashier] Inicializando Controller Avançado...");
    
    cashierModal = document.getElementById('cashierModal');
    sangriaModal = document.getElementById('sangriaModal');
    openScreen = document.getElementById('cashierOpenScreen');
    statusScreen = document.getElementById('cashierStatusScreen');
    elSectorSelect = document.getElementById('shiftSectorSelect');

    // Mapeamento UI
    elSalesMoney = document.getElementById('cashierSalesMoney');
    elSalesDigital = document.getElementById('cashierSalesDigital');
    elSalesTotal = document.getElementById('cashierSalesTotal');
    elTotalSangria = document.getElementById('cashierTotalSangria');
    elExpectedMoney = document.getElementById('cashierExpectedMoney');
    elDifferenceValue = document.getElementById('cashierDifferenceValue');
    elDifferenceContainer = document.getElementById('cashierDifferenceContainer');
    elJustificationContainer = document.getElementById('cashierJustificationContainer');

    // Listeners
    const openBtn = document.getElementById('openCashierBtn');
    if(openBtn) openBtn.addEventListener('click', openCashierUI);
    
    document.getElementById('confirmOpenCashierBtn')?.addEventListener('click', handleOpenShift);
    document.getElementById('confirmCloseCashierBtn')?.addEventListener('click', handleCloseShift);
    
    document.getElementById('openSangriaModalBtn')?.addEventListener('click', () => {
        document.getElementById('sangriaValueInput').value = '';
        document.getElementById('sangriaReasonInput').value = '';
        if(sangriaModal) sangriaModal.style.display = 'flex';
        document.getElementById('sangriaValueInput').focus();
    });
    
    document.getElementById('confirmSangriaBtn')?.addEventListener('click', handleRegisterSangria);
    
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

// Carrega os setores disponíveis para o dropdown
const loadSectorsForDropdown = async () => {
    if (!elSectorSelect) return;
    try {
        const q = query(getSectorsCollectionRef());
        const snapshot = await getDocs(q);
        
        let html = '<option value="" disabled selected>Selecione seu Setor</option>';
        // Adiciona setores fixos de atendimento
        html += '<optgroup label="Atendimento">';
        html += '<option value="Recepção">Recepção</option>';
        html += '<option value="Salão">Salão / Garçom</option>';
        html += '</optgroup>';
        
        // Adiciona setores dinâmicos do banco
        if (!snapshot.empty) {
            html += '<optgroup label="Produção / Outros">';
            snapshot.forEach(doc => {
                const s = doc.data();
                html += `<option value="${s.name}">${s.name}</option>`;
            });
            html += '</optgroup>';
        }
        elSectorSelect.innerHTML = html;
    } catch (e) {
        console.error("Erro ao carregar setores:", e);
        elSectorSelect.innerHTML = '<option value="Geral">Geral (Erro ao carregar)</option>';
    }
};

const subscribeToCurrentShift = () => {
    if (unsubscribeShift) unsubscribeShift(); 
    const userEmail = auth.currentUser.email;
    const shiftsRef = collection(db, 'artifacts', appId, 'public', 'data', 'shifts');
    
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
    loadSectorsForDropdown(); // Carrega setores sempre que abrir a tela de abertura
};

const renderStatusScreen = async () => {
    if(openScreen) openScreen.style.display = 'none';
    if(statusScreen) statusScreen.style.display = 'block';
    if (!currentShift) return;

    const openDate = currentShift.openedAt?.toDate ? currentShift.openedAt.toDate() : new Date();
    document.getElementById('cashierOpenedAtDisplay').textContent = openDate.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
    document.getElementById('cashierStartFloatDisplay').textContent = formatCurrency(currentShift.initialBalance || 0);

    const { stats } = await fetchSalesForShift(currentShift);
    
    if(elSalesMoney) elSalesMoney.textContent = formatCurrency(stats.totalMoney);
    if(elSalesDigital) elSalesDigital.textContent = formatCurrency(stats.totalDigital);
    if(elSalesTotal) elSalesTotal.textContent = formatCurrency(stats.totalMoney + stats.totalDigital);

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

    const expectedMoney = (currentShift.initialBalance || 0) + stats.totalMoney - totalSangria;
    if(elExpectedMoney) {
        elExpectedMoney.dataset.value = expectedMoney;
        elExpectedMoney.textContent = formatCurrency(expectedMoney);
    }
    calculateDifference(); 
};

const fetchSalesForShift = async (shift) => {
    const tablesRef = collection(db, 'artifacts', appId, 'public', 'data', 'tables');
    const shiftStartTimestamp = shift.openedAt; 

    // Busca mesas fechadas por este usuário NESTE turno
    const q = query(
        tablesRef,
        where('status', '==', 'closed'),
        where('closedBy', '==', auth.currentUser.email),
        where('closedAt', '>=', shiftStartTimestamp) 
    );

    let snapshot;
    try { snapshot = await getDocs(q); } catch (e) { console.error(e); return { stats: { totalMoney: 0, totalDigital: 0 } }; }

    let stats = { totalMoney: 0, totalDigital: 0 };

    snapshot.forEach(doc => {
        const table = doc.data();
        const payments = table.payments || [];
        payments.forEach(pay => {
            const val = typeof pay.value === 'string' ? parseFloat(pay.value.replace(/[^\d,.-]/g, '').replace(',', '.')) : pay.value;
            if (!isNaN(val)) {
                if (pay.method.toLowerCase().includes('dinheiro')) stats.totalMoney += val;
                else stats.totalDigital += val;
            }
        });
    });
    return { stats };
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
        const shiftsRef = collection(db, 'artifacts', appId, 'public', 'data', 'shifts');
        const shiftDocRef = doc(shiftsRef, currentShift.id);
        await updateDoc(shiftDocRef, { sangrias: arrayUnion({ value: amount, reason: reason, timestamp: new Date().toISOString() }) });
        if(sangriaModal) sangriaModal.style.display = 'none';
        showToast("Sangria registrada!", false);
        valInput.value = ''; reasonInput.value = '';
    } catch (e) { console.error(e); showToast("Erro ao salvar.", true); } finally { toggleLoading(btn, false); }
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
    const sectorSelect = document.getElementById('shiftSectorSelect'); // NOVO
    const btn = document.getElementById('confirmOpenCashierBtn');
    const initialBalance = parseFloat(initialValInput.value);
    const sector = sectorSelect.value; // NOVO
    
    if (isNaN(initialBalance)) { showToast("Valor inválido.", true); return; }
    if (!sector) { showToast("Selecione seu setor de atuação.", true); return; } // Validação

    toggleLoading(btn, true, 'Abrindo...');

    const user = auth.currentUser;
    const newShift = {
        userId: user.email,
        userName: user.displayName || "Staff",
        openedAt: serverTimestamp(),
        initialBalance: initialBalance,
        workSector: sector, // Salva o setor no turno
        status: 'open',
        sangrias: [] 
    };

    try {
        const shiftsRef = collection(db, 'artifacts', appId, 'public', 'data', 'shifts');
        await addDoc(shiftsRef, newShift);
        showToast(`Caixa aberto! Setor: ${sector}`, false);
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
            justification: justification || null
        });
        
        if(unsubscribeShift) unsubscribeShift();
        currentShift = null;
        if(cashierModal) cashierModal.style.display = 'none';
        showToast("Turno encerrado com sucesso!", false);
        finalValInput.value = '';

    } catch (e) { console.error(e); showToast("Erro ao fechar caixa.", true); } finally { toggleLoading(btn, false); }
};