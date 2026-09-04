// ============================================================
/// @file encoder_isr.cpp
/// @brief Implementacao das rotinas de interrupcao do encoder.
// ============================================================

#include "encoder_isr.h"

static Encoder*     _enc        = nullptr;
static signed long  _pontoAtual = 0;   ///< Posicao acumulada em pulsos
static float        _anguloRad  = 0.0; ///< Angulo em radianos

// -------------------------------------------------------
/// @brief ISR chamada nas transicoes de nivel do canal A.
// -------------------------------------------------------
static void IRAM_ATTR _isr_canal_A() {
    if (digitalRead(ENC_A) == HIGH) {
        (digitalRead(ENC_B) == LOW) ? (_pontoAtual++, _enc->pulses_motor++)
                                    : (_pontoAtual--, _enc->pulses_motor--);
    } else {
        (digitalRead(ENC_B) == HIGH) ? (_pontoAtual++, _enc->pulses_motor++)
                                     : (_pontoAtual--, _enc->pulses_motor--);
    }
    _anguloRad = TWO_PI * _pontoAtual / _enc->ENC_COUNT_REV;
}

// -------------------------------------------------------
/// @brief ISR chamada nas transicoes de nivel do canal B.
// -------------------------------------------------------
static void IRAM_ATTR _isr_canal_B() {
    if (digitalRead(ENC_B) == HIGH) {
        (digitalRead(ENC_A) == HIGH) ? (_pontoAtual++, _enc->pulses_motor++)
                                     : (_pontoAtual--, _enc->pulses_motor--);
    } else {
        (digitalRead(ENC_A) == LOW) ? (_pontoAtual++, _enc->pulses_motor++)
                                    : (_pontoAtual--, _enc->pulses_motor--);
    }
    _anguloRad = TWO_PI * _pontoAtual / _enc->ENC_COUNT_REV;
}

// -------------------------------------------------------

void encoder_isr_init(Encoder* enc) {
    _enc = enc;
    pinMode(ENC_A, INPUT);
    pinMode(ENC_B, INPUT);
    attachInterrupt(digitalPinToInterrupt(ENC_A), _isr_canal_A, CHANGE);
    attachInterrupt(digitalPinToInterrupt(ENC_B), _isr_canal_B, CHANGE);
}

float encoder_get_angle_rad() {
    return _anguloRad;
}

void encoder_reset() {
    noInterrupts();
    _pontoAtual                 = 0;
    _anguloRad                  = 0.0;
    _enc->pulses_motor          = 0;
    _enc->ActualPoint_enc_motor = 0;
    interrupts();
}
