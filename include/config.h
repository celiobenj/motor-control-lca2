#pragma once

// ============================================================
/// @file config.h
/// @brief Constantes hardcoded de hardware e comunicacao serial.
// ============================================================

// --- Pinos do motor (L298N) ---
#define MOTOR_PIN1      18
#define MOTOR_PIN2      19
#define MOTOR_PWM       4

// --- Pinos do encoder e potenciômetro ---
#define ENC_A           12
#define ENC_B           13
#define POT_PIN         34      ///< Entrada analógica ADC1 para referência externa

// --- Parametros de amostragem e limites ---
#define SAMPLE_TIME_MS  35      ///< Periodo de amostragem em milissegundos
#define MAX_ORDER       10      ///< Ordem maxima da equacao de diferencas
#define MAX_LEVELS      20      ///< Quantidade maxima de niveis de referencia

// --- Comunicacao Serial ---
#define SERIAL_BAUD     115200  ///< Baud rate padrao para conexao USB
