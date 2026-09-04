#include "encoder.h" 

Encoder::Encoder(){}

Encoder::~Encoder(){}

float Encoder::get_omega(unsigned long ts){
  this->rpm = (pulses_motor * (60.0 * 1000.0) / (ts * ENC_COUNT_REV));
  this->omega = (float) pulses_motor * (1000.0 / ts) * 2.0 * 3.141592653589793 / ENC_COUNT_REV; // em rad/s

  pulses_motor = 0;

  return this->omega;
};
