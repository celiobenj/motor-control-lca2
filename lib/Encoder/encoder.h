#ifndef ENCODER_H
#define ENCODER_H

class Encoder
{
private:
    float omega = 0.0;
    float rpm = 0.0;

public:
    Encoder();
    ~Encoder(); 

    /**
     * Este metodo retorna a rotacao do motor em rad/s.
     * @param sampleTime e a taxa de amostragem para o calculo da rotacao do motor
     */
    float get_omega(unsigned long sampleTime);

    // Captura o sentido de rotacao do motor
    bool direcao = true;

    // Quantidade de pulsos por revolucao do motor
    const float ENC_COUNT_REV = 1368.4;
    
    // Variavel para a contagem dos pulsos
    volatile long pulses_motor = 0;

    // Variavel para capturar a posicao angular
    signed long ActualPoint_enc_motor = 0;
};

#endif
