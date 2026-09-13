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
/// @brief Tipos de fonte da referencia de controle.
// -------------------------------------------------------
enum RefType {
    REF_INTERNAL,    ///< Referencia interna por degraus
    REF_EXTERNAL     ///< Referencia externa via potenciometro (pino 34)
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
/// @brief Parametros de sintonia e referencia.
// -------------------------------------------------------
struct ControlParams {
    ControlMode mode       = MODE_NONE;
    RefType     refType    = REF_INTERNAL;
    float       refMin     = 0.0f;        ///< Limite minimo para mapeamento do potenciometro
    float       refMax     = 15.0f;       ///< Limite maximo para mapeamento do potenciometro
    int         order      = 0;
    float       coeff_e[MAX_ORDER] = {};  ///< Coeficientes de e[k], e[k-1], ...
    float       coeff_u[MAX_ORDER] = {};  ///< Coeficientes de u[k-1], u[k-2], ...
    float       levels[MAX_LEVELS] = {};  ///< Niveis da referencia interna
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
    float       potNorm;      ///< Posicao normalizada do potenciometro [0.0 a 1.0]
    bool        isIdleSample; ///< True se enviada em repouso
};
