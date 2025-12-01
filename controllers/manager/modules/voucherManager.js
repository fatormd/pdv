// --- CONTROLLERS/MANAGER/MODULES/VOUCHERMANAGER.JS ---

import { 
    getVouchersCollectionRef 
} from "/services/firebaseService.js"; 

import { 
    query, orderBy, getDocs, addDoc, deleteDoc, doc, serverTimestamp 
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

import { formatCurrency, toggleLoading } from "/utils.js";
import { showToast } from "/app.js"; 

let managerModal = null;

// ==================================================================
//           1. API PÚBLICA
// ==================================================================

export const init = () => {
    console.log("[VoucherModule] Inicializado.");
    managerModal = document.getElementById('managerModal');
};

export const open = async () => {
    await renderVoucherPanel();
};

// ==================================================================
//           2. INTERFACE PRINCIPAL (UI)
// ==================================================================

async function renderVoucherPanel() {
    if (!managerModal) return;
    
    managerModal.innerHTML = `
        <div class="bg-dark-card border border-gray-600 w-full max-w-4xl h-[85vh] flex flex-col rounded-xl shadow-2xl overflow-hidden animate-fade-in">
            <div class="flex justify-between items-center p-6 border-b border-gray-700 bg-gray-800 flex-shrink-0">
                <div>
                    <h3 class="text-2xl font-bold text-purple-400"><i class="fas fa-ticket-alt mr-2"></i>Gestão de Vouchers</h3>
                    <p class="text-sm text-gray-400">Recompensas para o programa de fidelidade.</p>
                </div>
                <button class="text-gray-400 hover:text-white text-3xl leading-none" onclick="document.getElementById('managerModal').style.display='none'">&times;</button>
            </div>

            <div class="p-4 bg-dark-bg border-b border-gray-700 flex justify-end items-center flex-shrink-0">
                <button onclick="window.openVoucherForm()" class="bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 px-4 rounded-lg transition text-sm flex items-center shadow-lg">
                    <i class="fas fa-plus mr-2"></i> Nova Recompensa
                </button>
            </div>

            <div class="flex-grow overflow-y-auto p-6 custom-scrollbar bg-dark-bg relative" id="vouch_listContainer">
                <div class="flex items-center justify-center h-full text-gray-500">
                    <i class="fas fa-spinner fa-spin text-3xl"></i>
                </div>
            </div>
        </div>
        
        <div id="vouch_subModalContainer"></div>
    `;

    managerModal.style.display = 'flex';
    managerModal.classList.remove('p-4'); 
    managerModal.classList.add('p-0', 'md:p-4');

    // Exporta função global para abrir o form
    window.openVoucherForm = openVoucherForm;
    window.deleteVoucher = deleteVoucher;

    await loadVouchers();
}

// ==================================================================
//           3. LÓGICA DE DADOS
// ==================================================================

async function loadVouchers() {
    const container = document.getElementById('vouch_listContainer');
    if(!container) return;

    try {
        // Busca vouchers ordenados por pontos (custo)
        const q = query(getVouchersCollectionRef(), orderBy('points', 'asc'));
        const snap = await getDocs(q);
        
        if (snap.empty) {
            container.innerHTML = `
                <div class="flex flex-col items-center justify-center h-full text-gray-500 opacity-60">
                    <i class="fas fa-ticket-alt text-5xl mb-3"></i>
                    <p>Nenhuma recompensa cadastrada.</p>
                </div>`;
            return;
        }

        container.innerHTML = `<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            ${snap.docs.map(doc => {
                const v = doc.data();
                return `
                <div class="bg-gray-800 border border-gray-700 rounded-lg p-4 relative group hover:border-purple-500 transition shadow-sm">
                    <div class="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition">
                        <button onclick="window.deleteVoucher('${doc.id}')" class="text-red-400 hover:text-red-300 p-2"><i class="fas fa-trash"></i></button>
                    </div>
                    <div class="flex justify-between items-center mb-2">
                        <span class="bg-purple-900/50 text-purple-300 text-xs font-bold px-2 py-1 rounded border border-purple-500/30">
                            ${v.points} Pontos
                        </span>
                        <span class="text-green-400 font-bold font-mono text-lg">${formatCurrency(v.value)}</span>
                    </div>
                    <h4 class="text-white font-bold text-lg mb-1">${v.name}</h4>
                    <p class="text-xs text-gray-400">Desconto aplicado automaticamente ao resgatar.</p>
                </div>
                `;
            }).join('')}
        </div>`;

    } catch (e) {
        console.error("Erro Vouchers:", e);
        container.innerHTML = `<p class="text-red-400 text-center mt-10">Erro ao carregar: ${e.message}</p>`;
    }
}

async function openVoucherForm() {
    const modalHtml = `
        <div id="vouch_formModal" class="absolute inset-0 bg-black/80 flex items-center justify-center z-[60] animate-fade-in p-4">
            <div class="bg-dark-card border border-gray-600 p-6 rounded-xl w-full max-w-sm shadow-2xl">
                <h3 class="text-xl font-bold text-white mb-4 border-b border-gray-700 pb-2">Nova Recompensa</h3>
                <form id="vouch_form" class="space-y-4">
                    <div>
                        <label class="block text-xs text-gray-400 uppercase font-bold mb-1">Nome do Voucher</label>
                        <input type="text" id="vouch_name" class="input-pdv w-full" placeholder="Ex: R$10 de Desconto" required>
                    </div>
                    <div>
                        <label class="block text-xs text-gray-400 uppercase font-bold mb-1">Custo em Pontos</label>
                        <input type="number" id="vouch_points" class="input-pdv w-full" placeholder="Ex: 100" required min="1">
                    </div>
                    <div>
                        <label class="block text-xs text-gray-400 uppercase font-bold mb-1">Valor do Desconto (R$)</label>
                        <input type="number" id="vouch_value" class="input-pdv w-full" placeholder="Ex: 10.00" required step="0.01" min="0.01">
                    </div>
                    
                    <div class="flex justify-end space-x-3 mt-6 pt-4 border-t border-gray-700">
                        <button type="button" onclick="document.getElementById('vouch_formModal').remove()" class="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-500 transition">Cancelar</button>
                        <button type="submit" class="px-4 py-2 bg-purple-600 text-white font-bold rounded-lg hover:bg-purple-700 transition shadow-lg">Salvar</button>
                    </div>
                </form>
            </div>
        </div>`;

    document.getElementById('vouch_subModalContainer').innerHTML = modalHtml;

    document.getElementById('vouch_form').onsubmit = async (e) => {
        e.preventDefault();
        
        const name = document.getElementById('vouch_name').value;
        const points = parseInt(document.getElementById('vouch_points').value);
        const value = parseFloat(document.getElementById('vouch_value').value);

        if (!name || isNaN(points) || isNaN(value)) {
            showToast("Preencha todos os campos corretamente.", true);
            return;
        }

        try {
            await addDoc(getVouchersCollectionRef(), {
                name,
                points,
                value,
                active: true,
                createdAt: serverTimestamp()
            });
            
            document.getElementById('vouch_formModal').remove();
            showToast("Voucher criado com sucesso!");
            loadVouchers(); 
        } catch(err) {
            console.error(err);
            showToast("Erro ao salvar.", true);
        }
    };
}

async function deleteVoucher(id) {
    if(confirm("Tem certeza que deseja remover esta recompensa?")) {
        try {
            await deleteDoc(doc(getVouchersCollectionRef(), id));
            showToast("Voucher removido.");
            loadVouchers();
        } catch(e) {
            showToast("Erro ao remover.", true);
        }
    }
}