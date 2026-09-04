#include "motor.h"

Motor::Motor(int motorPin1, int motorPin2, int enablePin)
{
    this->motorPin1 = motorPin1;
    this->motorPin2 = motorPin2;
    this->enablePin = enablePin;
}

Motor::~Motor()
{
}

void Motor::initMotor(){
  pinMode(this->motorPin1, OUTPUT);
  pinMode(this->motorPin2, OUTPUT);
  pinMode(this->enablePin, OUTPUT);

  ledcSetup(this->pwmChannel, this->freq, this->resolution);
  ledcAttachPin(this->enablePin, this->pwmChannel);
};

void Motor::setSpeed(int pwm) {

    if(pwm > 0) { // sentido anti-horario olha de cima
        digitalWrite(this->motorPin1, HIGH);
        digitalWrite(this->motorPin2, LOW);
        ledcWrite(this->pwmChannel, pwm);
    }

    else if (pwm < 0) { // sentido horario olha de cima
        digitalWrite(this->motorPin1, LOW);
        digitalWrite(this->motorPin2, HIGH);
        ledcWrite(this->pwmChannel, abs(pwm));
    }
    
    else{
        digitalWrite(this->motorPin1, LOW);
        digitalWrite(this->motorPin2, LOW);
        ledcWrite(this->pwmChannel, 0);
    }
      
};
