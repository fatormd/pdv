// --- CONTROLLERS/USERMANAGEMENTCONTROLLER.JS (ATUALIZADO SEM SENHA) ---
import { db, appId } from '/services/firebaseService.js';
import { collection, getDocs, doc, setDoc, getDoc, deleteDoc, serverTimestamp, query, orderBy } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// --- VARIÁVEIS DE ELEMENTOS ---
let userManagementModal, userListContainer, showUserFormBtn;
let userForm, userFormTitle, userIdInput, userNameInput, userEmailInput, userRoleSelect, userIsActiveCheckbox;
// REMOVIDO: userPasswordInput
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
     // ATUALIZADO: Remove userPasswordInput da verificação
     if (!userForm || !userFormTitle || !userIdInput || !userNameInput || !userEmailInput || !userRoleSelect || !userIsActiveCheckbox || !userFormError) { return; }
     userFormError.style.display = 'none';

     if (userToEdit) {
         userFormTitle.textContent = "Editar Usuário";
         userIdInput.value = userToEdit.id;
         userNameInput.value = userToEdit.name;
         userEmailInput.value = userToEdit.email;
         userEmailInput.readOnly = true;
         // REMOVIDO: Lógica do password
         userRoleSelect.value = userToEdit.role;
         userIsActiveCheckbox.checked = userToEdit.isActive;
     } else {
         userFormTitle.textContent = "Adicionar Novo Usuário";
         userIdInput.value = '';
         userNameInput.value = '';
         userEmailInput.value = '';
         userEmailInput.readOnly = false;
         // REMOVIDO: Lógica do password
         userRoleSelect.value = '';
         userIsActiveCheckbox.checked = true;
     }
     userForm.style.display = 'block';
     userNameInput.focus();
};
const hideUserForm = () => { if(userForm) userForm.style.display = 'none'; };

const handleSaveUser = async (event) => {
    event.preventDefault();
    if (!saveUserBtn || !userFormError) { return; }

    const originalEmail = userIdInput.value;
    const name = userNameInput.value.trim();
    const email = userEmailInput.value.trim().toLowerCase();
    // REMOVIDO: const password = userPasswordInput.value;
    const role = userRoleSelect.value;
    const isActive = userIsActiveCheckbox.checked;

    // ATUALIZADO: Remove password da verificação
    if (!name || !email || !role) {
        userFormError.textContent = "Preencha todos os campos obrigatórios (*).";
        userFormError.style.display = 'block';
        return;
    }

    saveUserBtn.disabled = true; saveUserBtn.textContent = 'Salvando...'; userFormError.style.display = 'none';

    try {
        const usersCollectionRef = getUsersCollectionRef();
        const userDocRef = doc(usersCollectionRef, email);

        if (!originalEmail) { // Novo usuário
            const docSnap = await getDoc(userDocRef);
            if (docSnap.exists()) throw new Error(`O e-mail ${email} já está cadastrado.`);
        } else if (originalEmail !== email) { // Tentativa de mudar email
             throw new Error("Não é permitido alterar o e-mail (login) do usuário.");
        }

        const userData = { name, email, role, isActive, updatedAt: serverTimestamp() };
        // REMOVIDO: if (password) userData.password = password; 
        
        let finalData;
        if (!originalEmail) {
            finalData = { ...userData, createdAt: serverTimestamp() };
        } else {
             const existingDoc = await getDoc(userDocRef);
             const existingData = existingDoc.data() || {};
             finalData = { ...existingData, ...userData };
             if (!existingData.createdAt) finalData.createdAt = serverTimestamp();
        }

        await setDoc(userDocRef, finalData);
        hideUserForm();
        await fetchUsers(); // Recarrega lista

    } catch (error) {
        console.error("Erro ao salvar usuário:", error);
        userFormError.textContent = `Erro: ${error.message}`;
        userFormError.style.display = 'block';
    } finally {
        if(saveUserBtn){ saveUserBtn.disabled = false; saveUserBtn.textContent = 'Salvar Usuário'; }
    }
};

const handleDeleteUser = async (email, name) => {
    if (!email || !name) return;
    if (!confirm(`Tem certeza que deseja EXCLUIR o usuário "${name}" (${email})? Esta ação não pode ser desfeita.`)) { return; }

    try {
        const usersCollectionRef = getUsersCollectionRef();
        const userDocRef = doc(usersCollectionRef, email);
        await deleteDoc(userDocRef);
        await fetchUsers();
    } catch (error) {
        console.error("Erro ao excluir usuário:", error);
        alert(`Falha ao excluir usuário: ${error.message}`);
    }
};

// --- FUNÇÕES DE INICIALIZAÇÃO E LISTENERS ---
const attachUserListActionListeners = () => {
    document.querySelectorAll('.edit-user-btn').forEach(btn => { btn.replaceWith(btn.cloneNode(true)); });
    document.querySelectorAll('.delete-user-btn').forEach(btn => { btn.replaceWith(btn.cloneNode(true)); });

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
    // REMOVIDO: userPasswordInput = document.getElementById('userPasswordInput');
    userRoleSelect = document.getElementById('userRoleSelect');
    userIsActiveCheckbox = document.getElementById('userIsActiveCheckbox');
    cancelUserFormBtn = document.getElementById('cancelUserFormBtn');
    saveUserBtn = document.getElementById('saveUserBtn');
    userFormError = document.getElementById('userFormError');

    // Validação CRÍTICA
    if (!userManagementModal || !userListContainer || !showUserFormBtn || !userForm || !saveUserBtn || !cancelUserFormBtn) {
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
