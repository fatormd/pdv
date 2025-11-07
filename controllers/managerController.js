// --- CONTROLLERS/MANAGERCONTROLLER.JS (ATUALIZADO com Gestão de Obs. Rápidas) ---
import { goToScreen } from "/app.js";
import { getProducts } from "/services/wooCommerceService.js";
import { formatCurrency } from "/utils.js";

// ==== NOVOS IMPORTS ====
import { getQuickObsCollectionRef } from "/services/firebaseService.js";
import { getDocs, query, orderBy, doc, setDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
// ==== FIM NOVOS IMPORTS ====


// Estado
let managerInitialized = false;
let productManagementModal; // Mapeado no init

// ==== INÍCIO: NOVAS FUNÇÕES PARA OBS. RÁPIDAS ====

/**
 * Renderiza a lista de observações atuais e o formulário de adição.
 */
const renderQuickObsManagementModal = async () => {
    const managerModal = document.getElementById('managerModal');
    if (!managerModal) return;

    // 1. Buscar observações atuais
    let obsListHtml = '<p class="text-sm text-dark-placeholder italic">Carregando...</p>';
    let currentObs = [];
    try {
        const obsCollectionRef = getQuickObsCollectionRef();
        const q = query(obsCollectionRef, orderBy('text', 'asc'));
        const querySnapshot = await getDocs(q);
        
        currentObs = querySnapshot.docs.map(doc => doc.data().text);
        
        if (currentObs.length === 0) {
            obsListHtml = '<p class="text-sm text-dark-placeholder italic">Nenhuma observação rápida cadastrada.</p>';
        } else {
            obsListHtml = currentObs.map(obsText => `
                <div class="flex justify-between items-center py-2 border-b border-gray-600">
                    <span class="text-dark-text">${obsText}</span>
                    <button class="delete-obs-btn p-2 text-red-500 hover:text-red-400 transition" data-obs-text="${obsText}" title="Excluir">
                        <i class="fas fa-trash-alt pointer-events-none"></i>
                    </button>
                </div>
            `).join('');
        }
    } catch (e) {
        console.error("Erro ao buscar obs. rápidas:", e);
        obsListHtml = '<p class="text-sm text-red-400">Erro ao carregar lista.</p>';
    }

    // 2. Montar o HTML do Modal
    managerModal.innerHTML = `
        <div class="bg-dark-card border border-gray-600 p-6 rounded-xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col">
            <div class="flex justify-between items-center mb-4 flex-shrink-0">
                <h3 class="text-xl font-bold text-pumpkin">Gerenciar Observações Rápidas</h3>
                <button class="px-4 py-2 bg-gray-600 text-gray-200 rounded-lg hover:bg-gray-500 transition" 
                        onclick="document.getElementById('managerModal').style.display='none'">
                    Fechar
                </button>
            </div>

            <form id="addObsForm" class="flex space-x-2 mb-4 flex-shrink-0">
                <input type="text" id="newObsTextInput" placeholder="Texto da Observação (Ex: Sem Gelo)" class="input-pdv w-full">
                <button type="submit" class="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition font-semibold">
                    Adicionar
                </button>
            </form>

            <div id="quickObsListContainer" class="flex-grow overflow-y-auto bg-dark-bg border border-gray-700 rounded-lg p-3 custom-scrollbar">
                ${obsListHtml}
            </div>
        </div>
    `;

    // 3. Adicionar Listeners
    const addObsForm = document.getElementById('addObsForm');
    const newObsTextInput = document.getElementById('newObsTextInput');
    
    addObsForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const newText = newObsTextInput.value.trim();
        if (newText) {
            await handleAddQuickObs(newText);
        }
    });

    document.querySelectorAll('.delete-obs-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const obsText = e.currentTarget.dataset.obsText;
            if (obsText) {
                await handleDeleteQuickObs(obsText);
            }
        });
    });

    // 4. Exibir o Modal
    managerModal.style.display = 'flex';
};

/**
 * Adiciona uma nova observação ao Firebase.
 * Usamos o próprio texto como ID para evitar duplicatas.
 */
const handleAddQuickObs = async (newText) => {
    try {
        const obsCollectionRef = getQuickObsCollectionRef();
        // Usar o texto como ID é uma forma simples de garantir que não haja duplicatas
        const obsDocRef = doc(obsCollectionRef, newText); 
        await setDoc(obsDocRef, { text: newText });
        
        // Recarrega o modal para mostrar a lista atualizada
        await renderQuickObsManagementModal(); 
    } catch (e) {
        console.error("Erro ao adicionar observação:", e);
        alert("Falha ao adicionar observação.");
    }
};

/**
 * Exclui uma observação do Firebase.
 */
const handleDeleteQuickObs = async (obsText) => {
    if (!confirm(`Tem certeza que deseja excluir a observação "${obsText}"?`)) {
        return;
    }
    
    try {
        const obsCollectionRef = getQuickObsCollectionRef();
        const obsDocRef = doc(obsCollectionRef, obsText);
        await deleteDoc(obsDocRef);

        // Recarrega o modal para mostrar a lista atualizada
        await renderQuickObsManagementModal();
    } catch (e) {
        console.error("Erro ao excluir observação:", e);
        alert("Falha ao excluir observação.");
    }
};

/**
 * Função de entrada chamada pelo app.js
 */
const openQuickObsManagement = () => {
    // Apenas renderiza o modal. A função fará o fetch dos dados.
    renderQuickObsManagementModal();
};

// ==== FIM: NOVAS FUNÇÕES ====


// --- FUNÇÕES DE GESTÃO (Placeholders) ---
const renderProductManagement = () => {
    if (!productManagementModal) {
         productManagementModal = document.getElementById('productManagementModal'); // Tenta mapear se falhou
         if (!productManagementModal) {
             alert("Módulo de Gestão de Produtos em desenvolvimento.");
             return;
         }
    }
    
    const products = getProducts();
    let listHtml = products.map(p => `
        <div class="flex justify-between items-center py-2 border-b border-gray-600">
            <div class="flex flex-col">
                <span class="font-semibold text-dark-text">${p.name}</span>
                <span class="text-xs text-dark-placeholder">ID: ${p.id} | Setor: ${p.sector}</span>
            </div>
            {/* ... (botões editar/excluir) ... */}
        </div>
    `).join('');

    productManagementModal.innerHTML = `
        <div class="bg-dark-card border border-gray-600 p-6 rounded-xl shadow-2xl w-full max-w-xl max-h-screen overflow-y-auto">
            <h3 class="text-xl font-bold mb-4 text-pumpkin">Gestão de Produtos (WooCommerce)</h3>
            <div class="flex justify-between mb-4">
                 <button class="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition" onclick="alert('Abrir formulário de criação')">
                    <i class="fas fa-plus"></i> Novo Produto
                 </button>
                 <button class="px-4 py-2 bg-gray-600 text-gray-200 rounded-lg hover:bg-gray-500 transition" onclick="document.getElementById('productManagementModal').style.display='none'">
                    Fechar
                 </button>
            </div>
            <div class="border border-gray-600 p-3 rounded-lg max-h-96 overflow-y-auto bg-dark-bg">
                ${listHtml || '<p class="text-dark-placeholder italic">Nenhum produto carregado.</p>'}
            </div>
        </div>
    `;
    productManagementModal.style.display = 'flex';
};

// Esta função agora é chamada pelo app.js (openManagerAuthModal)
export const handleGerencialAction = (action, payload) => {
    console.log(`[Manager] Executando ação gerencial: ${action}`);
    switch (action) {
        // Ações de PaymentController são tratadas no app.js
        case 'goToManagerPanel':
             goToScreen('managerScreen');
             break;
        case 'openProductManagement':
        case 'openCategoryManagement':
            renderProductManagement();
            break;
        case 'openInventoryManagement':
            alert("Módulo de ESTOQUE (DEV).");
            break;
        case 'openCashManagement':
            alert("Módulo de GESTÃO DE CAIXA (DEV).");
            break;
        case 'openReservations':
            alert("Módulo de RESERVAS/FILA (DEV).");
            break;
        case 'openCustomerCRM':
            alert("Módulo de CRM (DEV).");
            break;
        case 'openWaiterReg':
            alert("Módulo de Cadastro de Usuários (DEV).");
            break;
        case 'openRecipesManagement':
            alert("Módulo de FICHA TÉCNICA (DEV).");
            break;
        case 'openWooSync':
            alert("Ação de SINCRONIZAÇÃO (DEV).");
            break;
        
        // ==== ATUALIZADO ====
        case 'openQuickObsManagement':
            openQuickObsManagement(); // Chama a nova função
            break;
        // ==== FIM ATUALIZAÇÃO ====

        default:
             alert(`Módulo Gerencial não reconhecido: ${action}.`);
    }
};

// REMOVIDO: export const openManagerAuthModal = (...) => { ... }; (Movido para app.js)


// --- INICIALIZAÇÃO DO CONTROLLER ---
export const initManagerController = () => {
    if(managerInitialized) return;
    console.log("[ManagerController] Inicializando...");

    productManagementModal = document.getElementById('productManagementModal');
    const managerCards = document.querySelectorAll('#managerScreen .manager-card');

    managerCards.forEach(card => {
        const onclickAttr = card.getAttribute('onclick');
        if (onclickAttr) {
            card.removeAttribute('onclick'); // Remove onclick inline

            // Tenta extrair a ação do openManagerAuthModal
            const matchAuth = onclickAttr.match(/openManagerAuthModal\('([^']+)'/);
            // CORREÇÃO: Trata o caso do modal de Relatórios
            const matchReports = onclickAttr.includes("document.getElementById('reportsModal')");

            if (matchAuth && matchAuth[1]) {
                const action = matchAuth[1];
                const payload = null;
                card.addEventListener('click', () => {
                    // Chama a função GLOBAL do app.js
                    window.openManagerAuthModal(action, payload);
                });
            } else if (matchReports) {
                 // Trata o botão de Relatórios especificamente
                 card.addEventListener('click', () => {
                     const modal = document.getElementById('reportsModal');
                     // (O modal de relatórios também precisa de estilo dark)
                     if(modal) modal.style.display = 'flex';
                     else alert("Modal de relatórios não encontrado.");
                 });
            } else {
                 console.warn("Não foi possível parsear onclick para card:", card.outerHTML);
                 // Adiciona um listener de fallback
                 card.addEventListener('click', () => {
                    try { eval(onclickAttr); } catch(e) { console.error("Erro ao executar onclick antigo:", e); }
                 });
            }
        }
    });

    // Mapeia e adiciona listener para o botão de voltar
    const backBtn = document.getElementById('backToPanelFromManagerBtn');
    if (backBtn) {
        // Remove onclick inline se existir
        backBtn.removeAttribute('onclick');
        backBtn.addEventListener('click', () => window.goToScreen('panelScreen'));
    }

    managerInitialized = true;
    console.log("[ManagerController] Inicializado.");
};
