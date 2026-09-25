// ============================================================
/// @file serial_comm.cpp
/// @brief Implementacao da comunicacao serial no Nucleo 0.
// ============================================================

#include "serial_comm.h"
#include <ArduinoJson.h>

static QueueHandle_t _qEvents = nullptr;
static QueueHandle_t _qPlot   = nullptr;

#define RX_BUFFER_SIZE 1024
static char _rxBuffer[RX_BUFFER_SIZE];
static size_t _rxIndex = 0;

// -------------------------------------------------------
/// @brief Processa uma linha completa JSON recebida pela serial.
// -------------------------------------------------------
static void _process_json_line(const char* jsonStr) {
    StaticJsonDocument<1024> doc;
    DeserializationError err = deserializeJson(doc, jsonStr);
    if (err) {
        Serial.println("{\"status\":\"error\",\"msg\":\"json_invalido\"}");
        return;
    }

    const char* cmd = doc["cmd"] | "";

    // Handshake / Ping
    if (strcmp(cmd, "ping") == 0) {
        Serial.println("{\"status\":\"ok\"}");
        return;
    }

    // Parar motor
    if (strcmp(cmd, "stop") == 0) {
        FsmEventMessage msg;
        msg.type = EVT_STOP;
        xQueueSend(_qEvents, &msg, portMAX_DELAY);
        Serial.println("{\"status\":\"ok\"}");
        return;
    }

    // Reiniciar base de tempo (t = 0)
    if (strcmp(cmd, "reset_time") == 0) {
        FsmEventMessage msg;
        msg.type = EVT_RESET_TIME;
        xQueueSend(_qEvents, &msg, portMAX_DELAY);
        Serial.println("{\"status\":\"ok\"}");
        return;
    }

    // Iniciar identificacao PRBS
    if (strcmp(cmd, "ident") == 0) {
        FsmEventMessage msg;
        msg.type = EVT_IDENT;
        const char* measStr = doc["measure"] | "speed";
        msg.identParams.measureSpeed = (strcmp(measStr, "position") != 0);
        msg.identParams.sampleTimeMs = constrain((int)(doc["sample_time_ms"] | 5), 1, 1000);
        msg.identParams.stretch      = constrain((int)(doc["stretch"] | 5), 1, 100);
        xQueueSend(_qEvents, &msg, portMAX_DELAY);
        Serial.println("{\"status\":\"ok\"}");
        return;
    }

    // Aplicar parametros e iniciar controle
    FsmEventMessage msg;
    msg.type = EVT_APPLY;

    const char* modeStr = doc["mode"] | "speed";
    msg.params.mode = (strcmp(modeStr, "position") == 0) ? MODE_POSITION : MODE_SPEED;

    const char* refTypeStr = doc["ref_type"] | "internal";
    msg.params.refType = (strcmp(refTypeStr, "external") == 0) ? REF_EXTERNAL : REF_INTERNAL;
    msg.params.refMin  = doc["ref_min"] | 0.0f;
    msg.params.refMax  = doc["ref_max"] | 15.0f;

    msg.params.order = constrain((int)(doc["order"] | 1), 1, MAX_ORDER);

    JsonArray arrE = doc["coeff_e"].as<JsonArray>();
    JsonArray arrU = doc["coeff_u"].as<JsonArray>();
    for (int i = 0; i < msg.params.order; i++) {
        msg.params.coeff_e[i] = (i < (int)arrE.size()) ? arrE[i].as<float>() : 0.0f;
        msg.params.coeff_u[i] = (i < (int)arrU.size()) ? arrU[i].as<float>() : 0.0f;
    }

    JsonArray arrL = doc["levels"].as<JsonArray>();
    msg.params.levelCount = 0;
    for (JsonVariant v : arrL) {
        if (msg.params.levelCount >= MAX_LEVELS) break;
        msg.params.levels[msg.params.levelCount++] = v.as<float>();
    }

    if (msg.params.refType == REF_INTERNAL && msg.params.levelCount == 0) {
        Serial.println("{\"status\":\"error\",\"msg\":\"sem_niveis_referencia\"}");
        return;
    }

    int interval_s = doc["interval_s"] | 6;
    msg.params.intervalMs = max(1, interval_s) * 1000;

    xQueueSend(_qEvents, &msg, portMAX_DELAY);
    Serial.println("{\"status\":\"ok\"}");
}

// ============================================================
// API publica
// ============================================================

void serial_comm_init(QueueHandle_t qEvents, QueueHandle_t qPlot) {
    _qEvents = qEvents;
    _qPlot   = qPlot;
    _rxIndex = 0;
}

void serial_comm_task(void* pvParameters) {
    (void)pvParameters;

    for (;;) {
        // --- 1. Leitura de dados recebidos da porta serial ---
        while (Serial.available() > 0) {
            char c = (char)Serial.read();
            if (c == '\r') continue; // ignora CR

            if (c == '\n') {
                if (_rxIndex > 0) {
                    _rxBuffer[_rxIndex] = '\0';
                    _process_json_line(_rxBuffer);
                    _rxIndex = 0;
                }
            } else {
                if (_rxIndex < RX_BUFFER_SIZE - 1) {
                    _rxBuffer[_rxIndex++] = c;
                } else {
                    // Buffer estourou, descarta
                    _rxIndex = 0;
                }
            }
        }

        // --- 2. Envio de amostras de telemetria da fila de plot ---
        PlotSample sample;
        while (xQueueReceive(_qPlot, &sample, 0) == pdPASS) {
            if (sample.isIdleSample) {
                // Em repouso: envia apenas a telemetria do potenciometro
                Serial.print(">pot:");
                Serial.println(sample.potNorm, 4);
            } else if (sample.isIdentSample) {
                // Em identificacao PRBS: telemetria de identificacao
                Serial.print(">t:");
                Serial.println(sample.t_ms);

                Serial.print(">u_ident:");
                Serial.println(sample.pwm);

                if (sample.mode == MODE_SPEED) {
                    Serial.print(">omega:");
                    Serial.println(sample.medida);
                } else {
                    Serial.print(">angulo:");
                    Serial.println(sample.medida);
                }
            } else {
                // Em operacao: telemetria completa de controle
                Serial.print(">t:");
                Serial.println(sample.t_ms);

                Serial.print(">ref:");
                Serial.println(sample.ref);

                if (sample.mode == MODE_SPEED) {
                    Serial.print(">omega:");
                    Serial.println(sample.medida);
                } else {
                    Serial.print(">angulo:");
                    Serial.println(sample.medida);
                }

                Serial.print(">u:");
                Serial.println(sample.pwm);

                Serial.print(">pot:");
                Serial.println(sample.potNorm, 4);
            }
        }

        // Cede tempo da CPU para outras atividades e watchdog do Nucleo 0
        vTaskDelay(pdMS_TO_TICKS(2));
    }
}
