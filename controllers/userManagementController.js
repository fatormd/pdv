// --- CONTROLLERS/USERMANAGEMENTCONTROLLER.JS (with Debug Logs) ---
import { db } from '/services/firebaseService.js';
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
    if (!userListContainer) {
        console.error("[UserMgmt] userListContainer não encontrado para renderizar."); // DEBUG LOG
        return;
    }

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
        console.log("[UserMgmt] Usuários carregados:", currentUsers.length); // DEBUG LOG
        renderUserList();
    } catch (error) {
        console.error("Erro ao buscar usuários:", error);
        if(userListContainer) userListContainer.innerHTML = '<p class="text-red-400 font-bold">Erro ao carregar usuários.</p>';
    }
};

// Mostra o formulário (para adicionar ou editar)
const showUserForm = (userToEdit = null) => {
    if (!userForm || !userFormTitle || !userIdInput || !userNameInput || !userEmailInput || !userPasswordInput || !userRoleSelect || !userIsActiveCheckbox || !userFormError) {
        console.error("[UserMgmt] Elementos do formulário não encontrados em showUserForm."); // DEBUG LOG
        return;
    }

    userFormError.style.display = 'none'; // Esconde erros anteriores

    if (userToEdit) {
        console.log("[UserMgmt] Abrindo form em modo EDIÇÃO para:", userToEdit.email); // DEBUG LOG
        userFormTitle.textContent = "Editar Usuário";
        userIdInput.value = userToEdit.id;
        userNameInput.value = userToEdit.name;
        userEmailInput.value = userToEdit.email;
        userEmailInput.readOnly = true;
        userPasswordInput.value = '';
        userPasswordInput.placeholder = "Deixe em branco para não alterar";
        userPasswordInput.required = false;
        userRoleSelect.value = userToEdit.role;
        userIsActiveCheckbox.checked = userToEdit.isActive;
    } else {
        console.log("[UserMgmt] Abrindo form em modo ADIÇÃO."); // DEBUG LOG
        userFormTitle.textContent = "Adicionar Novo Usuário";
        userIdInput.value = '';
        userNameInput.value = '';
        userEmailInput.value = '';
        userEmailInput.readOnly = false;
        userPasswordInput.value = '';
        userPasswordInput.placeholder = "Senha";
        userPasswordInput.required = true;
        userRoleSelect.value = '';
        userIsActiveCheckbox.checked = true;
    }

    userForm.style.display = 'block';
    userNameInput.focus();
};

// Esconde o formulário
const hideUserForm = () => {
    if(userForm) {
        userForm.style.display = 'none';
        console.log("[UserMgmt] Formulário escondido."); // DEBUG LOG
    } else {
        console.warn("[UserMgmt] Tentativa de esconder formulário não mapeado."); // DEBUG LOG
    }
};

// Salva (cria ou atualiza) o usuário no Firestore
const handleSaveUser = async (event) => {
    event.preventDefault();
    if (!saveUserBtn || !userFormError) {
         console.error("[UserMgmt] Botão Salvar ou campo de erro não encontrado em handleSaveUser."); // DEBUG LOG
         return;
    }

    const originalEmail = userIdInput.value;
    const name = userNameInput.value.trim();
    const email = userEmailInput.value.trim().toLowerCase();
    const password = userPasswordInput.value;
    const role = userRoleSelect.value;
    const isActive = userIsActiveCheckbox.checked;

    console.log("[UserMgmt] Tentando salvar usuário:", { email, name, role, isActive, hasPassword: !!password, isEditing: !!originalEmail }); // DEBUG LOG

    if (!name || !email || !role || (!originalEmail && !password)) {
        userFormError.textContent = "Preencha todos os campos obrigatórios (*).";
        userFormError.style.display = 'block';
        console.warn("[UserMgmt] Validação falhou."); // DEBUG LOG
        return;
    }

    saveUserBtn.disabled = true;
    saveUserBtn.textContent = 'Salvando...';
    userFormError.style.display = 'none';

    try {
        const usersCollectionRef = collection(db, 'artifacts', db.app.options.appId, 'public', 'data', 'users');
        const userDocRef = doc(usersCollectionRef, email);

        if (!originalEmail) {
            const docSnap = await getDoc(userDocRef);
            if (docSnap.exists()) {
                throw new Error(`O e-mail ${email} já está cadastrado.`);
            }
        } else if (originalEmail !== email) {
             throw new Error("Não é permitido alterar o e-mail (login) do usuário.");
        }

        const userData = { name, email, role, isActive, updatedAt: serverTimestamp() };
        if (password) userData.password = password;

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
        console.log(`[UserMgmt] Usuário ${email} salvo com sucesso.`); // DEBUG LOG
        hideUserForm();
        await fetchUsers();

    } catch (error) {
        console.error("Erro ao salvar usuário:", error); // DEBUG LOG
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
    console.log(`[UserMgmt] Solicitando exclusão de: ${name} (${email})`); // DEBUG LOG

    if (!confirm(`Tem certeza que deseja EXCLUIR o usuário "${name}" (${email})? Esta ação não pode ser desfeita.`)) {
        console.log("[UserMgmt] Exclusão cancelada pelo usuário."); // DEBUG LOG
        return;
    }

    try {
        const usersCollectionRef = collection(db, 'artifacts', db.app.options.appId, 'public', 'data', 'users');
        const userDocRef = doc(usersCollectionRef, email);
        await deleteDoc(userDocRef);
        console.log(`[UserMgmt] Usuário ${email} excluído com sucesso.`); // DEBUG LOG
        await fetchUsers(); // Recarrega a lista
    } catch (error) {
        console.error("Erro ao excluir usuário:", error); // DEBUG LOG
        alert(`Falha ao excluir usuário: ${error.message}`);
    }
};

// --- FUNÇÕES DE INICIALIZAÇÃO E LISTENERS ---

// Anexa listeners aos botões de editar/excluir na lista
const attachUserListActionListeners = () => {
    document.querySelectorAll('.edit-user-btn').forEach(btn => {
        btn.replaceWith(btn.cloneNode(true)); // Remove listeners antigos clonando
    });
    document.querySelectorAll('.delete-user-btn').forEach(btn => {
        btn.replaceWith(btn.cloneNode(true));
    });

    // Adiciona novos listeners
    document.querySelectorAll('.edit-user-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const email = e.currentTarget.dataset.userEmail;
            console.log("[UserMgmt] Botão EDITAR clicado para:", email); // DEBUG LOG
            const user = currentUsers.find(u => u.email === email);
            if (user) {
                showUserForm(user);
            } else {
                console.error("Usuário não encontrado no cache local para edição:", email); // DEBUG LOG
            }
        });
    });

    document.querySelectorAll('.delete-user-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const email = e.currentTarget.dataset.userEmail;
            const name = e.currentTarget.dataset.userName;
            console.log("[UserMgmt] Botão DELETAR clicado para:", name, email); // DEBUG LOG
            handleDeleteUser(email, name);
        });
    });
    console.log("[UserMgmt] Listeners da lista de usuários anexados."); // DEBUG LOG
};

// Função de inicialização do Controller
export const initUserManagementController = () => {
    if (isUserManagementInitialized) {
        console.log("[UserMgmtController] Já inicializado."); // DEBUG LOG
        return;
    }
    console.log("[UserMgmtController] Iniciando..."); // DEBUG LOG

    // Mapeia elementos do modal e formulário
    userManagementModal = document.getElementById('userManagementModal');
    // --- DEBUG LOG ---
    console.log("[UserMgmtController] Tentando mapear userManagementModal:", userManagementModal ? 'Encontrado' : 'NÃO ENCONTRADO');
    // --- FIM DEBUG LOG ---

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
        console.error("[UserMgmtController] Erro Fatal: Elementos essenciais do modal não encontrados. Abortando inicialização."); // DEBUG LOG
        // NÃO define isUserManagementInitialized como true se falhar
        return; // Retorna aqui, impedindo a inicialização
    }

    // Adiciona Listeners (Só adiciona se os elementos foram encontrados)
    console.log("[UserMgmtController] Adicionando listeners..."); // DEBUG LOG
    showUserFormBtn.addEventListener('click', () => showUserForm(null));
    cancelUserFormBtn.addEventListener('click', hideUserForm);
    userForm.addEventListener('submit', handleSaveUser);

    isUserManagementInitialized = true; // Define como inicializado APENAS SE TUDO DEU CERTO
    console.log("[UserMgmtController] Inicializado com sucesso."); // DEBUG LOG
};

// Função para ser chamada quando o modal é aberto
export const openUserManagementModal = () => {
    console.log("[UserMgmtController] openUserManagementModal chamada."); // DEBUG LOG

    // Garante que o controller esteja inicializado
    // O Lazy loading no app.js já deve ter chamado initUserManagementController
    if (!isUserManagementInitialized) {
        console.warn("[UserMgmtController] Tentando abrir modal, mas controller não está inicializado. Chamando init..."); // DEBUG LOG
        initUserManagementController();
        // Verifica novamente se a inicialização falhou
        if (!isUserManagementInitialized) {
             console.error("[UserMgmtController] Inicialização falhou dentro de openUserManagementModal. Abortando abertura."); // DEBUG LOG
             alert("Erro ao inicializar o módulo de gestão de usuários.");
             return; // Sai se init falhou
        }
    }

    // Verifica se a variável userManagementModal (o elemento DOM) foi definida após a inicialização
    // Isso é crucial. Se init falhou em encontrar o elemento, esta variável será null/undefined.
    if (!userManagementModal) {
        console.error("[UserMgmtController] Variável/Elemento userManagementModal não está definida após init. Não é possível abrir."); // DEBUG LOG
        alert("Erro crítico: O elemento do modal de usuários não foi encontrado na página."); // Mostra erro ao usuário
        return;
    }

    console.log("[UserMgmtController] Carregando usuários e mostrando modal..."); // DEBUG LOG
    fetchUsers(); // Carrega/recarrega a lista do Firebase
    hideUserForm(); // Garante que o formulário comece escondido
    userManagementModal.style.display = 'flex'; // **A LINHA QUE MOSTRA O MODAL**
    console.log("[UserMgmtController] Modal DEVE estar visível agora (display='flex')."); // DEBUG LOG
};
