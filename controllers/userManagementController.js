// --- CONTROLLERS/USERMANAGEMENTCONTROLLER.JS (Corrigido para usar appId) ---
// --- CORREÇÃO: Importa 'appId' além de 'db' ---
import { db, appId } from '/services/firebaseService.js';
import { collection, getDocs, doc, setDoc, getDoc, deleteDoc, serverTimestamp, query, orderBy } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// --- VARIÁVEIS DE ELEMENTOS ---
let userManagementModal, userListContainer, showUserFormBtn;
let userForm, userFormTitle, userIdInput, userNameInput, userEmailInput, userPasswordInput, userRoleSelect, userIsActiveCheckbox;
let cancelUserFormBtn, saveUserBtn, userFormError;

let isUserManagementInitialized = false;
let currentUsers = [];

// --- FUNÇÃO AUXILIAR PARA OBTER REFERÊNCIA DA COLEÇÃO ---
// --- CORREÇÃO: Usa 'appId' importado ---
const getUsersCollectionRef = () => {
    if (!appId) {
        console.error("[UserMgmt] Erro crítico: appId não definido no firebaseService.");
        // Você pode querer lançar um erro ou retornar null aqui
        // Lançar um erro pode ser mais seguro para evitar operações no lugar errado.
        throw new Error("appId não está definido. Verifique a inicialização do Firebase.");
    }
    return collection(db, 'artifacts', appId, 'public', 'data', 'users');
};

// --- FUNÇÕES DE RENDERIZAÇÃO ---
const renderUserList = () => { /* ... (código mantido igual) ... */
    if (!userListContainer) { /*...*/ return; }
    if (currentUsers.length === 0) { /*...*/ return; }
    userListContainer.innerHTML = currentUsers.map(user => `... (HTML do item da lista) ...`).join('');
    attachUserListActionListeners();
};


// --- FUNÇÕES DE LÓGICA (CRUD) ---
const fetchUsers = async () => {
    try {
        const usersCollectionRef = getUsersCollectionRef(); // --- CORREÇÃO: Usa a função auxiliar ---
        const q = query(usersCollectionRef, orderBy('name', 'asc'));
        const querySnapshot = await getDocs(q);
        currentUsers = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        console.log("[UserMgmt] Usuários carregados:", currentUsers.length);
        renderUserList();
    } catch (error) { /* ... (erro) ... */ }
};

const showUserForm = (userToEdit = null) => { /* ... (código mantido igual) ... */
     if (!userForm || !userFormTitle /*... etc ...*/) { return; }
     userFormError.style.display = 'none';
     if (userToEdit) {
         console.log("[UserMgmt] Abrindo form em modo EDIÇÃO para:", userToEdit.email);
         userFormTitle.textContent = "Editar Usuário";
         userIdInput.value = userToEdit.id; // email original
         userNameInput.value = userToEdit.name;
         userEmailInput.value = userToEdit.email;
         userEmailInput.readOnly = true; // Não permite editar email (ID)
         userPasswordInput.value = '';
         userPasswordInput.placeholder = "Deixe em branco para não alterar";
         userPasswordInput.required = false;
         userRoleSelect.value = userToEdit.role;
         userIsActiveCheckbox.checked = userToEdit.isActive;
     } else {
         console.log("[UserMgmt] Abrindo form em modo ADIÇÃO.");
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
const hideUserForm = () => { /* ... (código mantido igual) ... */ };

const handleSaveUser = async (event) => {
    event.preventDefault();
    if (!saveUserBtn || !userFormError) { return; }

    const originalEmail = userIdInput.value;
    const name = userNameInput.value.trim();
    const email = userEmailInput.value.trim().toLowerCase();
    const password = userPasswordInput.value;
    const role = userRoleSelect.value;
    const isActive = userIsActiveCheckbox.checked;

    console.log("[UserMgmt] Tentando salvar usuário:", { email, name, role, isActive, isEditing: !!originalEmail });

    if (!name || !email || !role || (!originalEmail && !password)) { /* ... (validação) ... */ return; }

    saveUserBtn.disabled = true; saveUserBtn.textContent = 'Salvando...'; userFormError.style.display = 'none';

    try {
        const usersCollectionRef = getUsersCollectionRef(); // --- CORREÇÃO: Usa a função auxiliar ---
        const userDocRef = doc(usersCollectionRef, email); // Usa email como ID

        if (!originalEmail) { // Se for novo usuário
            const docSnap = await getDoc(userDocRef);
            if (docSnap.exists()) throw new Error(`O e-mail ${email} já está cadastrado.`);
        } else if (originalEmail !== email) { // Se editou e mudou email (não permitido)
             throw new Error("Não é permitido alterar o e-mail (login) do usuário.");
        }

        const userData = { name, email, role, isActive, updatedAt: serverTimestamp() };
        if (password) userData.password = password; // ATENÇÃO: SENHA EM TEXTO PLANO!

        let finalData;
        if (!originalEmail) { // Criação
            finalData = { ...userData, createdAt: serverTimestamp() };
        } else { // Edição
             const existingDoc = await getDoc(userDocRef);
             const existingData = existingDoc.data() || {};
             finalData = { ...existingData, ...userData }; // Mescla para preservar createdAt
             if (!existingData.createdAt) finalData.createdAt = serverTimestamp(); // Garante createdAt
        }

        await setDoc(userDocRef, finalData); // Cria ou sobrescreve
        console.log(`[UserMgmt] Usuário ${email} salvo com sucesso.`);
        hideUserForm();
        await fetchUsers(); // Recarrega lista

    } catch (error) { /* ... (erro) ... */ }
    finally { /* ... (reseta botão) ... */ }
};

const handleDeleteUser = async (email, name) => {
    if (!email || !name) return;
    console.log(`[UserMgmt] Solicitando exclusão de: ${name} (${email})`);
    if (!confirm(`...`)) { return; }

    try {
        const usersCollectionRef = getUsersCollectionRef(); // --- CORREÇÃO: Usa a função auxiliar ---
        const userDocRef = doc(usersCollectionRef, email);
        await deleteDoc(userDocRef);
        console.log(`[UserMgmt] Usuário ${email} excluído com sucesso.`);
        await fetchUsers();
    } catch (error) { /* ... (erro) ... */ }
};

// --- FUNÇÕES DE INICIALIZAÇÃO E LISTENERS ---
const attachUserListActionListeners = () => { /* ... (código mantido igual) ... */ };

export const initUserManagementController = () => { /* ... (código mantido igual, mapeia elementos) ... */
    if (isUserManagementInitialized) { console.log("[UserMgmtController] Já inicializado."); return; }
    console.log("[UserMgmtController] Iniciando...");
    userManagementModal = document.getElementById('userManagementModal');
    console.log("[UserMgmtController] Tentando mapear userManagementModal:", userManagementModal ? 'Encontrado' : 'NÃO ENCONTRADO');
    // ... (mapeia OUTROS elementos) ...
    userListContainer = document.getElementById('userListContainer');
    showUserFormBtn = document.getElementById('showUserFormBtn');
    userForm = document.getElementById('userForm');
    // ... (resto do mapeamento) ...

    if (!userManagementModal || !userListContainer /* ... etc ... */) {
        console.error("[UserMgmtController] Erro Fatal: Elementos essenciais não encontrados.");
        return; // NÃO define isUserManagementInitialized
    }
    // Adiciona Listeners
    console.log("[UserMgmtController] Adicionando listeners...");
    showUserFormBtn.addEventListener('click', () => showUserForm(null));
    cancelUserFormBtn.addEventListener('click', hideUserForm);
    userForm.addEventListener('submit', handleSaveUser);

    isUserManagementInitialized = true; // SÓ SE CHEGOU AQUI
    console.log("[UserMgmtController] Inicializado com sucesso.");
};

export const openUserManagementModal = () => { /* ... (código mantido igual, chama init e fetchUsers) ... */
    console.log("[UserMgmtController] openUserManagementModal chamada.");
    if (!isUserManagementInitialized) {
        console.warn("[UserMgmtController] Tentando abrir modal, mas controller não inicializado. Chamando init...");
        initUserManagementController();
        if (!isUserManagementInitialized) {
             console.error("[UserMgmtController] Inicialização falhou dentro de openUserManagementModal.");
             alert("Erro ao inicializar o módulo de gestão de usuários.");
             return;
        }
    }
    if (!userManagementModal) {
        console.error("[UserMgmtController] Elemento userManagementModal não definido após init.");
        alert("Erro crítico: O elemento do modal de usuários não foi encontrado.");
        return;
    }
    console.log("[UserMgmtController] Carregando usuários e mostrando modal...");
    fetchUsers(); // Carrega/recarrega a lista
    hideUserForm(); // Garante que form comece escondido
    userManagementModal.style.display = 'flex'; // Mostra o modal
    console.log("[UserMgmtController] Modal DEVE estar visível (display='flex').");
};
