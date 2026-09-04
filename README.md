# Motor Control Serial - ESP32

## Resumo
Sistema de controle digital para motor DC com encoder em malha fechada (posicao angular e velocidade), operando exclusivamente via comunicacao serial USB sem necessidade de reprogramacao do microcontrolador. Inclui firmware em FreeRTOS com divisao de tarefas entre os nucleos da ESP32 e uma interface web estatica para operacao e monitoramento em tempo real.

## Visao Geral
O projeto permite ajustar remotamente controladores por equacao de diferencas (ordem 1 a 10) e definir referencias ciclicas em degraus. Os comandos de sintonia sao enviados em formato JSON a partir do navegador utilizando a Web Serial API. A telemetria e transmitida continuamente pela ESP32 e plotada em tempo real na interface web, permitindo pausas, selecao de janela temporal e exportacao de dados em CSV.

## Arquitetura e Tecnologias
- **Microcontrolador**: ESP32 (Xtensa Dual-Core).
- **Ambiente de Desenvolvimento**: PlatformIO / Arduino Framework.
- **Sistema Operacional de Tempo Real (FreeRTOS)**:
  - **Nucleo 0**: Tarefa de comunicacao serial (recepcao nao-bloqueante de JSON, handshake e envio de telemetria).
  - **Nucleo 1**: Tarefa de controle de tempo real (periodo deterministico de 35 ms, equacao de diferencas e atuacao no motor) gerida por Maquina de Estados (FSM).
  - **IPC**: Filas assincronas (Queues) para troca de eventos e dados de telemetria entre nucleos.
- **Formato de Dados**: Linhas unicas terminadas em `\n`; JSON para configuracao e padrao Teleplot (`>nome:valor`) para telemetria.
- **Interface Web (`site/`)**: HTML5, CSS3 responsivo (tema claro, alto contraste), JavaScript nativo (Web Serial API) e biblioteca Chart.js. Pronta para publicacao em plataformas como Vercel ou GitHub Pages.

## Estrutura do Repositorio
```text
motor_control_serial/
|-- include/
|   |-- config.h         # Constantes de pinos, baud rate e amostragem
|   |-- fsm.h            # Estados da FSM, definicoes de eventos e filas
|   |-- controller.h     # Declaracoes do controlador e tarefa do Nucleo 1
|   |-- encoder_isr.h    # Rotinas e interface de leitura do encoder
|   `-- serial_comm.h    # Declaracoes da comunicacao e tarefa do Nucleo 0
|-- src/
|   |-- main.cpp         # Inicializacao de hardware e disparo das tarefas
|   |-- controller.cpp   # FSM, calculo de diferencas e atuacao PWM
|   |-- encoder_isr.cpp  # Interrupcoes nos canais A e B
|   `-- serial_comm.cpp  # Parser de JSON, handshake e telemetria Teleplot
|-- lib/
|   |-- Motor/           # Acionamento de ponte H com PWM
|   `-- Encoder/         # Conversao de pulsos para velocidade e posicao
|-- site/
|   `-- index.html       # Aplicacao web estatica completa
|-- platformio.ini       # Configuracoes de compilacao e dependencias
`-- README.md            # Documentacao do projeto
```
