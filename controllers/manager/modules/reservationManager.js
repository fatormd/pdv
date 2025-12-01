// --- CONTROLLERS/MANAGER/MODULES/RESERVATIONMANAGER.JS (COM MAPA DE MESAS) ---

import { 
    getCollectionRef 
} from "/services/firebaseService.js"; 

import { 
    query, where, getDocs, orderBy, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, Timestamp 
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

import { formatCurrency, showToast } from "/utils.js";

let managerModal = null;
let currentDateFilter = new Date().toISOString().split('T')[0];

// ==================================================================
//           1. API PÚBLICA
// ==================================================================

export const init = () => {
    console.log("[ReservationModule] Inicializado.");
    managerModal = document.getElementById('managerModal');
};

export const open = async () => {
    await renderReservationPanel();
};

// ==================================================================
//           2. INTERFACE PRINCIPAL
// ==================================================================

async function renderReservationPanel() {
    if (!managerModal) return;
    
    managerModal.innerHTML = `
        <div class="bg-dark-card border border-gray-600 w-full max-w-5xl h-[90vh] flex flex-col rounded-xl shadow-2xl overflow-hidden animate-fade-in">
            <div class="flex justify-between items-center p-6 border-b border-gray-700 bg-gray-800 flex-shrink-0">
                <div>
                    <h3 class="text-2xl font-bold text-yellow-500"><i class="fas fa-calendar-alt mr-2"></i>Gestão de Reservas</h3>
                    <p class="text-sm text-gray-400">Agendamento de mesas e eventos.</p>
                </div>
                <button class="text-gray-400 hover:text-white text-3xl leading-none" onclick="document.getElementById('managerModal').style.display='none'">&times;</button>
            </div>

            <div class="p-4 bg-dark-bg border-b border-gray-700 flex justify-between items-center flex-wrap gap-4 flex-shrink-0">
                <div class="flex items-center space-x-2">
                    <label class="text-gray-400 text-sm font-bold">Data:</label>
                    <input type="date" id="res_dateFilter" class="input-pdv py-2 px-3 text-sm bg-dark-input border-gray-600 text-white rounded-lg" value="${currentDateFilter}">
                    <button onclick="window.loadReservations()" class="p-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition" title="Atualizar">
                        <i class="fas fa-sync-alt"></i>
                    </button>
                </div>
                <button onclick="window.openReservationForm()" class="bg-yellow-600 hover:bg-yellow-700 text-white font-bold py-2 px-4 rounded-lg transition text-sm flex items-center shadow-lg">
                    <i class="fas fa-plus mr-2"></i> Nova Reserva
                </button>
            </div>

            <div class="flex-grow overflow-y-auto p-4 custom-scrollbar bg-dark-bg relative" id="res_listContainer">
                <div class="flex items-center justify-center h-full text-gray-500">
                    <i class="fas fa-spinner fa-spin text-3xl"></i>
                </div>
            </div>
        </div>
        
        <div id="res_subModalContainer"></div>
    `;

    managerModal.style.display = 'flex';
    managerModal.classList.remove('p-4'); 
    managerModal.classList.add('p-0', 'md:p-4');

    const dateInput = document.getElementById('res_dateFilter');
    if(dateInput) {
        dateInput.addEventListener('change', (e) => {
            currentDateFilter = e.target.value;
            loadReservations();
        });
    }

    // Exporta funções globais
    window.loadReservations = loadReservations;
    window.openReservationForm = openReservationForm;
    window.updateReservationStatus = updateReservationStatus;
    window.deleteReservation = deleteReservation;
    window.openTableMap = openTableMap; // Nova função do mapa

    await loadReservations();
}

// ==================================================================
//           3. LÓGICA DE DADOS (LISTAGEM)
// ==================================================================

async function loadReservations() {
    const container = document.getElementById('res_listContainer');
    if(!container) return;

    try {
        const start = new Date(currentDateFilter + 'T00:00:00');
        const end = new Date(currentDateFilter + 'T23:59:59');

        const q = query(
            getCollectionRef('reservations'), 
            where('dateTime', '>=', Timestamp.fromDate(start)),
            where('dateTime', '<=', Timestamp.fromDate(end)),
            orderBy('dateTime', 'asc')
        );

        const snap = await getDocs(q);
        
        if (snap.empty) {
            container.innerHTML = `
                <div class="flex flex-col items-center justify-center h-full text-gray-500 opacity-60">
                    <i class="far fa-calendar-times text-5xl mb-3"></i>
                    <p>Nenhuma reserva para esta data.</p>
                </div>`;
            return;
        }

        renderList(snap.docs.map(d => ({id: d.id, ...d.data()})), container);

    } catch (e) {
        console.error("Erro Reservas:", e);
        container.innerHTML = `<p class="text-red-400 text-center mt-10">Erro de permissão ou conexão.<br><span class="text-xs">Verifique se as regras do Firestore incluem 'reservations'.</span></p>`;
    }
}

function renderList(reservations, container) {
    container.innerHTML = `<div class="grid grid-cols-1 gap-3">
        ${reservations.map(r => {
            const time = r.dateTime?.toDate().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
            const statusColors = {
                'pending': 'bg-yellow-900/50 text-yellow-400 border-yellow-700',
                'confirmed': 'bg-green-900/50 text-green-400 border-green-700',
                'seated': 'bg-blue-900/50 text-blue-400 border-blue-700',
                'canceled': 'bg-red-900/50 text-red-400 border-red-700'
            };
            const statusLabels = { 'pending': 'Pendente', 'confirmed': 'Confirmada', 'seated': 'Na Mesa', 'canceled': 'Cancelada' };
            
            return `
            <div class="bg-gray-800 border border-gray-700 rounded-lg p-4 flex flex-col md:flex-row justify-between items-center hover:bg-gray-750 transition shadow-sm group">
                <div class="flex items-center w-full md:w-auto mb-3 md:mb-0">
                    <div class="text-2xl font-bold text-white mr-4 bg-gray-700 w-16 h-16 flex items-center justify-center rounded-lg border border-gray-600">
                        ${time}
                    </div>
                    <div>
                        <h4 class="text-white font-bold text-lg">${r.customerName}</h4>
                        <div class="flex items-center space-x-3 text-sm text-gray-400 mt-1">
                            <span><i class="fas fa-users mr-1"></i> ${r.pax} Pax</span>
                            ${r.tableNumber ? `<span class="text-yellow-400 bg-yellow-900/30 px-2 rounded border border-yellow-600/50"><i class="fas fa-chair mr-1"></i> Mesa ${r.tableNumber}</span>` : '<span class="italic text-xs">Mesa não def.</span>'}
                            ${r.phone ? `<span><i class="fas fa-phone mr-1"></i> ${r.phone}</span>` : ''}
                        </div>
                        ${r.notes ? `<p class="text-xs text-gray-500 mt-1 italic"><i class="fas fa-sticky-note mr-1"></i> ${r.notes}</p>` : ''}
                    </div>
                </div>

                <div class="flex items-center justify-between w-full md:w-auto space-x-4">
                    <span class="px-3 py-1 rounded-full text-xs font-bold border ${statusColors[r.status] || statusColors['pending']}">
                        ${statusLabels[r.status] || r.status}
                    </span>
                    <div class="flex space-x-2">
                        ${r.status !== 'canceled' && r.status !== 'seated' ? `
                        <button onclick="window.updateReservationStatus('${r.id}', 'confirmed')" class="p-2 bg-green-700 hover:bg-green-600 text-white rounded transition" title="Confirmar"><i class="fas fa-check"></i></button>
                        <button onclick="window.updateReservationStatus('${r.id}', 'seated')" class="p-2 bg-blue-700 hover:bg-blue-600 text-white rounded transition" title="Cliente Chegou"><i class="fas fa-chair"></i></button>` : ''}
                        <button onclick="window.openReservationForm('${r.id}')" class="p-2 bg-gray-700 hover:bg-gray-600 text-white rounded transition" title="Editar"><i class="fas fa-edit"></i></button>
                        <button onclick="window.deleteReservation('${r.id}')" class="p-2 bg-red-900/50 hover:bg-red-700 text-red-200 rounded transition" title="Excluir"><i class="fas fa-trash"></i></button>
                    </div>
                </div>
            </div>`;
        }).join('')}
    </div>`;
}

// ==================================================================
//           4. FORMULÁRIO E MAPA DE MESAS
// ==================================================================

async function openReservationForm(resId = null) {
    let res = {};
    const isEdit = !!resId;

    if(isEdit) {
        const snap = await import("https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js").then(mod => mod.getDoc(mod.doc(getCollectionRef('reservations'), resId)));
        if(snap.exists()) res = {id: snap.id, ...snap.data()};
    }

    const defaultDate = currentDateFilter;
    const defaultTime = new Date().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});

    const modalHtml = `
        <div id="res_formModal" class="absolute inset-0 bg-black/80 flex items-center justify-center z-[60] animate-fade-in p-4">
            <div class="bg-dark-card border border-gray-600 p-6 rounded-xl w-full max-w-md shadow-2xl">
                <h3 class="text-xl font-bold text-white mb-4 border-b border-gray-700 pb-2">${isEdit ? 'Editar Reserva' : 'Nova Reserva'}</h3>
                <form id="res_form" class="space-y-4">
                    <div>
                        <label class="block text-xs text-gray-400 uppercase font-bold mb-1">Nome do Cliente*</label>
                        <input type="text" id="res_name" class="input-pdv w-full" value="${res.customerName || ''}" required>
                    </div>
                    <div class="grid grid-cols-2 gap-4">
                        <div><label class="block text-xs text-gray-400 uppercase font-bold mb-1">Data*</label><input type="date" id="res_date" class="input-pdv w-full bg-dark-input text-white" value="${res.dateTime ? res.dateTime.toDate().toISOString().split('T')[0] : defaultDate}" required></div>
                        <div><label class="block text-xs text-gray-400 uppercase font-bold mb-1">Hora*</label><input type="time" id="res_time" class="input-pdv w-full bg-dark-input text-white" value="${res.dateTime ? res.dateTime.toDate().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : defaultTime}" required></div>
                    </div>
                    <div class="grid grid-cols-2 gap-4 items-end">
                        <div><label class="block text-xs text-gray-400 uppercase font-bold mb-1">Pessoas (Pax)*</label><input type="number" id="res_pax" class="input-pdv w-full" value="${res.pax || 2}" min="1" required></div>
                        
                        <div>
                            <label class="block text-xs text-gray-400 uppercase font-bold mb-1">Mesa</label>
                            <div class="flex space-x-2">
                                <input type="number" id="res_table" class="input-pdv w-full text-center font-bold text-yellow-400" value="${res.tableNumber || ''}" placeholder="--">
                                <button type="button" onclick="window.openTableMap()" class="bg-gray-700 hover:bg-gray-600 text-white rounded-lg px-3 border border-gray-500" title="Escolher no Mapa">
                                    <i class="fas fa-map-marker-alt"></i>
                                </button>
                            </div>
                        </div>
                    </div>
                    <div><label class="block text-xs text-gray-400 uppercase font-bold mb-1">Telefone</label><input type="text" id="res_phone" class="input-pdv w-full" value="${res.phone || ''}"></div>
                    <div><label class="block text-xs text-gray-400 uppercase font-bold mb-1">Observações</label><textarea id="res_notes" class="input-pdv w-full h-20 text-sm">${res.notes || ''}</textarea></div>
                    
                    <div class="flex justify-end space-x-3 mt-6 pt-4 border-t border-gray-700">
                        <button type="button" onclick="document.getElementById('res_formModal').remove()" class="px-4 py-2 bg-gray-600 text-white rounded-lg">Cancelar</button>
                        <button type="submit" class="px-4 py-2 bg-yellow-600 text-white font-bold rounded-lg hover:bg-yellow-700 shadow-lg">Salvar</button>
                    </div>
                </form>
            </div>
        </div>`;

    document.getElementById('res_subModalContainer').innerHTML = modalHtml;

    document.getElementById('res_form').onsubmit = async (e) => {
        e.preventDefault();
        const dateStr = document.getElementById('res_date').value;
        const timeStr = document.getElementById('res_time').value;
        const fullDate = new Date(`${dateStr}T${timeStr}:00`);
        
        const data = {
            customerName: document.getElementById('res_name').value,
            dateTime: Timestamp.fromDate(fullDate),
            pax: parseInt(document.getElementById('res_pax').value),
            tableNumber: document.getElementById('res_table').value || null,
            phone: document.getElementById('res_phone').value,
            notes: document.getElementById('res_notes').value,
            status: res.status || 'pending',
            updatedAt: serverTimestamp()
        };

        try {
            if(isEdit) await updateDoc(doc(getCollectionRef('reservations'), resId), data);
            else { data.createdAt = serverTimestamp(); await addDoc(getCollectionRef('reservations'), data); }
            document.getElementById('res_formModal').remove();
            showToast("Reserva salva!");
            if(dateStr === currentDateFilter) loadReservations();
        } catch(err) { console.error(err); showToast("Erro ao salvar.", true); }
    };
}

// --- NOVO: MAPA VISUAL DE MESAS ---
function openTableMap() {
    // Setores pré-definidos (Ideia: buscar do banco se possível, mas hardcoded funciona bem para visual)
    const sectors = ['Salão 1', 'Salão 2', 'Mezanino', 'Varanda', 'Bar'];
    let activeSector = sectors[0];

    const mapHtml = `
        <div id="res_mapModal" class="absolute inset-0 bg-black/90 flex items-center justify-center z-[70] animate-fade-in p-4">
            <div class="bg-gray-900 border border-gray-600 p-0 rounded-xl w-full max-w-2xl h-[70vh] flex flex-col shadow-2xl overflow-hidden">
                <div class="flex justify-between items-center p-4 bg-gray-800 border-b border-gray-700">
                    <h3 class="text-lg font-bold text-white"><i class="fas fa-chair mr-2"></i>Escolher Mesa</h3>
                    <button onclick="document.getElementById('res_mapModal').remove()" class="text-gray-400 hover:text-white text-2xl">&times;</button>
                </div>
                
                <div class="flex overflow-x-auto bg-gray-800 border-b border-gray-700 p-2 space-x-2 custom-scrollbar">
                    ${sectors.map(s => `
                        <button class="sector-tab-btn px-4 py-2 rounded-lg text-sm font-bold whitespace-nowrap transition ${s === activeSector ? 'bg-indigo-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}" 
                                onclick="window.switchMapSector('${s}')">
                            ${s}
                        </button>
                    `).join('')}
                </div>

                <div id="res_mapGrid" class="flex-grow p-6 overflow-y-auto bg-dark-bg grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 gap-4 content-start custom-scrollbar">
                    </div>
                
                <div class="p-3 bg-gray-800 border-t border-gray-700 text-center text-xs text-gray-400">
                    Selecione a mesa desejada para vincular à reserva.
                </div>
            </div>
        </div>`;

    const container = document.getElementById('res_subModalContainer');
    // Adiciona o mapa sem remover o formulário (append)
    const mapDiv = document.createElement('div');
    mapDiv.innerHTML = mapHtml;
    container.appendChild(mapDiv.firstElementChild);

    // Função interna para trocar setor
    window.switchMapSector = (sectorName) => {
        activeSector = sectorName;
        // Atualiza visual das abas
        document.querySelectorAll('.sector-tab-btn').forEach(btn => {
            if(btn.textContent.trim() === sectorName) {
                btn.classList.remove('bg-gray-700', 'text-gray-300');
                btn.classList.add('bg-indigo-600', 'text-white');
            } else {
                btn.classList.add('bg-gray-700', 'text-gray-300');
                btn.classList.remove('bg-indigo-600', 'text-white');
            }
        });
        renderMapGrid(sectorName);
    };

    // Renderiza grid inicial
    renderMapGrid(activeSector);
}

function renderMapGrid(sector) {
    const grid = document.getElementById('res_mapGrid');
    if(!grid) return;

    // Simulação de mesas por setor (Ex: 20 mesas por setor com numeração contínua ou reiniciada)
    // Aqui farei numeração global fictícia baseada no index do setor para exemplo
    const sectors = ['Salão 1', 'Salão 2', 'Mezanino', 'Varanda', 'Bar'];
    const sectorIndex = sectors.indexOf(sector);
    const startNum = (sectorIndex * 20) + 1;
    const endNum = startNum + 19; // 20 mesas por setor

    let html = '';
    for(let i = startNum; i <= endNum; i++) {
        html += `
            <button onclick="window.selectMapTable(${i})" class="flex flex-col items-center justify-center p-3 bg-gray-800 border-2 border-gray-700 rounded-xl hover:border-yellow-500 hover:bg-gray-700 transition group relative">
                <i class="fas fa-chair text-2xl text-gray-500 group-hover:text-yellow-400 mb-1"></i>
                <span class="font-bold text-white text-lg">${i}</span>
                <span class="text-[10px] text-gray-500 uppercase">${sector.split(' ')[0]}</span>
            </button>
        `;
    }
    grid.innerHTML = html;
}

// Função chamada ao clicar na mesa
window.selectMapTable = (tableNum) => {
    const input = document.getElementById('res_table');
    if(input) input.value = tableNum;
    
    // Remove o modal do mapa
    const modal = document.getElementById('res_mapModal');
    if(modal) modal.remove();
};

async function updateReservationStatus(id, status) {
    if(!confirm(`Alterar status para ${status.toUpperCase()}?`)) return;
    try {
        await updateDoc(doc(getCollectionRef('reservations'), id), { status });
        showToast("Status atualizado.");
        loadReservations();
    } catch(e) { showToast("Erro ao atualizar.", true); }
}

async function deleteReservation(id) {
    if(confirm("Tem certeza que deseja excluir esta reserva?")) {
        try {
            await deleteDoc(doc(getCollectionRef('reservations'), id));
            showToast("Reserva removida.");
            loadReservations();
        } catch(e) { showToast("Erro ao remover.", true); }
    }
}