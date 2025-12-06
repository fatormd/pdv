import { doc, updateDoc, addDoc, deleteDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { showToast } from "/utils.js";
import * as Store from "./store.js";

let currentGroupFilter = 'all';

export function renderIngredientsScreen(container, toolbar) {
    // Popula as opções de filtro
    let groupOptions = '<option value="all">Todos os Grupos</option>';
    if (Store.groupsCache.length > 0) {
        groupOptions += Store.groupsCache.map(g => {
            const gId = g.name.toLowerCase().replace(/ /g, '_').normalize("NFD").replace(/[\u0300-\u036f]/g, "");
            return `<option value="${gId}" ${currentGroupFilter === gId ? 'selected' : ''}>${g.name}</option>`;
        }).join('');
    }

    // Toolbar Simplificada (Sem botão de Baixar Estoque)
    toolbar.innerHTML = `
        <div class="flex items-center space-x-2 w-full justify-between">
            <select id="ingredientGroupFilter" class="bg-gray-700 text-white text-sm py-2 px-3 rounded-lg border border-gray-600 focus:outline-none focus:border-indigo-500 w-full md:w-48">
                ${groupOptions}
            </select>
            <div class="flex space-x-2 flex-shrink-0">
                <button id="btnNewIngredient" class="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-lg shadow flex items-center ml-2 whitespace-nowrap">
                    <i class="fas fa-plus mr-2"></i> <span class="hidden md:inline">Novo Item</span><span class="md:hidden">Novo</span>
                </button>
            </div>
        </div>`;
    
    // Eventos da Toolbar
    document.getElementById('ingredientGroupFilter').onchange = (e) => { 
        currentGroupFilter = e.target.value; 
        renderIngredientsScreen(container, toolbar); 
    };
    document.getElementById('btnNewIngredient').onclick = () => renderIngredientForm(null); 

    // Filtragem da Lista
    const filteredList = currentGroupFilter === 'all' 
        ? Store.ingredientsCache 
        : Store.ingredientsCache.filter(i => i.group === currentGroupFilter);
    
    // Estado Vazio
    if (filteredList.length === 0) { 
        container.innerHTML = '<div class="flex flex-col items-center justify-center h-full text-gray-500"><p>Nenhum item de estoque encontrado.</p></div>'; 
        return; 
    }
    
    // Grid Responsivo: 2 colunas no mobile -> aumenta conforme a tela
    container.innerHTML = `
        <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 pb-20">
            ${filteredList.map(ing => `
                <div class="bg-gray-800 p-3 rounded-lg border border-gray-700 flex flex-col justify-between group hover:border-gray-600 transition h-full relative">
                    
                    <div class="mb-2">
                        <h4 class="font-bold text-white text-sm leading-tight mb-1 break-words">${ing.name}</h4>
                        <p class="text-[10px] text-gray-400 uppercase truncate">${ing.group || 'Geral'}</p>
                    </div>

                    <div class="flex justify-between items-end mt-auto pt-2 border-t border-gray-700/50">
                        <div class="text-[10px] text-gray-500">
                            R$ ${ing.cost.toFixed(2)}/${ing.unit}
                        </div>
                        <div class="text-right font-mono font-bold text-sm ${ing.stock <= (ing.minStock||0) ? 'text-red-500' : 'text-green-400'}">
                            ${parseFloat(ing.stock).toFixed(2)} <span class="text-[10px] font-normal text-gray-500">${ing.unit}</span>
                        </div>
                    </div>

                    <div class="absolute top-2 right-2 flex space-x-1 opacity-100 md:opacity-0 group-hover:opacity-100 transition-opacity bg-gray-800/80 rounded">
                        <button class="text-blue-400 hover:text-blue-300 p-1.5 btn-edit-ing" data-id="${ing.id}" title="Editar">
                            <i class="fas fa-edit text-xs"></i>
                        </button>
                        <button class="text-red-400 hover:text-red-300 p-1.5 btn-del-ing" data-id="${ing.id}" title="Excluir">
                            <i class="fas fa-trash text-xs"></i>
                        </button>
                    </div>

                </div>`).join('')}
        </div>`;
    
    // Listeners dos Cards
    container.querySelectorAll('.btn-edit-ing').forEach(btn => 
        btn.onclick = () => renderIngredientForm(Store.ingredientsCache.find(i => i.id === btn.dataset.id))
    );
    
    container.querySelectorAll('.btn-del-ing').forEach(btn => 
        btn.onclick = async () => { 
            if(confirm("Excluir este item do estoque?")) { 
                await deleteDoc(doc(Store.getColRef('ingredients'), btn.dataset.id)); 
                showToast("Item excluído.");
                await Store.fetchIngredients(); 
                renderIngredientsScreen(container, toolbar); 
            }
        }
    );
}

function renderIngredientForm(ingredient) {
    const isEdit = !!ingredient;
    let groupOptions = '<option value="">Selecione...</option>';
    
    if (Store.groupsCache.length > 0) {
        groupOptions += Store.groupsCache.map(g => {
            const gId = g.name.toLowerCase().replace(/ /g, '_').normalize("NFD").replace(/[\u0300-\u036f]/g, "");
            return `<option value="${gId}" ${ingredient?.group === gId ? 'selected' : ''}>${g.name}</option>`;
        }).join('');
    }

    Store.getSubModalContainer().innerHTML = `
        <div id="ingredientFormModal" class="fixed inset-0 bg-black/80 flex items-center justify-center z-[80] animate-fade-in p-4">
            <div class="bg-dark-card border border-gray-600 p-6 rounded-xl w-full max-w-md max-h-[90vh] overflow-y-auto shadow-2xl m-4">
                <div class="flex justify-between items-center mb-4 border-b border-gray-700 pb-2">
                    <h3 class="text-xl font-bold text-white">${isEdit ? 'Editar' : 'Novo'} Item de Estoque</h3>
                    <button onclick="document.getElementById('ingredientFormModal').remove()" class="text-gray-400 hover:text-white text-2xl">&times;</button>
                </div>
                
                <div class="space-y-3">
                    <div>
                        <label class="text-xs text-gray-400 uppercase font-bold">Nome</label>
                        <input id="ingName" type="text" class="input-pdv w-full p-2" value="${ingredient?.name || ''}">
                    </div>
                    
                    <div class="grid grid-cols-2 gap-3">
                        <div>
                            <label class="text-xs text-gray-400 uppercase font-bold">Custo (R$)</label>
                            <input id="ingCost" type="number" class="input-pdv w-full p-2" value="${ingredient?.cost || ''}" step="0.01">
                        </div>
                        <div>
                            <label class="text-xs text-gray-400 uppercase font-bold">Unidade</label>
                            <input id="ingUnit" type="text" class="input-pdv w-full p-2" value="${ingredient?.unit || ''}">
                        </div>
                    </div>
                    
                    <div class="grid grid-cols-2 gap-3">
                        <div>
                            <label class="text-xs text-gray-400 uppercase font-bold">Estoque Atual</label>
                            <input id="ingStock" type="number" class="input-pdv w-full p-2" value="${ingredient?.stock || ''}">
                        </div>
                        <div>
                            <label class="text-xs text-gray-400 uppercase font-bold">Estoque Mínimo</label>
                            <input id="ingMinStock" type="number" class="input-pdv w-full p-2" value="${ingredient?.minStock || 5}">
                        </div>
                    </div>
                    
                    <div class="grid grid-cols-2 gap-3">
                        <div>
                            <label class="text-xs text-gray-400 uppercase font-bold">Grupo</label>
                            <select id="ingGroup" class="input-pdv w-full p-2">
                                ${groupOptions}
                            </select>
                        </div>
                        <div>
                            <label class="text-xs text-gray-400 uppercase font-bold">Categoria</label>
                            <select id="ingCostCategory" class="input-pdv w-full p-2">
                                <option value="CMV" ${ingredient?.costCategory === 'CMV'?'selected':''}>CMV</option>
                                <option value="Limpeza" ${ingredient?.costCategory === 'Limpeza'?'selected':''}>Limpeza</option>
                                <option value="Embalagem" ${ingredient?.costCategory === 'Embalagem'?'selected':''}>Embalagem</option>
                            </select>
                        </div>
                    </div>
                </div>

                <div class="flex justify-end space-x-3 mt-6 pt-4 border-t border-gray-700">
                    <button onclick="document.getElementById('ingredientFormModal').remove()" class="px-4 py-2 bg-gray-600 text-white rounded-lg">Cancelar</button>
                    <button id="btnSaveIng" class="px-4 py-2 bg-green-600 text-white rounded-lg font-bold">Salvar</button>
                </div>
            </div>
        </div>`;
    
    document.getElementById('btnSaveIng').onclick = async () => {
        const data = { 
            name: document.getElementById('ingName').value, 
            cost: parseFloat(document.getElementById('ingCost').value)||0, 
            stock: parseFloat(document.getElementById('ingStock').value)||0, 
            unit: document.getElementById('ingUnit').value||'un', 
            minStock: parseFloat(document.getElementById('ingMinStock').value)||0, 
            group: document.getElementById('ingGroup').value, 
            costCategory: document.getElementById('ingCostCategory').value, 
            updatedAt: serverTimestamp() 
        };
        
        if(!data.name) return;
        
        if (isEdit) {
            await updateDoc(doc(Store.getColRef('ingredients'), ingredient.id), data);
        } else {
            await addDoc(Store.getColRef('ingredients'), { ...data, createdAt: serverTimestamp() });
        }
        
        document.getElementById('ingredientFormModal').remove(); 
        showToast("Item Salvo!"); 
        await Store.fetchIngredients(); 
        
        const container = document.getElementById('hubContent'); 
        const toolbar = document.getElementById('productActionsToolbar'); 
        if(container) renderIngredientsScreen(container, toolbar);
    };
}