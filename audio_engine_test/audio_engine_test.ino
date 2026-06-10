/* ============================================================
 *  HANAN CUMBIA - Test del MOTOR DE AUDIO (sin secuenciador)
 *  ------------------------------------------------------------
 *  Reproduce el bombo REAL (sample de PROGMEM) usando exactamente
 *  el mismo motor que el firmware:
 *    - Timer2 en CTC, prescaler /32, OCR2A=50  -> ISR ~9804 Hz
 *    - misma config SPI manual (SPCR/SPSR)
 *    - dac.output() dentro de la ISR (MCP4901, CS pin 10, gain x1)
 *
 *  NO usa botones, NI pots, NI secuenciador: dispara el bombo
 *  solo, cada ~400 ms, en bucle.
 *
 *  Interpretacion:
 *    - Si se oye el BOMBO claro -> el motor de audio (ISR+SPI+DAC+
 *      PROGMEM) funciona perfecto en esta placa. El problema del
 *      firmware esta en la logica de triggers / pots / botones.
 *    - Si solo se oye un CLICK -> el problema esta en como la ISR
 *      llega al DAC a esa velocidad (SPI/timing), no en la logica.
 * ============================================================ */

#include <SPI.h>
#include <DAC_MCP49xx.h>
#include "kick_data.h"

DAC_MCP49xx dac(DAC_MCP49xx::MCP4901, 10);

volatile uint32_t accumulator = 0;
volatile uint16_t index = 0;
volatile uint8_t  playing = 0;
volatile uint16_t retrig = 0;     // contador para re-disparar

ISR(TIMER2_COMPA_vect) {
  OCR2A = 50;                      // igual que el firmware (DDS.ino)

  int16_t sample = 0;
  if (playing) {
    sample = (int16_t)pgm_read_byte(&kick_data[index]) - 127;
    accumulator += 157;           // mismo incremento que el bombo (B4) del firmware
    index = accumulator >> 6;
    if (index >= kick_len) { playing = 0; index = 0; accumulator = 0; }
  }
  int16_t out = sample + 127;
  if (out < 0) out = 0; if (out > 255) out = 255;
  dac.output((byte)out);

  // re-disparo cada ~3900 muestras (~0.4 s a 9804 Hz)
  if (++retrig >= 3900) { retrig = 0; playing = 1; index = 0; accumulator = 0; }
}

void setup() {
  pinMode(10, OUTPUT);
  dac.setGain(1);
  cli();
  SPI.begin();
  SPI.setBitOrder(MSBFIRST);
  // Timer2: CTC, ISR de audio
  TIMSK2 = (1 << OCIE2A);
  OCR2A  = 127;
  TCCR2A = 1 << WGM21 | 0 << WGM20;          // CTC
  TCCR2B = 0 << CS22 | 1 << CS21 | 1 << CS20; // prescaler /32
  // SPI manual, igual que hanan26Taller.ino
  SPCR = 0x50;
  SPSR = 0x01;
  DDRB |= 0x2E;
  PORTB |= (1 << 1);
  sei();
}

void loop() {
  // todo ocurre en la ISR
}
