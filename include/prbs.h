#pragma once

// ============================================================
/// @file prbs.h
/// @brief Gerador de Sequencia Binaria Pseudo-Aleatoria (PRBS via LFSR).
// ============================================================

#include <Arduino.h>

inline uint16_t prbs(uint16_t &stretch_counter, uint16_t* input, uint16_t bits, uint16_t stretch)
{
  if (stretch_counter >= stretch) {
    stretch_counter = 0; // Reset counter

    uint16_t mask = (1 << bits) - 1;
    uint16_t comp = (*input ^ (*input >> 1)) & 1;
    *input = ((*input >> 1) | (comp << (bits - 1))) & mask; // Bit-shifting and adding the XOR result
  } else {
    stretch_counter += 1;
  }
  return *input & 0x01;
}
