// --- CONTROLLERS/MANAGER/MODULES/SETTINGSMANAGER.JS (ATUALIZADO: GERENCIAR TIPOS DE OPERAÇÃO) ---

import { db, appId, getSectorsCollectionRef } from "/services/firebaseService.js";
import { 
    doc, getDoc, setDoc, updateDoc, onSnapshot, 
    addDoc, deleteDoc, query, orderBy, getDocs, serverTimestamp, 
    arrayUnion, arrayRemove, collection 
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { showToast, toggleLoading } from "/utils.js";

let managerModal = null;
let currentSectorFilter = 'production'; 

// --- Helper para Modal Seguro ---
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
            <div class="flex justify-between items-center p-4 md:p-6 border-b border-gray-700 bg-gray-800 flex-shrink-0">
                <div>
                    <h3 class="text-xl md:text-2xl font-bold text-white"><i class="fas fa-cogs mr-2 text-gray-400"></i>Configurações</h3>
                    <p class="text-xs md:text-sm text-gray-400">Dados e Hierarquia</p>
                </div>
                <button class="text-gray-400 hover:text-white text-3xl leading-none" onclick="document.getElementById('managerModal').style.display='none'">&times;</button>
            </div>

            <div class="flex space-x-1 bg-gray-900 p-2 border-b border-gray-700">
                <button id="tab-establishment" class="settings-tab-btn flex-1 py-3 px-4 rounded-lg font-bold text-sm transition bg-indigo-600 text-white" onclick="window.switchSettingsTab('establishment')">
                    <i class="fas fa-store mr-2"></i> Loja
                </button>
                <button id="tab-sectors" class="settings-tab-btn flex-1 py-3 px-4 rounded-lg font-bold text-sm transition text-gray-400 hover:bg-gray-800" onclick="window.switchSettingsTab('sectors')">
                    <i class="fas fa-network-wired mr-2"></i> Hierarquia (KDS)
                </button>
            </div>

            <div id="settingsContent" class="flex-grow overflow-y-auto p-4 md:p-6 bg-dark-bg custom-scrollbar relative">
                <div class="flex justify-center py-10"><i class="fas fa-spinner fa-spin text-3xl text-gray-500"></i></div>
            </div>
        </div>
    `;

    managerModal.style.display = 'flex';
    managerModal.classList.remove('p-4'); 
    managerModal.classList.add('p-0', 'md:p-4');

    window.switchSettingsTab = switchSettingsTab;
    await switchSettingsTab('establishment');
}

async function switchSettingsTab(tabName) {
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
//           3. ABA: ESTABELECIMENTO
// ==================================================================

async function renderEstablishmentTab(container) {
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

            <div class="flex justify-end pt-4">
                <button id="btnSaveEstablishment" class="bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-8 rounded-lg shadow-lg flex items-center transition">
                    <i class="fas fa-save mr-2"></i> Salvar Alterações
                </button>
            </div>
        </div>
    `;

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

window.filterSectors = (type) => {
    currentSectorFilter = type;
    const btns = document.querySelectorAll('.sector-filter-btn');
    btns.forEach(btn => {
        if(btn.dataset.type === type) {
            btn.classList.add('bg-gray-700', 'text-white', 'border-gray-500');
            btn.classList.remove('text-gray-400', 'border-transparent');
        } else {
            btn.classList.remove('bg-gray-700', 'text-white', 'border-gray-500');
            btn.classList.add('text-gray-400', 'border-transparent');
        }
    });
    const content = document.getElementById('settingsContent');
    if(content) renderSectorsTab(content);
};

async function renderSectorsTab(container) {
    container.innerHTML = `
        <div class="flex flex-col h-full animate-fade-in">
            <div class="flex flex-col md:flex-row justify-between items-start md:items-end mb-6 gap-4">
                <div>
                    <h4 class="text-white font-bold text-xl mb-2">Setores e Áreas</h4>
                    <div class="flex space-x-2 bg-gray-800 p-1 rounded-lg inline-flex">
                        <button class="sector-filter-btn px-4 py-1.5 rounded-md text-sm font-bold border transition ${currentSectorFilter === 'atendimento' ? 'bg-gray-700 text-white border-gray-500' : 'text-gray-400 border-transparent hover:text-white'}" onclick="window.filterSectors('atendimento')" data-type="atendimento">
                            Atendimento
                        </button>
                        <button class="sector-filter-btn px-4 py-1.5 rounded-md text-sm font-bold border transition ${currentSectorFilter === 'production' ? 'bg-gray-700 text-white border-gray-500' : 'text-gray-400 border-transparent hover:text-white'}" onclick="window.filterSectors('production')" data-type="production">
                            Produção (KDS)
                        </button>
                    </div>
                </div>
                <button onclick="window.openSectorModal()" class="w-full md:w-auto bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded-lg font-bold shadow flex items-center justify-center transition">
                    <i class="fas fa-plus mr-2"></i> Novo Setor
                </button>
            </div>

            <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4" id="sectorsGrid">
                <div class="col-span-full flex justify-center py-10"><i class="fas fa-spinner fa-spin text-2xl text-gray-500"></i></div>
            </div>
        </div>
    `;

    try {
        const q = query(getSectorsCollectionRef(), orderBy('name'));
        const snap = await getDocs(q);
        const grid = document.getElementById('sectorsGrid');
        
        const allDocs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        const filteredDocs = allDocs.filter(s => {
            if (currentSectorFilter === 'atendimento') {
                return s.type === 'atendimento' || s.type === 'service';
            } else {
                return s.type !== 'atendimento' && s.type !== 'service';
            }
        });

        if (filteredDocs.length === 0) {
            grid.innerHTML = `<div class="col-span-full text-center p-10 bg-gray-800/50 rounded-xl border border-dashed border-gray-600">
                <p class="text-gray-400 mb-2">Nenhum setor de ${currentSectorFilter} encontrado.</p>
            </div>`;
        } else {
            grid.innerHTML = filteredDocs.map(s => {
                const safeSector = encodeURIComponent(JSON.stringify(s));
                return `
                <div onclick="window.openSectorDetails('${safeSector}')" class="bg-gray-800 p-4 rounded-xl border border-gray-700 shadow-lg relative group hover:border-blue-500 transition cursor-pointer flex flex-col h-full">
                    <div class="flex items-center justify-between mb-3">
                        <div class="w-10 h-10 rounded-full bg-gray-700 flex items-center justify-center text-indigo-400 flex-shrink-0">
                            <i class="fas ${s.type === 'bar' ? 'fa-cocktail' : s.type === 'atendimento' ? 'fa-concierge-bell' : 'fa-fire'}"></i>
                        </div>
                        <span class="bg-gray-900 text-gray-500 text-[10px] px-2 py-1 rounded border border-gray-700 uppercase font-bold tracking-wider">${s.type || 'Geral'}</span>
                    </div>
                    
                    <h5 class="text-white font-bold text-lg mb-1 leading-tight">${s.name}</h5>
                    <p class="text-xs text-gray-500 mb-4 line-clamp-2">Clique para editar categorias e grupos.</p>
                    
                    <div class="mt-auto pt-3 border-t border-gray-700 flex justify-between items-center">
                         <span class="text-[10px] text-gray-600">ID: ${s.id.substring(0,6)}...</span>
                         <i class="fas fa-chevron-right text-gray-600 group-hover:text-blue-400 transition"></i>
                    </div>
                </div>`;
            }).join('');
        }
    } catch (e) {
        console.error(e);
        document.getElementById('sectorsGrid').innerHTML = `<p class="text-red-400 col-span-full">Erro ao carregar setores.</p>`;
    }
}

// ==================================================================
//           5. MODAIS (NOVO, DETALHES & TIPOS)
// ==================================================================

// --- Buscar Tipos de Operação do Banco ---
async function fetchOperationTypes() {
    try {
        const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'operation_types');
        const snap = await getDoc(docRef);
        if (snap.exists() && snap.data().types) {
            return snap.data().types;
        }
    } catch(e) { console.error("Erro ao buscar tipos:", e); }
    
    // Padrões se não houver nada salvo
    return [
        { id: 'production', name: 'Cozinha / Produção' },
        { id: 'bar', name: 'Bar / Bebidas' },
        { id: 'atendimento', name: 'Atendimento / Salão' }
    ];
}

// --- Modal de Gerenciamento de Tipos ---
window.manageOperationTypes = async () => {
    const types = await fetchOperationTypes();
    
    const html = `
        <div id="opTypesModal" class="fixed inset-0 bg-black/90 flex items-center justify-center z-[110] animate-fade-in p-4">
            <div class="bg-dark-card border border-gray-600 p-6 rounded-xl w-full max-w-sm shadow-2xl">
                <div class="flex justify-between items-center mb-4 border-b border-gray-700 pb-2">
                    <h3 class="text-lg font-bold text-white">Gerenciar Tipos</h3>
                    <button onclick="document.getElementById('opTypesModal').remove()" class="text-gray-400 hover:text-white">&times;</button>
                </div>
                
                <div class="flex space-x-2 mb-4">
                    <input type="text" id="newOpTypeName" class="input-pdv w-full text-sm" placeholder="Novo Tipo (ex: Delivery)">
                    <button onclick="window.addOpType()" class="bg-green-600 text-white px-3 rounded hover:bg-green-700"><i class="fas fa-plus"></i></button>
                </div>

                <div id="opTypesList" class="space-y-2 max-h-60 overflow-y-auto custom-scrollbar">
                    ${types.map(t => `
                        <div class="flex justify-between items-center bg-gray-800 p-2 rounded border border-gray-700">
                            <span class="text-sm text-gray-300">${t.name}</span>
                            <button onclick="window.removeOpType('${t.id}')" class="text-red-400 hover:text-red-300"><i class="fas fa-trash"></i></button>
                        </div>
                    `).join('')}
                </div>
            </div>
        </div>
    `;
    getSubModalContainer().insertAdjacentHTML('beforeend', html);
};

window.addOpType = async () => {
    const name = document.getElementById('newOpTypeName').value.trim();
    if (!name) return;
    
    const id = name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/ /g, '_');
    const newType = { id, name };
    
    try {
        const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'operation_types');
        // Cria ou atualiza
        await setDoc(docRef, { types: arrayUnion(newType) }, { merge: true });
        
        document.getElementById('opTypesModal').remove();
        window.manageOperationTypes(); // Recarrega
        showToast("Tipo adicionado!");
    } catch(e) { console.error(e); showToast("Erro ao adicionar.", true); }
};

window.removeOpType = async (id) => {
    if(!confirm("Remover este tipo?")) return;
    try {
        const types = await fetchOperationTypes();
        const typeToRemove = types.find(t => t.id === id);
        
        if(typeToRemove) {
            const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'operation_types');
            await updateDoc(docRef, { types: arrayRemove(typeToRemove) });
            document.getElementById('opTypesModal').remove();
            window.manageOperationTypes();
            showToast("Tipo removido.");
        }
    } catch(e) { console.error(e); showToast("Erro ao remover.", true); }
};

// --- Modal Simples de Novo Setor (Atualizado com Ícone e Lista Dinâmica) ---
window.openSectorModal = async () => {
    const opTypes = await fetchOperationTypes();
    const optionsHtml = opTypes.map(t => `<option value="${t.id}">${t.name}</option>`).join('');

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
                        <div class="flex justify-between items-center mb-1">
                            <label class="block text-xs text-gray-400 uppercase font-bold">Tipo de Operação</label>
                            <button onclick="window.manageOperationTypes()" class="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1" title="Gerenciar Tipos">
                                <i class="fas fa-cog"></i> Configurar
                            </button>
                        </div>
                        <select id="newSectorType" class="input-pdv w-full">
                            ${optionsHtml}
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
        const id = name.toLowerCase().replace(/ /g, '_').normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        await setDoc(doc(getSectorsCollectionRef(), id), {
            name: name,
            type: type,
            createdAt: serverTimestamp()
        });
        document.getElementById('sectorModal').remove();
        showToast("Setor criado!");
        currentSectorFilter = (type === 'atendimento') ? 'atendimento' : 'production';
        const content = document.getElementById('settingsContent');
        if(content) renderSectorsTab(content);
        
    } catch (e) { console.error(e); showToast("Erro ao criar.", true); }
};

// --- Modal Avançado de Detalhes (Vínculos) ---
window.openSectorDetails = async (sectorEncoded) => {
    const sector = JSON.parse(decodeURIComponent(sectorEncoded));
    const opTypes = await fetchOperationTypes(); // Carrega tipos para o edit também
    
    let allCategories = [], allGroups = [];
    try {
        const catSnap = await getDocs(query(collection(db, `artifacts/${appId}/public/data/categories`), orderBy('name')));
        allCategories = catSnap.docs.map(d => ({id: d.id, ...d.data()}));
        
        const grpSnap = await getDocs(query(collection(db, `artifacts/${appId}/public/data/ingredient_types`), orderBy('name')));
        allGroups = grpSnap.docs.map(d => ({id: d.id, ...d.data()}));
    } catch(e) { console.error("Erro loading options", e); }

    const html = `
        <div id="sectorDetailsModal" class="fixed inset-0 bg-black/90 flex items-center justify-center z-[100] animate-fade-in p-4">
            <div class="bg-dark-card border border-gray-600 rounded-xl w-full max-w-2xl shadow-2xl flex flex-col max-h-[90vh]">
                <div class="flex justify-between items-center p-5 border-b border-gray-700 bg-gray-800 rounded-t-xl">
                    <h3 class="text-xl font-bold text-white"><i class="fas fa-edit mr-2 text-indigo-400"></i>Editar: ${sector.name}</h3>
                    <button onclick="document.getElementById('sectorDetailsModal').remove()" class="text-gray-400 hover:text-white text-2xl">&times;</button>
                </div>
                
                <div class="p-5 overflow-y-auto custom-scrollbar flex-grow">
                    
                    <div class="grid grid-cols-2 gap-4 mb-6">
                        <div>
                            <label class="block text-xs text-gray-500 uppercase font-bold mb-1">Nome</label>
                            <input type="text" id="editSectorName" class="input-pdv w-full" value="${sector.name}">
                        </div>
                        <div>
                            <label class="block text-xs text-gray-500 uppercase font-bold mb-1">Tipo</label>
                            <select id="editSectorType" class="input-pdv w-full">
                                ${opTypes.map(t => `<option value="${t.id}" ${sector.type === t.id ? 'selected' : ''}>${t.name}</option>`).join('')}
                            </select>
                        </div>
                    </div>

                    <hr class="border-gray-700 mb-6">

                    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div class="bg-gray-800/50 p-4 rounded-lg border border-gray-700">
                            <h4 class="text-white font-bold mb-2 flex items-center"><i class="fas fa-tags mr-2 text-pumpkin"></i> Categorias (Cardápio)</h4>
                            <p class="text-xs text-gray-400 mb-3">Produtos destas categorias serão enviados para este setor.</p>
                            
                            <div class="flex space-x-2 mb-3">
                                <select id="addCatSelect" class="input-pdv w-full text-xs">
                                    <option value="">+ Vincular Categoria</option>
                                    ${allCategories.map(c => `<option value="${c.id}">${c.name}</option>`).join('')}
                                </select>
                                <button class="bg-green-600 text-white px-3 rounded hover:bg-green-700" onclick="window.addLink('linkedCategories', 'addCatSelect', '${sector.id}')"><i class="fas fa-plus"></i></button>
                            </div>
                            
                            <div id="linkedCategoriesList" class="flex flex-wrap gap-2">
                                ${(sector.linkedCategories || []).map(catId => `
                                    <span class="bg-gray-700 text-gray-300 px-2 py-1 rounded text-xs border border-gray-600 flex items-center">
                                        ${catId} <i class="fas fa-times ml-2 cursor-pointer hover:text-red-400" onclick="window.removeLink('linkedCategories', '${catId}', '${sector.id}')"></i>
                                    </span>
                                `).join('')}
                                ${(sector.linkedCategories || []).length === 0 ? '<span class="text-xs text-gray-600 italic">Nenhuma vinculada.</span>' : ''}
                            </div>
                        </div>

                        <div class="bg-gray-800/50 p-4 rounded-lg border border-gray-700">
                            <h4 class="text-white font-bold mb-2 flex items-center"><i class="fas fa-boxes mr-2 text-blue-400"></i> Grupos (Estoque)</h4>
                            <p class="text-xs text-gray-400 mb-3">Insumos destes grupos pertencem a este setor.</p>
                            
                            <div class="flex space-x-2 mb-3">
                                <select id="addGrpSelect" class="input-pdv w-full text-xs">
                                    <option value="">+ Vincular Grupo</option>
                                    ${allGroups.map(g => `<option value="${g.id}">${g.name}</option>`).join('')}
                                </select>
                                <button class="bg-green-600 text-white px-3 rounded hover:bg-green-700" onclick="window.addLink('linkedGroups', 'addGrpSelect', '${sector.id}')"><i class="fas fa-plus"></i></button>
                            </div>

                            <div id="linkedGroupsList" class="flex flex-wrap gap-2">
                                ${(sector.linkedGroups || []).map(grpId => `
                                    <span class="bg-gray-700 text-gray-300 px-2 py-1 rounded text-xs border border-gray-600 flex items-center">
                                        ${grpId} <i class="fas fa-times ml-2 cursor-pointer hover:text-red-400" onclick="window.removeLink('linkedGroups', '${grpId}', '${sector.id}')"></i>
                                    </span>
                                `).join('')}
                                ${(sector.linkedGroups || []).length === 0 ? '<span class="text-xs text-gray-600 italic">Nenhum vinculado.</span>' : ''}
                            </div>
                        </div>
                    </div>

                </div>
                
                <div class="p-4 border-t border-gray-700 bg-gray-800 rounded-b-xl flex justify-between">
                    <button onclick="window.deleteSector('${sector.id}')" class="px-4 py-2 bg-red-900/50 text-red-300 rounded-lg hover:bg-red-900 font-bold border border-red-800"><i class="fas fa-trash mr-2"></i>Excluir Setor</button>
                    <button onclick="window.updateSectorBasic('${sector.id}')" class="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-bold shadow-lg">Salvar Alterações</button>
                </div>
            </div>
        </div>
    `;
    getSubModalContainer().innerHTML = html;
};

// --- Funções de Manipulação do Modal de Detalhes ---

window.addLink = async (field, selectId, sectorId) => {
    const select = document.getElementById(selectId);
    const value = select.value;
    if (!value) return;

    try {
        const ref = doc(getSectorsCollectionRef(), sectorId);
        await updateDoc(ref, {
            [field]: arrayUnion(value)
        });
        
        const snap = await getDoc(ref);
        document.getElementById('sectorDetailsModal').remove();
        window.openSectorDetails(encodeURIComponent(JSON.stringify({id: sectorId, ...snap.data()})));
        
    } catch(e) { console.error(e); showToast("Erro ao vincular.", true); }
};

window.removeLink = async (field, value, sectorId) => {
    if(!confirm("Remover este vínculo?")) return;
    try {
        const ref = doc(getSectorsCollectionRef(), sectorId);
        await updateDoc(ref, {
            [field]: arrayRemove(value)
        });
        
        const snap = await getDoc(ref);
        document.getElementById('sectorDetailsModal').remove();
        window.openSectorDetails(encodeURIComponent(JSON.stringify({id: sectorId, ...snap.data()})));
    } catch(e) { console.error(e); showToast("Erro ao remover.", true); }
};

window.updateSectorBasic = async (id) => {
    const name = document.getElementById('editSectorName').value;
    const type = document.getElementById('editSectorType').value;
    
    try {
        await updateDoc(doc(getSectorsCollectionRef(), id), { name, type });
        showToast("Setor atualizado!");
        document.getElementById('sectorDetailsModal').remove();
        const content = document.getElementById('settingsContent');
        if(content) renderSectorsTab(content);
    } catch(e) { console.error(e); showToast("Erro ao salvar.", true); }
};

window.deleteSector = async (id) => {
    if(confirm("ATENÇÃO: Excluir este setor pode quebrar o KDS para produtos vinculados a ele. Continuar?")) {
        try {
            await deleteDoc(doc(getSectorsCollectionRef(), id));
            showToast("Setor removido.");
            document.getElementById('sectorDetailsModal').remove();
            const content = document.getElementById('settingsContent');
            if(content) renderSectorsTab(content);
        } catch (e) {
            console.error(e);
            showToast("Erro ao remover.", true);
        }
    }
};