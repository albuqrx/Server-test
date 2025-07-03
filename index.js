const express = require('express');
const bodyParser = require('body-parser');
const admin = require('./firebase');
const cors = require('cors');
require('dotenv').config();




const crypto = require('crypto');
const app = express();
app.use(cors());
app.use(bodyParser.json());


const TELEGRAM_BOT_TOKEN = process.env.BOT_TOKEN;

// ✅ Проверка подписи Telegram
function verifyTelegram(initDataString, botToken) {
  console.log("❌ Подпись Telegram неверна");
  const params = new URLSearchParams(initDataString);
  const hash = params.get('hash');
  params.delete('hash');

  const dataCheckArray = [];
  params.forEach((value, key) => {
    dataCheckArray.push(`${key}=${value}`);
  });
  dataCheckArray.sort();
  const dataCheckString = dataCheckArray.join('\n');

  const secretKey = crypto.createHash('sha256').update(botToken).digest();
  const hmac = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

  return hmac === hash;
}

// 🔁 Обработка крутки колеса
app.post('/submit_spin', async (req, res) => {
  console.log("📩 Получен запрос /submit_spin");
  console.log("📩 Получен запрос от клиента:", JSON.stringify(req.body, null, 2));

  const { init_data, result_index } = req.body;

  if (!init_data || typeof result_index !== "number") {
    console.warn("⚠️ Плохой payload (init_data или result_index):", req.body);
    return res.status(400).json({ error: "invalid payload" });
  }

  // Распарсим init_data
  const url = new URLSearchParams(init_data);
  const userJson = url.get("user");
  const hash = url.get("hash");

  if (!userJson || !hash) {
    console.error("❌ Не хватает user или hash в init_data");
    return res.status(400).json({ error: "invalid init_data format" });
  }

  // Проверка подписи Telegram
  const initDataWithoutHash = init_data.split("&hash=")[0];
  const isValid = verifyTelegram(initDataWithoutHash, hash);

  if (!isValid) {
    console.error("❌ Неверная подпись Telegram! Отклоняем запрос.");
    return res.status(403).json({ error: "Invalid Telegram signature" });
  }

  let user = {};
  try {
    user = JSON.parse(userJson);
  } catch (err) {
    console.error("❌ Ошибка парсинга user JSON:", err.message);
    return res.status(400).json({ error: "invalid user json" });
  }

  const user_id = String(user.id);
  const username = user.username || 'anonymous';
  console.log(`✅ Подпись Telegram подтверждена. Пользователь: ${username} (ID: ${user_id})`);

  // Работа с Firestore
  const db = admin;
  const spinsRef = db.collection("spins").doc(user_id);
  const doc = await spinsRef.get();
  const data = doc.exists ? doc.data() : null;

  if (!data) {
    console.log("🆕 Пользователь новый — создаём документ");
    await spinsRef.set({
      username: username,
      spins: 1,
      last_spin: Date.now()
    });
  } else {
    console.log("🔁 Пользователь уже есть — увеличиваем счётчик");
    await spinsRef.update({
      spins: admin.firestore.FieldValue.increment(1),
      last_spin: Date.now()
    });
  }

  const updatedDoc = await spinsRef.get();
  const updated = updatedDoc.data();
  console.log("📊 Обновлённые данные пользователя:", updated);

  // Получаем приз
  const prizeRef = db.collection("prizes").doc(String(result_index));
  const prizeDoc = await prizeRef.get();

  if (!prizeDoc.exists) {
    console.warn("🎁 Приз с индексом", result_index, "не найден");
    return res.status(404).json({ error: "Prize not found" });
  }

  const prize = prizeDoc.data().text;
  console.log("🎉 Приз пользователю:", prize);

  // Ответ клиенту
  res.json({
    ok: true,
    spins: updated.spins,
    prize
  });
});


// 🔎 Тест Firestore
app.get('/test-firestore', async (req, res) => {
  try {
    const testDoc = await admin.collection('spins').limit(1).get();
    if (testDoc.empty) {
      return res.json({ ok: true, message: 'Firestore подключена, но коллекция пустая.' });
    }

    const data = [];
    testDoc.forEach((doc) => {
      data.push({ id: doc.id, ...doc.data() });
    });

    res.json({ ok: true, message: 'Firestore подключена!', data });
  } catch (err) {
    console.error('❌ Ошибка Firestore:', err);
    res.status(500).json({ ok: false, message: 'Ошибка подключения к Firestore', error: err.message });
  }
});

// 🏠 Корень сервера
app.get('/', (req, res) => {
  res.send('Сервер работает! Добро пожаловать!');
});

// 🚀 Старт сервера
app.listen(3000, () => {
  console.log('🚀 Сервер запущен на http://localhost:3000');
});