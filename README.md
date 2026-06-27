# PureAir

O **PureAir** é um protótipo acadêmico de IoT para monitoramento da condição de filtros de ar-condicionado. O sistema utiliza um ESP32 para coletar dados de pressão, temperatura e horário da leitura, envia essas informações para uma API em Node.js e armazena os registros em banco de dados.

A proposta é apoiar a manutenção preventiva de filtros, indicando quando o equipamento está em condição normal, em atenção ou precisando de limpeza/manutenção.

## Objetivo

Filtros de ar-condicionado geralmente são limpos ou trocados tarde demais, quando já existe perda de eficiência, mau cheiro, queda no fluxo de ar ou impacto na qualidade do ambiente.

O PureAir busca resolver esse problema com um sistema simples de monitoramento, combinando sensores, armazenamento de dados e alertas para apoiar decisões de manutenção com base em medições reais.

## Funcionalidades

- Leitura periódica de sensores pelo ESP32.
- Envio dos dados para o backend via HTTP POST.
- Armazenamento local em cartão SD quando não há conexão.
- Sincronização posterior dos dados pendentes.
- API REST para consulta das medições.
- Persistência dos dados em PostgreSQL.
- Integração opcional com MySQL/TiDB.
- Envio opcional de alertas via WhatsApp.
- Classificação do filtro por status: verde, amarelo e vermelho.

## Tecnologias Utilizadas

- **ESP32**
- **Arduino/C++**
- **Node.js**
- **Express**
- **PostgreSQL**
- **MySQL/TiDB**
- **ArduinoJson**
- **SdFat**
- **RTClib**
- **Sensores de pressão/temperatura**

## Arquitetura

## Arquitetura

```mermaid
flowchart LR
    ESP32["ESP32"] -->|POST /dados| API["API Node.js"]
    ESP32 -->|modo offline| SD["Cartão SD"]
    API --> PG["PostgreSQL"]
    API --> MYSQL["MySQL/TiDB opcional"]
    API --> ALERTA["Alerta WhatsApp opcional"]
    DASH["Dashboard / Cliente"] -->|GET /api/*| API
    API --> MYSQL["MySQL/TiDB opcional"]
    API --> ALERTA["Alerta WhatsApp opcional"]
    DASH["Dashboard / Cliente"] -->|GET /api/*| API
