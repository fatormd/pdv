// =======================================================
// IMPORTS GLOBAIS (SINTAXE V2)
// =======================================================
const {onCall, HttpsError} = require("firebase-functions/v2/https");
const {initializeApp} = require("firebase-admin/app");
const {getFirestore, FieldValue} = require("firebase-admin/firestore");
const {getAuth} = require("firebase-admin/auth");
const axios = require("axios");

initializeApp();

// =======================================================
// FUNÇÃO DO WOOCOMMERCE (SINTAXE V2)
// =======================================================

const WOOCOMMERCE_URL = "https://nossotempero.fatormd.com";

exports.proxyWooCommerce = onCall(async (request) => {
  const { method, endpoint, payload } = request.data;
  
  const consumerKey = process.env.WOO_KEY;
  const consumerSecret = process.env.WOO_SECRET;

  if (!consumerKey || !consumerSecret) {
    console.error("Erro Crítico: Variáveis de ambiente WOO_KEY ou WOO_SECRET não definidas!");
    throw new HttpsError(
      "internal",
      "Erro interno do servidor ao tentar aceder às configurações."
    );
  }

  if (!method || !endpoint) {
    throw new HttpsError(
      "invalid-argument",
      "A função deve ser chamada com 'method' e 'endpoint'."
    );
  }

  const authParams = `consumer_key=${consumerKey}&consumer_secret=${consumerSecret}`;
  const querySeparator = endpoint.includes("?") ? "&" : "?";
  const url = `${WOOCOMMERCE_URL}/wp-json/wc/v3/${endpoint}${querySeparator}${authParams}`;

  try {
    let response;
    if (method.toUpperCase() === "GET") {
      response = await axios.get(url);
    } else if (method.toUpperCase() === "POST") {
      response = await axios.post(url, payload, {
        headers: { "Content-Type": "application/json" },
      });
    } else {
      throw new HttpsError(
        "invalid-argument",
        "Método (method) não suportado. Use 'GET' ou 'POST'."
      );
    }
    return response.data;
  } catch (error) {
    console.error("Erro ao chamar a API do WooCommerce:", error.response ? JSON.stringify(error.response.data) : error.message);
    throw new HttpsError(
      "internal",
      "Erro ao processar a requisição do WooCommerce."
    );
  }
});


// =======================================================
// FUNÇÕES DE GERENCIAMENTO DE USUÁRIO (SINTAXE V2)
// =======================================================

const firestore = getFirestore();
const auth = getAuth();
const APP_ID = "1:1097659747429:web:8ec0a7c3978c311dbe0a8c"; // Seu App ID

// --- FUNÇÃO PARA CRIAR NOVO USUÁRIO ---
exports.createNewUser = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError(
      "unauthenticated",
      "Você precisa estar logado para criar usuários."
    );
  }

  const callerDoc = await firestore
    .collection("artifacts").doc(APP_ID)
    .collection("public").doc("data")
    .collection("users")
    .doc(request.auth.token.email) // Email do gerente
    .get();

  if (!callerDoc.exists || callerDoc.data().role !== "gerente") {
    throw new HttpsError(
      "permission-denied",
      "Apenas gerentes podem criar novos usuários."
    );
  }

  const { email, password, name, role, isActive } = request.data;

  if (!email || !password || !name || !role) {
    throw new HttpsError(
      "invalid-argument",
      "Dados incompletos. E-mail, senha, nome e cargo são obrigatórios."
    );
  }

  try {
    const userRecord = await auth.createUser({
      email: email,
      password: password,
      displayName: name,
      disabled: !isActive,
    });

    const userDocRef = firestore
      .collection("artifacts").doc(APP_ID)
      .collection("public").doc("data")
      .collection("users")
      .doc(email);

    await userDocRef.set({
      name: name,
      email: email,
      role: role,
      isActive: isActive,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    return {
      status: "success",
      message: `Usuário ${name} (${email}) criado com sucesso.`,
      uid: userRecord.uid,
    };
  } catch (error) {
    throw new HttpsError("internal", error.message);
  }
});

// --- FUNÇÃO PARA ATUALIZAR USUÁRIO ---
exports.updateUser = onCall(async (request) => {
  const { originalEmail, name, role, isActive } = request.data;

  try {
    const userRecord = await auth.getUserByEmail(originalEmail);
    await auth.updateUser(userRecord.uid, {
      displayName: name,
      disabled: !isActive,
    });

    const userDocRef = firestore
      .collection("artifacts").doc(APP_ID)
      .collection("public").doc("data")
      .collection("users")
      .doc(originalEmail);
      
    await userDocRef.update({
      name: name,
      role: role,
      isActive: isActive,
      updatedAt: FieldValue.serverTimestamp(),
    });

    return { status: "success", message: `Usuário ${name} atualizado.` };
  } catch (error) {
    throw new HttpsError("internal", error.message);
  }
});

// --- FUNÇÃO PARA EXCLUIR USUÁRIO ---
exports.deleteUser = onCall(async (request) => {
  const { email } = request.data;

  try {
    const userRecord = await auth.getUserByEmail(email);
    await auth.deleteUser(userRecord.uid);

    const userDocRef = firestore
      .collection("artifacts").doc(APP_ID)
      .collection("public").doc("data")
      .collection("users")
      .doc(email);
      
    await userDocRef.delete();

    return { status: "success", message: `Usuário ${email} excluído.` };
  } catch (error) {
    throw new HttpsError("internal", error.message);
  }
});