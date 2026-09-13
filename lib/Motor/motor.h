#ifndef MOTOR_H_
#define MOTOR_H_

#include <Arduino.h>

class Motor
{
private:
    const int freq = 5000;
    const int pwmChannel = 2;
    const int resolution = 8;

    int motorPin1 = 0;
    int motorPin2 = 0;
    int enablePin = 0;

public:
    /**
     * Construtor
     * @param motorPin1 pino digital para acionamento do motor
     * @param motorPin2 pino digital para acionamento do motor
     * @param enablePin pino digital para o sinal PWM
     */
    Motor(int motorPin1, int motorPin2, int enablePin);
    ~Motor();

    // Metodo para inicializar o motor
    void initMotor();
    
    /**
     * Metodo para definir a rotacao do motor a partir de um valor de PWM
     * @param pwm Se PWM > 0, motor gira no sentido anti-horario.
     * 
     * Se PWM < 0, motor gira no sentido horario.
     * 
     * Se PWM = 0, motor para.
     */
    void setSpeed(int pwm);
};

#endif
