// ============================================================
/// @file main.cpp
/// @brief Ponto de entrada: inicializacao de hardware e tarefas FreeRTOS.
// ============================================================

#include <Arduino.h>
#include <freertos/FreeRTOS.h>
#include <freertos/queue.h>
#include <freertos/task.h>
#include <motor.h>
#include <encoder.h>

#include "config.h"
#include "fsm.h"
#include "controller.h"
#include "encoder_isr.h"
#include "serial_comm.h"

// --- Objetos de hardware estaticos ---
static Motor   motor(MOTOR_PIN1, MOTOR_PIN2, MOTOR_PWM);
static Encoder encoder;

// --- Filas FreeRTOS de comunicacao entre nucleos ---
static QueueHandle_t qControlEvents = nullptr;
static QueueHandle_t qPlotData      = nullptr;

void setup() {
    Serial.begin(SERIAL_BAUD);

    // Inicializacao do hardware
    encoder_isr_init(&encoder);
    motor.initMotor();
    motor.setSpeed(0);

    // Criacao das filas FreeRTOS
    qControlEvents = xQueueCreate(8, sizeof(FsmEventMessage));
    qPlotData      = xQueueCreate(32, sizeof(PlotSample));

    // Inicializacao dos modulos
    controller_init(&motor, &encoder, qControlEvents, qPlotData);
    serial_comm_init(qControlEvents, qPlotData);

    // Tarefa de comunicacao serial fixada no Nucleo 0
    xTaskCreatePinnedToCore(
        serial_comm_task,
        "SerialCommTask",
        4096,
        NULL,
        1,
        NULL,
        0
    );

    // Tarefa de controle em tempo real fixada no Nucleo 1 (prioridade maior)
    xTaskCreatePinnedToCore(
        controller_task,
        "ControlTask",
        4096,
        NULL,
        2,
        NULL,
        1
    );

    Serial.println(">status:pronto");
}

void loop() {
    // As atividades sao executadas exclusivamente pelas tarefas FreeRTOS
    vTaskDelay(pdMS_TO_TICKS(1000));
}
