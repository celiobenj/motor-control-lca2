#pragma once

// ============================================================
/// @file serial_comm.h
/// @brief Comunicacao serial assincrona no Nucleo 0 via FreeRTOS.
// ============================================================

#include <Arduino.h>
#include <freertos/FreeRTOS.h>
#include <freertos/queue.h>
#include <freertos/task.h>
#include "fsm.h"

/// @brief Configura as filas compartilhadas com a tarefa de controle.
void serial_comm_init(QueueHandle_t qEvents, QueueHandle_t qPlot);

/// @brief Tarefa FreeRTOS no Nucleo 0 para recepcao JSON e envio de telemetria.
void serial_comm_task(void* pvParameters);
