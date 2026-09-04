#pragma once

// ============================================================
/// @file encoder_isr.h
/// @brief Interrupcoes e leitura angular do encoder incremental.
// ============================================================

#include <Arduino.h>
#include "config.h"
#include <encoder.h>

/// @brief Configura pinos e anexa interrupcoes para os canais A e B.
void encoder_isr_init(Encoder* enc);

/// @brief Retorna a posicao angular atual do eixo em radianos.
float encoder_get_angle_rad();

/// @brief Zera a contagem de pulsos e posicao acumulada do encoder.
void encoder_reset();
