// --- BIBLIOTECAS ---
#include <WiFi.h>             // Para Wi-Fi
#include <HTTPClient.h>       // Para fazer requisiÃ§Ãµes POST 
#include <ArduinoJson.h>      // Para formatar o JSON
#include "SdFat.h"            // Para o SD Card
#include <SPI.h>
#include <Wire.h>
#include "RTClib.h"           // Para o MÃ³dulo RTC (RelÃ³gio)
#include <Adafruit_Sensor.h>
#include <Adafruit_BMP085_U.h> // Para o BMP180
#include "config.h"

// --- CONFIGURAÃ‡Ã•ES DE REDE ---
const char* ssid = WIFI_SSID;
const char* password = WIFI_PASSWORD;
// Mude para o IP do PC da Frente 2 (Backend)
const char* serverIP = SERVER_IP; 
const int serverPort = SERVER_PORT;
String serverPath = SERVER_PATH; // O "endpoint" que o Node.js vai ouvir

// --- OBJETOS DOS SENSORES ---
SdFat sd;
RTC_DS3231 rtc; // (Ou RTC_DS1307 se for o seu mÃ³dulo)
Adafruit_BMP085_Unified bmp = Adafruit_BMP085_Unified(18001);
// (Adicione o objeto do seu sensor DIP 40kPa aqui, ex: HX710B)

// --- PINOS ---
#define SD_CS_PIN 5
#define I2C_SDA 21
#define I2C_SCL 22
// (Adicione os pinos do DIP 40kPa aqui)

// --- FUNÃ‡Ã•ES DE LEITURA (PLACEHOLDERS) ---
// (JÃ¡ temos as leituras do BMP180)

float lerPressaoDIP() {
  // ==========================================================
  // !! SUBSTITUIR PELA LEITURA VALIDADA DO SEU DIP 40KPA !!
  // Exemplo:
  // long valorBruto = sensorDIP.read();
  // float kpa = (valorBruto - SEU_OFFSET) / SEU_FATOR_CALIBRACAO;
  // return kpa;
  // ==========================================================
  return 1.23; // Valor FALSO para teste
}

String lerTimestampRTC() {
  if (!rtc.now().isValid()) {
    return "2025-10-21T00:00:00_RTC_FAIL"; // Retorna um erro se o RTC falhar
  }
  DateTime now = rtc.now();
  // Formato ISO 8601 (Perfeito para MySQL)
  char timestamp[32];
  sprintf(timestamp, "%04d-%02d-%02dT%02d:%02d:%02d",
          now.year(), now.month(), now.day(),
          now.hour(), now.minute(), now.second());
  return String(timestamp);
}

// --- LÃ“GICA DE ENVIO E SALVAMENTO ---

/**
 * Tenta enviar o payload JSON para o servidor Node.js
 * Retorna 'true' se o envio for bem-sucedido (CÃ³digo HTTP 200).
 */
bool enviarDados(String jsonPayload) {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("WiFi Desconectado. Nao e possivel enviar.");
    return false;
  }
  
  HTTPClient http;
  String serverUrl = "http://" + String(serverIP) + ":" + String(serverPort) + serverPath;
  
  Serial.println("Enviando dados para: " + serverUrl);
  Serial.println(jsonPayload);
  
  http.begin(serverUrl);
  http.addHeader("Content-Type", "application/json");
  
  int httpResponseCode = http.POST(jsonPayload);
  
  if (httpResponseCode == 200) {
    Serial.println("Dados enviados com sucesso (HTTP 200)");
    http.end();
    return true;
  } else {
    Serial.println("Erro no POST. Codigo: " + String(httpResponseCode));
    http.end();
    return false;
  }
}

/**
 * Salva o payload JSON em um arquivo no SD Card.
 * 
 */
bool salvarParaSD(String jsonPayload) {
  if (!sd.exists("/offline_data")) {
    if (!sd.mkdir("/offline_data")) {
       Serial.println("Falha ao criar diretorio /offline_data");
       return false;
    }
  }
  
  // Cria um nome de arquivo Ãºnico baseado no tempo
  String nomeArquivo = "/offline_data/log_" + String(millis()) + ".json";
  
  FsFile file = sd.open(nomeArquivo, FILE_WRITE);
  if (file) {
    file.print(jsonPayload);
    file.close();
    Serial.println("Salvo no SD: " + nomeArquivo);
    return true;
  } else {
    Serial.println("Falha ao abrir arquivo no SD para salvar!");
    return false;
  }
}

/**
 * Verifica se hÃ¡ dados offline no SD e tenta enviÃ¡-los.
 * Se o envio for bem-sucedido, apaga o arquivo.
 */
void sincronizarDadosSD() {
  if (WiFi.status() != WL_CONNECTED) {
    return; // SÃ³ sincroniza se estiver online
  }
  
  FsFile offlineDir = sd.open("/offline_data");
  if (!offlineDir) {
    return; // Pasta nÃ£o existe, nada a fazer
  }
  
  Serial.println("Iniciando Sincronizacao do SD Card...");
  
  FsFile file;
  while (file.openNext(&offlineDir, O_READ)) {
    String nomeArquivo = file.name();
    
    // Garante que Ã© um arquivo .json
    if (nomeArquivo.endsWith(".json")) {
      String pathCompleto = "/offline_data/" + nomeArquivo;
      String jsonPayload = "";
      
      // LÃª o conteÃºdo do arquivo
      while(file.available()) {
        jsonPayload += (char)file.read();
      }
      file.close();

      // Tenta enviar os dados lidos do arquivo
      if (enviarDados(jsonPayload)) {
        Serial.println("Dado Sincronizado: " + nomeArquivo);
        // Se o envio foi BEM SUCEDIDO, apaga o arquivo 
        sd.remove(pathCompleto);
      } else {
        Serial.println("Falha ao Sincronizar: " + nomeArquivo + ". Tentando na proxima vez.");
        // Para a sincronizaÃ§Ã£o para nÃ£o sobrecarregar
        // o servidor se ele estiver com problemas.
        break; 
      }
    }
    file.close(); // Fecha o arquivo .json
  }
  offlineDir.close(); // Fecha o diretÃ³rio
}


// --- SETUP ---
void setup() {
  Serial.begin(115200);
  
  // Inicia I2C
  Wire.begin(I2C_SDA, I2C_SCL);
  
  // Inicia BMP180
  if (!bmp.begin()) {
    Serial.println("Falha no BMP180!");
    while (1);
  }
  Serial.println("BMP180 OK!");

  // Inicia SD Card
  if (!sd.begin(SD_CS_PIN, SD_SCK_MHZ(4))) {
    Serial.println("Falha no SD Card!");
    // (NÃ£o vamos travar, o modo online ainda pode funcionar)
  } else {
    Serial.println("SD Card OK!");
  }

  // Inicia RTC
  if (!rtc.begin()) {
    Serial.println("Falha no RTC! Verifique conexoes.");
    // (NÃ£o vamos travar, mas os timestamps serao invalidos)
  } else {
    Serial.println("RTC OK!");
    // Descomente a linha abaixo UMA VEZ para acertar o relÃ³gio
    // rtc.adjust(DateTime(F(__DATE__), F(__TIME__)));
  }
  
  // (Adicione o .begin() do seu sensor DIP 40kPa aqui)

  // Conecta ao Wi-Fi
  Serial.print("Conectando ao Wi-Fi: ");
  Serial.println(ssid);
  WiFi.begin(ssid, password);
  // NÃ£o trava aqui, pois o modo offline precisa funcionar
}


// --- LOOP PRINCIPAL ---
unsigned long lastRead = 0;
const long readInterval = 30000; // LÃª e envia a cada 30 segundos

void loop() {
  unsigned long now = millis();
  
  // 1. Tenta reconectar o Wi-Fi se estiver caÃ­do
  if (WiFi.status() != WL_CONNECTED) {
    // Tenta reconectar a cada 60 segundos
    if (now % 60000 < 100) { 
      Serial.println("Tentando reconectar WiFi...");
      WiFi.reconnect();
    }
  } else {
    // 2. Se estÃ¡ ONLINE, verifica se hÃ¡ dados antigos no SD para enviar
    // Fazemos isso a cada 2 minutos para nÃ£o sobrecarregar
    if (now % 120000 < 100) {
      sincronizarDadosSD();
    }
  }

  // 3. Faz uma nova leitura a cada 'readInterval'
  if (now - lastRead >= readInterval) {
    lastRead = now;
    
    // --- Coleta de Dados ---
    float temperature;
    bmp.getTemperature(&temperature);
    
    sensors_event_t event;
    bmp.getEvent(&event);
    
    float pressao_bmp = event.pressure;
    float pressao_dip = lerPressaoDIP(); // (Vem do Placeholder)
    String timestamp = lerTimestampRTC();
    String status_filtro = "VERDE"; // (LÃ³gica de status virÃ¡ aqui)

    // --- Montagem do JSON ---
    StaticJsonDocument<256> doc;
    doc["timestamp"] = timestamp;
    doc["temperatura"] = temperature;
    doc["pressao_barometrica"] = pressao_bmp;
    doc["pressao_diferencial"] = pressao_dip;
    doc["status_filtro"] = status_filtro;
    
    String jsonPayload;
    serializeJson(doc, jsonPayload);

    // --- Envio ou Salvamento ---
    if (!enviarDados(jsonPayload)) {
      // Se o envio falhar (offline ou erro de servidor)...
      Serial.println("Envio falhou, salvando no SD Card.");
      salvarParaSD(jsonPayload); // ...salva no SD 
    }
  }
  
  delay(100); // Pequeno delay para estabilidade
}
