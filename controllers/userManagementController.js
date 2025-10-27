// --- CONTROLLERS/USERMANAGEMENTCONTROLLER.JS ---
import { db } from '/services/firebaseService.js'; // Importa a instância do DB
import { collection, getDocs, doc, setDoc, getDoc, deleteDoc, serverTimestamp, query, orderBy } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// --- VARIÁVEIS DE ELEMENTOS ---
let userManagementModal, userListContainer, showUserFormBtn;
let userForm, userFormTitle, userIdInput, userNameInput, userEmailInput, userPasswordInput, userRoleSelect, userIsActiveCheckbox;
let cancelUserFormBtn, saveUserBtn, userFormError;

let isUserManagementInitialized = false;
let currentUsers = []; // Cache local dos usuários

// --- FUNÇÕES DE RENDERIZAÇÃO ---

// Renderiza a lista de usuários no modal
const renderUserList = () => {
    if (!userListContainer) return;

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

    // Reanexa listeners para os botões de editar/excluir
    attachUserListActionListeners();
};

// --- FUNÇÕES DE LÓGICA (CRUD) ---

// Busca usuários do Firestore
const fetchUsers = async () => {
    try {
        const usersCollectionRef = collection(db, 'artifacts', db.app.options.appId, 'public', 'data', 'users');
        const q = query(usersCollectionRef, orderBy('name', 'asc')); // Ordena por nome
        const querySnapshot = await getDocs(q);
        currentUsers = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        console.log("[UserMgmt] Usuários carregados:", currentUsers);
        renderUserList();
    } catch (error) {
        console.error("Erro ao buscar usuários:", error);
        if(userListContainer) userListContainer.innerHTML = '<p class="text-red-400 font-bold">Erro ao carregar usuários.</p>';
    }
};

// Mostra o formulário (para adicionar ou editar)
const showUserForm = (userToEdit = null) => {
    if (!userForm || !userFormTitle || !userIdInput || !userNameInput || !userEmailInput || !userPasswordInput || !userRoleSelect || !userIsActiveCheckbox || !userFormError) return;

    userFormError.style.display = 'none'; // Esconde erros anteriores

    if (userToEdit) {
        // Modo Edição
        userFormTitle.textContent = "Editar Usuário";
        userIdInput.value = userToEdit.id; // Guarda o ID (email original)
        userNameInput.value = userToEdit.name;
        userEmailInput.value = userToEdit.email;
        userEmailInput.readOnly = true; // Não permite editar email (que é o ID)
        userPasswordInput.value = ''; // Limpa senha por segurança
        userPasswordInput.placeholder = "Deixe em branco para não alterar";
        userPasswordInput.required = false; // Senha não obrigatória na edição
        userRoleSelect.value = userToEdit.role;
        userIsActiveCheckbox.checked = userToEdit.isActive;
    } else {
        // Modo Adição
        userFormTitle.textContent = "Adicionar Novo Usuário";
        userIdInput.value = ''; // Limpa ID
        userNameInput.value = '';
        userEmailInput.value = '';
        userEmailInput.readOnly = false; // Permite digitar email
        userPasswordInput.value = '';
        userPasswordInput.placeholder = "Senha";
        userPasswordInput.required = true; // Senha obrigatória ao adicionar
        userRoleSelect.value = '';
        userIsActiveCheckbox.checked = true; // Novo usuário começa ativo
    }

    userForm.style.display = 'block';
    userNameInput.focus();
};

// Esconde o formulário
const hideUserForm = () => {
    if(userForm) userForm.style.display = 'none';
};

// Salva (cria ou atualiza) o usuário no Firestore
const handleSaveUser = async (event) => {
    event.preventDefault(); // Impede recarregamento da página pelo form
    if (!saveUserBtn || !userFormError) return;

    const originalEmail = userIdInput.value; // ID para edição (email original)
    const name = userNameInput.value.trim();
    const email = userEmailInput.value.trim().toLowerCase();
    const password = userPasswordInput.value; // Pega mesmo se estiver vazio na edição
    const role = userRoleSelect.value;
    const isActive = userIsActiveCheckbox.checked;

    // Validações básicas
    if (!name || !email || !role || (!originalEmail && !password)) { // Senha obrigatória só se for novo (sem originalEmail)
        userFormError.textContent = "Preencha todos os campos obrigatórios (*).";
        userFormError.style.display = 'block';
        return;
    }
    // TODO: Adicionar validação de formato de e-mail

    saveUserBtn.disabled = true;
    saveUserBtn.textContent = 'Salvando...';
    userFormError.style.display = 'none';

    try {
        const usersCollectionRef = collection(db, 'artifacts', db.app.options.appId, 'public', 'data', 'users');
        const userDocRef = doc(usersCollectionRef, email); // Usa o NOVO email como ID

        // Verifica se o email já existe (se for um NOVO usuário)
        if (!originalEmail) {
            const docSnap = await getDoc(userDocRef);
            if (docSnap.exists()) {
                throw new Error(`O e-mail ${email} já está cadastrado.`);
            }
        } else if (originalEmail !== email) {
            // Se está editando e MUDOU o email (não permitido por enquanto)
             throw new Error("Não é permitido alterar o e-mail (login) do usuário.");
             // TODO: Se quiser permitir, precisaria deletar o doc antigo e criar um novo.
        }

        const userData = {
            name,
            email,
            role,
            isActive,
            //createdAt: originalEmail ? undefined : serverTimestamp(), // Só adiciona na criação (precisa ler antes)
            updatedAt: serverTimestamp()
        };
        // Só adiciona/atualiza a senha se algo foi digitado
        if (password) {
             userData.password = password; // ATENÇÃO: SENHA EM TEXTO PLANO!
        }

        // Adiciona createdAt se for novo, busca dados antigos se for edição
        let finalData;
        if (!originalEmail) {
            finalData = { ...userData, createdAt: serverTimestamp() };
        } else {
             const existingDoc = await getDoc(userDocRef);
             const existingData = existingDoc.data() || {};
             finalData = { ...existingData, ...userData }; // Mescla, garantindo createdAt
             if (!existingData.createdAt) { // Adiciona createdAt se não existir por algum motivo
                 finalData.createdAt = serverTimestamp();
             }
        }


        // Usa setDoc com merge: false para criar ou sobrescrever completamente
        await setDoc(userDocRef, finalData);

        console.log(`[UserMgmt] Usuário ${email} salvo com sucesso.`);
        hideUserForm();
        await fetchUsers(); // Recarrega a lista

    } catch (error) {
        console.error("Erro ao salvar usuário:", error);
        userFormError.textContent = `Erro: ${error.message}`;
        userFormError.style.display = 'block';
    } finally {
        if(saveUserBtn){
            saveUserBtn.disabled = false;
            saveUserBtn.textContent = 'Salvar Usuário';
        }
    }
};

// Deleta o usuário do Firestore
const handleDeleteUser = async (email, name) => {
    if (!email || !name) return;

    if (!confirm(`Tem certeza que deseja EXCLUIR o usuário "${name}" (${email})? Esta ação não pode ser desfeita.`)) {
        return;
    }

    try {
        const usersCollectionRef = collection(db, 'artifacts', db.app.options.appId, 'public', 'data', 'users');
        const userDocRef = doc(usersCollectionRef, email);
        await deleteDoc(userDocRef);
        console.log(`[UserMgmt] Usuário ${email} excluído com sucesso.`);
        await fetchUsers(); // Recarrega a lista
    } catch (error) {
        console.error("Erro ao excluir usuário:", error);
        alert(`Falha ao excluir usuário: ${error.message}`);
    }
};

// --- FUNÇÕES DE INICIALIZAÇÃO E LISTENERS ---

// Anexa listeners aos botões de editar/excluir na lista
const attachUserListActionListeners = () => {
    document.querySelectorAll('.edit-user-btn').forEach(btn => {
        // Remove listener antigo para evitar duplicidade
        btn.replaceWith(btn.cloneNode(true));
    });
    document.querySelectorAll('.delete-user-btn').forEach(btn => {
        btn.replaceWith(btn.cloneNode(true));
    });

    // Adiciona novos listeners
    document.querySelectorAll('.edit-user-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const email = e.currentTarget.dataset.userEmail;
            const user = currentUsers.find(u => u.email === email);
            if (user) {
                showUserForm(user);
            } else {
                console.error("Usuário não encontrado para edição:", email);
            }
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

// Função de inicialização do Controller (será chamada pelo app.js ou managerController.js)
export const initUserManagementController = () => {
    if (isUserManagementInitialized) return;
    console.log("[UserMgmtController] Inicializando...");

    // Mapeia elementos do modal e formulário
    userManagementModal = document.getElementById('userManagementModal');
    userListContainer = document.getElementById('userListContainer');
    showUserFormBtn = document.getElementById('showUserFormBtn');
    userForm = document.getElementById('userForm');
    userFormTitle = document.getElementById('userFormTitle');
    userIdInput = document.getElementById('userIdInput');
    userNameInput = document.getElementById('userNameInput');
    userEmailInput = document.getElementById('userEmailInput');
    userPasswordInput = document.getElementById('userPasswordInput');
    userRoleSelect = document.getElementById('userRoleSelect');
    userIsActiveCheckbox = document.getElementById('userIsActiveCheckbox');
    cancelUserFormBtn = document.getElementById('cancelUserFormBtn');
    saveUserBtn = document.getElementById('saveUserBtn');
    userFormError = document.getElementById('userFormError');

    // Verifica se todos os elementos essenciais foram encontrados
    if (!userManagementModal || !userListContainer || !showUserFormBtn || !userForm || !saveUserBtn || !cancelUserFormBtn) {
        console.error("[UserMgmtController] Erro Fatal: Elementos essenciais do modal não encontrados. Abortando inicialização.");
        return;
    }

    // Listener para mostrar o formulário de adição
    showUserFormBtn.addEventListener('click', () => showUserForm(null));

    // Listener para cancelar/esconder o formulário
    cancelUserFormBtn.addEventListener('click', hideUserForm);

    // Listener para salvar (submit do formulário)
    userForm.addEventListener('submit', handleSaveUser);

    // Carrega a lista inicial de usuários quando o controller é inicializado
    // fetchUsers(); // Vamos carregar quando o modal for aberto

    isUserManagementInitialized = true;
    console.log("[UserMgmtController] Inicializado.");
};

// Função para ser chamada quando o modal é aberto (pelo managerController)
export const openUserManagementModal = () => {
    if (!userManagementModal) {
        console.error("Tentativa de abrir modal de usuários não encontrado.");
        return;
    }
    // Garante que o controller esteja inicializado
    if (!isUserManagementInitialized) {
        initUserManagementController();
        // Verifica se a inicialização falhou (elementos não encontrados)
        if (!isUserManagementInitialized) return;
    }

    // Carrega/Recarrega a lista de usuários sempre que o modal abrir
    fetchUsers();
    hideUserForm(); // Garante que o formulário comece escondido
    userManagementModal.style.display = 'flex';
};
