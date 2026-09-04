#pragma once

// ============================================================
/// @file controller.h
/// @brief Controlador por equacao de diferencas e FSM em FreeRTOS.
// ============================================================

#include <Arduino.h>
#include <freertos/FreeRTOS.h>
#include <freertos/queue.h>
#include <freertos/task.h>
#include <motor.h>
#include <encoder.h>
#include "config.h"
#include "fsm.h"

/// @brief Configura dependencias e filas do controlador.
void controller_init(Motor* motor, Encoder* encoder, QueueHandle_t qEvents, QueueHandle_t qPlot);

/// @brief Tarefa FreeRTOS executada no Nucleo 1 para calculo e atuacao.
void controller_task(void* pvParameters);

/// @brief Retorna o estado atual da Maquina de Estados (FSM).
FsmState controller_get_state();
