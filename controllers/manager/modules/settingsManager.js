// --- CONTROLLERS/MANAGER/MODULES/SETTINGSMANAGER.JS ---

import { db, appId, getSectorsCollectionRef } from "/services/firebaseService.js";
import { 
    doc, getDoc, setDoc, updateDoc, onSnapshot, 
    addDoc, deleteDoc, query, orderBy, getDocs, serverTimestamp 
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { showToast, toggleLoading } from "/utils.js";

let managerModal = null;

// --- Helper para Modal Seguro (Evita Stacking Context) ---
function getSubModalContainer() {
    let container = document.getElementById('subModalContainer');
    if (!container || container.parentElement.id === 'managerModal') {
        if(container) container.remove();
        container = document.createElement('div');
        container.id = 'subModalContainer';
        container.style.zIndex = '9999';
        container.style.position = 'relative';
        document.body.appendChild(container);
    }
    return container;
}

// ==================================================================
//           1. API PÚBLICA
// ==================================================================

export const init = () => {
    console.log("[SettingsModule] Inicializado.");
    managerModal = document.getElementById('managerModal');
};

export const open = async () => {
    await renderSettingsPanel();
};

// ==================================================================
//           2. UI PRINCIPAL
// ==================================================================

async function renderSettingsPanel() {
    if (!managerModal) return;

    managerModal.innerHTML = `
        <div class="bg-dark-card border-0 md:border md:border-dark-border w-full h-full md:h-[90vh] md:max-w-5xl flex flex-col md:rounded-xl shadow-2xl overflow-hidden animate-fade-in">
            <div class="flex justify-between items-center p-6 border-b border-gray-700 bg-gray-800 flex-shrink-0">
                <div>
                    <h3 class="text-2xl font-bold text-white"><i class="fas fa-cogs mr-2 text-gray-400"></i>Configurações do Sistema</h3>
                    <p class="text-sm text-gray-400">Dados do Estabelecimento e Hierarquia de Produção</p>
                </div>
                <button class="text-gray-400 hover:text-white text-3xl leading-none" onclick="document.getElementById('managerModal').style.display='none'">&times;</button>
            </div>

            <div class="flex space-x-1 bg-gray-900 p-2 border-b border-gray-700">
                <button id="tab-establishment" class="settings-tab-btn flex-1 py-3 px-4 rounded-lg font-bold text-sm transition bg-indigo-600 text-white" onclick="window.switchSettingsTab('establishment')">
                    <i class="fas fa-store mr-2"></i> Estabelecimento
                </button>
                <button id="tab-sectors" class="settings-tab-btn flex-1 py-3 px-4 rounded-lg font-bold text-sm transition text-gray-400 hover:bg-gray-800" onclick="window.switchSettingsTab('sectors')">
                    <i class="fas fa-network-wired mr-2"></i> Hierarquia (KDS)
                </button>
            </div>

            <div id="settingsContent" class="flex-grow overflow-y-auto p-6 bg-dark-bg custom-scrollbar relative">
                <div class="flex justify-center py-10"><i class="fas fa-spinner fa-spin text-3xl text-gray-500"></i></div>
            </div>

            <div class="p-4 border-t border-gray-700 bg-gray-800 flex justify-end">
                <button onclick="document.getElementById('managerModal').style.display='none'" class="px-6 py-3 bg-gray-700 text-white rounded-lg font-bold hover:bg-gray-600 transition">Fechar</button>
            </div>
        </div>
    `;

    managerModal.style.display = 'flex';
    managerModal.classList.remove('p-4'); 
    managerModal.classList.add('p-0', 'md:p-4');

    // Expor função de troca de aba globalmente para o HTML string usar
    window.switchSettingsTab = switchSettingsTab;

    // Carregar aba inicial
    await switchSettingsTab('establishment');
}

async function switchSettingsTab(tabName) {
    // Atualiza estilo dos botões
    document.querySelectorAll('.settings-tab-btn').forEach(btn => {
        if (btn.id === `tab-${tabName}`) {
            btn.classList.add('bg-indigo-600', 'text-white');
            btn.classList.remove('text-gray-400', 'hover:bg-gray-800');
        } else {
            btn.classList.remove('bg-indigo-600', 'text-white');
            btn.classList.add('text-gray-400', 'hover:bg-gray-800');
        }
    });

    const content = document.getElementById('settingsContent');
    content.innerHTML = '<div class="flex justify-center py-10"><i class="fas fa-spinner fa-spin text-3xl text-gray-500"></i></div>';

    if (tabName === 'establishment') await renderEstablishmentTab(content);
    if (tabName === 'sectors') await renderSectorsTab(content);
}

// ==================================================================
//           3. ABA: ESTABELECIMENTO (Dados Gerais)
// ==================================================================

async function renderEstablishmentTab(container) {
    // Buscar dados atuais (Ex: collection 'config', doc 'establishment')
    // Nota: Adapte o caminho do documento conforme sua estrutura de "artifacts"
    // Aqui assumirei artifacts/{appId}/public/data/settings/store_info
    
    let data = {};
    try {
        const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'store_info');
        const snap = await getDoc(docRef);
        if (snap.exists()) data = snap.data();
    } catch (e) { console.log("Config ainda não criada", e); }

    container.innerHTML = `
        <div class="max-w-3xl mx-auto space-y-6 animate-fade-in">
            
            <div class="bg-gray-800 p-5 rounded-xl border border-gray-700">
                <h4 class="text-white font-bold text-lg mb-4 border-b border-gray-600 pb-2">Identidade Visual</h4>
                <div class="flex items-center gap-4">
                    <div class="w-24 h-24 bg-gray-700 rounded-lg flex items-center justify-center overflow-hidden border border-gray-600 relative group">
                        <img id="storeLogoPreview" src="${data.logo || ''}" class="w-full h-full object-cover ${!data.logo ? 'hidden' : ''}">
                        <i class="fas fa-store text-gray-500 text-3xl ${data.logo ? 'hidden' : ''}" id="storeLogoIcon"></i>
                    </div>
                    <div class="flex-grow">
                        <label class="block text-xs text-gray-400 uppercase font-bold mb-1">URL da Logo</label>
                        <input type="text" id="storeLogoUrl" class="input-pdv w-full" value="${data.logo || ''}" placeholder="https://...">
                        <p class="text-[10px] text-gray-500 mt-1">Cole o link da imagem da sua marca.</p>
                    </div>
                </div>
            </div>

            <div class="bg-gray-800 p-5 rounded-xl border border-gray-700">
                <h4 class="text-white font-bold text-lg mb-4 border-b border-gray-600 pb-2">Informações Básicas</h4>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label class="block text-xs text-gray-400 uppercase font-bold mb-1">Nome do Restaurante</label>
                        <input type="text" id="storeName" class="input-pdv w-full" value="${data.name || ''}" placeholder="Ex: Fator MD Burger">
                    </div>
                    <div>
                        <label class="block text-xs text-gray-400 uppercase font-bold mb-1">Telefone / WhatsApp</label>
                        <input type="text" id="storePhone" class="input-pdv w-full" value="${data.phone || ''}">
                    </div>
                    <div class="md:col-span-2">
                        <label class="block text-xs text-gray-400 uppercase font-bold mb-1">Endereço Completo</label>
                        <input type="text" id="storeAddress" class="input-pdv w-full" value="${data.address || ''}">
                    </div>
                    <div class="md:col-span-2">
                        <label class="block text-xs text-gray-400 uppercase font-bold mb-1">Mensagem do Rodapé (Cupom)</label>
                        <input type="text" id="storeFooterMsg" class="input-pdv w-full" value="${data.footerMessage || 'Obrigado pela preferência!'}" placeholder="Mensagem impressa no final da nota">
                    </div>
                </div>
            </div>

            <div class="bg-gray-800 p-5 rounded-xl border border-gray-700">
                <h4 class="text-white font-bold text-lg mb-4 border-b border-gray-600 pb-2">Preferências de Cadastro</h4>
                <div class="flex items-center justify-between">
                    <div>
                        <p class="text-white font-bold">Hierarquia Flexível</p>
                        <p class="text-xs text-gray-400">Permitir criar novos Setores/Grupos diretamente na tela de cadastro de produto.</p>
                    </div>
                    <label class="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" id="allowFlexibleHierarchy" class="sr-only peer" ${data.flexibleHierarchy !== false ? 'checked' : ''}>
                        <div class="w-11 h-6 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-600"></div>
                    </label>
                </div>
            </div>

            <div class="flex justify-end pt-4">
                <button id="btnSaveEstablishment" class="bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-8 rounded-lg shadow-lg flex items-center transition">
                    <i class="fas fa-save mr-2"></i> Salvar Alterações
                </button>
            </div>
        </div>
    `;

    // Preview de Imagem
    document.getElementById('storeLogoUrl').addEventListener('input', (e) => {
        const img = document.getElementById('storeLogoPreview');
        const icon = document.getElementById('storeLogoIcon');
        if(e.target.value) { img.src = e.target.value; img.classList.remove('hidden'); icon.classList.add('hidden'); }
        else { img.classList.add('hidden'); icon.classList.remove('hidden'); }
    });

    document.getElementById('btnSaveEstablishment').onclick = async () => {
        const btn = document.getElementById('btnSaveEstablishment');
        toggleLoading(btn, true, 'Salvando...');
        
        const payload = {
            name: document.getElementById('storeName').value,
            phone: document.getElementById('storePhone').value,
            address: document.getElementById('storeAddress').value,
            footerMessage: document.getElementById('storeFooterMsg').value,
            logo: document.getElementById('storeLogoUrl').value,
            flexibleHierarchy: document.getElementById('allowFlexibleHierarchy').checked,
            updatedAt: serverTimestamp()
        };

        try {
            await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'store_info'), payload, { merge: true });
            showToast("Dados salvos com sucesso!");
        } catch (e) {
            console.error(e);
            showToast("Erro ao salvar.", true);
        } finally {
            toggleLoading(btn, false);
        }
    };
}

// ==================================================================
//           4. ABA: HIERARQUIA & KDS (SETORES)
// ==================================================================

async function renderSectorsTab(container) {
    container.innerHTML = `
        <div class="flex flex-col h-full animate-fade-in">
            <div class="flex justify-between items-end mb-4">
                <div>
                    <h4 class="text-white font-bold text-xl">Setores de Produção (KDS)</h4>
                    <p class="text-gray-400 text-sm">Defina onde cada produto será preparado/impresso.</p>
                </div>
                <button onclick="window.openSectorModal()" class="bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded-lg font-bold shadow flex items-center transition">
                    <i class="fas fa-plus mr-2"></i> Novo Setor
                </button>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" id="sectorsGrid">
                <div class="col-span-full flex justify-center py-10"><i class="fas fa-spinner fa-spin text-2xl text-gray-500"></i></div>
            </div>
        </div>
    `;

    // Buscar Setores
    try {
        const q = query(getSectorsCollectionRef(), orderBy('name'));
        const snap = await getDocs(q);
        const grid = document.getElementById('sectorsGrid');
        
        if (snap.empty) {
            grid.innerHTML = `<div class="col-span-full text-center p-10 bg-gray-800/50 rounded-xl border border-dashed border-gray-600">
                <p class="text-gray-400 mb-2">Nenhum setor configurado.</p>
                <button onclick="window.openSectorModal()" class="text-blue-400 hover:text-blue-300 font-bold underline">Criar o primeiro setor</button>
            </div>`;
        } else {
            grid.innerHTML = snap.docs.map(d => {
                const s = d.data();
                return `
                <div class="bg-gray-800 p-4 rounded-xl border border-gray-700 shadow-lg relative group hover:border-blue-500 transition">
                    <div class="flex items-center justify-between mb-2">
                        <div class="flex items-center space-x-3">
                            <div class="w-10 h-10 rounded-full bg-gray-700 flex items-center justify-center text-indigo-400">
                                <i class="fas ${s.type === 'bar' ? 'fa-cocktail' : s.type === 'copa' ? 'fa-coffee' : 'fa-utensils'}"></i>
                            </div>
                            <h5 class="text-white font-bold text-lg">${s.name}</h5>
                        </div>
                        <span class="bg-gray-900 text-gray-400 text-xs px-2 py-1 rounded border border-gray-700 uppercase">${s.type || 'Geral'}</span>
                    </div>
                    <p class="text-xs text-gray-500 mb-4">ID: ${d.id}</p>
                    
                    <div class="flex justify-end pt-2 border-t border-gray-700">
                         <button onclick="window.deleteSector('${d.id}')" class="text-red-400 hover:text-red-300 text-sm flex items-center px-2 py-1 rounded hover:bg-red-900/20 transition">
                            <i class="fas fa-trash mr-1"></i> Remover
                         </button>
                    </div>
                </div>`;
            }).join('');
        }
    } catch (e) {
        console.error(e);
        document.getElementById('sectorsGrid').innerHTML = `<p class="text-red-400">Erro ao carregar setores.</p>`;
    }
}

// --- Funções Globais (Window) para o Modal de Setor ---

window.openSectorModal = () => {
    const html = `
        <div id="sectorModal" class="fixed inset-0 bg-black/80 flex items-center justify-center z-[100] animate-fade-in p-4">
            <div class="bg-dark-card border border-gray-600 p-6 rounded-xl w-full max-w-sm shadow-2xl">
                <h3 class="text-xl font-bold text-white mb-4">Novo Setor</h3>
                
                <div class="space-y-4">
                    <div>
                        <label class="block text-xs text-gray-400 uppercase font-bold mb-1">Nome do Setor</label>
                        <input type="text" id="newSectorName" class="input-pdv w-full" placeholder="Ex: Sushi Bar">
                    </div>
                    <div>
                        <label class="block text-xs text-gray-400 uppercase font-bold mb-1">Tipo de Produção</label>
                        <select id="newSectorType" class="input-pdv w-full">
                            <option value="production">Cozinha / Produção</option>
                            <option value="bar">Bar / Bebidas</option>
                            <option value="copa">Copa / Cafeteria</option>
                        </select>
                    </div>
                </div>

                <div class="flex justify-end space-x-2 mt-6">
                    <button onclick="document.getElementById('sectorModal').remove()" class="px-4 py-2 bg-gray-600 text-white rounded-lg">Cancelar</button>
                    <button onclick="window.saveSector()" class="px-4 py-2 bg-green-600 text-white font-bold rounded-lg hover:bg-green-700">Criar</button>
                </div>
            </div>
        </div>
    `;
    getSubModalContainer().innerHTML = html;
    setTimeout(() => document.getElementById('newSectorName').focus(), 100);
};

window.saveSector = async () => {
    const name = document.getElementById('newSectorName').value;
    const type = document.getElementById('newSectorType').value;

    if (!name) return showToast("Nome é obrigatório.", true);

    try {
        await addDoc(getSectorsCollectionRef(), {
            name: name,
            type: type,
            createdAt: serverTimestamp()
        });
        document.getElementById('sectorModal').remove();
        showToast("Setor criado!");
        switchSettingsTab('sectors'); // Recarrega
    } catch (e) {
        console.error(e);
        showToast("Erro ao criar.", true);
    }
};

window.deleteSector = async (id) => {
    if(confirm("Tem certeza? Isso pode afetar produtos vinculados a este setor.")) {
        try {
            await deleteDoc(doc(getSectorsCollectionRef(), id));
            showToast("Setor removido.");
            switchSettingsTab('sectors');
        } catch (e) {
            console.error(e);
            showToast("Erro ao remover.", true);
        }
    }
};