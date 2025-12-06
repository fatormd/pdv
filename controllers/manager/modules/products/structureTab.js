import { setDoc, updateDoc, deleteDoc, doc, arrayUnion, arrayRemove, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { getSectorsCollectionRef } from "/services/firebaseService.js";
import { showToast, toggleLoading } from "/utils.js";
import * as Store from "./store.js";

let currentSectorFilter = 'production'; 

export function renderStructureScreen(container, toolbar) {
    // Toolbar: Filtros de Tipo de Setor
    toolbar.innerHTML = `
        <div class="flex items-center space-x-2 w-full justify-between">
            <div class="flex bg-gray-800 p-1 rounded-lg">
                <button id="btnFilterProd" class="px-4 py-1.5 rounded text-xs font-bold transition ${currentSectorFilter === 'production' ? 'bg-gray-600 text-white shadow' : 'text-gray-400 hover:text-white'}" onclick="window.setSectorFilter('production')">Produção (KDS)</button>
                <button id="btnFilterService" class="px-4 py-1.5 rounded text-xs font-bold transition ${currentSectorFilter === 'atendimento' ? 'bg-gray-600 text-white shadow' : 'text-gray-400 hover:text-white'}" onclick="window.setSectorFilter('atendimento')">Atendimento</button>
            </div>
            <button onclick="window.openSectorModal()" class="bg-blue-600 hover:bg-blue-700 text-white font-bold py-1.5 px-4 rounded text-xs shadow flex items-center">
                <i class="fas fa-plus mr-2"></i> Novo Setor
            </button>
        </div>
    `;

    // Filtra setores do Cache
    const filteredSectors = Store.sectorsCache.filter(s => {
        if (currentSectorFilter === 'atendimento') return s.type === 'atendimento' || s.type === 'service';
        return s.type !== 'atendimento' && s.type !== 'service';
    });

    if (filteredSectors.length === 0) {
        container.innerHTML = `<div class="flex flex-col items-center justify-center h-full text-gray-500"><i class="fas fa-network-wired text-4xl mb-3 opacity-50"></i><p>Nenhum setor encontrado.</p></div>`;
    } else {
        container.innerHTML = `
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 pb-20">
                ${filteredSectors.map(s => {
                    const safeSector = encodeURIComponent(JSON.stringify(s));
                    return `
                    <div onclick="window.openSectorDetails('${safeSector}')" class="bg-gray-800 p-4 rounded-xl border border-gray-700 hover:border-blue-500 transition cursor-pointer group relative">
                        <div class="flex justify-between items-start mb-2">
                            <div class="w-10 h-10 rounded-full bg-gray-700 flex items-center justify-center text-blue-400 font-bold text-lg">
                                ${s.name.charAt(0).toUpperCase()}
                            </div>
                            <span class="text-[10px] uppercase font-bold text-gray-500 bg-black/20 px-2 py-1 rounded">${s.type}</span>
                        </div>
                        <h4 class="text-white font-bold text-lg mb-1">${s.name}</h4>
                        <p class="text-xs text-gray-400">Clique para configurar.</p>
                    </div>`;
                }).join('')}
            </div>
        `;
    }

    // Expor funcões globais necessárias para os onlicks do HTML
    window.setSectorFilter = (type) => {
        currentSectorFilter = type;
        renderStructureScreen(container, toolbar);
    };
    
    // Injeta Modais
    injectSectorModals(container, toolbar);
}

function injectSectorModals(container, toolbar) {
    
    // --- Modal Novo Setor ---
    window.openSectorModal = () => {
        const opTypes = Store.operationTypesCache;
        Store.getSubModalContainer().innerHTML = `
            <div id="sectorModal" class="fixed inset-0 bg-black/80 flex items-center justify-center z-[100] animate-fade-in p-4">
                <div class="bg-dark-card border border-gray-600 p-6 rounded-xl w-full max-w-sm shadow-2xl">
                    <h3 class="text-lg font-bold text-white mb-4">Novo Setor</h3>
                    <input type="text" id="newSectorName" class="input-pdv w-full mb-3" placeholder="Nome (Ex: Sushi Bar)">
                    <div class="flex justify-between items-center mb-1">
                        <label class="text-xs text-gray-400 font-bold uppercase">Tipo</label>
                        <button onclick="window.manageOperationTypes()" class="text-xs text-blue-400 hover:text-blue-300">Gerenciar Tipos</button>
                    </div>
                    <select id="newSectorType" class="input-pdv w-full mb-4">
                        ${opTypes.map(t => `<option value="${t.id}">${t.name}</option>`).join('')}
                    </select>
                    <div class="flex justify-end space-x-2">
                        <button onclick="document.getElementById('sectorModal').remove()" class="px-4 py-2 bg-gray-600 text-white rounded">Cancelar</button>
                        <button onclick="window.saveSector()" class="px-4 py-2 bg-green-600 text-white font-bold rounded">Criar</button>
                    </div>
                </div>
            </div>`;
    };

    window.saveSector = async () => {
        const name = document.getElementById('newSectorName').value;
        const type = document.getElementById('newSectorType').value;
        if (!name) return;
        try {
            const id = name.toLowerCase().replace(/ /g, '_').normalize("NFD").replace(/[\u0300-\u036f]/g, "");
            await setDoc(doc(getSectorsCollectionRef(), id), { name, type, createdAt: serverTimestamp() });
            document.getElementById('sectorModal').remove();
            showToast("Setor criado!");
            await Store.fetchSectors();
            renderStructureScreen(container, toolbar);
        } catch (e) { console.error(e); showToast("Erro.", true); }
    };

    // --- Modal Detalhes/Edição ---
    window.openSectorDetails = (sectorEncoded) => {
        const sector = JSON.parse(decodeURIComponent(sectorEncoded));
        Store.getSubModalContainer().innerHTML = `
            <div id="sectorDetailsModal" class="fixed inset-0 bg-black/90 flex items-center justify-center z-[100] animate-fade-in p-4">
                <div class="bg-dark-card border border-gray-600 rounded-xl w-full max-w-md shadow-2xl p-6">
                    <div class="flex justify-between items-center mb-4 border-b border-gray-700 pb-2">
                        <h3 class="text-xl font-bold text-white">Editar: ${sector.name}</h3>
                        <button onclick="document.getElementById('sectorDetailsModal').remove()" class="text-gray-400 text-2xl">&times;</button>
                    </div>
                    <div class="space-y-3 mb-6">
                        <div><label class="text-xs text-gray-500 uppercase font-bold">Nome</label><input type="text" id="editSectorName" class="input-pdv w-full" value="${sector.name}"></div>
                        <div><label class="text-xs text-gray-500 uppercase font-bold">Tipo</label><select id="editSectorType" class="input-pdv w-full">${Store.operationTypesCache.map(t => `<option value="${t.id}" ${sector.type === t.id ? 'selected' : ''}>${t.name}</option>`).join('')}</select></div>
                    </div>
                    <div class="flex justify-between pt-2 border-t border-gray-700">
                        <button onclick="window.deleteSector('${sector.id}')" class="text-red-400 hover:text-red-300 font-bold text-sm"><i class="fas fa-trash mr-1"></i> Excluir</button>
                        <button onclick="window.updateSector('${sector.id}')" class="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded font-bold">Salvar</button>
                    </div>
                </div>
            </div>`;
    };

    window.updateSector = async (id) => {
        const name = document.getElementById('editSectorName').value;
        const type = document.getElementById('editSectorType').value;
        try {
            await updateDoc(doc(getSectorsCollectionRef(), id), { name, type });
            showToast("Atualizado!");
            document.getElementById('sectorDetailsModal').remove();
            await Store.fetchSectors();
            renderStructureScreen(container, toolbar);
        } catch(e) { console.error(e); showToast("Erro.", true); }
    };

    window.deleteSector = async (id) => {
        if(confirm("Excluir setor?")) {
            try {
                await deleteDoc(doc(getSectorsCollectionRef(), id));
                showToast("Removido.");
                document.getElementById('sectorDetailsModal').remove();
                await Store.fetchSectors();
                renderStructureScreen(container, toolbar);
            } catch(e) { console.error(e); }
        }
    };

    // --- Modal Tipos de Operação (Simplificado) ---
    window.manageOperationTypes = () => {
        // Função auxiliar para adicionar tipos, se necessário. 
        // Por brevidade, alertamos que isso pode ser feito via banco ou adicionar aqui se crítico.
        alert("Gestão avançada de tipos em breve. Use os padrões.");
    };
}