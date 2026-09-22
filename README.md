# LCA2 - Controle de Motor

Sistema de controle digital em malha fechada para motor DC com encoder acoplado, usando o dual-core da ESP32 via FreeRTOS, com sintonia remota e plotagem gráfica em tempo real no navegador via Web Serial API.

- **Deploy da Aplicação**: https://lca2-motor.vercel.app/
- **Repositório**: https://github.com/celiobenj/motor-control-lca2

---

## Visão Geral

O projeto permite sintonizar controladores por equação de diferenças (ordem 1 a 10) para controle de velocidade angular (rad/s) ou posição angular (graus) sem necessidade de reprogramar o microcontrolador.

### Modos de Referência
- **Interna**: Sequência cíclica de degraus com intervalo ajustável em segundos.
- **Externa**: Leitura analógica do potenciômetro, mapeada linearmente entre limites mínimo e máximo configuráveis.

### Visualização Gráfica
A interface dispõe de dois gráficos sincronizados no tempo, com suporte a pausa e janelas deslizantes (5 s, 15 s, 30 s, 1 min ou tudo):
- **Referência / Medição**: Sobrepõe o sinal de referência desejado à resposta real medida pelo encoder (velocidade em rad/s ou posição em graus), facilitando a análise de erro em regime transitório e permanente.
- **Sinal de Controle ($u$)**: Mostra o esforço de controle calculado pela equação de diferenças e entregue ao driver em PWM (0 a 255 para velocidade e -255 a 255 para posição), permitindo acompanhar a saturação do atuador.

---

## Arquitetura e Tecnologias

- **Microcontrolador**: ESP32 (Xtensa Dual-Core) no framework Arduino / PlatformIO.
- **FreeRTOS Dual-Core**:
  - **Núcleo 0 (`serial_comm_task`)**: Leitura serial contínua (115200 baud), processamento de comandos JSON e transmissão de telemetria.
  - **Núcleo 1 (`controller_task`)**: Execução a cada 35 ms, máquina de estados finita (IDLE, RUNNING, STOPPING), cálculo da equação de diferenças e modulação PWM a 5 kHz no driver L298N.
  - **Filas FreeRTOS (Queues)**: Troca assíncrona e thread-safe de eventos e dados de telemetria entre núcleos.
- **Frontend (`site/`)**:
  - HTML5, CSS3 responsivo e JavaScript nativo via ES Modules.
  - **Web Serial API** para comunicação direta com a porta USB.
  - **Chart.js** para visualização gráfica temporal com janelas deslizantes (5 s, 15 s, 30 s, 1 min, tudo).
  - **KaTeX** para renderização da equação matemática em tempo real.
  - Exportação de dados da série temporal em formato CSV.

---

## Formato de Comunicação

A comunicação serial ocorre a 115200 de baudrate com linhas terminadas em `\n`.

### 1. Configuração e Controle (Navegador -> ESP32)
Para iniciar ou atualizar os parâmetros de controle, o frontend envia para a ESP32 uma linha com o seguinte JSON:

```json
{
  "mode": "speed",
  "ref_type": "internal",
  "ref_min": 0.0,
  "ref_max": 15.0,
  "order": 2,
  "coeff_e": [7.98, -6.781],
  "coeff_u": [0.999, 0.0],
  "levels": [5.0, 12.0, 6.0, 2.0],
  "interval_s": 6
}
```

- `mode`: Modo de controle (`"speed"` para rad/s ou `"position"` para graus).
- `ref_type`: Tipo de referência (`"internal"` para degraus ou `"external"` para potenciômetro).
- `ref_min` / `ref_max`: Limites de mapeamento da referência externa do potenciômetro.
- `order`: Ordem do controlador (tamanho dos vetores de coeficientes, até 10).
- `coeff_e`: Coeficientes do erro $[e[k], e[k-1], \dots]$.
- `coeff_u`: Coeficientes do sinal de controle anterior $[u[k-1], u[k-2], \dots]$.
- `levels`: Vetor com os níveis da referência cíclica (usado em modo interno).
- `interval_s`: Duração de cada nível da referência interna em segundos.

Comandos de controle adicionais:
- `{"cmd":"stop"}`: Interrompe o motor imediatamente e redefine o controlador para o estado IDLE.
- `{"cmd":"ping"}`: Handshake de verificação da conexão serial.
- `{"cmd":"reset_time"}`: Reinicia a contagem de tempo ($t = 0\text{ ms}$) da telemetria.

### 2. Telemetria (ESP32 -> Navegador)
Transmitida em padrão [Teleplot](https://teleplot.fr/) linha a linha:
- `>t:<valor>`: Tempo decorrido em milissegundos desde o início do ensaio.
- `>ref:<valor>`: Valor atual da referência.
- `>omega:<valor>` ou `>angulo:<valor>`: Medição atual do encoder (velocidade ou posição).
- `>u:<valor>`: Sinal de controle calculado (PWM de 0 a 255 em velocidade, -255 a 255 em posição).
- `>pot:<valor>`: Valor normalizado da leitura do potenciômetro (0.0000 a 1.0000).

---

## Estrutura do Repositório

```text
motor_control_serial/
|-- src/                 # Implementação das tarefas de firmware FreeRTOS, FSM e interrupções
|-- include/             # Cabeçalhos do firmware (configurações, FSM e tarefas)
|-- lib/
|   |-- Motor/           # Acionamento e modulação PWM do motor
|   `-- Encoder/         # Conversão de pulsos de quadratura
|-- site/
|   |-- css/             # Estilos da interface
|   |-- js/              # Módulos JavaScript (Web Serial, gráficos, KaTeX)
|   `-- index.html       # Interface gráfica de usuário
|-- platformio.ini       # Configuração de build para ESP32
|-- LICENSE              # Licença MIT
`-- README.md            # Documentação do projeto
```

---

## Licença

Distribuído sob a licença [MIT](https://opensource.org/license/mit). Consulte o arquivo [LICENSE](LICENSE) para mais informações.
