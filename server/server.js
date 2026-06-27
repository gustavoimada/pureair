// ====== IMPORTAÇÕES E SETUP DE VARIÁVEIS ======
import express from "express";
import pkg from "pg";
import mysql from "mysql2/promise";
import dotenv from "dotenv";
import axios from "axios"; // Biblioteca para requisições HTTP

dotenv.config(); 
const { Pool } = pkg;
const app = express();
const PORT = process.env.PORT || 3000;
const MYSQL_ENABLED = Boolean(
    process.env.MYSQL_HOST &&
    process.env.MYSQL_USER &&
    process.env.MYSQL_PASSWORD &&
    process.env.MYSQL_DATABASE
);

// ====== MIDDLEWARE ======
app.use(express.json({ limit: '1mb' }));

// ======================================================================
// ====== FUNÇÃO DE ALERTA WHATSAPP (ULTRA MSG - 3 STATUS) ======
// ======================================================================
const enviarAlertaWhatsApp = async (dadosDaMedida) => {
    const { timestamp, temperatura, pressao_barometrica, pressao_barometrica_final, status_filtro } = dadosDaMedida;
    
    const API_TOKEN = process.env.ULTRAMSG_TOKEN;
    const API_URL = process.env.ULTRAMSG_API_URL;
    const DESTINATARIO = process.env.WHATSAPP_TO;
    const LINK_MONITORAMENTO = process.env.DASHBOARD_URL || "";

    if (!API_TOKEN || !API_URL || !DESTINATARIO) {
        console.warn("Alerta WhatsApp ignorado: configure ULTRAMSG_TOKEN, ULTRAMSG_API_URL e WHATSAPP_TO no .env.");
        return;
    }

    // 1. Definir o conteúdo da mensagem com base no status do filtro
    let titulo = "";
    let emoji = "";

    switch (status_filtro.toUpperCase()) {
        case "VERDE":
            titulo = "🟢 STATUS VERDE: Filtro em ótimas condições.";
            emoji = "✅";
            break;
        case "AMARELO":
            titulo = "⚠️ STATUS AMARELO: Atenção, o filtro requer monitoramento (pré-alerta).";
            emoji = "🔔";
            break;
        case "VERMELHO":
            titulo = "🚨 STATUS VERMELHO: Limpeza ou manutenção urgente do filtro!";
            emoji = "❌";
            break;
        default:
            titulo = "❓ STATUS DESCONHECIDO.";
            emoji = "❓";
    }

    // 2. Montar a mensagem com o link no final
    const mensagem = `
${emoji} ${titulo}

Detalhes da Medida:
📅 Timestamp: ${timestamp}
🌡️ Temperatura: ${temperatura.toFixed(2)} °C
⛰️ Pressão Inicial: ${pressao_barometrica.toFixed(2)} hPa
🌪️ Pressão Final: ${pressao_barometrica_final?.toFixed(2) || "N/A"} hPa

Acompanhe os dados em tempo real:
${LINK_MONITORAMENTO}
    `.trim();

    // Payload para o UltraMsg (formato URLSearchParams)
    const payload = new URLSearchParams();
    payload.append('token', API_TOKEN);
    payload.append('to', DESTINATARIO);
    payload.append('body', mensagem);

    try {
        const response = await axios.post(API_URL, payload);
        
        if (response.data.error) {
             console.error(`❌ Erro da API UltraMsg ao enviar ${status_filtro}:`, response.data.error);
        } else {
             console.log(`✅ Alerta de WhatsApp para status ${status_filtro} disparado com sucesso!`);
        }
    } catch (error) {
        console.error(
            "❌ Erro na requisição do WhatsApp:",
            error.response ? error.response.data : error.message
        );
    }
};

// ====== CONEXÃO COM O POSTGRES LOCAL (CÓDIGO ORIGINAL) ======
const pgPool = new Pool({
    host: process.env.PGHOST || 'localhost',
    port: Number(process.env.PGPORT || 5432),
    user: process.env.PGUSER || 'postgres',
    password: process.env.PGPASSWORD || '',
    database: process.env.PGDATABASE || 'pureair',
});

pgPool.connect()
    .then(() => console.log("✅ Conectado ao PostgreSQL local com sucesso!"))
    .catch((err) => console.error("❌ Erro ao conectar ao PostgreSQL:", err.message));

// ====== CONEXÃO COM O MYSQL DO MANUS (CÓDIGO ORIGINAL) ======
const mysqlPool = MYSQL_ENABLED ? mysql.createPool({
    host: process.env.MYSQL_HOST,
    port: Number(process.env.MYSQL_PORT || 4000),
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    ssl: {
        rejectUnauthorized: process.env.MYSQL_SSL_REJECT_UNAUTHORIZED === 'true'
    }
}) : null;

if (mysqlPool) {
    mysqlPool.getConnection()
        .then((conn) => {
            console.log("✅ Conectado ao MySQL do Manus com sucesso!");
            conn.release();
        })
        .catch((err) => console.error("❌ Erro ao conectar ao MySQL:", err.message));
} else {
    console.log("MySQL/TiDB opcional desativado. Configure MYSQL_* no .env para espelhar os dados.");
}

// ====== GARANTE QUE A TABELA EXISTE NO POSTGRES (CÓDIGO ORIGINAL) ======
const criarTabelaPG = async () => {
    const query = `
      CREATE TABLE IF NOT EXISTS medidas (
        id SERIAL PRIMARY KEY,
        timestamp TIMESTAMP,
        temperatura REAL,
        pressao_barometrica REAL,
        pressao_barometrica_final REAL,
        status_filtro VARCHAR(20)
      );
    `;
    try {
      await pgPool.query(query);
      console.log("🗄️  Tabela 'medidas' no PostgreSQL verificada/criada.");
    } catch (err) {
      console.error("❌ Erro ao criar tabela no PostgreSQL:", err.message);
    }
};

// ====== GARANTE QUE A TABELA EXISTE NO MYSQL (CÓDIGO ORIGINAL) ======
const criarTabelaMysql = async () => {
    if (!mysqlPool) {
      return;
    }

    const query = `
      CREATE TABLE IF NOT EXISTS medidas (
        id INT AUTO_INCREMENT PRIMARY KEY,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        temperatura FLOAT,
        pressao_barometrica FLOAT,
        pressao_barometrica_final FLOAT,
        status_filtro VARCHAR(20)
      );
    `;
    try {
      const conn = await mysqlPool.getConnection();
      await conn.execute(query);
      conn.release();
      console.log("🗄️  Tabela 'medidas' no MySQL verificada/criada.");
    } catch (err) {
      console.error("❌ Erro ao criar tabela no MySQL:", err.message);
    }
};

criarTabelaPG();
criarTabelaMysql();

// ====== ROTAS ======
app.get("/", (req, res) => {
    res.send("Servidor ESP32 + PostgreSQL + MySQL Manus rodando 🚀");
});

app.post("/dados", async (req, res) => {
    console.log("📥 Recebido do ESP32:", JSON.stringify(req.body, null, 2));

    const { timestamp, temperatura, pressao_barometrica, pressao_barometrica_final, status_filtro } = req.body;

    // Validação robusta
    if (
        timestamp == null || typeof timestamp !== "string" ||
        temperatura == null || typeof temperatura !== "number" ||
        pressao_barometrica == null || typeof pressao_barometrica !== "number" ||
        status_filtro == null || typeof status_filtro !== "string"
    ) {
        console.warn("⚠️ Dados inválidos:", req.body);
        return res.status(400).json({ erro: "Dados incompletos ou inválidos." });
    }

    // 💬 Lógica de Alerta de WhatsApp para TODOS os status: 
    if (status_filtro && (status_filtro.toUpperCase() === "VERMELHO" || status_filtro.toUpperCase() === "AMARELO" || status_filtro.toUpperCase() === "VERDE")) {
        console.log(`💬 Disparando alerta de WhatsApp para status: ${status_filtro.toUpperCase()}`);
        enviarAlertaWhatsApp(req.body); 
    }

    try {
        // ====== INSERIR NO POSTGRESQL ======
        const pgQuery = `
          INSERT INTO medidas (timestamp, temperatura, pressao_barometrica, pressao_barometrica_final, status_filtro)
          VALUES ($1, $2, $3, $4, $5)
        `;
        await pgPool.query(pgQuery, [timestamp, temperatura, pressao_barometrica, pressao_barometrica_final, status_filtro]);
        console.log("✅ Inserido no PostgreSQL");

        // ====== INSERIR NO MYSQL DO MANUS ======
        if (mysqlPool) {
          const mysqlQuery = `
            INSERT INTO medidas (timestamp, temperatura, pressao_barometrica, pressao_barometrica_final, status_filtro)
            VALUES (?, ?, ?, ?, ?)
          `;
          const conn = await mysqlPool.getConnection();
          await conn.execute(mysqlQuery, [timestamp, temperatura, pressao_barometrica, pressao_barometrica_final, status_filtro]);
          conn.release();
          console.log("✅ Inserido no MySQL do Manus");
        }

        console.log(`
✅ Dados salvos no PostgreSQL${mysqlPool ? " e MySQL" : ""}:
📅 Timestamp: ${timestamp}
🌡️ Temperatura: ${temperatura.toFixed(2)} °C
⛰️ Pressão Entrada: ${pressao_barometrica.toFixed(2)} hPa
🌪️ Pressão Final: ${pressao_barometrica_final?.toFixed(2) || "—"} hPa
🟩 Status Filtro: ${status_filtro}
──────────────────────────────
        `);

        res.status(200).json({ sucesso: true });
    } catch (err) {
        console.error("❌ Erro ao inserir dados:", err.message);
        res.status(500).json({ erro: "Erro interno ao salvar dados." });
    }
});

app.get("/medidas", async (req, res) => {
    try {
        const result = await pgPool.query("SELECT * FROM medidas ORDER BY id DESC LIMIT 20;");
        res.status(200).json(result.rows);
    } catch (err) {
        console.error("❌ Erro ao buscar dados:", err.message);
        res.status(500).json({ erro: "Erro ao buscar dados." });
    }
});

// ====== ROTAS PARA O SITE MANUS (CÓDIGO ORIGINAL) ======

app.get("/api/latest", async (req, res) => {
    try {
      const result = await pgPool.query(
        "SELECT * FROM medidas ORDER BY id DESC LIMIT 1"
      );
      if (result.rows.length === 0) {
        return res.status(404).json({ erro: "Nenhuma leitura disponível" });
      }
      res.json(result.rows[0]);
    } catch (err) {
      console.error("❌ Erro ao buscar última leitura:", err.message);
      res.status(500).json({ erro: "Erro ao buscar dados." });
    }
});

app.get("/api/recent", async (req, res) => {
    try {
      const limit = parseInt(req.query.limit) || 50;
      const result = await pgPool.query(
        "SELECT * FROM medidas ORDER BY id DESC LIMIT $1",
        [limit]
      );
      res.json(result.rows.reverse());
    } catch (err) {
      console.error("❌ Erro ao buscar leituras recentes:", err.message);
      res.status(500).json({ erro: "Erro ao buscar dados." });
    }
});

app.get("/api/all", async (req, res) => {
    try {
      const result = await pgPool.query(
        "SELECT * FROM medidas ORDER BY id ASC"
      );
      res.json(result.rows);
    } catch (err) {
      console.error("❌ Erro ao buscar todas as leituras:", err.message);
      res.status(500).json({ erro: "Erro ao buscar dados." });
    }
});

app.get("/api/status", async (req, res) => {
    try {
      const result = await pgPool.query(
        "SELECT * FROM medidas ORDER BY id DESC LIMIT 1"
      );
      
      if (result.rows.length === 0) {
        return res.json({
          status: "unknown",
          message: "Nenhuma leitura disponível",
          lastUpdate: null,
        });
      }

      const medida = result.rows[0];
      
      let filterStatus = "clean";
      if (medida.pressao_barometrica_final) {
        const diferencaPressao = medida.pressao_barometrica_final - medida.pressao_barometrica;
        if (diferencaPressao > 5) {
          filterStatus = "needs_cleaning";
        }
      }

      res.json({
        status: filterStatus,
        pressure: medida.pressao_barometrica,
        pressaoFinal: medida.pressao_barometrica_final,
        temperature: medida.temperatura,
        message: filterStatus === "needs_cleaning"
          ? "Filtro precisa de limpeza"
          : "Filtro está em boas condições",
        lastUpdate: medida.timestamp,
      });
    } catch (err) {
      console.error("❌ Erro ao buscar status:", err.message);
      res.status(500).json({ erro: "Erro ao buscar dados." });
    }
});

app.get("/api/stats", async (req, res) => {
    try {
      const result = await pgPool.query(`
        SELECT 
          COUNT(*) as total_leituras,
          AVG(temperatura) as temp_media,
          AVG(pressao_barometrica) as pressao_media,
          MAX(temperatura) as temp_maxima,
          MIN(temperatura) as temp_minima,
          MAX(pressao_barometrica) as pressao_maxima,
          MIN(pressao_barometrica) as pressao_minima
        FROM medidas
      `);
      res.json(result.rows[0]);
    } catch (err) {
      console.error("❌ Erro ao buscar estatísticas:", err.message);
      res.status(500).json({ erro: "Erro ao buscar dados." });
    }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Servidor rodando na porta ${PORT}`);
    console.log(`📡 Recebendo dados do Arduino em: POST /dados`);
    console.log(`💾 Salvando em: PostgreSQL local + MySQL do Manus (com SSL)`);
    console.log(`🌐 Fornecendo dados para o site Manus em: GET /api/*`);
});
