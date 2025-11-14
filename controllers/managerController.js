// --- CONTROLLERS/MANAGERCONTROLLER.JS (COMPLETO COM VOUCHER MANAGEMENT E CORREÇÃO FINAL DE INICIALIZAÇÃO) ---
import { functions, auth } from "/services/firebaseService.js";
import { httpsCallable } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-functions.js";
import { openUserManagementModal } from "/controllers/userManagementController.js";

// ==== IMPORT CORRIGIDO: Importa getVouchersCollectionRef do service ====
import { getQuickObsCollectionRef, getVouchersCollectionRef } from "/services/firebaseService.js"; 
import { 
    getDocs, query, orderBy, doc, setDoc, deleteDoc, updateDoc, FieldValue, serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { formatCurrency } from "/utils.js";

// ==== VARIÁVEIS ADICIONADAS PARA VOUCHERS ====
let voucherManagementModal, voucherListContainer, voucherForm;
// ==== FIM VARIÁVEIS ADICIONADAS ====

let managerModal; // Container do modal
let managerAuthCallback; // Guarda a ação que precisa de autenticação


// --- REFERÊNCIAS DO FIREBASE ---
// NÃO DEFINIMOS NADA AQUI PARA EVITAR O ERRO DE INICIALIZAÇÃO
// As funções getVouchersCollectionRef e getQuickObsCollectionRef são importadas do services/firebaseService.js
// --- FIM REFERÊNCIAS DO FIREBASE ---


/**
 * Abre o modal de autenticação de gerente.
 * @param {string} actionCallback - A função (string) a ser executada após a senha correta.
 */
export const openManagerAuthModal = (actionCallback) => {
    if (!managerModal) {
         console.error("Modal Gerencial não encontrado.");
         return;
    }
    
    managerAuthCallback = actionCallback; // Salva a ação (ex: 'openQuickObsManagement' ou 'openVoucherManagement')

    const authModalHTML = `
        <div class="bg-dark-card border border-dark-border p-6 rounded-xl shadow-2xl w-full max-w-sm text-center">
            <h3 class="text-xl font-bold mb-4 text-red-400">Acesso Restrito</h3>
            <p class="text-base mb-6 text-dark-text">Por favor, insira a senha de Gerente para continuar.</p>
            <form id="managerAuthForm">
                <input type="password" id="managerPasswordInput" placeholder="Senha de Gerente" class="input-pdv w-full p-4 mb-6 text-base" autocomplete="current-password">
                <div id="managerAuthError" class="text-red-400 text-sm mb-4" style="display: none;"></div>
                <div class="flex justify-end space-x-3">
                    <button type="button" id="cancelManagerAuthBtn" class="px-4 py-3 bg-gray-600 text-gray-200 rounded-lg hover:bg-gray-500 transition">Cancelar</button>
                    <button type="submit" id="submitManagerAuthBtn" class="px-4 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 transition">Autorizar</button>
                </div>
            </form>
        </div>
    `;
    
    managerModal.innerHTML = authModalHTML;
    managerModal.style.display = 'flex';
    document.getElementById('managerPasswordInput').focus();

    // Adiciona listeners ao formulário
    document.getElementById('cancelManagerAuthBtn').onclick = () => managerModal.style.display = 'none';
    document.getElementById('managerAuthForm').onsubmit = handleManagerAuthSubmit;
};
window.openManagerAuthModal = openManagerAuthModal;


/**
 * Lida com o submit do formulário de autenticação de gerente.
 */
const handleManagerAuthSubmit = async (e) => {
    e.preventDefault();
    const passwordInput = document.getElementById('managerPasswordInput');
    const errorMsg = document.getElementById('managerAuthError');
    const submitBtn = document.getElementById('submitManagerAuthBtn');
    
    if (!passwordInput || !errorMsg || !submitBtn) return;

    const password = passwordInput.value;
    if (password.length < 4) {
        errorMsg.textContent = "Senha inválida.";
        errorMsg.style.display = 'block';
        return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = "Verificando...";
    errorMsg.style.display = 'none';

    try {
        
        const verifyManagerPassword = httpsCallable(functions, 'verifyManagerPassword');
        const result = await verifyManagerPassword({ password: password });

        if (result.data.success) {
            console.log("[Manager] Autorização concedida.");
            // Executa a ação que estava pendente
            if (managerAuthCallback) {
                handleGerencialAction(managerAuthCallback, null);
            }
        } else {
            throw new Error(result.data.error || "Senha incorreta.");
        }

    } catch (error) {
        console.error("Erro na autorização gerencial:", error);
        errorMsg.textContent = error.message || "Senha incorreta ou falha na verificação.";
        errorMsg.style.display = 'block';
        submitBtn.disabled = false;
        submitBtn.textContent = "Autorizar";
    }
};

// ==================================================================
//               FUNÇÕES DE VOUCHER MANAGEMENT
// ==================================================================

/**
 * Renderiza a lista de vouchers na modal.
 */
const renderVouchers = (vouchers) => {
    if (!voucherListContainer) return;

    if (vouchers.length === 0) {
        voucherListContainer.innerHTML = '<p class="text-sm text-dark-placeholder italic">Nenhuma regra de voucher cadastrada.</p>';
        return;
    }

    voucherListContainer.innerHTML = vouchers.map(v => `
        <div class="flex justify-between items-center bg-dark-input p-3 rounded-lg mb-2">
            <div>
                <h4 class="font-bold text-dark-text">${v.name}</h4>
                <p class="text-sm text-indigo-400">${v.points} pontos por ${formatCurrency(v.value)}</p>
            </div>
            <button class="text-red-400 hover:text-red-500 transition" 
                    onclick="window.handleDeleteVoucher('${v.id}')">
                <i class="fas fa-trash"></i>
            </button>
        </div>
    `).join('');
};

/**
 * Busca os vouchers do Firestore.
 */
const fetchVouchers = async () => {
    if (!voucherListContainer) return;
    voucherListContainer.innerHTML = '<p class="text-sm text-yellow-400 italic">Buscando vouchers...</p>';
    try {
        // CORRIGIDO: Usa a função importada
        const q = query(getVouchersCollectionRef(), orderBy('points', 'asc'));
        const querySnapshot = await getDocs(q);
        
        const vouchers = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        
        renderVouchers(vouchers);
        return vouchers;

    } catch (error) {
        console.error("Erro ao buscar vouchers:", error);
        voucherListContainer.innerHTML = '<p class="text-sm text-red-400">Erro ao carregar vouchers.</p>';
        return [];
    }
};

/**
 * Abre a modal de gerenciamento de vouchers.
 */
const openVoucherManagementModal = async () => {
    if (!voucherManagementModal) return;
    if(managerModal) managerModal.style.display = 'none'; // Fecha o modal de autenticação
    voucherManagementModal.style.display = 'flex';
    if(voucherForm) voucherForm.style.display = 'none'; // Esconde o form por padrão
    await fetchVouchers();
};
window.openVoucherManagementModal = openVoucherManagementModal;


/**
 * Salva ou atualiza um voucher.
 */
const handleSaveVoucher = async (e) => {
    e.preventDefault();
    // CORRIGIDO: Usa a função importada
    const id = document.getElementById('voucherIdInput').value || doc(getVouchersCollectionRef()).id; 
    const name = document.getElementById('voucherNameInput').value;
    const points = parseInt(document.getElementById('voucherPointsInput').value);
    const value = parseFloat(document.getElementById('voucherValueInput').value);
    const errorEl = document.getElementById('voucherFormError');
    const saveBtn = document.getElementById('saveVoucherBtn');

    if (points <= 0 || value <= 0) {
        errorEl.textContent = 'Pontos e valor de desconto devem ser maiores que zero.';
        errorEl.style.display = 'block';
        return;
    }
    errorEl.style.display = 'none';
    saveBtn.disabled = true;

    try {
        const voucherRef = doc(getVouchersCollectionRef(), id);
        await setDoc(voucherRef, {
            id,
            name,
            points,
            value,
            createdAt: serverTimestamp() 
        }, { merge: true });

        document.getElementById('voucherForm').reset();
        document.getElementById('voucherForm').style.display = 'none';
        await fetchVouchers();
        alert(`Voucher ${name} salvo com sucesso!`);

    } catch (e) {
        console.error("Erro ao salvar voucher:", e);
        errorEl.textContent = 'Falha ao salvar voucher.';
        errorEl.style.display = 'block';
    } finally {
        saveBtn.disabled = false;
    }
};

/**
 * Exclui um voucher.
 */
const handleDeleteVoucher = async (id) => {
    if (!confirm("Tem certeza que deseja EXCLUIR esta regra de voucher?")) return;
    
    try {
        const voucherRef = doc(getVouchersCollectionRef(), id);
        await deleteDoc(voucherRef);
        await fetchVouchers();
        alert("Voucher excluído com sucesso.");
    } catch (e) {
        console.error("Erro ao excluir voucher:", e);
        alert("Falha ao excluir voucher.");
    }
};
window.handleDeleteVoucher = handleDeleteVoucher; 

// ==================================================================
//        FIM FUNÇÕES DE VOUCHER MANAGEMENT
// ==================================================================


// ==================================================================
//               GERENCIAR OBSERVAÇÕES RÁPIDAS (EXISTENTE)
// ==================================================================

/**
 * Renderiza o HTML do modal de gerenciamento de observações rápidas.
 * Busca os dados do Firebase e popula o modal.
 */
const renderQuickObsManagementModal = async () => {
    if (!managerModal) return;

    const modalHTML = `
    <div class="bg-dark-card border border-dark-border p-6 rounded-xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col">
        <div class="flex justify-between items-center mb-4 flex-shrink-0">
            <h3 class="text-xl font-bold text-indigo-400">Gerenciar Observações Rápidas</h3>
            <button id="closeQuickObsModalBtn" class="px-4 py-2 bg-gray-600 text-gray-200 rounded-lg hover:bg-gray-500 transition">
                Fechar
            </button>
        </div>
        
        <div class="flex-grow overflow-y-auto mb-4 custom-scrollbar">
            <form id="addQuickObsForm" class="flex space-x-2 mb-4">
                <input type="text" id="newQuickObsInput" placeholder="Digite a nova observação (ex: Sem Gelo)" class="input-pdv w-full" required>
                <button type="submit" class="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition">Adicionar</button>
            </form>
            
            <div id="quickObsListContainer" class="space-y-2 min-h-[100px]">
                <p class="text-dark-placeholder italic">Carregando observações...</p>
            </div>
        </div>
    </div>
    `;
    
    managerModal.innerHTML = modalHTML;
    managerModal.style.display = 'flex';
    
    const listContainer = document.getElementById('quickObsListContainer');
    
    // Busca dados
    try {
        const q = query(getQuickObsCollectionRef(), orderBy('text', 'asc'));
        const querySnapshot = await getDocs(q);
        const obsList = querySnapshot.docs.map(doc => ({ id: doc.id, text: doc.data().text }));
        
        if (obsList.length === 0) {
            listContainer.innerHTML = '<p class="text-dark-placeholder italic">Nenhuma observação cadastrada.</p>';
        } else {
            listContainer.innerHTML = obsList.map(obs => `
                <div class="flex justify-between items-center bg-dark-input p-3 rounded-lg">
                    <span class="text-dark-text">${obs.text}</span>
                    <button class="delete-quick-obs-btn text-red-400 hover:text-red-500" data-id="${obs.id}" data-text="${obs.text}" title="Excluir">
                        <i class="fas fa-trash pointer-events-none"></i>
                    </button>
                </div>
            `).join('');
        }

        // Adiciona listeners de exclusão
        listContainer.querySelectorAll('.delete-quick-obs-btn').forEach(btn => {
            btn.onclick = (e) => {
                const docId = e.currentTarget.dataset.id;
                const docText = e.currentTarget.dataset.text;
                handleDeleteQuickObs(docId, docText);
            };
        });

    } catch (e) {
        console.error("Erro ao buscar obs rápidas:", e);
        listContainer.innerHTML = '<p class="text-red-400">Erro ao carregar observações.</p>';
    }

    // Adiciona listeners do modal
    document.getElementById('closeQuickObsModalBtn').onclick = () => managerModal.style.display = 'none';
    document.getElementById('addQuickObsForm').onsubmit = (e) => {
        e.preventDefault();
        const input = document.getElementById('newQuickObsInput');
        const newText = input.value.trim();
        if (newText) {
            handleAddQuickObs(newText, input);
        }
    };
};

/**
 * Adiciona uma nova observação ao Firebase.
 */
const handleAddQuickObs = async (newText, inputElement) => {
    if (!newText) return;
    
    try {
        // Cria uma referência de documento baseada no próprio texto (para evitar duplicatas)
        const docId = newText.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
        if (docId.length === 0) {
             alert("Texto inválido para criar um ID.");
             return;
        }
        
        const obsRef = doc(getQuickObsCollectionRef(), docId);
        
        await setDoc(obsRef, { text: newText });
        
        console.log(`Observação rápida "${newText}" adicionada.`);
        renderQuickObsManagementModal(); // Re-renderiza o modal
        
    } catch (e) {
        console.error("Erro ao adicionar observação:", e);
        alert("Falha ao adicionar observação.");
        if (inputElement) inputElement.value = newText; // Devolve o texto
    }
};

/**
 * Exclui uma observação do Firebase.
 */
const handleDeleteQuickObs = async (docId, obsText) => {
    if (!docId || !obsText) return;
    if (!confirm(`Tem certeza que deseja excluir a observação "${obsText}"?`)) return;

    try {
        const obsRef = doc(getQuickObsCollectionRef(), docId);
        await deleteDoc(obsRef);
        
        console.log(`Observação rápida "${obsText}" excluída.`);
        renderQuickObsManagementModal(); // Re-renderiza

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


// ==================================================================
//               AÇÃO GERENCIAL PRINCIPAL
// ==================================================================

/**
 * Ponto de entrada para todas as ações do painel gerencial.
 * @param {string} action - O nome da ação (ex: 'openCashManagement').
 * @param {object} payload - Dados extras (se necessário).
 */
export const handleGerencialAction = (action, payload) => {
    console.log(`[Manager] Executando ação gerencial: ${action}`);
    
    // Fecha o modal de autenticação (se estiver aberto)
    if (managerModal) managerModal.style.display = 'none';

    switch (action) {
        case 'openProductManagement':
            alert("Módulo Gerenciar Produtos (WooCommerce) em desenvolvimento.");
            // Exemplo futuro: openProductManagementModal();
            break;
        case 'openCashManagement':
            alert("Módulo Gerenciar Caixa em desenvolvimento.");
            // Exemplo futuro: openCashManagementModal();
            break;
        case 'openInventoryManagement':
            alert("Módulo Gerenciar Estoque em desenvolvimento.");
            break;
        case 'openRecipesManagement':
            alert("Módulo Gerenciar Ficha Técnica em desenvolvimento.");
            break;
        case 'openCustomerCRM':
            alert("Módulo Gerenciar Clientes (CRM) em desenvolvimento.");
            break;
        case 'openWaiterReg':
            // Esta é a ação de 'Gerenciar Usuários'
            openUserManagementModal();
            break;
        case 'openWooSync':
            alert("Módulo Sincronizar WooCommerce em desenvolvimento.");
            break;
        case 'openSectorManagement':
            alert("Módulo Gerenciar Setores em desenvolvimento.");
            break;
            
        // ==== ATUALIZADO ====
        case 'openQuickObsManagement':
            openQuickObsManagement(); // Chama a nova função
            break;
        case 'openVoucherManagement': // <--- NOVO CASE
            openVoucherManagementModal();
            break;
        // ==== FIM ATUALIZAÇÃO ====
            
        case 'openTableMerge':
            alert("Módulo Agrupar Mesas em desenvolvimento.");
            break;
        default:
             alert(`Módulo Gerencial não reconhecido: ${action}.`);
    }
};


/**
 * Inicializa o controller do painel gerencial.
 */
export const initManagerController = () => {
    console.log("[ManagerController] Inicializando...");
    
    managerModal = document.getElementById('managerModal');
    
    if (!managerModal) {
         console.error("[ManagerController] Erro Fatal: Modal 'managerModal' não encontrado.");
         return;
    }
    
    // Adiciona listener para fechar o modal clicando no fundo (se necessário)
    managerModal.addEventListener('click', (e) => {
         if (e.target === managerModal) {
             managerModal.style.display = 'none';
         }
    });

    // ==== Mapeamento de elementos do Voucher Management ====
    voucherManagementModal = document.getElementById('voucherManagementModal'); 
    voucherListContainer = document.getElementById('voucherListContainer');     
    voucherForm = document.getElementById('voucherForm');                       
    const showVoucherFormBtn = document.getElementById('showVoucherFormBtn'); 
    // ==== FIM Mapeamento ====

    // ==== LISTENERS DO NOVO FORM DE VOUCHER ====
    if (voucherForm) voucherForm.addEventListener('submit', handleSaveVoucher);
    if (showVoucherFormBtn) showVoucherFormBtn.addEventListener('click', () => { 
        voucherForm.style.display = 'block'; 
        voucherForm.reset();
        document.getElementById('voucherFormTitle').textContent = 'Novo Voucher';
        document.getElementById('saveVoucherBtn').textContent = 'Salvar Voucher';
    });
    // ==== FIM LISTENERS DO NOVO FORM DE VOUCHER ====

    console.log("[ManagerController] Inicializado.");
};