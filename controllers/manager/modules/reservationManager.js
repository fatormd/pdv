// --- CONTROLLERS/MANAGER/MODULES/RESERVATIONMANAGER.JS (CORRIGIDO) ---

import { db, appId } from "/services/firebaseService.js";
import { 
    collection, query, where, orderBy, onSnapshot, doc, updateDoc, serverTimestamp 
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { showToast } from "/utils.js";

let unsubscribeReservations = null;
let currentTab = 'pending'; 

export async function init(container) {
    // --- FIX DE SEGURANÇA ---
    if (!container) {
        console.error("[ReservationManager] Erro: Container não fornecido para inicialização.");
        return; 
    }
    // ------------------------

    container.innerHTML = `
        <div class="flex flex-col h-full bg-dark-bg text-gray-100 p-4 md:p-6 overflow-hidden animate-fade-in">
            
            <div class="flex justify-between items-center mb-6 flex-shrink-0">
                <div>
                    <h2 class="text-2xl font-bold text-white"><i class="fas fa-calendar-alt mr-2 text-pumpkin"></i> Gestão de Reservas</h2>
                    <p class="text-sm text-gray-400">Gerencie solicitações e agenda.</p>
                </div>
                <div class="bg-gray-800 p-1 rounded-lg flex space-x-1">
                    <button class="px-4 py-2 rounded-md text-sm font-bold transition bg-pumpkin text-white shadow" id="tabPending" onclick="window.switchResTab('pending')">
                        Pendentes <span id="badgePending" class="ml-1 bg-white text-pumpkin text-xs px-1.5 py-0.5 rounded-full hidden">0</span>
                    </button>
                    <button class="px-4 py-2 rounded-md text-sm font-bold transition text-gray-400 hover:text-white" id="tabConfirmed" onclick="window.switchResTab('confirmed')">
                        Confirmadas
                    </button>
                    <button class="px-4 py-2 rounded-md text-sm font-bold transition text-gray-400 hover:text-white" id="tabHistory" onclick="window.switchResTab('history')">
                        Histórico
                    </button>
                </div>
            </div>

            <div id="reservationsList" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 overflow-y-auto custom-scrollbar pb-20">
                <div class="col-span-full flex justify-center py-20">
                    <i class="fas fa-spinner fa-spin text-4xl text-gray-600"></i>
                </div>
            </div>
        </div>
    `;

    window.switchResTab = (tab) => {
        currentTab = tab;
        ['pending', 'confirmed', 'history'].forEach(t => {
            const btn = document.getElementById(`tab${t.charAt(0).toUpperCase() + t.slice(1)}`);
            if(btn) {
                if (t === tab) btn.className = "px-4 py-2 rounded-md text-sm font-bold transition bg-pumpkin text-white shadow";
                else btn.className = "px-4 py-2 rounded-md text-sm font-bold transition text-gray-400 hover:text-white hover:bg-gray-800";
            }
        });
        listenToReservations();
    };

    listenToReservations();
}

function listenToReservations() {
    if (unsubscribeReservations) unsubscribeReservations();

    const reservationsRef = collection(db, 'artifacts', appId, 'public', 'data', 'reservations');
    
    let q;
    if (currentTab === 'pending') {
        q = query(reservationsRef, where('status', '==', 'pending'), orderBy('date', 'asc'), orderBy('time', 'asc'));
    } else if (currentTab === 'confirmed') {
        q = query(reservationsRef, where('status', '==', 'confirmed'), orderBy('date', 'asc'), orderBy('time', 'asc'));
    } else {
        q = query(reservationsRef, where('status', 'in', ['rejected', 'cancelled']), orderBy('date', 'desc'), orderBy('time', 'desc'));
    }

    unsubscribeReservations = onSnapshot(q, (snapshot) => {
        const list = document.getElementById('reservationsList');
        if (!list) return;

        if (currentTab === 'pending') {
            const badge = document.getElementById('badgePending');
            if(badge) {
                badge.textContent = snapshot.docs.length;
                badge.style.display = snapshot.docs.length > 0 ? 'inline-block' : 'none';
            }
        }

        if (snapshot.empty) {
            list.innerHTML = `
                <div class="col-span-full flex flex-col items-center justify-center text-gray-500 py-20 border-2 border-dashed border-gray-700 rounded-xl">
                    <i class="fas fa-calendar-times text-4xl mb-3 opacity-50"></i>
                    <p>Nenhuma reserva encontrada nesta aba.</p>
                </div>`;
            return;
        }

        list.innerHTML = snapshot.docs.map(doc => {
            const r = { id: doc.id, ...doc.data() };
            return renderReservationCard(r);
        }).join('');

    }, (error) => {
        console.error("Erro ao ouvir reservas:", error);
        // Não quebra a UI se der erro de permissão, apenas avisa
    });
}

function renderReservationCard(res) {
    const isPending = res.status === 'pending';
    const isConfirmed = res.status === 'confirmed';
    
    let dateDisplay = res.date;
    try {
        const [year, month, day] = res.date.split('-');
        dateDisplay = `${day}/${month}`;
    } catch(e) {}

    let envIcon = 'fa-chair';
    let envLabel = 'Sem pref.';
    if (res.environment === 'interno') { envIcon = 'fa-snowflake'; envLabel = 'Salão Interno'; }
    if (res.environment === 'externo') { envIcon = 'fa-sun'; envLabel = 'Área Externa'; }

    let occLabel = '';
    if (res.occasion && res.occasion !== 'casual') {
        const map = {'aniversario': '🎂 Aniversário', 'romantico': '❤️ Romântico', 'negocios': '💼 Negócios', 'familia': '👨‍👩‍👧‍👦 Família'};
        occLabel = `<div class="mt-2 text-xs font-bold text-yellow-400 bg-yellow-900/30 px-2 py-1 rounded inline-block border border-yellow-700/50">${map[res.occasion] || res.occasion}</div>`;
    }

    let actionsHtml = '';
    if (isPending) {
        actionsHtml = `
            <div class="grid grid-cols-2 gap-2 mt-4 pt-4 border-t border-gray-700">
                <button onclick="window.updateReservationStatus('${res.id}', 'rejected', '${res.clientPhone}')" class="bg-gray-700 hover:bg-red-900/50 hover:text-red-200 text-gray-300 py-2 rounded-lg text-sm font-bold transition">
                    <i class="fas fa-times mr-1"></i> Recusar
                </button>
                <button onclick="window.updateReservationStatus('${res.id}', 'confirmed', '${res.clientPhone}', '${res.clientName}', '${res.date}', '${res.time}')" class="bg-green-600 hover:bg-green-700 text-white py-2 rounded-lg text-sm font-bold transition shadow-lg">
                    <i class="fas fa-check mr-1"></i> Aceitar
                </button>
            </div>
        `;
    } else if (isConfirmed) {
        const cleanPhone = res.clientPhone ? res.clientPhone.replace(/\D/g, '') : '';
        const whatsappLink = cleanPhone ? `https://wa.me/55${cleanPhone}` : '#';
        actionsHtml = `
            <div class="grid grid-cols-2 gap-2 mt-4 pt-4 border-t border-gray-700">
                <button onclick="window.updateReservationStatus('${res.id}', 'cancelled')" class="bg-transparent border border-red-900 text-red-400 hover:bg-red-900/20 py-2 rounded-lg text-xs font-bold transition">Cancelar</button>
                <a href="${whatsappLink}" target="_blank" class="bg-green-600/20 hover:bg-green-600 hover:text-white text-green-400 border border-green-600/50 py-2 rounded-lg text-xs font-bold transition flex items-center justify-center"><i class="fab fa-whatsapp mr-1"></i> Contatar</a>
            </div>
        `;
    }

    return `
        <div class="bg-gray-800 border-l-4 ${isPending ? 'border-pumpkin' : isConfirmed ? 'border-green-500' : 'border-gray-600'} rounded-r-xl p-4 shadow-lg flex flex-col relative animate-fade-in group hover:bg-gray-750 transition">
            <div class="absolute top-4 right-4 text-right">
                <p class="text-2xl font-bold text-white leading-none">${res.time}</p>
                <p class="text-xs text-gray-400 font-bold uppercase tracking-wide">${dateDisplay}</p>
            </div>
            <div class="pr-16">
                <h3 class="text-lg font-bold text-white truncate">${res.clientName}</h3>
                <div class="flex items-center text-sm text-gray-400 mt-1"><i class="fab fa-whatsapp text-green-400 mr-2"></i> ${res.clientPhone}</div>
            </div>
            <div class="flex items-center gap-3 mt-3">
                <div class="bg-gray-900 px-3 py-1.5 rounded text-sm text-gray-300 font-semibold border border-gray-700"><i class="fas fa-user-friends text-blue-400 mr-2"></i> ${res.people} Pessoas</div>
                <div class="bg-gray-900 px-3 py-1.5 rounded text-sm text-gray-300 font-semibold border border-gray-700" title="${envLabel}"><i class="fas ${envIcon} text-pumpkin mr-2"></i> ${envLabel}</div>
            </div>
            ${occLabel}
            ${res.obs ? `<div class="mt-3 bg-yellow-900/10 border border-yellow-800/30 p-2 rounded text-xs text-yellow-200/80 italic">"<i class="fas fa-comment-dots mr-1"></i> ${res.obs}"</div>` : ''}
            ${actionsHtml}
        </div>
    `;
}

window.updateReservationStatus = async (id, status, phone, name, date, time) => {
    if (status === 'rejected' && !confirm('Tem certeza que deseja recusar esta reserva?')) return;
    if (status === 'cancelled' && !confirm('Cancelar reserva confirmada?')) return;

    try {
        const ref = doc(db, 'artifacts', appId, 'public', 'data', 'reservations', id);
        await updateDoc(ref, { status: status, updatedAt: serverTimestamp() });
        showToast(status === 'confirmed' ? "Reserva Confirmada!" : "Status atualizado.");
        
        if (status === 'confirmed' && phone) {
            const cleanPhone = phone.replace(/\D/g, '');
            if (cleanPhone) {
                let datePT = date;
                try { const [y, m, d] = date.split('-'); datePT = `${d}/${m}`; } catch(e){}
                const msg = `Olá ${name || ''}! 👋 Sua reserva no restaurante foi CONFIRMADA para dia ${datePT} às ${time}. Esperamos por você!`;
                window.open(`https://wa.me/55${cleanPhone}?text=${encodeURIComponent(msg)}`, '_blank');
            }
        }
    } catch (e) { console.error(e); showToast("Erro ao atualizar reserva.", true); }
};