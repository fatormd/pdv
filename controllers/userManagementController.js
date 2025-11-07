// --- CONTROLLERS/USERMANAGEMENTCONTROLLER.JS (ATUALIZADO COM CLOUD FUNCTIONS) ---

// ===== INÍCIO DA ATUALIZAÇÃO =====
import { db, appId, functions } from '/services/firebaseService.js';
// Importa a função httpsCallable
import { httpsCallable } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-functions.js";
// ===== FIM DA ATUALIZAÇÃO =====

import { collection, getDocs, doc, setDoc, getDoc, deleteDoc, serverTimestamp, query, orderBy } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// --- VARIÁVEIS DE ELEMENTOS ---
let userManagementModal, userListContainer, showUserFormBtn;
let userForm, userFormTitle, userIdInput, userNameInput, userEmailInput, userRoleSelect, userIsActiveCheckbox;
// ===== ATUALIZAÇÃO: Mapeia o campo de senha =====
let userPasswordInput, passwordHint, userPasswordContainer;
let cancelUserFormBtn, saveUserBtn, userFormError;

let isUserManagementInitialized = false;
let currentUsers = [];

// --- FUNÇÃO AUXILIAR PARA OBTER REFERÊNCIA DA COLEÇÃO ---
const getUsersCollectionRef = () => {
    if (!appId) {
        console.error("[UserMgmt] Erro crítico: appId não definido no firebaseService.");
        throw new Error("appId não está definido. Verifique a inicialização do Firebase.");
    }
    return collection(db, 'artifacts', appId, 'public', 'data', 'users');
};

// --- FUNÇÕES DE RENDERIZAÇÃO ---
const renderUserList = () => {
    if (!userListContainer) { return; }

    if (currentUsers.length === 0) {
        userListContainer.innerHTML = '<p class="text-dark-placeholder italic">Nenhum usuário cadastrado.</p>';
        return;
    }

    userListContainer.innerHTML = currentUsers.map(user => `
        <div class="flex justify-between items-center py-2 border-b border-gray-600 last:border-b-0">
            <div class="flex flex-col">
                <span class="font-semibold text-dark-text">${user.name} (${user.role})</span>
                <span class="text-xs ${user.isActive ? 'text-green-400' : 'text-red-400'}">${user.email} - ${user.isActive ? 'Ativo' : 'Inativo'}</span>
            </div>
            <div class="space-x-2 print-hide">
                <button class="edit-user-btn p-2 text-indigo-400 hover:text-indigo-300 transition" data-user-email="${user.email}" title="Editar Usuário">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="delete-user-btn p-2 text-red-500 hover:text-red-400 transition" data-user-email="${user.email}" data-user-name="${user.name}" title="Excluir Usuário">
                    <i class="fas fa-trash-alt"></i>
                </button>
            </div>
        </div>
    `).join('');

    attachUserListActionListeners();
};


// --- FUNÇÕES DE LÓGICA (CRUD) ---
const fetchUsers = async () => {
    try {
        const usersCollectionRef = getUsersCollectionRef();
        const q = query(usersCollectionRef, orderBy('name', 'asc'));
        const querySnapshot = await getDocs(q);
        currentUsers = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderUserList();
    } catch (error) {
        console.error("Erro ao buscar usuários:", error);
        if(userListContainer) userListContainer.innerHTML = '<p class="text-red-400 font-bold">Erro ao carregar usuários.</p>';
    }
};

const showUserForm = (userToEdit = null) => {
     // ===== ATUALIZAÇÃO: Adiciona campos de senha à verificação =====
     if (!userForm || !userFormTitle || !userIdInput || !userNameInput || !userEmailInput || !userRoleSelect || !userIsActiveCheckbox || !userFormError || !userPasswordInput || !passwordHint || !userPasswordContainer) { return; }
     userFormError.style.display = 'none';

     if (userToEdit) {
         // --- MODO EDIÇÃO ---
         userFormTitle.textContent = "Editar Usuário";
         userIdInput.value = userToEdit.id;
         userNameInput.value = userToEdit.name;
         userEmailInput.value = userToEdit.email;
         userEmailInput.readOnly = true; // Não permite alterar e-mail (que é o ID)
         
         // Lógica do campo de senha
         userPasswordContainer.style.display = 'none'; // Esconde senha por padrão na edição
         userPasswordInput.value = '';
         userPasswordInput.required = false;
         // passwordHint.style.display = 'block'; // Mostra a dica
         
         userRoleSelect.value = userToEdit.role;
         userIsActiveCheckbox.checked = userToEdit.isActive;
     } else {
         // --- MODO CRIAÇÃO ---
         userFormTitle.textContent = "Adicionar Novo Usuário";
         userIdInput.value = ''; // ID está vazio (indica novo usuário)
         userNameInput.value = '';
         userEmailInput.value = '';
         userEmailInput.readOnly = false;
         
         // Lógica do campo de senha
         userPasswordContainer.style.display = 'block'; // Mostra campo de senha
         userPasswordInput.value = '';
         userPasswordInput.required = true; // Senha é obrigatória ao criar
         passwordHint.style.display = 'none'; // Esconde a dica
         
         userRoleSelect.value = '';
         userIsActiveCheckbox.checked = true;
     }
     userForm.style.display = 'block';
     userNameInput.focus();
};
const hideUserForm = () => { if(userForm) userForm.style.display = 'none'; };

// ===== FUNÇÃO handleSaveUser TOTALMENTE REESCRITA =====
const handleSaveUser = async (event) => {
    event.preventDefault();
    if (!saveUserBtn || !userFormError) { return; }

    const originalEmail = userIdInput.value; // Vazio se for novo, preenchido se for edição
    const name = userNameInput.value.trim();
    const email = userEmailInput.value.trim().toLowerCase();
    const password = userPasswordInput.value;
    const role = userRoleSelect.value;
    const isActive = userIsActiveCheckbox.checked;

    const isNewUser = !originalEmail;

    // Validação
    if (!name || !email || !role) {
        userFormError.textContent = "Nome, E-mail e Função são obrigatórios.";
        userFormError.style.display = 'block';
        return;
    }
    if (isNewUser && (!password || password.length < 6)) {
        userFormError.textContent = "Senha é obrigatória (mínimo 6 caracteres) para novos usuários.";
        userFormError.style.display = 'block';
        return;
    }

    saveUserBtn.disabled = true; 
    saveUserBtn.textContent = 'Salvando...'; 
    userFormError.style.display = 'none';

    try {
        if (isNewUser) {
            // --- FLUXO DE CRIAÇÃO (Chama Cloud Function) ---
            const createNewUser = httpsCallable(functions, 'createNewUser');
            const result = await createNewUser({
                email: email,
                password: password,
                name: name,
                role: role,
                isActive: isActive
            });
            alert(result.data.message); // Exibe sucesso

        } else {
            // --- FLUXO DE EDIÇÃO (Chama Cloud Function) ---
            // (Nota: Esta função 'updateUser' não altera senha, apenas dados do perfil)
            const updateUser = httpsCallable(functions, 'updateUser');
            const result = await updateUser({
                originalEmail: originalEmail, // Usa o e-mail original como ID
                name: name,
                role: role,
                isActive: isActive
            });
            alert(result.data.message); // Exibe sucesso
        }

        hideUserForm();
        await fetchUsers(); // Recarrega lista

    } catch (error) {
        console.error("Erro ao salvar usuário via Cloud Function:", error);
        // Exibe a mensagem de erro vinda da Cloud Function
        userFormError.textContent = `Erro: ${error.message}`; 
        userFormError.style.display = 'block';
    } finally {
        if(saveUserBtn){ saveUserBtn.disabled = false; saveUserBtn.textContent = 'Salvar Usuário'; }
    }
};

// ===== FUNÇÃO handleDeleteUser TOTALMENTE REESCRITA =====
const handleDeleteUser = async (email, name) => {
    if (!email || !name) return;
    if (!confirm(`Tem certeza que deseja EXCLUIR o usuário "${name}" (${email})? Esta ação excluirá o login (Auth) e o perfil (Firestore) e não pode ser desfeita.`)) { 
        return; 
    }

    try {
        const deleteUser = httpsCallable(functions, 'deleteUser');
        const result = await deleteUser({ email: email });
        
        alert(result.data.message);
        await fetchUsers(); // Recarrega a lista
        
    } catch (error) {
        console.error("Erro ao excluir usuário via Cloud Function:", error);
        alert(`Falha ao excluir usuário: ${error.message}`);
    }
};

// --- FUNÇÕES DE INICIALIZAÇÃO E LISTENERS ---
const attachUserListActionListeners = () => {
    // Limpa listeners antigos para evitar duplicação
    document.querySelectorAll('.edit-user-btn').forEach(btn => { btn.replaceWith(btn.cloneNode(true)); });
    document.querySelectorAll('.delete-user-btn').forEach(btn => { btn.replaceWith(btn.cloneNode(true)); });

    // Reanexa listeners
    document.querySelectorAll('.edit-user-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const email = e.currentTarget.dataset.userEmail;
            const user = currentUsers.find(u => u.email === email);
            if (user) { showUserForm(user); }
        });
    });

    document.querySelectorAll('.delete-user-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const email = e.currentTarget.dataset.userEmail;
            const name = e.currentTarget.dataset.userName;
            handleDeleteUser(email, name);
        });
    });
};

export const initUserManagementController = () => {
    if (isUserManagementInitialized) { return; }

    // Mapeamento
    userManagementModal = document.getElementById('userManagementModal');
    userListContainer = document.getElementById('userListContainer');
    showUserFormBtn = document.getElementById('showUserFormBtn');
    userForm = document.getElementById('userForm');
    userFormTitle = document.getElementById('userFormTitle');
    userIdInput = document.getElementById('userIdInput');
    userNameInput = document.getElementById('userNameInput');
    userEmailInput = document.getElementById('userEmailInput');
    
    // ===== ATUALIZAÇÃO: Mapeia campos de senha =====
    userPasswordInput = document.getElementById('userPasswordInput');
    userPasswordContainer = document.getElementById('userPasswordContainer');
    passwordHint = document.getElementById('passwordHint');
    
    userRoleSelect = document.getElementById('userRoleSelect');
    userIsActiveCheckbox = document.getElementById('userIsActiveCheckbox');
    cancelUserFormBtn = document.getElementById('cancelUserFormBtn');
    saveUserBtn = document.getElementById('saveUserBtn');
    userFormError = document.getElementById('userFormError');

    // Validação CRÍTICA
    // ===== ATUALIZAÇÃO: Adiciona campos de senha à validação =====
    if (!userManagementModal || !userListContainer || !showUserFormBtn || !userForm || !saveUserBtn || !cancelUserFormBtn || !userPasswordInput) {
        console.error("[UserMgmtController] Erro Fatal: Elementos essenciais do modal não encontrados. Abortando inicialização.");
        return;
    }

    // Adiciona Listeners
    showUserFormBtn.addEventListener('click', () => showUserForm(null));
    cancelUserFormBtn.addEventListener('click', hideUserForm);
    userForm.addEventListener('submit', handleSaveUser);

    isUserManagementInitialized = true;
};

export const openUserManagementModal = () => {
    if (!isUserManagementInitialized) {
        initUserManagementController();
        if (!isUserManagementInitialized) {
             alert("Erro ao inicializar o módulo de gestão de usuários.");
             return;
        }
    }
    if (!userManagementModal) {
        alert("Erro crítico: O elemento do modal de usuários não foi encontrado.");
        return;
    }

    fetchUsers(); 
    hideUserForm();
    userManagementModal.style.display = 'flex';
};
