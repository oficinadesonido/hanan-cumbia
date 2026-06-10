/* ============================================================
 *  HANAN CUMBIA - Test DC ESTATICO de las lineas SPI
 *  ------------------------------------------------------------
 *  Pone D10, D11 y D13 en ALTO FIJO (no oscilan). Asi el
 *  multimetro en DC mide un valor estable, sin promedios de
 *  onda cuadrada. El LED onboard (D13) queda PRENDIDO FIJO.
 *
 *    D10 = CS   -> U1 pin 2   debe leer ~5 V
 *    D11 = MOSI -> U1 pin 4   debe leer ~5 V
 *    D13 = SCK  -> U1 pin 3   debe leer ~5 V  (+ LED fijo)
 *
 *  COMO MEDIR (DC, punta - a GND):
 *    Paso 1 - en el propio Nano (pad/pin del header):
 *        D13 del Nano debe leer ~5 V.
 *        - Si lee ~5 V -> el Nano saca el pin OK. Sigue al paso 2.
 *        - Si lee 0 V  -> estas midiendo el pad equivocado, o el
 *          pin del header/zocalo del Nano no hace contacto.
 *          (El LED prendido confirma que el chip SI saca PB5.)
 *    Paso 2 - en el U1:
 *        pin 3 debe leer ~5 V igual que D13.
 *        - D13=5V pero pin3=0V -> pista/soldadura ABIERTA entre
 *          el Nano y el pin 3 del DAC.
 *        - pin3=5V -> el SCK llega bien; el fallo estaba en otra
 *          linea: revisa pin 2 (CS) y pin 4 (SDI) igual, deben
 *          dar ~5 V tambien.
 * ============================================================ */

void setup() {
  pinMode(10, OUTPUT);
  pinMode(11, OUTPUT);
  pinMode(13, OUTPUT);
  digitalWrite(10, HIGH);   // CS
  digitalWrite(11, HIGH);   // SDI
  digitalWrite(13, HIGH);   // SCK + LED fijo
}

void loop() {
  // nada: las tres lineas quedan fijas en ALTO
}
