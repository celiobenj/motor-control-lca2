#pragma once

// ============================================================
/// @file fsm.h
/// @brief Definicoes de estados, eventos da FSM e estruturas FreeRTOS.
// ============================================================

#include <Arduino.h>
#include "config.h"

// -------------------------------------------------------
/// @brief Modos de controle suportados pela planta.
// -------------------------------------------------------
enum ControlMode {
    MODE_NONE,
    MODE_POSITION,
    MODE_SPEED
};

// -------------------------------------------------------
/// @brief Estados da Maquina de Estados (FSM) do controlador.
// -------------------------------------------------------
enum FsmState {
    STATE_IDLE,      ///< Aguardando configuracao ou parado
    STATE_RUNNING,   ///< Controle em execucao ativa
    STATE_STOPPING   ///< Parando motor e reinicializando estados
};

// -------------------------------------------------------
/// @brief Tipos de eventos enviados para a tarefa de controle.
// -------------------------------------------------------
enum FsmEventType {
    EVT_APPLY,       ///< Aplicar novos parametros e iniciar
    EVT_STOP         ///< Parar motor e voltar para IDLE
};

// -------------------------------------------------------
/// @brief Parametros de sintonia e referencia ciclica.
// -------------------------------------------------------
struct ControlParams {
    ControlMode mode       = MODE_NONE;
    int         order      = 0;
    float       coeff_e[MAX_ORDER] = {};  ///< Coeficientes de e[k], e[k-1], ...
    float       coeff_u[MAX_ORDER] = {};  ///< Coeficientes de u[k-1], u[k-2], ...
    float       levels[MAX_LEVELS] = {};  ///< Niveis da referencia ciclica
    int         levelCount = 0;
    int         intervalMs = 6000;        ///< Duracao de cada nivel em ms
};

// -------------------------------------------------------
/// @brief Mensagem enviada pela fila de comandos da FSM.
// -------------------------------------------------------
struct FsmEventMessage {
    FsmEventType  type;
    ControlParams params;
};

// -------------------------------------------------------
/// @brief Amostra de telemetria enviada para a fila de plot.
// -------------------------------------------------------
struct PlotSample {
    float       ref;
    float       medida;
    int         pwm;
    ControlMode mode;
};
